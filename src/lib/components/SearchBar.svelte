<script lang="ts">
  // Ctrl+F bar under the tabs. Typing filters the chat list to matching messages.
  import { History, Search, X } from "@lucide/svelte";
  import { search } from "../chat/search.svelte";

  let { count }: { count: number } = $props();

  let input: HTMLInputElement | undefined = $state();
  const inApp = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
  const q = $derived(search.query.trim().toLowerCase());
  const historyDone = $derived(!!q && search.historyFor === q);

  // Focus when opened (and again on Ctrl+F while already open).
  export function focus() {
    input?.focus();
    input?.select();
  }
  $effect(() => {
    if (search.open) focus();
  });
</script>

<div class="search" role="search">
  <Search size={14} />
  <input
    bind:this={input}
    bind:value={search.query}
    placeholder="Search chat (messages and names)"
    aria-label="Search chat"
    onkeydown={(e) => {
      if (e.key === "Escape") search.close();
      else if (e.key === "Enter" && inApp) void search.searchHistory();
    }}
  />
  {#if q}
    <span class="count">{count === 0 ? "No matches" : `${count} match${count === 1 ? "" : "es"}`}</span>
    {#if inApp}
      <button
        class="history"
        disabled={search.historyLoading || historyDone}
        title="Also search saved chat history (Enter)"
        onclick={() => void search.searchHistory()}
      >
        <History size={13} />
        {search.historyLoading ? "Searching…" : historyDone ? "History searched" : "Search history"}
      </button>
    {/if}
  {/if}
  <button class="close" aria-label="Close search (Esc)" title="Close search (Esc)" onclick={() => search.close()}><X size={15} /></button>
</div>

<style>
  .search {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 10px;
    border-bottom: 1px solid var(--border);
    color: var(--text-muted);
    flex-shrink: 0;
  }

  input {
    flex: 1;
    min-width: 0;
    background: none;
    border: none;
    outline: none;
    font-size: 13px;
    color: var(--text);
    user-select: text;
  }

  .count {
    font-size: 12px;
    white-space: nowrap;
  }

  .history {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 7px;
    border-radius: 5px;
    border: 1px solid var(--border);
    font-size: 11.5px;
    white-space: nowrap;
  }

  .history:hover:not(:disabled) {
    background: #2e2e2e;
    color: var(--text);
  }

  .history:disabled {
    opacity: 0.6;
    cursor: default;
  }

  .close {
    display: grid;
    place-items: center;
  }

  .close:hover {
    color: var(--text);
  }
</style>
