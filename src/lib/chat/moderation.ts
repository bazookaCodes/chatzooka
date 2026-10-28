// Moderation actions on chat messages and their senders, run through the Chatzooka Bridge.
import { bridge } from "../streamerbot/bridge.svelte";
import { toasts } from "../toasts.svelte";
import { chat } from "./store.svelte";
import type { ChatMessage } from "./types";

export const TIMEOUT_PRESETS: { label: string; seconds: number }[] = [
  { label: "1s", seconds: 1 },
  { label: "30s", seconds: 30 },
  { label: "60s", seconds: 60 },
  { label: "10m", seconds: 600 },
  { label: "30m", seconds: 1800 },
  { label: "1h", seconds: 3600 },
  { label: "4h", seconds: 14400 },
  { label: "12h", seconds: 43200 },
  { label: "1d", seconds: 86400 },
  { label: "7d", seconds: 604800 },
  { label: "14d", seconds: 1209600 },
];

export function durationLabel(seconds: number): string {
  return TIMEOUT_PRESETS.find((p) => p.seconds === seconds)?.label ?? `${seconds}s`;
}

/** What each platform supports through Streamer.bot. */
export function capabilities(message: ChatMessage) {
  const twitch = message.platform === "twitch";
  // Only real chat messages can be deleted (alert rows and mod-log rows have no Twitch message ID).
  const isChat = message.kind === "chat" || message.kind === "action";
  return { timeout: true, ban: true, unban: twitch, delete: twitch && isChat };
}

/** You can't moderate yourself (the broadcaster) or alert rows with no real sender. */
export function canModerate(message: ChatMessage): boolean {
  return !!message.author.id && !message.author.roles.broadcaster;
}

/**
 * The YouTube live chat to moderate in: the message's own broadcast, else the most recent one
 * seen in chat (for messages saved before broadcast IDs were recorded).
 */
function youtubeBroadcast(message: ChatMessage): string | undefined {
  if (message.broadcastId) return message.broadcastId;
  for (let i = chat.messages.length - 1; i >= 0; i--) {
    const m = chat.messages[i];
    if (m.platform === "youtube" && m.broadcastId) return m.broadcastId;
  }
  return undefined;
}

/**
 * Timeouts started from Chatzooka in the last 30 seconds, by platform:userId. YouTube calls a
 * timeout a "temporary ban", and Streamer.bot may report it as a ban event; this lets the event
 * handler label it correctly.
 */
const recentTimeouts = new Map<string, { seconds: number; at: number }>();

export function recentTimeout(platform: string, userId: string): number | null {
  const t = recentTimeouts.get(`${platform}:${userId}`);
  return t && Date.now() - t.at < 30_000 ? t.seconds : null;
}

/** `done` is shown on success ("Banned X"), `failed` completes "Couldn't …" ("ban X"). */
async function run(done: string, failed: string, op: string, args: Record<string, string | number | undefined>): Promise<boolean> {
  const result = await bridge.call(op, args);
  if (result.ok) toasts.show(done);
  else toasts.show(`Couldn't ${failed}: ${result.error}`, "error");
  return result.ok;
}

export function timeoutUser(message: ChatMessage, seconds: number): Promise<boolean> {
  const name = message.author.displayName;
  const d = durationLabel(seconds);
  recentTimeouts.set(`${message.platform}:${message.author.id}`, { seconds, at: Date.now() });
  return message.platform === "twitch"
    ? run(`Timed out ${name} for ${d}`, `time out ${name}`, "twitch.timeout", { login: message.author.login ?? name, seconds })
    : run(`Timed out ${name} for ${d}`, `time out ${name}`, "youtube.timeout", { userId: message.author.id, seconds, broadcastId: youtubeBroadcast(message) });
}

export function banUser(message: ChatMessage): Promise<boolean> {
  const name = message.author.displayName;
  return message.platform === "twitch"
    ? run(`Banned ${name}`, `ban ${name}`, "twitch.ban", { login: message.author.login ?? name })
    : run(`Banned ${name}`, `ban ${name}`, "youtube.ban", { userId: message.author.id, broadcastId: youtubeBroadcast(message) });
}

export function unbanUser(message: ChatMessage): Promise<boolean> {
  const name = message.author.displayName;
  return run(`Unbanned ${name}`, `unban ${name}`, "twitch.unban", { login: message.author.login ?? name });
}

export function modUser(message: ChatMessage): Promise<boolean> {
  const name = message.author.displayName;
  return run(`Made ${name} a moderator`, `mod ${name}`, "twitch.mod", { login: message.author.login ?? name });
}

export function unmodUser(message: ChatMessage): Promise<boolean> {
  const name = message.author.displayName;
  return run(`Removed ${name} as moderator`, `unmod ${name}`, "twitch.unmod", { login: message.author.login ?? name });
}

export interface TwitchUserInfo {
  userId: string;
  login: string;
  name: string;
  description?: string;
  profileImageUrl?: string;
  createdAt?: string;
  isFollowing: boolean;
  isSubscribed: boolean;
  subscriptionTier?: string;
  isModerator: boolean;
  isVip: boolean;
  isAffiliate: boolean;
  isPartner: boolean;
  game?: string;
}

/** Profile details for the user card (bridge v2). */
export async function twitchUserInfo(login: string): Promise<TwitchUserInfo | { error: string }> {
  const result = await bridge.call("twitch.userInfo", { login });
  return result.ok ? (result.data as TwitchUserInfo) : { error: result.error };
}

export function deleteMessage(message: ChatMessage): Promise<boolean> {
  const name = message.author.displayName;
  return run(`Deleted ${name}'s message`, `delete ${name}'s message`, "twitch.delete", { messageId: message.id });
}
