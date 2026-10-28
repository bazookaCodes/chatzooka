<script lang="ts">
  // Tab-bar viewer count (Settings → General → Viewer Count). Clicking it opens the list of who's
  // in chat, the same list as ☰ → Users.
  import { RefreshCw, Users } from "@lucide/svelte";
  import { viewers } from "../chat/viewers.svelte";
  import UsersList from "./UsersList.svelte";

  let open = $state(false);
  let filter = $state("");
  let root: HTMLElement | undefined = $state();

  const twitch = $derived(viewers.users?.filter((u) => u.platform === "twitch").length ?? 0);
  const youtube = $derived(viewers.users?.filter((u) => u.platform === "youtube").length ?? 0);

  function toggle() {
    open = !open;
    filter = "";
    if (open) void viewers.refresh();
  }

  function onWindowPointer(e: PointerEvent) {
    if (open && root && !root.contains(e.target as Node)) open = false;
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") open = false;
  }
</script>

<svelte:window onpointerdown={onWindowPointer} />

<div class="viewer-count" bind:this={root}>
  <button
    class="count"
    class:active={open}
    title={viewers.users ? `In chat: ${twitch} on Twitch, ${youtube} on YouTube. Click for the list.` : "Who's in chat"}
    aria-label="Who's in chat"
    aria-expanded={open}
    onclick={toggle}
  >
    <Users size={15} />
    <span>{viewers.count ?? "–"}</span>
  </button>

  {#if open}
    <div class="panel" role="dialog" aria-label="Who's in chat" tabindex="-1" onkeydown={onKeydown}>
      <header>
        <strong>In chat</strong>
        <button class="icon" title="Refresh" aria-label="Refresh" onclick={() => void viewers.refresh()}><RefreshCw size={14} /></button>
      </header>
      <!-- svelte-ignore a11y_autofocus -->
      <input class="filter" placeholder="Search…" bind:value={filter} autofocus />
      <div class="list">
        <UsersList {filter} onOpened={() => (open = false)} />
      </div>
    </div>
  {/if}
</div>

<style>
  .viewer-count {
    position: relative;
    display: flex;
    align-items: center;
  }

  .count {
    display: flex;
    align-items: center;
    gap: 5px;
    height: 24px;
    padding: 0 7px;
    border-radius: 6px;
    color: var(--text-muted);
    font-size: 12.5px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  .count:hover,
  .count.active {
    background: #2a2a2a;
    color: var(--text);
  }

  .panel {
    position: absolute;
    top: calc(100% + 8px);
    right: -40px;
    width: min(320px, calc(100vw - 20px));
    max-height: min(480px, 70vh);
    display: flex;
    flex-direction: column;
    padding: 4px;
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    border-radius: 10px;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
    z-index: 20;
  }

  header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px 4px;
    font-size: 13.5px;
  }

  header strong {
    flex: 1;
  }

  .icon {
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
    border-radius: 5px;
    color: var(--text-muted);
  }

  .icon:hover {
    background: #2e2e2e;
    color: var(--text);
  }

  .filter {
    margin: 4px 8px 6px;
    height: 30px;
    padding: 0 10px;
    background: var(--bg-input);
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--text);
    outline: none;
  }

  .list {
    overflow-y: auto;
    padding: 0 4px 6px;
  }
</style>
