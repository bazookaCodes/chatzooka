// Reflects moderation done by anyone (you, your mods, AutoMod, Streamer.bot):
//  - removed messages stay visible in chat but struck through, with a short note
//  - every action is also logged as a row on the Mod actions tab
// These payloads aren't documented; fields are read from several likely names and dev builds
// record the raw events (see events.ts) so they can be confirmed.
import { durationLabel, recentTimeout } from "../chat/moderation";
import type { ModIcon } from "../chat/modIcons";
import { chat } from "../chat/store.svelte";
import { thirdPartyEmotes } from "../chat/thirdPartyEmotes.svelte";
import type { ChatAuthor, ChatMessage, Fragment, Platform } from "../chat/types";
import { fallbackColor } from "./normalize";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Raw = any;

function pick(obj: Raw, ...paths: string[]): any {
  for (const path of paths) {
    let v = obj;
    for (const key of path.split(".")) v = v?.[key];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
}

function targetUserId(d: Raw): string | undefined {
  const id = pick(d, "user.id", "targetUser.id", "target_user_id", "targetUserId", "userId", "user_id");
  return id === undefined ? undefined : String(id);
}

function targetLogin(d: Raw): string | undefined {
  const login = pick(d, "user.login", "targetUser.login", "target_user_login", "targetUserLogin", "userName", "user_login", "username");
  return login === undefined ? undefined : String(login).toLowerCase();
}

/** Chat messages (not log rows) from the event's target user. */
function fromTarget(platform: Platform, d: Raw): ((m: ChatMessage) => boolean) | null {
  const id = targetUserId(d);
  const login = targetLogin(d);
  if (!id && !login) return null;
  return (m) =>
    m.platform === platform &&
    m.kind !== "modaction" &&
    ((!!id && m.author.id === id) || (!!login && m.author.login?.toLowerCase() === login));
}

/** The target as a ChatAuthor, reusing their last chat message so color/badges/paint match. */
function targetAuthor(platform: Platform, d: Raw): ChatAuthor {
  const match = fromTarget(platform, d);
  if (match) {
    for (let i = chat.messages.length - 1; i >= 0; i--) {
      if (match(chat.messages[i])) return chat.messages[i].author;
    }
  }
  const name = String(
    pick(d, "user.name", "user.display", "targetUser.name", "target_user_name", "displayName", "userName", "user.login") ?? "unknown",
  );
  return {
    id: targetUserId(d) ?? "",
    login: targetLogin(d),
    displayName: name,
    color: platform === "twitch" ? fallbackColor(name) : "#ffffff",
    badges: [],
    roles: { broadcaster: false, mod: false, vip: false, sub: false, member: false },
  };
}

function moderatorName(d: Raw): string | undefined {
  return pick(d, "moderator.name", "moderator.display", "moderator.login", "createdBy", "created_by", "moderatorName", "moderator_user_name", "by");
}

let logCounter = 0;

/** Add a row to the Mod actions tab. */
function log(platform: Platform, author: ChatAuthor, d: Raw, headline: string, icon: ModIcon, fragments: Fragment[] = []): void {
  const by = moderatorName(d);
  const reason = pick(d, "reason", "warning.reason");
  const parts = [headline];
  if (by) parts.push(`by ${by}`);
  if (reason) parts.push(`reason: ${reason}`);
  chat.add({
    id: `mod-${Date.now()}-${++logCounter}`,
    platform,
    timestamp: Date.now(),
    author,
    fragments,
    kind: "modaction",
    event: { headline: parts.join(" · "), icon },
  });
}

const CHAT_AUTHOR: ChatAuthor = {
  id: "",
  displayName: "Chat",
  badges: [],
  roles: { broadcaster: false, mod: false, vip: false, sub: false, member: false },
};

/** Log a chat setting change (slow mode, followers-only, …) as a "Chat …" row. */
export function logChatSetting(platform: Platform, headline: string, icon: ModIcon): void {
  log(platform, CHAT_AUTHOR, {}, headline, icon);
}

/** Last log entry per user, so one action reported as two events is only logged once. */
const lastLogged = new Map<string, { headline: string; at: number }>();

function userAction(platform: Platform, d: Raw, headline: string, note: string, icon: ModIcon): void {
  const author = targetAuthor(platform, d);
  const match = fromTarget(platform, d);
  if (match) chat.markDeleted(match, note);
  const key = `${platform}:${author.id || author.displayName}`;
  const prev = lastLogged.get(key);
  if (prev && prev.headline === headline && Date.now() - prev.at < 5000) return;
  lastLogged.set(key, { headline, at: Date.now() });
  log(platform, author, d, headline, icon);
}

function timedOut(platform: Platform, d: Raw, s: number): void {
  userAction(platform, d, s ? `timed out for ${durationLabel(s)}` : "timed out", s ? `timed out ${durationLabel(s)}` : "timed out", "timeout");
}

function lifted(platform: Platform, d: Raw, headline: string, suffix: string, icon: ModIcon): void {
  const author = targetAuthor(platform, d);
  const match = fromTarget(platform, d);
  if (match) chat.annotate(match, suffix);
  log(platform, author, d, headline, icon);
}

function messageDeleted(platform: Platform, d: Raw): void {
  const id = pick(d, "messageId", "message_id", "targetMessageId", "msgId", "id", "message.id");
  if (id === undefined) return;
  const original = chat.messages.find((m) => m.platform === platform && m.id === String(id));
  chat.markDeleted((m) => m.platform === platform && m.id === String(id), "deleted");
  const text = pick(d, "message", "text", "message.text");
  const fragments: Fragment[] = original?.fragments ?? (typeof text === "string" ? [{ type: "text", text }] : []);
  log(platform, original?.author ?? targetAuthor(platform, d), d, "message deleted", "delete", fragments);
}

/** Role changes and warnings: a Mod actions row, nothing changes in chat. */
function roleChange(d: Raw, headline: string, icon: ModIcon): void {
  log("twitch", targetAuthor("twitch", d), d, headline, icon);
}

// --- AutoMod ---

function heldId(d: Raw): string | undefined {
  const id = pick(d, "messageId", "message_id", "message.id", "msgId", "id");
  return id === undefined ? undefined : String(id);
}

function holdReason(d: Raw): string | undefined {
  const reason = String(pick(d, "reason", "automod.reason") ?? "");
  if (/blocked/i.test(reason)) {
    const term = pick(d, "blockedTerm.term", "blocked_term.terms_found.0.text", "blockedTerms.0.text", "terms.0");
    return term ? `blocked term "${term}"` : "blocked term";
  }
  const category = pick(d, "category", "automod.category");
  const level = pick(d, "level", "automod.level");
  if (!category) return undefined;
  return level !== undefined ? `${category} (level ${level})` : String(category);
}

function autoModHeld(d: Raw): void {
  const id = heldId(d);
  if (!id || chat.messages.some((m) => m.automod?.heldId === id)) return;
  const text = pick(d, "message.text", "rawInput", "text", "message");
  chat.add({
    id: `automod-${id}`,
    platform: "twitch",
    timestamp: Date.now(),
    author: targetAuthor("twitch", d),
    fragments: thirdPartyEmotes.apply(typeof text === "string" ? [{ type: "text", text }] : []),
    kind: "automod",
    automod: { heldId: id, status: "held", reason: holdReason(d) },
  });
}

function autoModUpdate(d: Raw): void {
  const id = heldId(d);
  if (!id) return;
  const raw = String(pick(d, "status", "state") ?? "").toLowerCase();
  const status = raw.startsWith("approv") || raw === "allowed" ? "approved" : raw.startsWith("den") ? "denied" : raw.startsWith("expir") ? "expired" : null;
  if (!status) return;
  setHeldStatus(id, status, moderatorName(d));
}

/** Mark a held AutoMod message as allowed / denied / expired. */
export function setHeldStatus(id: string, status: "approved" | "denied" | "expired", by?: string): void {
  chat.updateWhere(
    (m) => m.automod?.heldId === id,
    (m) => (m.automod!.status === status ? m : { ...m, automod: { ...m.automod!, status, by: by ?? m.automod!.by } }),
  );
}

function seconds(d: Raw): number {
  return Number(pick(d, "duration", "durationSeconds", "seconds", "banDurationSeconds") ?? 0);
}

export const modEventHandlers: Record<string, (d: Raw) => void> = {
  "Twitch.ChatMessageDeleted": (d) => messageDeleted("twitch", d),
  "Twitch.UserTimedOut": (d) => timedOut("twitch", d, seconds(d)),
  "Twitch.UserBanned": (d) => userAction("twitch", d, "banned", "banned", "ban"),
  "Twitch.UserUnbanned": (d) => lifted("twitch", d, "unbanned", "unbanned", "unban"),
  "Twitch.UserUntimedOut": (d) => lifted("twitch", d, "timeout removed", "timeout lifted", "untimeout"),
  "Twitch.ChatCleared": (d) => {
    chat.markDeleted((m) => m.platform === "twitch" && (m.kind === "chat" || m.kind === "action"), "chat cleared");
    log("twitch", CHAT_AUTHOR, d, "cleared", "clear");
  },
  "Twitch.ModeratorAdded": (d) => roleChange(d, "made a moderator", "mod"),
  "Twitch.ModeratorRemoved": (d) => roleChange(d, "no longer a moderator", "unmod"),
  "Twitch.VipAdded": (d) => roleChange(d, "made a VIP", "vip"),
  "Twitch.VipRemoved": (d) => roleChange(d, "no longer a VIP", "unvip"),
  "Twitch.WarnedUser": (d) => roleChange(d, "warned", "warn"),
  "Twitch.WarningAcknowledged": (d) => roleChange(d, "acknowledged their warning", "warn"),
  "Twitch.AutoModMessageHeld": autoModHeld,
  "Twitch.AutoModMessageUpdate": autoModUpdate,
  "YouTube.MessageDeleted": (d) => messageDeleted("youtube", d),
  "YouTube.UserTimedout": (d) => timedOut("youtube", d, seconds(d) || recentTimeout("youtube", targetUserId(d) ?? "") || 0),
  // YouTube timeouts are "temporary bans" and can arrive as a ban event. Treat it as a timeout
  // when the event says so, or when Chatzooka just timed this user out.
  "YouTube.UserBanned": (d) => {
    const own = recentTimeout("youtube", targetUserId(d) ?? "");
    const temporary = /temp/i.test(String(pick(d, "banType", "type", "ban.type", "snippet.type") ?? "")) || seconds(d) > 0;
    if (own !== null || temporary) timedOut("youtube", d, seconds(d) || own || 0);
    else userAction("youtube", d, "banned", "banned", "ban");
  },
};
