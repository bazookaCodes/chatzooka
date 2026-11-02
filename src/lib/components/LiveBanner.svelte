<script lang="ts">
  // Banner under the tabs while a poll, prediction or hype train is running (and for a minute
  // after, with the result). Twitch polls and predictions can be ended / locked / resolved /
  // canceled from here through the bridge.
  import { ChevronDown, ChevronUp, TrainFront, Trophy, Vote, X } from "@lucide/svelte";
  import { countdown, liveEvents, type Outcome, type Prediction } from "../stream/liveEvents.svelte";
  import PlatformIcon from "./PlatformIcon.svelte";

  let collapsed = $state(false);
  /** Outcome id waiting for a second click to confirm it as the winner. */
  let confirmWinner = $state<string | null>(null);
  let confirmCancel = $state(false);
  let busy = $state(false);

  const now = $derived(liveEvents.now);
  const pct = (n: number, total: number) => (total ? Math.round((n / total) * 100) : 0);
  const OUTCOME_COLORS = ["#387aff", "#f5009b", "#f5a623", "#5cc98a", "#a970ff", "#ff7043", "#4fc3f7", "#e0e0e0", "#ffca28", "#8c8c8c"];

  function outcomeColor(o: Outcome, i: number): string {
    if (o.color === "blue") return "#387aff";
    if (o.color === "pink") return "#f5009b";
    return OUTCOME_COLORS[i % OUTCOME_COLORS.length];
  }

  async function act(fn: () => Promise<boolean>) {
    if (busy) return;
    busy = true;
    await fn();
    busy = false;
    confirmWinner = null;
    confirmCancel = false;
  }

  function pickWinner(p: Prediction, o: Outcome) {
    if (confirmWinner !== o.id) {
      confirmWinner = o.id;
      setTimeout(() => confirmWinner === o.id && (confirmWinner = null), 4000);
      return;
    }
    void act(() => liveEvents.resolvePrediction(p, o));
  }
</script>

{#if liveEvents.active}
  <div class="banner" class:collapsed>
    <button class="collapse" aria-label={collapsed ? "Expand" : "Collapse"} title={collapsed ? "Show details" : "Hide details"} onclick={() => (collapsed = !collapsed)}>
      {#if collapsed}<ChevronDown size={14} />{:else}<ChevronUp size={14} />{/if}
    </button>

    {#each liveEvents.polls as poll (poll.platform + poll.id)}
      {@const total = poll.choices.reduce((s, c) => s + c.votes, 0)}
      {@const top = Math.max(0, ...poll.choices.map((c) => c.votes))}
      <section>
        <header>
          <Vote size={14} />
          <PlatformIcon platform={poll.platform} size={12} />
          <strong class="title">{poll.title}</strong>
          <span class="meta">
            {#if poll.ended}Ended · {total.toLocaleString()} votes{:else if poll.endsAt}{countdown(poll.endsAt - now)} left{/if}
          </span>
          {#if !poll.ended && poll.platform === "twitch"}
            <button class="btn" disabled={busy} title="End the poll now" onclick={() => void act(() => liveEvents.endPoll(poll))}>End</button>
          {/if}
          {#if poll.ended}<button class="x" aria-label="Close" onclick={() => liveEvents.dismiss(poll)}><X size={13} /></button>{/if}
        </header>
        {#if !collapsed}
          {#each poll.choices as c, i (i)}
            <div class="option" class:win={poll.ended && c.votes === top && top > 0}>
              <div class="fill" style:width="{pct(c.votes, total)}%"></div>
              <span class="label">{c.title}</span>
              <span class="num">{pct(c.votes, total)}% · {c.votes.toLocaleString()}</span>
            </div>
          {/each}
        {/if}
      </section>
    {/each}

    {#if liveEvents.prediction}
      {@const p = liveEvents.prediction}
      {@const totalPoints = p.outcomes.reduce((s, o) => s + o.points, 0)}
      {@const open = p.status === "active" || p.status === "locked"}
      <section>
        <header>
          <Trophy size={14} />
          <PlatformIcon platform="twitch" size={12} />
          <strong class="title">{p.title}</strong>
          <span class="meta">
            {#if p.status === "active"}{p.locksAt ? `Locks in ${countdown(p.locksAt - now)}` : "Open"}{:else if p.status === "locked"}Locked: pick the winner{:else if p.status === "resolved"}Resolved{:else}Canceled, refunded{/if}
          </span>
          {#if p.status === "active"}
            <button class="btn" disabled={busy} title="Stop new predictions" onclick={() => void act(() => liveEvents.lockPrediction(p))}>Lock</button>
          {/if}
          {#if open}
            <button
              class="btn danger"
              class:confirm={confirmCancel}
              disabled={busy}
              title="Cancel and give everyone their points back"
              onclick={() => (confirmCancel ? void act(() => liveEvents.cancelPrediction(p)) : (confirmCancel = true))}
            >{confirmCancel ? "Refund all?" : "Cancel"}</button>
          {:else}
            <button class="x" aria-label="Close" onclick={() => liveEvents.dismiss("prediction")}><X size={13} /></button>
          {/if}
        </header>
        {#if !collapsed}
          {#each p.outcomes as o, i (o.id)}
            <div class="option" class:win={p.winningId === o.id} style:--fill={outcomeColor(o, i)}>
              <div class="fill" style:width="{pct(o.points, totalPoints)}%"></div>
              <span class="label">{o.title}</span>
              <span class="num">{pct(o.points, totalPoints)}% · {o.points.toLocaleString()} pts · {o.users.toLocaleString()}</span>
              {#if open}
                <button class="btn small" class:confirm={confirmWinner === o.id} disabled={busy} title="Pay out to people who picked this" onclick={() => pickWinner(p, o)}>
                  {confirmWinner === o.id ? "Confirm?" : "Winner"}
                </button>
              {/if}
            </div>
          {/each}
        {/if}
      </section>
    {/if}

    {#if liveEvents.hypeTrain}
      {@const h = liveEvents.hypeTrain}
      <section>
        <header>
          <TrainFront size={14} />
          <PlatformIcon platform="twitch" size={12} />
          <strong class="title">Hype Train · Level {h.level}</strong>
          <span class="meta">{#if h.ended}Ended{:else if h.expiresAt}{countdown(h.expiresAt - now)} left{/if}</span>
          {#if h.ended}<button class="x" aria-label="Close" onclick={() => liveEvents.dismiss("hype")}><X size={13} /></button>{/if}
        </header>
        {#if !collapsed && h.progress !== undefined && !h.ended}
          <div class="option hype">
            <div class="fill" style:width="{Math.round(Math.min(1, h.progress) * 100)}%"></div>
            <span class="label">To level {h.level + 1}</span>
            <span class="num">{Math.round(Math.min(1, h.progress) * 100)}%</span>
          </div>
        {/if}
      </section>
    {/if}
  </div>
{/if}

<style>
  .banner {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 7px 34px 8px 10px;
    border-bottom: 1px solid var(--border);
    background: #1f1d24;
    flex-shrink: 0;
    max-height: 45vh;
    overflow-y: auto;
    font-size: 12.5px;
  }

  .banner.collapsed {
    gap: 4px;
    padding-top: 5px;
    padding-bottom: 5px;
  }

  .collapse {
    position: absolute;
    top: 6px;
    right: 8px;
    display: grid;
    place-items: center;
    width: 20px;
    height: 20px;
    border-radius: 4px;
    color: var(--text-muted);
  }

  .collapse:hover,
  .x:hover {
    background: #333;
    color: var(--text);
  }

  header {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    color: var(--text-muted);
  }

  .title {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    color: var(--text);
    font-weight: 600;
  }

  .meta {
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
    font-size: 11.5px;
  }

  .option {
    position: relative;
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 4px;
    padding: 3px 8px;
    border-radius: 5px;
    background: #2a2830;
    overflow: hidden;
    --fill: #a970ff;
  }

  .option.hype {
    --fill: #e05bd0;
  }

  .fill {
    position: absolute;
    inset: 0 auto 0 0;
    background: color-mix(in srgb, var(--fill) 35%, transparent);
    transition: width 0.4s ease;
  }

  .option.win {
    box-shadow: inset 0 0 0 1px var(--fill);
  }

  .label,
  .num,
  .option .btn {
    position: relative;
  }

  .label {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .win .label {
    font-weight: 700;
  }

  .num {
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
    color: var(--text-muted);
    font-size: 11.5px;
  }

  .btn {
    padding: 1px 8px;
    border-radius: 4px;
    border: 1px solid #3a3a3a;
    font-size: 11.5px;
    font-weight: 600;
    line-height: 18px;
    color: var(--text);
    white-space: nowrap;
  }

  .btn.small {
    padding: 0 6px;
    line-height: 16px;
    font-size: 11px;
  }

  .btn:hover:not(:disabled) {
    background: #333;
  }

  .btn.danger {
    color: #ff9b9b;
  }

  .btn.confirm {
    background: #3a1f1f;
    border-color: #5a2b2b;
    color: #ffb4b4;
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .x {
    display: grid;
    place-items: center;
    width: 20px;
    height: 20px;
    border-radius: 4px;
  }
</style>
