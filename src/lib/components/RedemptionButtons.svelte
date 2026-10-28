<script lang="ts">
  // Fulfill / Refund buttons for an unfulfilled redemption, or its final status.
  import { Check, Undo2 } from "@lucide/svelte";
  import { redemptions } from "../chat/redemptions.svelte";
  import type { ChatMessage } from "../chat/types";

  let { message }: { message: ChatMessage } = $props();

  const r = $derived(message.redemption);
  const manageable = $derived(r ? redemptions.canManage(r.rewardId) : false);
  const busy = $derived(r ? redemptions.isBusy(r.redemptionId) : false);
</script>

{#if r}
  {#if r.status === "fulfilled"}
    <span class="status done">Fulfilled</span>
  {:else if r.status === "canceled"}
    <span class="status refunded">Refunded</span>
  {:else if redemptions.rewardDeleted(r.rewardId)}
    <span class="status other" title="This reward was deleted, so Twitch no longer lists its redemptions.">Reward deleted</span>
  {:else if manageable}
    <span class="buttons">
      <button class="fulfill" disabled={busy} title="Mark as done" onclick={() => void redemptions.fulfill(message)}>
        <Check size={13} /> Fulfill
      </button>
      <button class="refund" disabled={busy} title="Give the points back" onclick={() => void redemptions.refund(message)}>
        <Undo2 size={13} /> Refund
      </button>
    </span>
  {:else}
    <span class="status other" title="Twitch only lets the app that created a reward fulfill or refund it. Recreate this reward in Streamer.bot to manage it here.">
      Not managed by Streamer.bot
    </span>
  {/if}
{/if}

<style>
  .buttons {
    display: inline-flex;
    gap: 4px;
    margin-left: 8px;
    vertical-align: 1px;
  }

  button {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    padding: 1px 7px;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 600;
    line-height: 18px;
  }

  button:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .fulfill {
    background: #1f3a26;
    color: #8fe0a6;
  }

  .fulfill:hover:not(:disabled) {
    background: #275030;
  }

  .refund {
    background: #3a2a1f;
    color: #f0c08f;
  }

  .refund:hover:not(:disabled) {
    background: #4d3726;
  }

  .status {
    margin-left: 8px;
    font-size: 11.5px;
    font-weight: 600;
  }

  .done {
    color: #6fd48a;
  }

  .refunded {
    color: #f0c08f;
  }

  .other {
    color: var(--text-faint);
    font-weight: 400;
    font-style: italic;
  }
</style>
