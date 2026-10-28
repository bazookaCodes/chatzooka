<script lang="ts">
  // Quick moderation icons shown when hovering a chat row.
  import { Ban, Clock, Trash2 } from "@lucide/svelte";
  import { banUser, capabilities, deleteMessage, timeoutUser } from "../chat/moderation";
  import type { ChatMessage } from "../chat/types";

  let { message }: { message: ChatMessage } = $props();

  const can = $derived(capabilities(message));
  /** Ban needs a second click within a few seconds. */
  let confirmBan = $state(false);
  let confirmTimer: ReturnType<typeof setTimeout> | null = null;

  function onBan() {
    if (!confirmBan) {
      confirmBan = true;
      if (confirmTimer) clearTimeout(confirmTimer);
      confirmTimer = setTimeout(() => (confirmBan = false), 3000);
      return;
    }
    confirmBan = false;
    void banUser(message);
  }
</script>

<div class="mod-actions">
  {#if can.delete}
    <button title="Delete message" aria-label="Delete message" onclick={() => void deleteMessage(message)}>
      <Trash2 size={14} />
    </button>
  {/if}
  <button title="Timeout 10 minutes" aria-label="Timeout 10 minutes" onclick={() => void timeoutUser(message, 600)}>
    <Clock size={14} />
  </button>
  <button
    class="ban"
    class:confirm={confirmBan}
    title={confirmBan ? "Click again to ban" : "Ban"}
    aria-label={confirmBan ? "Click again to ban" : "Ban"}
    onclick={onBan}
  >
    <Ban size={14} />{#if confirmBan}<span>Ban?</span>{/if}
  </button>
</div>

<style>
  .mod-actions {
    position: absolute;
    top: 4px;
    right: 8px;
    display: none;
    gap: 2px;
    padding: 2px;
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    border-radius: 6px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
  }

  :global(.row:hover) > .mod-actions,
  .mod-actions:has(.confirm) {
    display: flex;
  }

  button {
    display: flex;
    align-items: center;
    gap: 4px;
    height: 24px;
    min-width: 24px;
    padding: 0 5px;
    justify-content: center;
    border-radius: 4px;
    color: var(--text-muted);
  }

  button:hover {
    background: #333;
    color: var(--text);
  }

  .ban:hover,
  .ban.confirm {
    color: #ff6b6b;
  }

  .ban.confirm {
    background: #3a1f1f;
    font-size: 11.5px;
    font-weight: 700;
  }
</style>
