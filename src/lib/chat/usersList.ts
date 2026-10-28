// "Who's here" for the ☰ → Users list: everyone in your Twitch and YouTube chats right now, as far
// as each platform lets us know.
//  - Twitch: Streamer.bot's active viewers (with roles) plus everyone Twitch reports as connected
//    to chat on Chatzooka's read-only connection (lurkers included).
//  - YouTube: YouTube has no "who's watching" list, so: Streamer.bot's active viewers plus anyone
//    who chatted in the last 30 minutes.
import { streamerbot } from "../streamerbot/connection.svelte";
import { connectedLogins } from "../streamerbot/presence.svelte";
import { chat } from "./store.svelte";
import type { ChatAuthor, Platform } from "./types";

export type UserGroup = "broadcaster" | "moderator" | "vip" | "subscriber" | "viewer";

export interface ListedUser {
  platform: Platform;
  author: ChatAuthor;
  group: UserGroup;
}

const YOUTUBE_RECENT_MS = 30 * 60_000;

/* eslint-disable @typescript-eslint/no-explicit-any */

function groupOf(a: ChatAuthor): UserGroup {
  if (a.roles.broadcaster) return "broadcaster";
  if (a.roles.mod) return "moderator";
  if (a.roles.vip) return "vip";
  if (a.roles.sub || a.roles.member) return "subscriber";
  return "viewer";
}

/** Most recent chat identity per platform:login (keeps colors, IDs and roles). */
function knownAuthors(): Map<string, ChatAuthor> {
  const map = new Map<string, ChatAuthor>();
  for (const m of chat.messages) {
    if (m.kind === "presence" || m.kind === "modaction" || !m.author.id) continue;
    const key = `${m.platform}:${(m.author.login ?? m.author.displayName).toLowerCase()}`;
    map.set(key, m.author);
  }
  return map;
}

function plainAuthor(platform: Platform, id: string, login: string, name: string, role: string, subscribed: boolean): ChatAuthor {
  const r = role.toLowerCase();
  return {
    id,
    login,
    displayName: name,
    badges: [],
    roles: {
      broadcaster: r === "broadcaster",
      mod: r === "moderator" || r === "broadcaster",
      vip: r === "vip",
      sub: platform === "twitch" && subscribed,
      member: platform === "youtube" && subscribed,
    },
  };
}

export async function loadUsers(): Promise<ListedUser[]> {
  const known = knownAuthors();
  const out = new Map<string, ListedUser>();
  const add = (platform: Platform, author: ChatAuthor) => {
    const key = `${platform}:${(author.login ?? author.displayName).toLowerCase()}`;
    const sources = [known.get(key), out.get(key)?.author, author].filter((a): a is ChatAuthor => !!a);
    // Identity: the first source with a real ID (chat has color/badges); roles: any source's.
    const base = sources.find((a) => a.id) ?? author;
    const roles = { ...base.roles };
    for (const a of sources) for (const r of Object.keys(roles) as (keyof typeof roles)[]) roles[r] ||= a.roles[r];
    const merged = { ...base, roles };
    out.set(key, { platform, author: merged, group: groupOf(merged) });
  };

  // Streamer.bot's active viewers, both platforms, with roles.
  try {
    const res: any = await streamerbot.client?.getActiveViewers();
    for (const v of res?.viewers ?? []) {
      const platform: Platform | null = v.type === "youtube" ? "youtube" : v.type === "twitch" ? "twitch" : null;
      if (!platform) continue;
      const login = String(v.login ?? v.display ?? "").toLowerCase();
      if (!login) continue;
      add(platform, plainAuthor(platform, String(v.id ?? ""), login, String(v.display ?? login), String(v.role ?? ""), !!v.subscribed));
    }
  } catch (e) {
    console.warn("GetActiveViewers failed", e);
  }

  // Twitch: everyone connected to chat, from the read-only connection.
  for (const login of connectedLogins()) {
    if (!out.has(`twitch:${login}`)) add("twitch", known.get(`twitch:${login}`) ?? plainAuthor("twitch", "", login, login, "", false));
  }

  // YouTube: recent chatters.
  const since = Date.now() - YOUTUBE_RECENT_MS;
  for (const m of chat.messages) {
    if (m.platform === "youtube" && m.timestamp >= since && (m.kind === "chat" || m.kind === "action") && m.author.id) add("youtube", m.author);
  }

  return [...out.values()];
}
