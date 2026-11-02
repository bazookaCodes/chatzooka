// Live status, uptime, viewer count, title and category for each platform (the stream info bar).
// The current state comes from the Chatzooka Bridge (`streamInfo`, v5) when Streamer.bot connects
// and every few minutes; Streamer.bot's events keep it up to date in between. Editing the title
// and Twitch category also goes through the bridge.
import type { Platform } from "../chat/types";
import { recordRaw } from "../dev/rawEvents";
import { bridge } from "../streamerbot/bridge.svelte";
import { streamerbot } from "../streamerbot/connection.svelte";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Raw = any;

export interface PlatformStream {
  /** null until known. */
  live: boolean | null;
  startedAt?: number;
  /** People watching the stream (not people in chat). */
  viewers?: number;
  title?: string;
  category?: string;
  /** YouTube: the broadcast Streamer.bot is monitoring. */
  broadcastId?: string;
}

export interface Category {
  id: string;
  name: string;
  boxArt?: string;
}

const REFRESH_MS = 3 * 60_000;

function pick(obj: Raw, ...paths: string[]): any {
  for (const path of paths) {
    let v = obj;
    for (const key of path.split(".")) v = v?.[key];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
}

function time(v: unknown): number | undefined {
  if (typeof v !== "string" && typeof v !== "number") return undefined;
  const t = new Date(v).getTime();
  return Number.isNaN(t) || t <= 0 ? undefined : t;
}

function num(v: unknown): number | undefined {
  const n = Number(v);
  return v === undefined || v === null || v === "" || Number.isNaN(n) ? undefined : n;
}

class StreamInfo {
  twitch = $state<PlatformStream>({ live: null });
  youtube = $state<PlatformStream>({ live: null });
  /** Ticks every 15 s so uptimes count up. */
  now = $state(Date.now());
  #started = false;

  start(): void {
    if (this.#started) return;
    this.#started = true;
    setInterval(() => (this.now = Date.now()), 15_000);
    setInterval(() => void this.refresh(), REFRESH_MS);
    streamerbot.onConnected(() => setTimeout(() => void this.refresh(), 1500));
    streamerbot.use((client) => {
      const on = (name: string, handle: (d: Raw) => void) =>
        void client.on(name as any, (event: any) => {
          recordRaw(name, event);
          try {
            handle(event?.data ?? {});
          } catch (e) {
            console.warn(`Couldn't apply ${name}`, e);
          }
        });
      on("Twitch.StreamOnline", (d) => {
        this.twitch.live = true;
        this.twitch.startedAt = time(pick(d, "startedAt", "started_at", "startTime")) ?? Date.now();
      });
      on("Twitch.StreamOffline", () => {
        this.twitch.live = false;
        this.twitch.viewers = undefined;
      });
      on("Twitch.ViewerCountUpdate", (d) => {
        const n = num(pick(d, "viewerCount", "viewers", "count", "viewer_count"));
        if (n !== undefined) this.twitch.viewers = n;
      });
      on("Twitch.StreamUpdate", (d) => {
        const title = pick(d, "status", "title", "streamTitle");
        const category = pick(d, "gameName", "game.name", "category", "game");
        if (typeof title === "string") this.twitch.title = title;
        if (typeof category === "string") this.twitch.category = category;
      });
      on("YouTube.BroadcastStarted", (d) => this.#applyYouTube(d, true));
      on("YouTube.BroadcastUpdated", (d) => this.#applyYouTube(d));
      on("YouTube.BroadcastEnded", () => {
        this.youtube.live = false;
        this.youtube.viewers = undefined;
      });
      on("YouTube.StatisticsUpdated", (d) => {
        const n = num(pick(d, "concurrentViewers", "statistics.concurrentViewers", "viewers"));
        if (n !== undefined) this.youtube.viewers = n;
      });
    });
  }

  /** Read Streamer.bot's YouTube broadcast object (its fields aren't documented, so try a few). */
  #applyYouTube(b: Raw, started = false): void {
    if (!b || typeof b !== "object") return;
    const id = pick(b, "broadcastId", "id", "Id", "broadcast.id");
    const title = pick(b, "title", "Title", "snippet.title", "Snippet.Title", "broadcast.title");
    const status = String(pick(b, "status", "Status", "lifeCycleStatus", "LifeCycleStatus", "status.lifeCycleStatus") ?? "").toLowerCase();
    const start = time(pick(b, "actualStartTime", "ActualStartTime", "snippet.actualStartTime", "Snippet.ActualStartTime", "startTime"));
    const end = time(pick(b, "actualEndTime", "ActualEndTime", "snippet.actualEndTime", "Snippet.ActualEndTime"));
    const viewers = num(pick(b, "concurrentViewers", "ConcurrentViewers", "statistics.concurrentViewers", "Statistics.ConcurrentViewers"));
    if (id) this.youtube.broadcastId = String(id);
    if (typeof title === "string") this.youtube.title = title;
    if (start) this.youtube.startedAt = start;
    if (viewers !== undefined) this.youtube.viewers = viewers;
    if (started || status === "live" || (start && !end)) this.youtube.live = true;
    else if (end || status === "complete") this.youtube.live = false;
    if (this.youtube.live && !this.youtube.startedAt) this.youtube.startedAt = Date.now();
  }

  async refresh(): Promise<void> {
    if (streamerbot.status !== "connected" || !bridge.supports(5)) return;
    const res = await bridge.call("streamInfo", { broadcasterId: streamerbot.accounts.twitch?.id });
    if (!res.ok) return;
    const d = res.data as Raw;
    const t = d?.twitch;
    if (t && !t.error && streamerbot.accounts.twitch) {
      this.twitch = {
        live: !!t.live,
        startedAt: t.live ? time(t.startedAt) : undefined,
        viewers: t.live ? num(t.viewers) : undefined,
        title: t.title ?? this.twitch.title,
        category: t.category ?? this.twitch.category,
      };
    }
    if (d?.youtube && streamerbot.accounts.youtube) this.#applyYouTube(d.youtube);
  }

  async setTitle(platform: Platform, title: string): Promise<string | null> {
    const res =
      platform === "twitch"
        ? await bridge.call("twitch.setTitle", { title })
        : await bridge.call("youtube.setTitle", { title, broadcastId: this.youtube.broadcastId });
    if (!res.ok) return res.error;
    this[platform].title = title;
    return null;
  }

  async setCategory(name: string): Promise<string | null> {
    const res = await bridge.call("twitch.setCategory", { name });
    if (!res.ok) return res.error;
    this.twitch.category = String((res.data as Raw)?.name ?? name);
    return null;
  }

  async searchCategories(query: string): Promise<Category[]> {
    const res = await bridge.call("twitch.searchCategories", { query });
    if (!res.ok || !Array.isArray(res.data)) return [];
    return (res.data as Raw[]).map((c) => ({ id: String(c.id), name: String(c.name), boxArt: c.boxArt ? String(c.boxArt).replace("{width}x{height}", "52x72") : undefined }));
  }
}

export const streamInfo = new StreamInfo();

/** "1:05" or "12m" from a start time. */
export function uptimeLabel(startedAt: number, now: number): string {
  const mins = Math.max(0, Math.floor((now - startedAt) / 60_000));
  return mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, "0")}`;
}
