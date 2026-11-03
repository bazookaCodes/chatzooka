// Talks to the "Chatzooka Bridge" action in Streamer.bot (streamerbot/ChatzookaBridge.cs).
// Each call runs the action with an op + requestId; the action broadcasts the result back as
// a General.Custom WebSocket event, which is matched to the waiting call by requestId.
import { streamerbot } from "./connection.svelte";

export const BRIDGE_ACTION = "Chatzooka Bridge";
/** Must match the version the ping op returns in streamerbot/ChatzookaBridge.cs. */
export const BRIDGE_VERSION = 7;
const TIMEOUT_MS = 8000;

export type BridgeStatus = "unknown" | "missing" | "ready" | "error";
export type BridgeResult = { ok: true; data?: unknown } | { ok: false; error: string };

/* eslint-disable @typescript-eslint/no-explicit-any */

class Bridge {
  status = $state<BridgeStatus>("unknown");
  detail = $state<string | null>(null);
  /** Version reported by the installed bridge code; compare with BRIDGE_VERSION. */
  version = $state<number | null>(null);

  get outdated(): boolean {
    return this.status === "ready" && (this.version ?? 1) < BRIDGE_VERSION;
  }

  /** Whether the installed bridge has a feature added in `minVersion` (v2: user info, mod/unmod; v3: rewards list; v4: slash commands; v5: AutoMod allow/deny, replies, stream info; v6: polls and predictions; v7: sending chat). */
  supports(minVersion: number): boolean {
    return this.status === "ready" && (this.version ?? 1) >= minVersion;
  }

  #pending = new Map<string, (result: BridgeResult) => void>();
  #counter = 0;

  constructor() {
    streamerbot.use((client) => {
      void client.on("General.Custom", (event: any) => this.#onCustom(event?.data));
    });
    streamerbot.onConnected(() => void this.check());
  }

  /** Look for the action in Streamer.bot and make sure it answers. */
  async check(): Promise<void> {
    const client = streamerbot.client;
    if (!client) return;
    try {
      const res: any = await client.getActions();
      const found = (res.actions ?? []).find((a: any) => a.name === BRIDGE_ACTION);
      if (!found) {
        this.status = "missing";
        this.detail = `No action named "${BRIDGE_ACTION}" in Streamer.bot.`;
        return;
      }
      if (found.enabled === false) {
        this.status = "error";
        this.detail = `The "${BRIDGE_ACTION}" action is disabled in Streamer.bot.`;
        return;
      }
      const ping = await this.call("ping");
      this.status = ping.ok ? "ready" : "error";
      this.detail = ping.ok ? null : `The bridge didn't answer: ${ping.error}`;
      this.version = ping.ok ? Number((ping.data as any)?.version ?? 1) : null;
    } catch (e) {
      this.status = "error";
      this.detail = e instanceof Error ? e.message : String(e);
    }
  }

  async call(op: string, args: Record<string, string | number | undefined> = {}): Promise<BridgeResult> {
    const client = streamerbot.client;
    if (!client || streamerbot.status !== "connected") return { ok: false, error: "Not connected to Streamer.bot" };
    const requestId = `cz-${Date.now().toString(36)}-${++this.#counter}`;

    const reply = new Promise<BridgeResult>((resolve) => {
      this.#pending.set(requestId, resolve);
      setTimeout(() => {
        if (this.#pending.delete(requestId)) {
          resolve({
            ok: false,
            error:
              this.status === "missing"
                ? `Set up the "${BRIDGE_ACTION}" action in Streamer.bot first`
                : "No reply from Streamer.bot (is the Chatzooka Bridge action set up?)",
          });
        }
      }, TIMEOUT_MS);
    });

    try {
      const clean = Object.fromEntries(Object.entries(args).filter(([, v]) => v !== undefined));
      const res: any = await client.doAction({ name: BRIDGE_ACTION }, { ...clean, op, requestId });
      if (res?.status && res.status !== "ok") {
        this.#pending.delete(requestId);
        return { ok: false, error: res.error ?? "Streamer.bot couldn't run the action" };
      }
    } catch (e) {
      this.#pending.delete(requestId);
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
    return reply;
  }

  #onCustom(raw: unknown): void {
    let data: any = raw;
    if (typeof data === "string") {
      try {
        data = JSON.parse(data);
      } catch {
        return;
      }
    }
    // Some Streamer.bot versions nest the broadcast payload one level down.
    if (data && data.source !== "chatzooka" && typeof data.data === "object") data = data.data;
    if (data?.source !== "chatzooka" || !data.requestId) return;
    const resolve = this.#pending.get(data.requestId);
    if (!resolve) return;
    this.#pending.delete(data.requestId);
    resolve(data.ok ? { ok: true, data: data.data } : { ok: false, error: String(data.error ?? "Failed") });
  }
}

export const bridge = new Bridge();
