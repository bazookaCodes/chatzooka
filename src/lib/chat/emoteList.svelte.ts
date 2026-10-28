// Emotes you can type, per platform, for autocomplete and the emote picker. Loaded from
// Streamer.bot (TwitchGetEmotes / YouTubeGetEmotes) each time it connects.
import type { StreamerbotClient } from "@streamerbot/client";
import { emoteUrl } from "../streamerbot/normalize";
import { thirdPartyEmotes } from "./thirdPartyEmotes.svelte";
import type { EmoteProvider, Platform } from "./types";

export interface PickerEmote {
  name: string;
  url: string;
  provider: EmoteProvider;
  platforms: Platform[];
  /** A global emote rather than one from your channel. */
  global: boolean;
}

/* eslint-disable @typescript-eslint/no-explicit-any */

function providerOf(type: string, platform: Platform): EmoteProvider {
  const t = type.toLowerCase();
  if (t.includes("7tv")) return "7tv";
  if (t.includes("bttv")) return "bttv";
  if (t.includes("ffz")) return "ffz";
  return platform;
}

class EmoteList {
  emotes = $state.raw<PickerEmote[]>([]);

  async load(client: StreamerbotClient): Promise<void> {
    const byKey = new Map<string, PickerEmote>();
    for (const platform of ["twitch", "youtube"] as const) {
      try {
        const res: any = await client.getEmotes(platform);
        if (res.status !== "ok") continue;
        for (const list of Object.values(res.emotes ?? {}) as any[][]) {
          for (const e of list ?? []) {
            if (!e?.name || !e?.imageUrl) continue;
            const provider = providerOf(String(e.type ?? ""), platform);
            const key = `${provider}:${e.name}`;
            const existing = byKey.get(key);
            if (existing) {
              if (!existing.platforms.includes(platform)) existing.platforms.push(platform);
            } else {
              byKey.set(key, {
                name: e.name,
                url: emoteUrl(e.imageUrl, provider),
                provider,
                platforms: [platform],
                global: /global/i.test(String(e.type ?? "")),
              });
            }
          }
        }
      } catch (err) {
        console.warn(`Couldn't load ${platform} emotes from Streamer.bot`, err);
      }
    }
    // Your channel's own emotes first, globals after.
    this.emotes = [...byKey.values()].sort((a, b) => Number(a.global) - Number(b.global));
  }

  /**
   * Emotes usable on at least one of the given platforms, plus BetterTTV/FrankerFaceZ ones
   * Chatzooka loads itself (they're just words, so they show on both platforms in Chatzooka).
   */
  forPlatforms(platforms: Platform[]): PickerEmote[] {
    const own = this.emotes.filter((e) => e.platforms.some((p) => platforms.includes(p)));
    const known = new Set(own.map((e) => `${e.provider}:${e.name}`));
    const extra = thirdPartyEmotes.list
      .filter((e) => !known.has(`${e.provider}:${e.name}`) && thirdPartyEmotes.find(e.name) === e)
      .map((e) => ({ name: e.name, url: e.url, provider: e.provider, platforms: ["twitch", "youtube"] as Platform[], global: e.global }));
    return [...own, ...extra].sort((a, b) => Number(a.global) - Number(b.global));
  }
}

export const emoteList = new EmoteList();
