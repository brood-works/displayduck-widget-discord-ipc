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
  DiscordWidgetDomRefs,
  DiscordWidgetState,
  ParticipantElementRefs,
} from './lib';

const STORAGE_PREFIX = 'displayduck:discord-ipc:token:';
const DISCORD_REDIRECT_URI = 'http://localhost';
const DISCORD_SCOPES = ['rpc', 'rpc.voice.read', 'rpc.voice.write'] as const;
const DISCORD_IPC_BUILDS = ['discord-ipc', 'discord-canary-ipc', 'discord-ptb-ipc'] as const;
const SPEAKING_TIMEOUT_MS = 1000;
const SPEAKING_WATCHDOG_INTERVAL_MS = 500;
const VOICE_POLL_INTERVAL_MS = 3000;
const RECONNECT_BASE_MS = 5000;
const RECONNECT_MAX_MS = 30000;

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
      endpoints.push(isWindows ? `\\\\.\\pipe\\${build}-${index}` : `${build}-${index}`);
    }
  }
  return endpoints;
};

export class DisplayDuckWidget {
  private payload: Record<string, unknown>;
  private readonly state: WritableSignal<DiscordWidgetState>;
  private participants: DiscordParticipant[] = [];
  private readonly participantElements = new Map<string, ParticipantElementRefs>();
  private readonly renderedParticipants = new Map<string, DiscordParticipant>();
  private readonly dom: DiscordWidgetDomRefs = {
    container: null,
    host: null,
    disconnectedView: null,
    participantsView: null,
    participantsList: null,
    message: null,
    icon: null,
    loginButton: null,
    participantTemplate: null,
    loaderIcon: null,
    discordIcon: null,
  };

  private client: Client | null = null;
  private subscriptions: Subscription[] = [];
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private speakingWatchdog: ReturnType<typeof setInterval> | null = null;
  private voicePollTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectAttempts = 0;
  private runId = 0;
  private selectedChannelId = '';

  public constructor(private readonly ctx: WidgetContext) {
    this.payload = ctx.payload ?? {};
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
    this.cacheDom();
    this.reconcileParticipants();
    this.render();
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
    this.payload = payload ?? {};
    const nextClientId = this.clientId();
    if (nextClientId === this.state().clientId) {
      return;
    }

    this.invalidateRun();
    this.stopSpeakingWatchdog();
    this.stopVoicePolling();
    this.cancelReconnect();
    this.participants = [];
    this.clearParticipantElements();
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
    this.participants = [];
    this.clearParticipantElements();
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
      if (!this.isCurrentRun(runId)) {
        return;
      }

      const storedToken = this.readStoredToken(clientId);
      if (!storedToken?.accessToken) {
        this.requireAuthorization('Authorize this Discord application.');
        return;
      }

      const restored = await this.restoreStoredSession(client, storedToken);
      if (!restored || !this.isCurrentRun(runId)) {
        return;
      }

      await this.handleAuthenticated(client);
    } catch (error) {
      if (!this.isCurrentRun(runId)) {
        return;
      }

      const discordRunning = await this.isDiscordRunning();
      this.disconnect(
        discordRunning ? error : 'Discord is not running.',
        discordRunning ? 'Could not connect to Discord.' : 'Discord is not running.',
        discordRunning,
      );
    } finally {
      if (this.isCurrentRun(runId)) {
        this.setBusy(false);
      }
    }
  }

  private async authorize(): Promise<void> {
    const clientId = this.state().clientId;
    if (!clientId) {
      return;
    }

    const runId = this.beginRun();
    this.setBusy(true, 'Authorizing with Discord...');
    this.cancelReconnect();

    try {
      const client = await this.ensureConnected(clientId);
      if (!this.isCurrentRun(runId)) {
        return;
      }

      await client.login({
        clientId,
        redirectUri: DISCORD_REDIRECT_URI,
        scopes: [...DISCORD_SCOPES],
      });
      if (!this.isCurrentRun(runId)) {
        return;
      }

      this.persistClientTokens(clientId, client);
      await this.handleAuthenticated(client);
    } catch (error) {
      if (!this.isCurrentRun(runId)) {
        return;
      }

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
    if (this.client && this.client.clientId === clientId && this.client.transport.socket) {
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
      void this.clearSubscriptions();
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
      if (token.refreshToken) {
        const refreshed = await client.refreshOAuthToken({
          clientId,
          refreshToken: token.refreshToken,
        });

        if (refreshed?.access_token && refreshed.refresh_token) {
          await client.authenticate({
            clientId,
            accessToken: refreshed.access_token,
            refreshToken: refreshed.refresh_token,
          });
          this.persistToken(clientId, {
            accessToken: refreshed.access_token,
            refreshToken: refreshed.refresh_token,
          });
          return true;
        }
      }

      if (this.shouldInvalidateToken(error)) {
        this.clearStoredToken(clientId);
        this.requireAuthorization('Saved authorization expired. Please authorize again.');
        return false;
      }

      this.disconnect(error, 'Discord authentication failed.', false);
      return false;
    }
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

  private async clearSubscriptions(): Promise<void> {
    const subscriptions = this.subscriptions.splice(0, this.subscriptions.length);
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

    const currentParticipants = this.participants;
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

    const participantsChanged = !this.areParticipantsEqual(currentParticipants, visibleParticipants);
    if (participantsChanged) {
      this.participants = visibleParticipants;
      this.reconcileParticipants();
    }

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
      participants: [],
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
    const speaking = typeof raw.speaking === 'boolean' ? raw.speaking : (existing?.speaking ?? false);

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
      lastSpokeAt: speaking ? now : (existing?.lastSpokeAt ?? 0),
    };
  }

  private applySpeaking(userId: string, speaking: boolean): void {
    if (!userId) {
      return;
    }

    const participants = this.participants;
    const index = participants.findIndex((participant) => participant.id === userId);
    if (index < 0 || participants[index].speaking === speaking) {
      return;
    }

    const nextParticipants = [...participants];
    nextParticipants[index] = {
      ...participants[index],
      speaking,
      lastSpokeAt: speaking ? Date.now() : participants[index].lastSpokeAt,
    };

    this.participants = nextParticipants;
    this.updateParticipantElement(nextParticipants[index]);
  }

  private async toggleParticipantMute(userId: string): Promise<void> {
    const client = this.client;
    const participant = this.participants.find((entry) => entry.id === userId);
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

  private render(): void {
    const {
      container,
      host,
      disconnectedView,
      participantsView,
      message,
      loginButton,
      icon,
      loaderIcon,
      discordIcon,
    } = this.dom;
    if (!container || !host || !disconnectedView || !participantsView || !message || !loginButton) {
      return;
    }

    const state = this.state();
    const hasParticipants = this.participants.length > 0;
    const hidden = this.shouldAutoHide();

    container.hidden = hidden;
    container.style.display = hidden ? 'none' : '';
    this.ctx.mount.style.display = hidden ? 'none' : '';
    host.className = `discord-ipc align-${this.config('alignment', 'top-left')}`;

    disconnectedView.hidden = hasParticipants;
    disconnectedView.style.display = hasParticipants ? 'none' : '';
    participantsView.hidden = !hasParticipants;
    participantsView.style.display = hasParticipants ? '' : 'none';

    message.textContent = this.hasClientId()
      ? state.message
      : 'No Discord Client ID provided. Please set a valid Client ID in the widget settings to use the Discord IPC widget.';

    loginButton.hidden = !(
      this.hasClientId()
      && !state.isLoading
      && (state.authorizationRequired || state.retryAvailable)
    );
    loginButton.textContent = state.authorizationRequired ? 'Authorize Discord' : 'Try Again';

    icon?.classList.toggle('loader-active', state.isLoading);
    if (loaderIcon) {
      loaderIcon.hidden = !state.isLoading;
    }
    if (discordIcon) {
      discordIcon.hidden = state.isLoading;
    }
  }

  private cacheDom(): void {
    this.dom.container = this.ctx.mount.querySelector('[data-role="discord-root"]');
    this.dom.host = this.ctx.mount.querySelector('[data-role="discord-host"]');
    this.dom.disconnectedView = this.ctx.mount.querySelector('[data-role="disconnected-view"]');
    this.dom.participantsView = this.ctx.mount.querySelector('[data-role="participants-view"]');
    this.dom.participantsList = this.ctx.mount.querySelector('[data-role="participants-list"]');
    this.dom.message = this.ctx.mount.querySelector('[data-role="message"]');
    this.dom.icon = this.ctx.mount.querySelector('[data-role="icon"]');
    this.dom.loginButton = this.ctx.mount.querySelector('#login-btn');
    this.dom.participantTemplate = this.ctx.mount.querySelector('#participant-template');
    this.dom.loaderIcon = this.ctx.mount.querySelector('[data-role="loader-icon"]');
    this.dom.discordIcon = this.ctx.mount.querySelector('[data-role="discord-icon"]');
  }

  private reconcileParticipants(): void {
    const list = this.dom.participantsList;
    if (!list) {
      return;
    }

    const nextIds = new Set(this.participants.map((participant) => participant.id));
    for (const [id, refs] of this.participantElements) {
      if (nextIds.has(id)) {
        continue;
      }

      refs.root.remove();
      this.participantElements.delete(id);
      this.renderedParticipants.delete(id);
    }

    this.participants.forEach((participant, index) => {
      const refs = this.participantElements.get(participant.id) ?? this.createParticipantElement(participant.id);
      const previous = this.renderedParticipants.get(participant.id);
      if (!previous || !this.areParticipantsEqual([previous], [participant])) {
        this.updateParticipantElement(participant);
      }

      const nodeAtIndex = list.children.item(index);
      if (nodeAtIndex !== refs.root) {
        list.insertBefore(refs.root, nodeAtIndex ?? null);
      }
    });
  }

  private createParticipantElement(participantId: string): ParticipantElementRefs {
    if (!this.dom.participantTemplate) {
      throw new Error('Participant template not found.');
    }

    const fragment = this.dom.participantTemplate.content.cloneNode(true) as DocumentFragment;
    const root = fragment.firstElementChild as HTMLDivElement;
    const refs: ParticipantElementRefs = {
      root,
      avatar: root.querySelector('.avatar') as HTMLDivElement,
      avatarImage: root.querySelector('.avatar > img') as HTMLImageElement,
      avatarFallback: root.querySelector('.avatar-fallback') as HTMLDivElement,
      muteContainer: root.querySelector('.mute') as HTMLDivElement,
      deafIcon: root.querySelector('[data-role="deaf-icon"]') as HTMLImageElement,
      selfMuteIcon: root.querySelector('[data-role="self-mute-icon"]') as HTMLImageElement,
      serverMuteIcon: root.querySelector('[data-role="server-mute-icon"]') as HTMLImageElement,
      userMuteIcon: root.querySelector('[data-role="user-mute-icon"]') as HTMLImageElement,
      nameWrapper: root.querySelector('.name-wrapper') as HTMLDivElement,
      name: root.querySelector('.name') as HTMLDivElement,
    };

    refs.root.setAttribute('data-participant-id', participantId);
    this.participantElements.set(participantId, refs);
    return refs;
  }

  private updateParticipantElement(participant: DiscordParticipant): void {
    const refs = this.participantElements.get(participant.id);
    if (!refs) {
      return;
    }

    refs.root.className = this.participantClasses(participant);
    refs.avatar.className = this.avatarClasses(participant);
    refs.root.setAttribute('data-participant-id', participant.id);

    const avatarUrl = this.participantAvatarUrl(participant);
    if (avatarUrl) {
      refs.avatarImage.hidden = false;
      if (refs.avatarImage.getAttribute('src') !== avatarUrl) {
        refs.avatarImage.setAttribute('src', avatarUrl);
      }
      refs.avatarImage.alt = participant.username;
      refs.avatarFallback.hidden = true;
      refs.avatarFallback.textContent = '';
    } else {
      refs.avatarImage.hidden = true;
      refs.avatarImage.removeAttribute('src');
      refs.avatarFallback.hidden = false;
      refs.avatarFallback.textContent = this.participantInitials(participant);
    }

    const deafened = participant.deaf.self || participant.deaf.server;
    refs.deafIcon.hidden = !deafened;
    refs.selfMuteIcon.hidden = deafened || !participant.mute.self;
    refs.serverMuteIcon.hidden = deafened || participant.mute.self || !participant.mute.server;
    refs.userMuteIcon.hidden = deafened || participant.mute.self || participant.mute.server || !participant.mute.user;
    refs.muteContainer.hidden = !this.hasStatusIcon(participant);

    refs.nameWrapper.hidden = !this.showNames();
    refs.name.textContent = this.participantName(participant);
    this.renderedParticipants.set(participant.id, participant);
  }

  private clearParticipantElements(): void {
    for (const refs of this.participantElements.values()) {
      refs.root.remove();
    }
    this.participantElements.clear();
    this.renderedParticipants.clear();
  }

  private startSpeakingWatchdog(): void {
    if (this.speakingWatchdog) {
      return;
    }

    this.speakingWatchdog = setInterval(() => {
      const participants = this.participants;
      const now = Date.now();
      let changed = false;
      const nextParticipants = participants.map((participant) => {
        if (!participant.speaking || now - participant.lastSpokeAt <= SPEAKING_TIMEOUT_MS) {
          return participant;
        }

        changed = true;
        return { ...participant, speaking: false };
      });

      if (changed) {
        this.participants = nextParticipants;
        this.reconcileParticipants();
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
    this.participants = [];
    this.clearParticipantElements();
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
    this.participants = [];
    this.clearParticipantElements();
    this.patchState({
      authenticated: false,
      participants: [],
      authorizationRequired: true,
      retryAvailable: false,
      hideableDisconnect: false,
      message,
    });
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || !this.state().clientId || this.state().authorizationRequired) {
      return;
    }

    const runId = this.runId;
    const delay = Math.min(RECONNECT_BASE_MS * Math.max(1, this.reconnectAttempts), RECONNECT_MAX_MS);
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
    await this.clearSubscriptions();

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

  private showNames(): boolean {
    return Boolean(this.config('showNames', true));
  }

  private participantClasses(participant: DiscordParticipant): string {
    const classes = ['participant'];
    if (participant.isSelf) {
      classes.push('self');
    }
    if (this.hasStatusIcon(participant)) {
      classes.push('muted');
    }
    return classes.join(' ');
  }

  private avatarClasses(participant: DiscordParticipant): string {
    return participant.speaking ? 'avatar speaking' : 'avatar';
  }

  private participantAvatarUrl(participant: DiscordParticipant): string {
    return participant.serverAvatar || participant.avatar || '';
  }

  private participantInitials(participant: DiscordParticipant): string {
    return this.initials(participant.username);
  }

  private participantName(participant: DiscordParticipant): string {
    return participant.nick || participant.username;
  }

  private hasStatusIcon(participant: DiscordParticipant): boolean {
    return participant.deaf.self
      || participant.deaf.server
      || participant.mute.self
      || participant.mute.server
      || participant.mute.user;
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
        || left.speaking !== right.speaking
        || left.isSelf !== right.isSelf
        || left.serverAvatar !== right.serverAvatar
        || left.avatar !== right.avatar
        || left.lastSpokeAt !== right.lastSpokeAt
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
    const config = (this.payload as { config?: Record<string, unknown> }).config ?? {};
    return (config[key] as T | undefined) ?? fallback;
  }

  private clientId(): string {
    return String(this.config('clientId', '')).trim();
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

    return this.participants.length === 0;
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

    this.persistToken(clientId, {
      accessToken,
      refreshToken: readString(client.refreshToken) || undefined,
    });
  }

  private persistToken(clientId: string, token: DiscordStoredToken): void {
    localStorage.setItem(`${STORAGE_PREFIX}${clientId}`, JSON.stringify(token));
  }

  private clearStoredToken(clientId: string): void {
    localStorage.removeItem(`${STORAGE_PREFIX}${clientId}`);
  }

  private shouldInvalidateToken(error: unknown): boolean {
    const message = this.formatError(error, '').toLowerCase();
    return (
      message.includes('invalid oauth2 access token')
      || message.includes('authenticate: invalid')
      || (message.includes('authenticate') && message.includes('401'))
      || message.includes('unauthorized')
      || message.includes('invalid_grant')
    );
  }

  private async isDiscordRunning(): Promise<boolean> {
    const checks = await Promise.all(
      getDiscordIpcEndpoints().map((endpoint) => ipcTransportEndpointExists(endpoint).catch(() => false)),
    );
    return checks.some(Boolean);
  }

  private formatError(error: unknown, fallback: string): string {
    const rawMessage = !error
      ? fallback
      : error instanceof Error
        ? (error.message || fallback)
        : (isRecord(error) && typeof error.message === 'string'
            ? (error.message || fallback)
            : String(error || fallback));

    const normalized = rawMessage.toLowerCase();
    if (normalized.includes('ipc endpoint is not available')) {
      return 'Discord not running\n(No IPC)';
    }

    return rawMessage;
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
