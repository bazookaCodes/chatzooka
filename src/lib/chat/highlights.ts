// Decides which highlight (if any) a chat message gets, following the Highlights settings.
// Order matters: the first enabled match wins, mirroring Streamer.bot's table. Chatzooka's own
// "first message ever" sits above "first message this session" so it's never masked by it.
import { prefs, type FlaggedUser, type HighlightCategory } from "../prefs.svelte";
import { streamerbot } from "../streamerbot/connection.svelte";
import { plainText } from "./plainText";
import type { ChatMessage } from "./types";

export interface Highlight {
  category: HighlightCategory | "pattern";
  color: string;
  /** Corner label, e.g. "First message". */
  label?: string;
}

const ORDER: HighlightCategory[] = [
  "mention",
  "highlightedMessage",
  "firstEver",
  "firstSession",
  "highlightedUser",
  "broadcaster",
  "moderator",
  "vip",
  "subscriber",
];

const LABELS: Partial<Record<HighlightCategory, string>> = {
  firstEver: "First message ever",
  firstSession: "First message this session",
  mention: "Mentions you",
  highlightedMessage: "Highlighted",
};

function flagged(list: FlaggedUser[], m: ChatMessage): boolean {
  const login = (m.author.login ?? m.author.displayName).toLowerCase();
  const name = m.author.displayName.toLowerCase();
  return list.some((u) => u.platform === m.platform && (u.name === login || u.name === name));
}

/** Your own names on each platform, for "mentions you". */
function yourNames(): string[] {
  const a = streamerbot.accounts;
  return [a.twitch?.login, a.twitch?.displayName, a.youtube?.name].filter((n): n is string => !!n).map((n) => n.toLowerCase());
}

function mentionsYou(m: ChatMessage): boolean {
  if (m.author.roles.broadcaster) return false;
  const names = yourNames();
  if (!names.length) return false;
  const words = plainText(m)
    .toLowerCase()
    .split(/[^a-z0-9_@]+/i)
    .map((w) => w.replace(/^@/, ""));
  return words.some((w) => names.includes(w));
}

const regexCache = new Map<string, RegExp | null>();
function compiled(pattern: string): RegExp | null {
  if (!regexCache.has(pattern)) {
    try {
      regexCache.set(pattern, new RegExp(pattern, "i"));
    } catch {
      regexCache.set(pattern, null);
    }
  }
  return regexCache.get(pattern)!;
}

function matches(category: HighlightCategory, m: ChatMessage): boolean {
  const r = m.author.roles;
  switch (category) {
    case "mention":
      return mentionsYou(m);
    case "highlightedMessage":
      return !!m.highlighted;
    case "firstEver":
      return !!m.firstEver;
    case "firstSession":
      return !!m.firstInSession;
    case "highlightedUser":
      return flagged(prefs.value.highlightUsers, m);
    case "broadcaster":
      return r.broadcaster;
    case "moderator":
      return r.mod && !r.broadcaster;
    case "vip":
      return r.vip;
    case "subscriber":
      return r.sub || r.member;
  }
}

/** Highlight for a chat message, or null. Event rows and mod-log rows have their own styling. */
export function highlightFor(m: ChatMessage): Highlight | null {
  if (m.kind !== "chat" && m.kind !== "action") return null;
  const p = prefs.value;
  if (flagged(p.ignoreHighlightUsers, m)) return null;

  for (const category of ORDER) {
    const setting = p.highlights[category];
    if (setting.enabled && matches(category, m)) {
      return { category, color: setting.color, label: LABELS[category] };
    }
  }

  if (p.patterns.length) {
    const text = plainText(m);
    for (const pat of p.patterns) {
      if (!pat.enabled || !pat.pattern) continue;
      const hit =
        pat.type === "regex" ? !!compiled(pat.pattern)?.test(text) : text.toLowerCase().includes(pat.pattern.toLowerCase());
      if (hit) return { category: "pattern", color: pat.color };
    }
  }
  return null;
}
