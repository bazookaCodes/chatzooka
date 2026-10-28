<script lang="ts">
  import { ArrowDown, Pause } from "@lucide/svelte";
  import { tick } from "svelte";
  import type { ChatMessage, TabId } from "../chat/types";
  import MessageRow from "./MessageRow.svelte";
  import { prefs } from "../prefs.svelte";

  let { messages, tab }: { messages: ChatMessage[]; tab: TabId } = $props();

  const emptyText: Record<TabId, string> = {
    all: "No messages yet. Chat from Twitch and YouTube will show up here.",
    twitch: "No Twitch messages yet.",
    youtube: "No YouTube messages yet.",
    events: "No events yet. Redemptions, subs, raids and super chats will show up here.",
    mod: "No mod actions yet. Timeouts, bans, unbans and deleted messages, by anyone, will show up here.",
  };

  let scroller: HTMLDivElement | undefined = $state();

  /**
   * While scrolled up, the list is frozen at what was on screen when you paused, so new
   * messages (and old ones dropping off the top) don't shift what you're reading.
   */
  let frozen = $state.raw<ChatMessage[] | null>(null);
  const shown = $derived(frozen ?? messages);
  const pausedAtSeq = $derived(frozen?.at(-1)?.seq ?? 0);
  const newCount = $derived(frozen ? messages.filter((m) => (m.seq ?? 0) > pausedAtSeq).length : 0);

  function onScroll() {
    if (!scroller) return;
    const atBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 40;
    if (atBottom && frozen) frozen = null;
    else if (!atBottom && !frozen) frozen = messages;
  }

  function resume() {
    frozen = null;
    void tick().then(() => scroller?.scrollTo({ top: scroller.scrollHeight }));
  }

  // Switching tabs always starts live at the newest message.
  $effect(() => {
    void tab;
    frozen = null;
  });

  // Stay pinned to the bottom as messages arrive, unless paused.
  $effect(() => {
    void shown;
    if (frozen) return;
    void tick().then(() => scroller?.scrollTo({ top: scroller.scrollHeight }));
  });
</script>

<div class="wrap">
  <div class="chat" bind:this={scroller} onscroll={onScroll} role="log" aria-live="polite">
    {#if shown.length === 0}
      <p class="empty">{emptyText[tab]}</p>
    {:else}
      <div class="rows">
        <!-- Shade by arrival order, not list position: when old messages drop off the top,
             position-based shading would flip every row and redraw the whole list. -->
        {#each shown as message, i (message.id)}
          <MessageRow {message} alt={Math.abs(message.seq ?? 0) % 2 === 1} showPlatform={prefs.value.platformIcons !== "all-tab" || tab === "all"} />
          <!-- Line between chat restored from history and messages from this session. -->
          {#if message.restored && !shown[i + 1]?.restored}
            <div class="since-open" role="separator"><span>Chatzooka opened · new messages below</span></div>
          {/if}
        {/each}
      </div>
    {/if}
  </div>

  {#if frozen}
    <button class="paused" onclick={resume} title="Jump to newest messages">
      <Pause size={13} />
      <span>Paused</span>
      <span class="count">{newCount === 0 ? "0 new messages" : `${newCount} new message${newCount === 1 ? "" : "s"}`}</span>
      <ArrowDown size={13} />
    </button>
  {/if}
</div>

<style>
  .wrap {
    position: relative;
    flex: 1;
    min-height: 0;
    display: flex;
  }

  .chat {
    flex: 1;
    overflow-y: auto;
    min-height: 0;
  }

  .rows {
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    min-height: 100%;
  }

  .since-open {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 14px;
    font-size: 11.5px;
    color: var(--text-muted);
  }

  .since-open::before,
  .since-open::after {
    content: "";
    flex: 1;
    height: 1px;
    background: #3a3a3a;
  }

  .empty {
    color: var(--text-muted);
    text-align: center;
    padding: 0 24px;
    margin-top: 40%;
  }

  .paused {
    position: absolute;
    right: 14px;
    bottom: 8px;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 10px;
    border-radius: 6px;
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.45);
    font-size: 12.5px;
    color: var(--text);
  }

  .paused:hover {
    background: #2e2e2e;
  }

  .count {
    color: var(--text-muted);
  }
</style>
