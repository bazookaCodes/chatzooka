<script lang="ts">
  // "A new version is available" bar under the tabs, shown when the updater finds one.
  import { updater } from "../updater.svelte";
</script>

{#if (updater.status === "available" && !updater.dismissed) || updater.status === "downloading"}
  <div class="banner" role="status">
    {#if updater.status === "downloading"}
      <span>
        Downloading Chatzooka {updater.latest}…{#if updater.progress !== null}
          {Math.round(updater.progress * 100)}%{/if} It will restart when done.
      </span>
    {:else}
      <span>Chatzooka <strong>{updater.latest}</strong> is available.</span>
      <button class="primary" onclick={() => void updater.install()}>Update &amp; restart</button>
      <button onclick={() => (updater.dismissed = true)}>Later</button>
    {/if}
  </div>
{/if}

<style>
  .banner {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 12px;
    background: #172433;
    border-bottom: 1px solid #2b4a6b;
    color: #b8d4f0;
    font-size: 13px;
    line-height: 18px;
    flex-shrink: 0;
  }

  span {
    flex: 1;
  }

  button {
    padding: 4px 10px;
    border: 1px solid #2b4a6b;
    border-radius: 4px;
    white-space: nowrap;
    color: var(--text);
  }

  button:hover {
    background: #1f3247;
  }

  button.primary {
    background: #2b5a8a;
    border-color: #2b5a8a;
  }

  button.primary:hover {
    background: #336aa3;
  }
</style>
