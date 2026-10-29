<script lang="ts">
  import { emoteList, isChannelEmote, type PickerEmote } from "../chat/emoteList.svelte";
  import type { EmoteProvider, Platform } from "../chat/types";
  import { streamerbot } from "../streamerbot/connection.svelte";

  let {
    platforms,
    onPick,
    onClose,
  }: { platforms: Platform[]; onPick: (name: string) => void; onClose: () => void } = $props();

  let query = $state("");
  let search: HTMLInputElement | undefined = $state();

  // Your channel's own emotes (any provider) come first; each provider group below then has the
  // rest, mostly globals.
  const GROUPS: { id: string; label: string; match: (e: PickerEmote) => boolean }[] = [
    { id: "channel", label: "Your channel", match: isChannelEmote },
    ...(
      [
        ["twitch", "Twitch"],
        ["7tv", "7TV"],
        ["bttv", "BetterTTV"],
        ["ffz", "FrankerFaceZ"],
        ["youtube", "YouTube"],
      ] as [EmoteProvider, string][]
    ).map(([provider, label]) => ({ id: provider, label, match: (e: PickerEmote) => e.provider === provider && !isChannelEmote(e) })),
  ];
  /** Cap per group when not searching; YouTube alone has thousands. */
  const PER_GROUP = 120;

  const groups = $derived.by(() => {
    const q = query.trim().toLowerCase();
    const available = emoteList.forPlatforms(platforms);
    return GROUPS.map((g) => {
      let list = available.filter(g.match);
      if (q) list = list.filter((e) => e.name.toLowerCase().includes(q));
      return { ...g, total: list.length, emotes: list.slice(0, q ? 300 : PER_GROUP) };
    }).filter((g) => g.total > 0);
  });

  $effect(() => search?.focus());

  function pick(e: PickerEmote) {
    onPick(e.name);
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") onClose();
  }
</script>

<div class="picker" role="dialog" aria-label="Emote picker" tabindex="-1" onkeydown={onKeydown}>
  <input bind:this={search} bind:value={query} placeholder="Search emotes…" aria-label="Search emotes" />
  <div class="groups">
    {#if streamerbot.status !== "connected"}
      <p class="notice">
        Streamer.bot isn't connected, so Twitch and YouTube emotes aren't listed. 7TV, BetterTTV and FrankerFaceZ emotes
        still work.
      </p>
    {/if}
    {#if groups.length === 0}
      <p class="empty">{query.trim() ? "No emotes match." : "Loading emotes…"}</p>
    {/if}
    {#each groups as group (group.id)}
      <section>
        <h4>{group.label} <span>{group.total}</span></h4>
        <div class="grid">
          {#each group.emotes as emote (emote.name)}
            <button class="emote" title={emote.name} onclick={() => pick(emote)}>
              <img src={emote.url} alt={emote.name} loading="lazy" />
            </button>
          {/each}
        </div>
        {#if group.total > group.emotes.length}
          <p class="more">Search to see all {group.total}</p>
        {/if}
      </section>
    {/each}
  </div>
</div>

<style>
  .picker {
    position: absolute;
    right: 10px;
    bottom: 54px;
    width: min(360px, calc(100vw - 20px));
    max-height: min(420px, 60vh);
    display: flex;
    flex-direction: column;
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    border-radius: 10px;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
    z-index: 10;
  }

  input {
    margin: 10px;
    height: 32px;
    padding: 0 10px;
    background: var(--bg-input);
    border: 1px solid var(--border);
    border-radius: 6px;
    outline: none;
  }

  .groups {
    overflow-y: auto;
    padding: 0 10px 10px;
  }

  h4 {
    margin: 8px 0 6px;
    font-size: 12px;
    color: var(--text-muted);
    font-weight: 600;
  }

  h4 span {
    color: var(--text-faint);
    font-weight: 400;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(40px, 1fr));
    gap: 2px;
  }

  .emote {
    display: grid;
    place-items: center;
    height: 40px;
    border-radius: 6px;
  }

  .emote:hover {
    background: #333;
  }

  .emote img {
    max-width: 32px;
    max-height: 32px;
  }

  .notice {
    margin: 0 0 6px;
    padding: 6px 8px;
    border-radius: 6px;
    background: #2a2416;
    border: 1px solid #4a3f22;
    color: #e6cf8f;
    font-size: 12px;
    line-height: 1.4;
  }

  .more,
  .empty {
    margin: 6px 0 0;
    font-size: 12px;
    color: var(--text-faint);
  }
</style>
