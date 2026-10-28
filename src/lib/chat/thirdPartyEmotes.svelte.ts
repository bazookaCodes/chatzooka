// BetterTTV and FrankerFaceZ emotes, loaded by Chatzooka itself (global sets plus your Twitch
// channel's) so they show in Twitch and YouTube chat whether or not Streamer.bot parses them.
// Words in a message that match an emote name become emotes; words Streamer.bot already turned
// into an emote are left alone. Both APIs are public and need no login.
import { prefs } from "../prefs.svelte";
import { streamerbot } from "../streamerbot/connection.svelte";
import type { EmoteProvider, Fragment } from "./types";

export interface ThirdPartyEmote {
  name: string;
  url: string;
  provider: Extract<EmoteProvider, "bttv" | "ffz">;
  zeroWidth: boolean;
  global: boolean;
}

/* eslint-disable @typescript-eslint/no-explicit-any */

async function getJson(url: string): Promise<any | null> {
  const res = await fetch(url);
  // 404 = this channel has no BTTV/FFZ account, which just means no channel emotes.
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(url).host}`);
  return res.json();
}

function bttvEmote(e: any, global: boolean): ThirdPartyEmote {
  return {
    name: e.code,
    url: `https://cdn.betterttv.net/emote/${e.id}/2x.webp`,
    provider: "bttv",
    zeroWidth: !!e.modifier,
    global,
  };
}

async function loadBttv(twitchId: string | undefined): Promise<ThirdPartyEmote[]> {
  const global = ((await getJson("https://api.betterttv.net/3/cached/emotes/global")) ?? []).map((e: any) => bttvEmote(e, true));
  if (!twitchId) return global;
  const channel = await getJson(`https://api.betterttv.net/3/cached/users/twitch/${twitchId}`);
  const own = [...(channel?.channelEmotes ?? []), ...(channel?.sharedEmotes ?? [])].map((e: any) => bttvEmote(e, false));
  return [...own, ...global];
}

function ffzSetEmotes(sets: Record<string, any> | undefined, ids: (string | number)[], global: boolean): ThirdPartyEmote[] {
  const out: ThirdPartyEmote[] = [];
  for (const id of ids) {
    for (const e of sets?.[String(id)]?.emoticons ?? []) {
      const still = e.urls?.["2"] ?? e.urls?.["1"];
      if (!e.name || !still) continue;
      out.push({
        name: e.name,
        url: e.animated?.["2"] ?? e.animated?.["1"] ?? still,
        provider: "ffz",
        zeroWidth: !!e.modifier,
        global,
      });
    }
  }
  return out;
}

async function loadFfz(twitchId: string | undefined): Promise<ThirdPartyEmote[]> {
  const g = await getJson("https://api.frankerfacez.com/v1/set/global");
  const global = ffzSetEmotes(g?.sets, g?.default_sets ?? [], true);
  if (!twitchId) return global;
  const room = await getJson(`https://api.frankerfacez.com/v1/room/id/${twitchId}`);
  const own = room?.room?.set !== undefined ? ffzSetEmotes(room.sets, [room.room.set], false) : [];
  return [...own, ...global];
}

class ThirdPartyEmotes {
  /** Every loaded emote, your channel's first. */
  list = $state.raw<ThirdPartyEmote[]>([]);
  #byName = new Map<string, ThirdPartyEmote>();
  #loadedFor: string | null = null;

  /** Load the global sets now, and your channel's once Streamer.bot says which Twitch account is yours. */
  start(): void {
    $effect.root(() => {
      $effect(() => {
        void this.load(streamerbot.accounts.twitch?.id);
      });
    });
  }

  /** Load (or reload) both providers for your Twitch channel; safe to call repeatedly. */
  async load(twitchId: string | undefined): Promise<void> {
    const key = twitchId ?? "";
    if (this.#loadedFor === key) return;
    this.#loadedFor = key;
    const results = await Promise.allSettled([loadBttv(twitchId), loadFfz(twitchId)]);
    const all: ThirdPartyEmote[] = [];
    for (const [i, r] of results.entries()) {
      if (r.status === "fulfilled") all.push(...r.value);
      else console.warn(`Couldn't load ${i === 0 ? "BetterTTV" : "FrankerFaceZ"} emotes`, r.reason);
    }
    const byName = new Map<string, ThirdPartyEmote>();
    // Channel emotes come first in each list, so they win over a global with the same name.
    for (const e of all) if (!byName.has(e.name)) byName.set(e.name, e);
    this.#byName = byName;
    this.list = all;
  }

  /** The emote a word stands for, if that provider is switched on. */
  find(word: string): ThirdPartyEmote | undefined {
    const e = this.#byName.get(word);
    if (!e) return undefined;
    const p = prefs.value;
    return (e.provider === "bttv" ? p.bttvEmotes : p.ffzEmotes) ? e : undefined;
  }

  /** Turn matching words in a message's text into emotes. */
  apply(fragments: Fragment[]): Fragment[] {
    if (this.#byName.size === 0) return fragments;
    let changed = false;
    const out: Fragment[] = [];
    for (const f of fragments) {
      if (f.type !== "text") {
        out.push(f);
        continue;
      }
      let buffer = "";
      for (const token of f.text.split(/(\s+)/)) {
        const e = token && !/^\s/.test(token) ? this.find(token) : undefined;
        if (!e) {
          buffer += token;
          continue;
        }
        changed = true;
        if (buffer) out.push({ type: "text", text: buffer });
        buffer = "";
        out.push({ type: "emote", name: e.name, url: e.url, provider: e.provider, zeroWidth: e.zeroWidth });
      }
      if (buffer) out.push({ type: "text", text: buffer });
    }
    return changed ? out : fragments;
  }
}

export const thirdPartyEmotes = new ThirdPartyEmotes();
