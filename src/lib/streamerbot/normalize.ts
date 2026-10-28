// Turns Streamer.bot event payloads into ChatMessage. Payload shapes were taken from real
// Streamer.bot 1.0.x events (the client library's bundled types are out of date), so every
// field is read defensively.
import type { Badge, ChatAuthor, ChatMessage, EmoteProvider, Fragment } from "../chat/types";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Raw = any;

const URL_RE = /^https?:\/\/\S+$/i;

/** Streamer.bot's `parts` array: `{ type: "text", text }` or `{ type: "emote", text, imageUrl, source, zeroWidth }`. */
export function partsToFragments(parts: Raw[] | undefined, fallbackText: string): Fragment[] {
  if (!Array.isArray(parts) || parts.length === 0) return textToFragments(fallbackText ?? "");
  const out: Fragment[] = [];
  for (const part of parts) {
    if (part?.type === "emote" && part.imageUrl) {
      const provider = emoteProvider(part.source ?? part.type);
      out.push({
        type: "emote",
        name: String(part.text ?? part.name ?? ""),
        url: emoteUrl(String(part.imageUrl), provider),
        provider,
        zeroWidth: !!part.zeroWidth,
      });
    } else if (typeof part?.text === "string") {
      out.push(...textToFragments(part.text));
    }
  }
  return out;
}

/** Split plain text into text, @mention and link fragments. */
export function textToFragments(text: string): Fragment[] {
  const out: Fragment[] = [];
  let buffer = "";
  for (const token of text.split(/(\s+)/)) {
    if (token.startsWith("@") && token.length > 1) {
      if (buffer) out.push({ type: "text", text: buffer });
      buffer = "";
      out.push({ type: "mention", text: token });
    } else if (URL_RE.test(token)) {
      if (buffer) out.push({ type: "text", text: buffer });
      buffer = "";
      out.push({ type: "link", url: token });
    } else {
      buffer += token;
    }
  }
  if (buffer) out.push({ type: "text", text: buffer });
  return out;
}

/**
 * Streamer.bot hands out 7TV emotes as `4x.png`, which is a still frame for animated emotes.
 * The `2x.webp` file is animated when the emote is, and smaller.
 */
export function emoteUrl(url: string, provider: EmoteProvider): string {
  if (provider === "7tv") return url.replace(/\/\dx\.(png|gif|avif|webp)(\?.*)?$/i, "/2x.webp");
  return url;
}

function emoteProvider(source: string | undefined): EmoteProvider {
  const s = (source ?? "").toLowerCase();
  if (s.includes("7tv")) return "7tv";
  if (s.includes("bttv")) return "bttv";
  if (s.includes("ffz")) return "ffz";
  if (s.includes("youtube")) return "youtube";
  return "twitch";
}

export function parseTime(...candidates: unknown[]): number {
  for (const c of candidates) {
    if (typeof c === "string" || typeof c === "number") {
      const t = new Date(c).getTime();
      if (!Number.isNaN(t)) return t;
    }
  }
  return Date.now();
}

// Twitch's palette for users who never picked a name color.
const DEFAULT_COLORS = [
  "#FF0000", "#0000FF", "#008000", "#B22222", "#FF7F50", "#9ACD32", "#FF4500", "#2E8B57",
  "#DAA520", "#D2691E", "#5F9EA0", "#1E90FF", "#FF69B4", "#8A2BE2", "#00FF7F",
];

export function fallbackColor(name: string): string {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return DEFAULT_COLORS[hash % DEFAULT_COLORS.length];
}

export function twitchBadges(raw: Raw[] | undefined): Badge[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((b) => b?.imageUrl)
    .map((b) => ({ id: `${b.name}/${b.version}`, title: badgeTitle(b), imageUrl: b.imageUrl }));
}

function badgeTitle(b: Raw): string {
  const name = String(b.name ?? "").replace(/[-_]/g, " ");
  const pretty = name.charAt(0).toUpperCase() + name.slice(1);
  if (b.name === "subscriber" && b.info) return `Subscriber (${b.info} months)`;
  return pretty;
}

// Streamer.bot Twitch roles: 1 viewer, 2 VIP, 3 moderator, 4 broadcaster.
export function twitchChatMessage(payload: Raw, eventTime?: string): ChatMessage | null {
  const d = payload ?? {};
  const user = d.user ?? {};
  const meta = d.meta ?? {};
  const id = d.messageId ?? d.msgId;
  if (!id) return null;
  const role = Number(user.role ?? 1);
  const badges = twitchBadges(user.badges);
  const displayName = user.name ?? user.login ?? "unknown";
  const author: ChatAuthor = {
    id: String(user.id ?? ""),
    login: user.login,
    displayName,
    color: user.color || fallbackColor(displayName),
    badges,
    roles: {
      broadcaster: role >= 4,
      mod: role >= 3,
      vip: role === 2 || badges.some((b) => b.id.startsWith("vip/")),
      sub: !!user.subscribed,
      member: false,
    },
  };
  return {
    id: String(id),
    platform: "twitch",
    timestamp: parseTime(meta.createdAt, d.createdAt, eventTime),
    author,
    fragments: partsToFragments(d.parts, d.text ?? ""),
    kind: meta.isMe ? "action" : "chat",
    // Streamer.bot's `meta.firstMessage`; see firstSeen.ts for how it's combined.
    firstEver: meta.firstMessage === true,
    highlighted: meta.isHighlighted === true,
  };
}

export function youtubeAuthor(user: Raw): ChatAuthor {
  const u = user ?? {};
  const isOwner = !!(u.isOwner ?? u.owner);
  const isMod = !!(u.isModerator ?? u.moderator);
  const isMember = !!(u.isSponsor ?? u.isMember ?? u.sponsor);
  const badges: Badge[] = [];
  if (isMember && u.sponsorBadgeUrl) badges.push({ id: "member", title: "Member", imageUrl: u.sponsorBadgeUrl });
  return {
    id: String(u.id ?? ""),
    login: u.login,
    displayName: u.name ?? u.displayName ?? "unknown",
    avatarUrl: u.profileImageUrl,
    // YouTube has no name colors; match YouTube's own role colors.
    color: isOwner ? "#ffd600" : isMod ? "#5e84f1" : isMember ? "#2ba640" : "#ffffff",
    badges,
    roles: { broadcaster: isOwner, mod: isMod, vip: false, sub: false, member: isMember },
  };
}

export function youtubeChatMessage(payload: Raw, eventTime?: string): ChatMessage | null {
  const d = payload ?? {};
  const id = d.messageId ?? d.eventId ?? d.id;
  if (!id) return null;
  return {
    id: String(id),
    platform: "youtube",
    timestamp: parseTime(d.publishedAt, d.createdAt, d.meta?.createdAt, eventTime),
    author: youtubeAuthor(d.user),
    fragments: youtubeFragments(String(d.message ?? d.text ?? ""), d.emotes),
    kind: "chat",
    broadcastId: d.broadcast?.id ? String(d.broadcast.id) : undefined,
  };
}

/**
 * YouTube payloads (Streamer.bot 1.0.7) have `message` plus an `emotes` list with inclusive
 * UTF-16 start/end indices. Their `parts` have no `type` field, so they aren't used.
 * Standard emoji ("Twemoji") stay as text so they render with the system emoji font;
 * YouTube's own custom emoji become images.
 */
export function youtubeFragments(text: string, emotes: Raw[] | undefined): Fragment[] {
  const images = (Array.isArray(emotes) ? emotes : [])
    .filter((e) => e?.imageUrl && String(e.type).toLowerCase() !== "twemoji")
    .sort((a, b) => a.startIndex - b.startIndex);
  const out: Fragment[] = [];
  let pos = 0;
  for (const e of images) {
    const start = Number(e.startIndex);
    const end = Number(e.endIndex) + 1;
    if (!(start >= pos && end > start && end <= text.length)) continue;
    if (start > pos) out.push(...textToFragments(text.slice(pos, start)));
    out.push({ type: "emote", name: String(e.name ?? text.slice(start, end)), url: youtubeEmojiUrl(e.imageUrl), provider: "youtube" });
    pos = end;
  }
  if (pos < text.length) out.push(...textToFragments(text.slice(pos)));
  return out;
}

/** YouTube serves custom emoji at 24px; ask for 48px so they're sharp at our 28px emote height. */
function youtubeEmojiUrl(url: string): string {
  return url.replace(/=w24-h24(-|$)/, "=w48-h48$1");
}
