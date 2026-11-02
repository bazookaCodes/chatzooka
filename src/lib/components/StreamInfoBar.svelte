<script lang="ts">
  // Slim bar under the tabs: per platform, live status + uptime, stream viewers, title and
  // category. Click to change the title (both) or category (Twitch).
  import { Eye } from "@lucide/svelte";
  import type { Platform } from "../chat/types";
  import { streamInfo, uptimeLabel } from "../stream/streamInfo.svelte";
  import { streamerbot } from "../streamerbot/connection.svelte";
  import PlatformIcon from "./PlatformIcon.svelte";
  import StreamEditor from "./StreamEditor.svelte";

  const platforms = $derived((["twitch", "youtube"] as const).filter((p) => streamerbot.accounts[p]));
  let editing = $state<Platform | null>(null);
</script>

{#if platforms.length}
  <div class="bar">
    {#each platforms as platform (platform)}
      {@const s = streamInfo[platform]}
      <button class="stream" title="Click to change the {platform === 'twitch' ? 'title or category' : 'title'}" onclick={() => (editing = platform)}>
        <PlatformIcon {platform} size={13} />
        {#if s.live}
          <span class="live">LIVE</span>
          {#if s.startedAt}<span class="stat" title="Uptime">{uptimeLabel(s.startedAt, streamInfo.now)}</span>{/if}
          {#if s.viewers !== undefined}<span class="stat" title="Watching the stream"><Eye size={12} />{s.viewers.toLocaleString()}</span>{/if}
        {:else if s.live === false}
          <span class="off">Offline</span>
        {/if}
        <span class="title">{s.title || "No title"}</span>
        {#if platform === "twitch" && s.category}<span class="category">{s.category}</span>{/if}
      </button>
    {/each}
  </div>
{/if}

{#if editing}
  <StreamEditor platform={editing} onClose={() => (editing = null)} />
{/if}

<style>
  .bar {
    display: flex;
    flex-wrap: wrap;
    gap: 2px 14px;
    padding: 4px 10px;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
    font-size: 11.5px;
    color: var(--text-muted);
  }

  .stream {
    flex: 1 1 200px;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 2px 4px;
    margin: 0 -4px;
    border-radius: 4px;
    text-align: left;
  }

  .stream:hover {
    background: #262626;
    color: var(--text);
  }

  .live {
    padding: 0 4px;
    border-radius: 3px;
    background: #d63a3a;
    color: #fff;
    font-size: 9.5px;
    font-weight: 800;
    letter-spacing: 0.04em;
    line-height: 15px;
  }

  .off {
    color: var(--text-faint);
  }

  .stat {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .title {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    color: var(--text);
  }

  .category {
    max-width: 40%;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    color: var(--text-muted);
  }
</style>
