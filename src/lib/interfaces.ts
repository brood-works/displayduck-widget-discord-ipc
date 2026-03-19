export interface Activity {
  state: string;
  details: string;
  assets?: {
    large_image?: string;
    large_text?: string;
    small_image?: string;
    small_text?: string;
  };
  buttons?: string[];
  name: string;
  application_id: string;
  type: number;
  metadata?: {
    button_urls?: string[];
  };
}

export interface Application {
  id: string;
  name: string;
  icon: string;
  description: string;
  summary?: string;
  type?: unknown;
  hook?: boolean;
  terms_of_service_url?: string;
  privacy_policy_url?: string;
  verify_key?: string;
  tags?: string[];
}

export interface CertifiedDevice {
  type: 'AUDIO_INPUT' | 'AUDIO_OUTPUT' | 'VIDEO_INPUT';
  uuid: string;
  vendor: {
    name: string;
    url: string;
  };
  model: {
    name: string;
    url: string;
  };
  related: string[];
  echoCancellation: boolean;
  noiseSuppression: boolean;
  automaticGainControl: boolean;
  hardwareMute: boolean;
}

export interface Channel {
  id: string;
  guild_id: string;
  name: string;
  type: number;
  topic?: string;
  bitrate?: number;
  user_limit?: number;
  position: number;
  voice_states?: unknown[];
  messages?: unknown[];
}

export interface ChannelsResponse {
  id: string;
  name: string;
  type: number;
}

export interface Channels {
  channels: ChannelsResponse[];
}

export interface Guild {
  id: string;
  name: string;
  icon_url: string;
  members: [];
  vanity_url_code?: unknown;
}

export interface Guilds {
  guilds: Partial<Guild>[];
}

export interface UserVoiceSettings {
  id: string;
  pan?: {
    left: number;
    right: number;
  };
  volume?: number;
  mute?: boolean;
}

export interface RefreshTokenResponse {
  token_type: string;
  access_token: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
}

export interface RPCLoginOptions {
  clientId: string;
  clientSecret?: string;
  redirectUri?: string;
  accessToken?: string;
  refreshToken?: string;
  rpcToken?: string | boolean;
  tokenEndpoint?: string;
  scopes?: string[];
  prompt?: string;
}

export interface SoundboardSound {
  name: string;
  volume: number;
  available: boolean;
  sound_id: string;
  guild_id: string;
  emoji_id: string | null;
  emoji_name: string | null;
}

export interface Subscription {
  unsubscribe: () => Promise<unknown>;
}

export interface VoiceSettings {
  input: {
    available_devices: CertifiedDevice[];
    device_id: string;
    volume: number;
  };
  output: {
    available_devices: CertifiedDevice[];
    device_id: string;
    volume: number;
  };
  mode: {
    type: string;
    auto_threshold: boolean;
    threshold: number;
    shortcut: unknown;
    delay: number;
  };
  automatic_gain_control: boolean;
  echo_cancellation: boolean;
  noise_suppression: boolean;
  qos: boolean;
  silence_warning: boolean;
  deaf: boolean;
  mute: boolean;
}
