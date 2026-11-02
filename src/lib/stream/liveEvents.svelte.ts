// Polls (Twitch and YouTube), predictions and hype trains while they run, for the banner under
// the tabs, plus start/end rows on the Events tab. Payload shapes follow Streamer.bot's documented
// variable names (poll.Title, poll.choice#.totalVotes, prediction.outcome#.points, …) and Twitch's
// EventSub names, read defensively; raw events are saved in dev builds to confirm them.
import { chat } from "../chat/store.svelte";
import type { ChatAuthor, Platform } from "../chat/types";
import { recordRaw } from "../dev/rawEvents";
import { bridge } from "../streamerbot/bridge.svelte";
import { streamerbot } from "../streamerbot/connection.svelte";
import { toasts } from "../toasts.svelte";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Raw = any;

export interface PollChoice {
  id?: string;
  title: string;
  votes: number;
}

export interface Poll {
  platform: Platform;
  id: string;
  title: string;
  choices: PollChoice[];
  endsAt?: number;
  ended: boolean;
}

export interface Outcome {
  id: string;
  title: string;
  color?: string;
  points: number;
  users: number;
}

export interface Prediction {
  id: string;
  title: string;
  outcomes: Outcome[];
  locksAt?: number;
  status: "active" | "locked" | "resolved" | "canceled";
  winningId?: string;
}

export interface HypeTrain {
  level: number;
  /** 0–1 toward the next level, when known. */
  progress?: number;
  expiresAt?: number;
  ended: boolean;
}

/** Finished polls / predictions / hype trains stay on the banner this long, showing the result. */
const SHOW_RESULT_MS = 60_000;

function pick(obj: Raw, ...paths: string[]): any {
  for (const path of paths) {
    let v = obj;
    for (const key of path.split(".")) v = v?.[key];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
}

function num(v: unknown): number | undefined {
  const n = Number(v);
  return v === undefined || v === null || v === "" || Number.isNaN(n) ? undefined : n;
}

function time(v: unknown): number | undefined {
  if (typeof v !== "string" && typeof v !== "number") return undefined;
  const t = new Date(v).getTime();
  return Number.isNaN(t) || t <= 0 ? undefined : t;
}

/** Arrays may come as a list or as Streamer.bot-style numbered keys (choice0, choice1, …). */
function list(r: Raw, arrays: string[], numbered: string): Raw[] {
  const arr = pick(r, ...arrays);
  if (Array.isArray(arr)) return arr;
  const out: Raw[] = [];
  for (let i = 0; r?.[`${numbered}${i}`]; i++) out.push(r[`${numbered}${i}`]);
  return out;
}

function deadline(r: Raw, at: string[], start: string[], seconds: string[], remaining: string[]): number | undefined {
  const direct = time(pick(r, ...at));
  if (direct) return direct;
  const left = num(pick(r, ...remaining));
  if (left !== undefined) return Date.now() + left * 1000;
  const from = time(pick(r, ...start));
  const secs = num(pick(r, ...seconds));
  return from && secs ? from + secs * 1000 : undefined;
}

function readPoll(platform: Platform, d: Raw, prev: Poll | null): Poll | null {
  const r = d.poll ?? d;
  const id = String(pick(r, "id", "Id", "pollId", "poll_id") ?? prev?.id ?? "");
  if (!id) return null;
  const choices = list(r, ["choices", "Choices", "options", "Options"], "choice").map((c) => ({
    id: pick(c, "id", "Id") ? String(pick(c, "id", "Id")) : undefined,
    title: String(pick(c, "title", "Title", "text", "option", "optionText") ?? ""),
    votes: num(pick(c, "totalVotes", "TotalVotes", "votes", "Votes", "tally", "voteCount")) ?? 0,
  }));
  return {
    platform,
    id,
    title: String(pick(r, "title", "Title", "question", "Question") ?? prev?.title ?? "Poll"),
    choices: choices.length ? choices : (prev?.choices ?? []),
    endsAt:
      deadline(r, ["endsAt", "ends_at", "EndsAt"], ["startedAt", "StartedAt", "started_at"], ["duration", "Duration"], ["durationRemaining", "DurationRemaining"]) ??
      prev?.endsAt,
    ended: false,
  };
}

function readPrediction(d: Raw, prev: Prediction | null): Prediction | null {
  const r = d.prediction ?? d;
  const id = String(pick(r, "id", "Id", "predictionId", "prediction_id") ?? prev?.id ?? "");
  if (!id) return null;
  const outcomes = list(r, ["outcomes", "Outcomes"], "outcome").map((o, i) => ({
    id: String(pick(o, "id", "Id") ?? i),
    title: String(pick(o, "title", "Title") ?? `Outcome ${i + 1}`),
    color: pick(o, "color", "Color") ? String(pick(o, "color", "Color")).toLowerCase() : undefined,
    points: num(pick(o, "points", "Points", "channelPoints", "channel_points")) ?? 0,
    users: num(pick(o, "users", "Users")) ?? 0,
  }));
  const winning = pick(r, "winningOutcomeId", "winning_outcome_id", "WinningOutcomeId", "winningOutcome.id", "winner.id");
  return {
    id,
    title: String(pick(r, "title", "Title") ?? prev?.title ?? "Prediction"),
    outcomes: outcomes.length ? outcomes : (prev?.outcomes ?? []),
    locksAt:
      deadline(r, ["locksAt", "locks_at", "LocksAt"], ["createdAt", "CreatedAt", "created_at", "startedAt"], ["predictionWindow", "PredictionWindow", "prediction_window"], []) ??
      prev?.locksAt,
    status: prev?.status ?? "active",
    winningId: winning !== undefined ? String(winning) : prev?.winningId,
  };
}

function readHype(d: Raw, prev: HypeTrain | null): HypeTrain {
  const r = d.hypeTrain ?? d.hype_train ?? d;
  const progress = num(pick(r, "progress", "Progress", "levelProgress"));
  const goal = num(pick(r, "goal", "Goal", "levelGoal"));
  const percent = num(pick(r, "percent", "Percent", "percentage", "percentComplete"));
  return {
    level: num(pick(r, "level", "Level")) ?? prev?.level ?? 1,
    progress: percent !== undefined ? percent / (percent > 1 ? 100 : 1) : progress !== undefined && goal ? progress / goal : prev?.progress,
    expiresAt: deadline(r, ["expiresAt", "expires_at", "ExpiresAt"], [], [], ["duration", "Duration", "timeRemaining", "secondsRemaining"]) ?? prev?.expiresAt,
    ended: false,
  };
}

const plural = (n: number, word: string) => `${n.toLocaleString()} ${word}${n === 1 ? "" : "s"}`;

let rowCounter = 0;
function eventRow(platform: Platform, name: string, headline: string): void {
  const author: ChatAuthor = { id: "", displayName: name, badges: [], roles: { broadcaster: false, mod: false, vip: false, sub: false, member: false } };
  chat.add({ id: `live-${Date.now()}-${++rowCounter}`, platform, timestamp: Date.now(), author, fragments: [], kind: "system", eventsOnly: true, event: { headline } });
}

function topChoice(p: Poll): PollChoice | undefined {
  return [...p.choices].sort((a, b) => b.votes - a.votes)[0];
}

class LiveEvents {
  polls = $state<Poll[]>([]);
  prediction = $state<Prediction | null>(null);
  hypeTrain = $state<HypeTrain | null>(null);
  /** Ticks every second while something is on the banner, for countdowns. */
  now = $state(Date.now());
  #started = false;
  #timers = new Map<string, ReturnType<typeof setTimeout>>();

  get active(): boolean {
    return this.polls.length > 0 || !!this.prediction || !!this.hypeTrain;
  }

  start(): void {
    if (this.#started) return;
    this.#started = true;
    setInterval(() => {
      if (this.active) this.now = Date.now();
    }, 1000);
    streamerbot.use((client) => {
      for (const name of this.#handlers.keys()) {
        void client.on(name as any, (event: any) => {
          recordRaw(name, event);
          this.simulate(name, event?.data ?? {});
        });
      }
    });
  }

  /** Apply one Streamer.bot event (also handy from the dev tools console for testing). */
  simulate(name: string, data: Raw): void {
    try {
      this.#handlers.get(name)?.(data ?? {});
    } catch (e) {
      console.warn(`Couldn't apply ${name}`, e);
    }
  }

  #handlers = new Map<string, (d: Raw) => void>();

  constructor() {
    const on = (name: string, handle: (d: Raw) => void) => this.#handlers.set(name, handle);
    {
      on("Twitch.PollCreated", (d) => this.#pollStarted("twitch", d));
      on("Twitch.PollUpdated", (d) => this.#pollUpdated("twitch", d));
      on("Twitch.PollCompleted", (d) => this.#pollEnded("twitch", d, "ended"));
      on("Twitch.PollTerminated", (d) => this.#pollEnded("twitch", d, "was ended early"));
      on("Twitch.PollArchived", (d) => this.#removePoll("twitch", String(pick(d.poll ?? d, "id", "Id") ?? "")));
      on("YouTube.PollStarted", (d) => this.#pollStarted("youtube", d));
      on("YouTube.PollUpdated", (d) => this.#pollUpdated("youtube", d));
      on("YouTube.PollClosed", (d) => this.#pollEnded("youtube", d, "ended"));

      on("Twitch.PredictionCreated", (d) => {
        const p = readPrediction(d, null);
        if (!p) return;
        this.prediction = p;
        eventRow("twitch", "Prediction", `started: ${p.title}`);
      });
      on("Twitch.PredictionUpdated", (d) => {
        const p = readPrediction(d, this.prediction);
        if (p) this.prediction = p;
      });
      on("Twitch.PredictionLocked", (d) => {
        const p = readPrediction(d, this.prediction);
        if (!p) return;
        this.prediction = { ...p, status: "locked" };
        eventRow("twitch", "Prediction", `locked: ${p.title}`);
      });
      on("Twitch.PredictionCompleted", (d) => {
        const p = readPrediction(d, this.prediction);
        if (!p) return;
        this.prediction = { ...p, status: "resolved" };
        const winner = p.outcomes.find((o) => o.id === p.winningId);
        eventRow("twitch", "Prediction", `${p.title}: ${winner ? `"${winner.title}" won (${plural(winner.points, "point")} from ${winner.users === 1 ? "1 person" : `${winner.users.toLocaleString()} people`})` : "resolved"}`);
        this.#clearLater("prediction", () => (this.prediction = null));
      });
      on("Twitch.PredictionCanceled", (d) => {
        const p = readPrediction(d, this.prediction);
        this.prediction = p ? { ...p, status: "canceled" } : null;
        if (p) eventRow("twitch", "Prediction", `canceled, points refunded: ${p.title}`);
        this.#clearLater("prediction", () => (this.prediction = null));
      });

      on("Twitch.HypeTrainStart", (d) => {
        this.hypeTrain = readHype(d, null);
        eventRow("twitch", "Hype Train", "started");
      });
      on("Twitch.HypeTrainUpdate", (d) => (this.hypeTrain = readHype(d, this.hypeTrain)));
      on("Twitch.HypeTrainLevelUp", (d) => {
        this.hypeTrain = readHype(d, this.hypeTrain);
        eventRow("twitch", "Hype Train", `reached level ${this.hypeTrain.level}`);
      });
      on("Twitch.HypeTrainEnd", (d) => {
        const h = readHype(d, this.hypeTrain);
        this.hypeTrain = { ...h, ended: true, expiresAt: undefined };
        eventRow("twitch", "Hype Train", `ended at level ${h.level}`);
        this.#clearLater("hype", () => (this.hypeTrain = null));
      });
    }
  }

  #pollStarted(platform: Platform, d: Raw): void {
    const p = readPoll(platform, d, null);
    if (!p) return;
    this.polls = [...this.polls.filter((x) => !(x.platform === platform && x.id === p.id)), p];
    eventRow(platform, "Poll", `started: ${p.title}`);
  }

  #pollUpdated(platform: Platform, d: Raw): void {
    const prev = this.polls.find((x) => x.platform === platform) ?? null;
    const p = readPoll(platform, d, prev);
    if (!p) return;
    this.polls = [...this.polls.filter((x) => !(x.platform === platform && x.id === p.id)), { ...p, ended: prev?.id === p.id ? prev.ended : false }];
  }

  #pollEnded(platform: Platform, d: Raw, how: string): void {
    const prev = this.polls.find((x) => x.platform === platform) ?? null;
    const p = readPoll(platform, d, prev);
    if (!p) return;
    this.polls = [...this.polls.filter((x) => !(x.platform === platform && x.id === p.id)), { ...p, ended: true, endsAt: undefined }];
    const top = topChoice(p);
    const total = p.choices.reduce((s, c) => s + c.votes, 0);
    eventRow(platform, "Poll", `${p.title} ${how}${top && total ? `: "${top.title}" won with ${plural(top.votes, "vote")} of ${total.toLocaleString()}` : ""}`);
    this.#clearLater(`poll-${platform}-${p.id}`, () => this.#removePoll(platform, p.id));
  }

  #removePoll(platform: Platform, id: string): void {
    this.polls = this.polls.filter((x) => !(x.platform === platform && (x.id === id || !id)));
  }

  #clearLater(key: string, clear: () => void): void {
    const old = this.#timers.get(key);
    if (old) clearTimeout(old);
    this.#timers.set(
      key,
      setTimeout(() => {
        this.#timers.delete(key);
        clear();
      }, SHOW_RESULT_MS),
    );
  }

  /** Close a finished item now instead of waiting. */
  dismiss(what: "prediction" | "hype" | Poll): void {
    if (what === "prediction") this.prediction = null;
    else if (what === "hype") this.hypeTrain = null;
    else this.#removePoll(what.platform, what.id);
  }

  // --- Controls (Twitch, bridge v6) ---

  async #run(op: string, args: Record<string, string | number | undefined>, done: string, failed: string): Promise<boolean> {
    if (!bridge.supports(6)) {
      toasts.show("This needs Chatzooka Bridge v6. Update it in Streamer.bot (see Settings → Streamer.bot).", "error", 6000);
      return false;
    }
    const res = await bridge.call(op, args);
    if (res.ok) toasts.show(done);
    else toasts.show(`Couldn't ${failed}: ${res.error}`, "error");
    return res.ok;
  }

  endPoll(p: Poll): Promise<boolean> {
    return this.#run("twitch.pollEnd", { pollId: p.id }, "Poll ended", "end the poll");
  }

  lockPrediction(p: Prediction): Promise<boolean> {
    return this.#run("twitch.predictionLock", { predictionId: p.id }, "Prediction locked", "lock the prediction");
  }

  resolvePrediction(p: Prediction, o: Outcome): Promise<boolean> {
    return this.#run("twitch.predictionResolve", { predictionId: p.id, winningId: o.id }, `"${o.title}" wins`, "pick the winner");
  }

  cancelPrediction(p: Prediction): Promise<boolean> {
    return this.#run("twitch.predictionCancel", { predictionId: p.id }, "Prediction canceled, points refunded", "cancel the prediction");
  }

  createPoll(title: string, choices: string[], seconds: number): Promise<boolean> {
    return this.#run("twitch.pollCreate", { title, choices: choices.join("\n"), duration: seconds }, "Poll started", "start the poll");
  }

  createPrediction(title: string, outcomes: string[], seconds: number): Promise<boolean> {
    return this.#run("twitch.predictionCreate", { title, outcomes: outcomes.join("\n"), duration: seconds }, "Prediction started", "start the prediction");
  }
}

export const liveEvents = new LiveEvents();

/** "2:05" from milliseconds. */
export function countdown(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
