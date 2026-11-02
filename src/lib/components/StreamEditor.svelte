<script lang="ts">
  // Change the stream title (Twitch or YouTube) and the Twitch category, through the bridge.
  import { X } from "@lucide/svelte";
  import { untrack } from "svelte";
  import type { Platform } from "../chat/types";
  import { streamInfo, type Category } from "../stream/streamInfo.svelte";
  import { bridge } from "../streamerbot/bridge.svelte";
  import { toasts } from "../toasts.svelte";
  import PlatformIcon from "./PlatformIcon.svelte";

  let { platform, onClose }: { platform: Platform; onClose: () => void } = $props();

  const name = $derived(platform === "twitch" ? "Twitch" : "YouTube");
  const current = $derived(streamInfo[platform]);
  // Start from what's live now; edits after opening shouldn't be overwritten by updates.
  let title = $state(untrack(() => streamInfo[platform].title ?? ""));
  let category = $state(streamInfo.twitch.category ?? "");
  let results = $state<Category[]>([]);
  let searching = $state(false);
  let saving = $state(false);
  const supported = $derived(bridge.supports(5));
  const maxTitle = $derived(platform === "twitch" ? 140 : 100);

  let timer: ReturnType<typeof setTimeout> | null = null;
  let searchedFor = "";
  function searchSoon() {
    if (timer) clearTimeout(timer);
    const q = category.trim();
    if (!q || q === streamInfo.twitch.category) {
      results = [];
      return;
    }
    timer = setTimeout(async () => {
      searchedFor = q;
      searching = true;
      const found = await streamInfo.searchCategories(q);
      if (searchedFor === q) results = found;
      searching = false;
    }, 300);
  }

  function pick(c: Category) {
    category = c.name;
    results = [];
  }

  async function save() {
    if (saving || !supported) return;
    saving = true;
    const errors: string[] = [];
    const t = title.trim();
    if (t && t !== (current.title ?? "")) {
      const err = await streamInfo.setTitle(platform, t);
      if (err) errors.push(`Title: ${err}`);
    }
    const c = category.trim();
    if (platform === "twitch" && c && c !== (streamInfo.twitch.category ?? "")) {
      const err = await streamInfo.setCategory(c);
      if (err) errors.push(`Category: ${err}`);
    }
    saving = false;
    if (errors.length) toasts.show(errors.join(" · "), "error");
    else {
      toasts.show(`${name} stream info updated`);
      onClose();
    }
  }
</script>

<svelte:window onkeydown={(e) => e.key === "Escape" && onClose()} />

<div class="backdrop" role="presentation" onclick={onClose}></div>
<form class="editor" onsubmit={(e) => { e.preventDefault(); void save(); }}>
  <header>
    <PlatformIcon {platform} size={15} />
    <h3>{name} stream</h3>
    <button type="button" class="close" aria-label="Close" onclick={onClose}><X size={15} /></button>
  </header>

  {#if !supported}
    <p class="note">Changing the title{platform === "twitch" ? " and category" : ""} needs Chatzooka Bridge v5. Update it in Streamer.bot (see Settings → Streamer.bot).</p>
  {/if}

  <label>
    <span>Title <em>{title.length}/{maxTitle}</em></span>
    <!-- svelte-ignore a11y_autofocus -->
    <input bind:value={title} maxlength={maxTitle} disabled={!supported} autofocus />
  </label>

  {#if platform === "twitch"}
    <label>
      <span>Category {#if searching}<em>searching…</em>{/if}</span>
      <input bind:value={category} oninput={searchSoon} disabled={!supported} placeholder="Search Twitch categories" autocomplete="off" />
    </label>
    {#if results.length}
      <ul class="results" role="listbox" aria-label="Categories">
        {#each results as c (c.id)}
          <li>
            <button type="button" role="option" aria-selected={c.name === category} onclick={() => pick(c)}>
              {#if c.boxArt}<img src={c.boxArt} alt="" />{/if}<span>{c.name}</span>
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  {/if}

  <footer>
    <button type="button" class="btn" onclick={onClose}>Cancel</button>
    <button type="submit" class="btn primary" disabled={!supported || saving}>{saving ? "Saving…" : "Save"}</button>
  </footer>
</form>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 30;
    background: rgba(0, 0, 0, 0.35);
  }

  .editor {
    position: fixed;
    z-index: 31;
    top: 60px;
    left: 50%;
    translate: -50% 0;
    width: min(420px, calc(100vw - 24px));
    max-height: calc(100vh - 80px);
    overflow-y: auto;
    padding: 12px 14px;
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    border-radius: 10px;
    box-shadow: 0 12px 34px rgba(0, 0, 0, 0.6);
    font-size: 13px;
  }

  header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 10px;
  }

  h3 {
    flex: 1;
    margin: 0;
    font-size: 14px;
  }

  .close {
    display: grid;
    place-items: center;
    color: var(--text-muted);
  }

  .close:hover {
    color: var(--text);
  }

  .note {
    margin: 0 0 10px;
    padding: 7px 9px;
    border-radius: 6px;
    background: #2a2417;
    color: #e8c98a;
    font-size: 12px;
  }

  label {
    display: block;
    margin-bottom: 10px;
  }

  label span {
    display: flex;
    justify-content: space-between;
    margin-bottom: 4px;
    color: var(--text-muted);
    font-size: 12px;
  }

  em {
    font-style: normal;
    color: var(--text-faint);
  }

  input {
    width: 100%;
    padding: 6px 9px;
    border-radius: 6px;
    border: 1px solid var(--border);
    background: var(--bg-input);
    outline: none;
    user-select: text;
  }

  input:focus {
    border-color: #555;
  }

  .results {
    list-style: none;
    margin: -6px 0 10px;
    padding: 4px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg);
  }

  .results button {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 4px 6px;
    border-radius: 4px;
    text-align: left;
  }

  .results button:hover {
    background: #2e2e2e;
  }

  .results img {
    width: 26px;
    height: 36px;
    border-radius: 3px;
    object-fit: cover;
  }

  footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }

  .btn {
    padding: 5px 12px;
    border-radius: 6px;
    border: 1px solid var(--border);
  }

  .btn:hover:not(:disabled) {
    background: #2e2e2e;
  }

  .btn.primary {
    background: #3a3a3a;
    font-weight: 600;
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: default;
  }
</style>
