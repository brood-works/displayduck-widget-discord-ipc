import { signal, type WritableSignal, type WidgetContext } from '@displayduck/base';
import { ipcTransportEndpointExists } from '@displayduck/ipc';
import { Client, RPCEvents, type Subscription } from './lib';
import type {
  DiscordParticipant,
  DiscordRawVoiceState,
  DiscordSelectedVoiceChannel,
  DiscordSpeakingEventPayload,
  DiscordStoredToken,
  DiscordVoiceChannelSelectPayload,
  DiscordWidgetState,
} from './lib';

const STORAGE_PREFIX = 'displayduck:discord-ipc:token:';
const DEFAULT_DISCORD_REDIRECT_URI = 'http://localhost';
const DISCORD_SCOPES = ['rpc', 'rpc.voice.read', 'rpc.voice.write'] as const;
const DISCORD_IPC_BUILDS = ['discord-ipc', 'discord-canary-ipc', 'discord-ptb-ipc'] as const;
const SPEAKING_TIMEOUT_MS = 1000;
const SPEAKING_WATCHDOG_INTERVAL_MS = 500;
const VOICE_POLL_INTERVAL_MS = 3000;
const RECONNECT_BASE_MS = 5000;
const RECONNECT_MAX_MS = 30000;
const RECONNECT_JITTER_MS = 750;
const DISCORD_STATUS_CACHE_MS = 2500;

let discordStatusCache: { running: boolean; expiresAt: number } | null = null;
let discordStatusProbe: Promise<boolean> | null = null;

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return Boolean(value) && typeof value === 'object';
};

const readString = (value: unknown): string => {
  return typeof value === 'string' ? value.trim() : '';
};

const readBoolean = (value: unknown): boolean => {
  return value === true;
};

const avatarExtension = (hash: string): 'gif' | 'png' => {
  return hash.startsWith('a_') ? 'gif' : 'png';
};

const toAvatarUrl = (path: string, hash: string): string | undefined => {
  const normalizedHash = readString(hash);
  if (!normalizedHash) {
    return undefined;
  }

  return `https://cdn.discordapp.com/${path}/${normalizedHash}.${avatarExtension(normalizedHash)}?size=128`;
};

const getDiscordIpcEndpoints = (): string[] => {
  const endpoints: string[] = [];
  const isWindows = (globalThis.navigator?.platform ?? '').toLowerCase().includes('win');
  for (const build of DISCORD_IPC_BUILDS) {
    for (let index = 0; index < 10; index += 1) {
      endpoints.push(isWindows ? `\\\\.\\pipe\\${build}-${index}` : `/tmp/${build}-${index}`);
    }
  }
  return endpoints;
};

export class DisplayDuckWidget {
  private readonly payload: WritableSignal<Record<string, unknown>>;
  private readonly state: WritableSignal<DiscordWidgetState>;

  private client: Client | null = null;
  private subscriptions: Subscription[] = [];
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private speakingWatchdog: ReturnType<typeof setInterval> | null = null;
  private voicePollTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectAttempts = 0;
  private runId = 0;
  private selectedChannelId = '';
  private readonly liveSpeaking = new Map<string, { speaking: boolean; lastSpokeAt: number }>();

  public constructor(private readonly ctx: WidgetContext) {
    this.payload = signal(ctx.payload ?? {});
    this.state = signal<DiscordWidgetState>({
      message: 'Waiting for Discord authorization.',
      authenticated: false,
      participants: [],
      isLoading: false,
      authorizationRequired: false,
      retryAvailable: false,
      hideableDisconnect: false,
      clientId: this.clientId(),
    });
  }

  public afterRender(): void {
    this.ctx.mount.style.display = '';
    for (const participant of this.state().participants) {
      this.patchParticipantSpeaking(
        participant.id,
        this.liveSpeaking.get(participant.id)?.speaking ?? participant.speaking,
      );
    }
  }

  public onInit(): void {
    this.ctx.on('click', '#login-btn', () => {
      if (this.state().isLoading) {
        return;
      }

      if (this.state().authorizationRequired) {
        void this.authorize();
        return;
      }

      void this.syncSession('Connecting to Discord...');
    });

    this.ctx.on('click', '[data-participant-id]', (_event, target) => {
      const participantId = target.getAttribute('data-participant-id')?.trim() ?? '';
      if (!participantId || this.state().isLoading) {
        return;
      }

      void this.toggleParticipantMute(participantId);
    });

    void this.initialize();
  }

  public onUpdate(payload: Record<string, unknown>): void {
    this.payload.set(payload ?? {});
    const nextClientId = this.clientId();
    if (nextClientId === this.state().clientId) {
      return;
    }

    this.invalidateRun();
    this.stopSpeakingWatchdog();
    this.stopVoicePolling();
    this.cancelReconnect();
    this.liveSpeaking.clear();
    void this.destroyClient();

    this.patchState({
      clientId: nextClientId,
      authenticated: false,
      participants: [],
      authorizationRequired: false,
      retryAvailable: false,
      hideableDisconnect: false,
      message: nextClientId
        ? 'Client changed. Reconnecting to Discord.'
        : 'Set a Discord client ID to begin authorization.',
      isLoading: false,
    });

    void this.syncSession('Connecting to Discord...');
  }

  public onDestroy(): void {
    this.invalidateRun();
    this.stopSpeakingWatchdog();
    this.stopVoicePolling();
    this.cancelReconnect();
    this.liveSpeaking.clear();
    void this.destroyClient();
  }

  private async initialize(): Promise<void> {
    await this.syncSession('Connecting to Discord...');
  }

  private async syncSession(message: string): Promise<void> {
    const clientId = this.state().clientId;
    if (!clientId) {
      this.patchState({
        message: 'Set a Discord client ID to begin authorization.',
        authenticated: false,
        participants: [],
        authorizationRequired: false,
        retryAvailable: false,
        hideableDisconnect: false,
        isLoading: false,
      });
      return;
    }

    const runId = this.beginRun();
    this.setBusy(true, message);
    this.cancelReconnect();

    try {
      const client = await this.ensureConnected(clientId);
      if (!this.isCurrentRun(runId)) return;

      const storedToken = this.readStoredToken(clientId);
      if (!storedToken?.accessToken) {
        this.requireAuthorization('Waiting for Discord authorization.');
        return;
      }

      if (await this.restoreStoredSession(client, storedToken)) {
        if (!this.isCurrentRun(runId)) return;
        await this.handleAuthenticated(client);
      }
    } catch (error) {
      if (!this.isCurrentRun(runId)) return;

      const isRunning = await this.isDiscordRunning();
      this.disconnect(
        error,
        isRunning ? 'Could not connect to Discord.' : 'Discord is not running.',
        isRunning,
      );
    } finally {
      if (this.isCurrentRun(runId)) {
        this.setBusy(false);
      }
    }
  }

  private async authorize(): Promise<void> {
    const clientId = this.state().clientId;
    const redirectUri = this.redirectUri();
    if (!clientId) {
      this.patchState({
        message: 'Set a Discord client ID to begin authorization.',
        isLoading: false,
        authorizationRequired: false,
      });
      return;
    }

    const runId = this.beginRun();
    this.setBusy(true, 'Awaiting authorization in Discord client...');
    this.cancelReconnect();

    try {
      const client = await this.ensureConnected(clientId);
      if (!this.isCurrentRun(runId)) return;

      await client.login({
        clientId,
        redirectUri,
        scopes: [...DISCORD_SCOPES],
        prompt: 'consent',
      });

      if (!this.isCurrentRun(runId)) return;

      this.persistClientTokens(clientId, client);
      await this.handleAuthenticated(client);
    } catch (error) {
      if (!this.isCurrentRun(runId)) return;

      if (this.shouldInvalidateToken(error)) {
        this.clearStoredToken(clientId);
      }

      this.requireAuthorization(this.formatError(error, 'Discord authorization failed.'));
    } finally {
      if (this.isCurrentRun(runId)) {
        this.setBusy(false);
      }
    }
  }

  private async ensureConnected(clientId: string): Promise<Client> {
    if (this.client?.clientId === clientId && this.client.transport.socket) {
      await this.client.connect(clientId);
      return this.client;
    }

    await this.destroyClient();

    const client = new Client();
    this.bindClient(client);
    this.client = client;
    this.selectedChannelId = '';
    await client.connect(clientId);
    return client;
  }

  private bindClient(client: Client): void {
    client.on('disconnected', (error) => {
      if (this.client !== client) {
        return;
      }

      this.selectedChannelId = '';
      this.stopSpeakingWatchdog();
      this.stopVoicePolling();
      void this.clearSubscriptions(false);
      this.disconnect(error, 'Lost connection to Discord.', true);
    });

    const refreshVoiceState = () => {
      if (this.client !== client || !this.state().authenticated) {
        return;
      }
      void this.refreshVoiceState();
    };

    client.on(RPCEvents.VOICE_CHANNEL_SELECT, (_payload?: DiscordVoiceChannelSelectPayload) => {
      refreshVoiceState();
    });
    client.on(RPCEvents.VOICE_STATE_CREATE, refreshVoiceState);
    client.on(RPCEvents.VOICE_STATE_UPDATE, refreshVoiceState);
    client.on(RPCEvents.VOICE_STATE_DELETE, refreshVoiceState);
    client.on(RPCEvents.SPEAKING_START, (payload?: DiscordSpeakingEventPayload) => {
      this.applySpeaking(this.extractUserId(payload), true);
    });
    client.on(RPCEvents.SPEAKING_STOP, (payload?: DiscordSpeakingEventPayload) => {
      this.applySpeaking(this.extractUserId(payload), false);
    });
  }

  private async restoreStoredSession(client: Client, token: DiscordStoredToken): Promise<boolean> {
    const clientId = this.state().clientId;
    if (!clientId) {
      return false;
    }

    try {
      await client.authenticate({
        clientId,
        accessToken: token.accessToken,
        refreshToken: token.refreshToken,
      });
      this.persistClientTokens(clientId, client);
      return true;
    } catch (error) {
      if (!this.shouldInvalidateToken(error)) {
        this.disconnect(error, 'Could not restore session.', true);
        return false;
      }
    }

    if (token.refreshToken) {
      try {
        const refreshed = await client.refreshOAuthToken({
          clientId,
          refreshToken: token.refreshToken,
        });

        if (refreshed?.access_token) {
          const nextRefreshToken = refreshed.refresh_token ?? token.refreshToken;
          await client.authenticate({
            clientId,
            accessToken: refreshed.access_token,
            refreshToken: nextRefreshToken,
          });
          this.persistToken(clientId, {
            accessToken: refreshed.access_token,
            refreshToken: nextRefreshToken,
          });
          return true;
        }
      } catch (error) {
        // fall through to re-authorization
      }
    }

    this.clearStoredToken(clientId);
    this.requireAuthorization('Saved authorization expired. Please authorize again.');
    return false;
  }

  private async handleAuthenticated(client: Client): Promise<void> {
    this.reconnectAttempts = 0;
    this.cancelReconnect();
    this.patchState({
      authenticated: true,
      authorizationRequired: false,
      retryAvailable: false,
      hideableDisconnect: false,
      message: 'Loading voice state...',
    });

    await this.refreshVoiceState();
    await this.subscribeToVoiceEvents();
    this.startSpeakingWatchdog();
    this.startVoicePolling();
  }

  private async subscribeToVoiceEvents(): Promise<void> {
    const client = this.client;
    if (!client) {
      return;
    }

    await this.clearSubscriptions();

    this.subscriptions.push(
      await client.subscribe(RPCEvents.VOICE_CHANNEL_SELECT),
    );

    if (!this.selectedChannelId) {
      return;
    }

    const args = { channel_id: this.selectedChannelId };
    for (const eventName of [
      RPCEvents.VOICE_STATE_CREATE,
      RPCEvents.VOICE_STATE_UPDATE,
      RPCEvents.VOICE_STATE_DELETE,
      RPCEvents.SPEAKING_START,
      RPCEvents.SPEAKING_STOP,
    ]) {
      this.subscriptions.push(await client.subscribe(eventName, args));
    }
  }

  private async clearSubscriptions(unsubscribe = true): Promise<void> {
    const subscriptions = this.subscriptions.splice(0, this.subscriptions.length);
    if (!unsubscribe) {
      return;
    }

    await Promise.all(
      subscriptions.map((subscription) => subscription.unsubscribe().catch(() => undefined)),
    );
  }

  private async refreshVoiceState(): Promise<void> {
    const client = this.client;
    if (!client) {
      return;
    }

    let channel: DiscordSelectedVoiceChannel = null;
    try {
      channel = await client.getSelectedVoiceChannel() as DiscordSelectedVoiceChannel;
    } catch (error) {
      if (this.client === client) {
        this.disconnect(error, 'Failed to read the current voice channel.', true);
      }
      return;
    }

    if (this.client !== client) {
      return;
    }

    const nextChannelId = readString(channel?.id);
    if (nextChannelId !== this.selectedChannelId) {
      this.selectedChannelId = nextChannelId;
      await this.subscribeToVoiceEvents();
    }

    const currentParticipants = this.state().participants;
    const previous = new Map(currentParticipants.map((participant) => [participant.id, participant]));
    const now = Date.now();
    const participants = Array.isArray(channel?.voice_states)
      ? channel.voice_states
          .map((voiceState) => this.normalizeParticipant(voiceState, previous.get(readString(isRecord(voiceState?.user) ? voiceState.user.id : undefined)), now, channel))
          .filter((participant): participant is DiscordParticipant => Boolean(participant))
          .sort((left, right) => this.participantName(left).localeCompare(this.participantName(right)))
      : [];
    const visibleParticipants = participants.some((participant) => participant.isSelf) ? participants : [];
    const nextMessage = visibleParticipants.length > 0 ? '' : 'No active voice call or channel found.';

    const visibleIds = new Set(visibleParticipants.map((participant) => participant.id));
    for (const userId of this.liveSpeaking.keys()) {
      if (!visibleIds.has(userId)) {
        this.liveSpeaking.delete(userId);
      }
    }

    for (const participant of visibleParticipants) {
      this.patchParticipantSpeaking(participant.id, participant.speaking);
    }

    const participantsChanged = !this.areParticipantsEqual(currentParticipants, visibleParticipants);
    if (
      !participantsChanged
      && this.state().message === nextMessage
      && this.state().authenticated
      && !this.state().authorizationRequired
      && !this.state().retryAvailable
    ) {
      return;
    }

    this.patchState({
      authenticated: true,
      authorizationRequired: false,
      retryAvailable: false,
      hideableDisconnect: false,
      participants: visibleParticipants,
      message: nextMessage,
    });
  }

  private normalizeParticipant(
    raw: DiscordRawVoiceState,
    existing: DiscordParticipant | undefined,
    now: number,
    channel: DiscordSelectedVoiceChannel,
  ): DiscordParticipant | null {
    const user = isRecord(raw.user)
      ? raw.user
      : (isRecord(raw.member) && isRecord(raw.member.user) ? raw.member.user : null);
    const userId = readString(user?.id);
    if (!userId) {
      return null;
    }

    const member = isRecord(raw.member) ? raw.member : null;
    const voiceState = isRecord(raw.voice_state) ? raw.voice_state : null;
    const nick = readString(raw.nick || member?.nick || (isRecord(voiceState?.member) ? voiceState.member.nick : undefined)) || undefined;
    const username = readString(user?.global_name) || readString(user?.username) || '?';
    const guildId = readString(
      voiceState?.guild_id
      || member?.guild_id
      || raw.guild_id
      || channel?.guild_id,
    );
    const memberAvatarHash = readString(
      member?.avatar
      || raw.guild_avatar
      || raw.avatar
      || (isRecord(voiceState?.member) ? voiceState.member.avatar : undefined),
    );
    const userAvatarHash = readString(user?.avatar);
    const liveSpeaking = this.liveSpeaking.get(userId);
    const speaking = typeof raw.speaking === 'boolean'
      ? raw.speaking
      : (liveSpeaking?.speaking ?? existing?.speaking ?? false);
    const lastSpokeAt = speaking
      ? (liveSpeaking?.lastSpokeAt ?? existing?.lastSpokeAt ?? now)
      : (liveSpeaking?.lastSpokeAt ?? existing?.lastSpokeAt ?? 0);
    this.liveSpeaking.set(userId, { speaking, lastSpokeAt });

    return {
      id: userId,
      username,
      nick,
      mute: {
        user: readBoolean(raw.mute),
        server: readBoolean(voiceState?.mute) || readBoolean(raw.server_mute),
        self: readBoolean(voiceState?.self_mute) || readBoolean(raw.self_mute),
      },
      deaf: {
        server: readBoolean(voiceState?.deaf) || readBoolean(raw.server_deaf),
        self: readBoolean(voiceState?.self_deaf) || readBoolean(raw.self_deaf),
      },
      speaking,
      isSelf: userId === this.currentUserId(),
      serverAvatar: guildId && memberAvatarHash
        ? toAvatarUrl(`guilds/${guildId}/users/${userId}/avatars`, memberAvatarHash)
        : undefined,
      avatar: userAvatarHash ? toAvatarUrl(`avatars/${userId}`, userAvatarHash) : undefined,
      lastSpokeAt,
    };
  }

  private applySpeaking(userId: string, speaking: boolean): void {
    if (!userId) {
      return;
    }

    const participant = this.state().participants.find((entry) => entry.id === userId);
    const existingSpeaking = this.liveSpeaking.get(userId);
    if (!participant || existingSpeaking?.speaking === speaking) {
      return;
    }

    const lastSpokeAt = speaking
      ? Date.now()
      : (existingSpeaking?.lastSpokeAt ?? participant.lastSpokeAt);
    this.liveSpeaking.set(userId, { speaking, lastSpokeAt });
    this.patchParticipantSpeaking(userId, speaking);
  }

  private patchParticipantSpeaking(userId: string, speaking: boolean): void {
    const participantElement = Array.from(
      this.ctx.mount.querySelectorAll<HTMLElement>('[data-participant-id]'),
    ).find((element) => element.getAttribute('data-participant-id') === userId);
    const avatar = participantElement?.querySelector<HTMLElement>('.avatar');
    avatar?.classList.toggle('speaking', speaking);
  }

  private async toggleParticipantMute(userId: string): Promise<void> {
    const client = this.client;
    const participant = this.state().participants.find((entry) => entry.id === userId);
    if (!client || !participant) {
      return;
    }

    try {
      await client.setUserVoiceSettings(userId, { mute: !participant.mute.user });
      await this.refreshVoiceState();
    } catch (error) {
      this.disconnect(error, 'Failed to update voice settings.', true);
    }
  }

  private startSpeakingWatchdog(): void {
    if (this.speakingWatchdog) {
      return;
    }

    this.speakingWatchdog = setInterval(() => {
      const now = Date.now();
      for (const [userId, speakingState] of this.liveSpeaking) {
        if (!speakingState.speaking || now - speakingState.lastSpokeAt <= SPEAKING_TIMEOUT_MS) {
          continue;
        }

        this.liveSpeaking.set(userId, {
          speaking: false,
          lastSpokeAt: speakingState.lastSpokeAt,
        });
        this.patchParticipantSpeaking(userId, false);
      }
    }, SPEAKING_WATCHDOG_INTERVAL_MS);
  }

  private stopSpeakingWatchdog(): void {
    if (!this.speakingWatchdog) {
      return;
    }

    clearInterval(this.speakingWatchdog);
    this.speakingWatchdog = null;
  }

  private startVoicePolling(): void {
    if (this.voicePollTimer) {
      return;
    }

    this.voicePollTimer = setInterval(() => {
      if (!this.state().authenticated || this.state().authorizationRequired) {
        return;
      }

      void this.refreshVoiceState();
    }, VOICE_POLL_INTERVAL_MS);
  }

  private stopVoicePolling(): void {
    if (!this.voicePollTimer) {
      return;
    }

    clearInterval(this.voicePollTimer);
    this.voicePollTimer = null;
  }

  private disconnect(error: unknown, fallback: string, hideable: boolean): void {
    this.reconnectAttempts += 1;
    this.stopSpeakingWatchdog();
    this.stopVoicePolling();
    this.liveSpeaking.clear();
    this.patchState({
      authenticated: false,
      participants: [],
      authorizationRequired: false,
      retryAvailable: true,
      hideableDisconnect: hideable,
      message: this.formatError(error, fallback),
    });
    this.scheduleReconnect();
  }

  private requireAuthorization(message: string): void {
    this.stopSpeakingWatchdog();
    this.stopVoicePolling();
    this.liveSpeaking.clear();
    this.patchState({
      authenticated: false,
      participants: [],
      authorizationRequired: true,
      retryAvailable: false,
      hideableDisconnect: false,
      isLoading: false,
      message,
    });
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || !this.state().clientId || this.state().authorizationRequired) {
      return;
    }

    const runId = this.runId;
    const backoff = Math.min(
      RECONNECT_BASE_MS * (2 ** Math.min(Math.max(0, this.reconnectAttempts - 1), 4)),
      RECONNECT_MAX_MS,
    );
    const delay = backoff + Math.round(Math.random() * RECONNECT_JITTER_MS);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (runId !== this.runId || this.state().authenticated || this.state().authorizationRequired) {
        return;
      }
      void this.syncSession('Reconnecting to Discord...');
    }, delay);
  }

  private cancelReconnect(): void {
    if (!this.reconnectTimer) {
      return;
    }

    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private async destroyClient(): Promise<void> {
    const client = this.client;
    this.client = null;
    this.selectedChannelId = '';
    await this.clearSubscriptions(false);

    if (!client) {
      return;
    }

    await client.destroy().catch(() => undefined);
  }

  private currentUserId(): string {
    const user = this.client?.user;
    if (!isRecord(user)) {
      return '';
    }

    return readString(user.id);
  }

  private extractUserId(payload: DiscordSpeakingEventPayload | undefined): string {
    if (!payload) {
      return '';
    }

    if (readString(payload.user_id)) {
      return readString(payload.user_id);
    }

    if (isRecord(payload.user)) {
      return readString(payload.user.id);
    }

    return '';
  }

  public shadowsEnabled(): boolean {
    return Boolean(this.config('shadow', false));
  }

  public alignmentClass(): string {
    const alignment = this.config('alignment', 'top-left');
    return typeof alignment === 'string' && alignment.length > 0 ? alignment : 'top-left';
  }

  public participantGridSize(): number {
    const configuredSize = String(this.config('participantSize', 'default')).trim().toLowerCase();
    if (configuredSize.startsWith('small')) {
      return 1;
    }
    if (configuredSize.startsWith('large')) {
      return 3;
    }
    if (configuredSize.startsWith('xl')) {
      return 4;
    }
    if (configuredSize.startsWith('xxxl')) {
      return 6;
    }
    if (configuredSize.startsWith('xxl')) {
      return 5;
    }

    return 2;
  }

  public showWidget(): boolean {
    return !this.shouldAutoHide();
  }

  public showNames(): boolean {
    return Boolean(this.config('showNames', true));
  }

  public participantClasses(participant: DiscordParticipant): string {
    const classes: string[] = [];
    if (participant.isSelf) {
      classes.push('self');
    }
    if (this.hasStatusIcon(participant)) {
      classes.push('muted');
    }
    return classes.join(' ');
  }

  public participantAvatarUrl(participant: DiscordParticipant): string {
    return participant.serverAvatar || participant.avatar || '';
  }

  public participantInitials(participant: DiscordParticipant): string {
    return this.initials(participant.username);
  }

  public participantName(participant: DiscordParticipant): string {
    return participant.nick || participant.username;
  }

  public hasStatusIcon(participant: DiscordParticipant): boolean {
    return participant.deaf.self
      || participant.deaf.server
      || participant.mute.self
      || participant.mute.server
      || participant.mute.user;
  }

  public participantIsDeafened(participant: DiscordParticipant): boolean {
    return participant.deaf.self || participant.deaf.server;
  }

  private areParticipantsEqual(current: DiscordParticipant[], next: DiscordParticipant[]): boolean {
    if (current.length !== next.length) {
      return false;
    }

    for (let index = 0; index < current.length; index += 1) {
      const left = current[index];
      const right = next[index];
      if (
        left.id !== right.id
        || left.username !== right.username
        || left.nick !== right.nick
        || left.isSelf !== right.isSelf
        || left.serverAvatar !== right.serverAvatar
        || left.avatar !== right.avatar
        || left.deaf.server !== right.deaf.server
        || left.deaf.self !== right.deaf.self
        || left.mute.user !== right.mute.user
        || left.mute.server !== right.mute.server
        || left.mute.self !== right.mute.self
      ) {
        return false;
      }
    }

    return true;
  }

  private patchState(patch: Partial<DiscordWidgetState>): void {
    this.state.update((state) => {
      for (const [key, value] of Object.entries(patch) as Array<[keyof DiscordWidgetState, DiscordWidgetState[keyof DiscordWidgetState]]>) {
        if (state[key] !== value) {
          return { ...state, ...patch };
        }
      }

      return state;
    });
  }

  private setBusy(isLoading: boolean, message?: string): void {
    this.state.update((state) => {
      const nextMessage = message ?? state.message;
      if (state.isLoading === isLoading && state.message === nextMessage) {
        return state;
      }

      return {
        ...state,
        isLoading,
        message: nextMessage,
      };
    });
  }

  private beginRun(): number {
    this.runId += 1;
    return this.runId;
  }

  private invalidateRun(): void {
    this.runId += 1;
    this.setBusy(false);
  }

  private isCurrentRun(runId: number): boolean {
    return this.runId === runId;
  }

  private config<T>(key: string, fallback: T): T {
    const config = this.payload().config;
    if (!isRecord(config)) {
      return fallback;
    }

    return (config[key] as T | undefined) ?? fallback;
  }

  private clientId(): string {
    return String(this.config('clientId', '')).trim();
  }

  private redirectUri(): string {
    return String(this.config('redirectUri', DEFAULT_DISCORD_REDIRECT_URI)).trim() || DEFAULT_DISCORD_REDIRECT_URI;
  }

  private hasClientId(): boolean {
    return this.state().clientId.length > 0;
  }

  private shouldAutoHide(): boolean {
    if (!Boolean(this.config('autoHide', false)) || !this.hasClientId()) {
      return false;
    }

    const state = this.state();
    if (state.authorizationRequired || (state.retryAvailable && !state.hideableDisconnect)) {
      return false;
    }

    return this.state().participants.length === 0;
  }

  private readStoredToken(clientId: string): DiscordStoredToken | null {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${clientId}`);
    if (!raw) {
      return null;
    }

    try {
      const parsed = JSON.parse(raw) as Partial<DiscordStoredToken>;
      const accessToken = readString(parsed.accessToken);
      const refreshToken = readString(parsed.refreshToken) || undefined;
      return accessToken ? { accessToken, refreshToken } : null;
    } catch {
      return null;
    }
  }

  private persistClientTokens(clientId: string, client: Client): void {
    const accessToken = readString(client.accessToken);
    if (!accessToken) {
      return;
    }

    const storedRefreshToken = this.readStoredToken(clientId)?.refreshToken;

    this.persistToken(clientId, {
      accessToken,
      refreshToken: readString(client.refreshToken) || storedRefreshToken,
    });
  }

  private persistToken(clientId: string, token: DiscordStoredToken): void {
    localStorage.setItem(`${STORAGE_PREFIX}${clientId}`, JSON.stringify(token));
  }

  private clearStoredToken(clientId: string): void {
    localStorage.removeItem(`${STORAGE_PREFIX}${clientId}`);
  }

  private shouldInvalidateToken(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false;
    }
    const message = error.message.toLowerCase();
    return (
      message.includes('invalid access token') ||
      message.includes('invalid oauth2 access token') ||
      message.includes('authentication failed') ||
      message.includes('invalid_grant') ||
      message.includes('401')
    );
  }

  private async isDiscordRunning(): Promise<boolean> {
    if (discordStatusCache && discordStatusCache.expiresAt > Date.now()) {
      return discordStatusCache.running;
    }

    if (discordStatusProbe) {
      return discordStatusProbe;
    }

    discordStatusProbe = Promise.all(
      getDiscordIpcEndpoints().map((endpoint) => ipcTransportEndpointExists(endpoint).catch(() => false)),
    ).then((checks) => {
      const running = checks.some(Boolean);
      discordStatusCache = {
        running,
        expiresAt: Date.now() + DISCORD_STATUS_CACHE_MS,
      };
      return running;
    }).finally(() => {
      discordStatusProbe = null;
    });

    return discordStatusProbe;
  }

  private formatError(error: unknown, fallback: string): string {
    if (error instanceof Error) {
      if (error.message.includes('RPC_CONNECTION_TIMEOUT')) {
        return 'Connection to Discord timed out.';
      }
      if (error.message.includes('endpoint is not available')) {
        return 'Discord is not running, or IPC access is unavailable.';
      }
      if (error.message.toLowerCase().includes('invalid client')) {
        return 'Discord rejected the Client ID. Check that it is a valid Discord application Client ID.';
      }
      if (error.message.toLowerCase().includes('rpc request timed out')) {
        return `${error.message} Discord may be busy, disconnected, or refusing this application.`;
      }
      if (error.message.includes('Could not connect')) {
        return 'Could not connect to the Discord client.';
      }
      return error.message;
    }
    return fallback;
  }

  private initials(value: string): string {
    const tokens = value
      .split(/\s+/)
      .map((token) => token.trim())
      .filter(Boolean);

    if (tokens.length === 0) {
      return '?';
    }

    return tokens
      .slice(0, 2)
      .map((token) => token[0]?.toUpperCase() ?? '')
      .join('') || '?';
  }
}
