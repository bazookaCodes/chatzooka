<script lang="ts">
  import { Plug, Unplug } from "@lucide/svelte";
  import { streamerbot } from "../streamerbot/connection.svelte";

  const label = $derived(
    streamerbot.status === "connected"
      ? `Streamer.bot connected (${streamerbot.address})`
      : streamerbot.status === "connecting"
        ? `Connecting to Streamer.bot (${streamerbot.address})…`
        : streamerbot.status === "authFailed"
          ? `${streamerbot.error} Click to retry.`
        : `Streamer.bot not running or WebSocket server off (${streamerbot.address}). Click to retry.`,
  );
</script>

<button
  class="status {streamerbot.status}"
  title={label}
  aria-label={label}
  onclick={() => streamerbot.retryNow()}
>
  {#if streamerbot.status === "connected"}
    <Plug size={15} />
  {:else}
    <Unplug size={15} />
  {/if}
  <span class="text">SB</span>
  <span class="dot"></span>
</button>

<style>
  .status {
    display: flex;
    align-items: center;
    gap: 5px;
    height: 24px;
    padding: 0 8px;
    border-radius: 12px;
    border: 1px solid var(--border);
    font-size: 12px;
    font-weight: 600;
    color: var(--text-muted);
  }

  .status:hover {
    color: var(--text);
  }

  .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
  }

  .connected .dot {
    background: #2ecc71;
  }

  .connecting .dot {
    background: #f1c40f;
    animation: pulse 1s ease-in-out infinite;
  }

  .disconnected,
  .authFailed {
    color: #e57373;
    border-color: #5a2b2b;
  }

  .disconnected .dot,
  .authFailed .dot {
    background: #e74c3c;
  }

  @keyframes pulse {
    50% {
      opacity: 0.3;
    }
  }
</style>
