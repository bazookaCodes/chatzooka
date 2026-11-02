<script lang="ts">
  import { CornerUpLeft, Menu, SendHorizontal, Smile, X } from "@lucide/svelte";
  import { plainText } from "../chat/plainText";
  import { reply } from "../chat/reply.svelte";
  import { toasts } from "../toasts.svelte";
  import { tick } from "svelte";
  import { emoteList, isChannelEmote } from "../chat/emoteList.svelte";
  import { runSlashCommand, SLASH_COMMANDS } from "../chat/slashCommands";
  import { chat } from "../chat/store.svelte";
  import type { Platform } from "../chat/types";
  import { loadSetting, saveSetting } from "../settings";
  import { streamerbot } from "../streamerbot/connection.svelte";
  import { MESSAGE_LIMITS, sendChat, sendTwitchReply, type SendResult } from "../streamerbot/send";
  import ChatMenu from "./ChatMenu.svelte";
  import EmotePicker from "./EmotePicker.svelte";
  import PlatformIcon from "./PlatformIcon.svelte";

  let { onOpenSettings }: { onOpenSettings: () => void } = $props();

  const PLATFORM_NAMES: Record<Platform, string> = { twitch: "Twitch", youtube: "YouTube" };

  let targets = $state<Record<Platform, boolean>>(loadSetting("sendTargets", { twitch: true, youtube: true }));
  let text = $state("");
  let input: HTMLInputElement | undefined = $state();
  let sending = $state(false);
  let pickerOpen = $state(false);
  let menuOpen = $state(false);

  /** Replace the message box text (from the ☰ menu) and put the cursor at the end. */
  async function insertText(t: string) {
    text = t;
    await tick();
    input?.focus();
    input?.setSelectionRange(t.length, t.length);
  }
  /** Shown above the input after a send that didn't fully work. */
  let notice = $state<{ text: string; needsAuth: boolean } | null>(null);

  const connected = $derived(streamerbot.status === "connected");
  /** Platforms that are both selected and signed in to Streamer.bot. A reply only goes to Twitch. */
  const activeTargets = $derived(
    reply.target
      ? (["twitch"] as const).filter((p) => !connected || streamerbot.accounts[p])
      : (["twitch", "youtube"] as const).filter((p) => targets[p] && (!connected || streamerbot.accounts[p])),
  );

  // Reply / right-click → Reply puts the cursor in the message box.
  $effect(() => {
    if (reply.requested) void tick().then(() => input?.focus());
  });
  const limit = $derived(Math.min(...activeTargets.map((p) => MESSAGE_LIMITS[p]), 500));
  const length = $derived(text.trim().length);
  const overLimit = $derived(length > limit);
  const canSend = $derived(connected && !sending && length > 0 && !overLimit && activeTargets.length > 0);

  const placeholder = $derived(
    reply.target
      ? `Reply to ${reply.target.author.displayName}…`
      : targets.twitch && targets.youtube
      ? "Send a message to all platforms…"
      : targets.twitch
        ? "Send a message to Twitch…"
        : targets.youtube
          ? "Send a message to YouTube…"
          : "Pick a platform to send to",
  );

  function toggle(platform: Platform) {
    targets[platform] = !targets[platform];
    saveSetting("sendTargets", targets);
  }

  // --- Sending -------------------------------------------------------------------------

  let history: string[] = [];
  let historyIndex = -1;

  async function send() {
    if (!canSend) return;
    const message = text.trim();
    sending = true;
    notice = null;

    // "/command …" is carried out by Chatzooka, never sent as chat text.
    if (message.startsWith("/")) {
      const { ok } = await runSlashCommand(message, activeTargets);
      sending = false;
      if (ok) {
        text = "";
        history = [message, ...history.filter((h) => h !== message)].slice(0, 50);
        historyIndex = -1;
      }
      input?.focus();
      return;
    }

    const parent = reply.target;
    let results: SendResult[];
    if (parent) {
      const res = await sendTwitchReply(message, parent);
      if (res.ok) {
        reply.clear();
        if (res.fallback) toasts.show("Sent as an @mention. Update the Chatzooka Bridge to v5 for real Twitch replies.", "ok", 6000);
      }
      results = [res];
    } else {
      results = await Promise.all(activeTargets.map((p) => sendChat(p, message)));
    }
    sending = false;

    const failed = results.filter((r): r is Extract<SendResult, { ok: false }> => !r.ok);
    if (failed.length < results.length) {
      // At least one platform got it; clear the box and remember it for the Up arrow.
      text = "";
      history = [message, ...history.filter((h) => h !== message)].slice(0, 50);
      historyIndex = -1;
    }
    if (failed.length) {
      pickerOpen = false;
      const needsAuth = failed.some((f) => f.needsAuth);
      notice = {
        needsAuth,
        text: needsAuth
          ? "Streamer.bot only allows sending with a WebSocket password. Set one up in Streamer.bot and in Settings."
          : failed.map((f) => `${PLATFORM_NAMES[f.platform]}: ${f.error}`).join(" · "),
      };
    }
    input?.focus();
  }

  // --- Tab completion (emotes and chatter names) ---------------------------------------

  let completion: { start: number; candidates: string[]; index: number; inserted: string } | null = null;

  function completionCandidates(token: string): string[] {
    const q = token.toLowerCase();
    // "/ti" + Tab → "/timeout" (only as the first word).
    if (token.startsWith("/") && text.trimStart().startsWith(token)) {
      return SLASH_COMMANDS.flatMap((c) => [c.name, ...(c.aliases ?? [])])
        .filter((n) => n.startsWith(q.slice(1)))
        .map((n) => `/${n}`);
    }
    if (token.startsWith("@")) {
      const prefix = q.slice(1);
      return recentNames()
        .filter((n) => n.toLowerCase().startsWith(prefix))
        .map((n) => `@${n}`);
    }
    // Your channel's emotes first, then shortest name first.
    const emotes = emoteList
      .forPlatforms(activeTargets.length ? activeTargets : ["twitch", "youtube"])
      .filter((e) => e.name.toLowerCase().startsWith(q))
      .sort((a, b) => Number(isChannelEmote(b)) - Number(isChannelEmote(a)) || a.name.length - b.name.length || a.name.localeCompare(b.name))
      .map((e) => e.name);
    const names = recentNames().filter((n) => n.toLowerCase().startsWith(q));
    return [...new Set([...emotes, ...names])];
  }

  /** Display names of recent chatters, newest first. */
  function recentNames(): string[] {
    const seen = new Set<string>();
    for (let i = chat.messages.length - 1; i >= 0 && seen.size < 300; i--) seen.add(chat.messages[i].author.displayName);
    return [...seen];
  }

  async function complete(backwards: boolean) {
    if (!input) return;
    const caret = input.selectionStart ?? text.length;

    if (completion && text.slice(completion.start, caret) === completion.inserted) {
      const n = completion.candidates.length;
      completion.index = (completion.index + (backwards ? -1 : 1) + n) % n;
    } else {
      const start = text.lastIndexOf(" ", caret - 1) + 1;
      const token = text.slice(start, caret);
      if (!token) return;
      const candidates = completionCandidates(token);
      if (!candidates.length) return;
      completion = { start, candidates, index: backwards ? candidates.length - 1 : 0, inserted: "" };
    }

    const choice = completion.candidates[completion.index];
    const end = completion.start + (completion.inserted.length || caret - completion.start);
    text = text.slice(0, completion.start) + choice + text.slice(end);
    completion.inserted = choice;
    await tick();
    const pos = completion.start + choice.length;
    input.setSelectionRange(pos, pos);
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.key === "Tab") {
      event.preventDefault();
      void complete(event.shiftKey);
      return;
    }
    completion = null;

    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void send();
    } else if (event.key === "ArrowUp" && history.length && (text === "" || historyIndex >= 0)) {
      event.preventDefault();
      historyIndex = Math.min(historyIndex + 1, history.length - 1);
      text = history[historyIndex];
    } else if (event.key === "ArrowDown" && historyIndex >= 0) {
      event.preventDefault();
      historyIndex--;
      text = historyIndex >= 0 ? history[historyIndex] : "";
    } else if (event.key === "Escape" && pickerOpen) {
      pickerOpen = false;
    } else if (event.key === "Escape" && reply.target) {
      reply.clear();
    }
  }

  async function insertEmote(name: string) {
    const caret = input?.selectionStart ?? text.length;
    const before = text.slice(0, caret);
    const after = text.slice(caret);
    const insert = (before && !before.endsWith(" ") ? " " : "") + name + " ";
    text = before + insert + after;
    await tick();
    input?.focus();
    const pos = before.length + insert.length;
    input?.setSelectionRange(pos, pos);
  }

  function targetTitle(platform: Platform): string {
    if (connected && !streamerbot.accounts[platform]) return `${PLATFORM_NAMES[platform]} isn't connected in Streamer.bot`;
    return `${targets[platform] ? "Sending" : "Not sending"} to ${PLATFORM_NAMES[platform]} (click to toggle)`;
  }
</script>

<footer class="composer">
  {#if notice}
    <div class="notice" role="alert">
      <span>{notice.text}</span>
      {#if notice.needsAuth}
        <button class="notice-btn" onclick={onOpenSettings}>Settings</button>
      {/if}
      <button class="icon-btn" aria-label="Dismiss" onclick={() => (notice = null)}><X size={14} /></button>
    </div>
  {/if}

  {#if reply.target}
    <div class="replying">
      <CornerUpLeft size={13} />
      <span class="replying-text">
        Replying to <strong>{reply.target.author.displayName}</strong>: {plainText(reply.target)}
      </span>
      <span class="replying-note" title="Replies are a Twitch feature, so this goes to Twitch only">Twitch only</span>
      <button class="icon-btn" aria-label="Cancel reply (Esc)" title="Cancel reply (Esc)" onclick={() => reply.clear()}><X size={14} /></button>
    </div>
  {/if}

  {#if pickerOpen}
    <EmotePicker
      platforms={activeTargets.length ? activeTargets : ["twitch", "youtube"]}
      onPick={(name) => void insertEmote(name)}
      onClose={() => (pickerOpen = false)}
    />
  {/if}

  {#if menuOpen}
    <ChatMenu
      onInsert={(t) => void insertText(t)}
      onClose={() => (menuOpen = false)}
    />
  {/if}

  <button
    class="icon-btn"
    class:active={menuOpen}
    aria-label="Menu"
    title="Slash commands, commands and users"
    onclick={() => {
      menuOpen = !menuOpen;
      if (menuOpen) pickerOpen = false;
    }}><Menu size={18} /></button
  >

  <div class="field" class:over={overLimit}>
    <input
      bind:this={input}
      bind:value={text}
      {placeholder}
      onkeydown={onKeydown}
      aria-label="Message"
      spellcheck="true"
    />
    {#if length > limit - 50}
      <span class="counter" class:over={overLimit} title="Twitch allows 500 characters, YouTube 200">{length}/{limit}</span>
    {/if}
    <div class="targets">
      {#each ["twitch", "youtube"] as const as platform (platform)}
        <button
          class="target"
          class:on={targets[platform]}
          class:unavailable={connected && !streamerbot.accounts[platform]}
          aria-pressed={targets[platform]}
          aria-label={`Send to ${PLATFORM_NAMES[platform]}`}
          title={targetTitle(platform)}
          onclick={() => toggle(platform)}
        >
          <PlatformIcon {platform} size={16} color={targets[platform] ? undefined : "currentColor"} />
        </button>
      {/each}
    </div>
  </div>

  <button
    class="icon-btn"
    class:active={pickerOpen}
    aria-label="Emotes"
    title="Emotes"
    onclick={() => {
      pickerOpen = !pickerOpen;
      if (pickerOpen) menuOpen = false;
    }}
  >
    <Smile size={18} />
  </button>
  <button
    class="icon-btn"
    aria-label="Send"
    title={connected ? (sending ? "Sending…" : "Send (Enter)") : "Not connected to Streamer.bot"}
    disabled={!canSend}
    onclick={() => void send()}
  >
    <SendHorizontal size={18} />
  </button>
</footer>

<style>
  .composer {
    position: relative;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 10px;
    padding: var(--composer-pad);
    flex-shrink: 0;
  }

  .notice {
    position: absolute;
    left: 10px;
    right: 10px;
    bottom: 100%;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 7px 10px;
    margin-bottom: 4px;
    background: #2a1717;
    border: 1px solid #5a2b2b;
    border-radius: 6px;
    color: #f0b4b4;
    font-size: 12.5px;
    line-height: 17px;
    z-index: 5;
  }

  .notice span {
    flex: 1;
  }

  /* Its own row above the message box (the composer wraps), so it never covers chat. */
  .replying {
    flex: 0 0 100%;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 8px 4px 10px;
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--text-muted);
    font-size: 12.5px;
  }

  .replying-text {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .replying-text strong {
    color: var(--text);
  }

  .replying-note {
    font-size: 11px;
    color: var(--twitch);
    white-space: nowrap;
  }

  .notice-btn {
    padding: 3px 9px;
    border: 1px solid #5a2b2b;
    border-radius: 4px;
    color: var(--text);
  }

  .field {
    flex: 1;
    display: flex;
    align-items: center;
    height: 36px;
    min-width: 0;
    background: var(--bg-input);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 0 8px 0 12px;
  }

  .field:focus-within {
    border-color: #4a4a4a;
  }

  .field.over {
    border-color: #a33;
  }

  input {
    flex: 1;
    min-width: 0;
    background: none;
    border: none;
    outline: none;
  }

  input::placeholder {
    color: var(--text-muted);
  }

  .counter {
    margin-left: 8px;
    font-size: 11.5px;
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
  }

  .counter.over {
    color: #ff6b6b;
    font-weight: 700;
  }

  .targets {
    display: flex;
    gap: 6px;
    margin-left: 8px;
  }

  .target {
    display: grid;
    place-items: center;
    color: var(--text-faint);
    opacity: 0.8;
  }

  .target.on {
    opacity: 1;
  }

  .target.unavailable {
    opacity: 0.3;
  }

  .icon-btn {
    display: grid;
    place-items: center;
    color: var(--text-muted);
  }

  .icon-btn:hover:not(:disabled),
  .icon-btn.active {
    color: var(--text);
  }

  .icon-btn:disabled {
    color: var(--text-faint);
    cursor: default;
  }
</style>
