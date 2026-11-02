<script lang="ts">
  // Allow / Deny for a message AutoMod held, or what happened to it.
  import { Check, X } from "@lucide/svelte";
  import { decideHeld, isDeciding } from "../chat/automod.svelte";
  import type { ChatMessage } from "../chat/types";

  let { message }: { message: ChatMessage } = $props();

  const held = $derived(message.automod);
  const busy = $derived(isDeciding(message));
  const by = $derived(held?.by ? ` by ${held.by}` : "");
</script>

{#if held}
  {#if held.status === "approved"}
    <span class="status allowed">Allowed{by}</span>
  {:else if held.status === "denied"}
    <span class="status denied">Denied{by}</span>
  {:else if held.status === "expired"}
    <span class="status other" title="Nobody allowed or denied it in time, so Twitch dropped it.">Expired</span>
  {:else}
    <span class="buttons">
      <button class="allow" disabled={busy} title="Let the message into chat" onclick={() => void decideHeld(message, true)}>
        <Check size={13} /> Allow
      </button>
      <button class="deny" disabled={busy} title="Keep the message out of chat" onclick={() => void decideHeld(message, false)}>
        <X size={13} /> Deny
      </button>
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

  .allow {
    background: #1f3a26;
    color: #8fe0a6;
  }

  .allow:hover:not(:disabled) {
    background: #275030;
  }

  .deny {
    background: #3a1f1f;
    color: #ff9b9b;
  }

  .deny:hover:not(:disabled) {
    background: #4d2626;
  }

  .status {
    margin-left: 8px;
    font-size: 11.5px;
    font-weight: 600;
  }

  .allowed {
    color: #6fd48a;
  }

  .denied {
    color: #ff8b8b;
  }

  .other {
    color: var(--text-faint);
    font-weight: 400;
    font-style: italic;
  }
</style>
