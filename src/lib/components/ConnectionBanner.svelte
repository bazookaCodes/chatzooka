<script lang="ts">
  import { streamerbot } from "../streamerbot/connection.svelte";

  let { onOpenSettings }: { onOpenSettings: () => void } = $props();
</script>

{#if streamerbot.status === "disconnected"}
  <div class="banner" role="alert">
    <span>
      Can't reach Streamer.bot at <strong>{streamerbot.address}</strong>. Make sure it's running and its WebSocket
      server is on. Retrying automatically.
    </span>
    <button onclick={() => streamerbot.retryNow()}>Retry now</button>
  </div>
{:else if streamerbot.status === "authFailed"}
  <div class="banner" role="alert">
    <span>{streamerbot.error} Check the password in Settings.</span>
    <button onclick={onOpenSettings}>Settings</button>
  </div>
{/if}

<style>
  .banner {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 12px;
    background: #2a1717;
    border-bottom: 1px solid #5a2b2b;
    color: #f0b4b4;
    font-size: 13px;
    line-height: 18px;
    flex-shrink: 0;
  }

  span {
    flex: 1;
  }

  button {
    padding: 4px 10px;
    border: 1px solid #5a2b2b;
    border-radius: 4px;
    white-space: nowrap;
    color: var(--text);
  }

  button:hover {
    background: #3a1f1f;
  }
</style>
