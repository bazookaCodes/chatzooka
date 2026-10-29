// 7TV, BetterTTV and FrankerFaceZ emotes, loaded by Chatzooka itself (global sets plus your
// Twitch channel's) so they show in Twitch and YouTube chat and in the emote picker whether or
// not Streamer.bot is running. Words in a message that match an emote name become emotes; words
// Streamer.bot already turned into an emote are left alone. All three APIs are public and need
// no login. Your Twitch channel ID comes from Streamer.bot and is remembered, so your channel's
// emotes load even when Streamer.bot is off.
import { prefs } from "../prefs.svelte";
import { loadSetting, saveSetting } from "../settings";
import { streamerbot } from "../streamerbot/connection.svelte";
import type { EmoteProvider, Fragment } from "./types";

export interface ThirdPartyEmote {
  name: string;
  url: string;
  provider: Extract<EmoteProvider, "7tv" | "bttv" | "ffz">;
  zeroWidth: boolean;
  global: boolean;
}

/* eslint-disable @typescript-eslint/no-explicit-any */

async function getJson(url: string): Promise<any | null> {
  const res = await fetch(url);
  // 404 = this channel has no account on that site, which just means no channel emotes.
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(url).host}`);
  return res.json();
}

function sevenTvEmote(e: any, global: boolean): ThirdPartyEmote {
  return {
    name: e.name,
    url: `https://cdn.7tv.app/emote/${e.id}/2x.webp`,
    provider: "7tv",
    // Zero-width: set on this copy of the emote (flag 1) or on the emote itself (flag 256).
    zeroWidth: (Number(e.flags) & 1) !== 0 || (Number(e.data?.flags) & 256) !== 0,
    global,
  };
}

async function load7tv(twitchId: string | undefined): Promise<ThirdPartyEmote[]> {
  const g = await getJson("https://7tv.io/v3/emote-sets/global");
  const global = ((g?.emotes ?? []) as any[]).filter((e) => e?.id && e?.name).map((e) => sevenTvEmote(e, true));
  if (!twitchId) return global;
  const user = await getJson(`https://7tv.io/v3/users/twitch/${twitchId}`);
  const own = ((user?.emote_set?.emotes ?? []) as any[]).filter((e) => e?.id && e?.name).map((e) => sevenTvEmote(e, false));
  return [...own, ...global];
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

  /**
   * Load now with the Twitch channel remembered from last time (or globals only), and reload if
   * Streamer.bot reports a different channel.
   */
  start(): void {
    $effect.root(() => {
      $effect(() => {
        const live = streamerbot.accounts.twitch?.id;
        if (live) saveSetting("twitch.channelId", live);
        void this.load(live ?? loadSetting<string | undefined>("twitch.channelId", undefined));
      });
    });
  }

  /** Load (or reload) all three providers for your Twitch channel; safe to call repeatedly. */
  async load(twitchId: string | undefined): Promise<void> {
    const key = twitchId ?? "";
    if (this.#loadedFor === key) return;
    this.#loadedFor = key;
    const names = ["7TV", "BetterTTV", "FrankerFaceZ"];
    const results = await Promise.allSettled([load7tv(twitchId), loadBttv(twitchId), loadFfz(twitchId)]);
    const all: ThirdPartyEmote[] = [];
    for (const [i, r] of results.entries()) {
      if (r.status === "fulfilled") all.push(...r.value);
      else console.warn(`Couldn't load ${names[i]} emotes`, r.reason);
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
    if (e.provider === "bttv") return p.bttvEmotes ? e : undefined;
    if (e.provider === "ffz") return p.ffzEmotes ? e : undefined;
    return e;
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
