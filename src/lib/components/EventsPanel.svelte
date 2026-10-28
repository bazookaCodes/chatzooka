<script lang="ts">
  // Events tab: the event feed, the channel point redemption queue, and your rewards.
  import { Check, ChevronDown, ChevronRight, RefreshCw, Undo2 } from "@lucide/svelte";
  import { redemptions, type Reward } from "../chat/redemptions.svelte";
  import type { ChatMessage } from "../chat/types";
  import { recentRedemptions } from "../db/history";
  import { loadSetting, saveSetting } from "../settings";
  import ChatView from "./ChatView.svelte";
  import MessageRow from "./MessageRow.svelte";

  let { messages }: { messages: ChatMessage[] } = $props();

  type View = "feed" | "queue" | "rewards";
  let view = $state<View>(loadSetting("eventsView", "feed"));
  $effect(() => saveSetting("eventsView", view));

  const queue = $derived(redemptions.queue);

  /** Queue grouped by reward, so a reward's redemptions can be handled in bulk. */
  const groups = $derived.by(() => {
    const map = new Map<string, { title: string; rewardId: string; items: ChatMessage[] }>();
    for (const m of queue) {
      const r = m.redemption!;
      const g = map.get(r.rewardId) ?? { title: r.title, rewardId: r.rewardId, items: [] };
      g.items.push(m);
      map.set(r.rewardId, g);
    }
    return [...map.values()];
  });

  let openReward = $state<string | null>(null);
  let rewardHistory = $state.raw<ChatMessage[]>([]);

  async function toggleReward(reward: Reward) {
    if (openReward === reward.id) {
      openReward = null;
      return;
    }
    openReward = reward.id;
    rewardHistory = redemptions.forReward(reward.id);
    // Older ones from the database (the last 30 days), merged with this session's.
    const saved = await recentRedemptions(30, reward.id);
    if (openReward !== reward.id) return;
    const byId = new Map<string, ChatMessage>();
    for (const m of [...saved, ...redemptions.forReward(reward.id)]) byId.set(m.id, m);
    rewardHistory = [...byId.values()].sort((a, b) => b.timestamp - a.timestamp);
  }

  function waited(ts: number): string {
    const mins = Math.floor((Date.now() - ts) / 60_000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    return hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`;
  }

  // Re-render "waiting" times every 30s.
  let now = $state(Date.now());
  $effect(() => {
    const t = setInterval(() => (now = Date.now()), 30_000);
    return () => clearInterval(t);
  });
</script>

<div class="panel">
  <div class="switcher" role="tablist" aria-label="Events views">
    <button role="tab" aria-selected={view === "feed"} class:active={view === "feed"} onclick={() => (view = "feed")}>Feed</button>
    <button role="tab" aria-selected={view === "queue"} class:active={view === "queue"} onclick={() => (view = "queue")}>
      Queue {#if queue.length}<span class="count">{queue.length}</span>{/if}
    </button>
    <button role="tab" aria-selected={view === "rewards"} class:active={view === "rewards"} onclick={() => (view = "rewards")}>Rewards</button>
  </div>

  {#if view === "feed"}
    <ChatView {messages} tab="events" />
  {:else if view === "queue"}
    <div class="scroll">
      {#if groups.length === 0}
        <p class="empty">No redemptions waiting. Unfulfilled channel point redemptions show up here, oldest first.</p>
      {/if}
      {#each groups as group (group.rewardId)}
        <section>
          <header>
            <h3>{group.title} <span>{group.items.length}</span></h3>
            {#if redemptions.canManage(group.rewardId) && group.items.length > 1}
              <button class="bulk fulfill" onclick={() => void redemptions.resolveAll(group.rewardId, "fulfilled")}>
                <Check size={13} /> Fulfill all
              </button>
              <button class="bulk refund" onclick={() => void redemptions.resolveAll(group.rewardId, "canceled")}>
                <Undo2 size={13} /> Refund all
              </button>
            {/if}
          </header>
          {#each group.items as message, i (message.id)}
            <div class="queued">
              <MessageRow {message} alt={i % 2 === 1} />
              <span class="waited">{void now, waited(message.timestamp)}</span>
            </div>
          {/each}
        </section>
      {/each}
    </div>
  {:else}
    <div class="scroll">
      <div class="rewards-head">
        <span>{redemptions.rewards ? `${redemptions.rewards.length} rewards` : ""}</span>
        <button class="refresh" title="Reload rewards" onclick={() => void redemptions.refresh()}><RefreshCw size={13} /> Refresh</button>
      </div>
      {#if !redemptions.rewards}
        <p class="empty">
          {redemptions.rewardsError ?? "Loading rewards…"}
          {#if redemptions.rewardsError?.includes("Update")}
            <br /><small>Paste the latest <code>streamerbot/ChatzookaBridge.cs</code> into the Chatzooka Bridge action in Streamer.bot, compile, then click Refresh.</small>
          {/if}
        </p>
      {:else}
        {#each redemptions.rewards as reward (reward.id)}
          <button class="reward" onclick={() => void toggleReward(reward)} aria-expanded={openReward === reward.id}>
            {#if openReward === reward.id}<ChevronDown size={14} />{:else}<ChevronRight size={14} />{/if}
            <span class="swatch" style:background={reward.backgroundColor || "#555"}></span>
            <span class="title">{reward.title}</span>
            <span class="cost">{reward.cost.toLocaleString()}</span>
            {#if !reward.enabled}<span class="tag">Disabled</span>{:else if reward.paused}<span class="tag">Paused</span>{/if}
            {#if reward.isOurs}<span class="tag ours" title="Created in Streamer.bot: Fulfill/Refund work">Manageable</span>{/if}
          </button>
          {#if openReward === reward.id}
            <div class="history">
              {#if reward.prompt}<p class="prompt">{reward.prompt}</p>{/if}
              {#if rewardHistory.length === 0}
                <p class="empty small">No redemptions in the last 30 days.</p>
              {/if}
              {#each rewardHistory as message, i (message.id)}
                <MessageRow {message} alt={i % 2 === 1} />
              {/each}
            </div>
          {/if}
        {/each}
      {/if}
    </div>
  {/if}
</div>

<style>
  .panel {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  .switcher {
    display: flex;
    gap: 4px;
    padding: 6px 10px;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }

  .switcher button {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 12px;
    border-radius: 6px;
    font-size: 13px;
    color: var(--text-muted);
  }

  .switcher button:hover {
    color: var(--text);
  }

  .switcher button.active {
    background: #2c2c2c;
    color: var(--text);
  }

  .count {
    min-width: 18px;
    padding: 0 5px;
    border-radius: 9px;
    background: var(--twitch);
    color: #fff;
    font-size: 11px;
    font-weight: 700;
    line-height: 18px;
    text-align: center;
  }

  .scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
  }

  .empty {
    color: var(--text-muted);
    text-align: center;
    padding: 0 24px;
    margin-top: 30%;
  }

  .empty.small {
    margin: 8px 0;
    font-size: 12.5px;
  }

  section header {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 10px 14px 6px 28px;
  }

  h3 {
    flex: 1;
    margin: 0;
    font-size: 13px;
  }

  h3 span {
    color: var(--text-muted);
    font-weight: 400;
  }

  .bulk {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 600;
  }

  .bulk.fulfill {
    background: #1f3a26;
    color: #8fe0a6;
  }

  .bulk.refund {
    background: #3a2a1f;
    color: #f0c08f;
  }

  .queued {
    position: relative;
  }

  /* Leave room for the "waiting" label so it never overlaps the reward name. */
  .queued > :global(.row) {
    padding-right: 76px;
  }

  .waited {
    position: absolute;
    right: 14px;
    top: 8px;
    font-size: 11.5px;
    color: var(--text-muted);
    pointer-events: none;
  }

  .rewards-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 14px;
    font-size: 12.5px;
    color: var(--text-muted);
  }

  .refresh {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: var(--text-muted);
  }

  .refresh:hover {
    color: var(--text);
  }

  .reward {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 8px 14px;
    text-align: left;
    border-top: 1px solid #262626;
  }

  .reward:hover {
    background: var(--bg-row-hover);
  }

  .swatch {
    width: 10px;
    height: 10px;
    border-radius: 3px;
    flex-shrink: 0;
  }

  .title {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .cost {
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
  }

  .tag {
    padding: 1px 6px;
    border-radius: 4px;
    font-size: 11px;
    background: #2e2e2e;
    color: var(--text-muted);
  }

  .tag.ours {
    background: #1f3a26;
    color: #8fe0a6;
  }

  .history {
    padding: 0 0 8px;
    background: #191919;
  }

  .prompt {
    margin: 0;
    padding: 6px 14px 6px 50px;
    font-size: 12.5px;
    color: var(--text-muted);
    font-style: italic;
  }
</style>
