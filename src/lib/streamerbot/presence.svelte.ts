// Private join/leave notices for Twitch chat.
//
// Main source: Twitch's own JOIN/PART notices, via Chatzooka's read-only anonymous connection to
// your Twitch chat (twitch/irc.svelte.ts). These are real joins and leaves, batched by Twitch.
//
// Backup, when that connection is down: Streamer.bot's viewer lists (its Twitch.PresentViewers
// event, or a once-a-minute GetActiveViewers request), compared list to list. Those lists track
// recent activity more than connections, so the backup misses quiet rejoins.
import { chat } from "../chat/store.svelte";
import type { ChatAuthor } from "../chat/types";
import { prefs } from "../prefs.svelte";
import { twitchIrc } from "../twitch/irc.svelte";
import { streamerbot } from "./connection.svelte";
import { fallbackColor } from "./normalize";

/** Twitch's joins/leaves come in bursts; collect a burst before showing it. */
const IRC_BATCH_MS = 1500;
/**
 * Right after connecting, Twitch's starting list of who's in chat is often empty, and people who
 * were already there arrive as "joins" over the next minute or so. Joins in this window are
 * recorded silently instead of shown.
 */
const IRC_SETTLE_MS = 120_000;

const POLL_MS = 60_000;
/** Polling pauses while PresentViewers events arrived within this long. */
const EVENT_FRESH_MS = 12 * 60_000;

/* eslint-disable @typescript-eslint/no-explicit-any */

/** More changes than this in one update are summarized in a single row (e.g. a raid). */
const MAX_INDIVIDUAL = 8;

interface Viewer {
  id: string;
  login: string;
  name: string;
  broadcaster: boolean;
}

/** Everyone in chat at the last update, by user ID. Null until the first list (the baseline). */
let present: Map<string, Viewer> | null = null;
let counter = 0;

/** What the last viewer list looked like, for the status line in Settings. */
export const presenceStatus = $state<{
  lastAt: number | null;
  count: number | null;
  readable: boolean;
  keys: string;
  source: "irc" | "event" | "poll" | null;
}>({
  lastAt: null,
  count: null,
  readable: true,
  keys: "",
  source: null,
});

let lastEventAt = 0;

/** Pull the viewer list out of the event; the payload isn't documented, so several shapes are accepted. */
function parseViewers(d: any): Viewer[] | null {
  const list = d?.users ?? d?.viewers ?? d?.chatters ?? (Array.isArray(d) ? d : null);
  if (!Array.isArray(list)) return null;
  const out: Viewer[] = [];
  for (const u of list) {
    // GetActiveViewers mixes platforms; keep Twitch only.
    if (u?.type && String(u.type).toLowerCase() !== "twitch") continue;
    const id = u?.id ?? u?.userId ?? u?.user_id;
    const login = u?.login ?? u?.userName ?? u?.user_login ?? u?.username;
    const name = u?.display ?? u?.displayName ?? u?.name ?? u?.user_name ?? login;
    if (!id && !login) continue;
    const role = String(u?.role ?? "").toLowerCase();
    out.push({ id: String(id ?? login), login: String(login ?? name), name: String(name), broadcaster: role === "broadcaster" || u?.role === 4 });
  }
  return out;
}

function author(v: Viewer): ChatAuthor {
  return {
    id: v.id,
    login: v.login,
    displayName: v.name,
    color: fallbackColor(v.name),
    badges: [],
    roles: { broadcaster: v.broadcaster, mod: false, vip: false, sub: false, member: false },
  };
}

function notice(headline: string, who: ChatAuthor): void {
  chat.add({
    id: `presence-${Date.now()}-${++counter}`,
    platform: "twitch",
    timestamp: Date.now(),
    author: who,
    fragments: [],
    kind: "presence",
    event: { headline },
  });
}

function summary(verb: "joined" | "left", viewers: Viewer[]): void {
  if (viewers.length <= MAX_INDIVIDUAL) {
    for (const v of viewers) notice(`${verb} chat`, author(v));
    return;
  }
  const names = viewers.slice(0, 5).map((v) => v.name).join(", ");
  const group: ChatAuthor = {
    id: "",
    displayName: `${viewers.length} people`,
    color: "#9a9a9a",
    badges: [],
    roles: { broadcaster: false, mod: false, vip: false, sub: false, member: false },
  };
  notice(`${verb} chat (${names}, and ${viewers.length - 5} more)`, group);
}

// --- Main source: Twitch JOIN/PART ------------------------------------------------------------

/** Logins in chat according to Twitch's notices (for the status count). */
const ircPresent = new Set<string>();
/** Notices in the order Twitch sent them, shown together after a short pause. */
let ircBatch: { kind: "joined" | "left"; viewer: Viewer }[] = [];
let ircTimer: ReturnType<typeof setTimeout> | null = null;

/** A Viewer from a login, reusing their name and ID from chat if they've talked. */
function viewerFromLogin(login: string): Viewer {
  for (let i = chat.messages.length - 1; i >= 0; i--) {
    const a = chat.messages[i].author;
    if (chat.messages[i].platform === "twitch" && a.login?.toLowerCase() === login && a.id) {
      return { id: a.id, login, name: a.displayName, broadcaster: a.roles.broadcaster };
    }
  }
  return { id: "", login, name: login, broadcaster: false };
}

function isBroadcaster(login: string): boolean {
  return login === streamerbot.accounts.twitch?.login?.toLowerCase();
}

function ircStatus(): void {
  presenceStatus.lastAt = Date.now();
  presenceStatus.source = "irc";
  presenceStatus.readable = true;
  presenceStatus.keys = "";
  presenceStatus.count = ircPresent.size;
}

/** When the connection last joined your channel (start of the settle window). */
let ircConnectedAt = 0;

function queueIrc(kind: "joined" | "left", login: string): void {
  if (isBroadcaster(login)) return;
  if (kind === "joined") ircPresent.add(login);
  else ircPresent.delete(login);
  ircStatus();
  if (!prefs.value.joinLeaveNotices) return;
  if (kind === "joined" && Date.now() - ircConnectedAt < IRC_SETTLE_MS) return;
  ircBatch.push({ kind, viewer: viewerFromLogin(login) });
  ircTimer ??= setTimeout(() => {
    ircTimer = null;
    const batch = ircBatch;
    ircBatch = [];
    const joined = batch.filter((b) => b.kind === "joined").map((b) => b.viewer);
    const left = batch.filter((b) => b.kind === "left").map((b) => b.viewer);
    // Small bursts: one row each, in order (so "left" then "joined" for a quick rejoin).
    if (joined.length <= MAX_INDIVIDUAL && left.length <= MAX_INDIVIDUAL) {
      for (const b of batch) notice(`${b.kind} chat`, author(b.viewer));
    } else {
      summary("left", left);
      summary("joined", joined);
    }
  }, IRC_BATCH_MS);
}

/** Who was already in chat when the connection joined: the baseline, so no notices. */
export function ircNames(logins: string[]): void {
  ircConnectedAt = Date.now();
  ircPresent.clear();
  for (const l of logins) if (!isBroadcaster(l)) ircPresent.add(l);
  ircStatus();
}

/** Logins Twitch reports as connected to your chat right now (for the Users list). */
export function connectedLogins(): string[] {
  return [...ircPresent];
}

export const ircJoin = (login: string) => queueIrc("joined", login);
export const ircPart = (login: string) => queueIrc("left", login);

const ircActive = () => twitchIrc.status === "connected";

// --- Backup source: Streamer.bot viewer lists ---------------------------------------------------

/** Twitch.PresentViewers event from Streamer.bot. */
export function onPresentViewers(d: any): void {
  if (ircActive()) return;
  if (presenceStatus.source === "poll") present = null; // switching source: fresh baseline
  lastEventAt = Date.now();
  apply(d, "event");
}

/** Ask Streamer.bot who's in chat, when PresentViewers events aren't arriving. */
async function poll(): Promise<void> {
  const client = streamerbot.client;
  if (!prefs.value.joinLeaveNotices || !client || streamerbot.status !== "connected") return;
  if (ircActive() || Date.now() - lastEventAt < EVENT_FRESH_MS) return;
  try {
    const res: any = await client.getActiveViewers();
    if (res?.status !== "ok") return;
    if (presenceStatus.source !== "poll") present = null; // switching source: fresh baseline
    apply(res, "poll");
  } catch (e) {
    console.warn("GetActiveViewers failed", e);
  }
}

let pollTimer: ReturnType<typeof setInterval> | null = null;

/** Start the once-a-minute check (safe to call more than once). */
export function startPresencePolling(): void {
  pollTimer ??= setInterval(() => void poll(), POLL_MS);
  void poll();
}

function apply(d: any, source: "event" | "poll"): void {
  const viewers = parseViewers(d);
  presenceStatus.lastAt = Date.now();
  presenceStatus.source = source;
  presenceStatus.readable = !!viewers;
  presenceStatus.count = viewers?.length ?? null;
  // If the format isn't recognized, show its top-level field names so it can be fixed.
  presenceStatus.keys = viewers ? "" : Object.keys(d ?? {}).join(", ");
  if (!viewers) return;
  const next = new Map(viewers.filter((v) => !v.broadcaster).map((v) => [v.id, v]));

  // First list after connecting (or after turning the setting on) is just the baseline.
  if (present && prefs.value.joinLeaveNotices) {
    const joined = [...next.values()].filter((v) => !present!.has(v.id));
    const left = [...present.values()].filter((v) => !next.has(v.id));
    summary("joined", joined);
    summary("left", left);
  }
  present = prefs.value.joinLeaveNotices ? next : null;
}

/** Forget the list (e.g. after reconnecting), so the next update is a fresh baseline. */
export function resetPresence(): void {
  present = null;
}
