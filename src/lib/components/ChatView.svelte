<script lang="ts">
  import { ArrowDown, CornerDownRight, Pause } from "@lucide/svelte";
  import { tick } from "svelte";
  import type { ChatMessage, TabId } from "../chat/types";
  import MessageRow from "./MessageRow.svelte";
  import { prefs } from "../prefs.svelte";
  import { search } from "../chat/search.svelte";

  let {
    messages,
    tab,
    context,
  }: {
    messages: ChatMessage[];
    tab: TabId;
    /** While searching: the full, unfiltered list, for "Show in chat". */
    context?: ChatMessage[];
  } = $props();

  const inContext = $derived(context ? new Set(context.map((m) => m.id)) : null);

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

  // Switching tabs, or changing the search, starts live at the newest message.
  let jumping = false;
  $effect(() => {
    void tab;
    void search.query;
    void search.historyFor;
    if (jumping) jumping = false;
    else frozen = null;
  });

  /** Close the search and scroll to a message in the full chat, paused there. */
  async function showInChat(id: string) {
    if (!context) return;
    frozen = context;
    jumping = true;
    search.close();
    await tick();
    const row = scroller?.querySelector<HTMLElement>(`[data-id="${CSS.escape(id)}"]`);
    if (!row) return;
    row.scrollIntoView({ block: "center" });
    row.animate([{ boxShadow: "inset 3px 0 0 var(--text)", background: "#3a3a3a" }, { boxShadow: "inset 3px 0 0 transparent" }], {
      duration: 1800,
      easing: "ease-out",
    });
  }

  // Stay pinned to the bottom as messages arrive, unless paused.
  $effect(() => {
    void shown;
    if (frozen) return;
    void tick().then(() => scroller?.scrollTo({ top: scroller.scrollHeight }));
  });

  // Also stay pinned while the window resizes (rows rewrap and change height) and when emotes or
  // images finish loading. ResizeObserver runs after layout and before paint, so it never shows
  // a frame that's off the bottom.
  let rows: HTMLDivElement | undefined = $state();
  $effect(() => {
    if (!scroller) return;
    const el = scroller;
    const observer = new ResizeObserver(() => {
      if (!frozen) el.scrollTop = el.scrollHeight;
    });
    observer.observe(el);
    if (rows) observer.observe(rows);
    return () => observer.disconnect();
  });
</script>

<div class="wrap">
  <div class="chat" bind:this={scroller} onscroll={onScroll} role="log" aria-live="polite">
    {#if shown.length === 0}
      <p class="empty">{context ? "No messages match your search." : emptyText[tab]}</p>
    {:else}
      <div class="rows" bind:this={rows}>
        <!-- Shade by arrival order, not list position: when old messages drop off the top,
             position-based shading would flip every row and redraw the whole list. -->
        {#each shown as message, i (message.id)}
          {#if inContext}
            <div class="result">
              <MessageRow {message} alt={Math.abs(message.seq ?? 0) % 2 === 1} showPlatform={prefs.value.platformIcons !== "all-tab" || tab === "all"} />
              {#if inContext.has(message.id)}
                <button class="jump" title="Show in chat" aria-label="Show in chat" onclick={() => void showInChat(message.id)}><CornerDownRight size={13} /></button>
              {:else}
                <span class="older" title="From saved history (older than the chat on screen)">saved</span>
              {/if}
            </div>
          {:else}
            <MessageRow {message} alt={Math.abs(message.seq ?? 0) % 2 === 1} showPlatform={prefs.value.platformIcons !== "all-tab" || tab === "all"} />
          {/if}
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

  .result {
    position: relative;
  }

  /* Sits in the row's empty left margin. */
  .jump,
  .older {
    position: absolute;
    left: 6px;
    top: 50%;
    translate: 0 -50%;
    color: var(--text-faint);
  }

  .jump {
    display: grid;
    place-items: center;
    width: 18px;
    height: 18px;
    border-radius: 4px;
  }

  .jump:hover {
    background: #333;
    color: var(--text);
  }

  .older {
    left: 2px;
    font-size: 8.5px;
    text-transform: uppercase;
    letter-spacing: 0.03em;
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
