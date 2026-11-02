// Ignore list (Settings → Ignore): chat from ignored users, or containing ignored words, is hidden
// or collapsed on this computer only. Nothing is sent to Twitch or YouTube. Events, mod-log rows
// and your own messages are never ignored.
import { prefs, type FlaggedUser } from "../prefs.svelte";
import { plainText } from "./plainText";
import type { ChatMessage } from "./types";

export function userKey(m: ChatMessage): FlaggedUser {
  return { platform: m.platform, name: (m.author.login ?? m.author.displayName).toLowerCase(), addedAt: Date.now() };
}

function listed(list: FlaggedUser[], m: ChatMessage): boolean {
  const login = (m.author.login ?? m.author.displayName).toLowerCase();
  const name = m.author.displayName.toLowerCase();
  return list.some((u) => u.platform === m.platform && (u.name === login || u.name === name));
}

export function isIgnoredUser(m: ChatMessage): boolean {
  return listed(prefs.value.ignoredUsers, m);
}

export function toggleIgnoredUser(m: ChatMessage): boolean {
  const list = prefs.value.ignoredUsers;
  if (isIgnoredUser(m)) {
    const login = (m.author.login ?? m.author.displayName).toLowerCase();
    const name = m.author.displayName.toLowerCase();
    prefs.set("ignoredUsers", list.filter((u) => !(u.platform === m.platform && (u.name === login || u.name === name))));
    return false;
  }
  prefs.set("ignoredUsers", [...list, userKey(m)]);
  return true;
}

// Whole words or phrases, any case: "gg" hides "GG wp" but not "eggs".
let wordsKey = "";
let wordsRegex: RegExp | null = null;
function ignoredWordsRegex(): RegExp | null {
  const words = prefs.value.ignoredWords.map((w) => w.trim()).filter(Boolean);
  const key = words.join("\n");
  if (key !== wordsKey) {
    wordsKey = key;
    const escaped = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    wordsRegex = escaped.length ? new RegExp(`(?<![\\p{L}\\p{N}_])(?:${escaped.join("|")})(?![\\p{L}\\p{N}_])`, "iu") : null;
  }
  return wordsRegex;
}

export function isIgnored(m: ChatMessage): boolean {
  if (m.kind !== "chat" && m.kind !== "action") return false;
  if (m.author.roles.broadcaster) return false;
  if (isIgnoredUser(m)) return true;
  const words = ignoredWordsRegex();
  return !!words && words.test(plainText(m));
}
