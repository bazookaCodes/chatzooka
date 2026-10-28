// Slash commands typed in the message box (e.g. "/timeout name 600"). They're carried out by
// Chatzooka through the Chatzooka Bridge rather than sent as chat text, because Twitch doesn't
// run slash commands that arrive as ordinary messages. Mostly Twitch-only; /timeout and /ban also
// work on YouTube for people who've chatted there.
import { bridge, type BridgeResult } from "../streamerbot/bridge.svelte";
import { toasts } from "../toasts.svelte";
import { banUser, durationLabel, modUser, timeoutUser, unbanUser, unmodUser } from "./moderation";
import { chat } from "./store.svelte";
import type { ChatAuthor, ChatMessage, Platform } from "./types";

export interface SlashCommand {
  name: string;
  aliases?: string[];
  /** Argument hint shown in the list, e.g. "<user> [seconds] [reason]". */
  args: string;
  description: string;
  platforms: Platform[];
  /** Chatzooka Bridge version needed. */
  bridge: number;
  run: (args: string[], platform: Platform) => Promise<boolean>;
}

const ANNOUNCE_COLORS = ["blue", "green", "orange", "purple"] as const;

/** Someone to act on: from chat if they've talked (for color, ID, YouTube), else by login. */
function subject(platform: Platform, raw: string | undefined): ChatMessage | null {
  const name = (raw ?? "").replace(/^@/, "").toLowerCase();
  if (!name) return null;
  for (let i = chat.messages.length - 1; i >= 0; i--) {
    const m = chat.messages[i];
    const a = m.author;
    if (m.platform === platform && a.id && (a.login?.toLowerCase() === name || a.displayName.toLowerCase() === name)) {
      return { ...m, kind: "chat" };
    }
  }
  if (platform === "youtube") return null; // YouTube needs the channel ID, which only chat provides.
  const author: ChatAuthor = {
    id: name,
    login: name,
    displayName: raw!.replace(/^@/, ""),
    badges: [],
    roles: { broadcaster: false, mod: false, vip: false, sub: false, member: false },
  };
  return { id: "", platform, timestamp: Date.now(), author, fragments: [], kind: "chat" };
}

/** Run a bridge op and show the outcome. */
async function op(done: string, failed: string, name: string, args: Record<string, string | number | undefined> = {}): Promise<boolean> {
  const res: BridgeResult = await bridge.call(name, args);
  if (res.ok) toasts.show(done);
  else toasts.show(`Couldn't ${failed}: ${res.error}`, "error");
  return res.ok;
}

function needUser(cmd: string, platform: Platform, raw: string | undefined): ChatMessage | null {
  const s = subject(platform, raw);
  if (!s) {
    toasts.show(
      !raw ? `Usage: /${cmd} <user>` : platform === "youtube" ? `${raw} hasn't chatted on YouTube yet, so they can't be found` : `Usage: /${cmd} <user>`,
      "error",
    );
  }
  return s;
}

function seconds(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  // Accept 600, 10m, 1h, 1d.
  const m = raw.match(/^(\d+)([smhd]?)$/i);
  if (!m) return NaN;
  const n = Number(m[1]);
  return n * ({ s: 1, m: 60, h: 3600, d: 86400 }[m[2].toLowerCase() as "s" | "m" | "h" | "d"] ?? 1);
}

export const SLASH_COMMANDS: SlashCommand[] = [
  {
    name: "timeout",
    args: "<user> [duration] [reason]",
    description: "Time someone out (default 10m; e.g. 600, 10m, 1h, 1d)",
    platforms: ["twitch", "youtube"],
    bridge: 1,
    run: async ([user, dur], platform) => {
      const s = needUser("timeout", platform, user);
      const secs = seconds(dur, 600);
      if (!s) return false;
      if (Number.isNaN(secs)) {
        toasts.show(`"${dur}" isn't a duration. Try 600, 10m, 1h or 1d`, "error");
        return false;
      }
      return timeoutUser(s, secs);
    },
  },
  {
    name: "untimeout",
    args: "<user>",
    description: "Remove a timeout",
    platforms: ["twitch"],
    bridge: 1,
    run: async ([user], platform) => {
      const s = needUser("untimeout", platform, user);
      return s ? unbanUser(s) : false;
    },
  },
  {
    name: "ban",
    args: "<user> [reason]",
    description: "Ban someone",
    platforms: ["twitch", "youtube"],
    bridge: 1,
    run: async ([user], platform) => {
      const s = needUser("ban", platform, user);
      return s ? banUser(s) : false;
    },
  },
  {
    name: "unban",
    args: "<user>",
    description: "Unban someone",
    platforms: ["twitch"],
    bridge: 1,
    run: async ([user], platform) => {
      const s = needUser("unban", platform, user);
      return s ? unbanUser(s) : false;
    },
  },
  {
    name: "mod",
    args: "<user>",
    description: "Make someone a moderator",
    platforms: ["twitch"],
    bridge: 2,
    run: async ([user], platform) => {
      const s = needUser("mod", platform, user);
      return s ? modUser(s) : false;
    },
  },
  {
    name: "unmod",
    args: "<user>",
    description: "Remove a moderator",
    platforms: ["twitch"],
    bridge: 2,
    run: async ([user], platform) => {
      const s = needUser("unmod", platform, user);
      return s ? unmodUser(s) : false;
    },
  },
  {
    name: "vip",
    args: "<user>",
    description: "Give someone VIP",
    platforms: ["twitch"],
    bridge: 4,
    run: async ([user]) => (user ? op(`Made ${user} a VIP`, `VIP ${user}`, "twitch.vip", { login: user.replace(/^@/, "") }) : usage("vip <user>")),
  },
  {
    name: "unvip",
    args: "<user>",
    description: "Remove someone's VIP",
    platforms: ["twitch"],
    bridge: 4,
    run: async ([user]) => (user ? op(`Removed ${user}'s VIP`, `remove ${user}'s VIP`, "twitch.unvip", { login: user.replace(/^@/, "") }) : usage("unvip <user>")),
  },
  {
    name: "shoutout",
    aliases: ["so"],
    args: "<user>",
    description: "Send a Twitch shoutout (you must be live)",
    platforms: ["twitch"],
    bridge: 4,
    run: async ([user]) => (user ? op(`Shoutout sent to ${user}`, `shout out ${user}`, "twitch.shoutout", { login: user.replace(/^@/, "") }) : usage("shoutout <user>")),
  },
  {
    name: "announce",
    args: "<message>",
    description: "Post a highlighted announcement",
    platforms: ["twitch"],
    bridge: 4,
    run: async (args) => announce(args, "default"),
  },
  ...ANNOUNCE_COLORS.map(
    (color): SlashCommand => ({
      name: `announce${color}`,
      args: "<message>",
      description: `Announcement in ${color}`,
      platforms: ["twitch"],
      bridge: 4,
      run: async (args) => announce(args, color),
    }),
  ),
  {
    name: "slow",
    args: "[seconds]",
    description: "Slow mode: wait between messages (default 30s)",
    platforms: ["twitch"],
    bridge: 4,
    run: async ([s]) => {
      const secs = seconds(s, 30);
      if (Number.isNaN(secs)) return usage("slow [seconds]");
      return op(`Slow mode on (${durationLabel(secs)})`, "turn on slow mode", "twitch.slow", { enabled: "true", seconds: secs });
    },
  },
  { name: "slowoff", args: "", description: "Turn slow mode off", platforms: ["twitch"], bridge: 4, run: async () => op("Slow mode off", "turn off slow mode", "twitch.slow", { enabled: "false" }) },
  {
    name: "followers",
    args: "[minutes]",
    description: "Followers-only chat (optionally followed for N minutes)",
    platforms: ["twitch"],
    bridge: 4,
    run: async ([m]) => {
      const mins = m ? Number(m) : 0;
      if (!Number.isInteger(mins) || mins < 0) return usage("followers [minutes]");
      return op(mins ? `Followers-only (${mins} min)` : "Followers-only on", "turn on followers-only", "twitch.followers", { enabled: "true", minutes: mins });
    },
  },
  { name: "followersoff", args: "", description: "Turn followers-only off", platforms: ["twitch"], bridge: 4, run: async () => op("Followers-only off", "turn off followers-only", "twitch.followers", { enabled: "false" }) },
  { name: "subscribers", args: "", description: "Subscribers-only chat", platforms: ["twitch"], bridge: 4, run: async () => op("Subscribers-only on", "turn on subscribers-only", "twitch.subscribers", { enabled: "true" }) },
  { name: "subscribersoff", args: "", description: "Turn subscribers-only off", platforms: ["twitch"], bridge: 4, run: async () => op("Subscribers-only off", "turn off subscribers-only", "twitch.subscribers", { enabled: "false" }) },
  { name: "emoteonly", args: "", description: "Emote-only chat", platforms: ["twitch"], bridge: 4, run: async () => op("Emote-only on", "turn on emote-only", "twitch.emoteonly", { enabled: "true" }) },
  { name: "emoteonlyoff", args: "", description: "Turn emote-only off", platforms: ["twitch"], bridge: 4, run: async () => op("Emote-only off", "turn off emote-only", "twitch.emoteonly", { enabled: "false" }) },
  { name: "clear", args: "", description: "Clear all chat messages", platforms: ["twitch"], bridge: 4, run: async () => op("Chat cleared", "clear chat", "twitch.clear") },
];

function usage(text: string): false {
  toasts.show(`Usage: /${text}`, "error");
  return false;
}

async function announce(args: string[], color: string): Promise<boolean> {
  const message = args.join(" ").trim();
  if (!message) return usage("announce <message>");
  return op("Announcement posted", "post the announcement", "twitch.announce", { message, color });
}

export function findCommand(name: string): SlashCommand | undefined {
  const n = name.toLowerCase();
  return SLASH_COMMANDS.find((c) => c.name === n || c.aliases?.includes(n));
}

/**
 * Run "/command args…" on the selected platforms. Returns true if it's a slash command (handled,
 * whether or not it succeeded), so the caller doesn't send it as chat text.
 */
export async function runSlashCommand(text: string, targets: Platform[]): Promise<{ handled: boolean; ok: boolean }> {
  const m = text.match(/^\/(\S+)\s*(.*)$/s);
  if (!m) return { handled: false, ok: false };
  const cmd = findCommand(m[1]);
  if (!cmd) {
    toasts.show(`Unknown command /${m[1]}. Open ☰ → Slash Commands to see what's available.`, "error");
    return { handled: true, ok: false };
  }
  if (!bridge.supports(cmd.bridge)) {
    toasts.show(
      bridge.status === "ready"
        ? `/${cmd.name} needs a newer Chatzooka Bridge. Update it in Streamer.bot (see Settings).`
        : `/${cmd.name} needs the Chatzooka Bridge (see Settings).`,
      "error",
    );
    return { handled: true, ok: false };
  }
  const platforms = targets.filter((p) => cmd.platforms.includes(p));
  if (!platforms.length) {
    toasts.show(`/${cmd.name} only works on ${cmd.platforms.map((p) => (p === "twitch" ? "Twitch" : "YouTube")).join(" and ")}. Turn that platform on in the message box.`, "error");
    return { handled: true, ok: false };
  }
  const args = m[2].trim() ? m[2].trim().split(/\s+/) : [];
  let ok = true;
  for (const p of platforms) ok = (await cmd.run(args, p)) && ok;
  return { handled: true, ok };
}
