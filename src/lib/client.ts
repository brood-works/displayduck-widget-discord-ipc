import { EventEmitter } from 'events';
import { IPCTransport } from './ipc';
import { RelationshipTypes, RPCCommands, RPCEvents } from './constants';
import { uuid } from './utils';
import type {
  Activity,
  Application,
  CertifiedDevice,
  Channel,
  Channels,
  ChannelsResponse,
  Guild,
  Guilds,
  RefreshTokenResponse,
  RPCLoginOptions,
  SoundboardSound,
  Subscription,
  UserVoiceSettings,
  VoiceSettings,
} from './interfaces';
import type { ClientOptions, EventHandler, PendingRequest, RpcFrame } from './types';

const subKey = (event: string, args?: unknown): string => {
  return `${event}${JSON.stringify(args)}`;
};

const getProcessId = (options: ClientOptions, args: Record<string, unknown>): number => {
  const explicitPid = typeof args.pid === 'number' ? args.pid : undefined;
  if (typeof explicitPid === 'number') {
    return explicitPid;
  }

  return typeof options.pid === 'number' ? options.pid : 0;
};

export class Client extends EventEmitter {
  public options: ClientOptions;
  public accessToken: string | null = null;
  public refreshToken: string | null = null;
  public clientId: string | null = null;
  public application: Application | null = null;
  public user: unknown | null = null;
  public transport: IPCTransport;
  public endpoint = 'https://discord.com/api';
  public _expecting = new Map<string, PendingRequest>();
  public _connectPromise: Promise<Client> | undefined;
  public _subscriptions = new Map<string, unknown>();

  public constructor(options: ClientOptions = {}) {
    super();
    this.options = options;
    this.transport = new IPCTransport(this);
    this.transport.on('message', this._onRpcMessage.bind(this));
    this.transport.on('close', (error) => {
      this._expecting.forEach((entry) => {
        entry.reject(error instanceof Error ? error : new Error('connection closed'));
      });
      this._expecting.clear();
      this._connectPromise = undefined;
      this.emit('disconnected', error instanceof Error ? error : new Error('connection closed'));
    });
  }

  public override on(eventName: string | symbol, listener: EventHandler): this {
    return super.on(eventName, listener);
  }

  public override off(eventName: string | symbol, listener: EventHandler): this {
    return super.off(eventName, listener);
  }

  public override once(eventName: string | symbol, listener: EventHandler): this {
    return super.once(eventName, listener);
  }

  public override emit(eventName: string | symbol, ...args: any[]): boolean {
    return super.emit(eventName, ...args);
  }

  public async fetch(
    method: string,
    path: string,
    { data, query }: { data?: BodyInit; query?: Record<string, string> } = {},
  ): Promise<any> {
    const search = query ? `?${new URLSearchParams(query).toString()}` : '';
    const headers: Record<string, string> = {};

    if (typeof this.accessToken === 'string' && this.accessToken.trim().length > 0) {
      headers.Authorization = `Bearer ${this.accessToken}`;
    }

    return fetch(`${this.endpoint}${path}${search}`, {
      method,
      body: data,
      headers,
    }).then(async (response) => {
      const body = await response.json();

      if (!response.ok) {
        const error = new Error(response.status.toString()) as Error & { body?: unknown };
        error.body = body;
        throw error;
      }

      return body;
    });
  }

  public connect(clientId: string): Promise<Client> | undefined {
    if (this._connectPromise && this.clientId === clientId) {
      return this._connectPromise;
    }

    if (this.clientId && this.clientId !== clientId) {
      void this.destroy().catch(() => undefined);
      this._connectPromise = undefined;
    }

    if (!this.transport.socket) {
      this._connectPromise = undefined;
    }

    this._connectPromise = new Promise((resolve, reject) => {
      this.clientId = clientId;

      const onConnected = () => {
        cleanup();
        resolve(this);
      };

      const onDisconnected = (error?: unknown) => {
        cleanup();
        reject(error instanceof Error ? error : new Error('connection closed'));
      };

      const cleanup = () => {
        clearTimeout(timeout);
        this.off('connected', onConnected);
        this.off('disconnected', onDisconnected);
      };

      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error('RPC_CONNECTION_TIMEOUT'));
      }, 10_000);

      this.on('connected', onConnected);
      this.on('disconnected', onDisconnected);

      this.transport.connect().catch((error) => {
        cleanup();
        reject(error);
      });
    }).catch((error) => {
      this._connectPromise = undefined;
      throw error;
    });

    return this._connectPromise;
  }

  public async login(options: RPCLoginOptions): Promise<this> {
    await this.connect(options.clientId);

    if (!options.scopes) {
      this.emit('ready');
      return this;
    }

    if (options.refreshToken) {
      const auth = await this.refreshOAuthToken(options);
      if (auth !== null) {
        options.accessToken = auth.access_token;
        options.refreshToken = auth.refresh_token;
        this.accessToken = auth.access_token;
        this.refreshToken = auth.refresh_token;
      } else {
        options.accessToken = undefined;
        options.refreshToken = undefined;
      }
    }

    if (!options.accessToken || !options.refreshToken) {
      const auth = await this.authorize(options);
      options.accessToken = auth.access_token;
      options.refreshToken = auth.refresh_token;
      this.accessToken = auth.access_token;
      this.refreshToken = auth.refresh_token;
    }

    return this.authenticate(options);
  }

  public request<T = unknown>(cmd: string, args?: unknown, evt?: string): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this.transport.socket) {
        reject(new Error('connection closed'));
        return;
      }

      const nonce = uuid();
      this._expecting.set(nonce, { resolve, reject });
      try {
        this.transport.send({ cmd, args, evt, nonce });
      } catch (error) {
        this._expecting.delete(nonce);
        reject(error);
      }
    });
  }

  public _onRpcMessage(message: RpcFrame): void {
    if (message.cmd === RPCCommands.DISPATCH && message.evt === RPCEvents.READY) {
      if (message.data && typeof message.data === 'object' && 'user' in message.data) {
        this.user = (message.data as { user?: unknown }).user ?? null;
      }

      this.emit('connected');
      return;
    }

    if (message.evt === 'ERROR' && !message.nonce) {
      const data = (message.data ?? {}) as { message?: string; code?: number };
      const error = new Error(data.message ?? 'RPC handshake failed') as Error & {
        code?: number;
        data?: unknown;
      };
      error.code = data.code;
      error.data = message.data;
      this.emit('disconnected', error);
      return;
    }

    if (message.nonce && this._expecting.has(message.nonce)) {
      const request = this._expecting.get(message.nonce);
      if (!request) {
        return;
      }

      if (message.evt === 'ERROR') {
        const data = (message.data ?? {}) as { message?: string; code?: number };
        const error = new Error(data.message ?? 'RPC error') as Error & { code?: number; data?: unknown };
        error.code = data.code;
        error.data = message.data;
        request.reject(error);
      } else {
        request.resolve(message.data);
      }

      this._expecting.delete(message.nonce);
      return;
    }

    this.emit(message.evt ?? 'message', message.data);
  }

  public async authorize(
    { scopes, clientSecret, rpcToken, redirectUri, prompt }: RPCLoginOptions = { clientId: '' },
  ): Promise<RefreshTokenResponse> {
    let nextRpcToken = rpcToken;

    if (clientSecret && rpcToken === true) {
      const body = await this.fetch('POST', '/oauth2/token/rpc', {
        data: new URLSearchParams({
          client_id: this.clientId || '',
          client_secret: clientSecret,
        }),
      });

      nextRpcToken = body.rpc_token;
    }

    const { code } = await this.request<{ code: string }>('AUTHORIZE', {
      scopes,
      client_id: this.clientId,
      prompt,
      rpc_token: nextRpcToken,
    });

    return this.fetch('POST', '/oauth2/token', {
      data: new URLSearchParams({
        client_id: this.clientId || '',
        client_secret: clientSecret || '',
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri || '',
      }),
    }) as Promise<RefreshTokenResponse>;
  }

  public authenticate(options: RPCLoginOptions): Promise<this> {
    return this.request<{ application: Application; user: unknown }>('AUTHENTICATE', {
      access_token: options.accessToken,
    }).then(({ application, user }) => {
      this.accessToken = options.accessToken as string;
      this.refreshToken = options.refreshToken as string;
      this.application = application;
      this.user = user;
      this.emit('ready');
      return this;
    });
  }

  public refreshOAuthToken(options: RPCLoginOptions): Promise<RefreshTokenResponse | null> {
    return fetch('https://discord.com/api/v10/oauth2/token', {
      method: 'POST',
      body: new URLSearchParams({
        client_id: options.clientId,
        client_secret: options.clientSecret || '',
        grant_type: 'refresh_token',
        refresh_token: options.refreshToken || '',
      }),
    })
      .then((response) => response.json())
      .catch(() => null) as Promise<RefreshTokenResponse | null>;
  }

  public getGuild(id: string, timeout?: number): Promise<Guild> {
    return this.request(RPCCommands.GET_GUILD, { guild_id: id, timeout });
  }

  public async getGuilds(timeout?: number): Promise<Partial<Guild>[]> {
    const { guilds } = await this.request<Guilds>(RPCCommands.GET_GUILDS, { timeout });
    return guilds;
  }

  public getChannel(id: string, timeout?: number): Promise<Channel> {
    return this.request(RPCCommands.GET_CHANNEL, { channel_id: id, timeout });
  }

  public async getChannels(id?: string, timeout?: number): Promise<ChannelsResponse[]> {
    const { channels } = await this.request<Channels>(RPCCommands.GET_CHANNELS, { guild_id: id, timeout });
    return channels;
  }

  public async getSelectedVoiceChannel(): Promise<Channel | null> {
    return this.request(RPCCommands.GET_SELECTED_VOICE_CHANNEL);
  }

  public setCertifiedDevices(devices: CertifiedDevice[]): Promise<unknown> {
    return this.request(RPCCommands.SET_CERTIFIED_DEVICES, {
      devices: devices.map((device) => ({
        type: device.type,
        id: device.uuid,
        vendor: device.vendor,
        model: device.model,
        related: device.related,
        echo_cancellation: device.echoCancellation,
        noise_suppression: device.noiseSuppression,
        automatic_gain_control: device.automaticGainControl,
        hardware_mute: device.hardwareMute,
      })),
    });
  }

  public setPushToTalk(state: boolean): Promise<null> {
    return this.request(RPCCommands.PUSH_TO_TALK, { active: state });
  }

  public setUserVoiceSettings(id: string, settings: Partial<UserVoiceSettings>): Promise<UserVoiceSettings> {
    return this.request(RPCCommands.SET_USER_VOICE_SETTINGS, {
      user_id: id,
      ...settings,
    });
  }

  public selectVoiceChannel(
    id: string | null,
    { timeout, force = false }: { timeout?: number; force?: boolean } = {},
  ): Promise<Channel> {
    return this.request(RPCCommands.SELECT_VOICE_CHANNEL, { channel_id: id, timeout, force });
  }

  public selectTextChannel(id: string, { timeout }: { timeout?: number } = {}): Promise<Channel> {
    return this.request(RPCCommands.SELECT_TEXT_CHANNEL, { channel_id: id, timeout });
  }

  public getVoiceSettings(): Promise<VoiceSettings> {
    return this.request(RPCCommands.GET_VOICE_SETTINGS);
  }

  public setVoiceSettings(args: Partial<VoiceSettings>): Promise<VoiceSettings> {
    return this.request(RPCCommands.SET_VOICE_SETTINGS, args);
  }

  public captureShortcut(
    callback: (shortcut: unknown, stop: () => Promise<unknown>) => void,
  ): Promise<() => Promise<unknown>> {
    const subscriptionId = subKey(RPCEvents.CAPTURE_SHORTCUT_CHANGE);

    const stop = () => {
      this._subscriptions.delete(subscriptionId);
      return this.request(RPCCommands.CAPTURE_SHORTCUT, { action: 'STOP' });
    };

    this._subscriptions.set(subscriptionId, ({ shortcut }: { shortcut: unknown }) => {
      callback(shortcut, stop);
    });

    return this.request(RPCCommands.CAPTURE_SHORTCUT, { action: 'START' }).then(() => stop);
  }

  public setActivity(args: Record<string, any> = {}): Promise<Activity> {
    let timestamps;
    let assets;
    let party;
    let secrets;

    if (args.startTimestamp || args.endTimestamp) {
      timestamps = {
        start: args.startTimestamp,
        end: args.endTimestamp,
      };

      if (timestamps.start instanceof Date) {
        timestamps.start = Math.round(timestamps.start.getTime());
      }

      if (timestamps.end instanceof Date) {
        timestamps.end = Math.round(timestamps.end.getTime());
      }

      if (timestamps.start > 2147483647000) {
        throw new RangeError('timestamps.start must fit into a unix timestamp');
      }

      if (timestamps.end > 2147483647000) {
        throw new RangeError('timestamps.end must fit into a unix timestamp');
      }
    }

    if (args.largeImageKey || args.largeImageText || args.smallImageKey || args.smallImageText) {
      assets = {
        large_image: args.largeImageKey,
        large_text: args.largeImageText,
        small_image: args.smallImageKey,
        small_text: args.smallImageText,
      };
    }

    if (args.partySize || args.partyId || args.partyMax) {
      party = { id: args.partyId } as { id: unknown; size?: [unknown, unknown] };
      if (args.partySize || args.partyMax) {
        party.size = [args.partySize, args.partyMax];
      }
    }

    if (args.matchSecret || args.joinSecret || args.spectateSecret) {
      secrets = {
        match: args.matchSecret,
        join: args.joinSecret,
        spectate: args.spectateSecret,
      };
    }

    return this.request(RPCCommands.SET_ACTIVITY, {
      pid: getProcessId(this.options, args),
      activity: {
        state: args.state,
        details: args.details,
        timestamps,
        assets,
        party,
        secrets,
        buttons: args.buttons,
        instance: !!args.instance,
      },
    });
  }

  public clearActivity(): Promise<null> {
    return this.request(RPCCommands.SET_ACTIVITY, { pid: getProcessId(this.options, {}) });
  }

  public sendJoinInvite(user: { id?: string } | string): Promise<unknown> {
    return this.request(RPCCommands.SEND_ACTIVITY_JOIN_INVITE, {
      user_id: typeof user === 'string' ? user : user.id,
    });
  }

  public sendJoinRequest(user: { id?: string } | string): Promise<unknown> {
    return this.request(RPCCommands.SEND_ACTIVITY_JOIN_REQUEST, {
      user_id: typeof user === 'string' ? user : user.id,
    });
  }

  public toggleVideo(): Promise<null> {
    return this.request(RPCCommands.TOGGLE_VIDEO);
  }

  public toggleScreenshare(): Promise<null> {
    return this.request(RPCCommands.TOGGLE_SCREENSHARE);
  }

  public getSoundboardSounds(): Promise<SoundboardSound[]> {
    return this.request(RPCCommands.GET_SOUNDBOARD_SOUNDS);
  }

  public playSoundboardSound(guild_id: string, sound_id: string): Promise<null> {
    return this.request(RPCCommands.PLAY_SOUNDBOARD_SOUND, { guild_id, sound_id });
  }

  public closeJoinRequest(user: { id?: string } | string): Promise<unknown> {
    return this.request(RPCCommands.CLOSE_ACTIVITY_JOIN_REQUEST, {
      user_id: typeof user === 'string' ? user : user.id,
    });
  }

  public createLobby(type: unknown, capacity: unknown, metadata: unknown): Promise<unknown> {
    return this.request(RPCCommands.CREATE_LOBBY, { type, capacity, metadata });
  }

  public updateLobby(
    lobby: { id?: string } | string,
    {
      type,
      owner,
      capacity,
      metadata,
    }: {
      type?: unknown;
      owner?: { id?: string } | string;
      capacity?: unknown;
      metadata?: unknown;
    } = {},
  ): Promise<unknown> {
    return this.request(RPCCommands.UPDATE_LOBBY, {
      id: typeof lobby === 'string' ? lobby : lobby.id,
      type,
      owner_id: typeof owner === 'string' ? owner : owner?.id,
      capacity,
      metadata,
    });
  }

  public deleteLobby(lobby: { id?: string } | string): Promise<unknown> {
    return this.request(RPCCommands.DELETE_LOBBY, { id: typeof lobby === 'string' ? lobby : lobby.id });
  }

  public connectToLobby(id: unknown, secret: unknown): Promise<unknown> {
    return this.request(RPCCommands.CONNECT_TO_LOBBY, { id, secret });
  }

  public sendToLobby(lobby: { id?: string } | string, data: unknown): Promise<unknown> {
    return this.request(RPCCommands.SEND_TO_LOBBY, { id: typeof lobby === 'string' ? lobby : lobby.id, data });
  }

  public disconnectFromLobby(lobby: { id?: string } | string): Promise<unknown> {
    return this.request(RPCCommands.DISCONNECT_FROM_LOBBY, { id: typeof lobby === 'string' ? lobby : lobby.id });
  }

  public updateLobbyMember(
    lobby: { id?: string } | string,
    user: { id?: string } | string,
    metadata: unknown,
  ): Promise<unknown> {
    return this.request(RPCCommands.UPDATE_LOBBY_MEMBER, {
      lobby_id: typeof lobby === 'string' ? lobby : lobby.id,
      user_id: typeof user === 'string' ? user : user.id,
      metadata,
    });
  }

  public getRelationships(): Promise<Array<Record<string, unknown>>> {
    const types = Object.keys(RelationshipTypes);

    return this.request<{ relationships: Array<Record<string, unknown> & { type: number }> }>(
      RPCCommands.GET_RELATIONSHIPS,
    ).then((response) => {
      return response.relationships.map((relationship) => ({
        ...relationship,
        type: types[relationship.type],
      }));
    });
  }

  public async subscribe(event: string, args?: unknown): Promise<Subscription> {
    await this.request(RPCCommands.SUBSCRIBE, args, event);

    return {
      unsubscribe: () => this.request(RPCCommands.UNSUBSCRIBE, args, event),
    };
  }

  public async destroy(): Promise<void> {
    this._expecting.clear();
    this._connectPromise = undefined;
    await this.transport.close();
  }
}
