<script lang="ts">
  // The ☰ menu next to the message box, like Streamer.bot's: Slash Commands, Commands, Users.
  // (Emotes have their own button on the right of the message box.)
  import { ArrowLeft, AtSign, MessageSquareWarning, RefreshCw, Slash } from "@lucide/svelte";
  import { SLASH_COMMANDS } from "../chat/slashCommands";
  import { viewers } from "../chat/viewers.svelte";
  import { bridge } from "../streamerbot/bridge.svelte";
  import { streamerbot } from "../streamerbot/connection.svelte";
  import PlatformIcon from "./PlatformIcon.svelte";
  import UsersList from "./UsersList.svelte";

  let { onInsert, onClose }: { onInsert: (text: string) => void; onClose: () => void } = $props();

  type View = "menu" | "slash" | "commands" | "users";
  let view = $state<View>("menu");
  let filter = $state("");

  function go(v: View) {
    view = v;
    filter = "";
    if (v === "commands") void loadCommands();
    if (v === "users") void refreshUsers();
  }

  // --- Slash commands ---
  const slash = $derived(
    SLASH_COMMANDS.filter((c) => !filter || c.name.includes(filter.toLowerCase().replace(/^\//, "")) || c.description.toLowerCase().includes(filter.toLowerCase())),
  );

  // --- Streamer.bot commands ---
  interface SbCommand {
    id: string;
    name: string;
    group: string;
    triggers: string[];
  }
  let commands = $state<SbCommand[] | null>(null);
  let commandsError = $state<string | null>(null);

  /* eslint-disable @typescript-eslint/no-explicit-any */
  async function loadCommands() {
    commandsError = null;
    try {
      const res: any = await streamerbot.client?.getCommands();
      if (res?.status !== "ok") throw new Error(res?.error ?? "Streamer.bot returned an error");
      commands = ((res.commands ?? []) as any[])
        .filter((c) => c.enabled !== false && Array.isArray(c.commands) && c.commands.length)
        .map((c) => ({ id: String(c.id), name: String(c.name), group: String(c.group ?? ""), triggers: c.commands.map(String) }))
        .sort((a, b) => a.triggers[0].localeCompare(b.triggers[0]));
    } catch (e) {
      commandsError = streamerbot.status === "connected" ? String(e instanceof Error ? e.message : e) : "Not connected to Streamer.bot";
    }
  }
  const shownCommands = $derived(
    (commands ?? []).filter((c) => !filter || c.triggers.some((t) => t.toLowerCase().includes(filter.toLowerCase())) || c.name.toLowerCase().includes(filter.toLowerCase())),
  );

  // --- Users ---
  const refreshUsers = () => viewers.refresh();

  function onKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      if (view === "menu") onClose();
      else view = "menu";
    }
  }
</script>

<div class="panel" role="dialog" aria-label="Chat menu" tabindex="-1" onkeydown={onKeydown}>
  {#if view === "menu"}
    <button class="item" onclick={() => go("slash")}><Slash size={16} /> Slash Commands</button>
    <button class="item" onclick={() => go("commands")}><MessageSquareWarning size={16} /> Commands</button>
    <button class="item" onclick={() => go("users")}><AtSign size={16} /> Users</button>
  {:else}
    <header>
      <button class="back" onclick={() => (view = "menu")} aria-label="Back"><ArrowLeft size={15} /></button>
      <strong>{view === "slash" ? "Slash Commands" : view === "commands" ? "Commands" : "Users"}</strong>
      {#if view === "users" || view === "commands"}
        <button class="back" title="Refresh" aria-label="Refresh" onclick={() => (view === "users" ? refreshUsers() : loadCommands())}>
          <RefreshCw size={14} />
        </button>
      {/if}
    </header>
    <!-- svelte-ignore a11y_autofocus -->
    <input class="filter" placeholder="Search…" bind:value={filter} autofocus />

    <div class="list">
      {#if view === "slash"}
        {#each slash as cmd (cmd.name)}
          {@const locked = !bridge.supports(cmd.bridge)}
          <button class="row" class:locked onclick={() => { onInsert(`/${cmd.name} `); onClose(); }} title={locked ? "Needs a newer Chatzooka Bridge (see Settings)" : cmd.description}>
            <span class="cmd">/{cmd.name}{#if cmd.aliases?.length}<span class="alias"> or /{cmd.aliases.join(", /")}</span>{/if} <span class="args">{cmd.args}</span></span>
            <span class="desc">
              {cmd.description}
              {#each cmd.platforms as p (p)}<PlatformIcon platform={p} size={11} />{/each}
              {#if locked}· needs bridge update{/if}
            </span>
          </button>
        {/each}
      {:else if view === "commands"}
        {#if commandsError}
          <p class="empty">{commandsError}</p>
        {:else if !commands}
          <p class="empty">Loading your Streamer.bot commands…</p>
        {:else if shownCommands.length === 0}
          <p class="empty">{commands.length ? "No commands match." : "No enabled commands in Streamer.bot."}</p>
        {:else}
          {#each shownCommands as c (c.id)}
            <button class="row" onclick={() => { onInsert(`${c.triggers[0]} `); onClose(); }}>
              <span class="cmd">{c.triggers.join("  ")}</span>
              <span class="desc">{c.name}{c.group ? ` · ${c.group}` : ""}</span>
            </button>
          {/each}
        {/if}
      {:else}
        <UsersList {filter} onOpened={onClose} />
      {/if}
    </div>
  {/if}
</div>

<style>
  .panel {
    position: absolute;
    left: 10px;
    bottom: 54px;
    width: min(340px, calc(100vw - 20px));
    max-height: min(460px, 65vh);
    display: flex;
    flex-direction: column;
    padding: 4px;
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    border-radius: 10px;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
    z-index: 10;
  }

  .item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 9px 12px;
    border-radius: 6px;
    font-size: 13.5px;
    text-align: left;
    color: var(--text);
  }

  .item:hover {
    background: #2e2e2e;
  }

  .item :global(svg) {
    color: var(--text-muted);
  }

  header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px 4px;
    font-size: 13.5px;
  }

  header strong {
    flex: 1;
  }

  .back {
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
    border-radius: 5px;
    color: var(--text-muted);
  }

  .back:hover {
    background: #2e2e2e;
    color: var(--text);
  }

  .filter {
    margin: 4px 8px 6px;
    height: 30px;
    padding: 0 10px;
    background: var(--bg-input);
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--text);
    outline: none;
  }

  .list {
    overflow-y: auto;
    padding: 0 4px 6px;
  }

  .row {
    display: flex;
    flex-direction: column;
    width: 100%;
    padding: 6px 8px;
    border-radius: 6px;
    text-align: left;
  }

  .row:hover {
    background: #2e2e2e;
  }

  .row.locked {
    opacity: 0.55;
  }

  .cmd {
    font-size: 13px;
    font-weight: 600;
  }

  .args,
  .alias {
    font-weight: 400;
    color: var(--text-muted);
  }

  .desc {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    color: var(--text-muted);
  }

  .empty {
    margin: 6px 6px;
    font-size: 12.5px;
    color: var(--text-muted);
  }
</style>
