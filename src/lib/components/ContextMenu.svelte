<script lang="ts">
  // Right-click menu for a chat row: moderation plus copy helpers.
  import { contextMenu } from "../chat/contextMenu.svelte";
  import { banUser, canModerate, capabilities, deleteMessage, TIMEOUT_PRESETS, timeoutUser, unbanUser } from "../chat/moderation";
  import { isIgnoredUser, toggleIgnoredUser } from "../chat/ignore";
  import { plainText } from "../chat/plainText";
  import { reply } from "../chat/reply.svelte";
  import type { ChatMessage } from "../chat/types";
  import { toasts } from "../toasts.svelte";

  const MENU_PRESETS = TIMEOUT_PRESETS.filter((p) => [60, 600, 3600, 86400].includes(p.seconds));

  let menu: HTMLDivElement | undefined = $state();
  let confirmBan = $state(false);
  let pos = $state({ left: 0, top: 0 });

  const target = $derived(contextMenu.target);
  const message = $derived(target?.message);
  const can = $derived(message ? capabilities(message) : null);
  const moderatable = $derived(message ? canModerate(message) : false);

  // Keep the menu inside the window.
  $effect(() => {
    if (!target || !menu) return;
    confirmBan = false;
    const { width, height } = menu.getBoundingClientRect();
    pos = {
      left: Math.min(target.x, window.innerWidth - width - 8),
      top: Math.min(target.y, window.innerHeight - height - 8),
    };
  });

  /** Run a moderation action on the menu's message. The message is captured before the menu
   *  closes, because closing clears `message`. */
  function act(fn: (m: ChatMessage) => Promise<unknown>) {
    const m = message;
    contextMenu.close();
    if (m) void fn(m);
  }

  const ignorable = $derived(!!message && (message.kind === "chat" || message.kind === "action") && !message.author.roles.broadcaster);

  function toggleIgnore() {
    const m = message;
    contextMenu.close();
    if (!m) return;
    const now = toggleIgnoredUser(m);
    toasts.show(now ? `Ignoring ${m.author.displayName} (undo in Settings → Ignore)` : `Stopped ignoring ${m.author.displayName}`);
  }

  async function copy(value: string, what: string) {
    contextMenu.close();
    try {
      await navigator.clipboard.writeText(value);
      toasts.show(`Copied ${what}`);
    } catch {
      toasts.show(`Couldn't copy ${what}`, "error");
    }
  }
</script>

<svelte:window
  onkeydown={(e) => e.key === "Escape" && contextMenu.close()}
  onblur={() => contextMenu.close()}
/>

{#if target && message}
  <!-- Click anywhere else to close. -->
  <div class="backdrop" role="presentation" onclick={() => contextMenu.close()} oncontextmenu={(e) => { e.preventDefault(); contextMenu.close(); }}></div>
  <div class="menu" bind:this={menu} role="menu" style:left="{pos.left}px" style:top="{pos.top}px">
    <div class="header">{message.author.displayName}</div>

    {#if reply.canReply(message)}
      <button role="menuitem" onclick={() => { const m = message; contextMenu.close(); reply.start(m); }}>Reply</button>
      <hr />
    {/if}

    {#if moderatable && can}
      {#if can.delete}
        <button role="menuitem" onclick={() => act(deleteMessage)}>Delete message</button>
      {/if}
      <div class="presets" role="group" aria-label="Timeout">
        <span>Timeout</span>
        {#each MENU_PRESETS as preset (preset.seconds)}
          <button role="menuitem" onclick={() => act((m) => timeoutUser(m, preset.seconds))}>{preset.label}</button>
        {/each}
      </div>
      {#if confirmBan}
        <button role="menuitem" class="danger confirm" onclick={() => act(banUser)}>
          Click to confirm ban
        </button>
      {:else}
        <button role="menuitem" class="danger" onclick={() => (confirmBan = true)}>Ban {message.author.displayName}</button>
      {/if}
      {#if can.unban}
        <button role="menuitem" onclick={() => act(unbanUser)}>Unban</button>
      {/if}
      <hr />
    {/if}

    <button role="menuitem" onclick={() => copy(plainText(message), "message")}>Copy message</button>
    <button role="menuitem" onclick={() => copy(message.author.displayName, "name")}>Copy name</button>
    {#if ignorable}
      <hr />
      <button role="menuitem" onclick={toggleIgnore}>{isIgnoredUser(message) ? "Stop ignoring" : "Ignore"} {message.author.displayName}</button>
    {/if}
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 20;
  }

  .menu {
    position: fixed;
    z-index: 21;
    min-width: 200px;
    padding: 4px;
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    border-radius: 8px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.55);
    font-size: 13px;
  }

  .header {
    padding: 6px 10px 4px;
    font-weight: 700;
    color: var(--text-muted);
    font-size: 12px;
  }

  button {
    display: block;
    width: 100%;
    padding: 6px 10px;
    border-radius: 5px;
    text-align: left;
  }

  button:hover {
    background: #333;
  }

  .danger {
    color: #ff7b7b;
  }

  .danger.confirm {
    background: #3a1f1f;
    font-weight: 700;
  }

  .presets {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 2px 4px 2px 10px;
  }

  .presets span {
    flex: 1;
  }

  .presets button {
    width: auto;
    padding: 4px 7px;
    color: var(--text-muted);
  }

  .presets button:hover {
    color: var(--text);
  }

  hr {
    border: none;
    border-top: 1px solid var(--border);
    margin: 4px 0;
  }
</style>
