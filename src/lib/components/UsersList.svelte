<script lang="ts">
  // Everyone in chat, by platform and role. Used by ☰ → Users and the viewer count's panel.
  import type { Platform } from "../chat/types";
  import { userCard } from "../chat/userCard.svelte";
  import type { ListedUser, UserGroup } from "../chat/usersList";
  import { viewers } from "../chat/viewers.svelte";
  import PaintedName from "./PaintedName.svelte";
  import PlatformIcon from "./PlatformIcon.svelte";

  let { filter, onOpened }: { filter: string; onOpened: () => void } = $props();

  const GROUPS: { id: UserGroup; label: string }[] = [
    { id: "broadcaster", label: "Broadcaster" },
    { id: "moderator", label: "Moderators" },
    { id: "vip", label: "VIPs" },
    { id: "subscriber", label: "Subscribers & members" },
    { id: "viewer", label: "Viewers" },
  ];
  const PLATFORMS: { id: Platform; label: string }[] = [
    { id: "twitch", label: "Twitch" },
    { id: "youtube", label: "YouTube" },
  ];
  const shownUsers = $derived(
    (viewers.users ?? [])
      .filter((u) => !filter || u.author.displayName.toLowerCase().includes(filter.toLowerCase()))
      .sort((a, b) => a.author.displayName.localeCompare(b.author.displayName, undefined, { sensitivity: "base" })),
  );

  function openUser(u: ListedUser) {
    if (!u.author.id) return;
    userCard.open(u.platform, u.author);
    onOpened();
  }
</script>

{#if !viewers.users}
  <p class="empty">Loading who's here…</p>
{:else}
  {#each PLATFORMS as plat (plat.id)}
    {@const inPlat = shownUsers.filter((u) => u.platform === plat.id)}
    <div class="platform-head"><PlatformIcon platform={plat.id} size={14} /> {plat.label} <span>{inPlat.length}</span></div>
    {#if inPlat.length === 0}
      <p class="none">{plat.id === "youtube" ? "Nobody has chatted on YouTube in the last 30 minutes." : "Nobody listed yet."}</p>
    {/if}
    {#each GROUPS as g (g.id)}
      {@const inGroup = inPlat.filter((u) => u.group === g.id)}
      {#if inGroup.length}
        <div class="group">{g.label} <span>{inGroup.length}</span></div>
        {#each inGroup as u (u.platform + (u.author.login ?? u.author.displayName))}
          <button class="user" disabled={!u.author.id} title={u.author.id ? "Open user card" : "No details until they chat"} onclick={() => openUser(u)}>
            <PaintedName author={u.author} platform={u.platform} />
          </button>
        {/each}
      {/if}
    {/each}
  {/each}
  <p class="note">
    Twitch: everyone connected to chat, including lurkers (Twitch stops listing them in very big chats). YouTube: people
    who chatted recently, since YouTube doesn't share who's watching.{#if viewers.hiddenBots}
      {viewers.hiddenBots === 1 ? "1 bot is" : `${viewers.hiddenBots} bots are`} hidden (Settings → General → Hide Bots).{/if}{#if viewers.loading} Refreshing…{/if}
  </p>
{/if}

<style>
  .platform-head {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 10px 4px 2px;
    font-size: 13px;
    font-weight: 700;
  }

  .platform-head span,
  .group span {
    color: var(--text-faint);
    font-weight: 400;
  }

  .group {
    margin: 6px 4px 2px;
    font-size: 11.5px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--text-faint);
  }

  .user {
    display: block;
    width: 100%;
    padding: 3px 8px;
    border-radius: 5px;
    text-align: left;
    font-size: 13px;
  }

  .user:hover:not(:disabled) {
    background: #2e2e2e;
  }

  .user:disabled {
    cursor: default;
  }

  .empty,
  .none,
  .note {
    margin: 6px 6px;
    font-size: 12.5px;
    color: var(--text-muted);
  }

  .note {
    margin-top: 12px;
    font-size: 11.5px;
    color: var(--text-faint);
  }
</style>
