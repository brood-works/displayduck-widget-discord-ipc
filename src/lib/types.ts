export type EventHandler = (...args: any[]) => void;

export type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
};

export type RpcFrame = {
  cmd?: string;
  evt?: string;
  nonce?: string;
  data?: any;
};

export type ClientOptions = {
  ipcEndpoints?: string[];
  pid?: number;
};

export type DiscordMuteState = {
  user: boolean;
  server: boolean;
  self: boolean;
};

export type DiscordDeafState = {
  server: boolean;
  self: boolean;
};

export type DiscordStoredToken = {
  accessToken: string;
  refreshToken?: string;
};

export type DiscordParticipant = {
  id: string;
  username: string;
  nick?: string;
  mute: DiscordMuteState;
  deaf: DiscordDeafState;
  speaking: boolean;
  isSelf: boolean;
  serverAvatar?: string;
  avatar?: string;
  lastSpokeAt: number;
};

export type ParticipantElementRefs = {
  root: HTMLDivElement;
  avatar: HTMLDivElement;
  avatarImage: HTMLImageElement;
  avatarFallback: HTMLDivElement;
  muteContainer: HTMLDivElement;
  deafIcon: HTMLImageElement;
  selfMuteIcon: HTMLImageElement;
  serverMuteIcon: HTMLImageElement;
  userMuteIcon: HTMLImageElement;
  nameWrapper: HTMLDivElement;
  name: HTMLDivElement;
};

export type DiscordWidgetState = {
  message: string;
  authenticated: boolean;
  participants: DiscordParticipant[];
  isLoading: boolean;
  authorizationRequired: boolean;
  retryAvailable: boolean;
  hideableDisconnect: boolean;
  clientId: string;
};

export type DiscordRpcUser = {
  id?: unknown;
  username?: unknown;
  global_name?: unknown;
  avatar?: unknown;
};

export type DiscordRpcMember = {
  nick?: unknown;
  avatar?: unknown;
  guild_id?: unknown;
  user?: DiscordRpcUser;
};

export type DiscordRpcVoiceState = {
  guild_id?: unknown;
  mute?: unknown;
  deaf?: unknown;
  self_mute?: unknown;
  self_deaf?: unknown;
  member?: DiscordRpcMember;
};

export type DiscordRawVoiceState = {
  user?: DiscordRpcUser;
  member?: DiscordRpcMember;
  voice_state?: DiscordRpcVoiceState;
  nick?: unknown;
  mute?: unknown;
  server_mute?: unknown;
  self_mute?: unknown;
  server_deaf?: unknown;
  self_deaf?: unknown;
  guild_id?: unknown;
  guild_avatar?: unknown;
  avatar?: unknown;
  speaking?: boolean;
};

export type DiscordSelectedVoiceChannel = {
  id?: unknown;
  guild_id?: unknown;
  voice_states?: DiscordRawVoiceState[];
} | null;

export type DiscordSpeakingEventPayload = {
  user_id?: unknown;
  user?: DiscordRpcUser;
};

export type DiscordVoiceChannelSelectPayload = {
  channel_id?: unknown;
  guild_id?: unknown;
};

export type DiscordWidgetDomRefs = {
  container: HTMLElement | null;
  host: HTMLElement | null;
  disconnectedView: HTMLElement | null;
  participantsView: HTMLElement | null;
  participantsList: HTMLElement | null;
  message: HTMLElement | null;
  icon: HTMLElement | null;
  loginButton: HTMLButtonElement | null;
  participantTemplate: HTMLTemplateElement | null;
  loaderIcon: HTMLImageElement | null;
  discordIcon: HTMLImageElement | null;
};
