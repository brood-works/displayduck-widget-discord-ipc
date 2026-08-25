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
const SHARED_CLIENT_IDLE_MS = 3000;
// A single voice-state poll can time out simply because Discord was briefly
// busy (large channel, OS scheduling jitter) without the IPC connection
// actually being lost -- a real disconnect is already handled separately via
// the client's own 'disconnected' event (see bindClient). Only escalate to a
// full disconnect/reconnect after several consecutive poll failures.
const MAX_VOICE_STATE_FAILURE_STREAK = 3;

type MuteIconVariantKey = 'deafened' | 'selfmuted' | 'servermuted' | 'usermuted';

// Mirrors the four mutually-exclusive status icons in discord-ipc.html,
// which pre-renders all of them (hidden except the active one) so a
// per-participant field patch only needs to toggle a class -- never create a
// new pack-asset <img>, which would need asset-path resolution this code
// does not have access to (see createParticipantElement).
const MUTE_ICON_VARIANTS: Array<{ key: MuteIconVariantKey; file: string; alt: string; invert: boolean }> = [
  { key: 'deafened', file: 'deafened.png', alt: 'Deafened', invert: true },
  { key: 'selfmuted', file: 'mic-selfmuted.png', alt: 'Self muted', invert: true },
  { key: 'servermuted', file: 'mic-servermuted.png', alt: 'Server muted', invert: false },
  { key: 'usermuted', file: 'mic-muted.png', alt: 'Muted', invert: true },
];

let discordStatusCache: { running: boolean; expiresAt: number } | null = null;
let discordStatusProbe: Promise<boolean> | null = null;

type SharedDiscordClient = {
  client: Client;
  clientId: string;
  references: number;
  closeTimer: ReturnType<typeof setTimeout> | null;
};

type DisplayDuckGlobal = typeof globalThis & {
  __displayduckDiscordClients?: Map<string, SharedDiscordClient>;
};

// Each view loads a pack widget through its own Blob module. Keep this broker
// on the WebView global so those module boundaries still share one Client and
// one IPC transport.
const sharedDiscordClients = (() => {
  const globalScope = globalThis as DisplayDuckGlobal;
  if (!globalScope.__displayduckDiscordClients) {
    globalScope.__displayduckDiscordClients = new Map<string, SharedDiscordClient>();
  }
  return globalScope.__displayduckDiscordClients;
})();

const acquireSharedDiscordClient = (clientId: string, allowLocalhostAccess: boolean): Client => {
  let shared = sharedDiscordClients.get(clientId);
  if (!shared) {
    // Discord's IPC pipe is gated behind the "Allow localhost access" widget
    // permission (Rust rejects pack_ipc_transport_* without it) -- this is
    // only read when the shared Client is first created for this clientId.
    // If a later widget instance with the same clientId but a different
    // setting attaches to an already-live client, its setting won't
    // retroactively apply; that's an accepted limitation of sharing one IPC
    // connection across instances.
    shared = {
      client: new Client({ allowLocalhostAccess }),
      clientId,
      references: 0,
      closeTimer: null,
    };
    sharedDiscordClients.set(clientId, shared);
  }

  if (shared.closeTimer) {
    clearTimeout(shared.closeTimer);
    shared.closeTimer = null;
  }
  shared.references += 1;
  return shared.client;
};

const releaseSharedDiscordClient = (client: Client): void => {
  const shared = Array.from(sharedDiscordClients.values())
    .find((candidate) => candidate.client === client);
  if (!shared) {
    return;
  }

  shared.references = Math.max(0, shared.references - 1);
  if (shared.references > 0 || shared.closeTimer) {
    return;
  }

  shared.closeTimer = setTimeout(() => {
    shared.closeTimer = null;
    if (shared.references > 0) {
      return;
    }
    sharedDiscordClients.delete(shared.clientId);
    void shared.client.destroy();
  }, SHARED_CLIENT_IDLE_MS);
};

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
  private clientListenerCleanups: Array<() => void> = [];
  private subscriptions: Subscription[] = [];
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private speakingWatchdog: ReturnType<typeof setInterval> | null = null;
  private voicePollTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectAttempts = 0;
  private runId = 0;
  private selectedChannelId = '';
  private readonly liveSpeaking = new Map<string, { speaking: boolean; lastSpokeAt: number }>();
  private voiceStateFailureStreak = 0;
  private voiceStateRefreshInFlight: Promise<void> | null = null;
  private voiceStateRefreshQueued = false;
  // Ground truth for who is currently on the call and their per-participant
  // state (mute/deaf/avatar/name/speaking). The `state` signal only carries
  // enough to decide which top-level template branch is showing
  // (disconnected-view vs participants-view) -- it does not track individual
  // participants once the grid exists. Steady-state joins/leaves/field
  // changes are applied directly to the DOM (see reconcileParticipants) so a
  // signal write -- and the full-template rebuild that follows it -- only
  // happens for that rare top-level view transition, never for routine call
  // activity.
  private readonly participantsById = new Map<string, DiscordParticipant>();
  private participantOrder: string[] = [];

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
    // A full template render just rebuilt the grid from `state().participants`
    // (or removed it entirely). Re-sync the ground-truth store to match
    // exactly what is now in the DOM so future joins/leaves/field changes can
    // be reconciled in place from an accurate baseline.
    const rendered = this.state().participants;
    this.participantsById.clear();
    this.participantOrder = rendered.map((participant) => participant.id);
    for (const participant of rendered) {
      this.participantsById.set(participant.id, participant);
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
    // `payload` is itself a signal (see bindSignals in the framework
    // runtime), so writing to it below triggers a full render regardless of
    // whether the Discord client actually changed -- e.g. any other widget
    // setting being edited (alignment, showNames, ...) lands here too. Steady
    // -state reconciliation never writes participants back into `state`, so
    // without this sync that render would use the stale pre-reconciliation
    // snapshot instead of who is actually on the call right now.
    this.syncParticipantsSignalFromGroundTruth();
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
    this.voiceStateFailureStreak = 0;
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
    this.voiceStateFailureStreak = 0;
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
      if (client.isAuthenticated()) {
        await this.handleAuthenticated(client);
        return;
      }

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
    if (this.client?.clientId === clientId) {
      await this.client.connect(clientId);
      return this.client;
    }

    await this.destroyClient();

    const client = acquireSharedDiscordClient(clientId, this.allowLocalhostAccess());
    this.client = client;
    this.selectedChannelId = '';
    this.bindClient(client);
    try {
      await client.connect(clientId);
      return client;
    } catch (error) {
      await this.destroyClient();
      throw error;
    }
  }

  private bindClient(client: Client): void {
    this.unbindClientListeners();

    const onDisconnected = (error: unknown) => {
      if (this.client !== client) {
        return;
      }

      this.selectedChannelId = '';
      this.stopSpeakingWatchdog();
      this.stopVoicePolling();
      void this.clearSubscriptions(false);
      this.disconnect(error, 'Lost connection to Discord.', true);
    };

    const refreshVoiceState = () => {
      if (this.client !== client || !this.state().authenticated) {
        return;
      }
      void this.refreshVoiceState();
    };

    const onVoiceChannelSelect = (_payload?: DiscordVoiceChannelSelectPayload) => {
      refreshVoiceState();
    };
    const onVoiceStateCreate = () => refreshVoiceState();
    const onVoiceStateUpdate = () => refreshVoiceState();
    const onVoiceStateDelete = () => refreshVoiceState();
    const onSpeakingStart = (payload?: DiscordSpeakingEventPayload) => {
      this.applySpeaking(this.extractUserId(payload), true);
    };
    const onSpeakingStop = (payload?: DiscordSpeakingEventPayload) => {
      this.applySpeaking(this.extractUserId(payload), false);
    };

    client.on('disconnected', onDisconnected);
    client.on(RPCEvents.VOICE_CHANNEL_SELECT, onVoiceChannelSelect);
    client.on(RPCEvents.VOICE_STATE_CREATE, onVoiceStateCreate);
    client.on(RPCEvents.VOICE_STATE_UPDATE, onVoiceStateUpdate);
    client.on(RPCEvents.VOICE_STATE_DELETE, onVoiceStateDelete);
    client.on(RPCEvents.SPEAKING_START, onSpeakingStart);
    client.on(RPCEvents.SPEAKING_STOP, onSpeakingStop);

    this.clientListenerCleanups = [
      () => client.off('disconnected', onDisconnected),
      () => client.off(RPCEvents.VOICE_CHANNEL_SELECT, onVoiceChannelSelect),
      () => client.off(RPCEvents.VOICE_STATE_CREATE, onVoiceStateCreate),
      () => client.off(RPCEvents.VOICE_STATE_UPDATE, onVoiceStateUpdate),
      () => client.off(RPCEvents.VOICE_STATE_DELETE, onVoiceStateDelete),
      () => client.off(RPCEvents.SPEAKING_START, onSpeakingStart),
      () => client.off(RPCEvents.SPEAKING_STOP, onSpeakingStop),
    ];
  }

  private unbindClientListeners(): void {
    for (const cleanup of this.clientListenerCleanups) {
      cleanup();
    }
    this.clientListenerCleanups = [];
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
    this.voiceStateFailureStreak = 0;
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
    // Voice-state change events (create/update/delete/select) can arrive in
    // quick bursts -- e.g. several participants' mute state changing near-
    // simultaneously -- and each independently asks for a refresh. Without
    // coalescing this fires one concurrent GET_SELECTED_VOICE_CHANNEL request
    // per event, which under load is exactly what pushes individual requests
    // past their timeout. Collapse bursts into one in-flight request plus at
    // most one trailing follow-up.
    if (this.voiceStateRefreshInFlight) {
      this.voiceStateRefreshQueued = true;
      return this.voiceStateRefreshInFlight;
    }

    this.voiceStateRefreshInFlight = this.performVoiceStateRefresh().finally(() => {
      this.voiceStateRefreshInFlight = null;
      if (this.voiceStateRefreshQueued) {
        this.voiceStateRefreshQueued = false;
        void this.refreshVoiceState();
      }
    });

    return this.voiceStateRefreshInFlight;
  }

  private async performVoiceStateRefresh(): Promise<void> {
    const client = this.client;
    if (!client) {
      return;
    }

    let channel: DiscordSelectedVoiceChannel = null;
    try {
      channel = await client.getSelectedVoiceChannel() as DiscordSelectedVoiceChannel;
    } catch (error) {
      if (this.client !== client) {
        return;
      }

      this.voiceStateFailureStreak += 1;
      if (this.voiceStateFailureStreak < MAX_VOICE_STATE_FAILURE_STREAK) {
        // Transient hiccup -- the next poll tick (or the next voice-state
        // event) will try again without disturbing the visible widget state.
        return;
      }

      this.disconnect(error, 'Failed to read the current voice channel.', true);
      return;
    }

    this.voiceStateFailureStreak = 0;

    if (this.client !== client) {
      return;
    }

    const nextChannelId = readString(channel?.id);
    if (nextChannelId !== this.selectedChannelId) {
      this.selectedChannelId = nextChannelId;
      await this.subscribeToVoiceEvents();
    }

    // Ground truth (participantsById), not the state signal, is the source
    // of "who do we currently know about" -- it stays accurate across
    // in-place reconciliations that never touch the signal.
    const now = Date.now();
    const participants = Array.isArray(channel?.voice_states)
      ? channel.voice_states
          .map((voiceState) => this.normalizeParticipant(voiceState, this.participantsById.get(readString(isRecord(voiceState?.user) ? voiceState.user.id : undefined)), now, channel))
          .filter((participant): participant is DiscordParticipant => Boolean(participant))
          .sort((left, right) => this.participantName(left).localeCompare(this.participantName(right)))
      : [];
    const visibleParticipants = participants.some((participant) => participant.isSelf) ? participants : [];

    const visibleIds = new Set(visibleParticipants.map((participant) => participant.id));
    for (const userId of this.liveSpeaking.keys()) {
      if (!visibleIds.has(userId)) {
        this.liveSpeaking.delete(userId);
      }
    }

    const wasShowingParticipants = this.participantOrder.length > 0;
    const willShowParticipants = visibleParticipants.length > 0;
    const state = this.state();
    const flagsNeedFullRender = !state.authenticated || state.authorizationRequired || state.retryAvailable;

    if (wasShowingParticipants && willShowParticipants && !flagsNeedFullRender) {
      // Steady state: the grid is already showing and keeps showing. Patch
      // only the participants whose fields actually changed, add/remove DOM
      // nodes for who joined/left, and never touch the `state` signal -- so
      // no full-template rebuild happens for routine call activity.
      this.reconcileParticipants(visibleParticipants);
      return;
    }

    // Either the grid is appearing/disappearing (empty <-> non-empty is a
    // structural template-branch swap) or the top-level connection flags
    // need to settle -- both require the normal signal-driven full render.
    this.patchState({
      authenticated: true,
      authorizationRequired: false,
      retryAvailable: false,
      hideableDisconnect: false,
      participants: visibleParticipants,
      message: willShowParticipants ? '' : 'No active voice call or channel found.',
    });
  }

  private reconcileParticipants(nextParticipants: DiscordParticipant[]): void {
    const grid = this.ctx.mount.querySelector<HTMLElement>('.participants');
    if (!grid) {
      // Lost track of the grid element somehow; fall back to a full render
      // next cycle by clearing the ground truth so wasShowingParticipants
      // is false and the safe path runs.
      this.participantsById.clear();
      this.participantOrder = [];
      this.patchState({ participants: nextParticipants, message: '' });
      return;
    }

    const nextIds = nextParticipants.map((participant) => participant.id);
    const nextById = new Map(nextParticipants.map((participant) => [participant.id, participant] as const));
    const previousIds = new Set(this.participantOrder);

    for (const id of previousIds) {
      if (nextById.has(id)) {
        continue;
      }
      this.findParticipantElement(id)?.remove();
      this.participantsById.delete(id);
    }

    for (const participant of nextParticipants) {
      const existingElement = this.findParticipantElement(participant.id);
      if (existingElement) {
        this.patchParticipantElement(existingElement, participant);
        continue;
      }

      const element = this.createParticipantElement(participant);
      this.insertParticipantElementSorted(grid, element, participant, nextParticipants);
    }

    this.participantsById.clear();
    for (const participant of nextParticipants) {
      this.participantsById.set(participant.id, participant);
    }
    this.participantOrder = nextIds;

    for (const participant of nextParticipants) {
      this.patchParticipantSpeaking(participant.id, participant.speaking);
    }
  }

  private findParticipantElement(userId: string): HTMLElement | undefined {
    return Array.from(
      this.ctx.mount.querySelectorAll<HTMLElement>('[data-participant-id]'),
    ).find((element) => element.getAttribute('data-participant-id') === userId);
  }

  private insertParticipantElementSorted(
    grid: HTMLElement,
    element: HTMLElement,
    participant: DiscordParticipant,
    orderedParticipants: DiscordParticipant[],
  ): void {
    const index = orderedParticipants.findIndex((entry) => entry.id === participant.id);
    const nextSibling = orderedParticipants
      .slice(index + 1)
      .map((entry) => this.findParticipantElement(entry.id))
      .find((candidate): candidate is HTMLElement => Boolean(candidate));

    if (nextSibling) {
      grid.insertBefore(element, nextSibling);
    } else {
      grid.appendChild(element);
    }
  }

  private createParticipantElement(participant: DiscordParticipant): HTMLElement {
    const element = document.createElement('div');
    element.setAttribute('data-participant-id', participant.id);
    // Pop-in animation, opacity and transform are all handled by the
    // .participant CSS rule itself (discord-ipc.scss) -- setting them again
    // inline here would only fight the stylesheet with higher-specificity
    // duplicates for no benefit.
    element.style.setProperty('--participant-size', String(this.participantGridSize()));

    const avatar = document.createElement('div');
    avatar.className = 'avatar';

    const avatarImage = document.createElement('img');
    avatarImage.className = 'avatar-image';
    avatarImage.loading = 'lazy';
    avatarImage.decoding = 'async';

    const avatarFallback = document.createElement('div');
    avatarFallback.className = 'avatar-fallback';

    const mute = document.createElement('div');
    mute.className = 'mute';
    for (const variant of MUTE_ICON_VARIANTS) {
      const icon = document.createElement('img');
      icon.className = `mute-icon mute-icon-${variant.key}${variant.invert ? ' invert' : ''}`;
      // Plain relative path -- the framework's own asset-rewriting
      // MutationObserver (already watching ctx.mount) resolves this to the
      // pack's real installed asset URL, the same mechanism the initial
      // template render uses for the {{ASSETS}} placeholder.
      icon.setAttribute('src', `img/${variant.file}`);
      icon.alt = variant.alt;
      mute.appendChild(icon);
    }

    avatar.append(avatarImage, avatarFallback, mute);
    element.appendChild(avatar);

    if (this.showNames()) {
      const nameWrapper = document.createElement('div');
      nameWrapper.className = 'name-wrapper';
      const name = document.createElement('div');
      name.className = 'name';
      nameWrapper.appendChild(name);
      element.appendChild(nameWrapper);
    }

    // Click handling is delegated once in onInit() via ctx.on('click',
    // '[data-participant-id]', ...), which matches this node through normal
    // event bubbling -- no per-node listener needed here.
    this.patchParticipantElement(element, participant);
    return element;
  }

  private patchParticipantElement(element: HTMLElement, participant: DiscordParticipant): void {
    element.className = `participant ${this.participantClasses(participant)}`.trim();

    const avatarUrl = this.participantAvatarUrl(participant);
    const avatarImage = element.querySelector<HTMLImageElement>('.avatar-image');
    if (avatarImage) {
      if (avatarUrl) {
        if (avatarImage.getAttribute('src') !== avatarUrl) {
          avatarImage.setAttribute('src', avatarUrl);
        }
        avatarImage.alt = participant.username;
        avatarImage.classList.remove('hidden');
      } else {
        avatarImage.removeAttribute('src');
        avatarImage.classList.add('hidden');
      }
    }

    const avatarFallback = element.querySelector<HTMLElement>('.avatar-fallback');
    if (avatarFallback) {
      avatarFallback.classList.toggle('hidden', Boolean(avatarUrl));
      if (!avatarUrl) {
        avatarFallback.textContent = this.participantInitials(participant);
      }
    }

    const activeVariant = this.activeMuteIconVariant(participant);
    for (const variant of MUTE_ICON_VARIANTS) {
      const icon = element.querySelector<HTMLElement>(`.mute-icon-${variant.key}`);
      icon?.classList.toggle('hidden', variant.key !== activeVariant);
    }

    if (this.showNames()) {
      const nameElement = element.querySelector<HTMLElement>('.name');
      const displayName = this.participantName(participant);
      if (nameElement && nameElement.textContent !== displayName) {
        nameElement.textContent = displayName;
      }
    }
  }

  private activeMuteIconVariant(participant: DiscordParticipant): MuteIconVariantKey | null {
    if (this.participantIsDeafened(participant)) {
      return 'deafened';
    }
    if (participant.mute.self) {
      return 'selfmuted';
    }
    if (participant.mute.server) {
      return 'servermuted';
    }
    if (participant.mute.user) {
      return 'usermuted';
    }
    return null;
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

    const participant = this.participantsById.get(userId);
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
    const avatar = this.findParticipantElement(userId)?.querySelector<HTMLElement>('.avatar');
    avatar?.classList.toggle('speaking', speaking);
  }

  private async toggleParticipantMute(userId: string): Promise<void> {
    const client = this.client;
    const participant = this.participantsById.get(userId);
    if (!client || !participant) {
      return;
    }

    try {
      await client.setUserVoiceSettings(userId, { mute: !participant.mute.user });
      await this.refreshVoiceState();
    } catch (error) {
      // A failed mute toggle (e.g. one slow RPC round-trip) isn't evidence the
      // connection itself is gone -- that's already handled via the client's
      // 'disconnected' event. Just leave the toggle un-applied; the user can
      // retry the click.
      console.warn('[discord-ipc] Failed to update voice settings.', error);
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
    this.voiceStateFailureStreak = 0;
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
    this.unbindClientListeners();
    await this.clearSubscriptions();

    if (!client) {
      return;
    }

    releaseSharedDiscordClient(client);
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

  private syncParticipantsSignalFromGroundTruth(): void {
    if (this.participantOrder.length === 0 && this.state().participants.length === 0) {
      return;
    }

    const ordered = this.participantOrder
      .map((id) => this.participantsById.get(id))
      .filter((participant): participant is DiscordParticipant => Boolean(participant));
    this.patchState({ participants: ordered });
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

  // Discord's IPC pipe/socket connection requires this widget instance's
  // "Allow localhost access" permission (config key allowEventAccess, part
  // of every widget's default config) -- without it Rust rejects every
  // pack_ipc_transport_* command outright.
  private allowLocalhostAccess(): boolean {
    return Boolean(this.config('allowEventAccess', false));
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

    const allowLocalhostAccess = this.allowLocalhostAccess();
    discordStatusProbe = Promise.all(
      getDiscordIpcEndpoints().map((endpoint) =>
        ipcTransportEndpointExists(endpoint, allowLocalhostAccess).catch(() => false)),
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
