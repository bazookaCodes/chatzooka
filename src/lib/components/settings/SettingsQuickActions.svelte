<script lang="ts">
  import { RefreshCw } from "@lucide/svelte";
  import { prefs } from "../../prefs.svelte";
  import { quickActions, type SbAction } from "../../quickActions.svelte";
  import Toggle from "./Toggle.svelte";

  let filter = $state("");

  const groups = $derived.by(() => {
    const q = filter.trim().toLowerCase();
    const map = new Map<string, SbAction[]>();
    for (const a of quickActions.all) {
      if (q && !a.name.toLowerCase().includes(q)) continue;
      const g = a.group || "No group";
      map.set(g, [...(map.get(g) ?? []), a]);
    }
    return [...map.entries()];
  });
</script>

<h2>User Quick Actions</h2>
<p class="sub">
  Streamer.bot actions shown as buttons on user cards. They run with that user filled in, using the same
  <code>user</code> / <code>userName</code> / <code>targetUser</code> arguments Streamer.bot's own chat and command triggers
  use, so an existing shoutout action works as is.
</p>

<div class="card">
  <div class="top">
    <input class="text" placeholder="Search actions…" bind:value={filter} />
    <button class="btn" onclick={() => void quickActions.load()}><RefreshCw size={13} /> Refresh</button>
  </div>
  {#if !quickActions.loaded}
    <p class="empty">Actions load once Streamer.bot is connected.</p>
  {:else if groups.length === 0}
    <p class="empty">No actions match.</p>
  {:else}
    <table>
      <tbody>
        {#each groups as [group, list] (group)}
          <tr><td colspan="2" class="group">{group}</td></tr>
          {#each list as action (action.id)}
            <tr>
              <td>
                {action.name}
                {#if !action.enabled}<span class="desc"> (disabled in Streamer.bot)</span>{/if}
              </td>
              <td class="toggle">
                <Toggle
                  label={`Show "${action.name}" on user cards`}
                  checked={prefs.value.quickActions.includes(action.id)}
                  onchange={() => quickActions.toggle(action.id)}
                />
              </td>
            </tr>
          {/each}
        {/each}
      </tbody>
    </table>
  {/if}
</div>

<style>
  .top {
    display: flex;
    gap: 8px;
    margin: 8px 0;
  }

  .top input {
    flex: 1;
  }

  .group {
    padding-top: 12px;
    font-size: 11.5px;
    font-weight: 700;
    color: var(--text-faint);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .toggle {
    width: 50px;
    text-align: right;
  }
</style>
