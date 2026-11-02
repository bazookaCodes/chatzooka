<script lang="ts">
  import { ChevronsDownUp, ChevronsUpDown, Gavel, MessagesSquare, Pin, PinOff, Settings, Sparkles } from "@lucide/svelte";
  import type { TabId } from "../chat/types";
  import ConnectionStatus from "./ConnectionStatus.svelte";
  import PlatformIcon from "./PlatformIcon.svelte";
  import ViewerCount from "./ViewerCount.svelte";
  import { prefs } from "../prefs.svelte";

  let {
    active = $bindable(),
    unread,
    onOpenSettings,
  }: { active: TabId; unread: Record<TabId, number>; onOpenSettings: () => void } = $props();

  const tabs: { id: TabId; label: string }[] = [
    { id: "all", label: "All chats" },
    { id: "twitch", label: "Twitch" },
    { id: "youtube", label: "YouTube" },
    { id: "events", label: "Events" },
    { id: "mod", label: "Mod actions" },
  ];
</script>

<header class="tabbar">
  <div class="tabs" role="tablist" aria-label="Chat views">
    {#each tabs as tab (tab.id)}
      <button
        role="tab"
        class="tab"
        class:active={active === tab.id}
        aria-selected={active === tab.id}
        aria-label={unread[tab.id] ? `${tab.label}, ${unread[tab.id]} unread` : tab.label}
        title={tab.label}
        onclick={() => (active = tab.id)}
      >
        {#if tab.id === "all"}
          <MessagesSquare size={20} />
        {:else if tab.id === "events"}
          <Sparkles size={20} />
        {:else if tab.id === "mod"}
          <Gavel size={19} />
        {:else}
          <PlatformIcon platform={tab.id} size={20} color="currentColor" />
        {/if}
        {#if active !== tab.id && unread[tab.id] > 0}
          <span class="unread" class:event={tab.id === "events"} class:mod={tab.id === "mod"}>{unread[tab.id] > 99 ? "99+" : unread[tab.id]}</span>
        {/if}
      </button>
    {/each}
  </div>

  <div class="right">
    {#if prefs.value.viewerCount}<ViewerCount />{/if}
    <ConnectionStatus />
    <button
      class="icon-btn compact-btn"
      aria-label={prefs.value.compact ? "Normal size" : "Compact mode"}
      title={prefs.value.compact ? "Normal size" : "Compact mode: tighter rows, for a small window"}
      onclick={() => prefs.set("compact", !prefs.value.compact)}
    >
      {#if prefs.value.compact}<ChevronsUpDown size={17} />{:else}<ChevronsDownUp size={17} />{/if}
    </button>
    <button
      class="icon-btn"
      class:on={prefs.value.alwaysOnTop}
      aria-label="Always on top"
      aria-pressed={prefs.value.alwaysOnTop}
      title={prefs.value.alwaysOnTop ? "Always on top (on): click to stop" : "Always on top: keep Chatzooka above other windows"}
      onclick={() => prefs.set("alwaysOnTop", !prefs.value.alwaysOnTop)}
    >
      {#if prefs.value.alwaysOnTop}<Pin size={17} />{:else}<PinOff size={17} />{/if}
    </button>
    <button class="icon-btn" aria-label="Settings" title="Settings" onclick={onOpenSettings}>
      <Settings size={18} />
    </button>
  </div>
</header>

<style>
  .tabbar {
    display: flex;
    align-items: stretch;
    justify-content: space-between;
    height: var(--tabbar-h);
    padding: 0 8px 0 4px;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }

  .tabs {
    display: flex;
    flex-shrink: 1;
    min-width: 140px;
  }

  .tab {
    position: relative;
    display: grid;
    place-items: center;
    width: var(--tab-w);
    min-width: 28px;
    flex-shrink: 1;
    color: var(--text-muted);
    border-bottom: 2px solid transparent;
    margin-bottom: -1px;
    transition: color 0.12s;
  }

  .tab:hover {
    color: var(--text);
  }

  .tab.active {
    color: var(--accent);
    border-bottom-color: var(--accent);
  }

  .unread {
    position: absolute;
    top: 4px;
    right: 2px;
    min-width: 16px;
    height: 16px;
    padding: 0 4px;
    border-radius: 8px;
    background: #3a3a3a;
    color: var(--text);
    font-size: 10px;
    font-weight: 700;
    line-height: 16px;
    text-align: center;
  }

  .unread.event {
    background: var(--twitch);
    color: #fff;
  }

  .unread.mod {
    background: #d64545;
    color: #fff;
  }

  .right {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .icon-btn {
    display: grid;
    place-items: center;
    color: var(--text-muted);
  }

  .icon-btn:hover,
  .icon-btn.on {
    color: var(--text);
  }

  /* Narrow window: tighter spacing, and compact mode stays reachable from Settings. */
  @media (max-width: 400px) {
    .right {
      gap: 5px;
    }

    .compact-btn {
      display: none;
    }
  }
</style>
