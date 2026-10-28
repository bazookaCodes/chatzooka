// Owns the Streamer.bot client: connects, reconnects, and exposes status for the UI.
import { StreamerbotClient } from "@streamerbot/client";
import { defaultConfig, loadConfig, saveConfig, type SbConfig } from "./config";

export type SbStatus = "connecting" | "connected" | "disconnected" | "authFailed";

export interface SbAccounts {
  twitch?: { id: string; login: string; displayName: string };
  youtube?: { id: string; name: string; avatarUrl?: string };
}

type Setup = (client: StreamerbotClient) => void;

class StreamerbotConnection {
  status = $state<SbStatus>("connecting");
  error = $state<string | null>(null);
  version = $state<string | null>(null);
  accounts = $state<SbAccounts>({});
  config = $state<SbConfig>({ ...defaultConfig });

  #client: StreamerbotClient | null = null;
  #setups: Setup[] = [];
  #connectedHandlers: Setup[] = [];

  get address(): string {
    return `${this.config.host}:${this.config.port}`;
  }

  get client(): StreamerbotClient | null {
    return this.#client;
  }

  /** Register event listeners; they are re-applied whenever the client is recreated. */
  use(setup: Setup): void {
    this.#setups.push(setup);
    if (this.#client) setup(this.#client);
  }

  /** Run every time a connection is established (including reconnects). */
  onConnected(handler: Setup): void {
    this.#connectedHandlers.push(handler);
  }

  #started = false;

  async start(): Promise<void> {
    if (this.#started) return;
    this.#started = true;
    this.config = await loadConfig();
    this.#connect();
  }

  /** Close the connection for good (used when dev hot-reload replaces this module). */
  async stop(): Promise<void> {
    this.#started = false;
    await this.#teardown();
  }

  async applyConfig(config: SbConfig): Promise<void> {
    await saveConfig(config);
    this.config = { ...config };
    await this.#teardown();
    this.#connect();
  }

  /** Reconnect now instead of waiting for the next automatic retry. */
  async retryNow(): Promise<void> {
    if (this.status === "connected") return;
    await this.#teardown();
    this.#connect();
  }

  #connect(): void {
    this.status = "connecting";
    this.error = null;
    const client = new StreamerbotClient({
      ...this.#clientOptions(this.config),
      autoReconnect: true,
      retries: -1,
      onConnect: (info) => {
        if (this.#client !== client) return;
        this.status = "connected";
        this.error = null;
        this.version = info.version;
        void this.#loadAccounts(client);
        for (const handler of this.#connectedHandlers) handler(client);
      },
      onDisconnect: () => {
        if (this.#client !== client || this.status === "authFailed") return;
        this.status = "disconnected";
      },
      onError: (err) => {
        if (this.#client !== client) return;
        if (/authenticat/i.test(err.message)) {
          this.status = "authFailed";
          this.error = this.config.password
            ? "Streamer.bot rejected the password."
            : "Streamer.bot requires a password.";
        }
      },
    });
    this.#client = client;
    for (const setup of this.#setups) setup(client);
  }

  async #teardown(): Promise<void> {
    const client = this.#client;
    this.#client = null;
    await client?.disconnect().catch(() => {});
  }

  async #loadAccounts(client: StreamerbotClient): Promise<void> {
    try {
      const res = await client.getBroadcaster();
      if (res.status !== "ok") return;
      const { twitch, youtube } = res.platforms ?? {};
      const connected: string[] = res.connected ?? [];
      this.accounts = {
        twitch:
          twitch && connected.includes("twitch")
            ? { id: twitch.broadcastUserId, login: twitch.broadcastUserName, displayName: twitch.broadcastUser }
            : undefined,
        youtube:
          youtube && connected.includes("youtube")
            ? { id: youtube.broadcastUserId, name: youtube.broadcastUserName, avatarUrl: youtube.broadcastUserProfileImage }
            : undefined,
      };
    } catch (e) {
      console.warn("GetBroadcaster failed", e);
    }
  }

  #clientOptions(config: SbConfig) {
    return {
      host: config.host,
      port: config.port,
      endpoint: config.endpoint,
      password: config.password || undefined,
      logLevel: "warn" as const,
    };
  }

  /** One-off connection attempt with unsaved settings, for the "Test connection" button. */
  async test(config: SbConfig): Promise<{ ok: true; version: string } | { ok: false; error: string }> {
    let failure: string | null = null;
    const client = new StreamerbotClient({
      ...this.#clientOptions(config),
      immediate: false,
      autoReconnect: false,
      retries: 0,
      onError: (err) => (failure = err.message),
    });
    try {
      await client.connect(5_000);
      const info = await client.getInfo();
      if (failure) return { ok: false, error: failure };
      if (info.status !== "ok") return { ok: false, error: "Streamer.bot returned an error" };
      return { ok: true, version: info.info.version };
    } catch (e) {
      return { ok: false, error: failure ?? (e instanceof Error ? e.message : String(e)) };
    } finally {
      await client.disconnect().catch(() => {});
    }
  }
}

export const streamerbot = new StreamerbotConnection();

// During development, a hot reload of this file would otherwise leave the old socket open.
import.meta.hot?.dispose(() => void streamerbot.stop());
