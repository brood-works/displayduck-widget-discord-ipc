import { EventEmitter } from 'events';
import {
  IpcTransport as ProxyIpcTransport,
  ipcTransportEndpointExists,
} from '@displayduck/ipc';
import type { Client } from './client';
import { uuid } from './utils';
import type { RpcFrame } from './types';

const OPCodes = {
  HANDSHAKE: 0,
  FRAME: 1,
  CLOSE: 2,
  PING: 3,
  PONG: 4,
} as const;
const CONNECT_ATTEMPTS = 3;
const CONNECT_RETRY_DELAY_MS = 250;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const getPlatform = (): 'win32' | 'unix' => {
  const platform = (globalThis.navigator?.platform ?? '').toLowerCase();
  if (platform.includes('win')) {
    return 'win32';
  }
  return 'unix';
};

const getIPCPath = (id: number): string => {
  if (getPlatform() === 'win32') {
    return `\\\\.\\pipe\\discord-ipc-${id}`;
  }

  return `/tmp/discord-ipc-${id}`;
};

const getCandidateEndpoints = (client: Client): string[] => {
  const custom = Array.isArray(client.options?.ipcEndpoints)
    ? client.options.ipcEndpoints.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    : [];

  if (custom.length > 0) {
    return custom;
  }

  const platform = getPlatform();
  const candidates: string[] = [];

  for (const build of ['discord-ipc', 'discord-canary-ipc', 'discord-ptb-ipc']) {
    for (let i = 0; i < 10; i++) {
      if (platform === 'win32') {
        candidates.push(`\\\\.\\pipe\\${build}-${i}`);
      } else {
        candidates.push(`/tmp/${build}-${i}`);
      }
    }
  }

  return candidates;
};

const hasCustomEndpoints = (client: Client): boolean => {
  return Array.isArray(client.options?.ipcEndpoints)
    && client.options.ipcEndpoints.some((value) => typeof value === 'string' && value.trim().length > 0);
};

const getReachableEndpoints = async (client: Client): Promise<string[]> => {
  const candidates = getCandidateEndpoints(client);
  const checks = await Promise.all(
    candidates.map(async (endpoint) => ({
      endpoint,
      exists: await ipcTransportEndpointExists(endpoint).catch(() => false),
    })),
  );

  return checks
    .filter((entry) => entry.exists)
    .map((entry) => entry.endpoint);
};

const concatBytes = (left: Uint8Array, right: Uint8Array): Uint8Array => {
  const merged = new Uint8Array(left.length + right.length);
  merged.set(left, 0);
  merged.set(right, left.length);
  return merged;
};

const sleep = (ms: number): Promise<void> => new Promise((resolve) => {
  setTimeout(resolve, ms);
});

const toTransportError = (payload: unknown): Error => {
  if (payload instanceof Error) {
    return payload;
  }

  if (payload && typeof payload === 'object') {
    const record = payload as { message?: unknown; code?: unknown };
    const message = String(record.message ?? '').trim();
    const code = typeof record.code === 'number' || typeof record.code === 'string'
      ? String(record.code).trim()
      : '';

    if (message || code) {
      const error = new Error(
        [message, code ? `(code ${code})` : ''].filter(Boolean).join(' ')
      ) as Error & { code?: string };
      if (code) {
        error.code = code;
      }
      return error;
    }
  }

  return new Error(String(payload ?? 'connection closed'));
};

export const encode = (op: number, data: unknown): Uint8Array => {
  const payload = encoder.encode(JSON.stringify(data));
  const packet = new Uint8Array(8 + payload.length);
  const view = new DataView(packet.buffer);
  view.setInt32(0, op, true);
  view.setInt32(4, payload.length, true);
  packet.set(payload, 8);
  return packet;
};

export class IPCTransport extends EventEmitter {
  public client: Client;
  public socket: ProxyIpcTransport | null = null;
  private buffer = new Uint8Array(0);
  private connectPromise: Promise<void> | null = null;

  public constructor(client: Client) {
    super();
    this.client = client;
  }

  public async connect(): Promise<void> {
    if (this.socket) {
      return;
    }

    if (this.connectPromise) {
      return this.connectPromise;
    }

    this.connectPromise = this.connectInternal().finally(() => {
      this.connectPromise = null;
    });
    return this.connectPromise;
  }

  public send(data: unknown, op = OPCodes.FRAME): void {
    if (!this.socket) {
      throw new Error('IPC transport is not connected');
    }

    const socket = this.socket;
    void socket.write(encode(op, data)).catch((error) => {
      if (this.socket === socket) {
        this.socket = null;
      }
      this.emit('close', error instanceof Error ? error : new Error(String(error)));
    });
  }

  public async close(): Promise<void> {
    this.connectPromise = null;
    if (!this.socket) {
      this.buffer = new Uint8Array(0);
      return;
    }

    const socket = this.socket;
    this.socket = null;
    this.buffer = new Uint8Array(0);
    await socket.write(encode(OPCodes.CLOSE, {})).catch(() => undefined);
    await socket.close();
  }

  public ping(): void {
    this.send(uuid(), OPCodes.PING);
  }

  private decode(chunk: Uint8Array): void {
    this.buffer = concatBytes(this.buffer, chunk);

    while (this.buffer.length >= 8) {
      const view = new DataView(this.buffer.buffer, this.buffer.byteOffset, this.buffer.byteLength);
      const op = view.getInt32(0, true);
      const length = view.getInt32(4, true);
      const totalLength = 8 + length;

      if (this.buffer.length < totalLength) {
        return;
      }

      const payload = this.buffer.slice(8, totalLength);
      this.buffer = this.buffer.slice(totalLength);

      let data: RpcFrame | string | null = null;
      try {
        data = JSON.parse(decoder.decode(payload)) as RpcFrame;
      } catch {
        continue;
      }

      if (op === OPCodes.PING) {
        this.send(data, OPCodes.PONG);
        continue;
      }

      if (op === OPCodes.FRAME) {
        if (!data || typeof data !== 'object') {
          continue;
        }

        this.emit('message', data);
        continue;
      }

      if (op === OPCodes.CLOSE) {
        this.emit('close', toTransportError(data));
      }
    }
  }

  private async connectInternal(): Promise<void> {
    this.buffer = new Uint8Array(0);
    const candidateEndpoints = getCandidateEndpoints(this.client);
    const reachableEndpoints = await getReachableEndpoints(this.client);
    const endpoints = reachableEndpoints.length > 0
      ? reachableEndpoints
      : (hasCustomEndpoints(this.client) ? candidateEndpoints : []);
    let lastError: unknown = null;

    if (endpoints.length === 0) {
      throw new Error('Discord IPC endpoint is not available.');
    }

    for (let attempt = 0; attempt < CONNECT_ATTEMPTS; attempt += 1) {
      for (const endpoint of endpoints) {
        const transport = new ProxyIpcTransport({ endpoint });
        const unbindOpen = transport.on('open', () => {
          this.emit('open');
        });
        const unbindData = transport.on('data', (chunk) => {
          this.decode(chunk);
        });
        const unbindClose = transport.on('close', (payload) => {
          if (this.socket === transport) {
            this.socket = null;
          }
          this.buffer = new Uint8Array(0);
          this.emit('close', payload.error ? new Error(payload.error) : toTransportError(payload));
        });

        try {
          await transport.connectWithInitialWrite(
            encode(OPCodes.HANDSHAKE, {
              v: 1,
              client_id: this.client.clientId,
            }),
          );
          this.socket = transport;
          return;
        } catch (error) {
          unbindOpen();
          unbindData();
          unbindClose();
          await transport.close().catch(() => undefined);
          lastError = error;
        }
      }

      if (attempt < CONNECT_ATTEMPTS - 1) {
        await sleep(CONNECT_RETRY_DELAY_MS * (attempt + 1));
      }
    }

    if (reachableEndpoints.length > 0) {
      throw lastError instanceof Error
        ? lastError
        : new Error('Discord IPC endpoint is available, but the connection did not complete.');
    }

    throw lastError instanceof Error ? lastError : new Error('Could not connect');
  }
}
