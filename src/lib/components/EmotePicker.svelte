<script lang="ts">
  import { emoteList, type PickerEmote } from "../chat/emoteList.svelte";
  import type { EmoteProvider, Platform } from "../chat/types";

  let {
    platforms,
    onPick,
    onClose,
  }: { platforms: Platform[]; onPick: (name: string) => void; onClose: () => void } = $props();

  let query = $state("");
  let search: HTMLInputElement | undefined = $state();

  const GROUPS: { provider: EmoteProvider; label: string }[] = [
    { provider: "twitch", label: "Twitch" },
    { provider: "7tv", label: "7TV" },
    { provider: "bttv", label: "BetterTTV" },
    { provider: "ffz", label: "FrankerFaceZ" },
    { provider: "youtube", label: "YouTube" },
  ];
  /** Cap per group when not searching; YouTube alone has thousands. */
  const PER_GROUP = 120;

  const groups = $derived.by(() => {
    const q = query.trim().toLowerCase();
    const available = emoteList.forPlatforms(platforms);
    return GROUPS.map((g) => {
      let list = available.filter((e) => e.provider === g.provider);
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
    {#if groups.length === 0}
      <p class="empty">{emoteList.emotes.length ? "No emotes match." : "Emotes load once Streamer.bot is connected."}</p>
    {/if}
    {#each groups as group (group.provider)}
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

  .more,
  .empty {
    margin: 6px 0 0;
    font-size: 12px;
    color: var(--text-faint);
  }
</style>
