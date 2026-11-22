<script lang="ts">
  // A user card, Chatterino-style: a fixed-size profile header, actions, then all of the user's
  // messages with a line between days, opened at the newest. Scroll up (or make the window
  // taller) for more; the top stays the same size.
  // Used by card windows (CardWindow.svelte) and, in browser previews, inside the page.
  import { ArrowUpRight, Ban, Copy, Pin, PinOff, ShieldMinus, ShieldPlus, StickyNote, UserCheck, X, Zap } from "@lucide/svelte";
  import { onMount, tick } from "svelte";
  import { cardDrag, cardRequest } from "../card/client";
  import { CARD_EVENTS, inTauri, type CardState, type CardTarget, type FollowInfo } from "../card/protocol";
  import { liveMessagesFor } from "../card/server.svelte";
  import { TIMEOUT_PRESETS, type TwitchUserInfo } from "../chat/moderation";
  import type { ChatMessage } from "../chat/types";
  import { saveNotes, userMessages, userRecord, type UserRecord } from "../db/history";
  import { openExternal } from "../openExternal";
  import { cosmetics } from "../seventv/cosmetics.svelte";
  import { toasts } from "../toasts.svelte";
  import MessageRow from "./MessageRow.svelte";
  import PaintedName from "./PaintedName.svelte";
  import PlatformIcon from "./PlatformIcon.svelte";

  let {
    target,
    windowMode,
    pinned = $bindable(false),
    onClose,
  }: {
    target: CardTarget;
    /** In its own window: the header drags the window, and there's a pin. */
    windowMode: boolean;
    pinned?: boolean;
    onClose: () => void;
  } = $props();

  const author = $derived(target.author);
  const platform = $derived(target.platform);

  /** How much history to load: plenty to scroll back through. */
  const HISTORY_LIMIT = 1000;

  let host = $state<CardState | null>(null);
  let liveFromMain = $state.raw<ChatMessage[]>([]);
  let stored = $state.raw<ChatMessage[]>([]);
  let record = $state<UserRecord | null>(null);
  let info = $state<TwitchUserInfo | null>(null);
  let infoError = $state<string | null>(null);
  let follow = $state<FollowInfo | null>(null);
  let notes = $state("");
  let notesOpen = $state(false);
  let confirmBan = $state(false);
  let avatarFailed = $state(false);
  let list: HTMLDivElement | undefined = $state();

  onMount(() => {
    const t = $state.snapshot(target) as CardTarget;
    cosmetics.request(t.platform, t.author.id);
    void userMessages(t.platform, t.author.id, HISTORY_LIMIT).then((m) => (stored = m));
    void userRecord(t.platform, t.author.id).then((r) => {
      record = r;
      notes = r?.notes ?? "";
    });
    void cardRequest(t, { kind: "state" }).then((s) => {
      if (!s || typeof s !== "object" || !("connected" in s)) return;
      host = s;
      liveFromMain = s.live;
      if (t.platform === "twitch" && s.bridgeProfiles) {
        void cardRequest(t, { kind: "userInfo" }).then((res) => {
          if (res && typeof res === "object" && "error" in res) infoError = res.error;
          else if (res && typeof res === "object" && "login" in res) info = res;
        });
      }
      if (t.platform === "twitch" && s.bridgeFollowDates && !t.author.roles.broadcaster) {
        void cardRequest(t, { kind: "followInfo" }).then((res) => {
          if (res && typeof res === "object" && "following" in res) follow = res;
        });
      }
    });
    let unlisten: (() => void) | undefined;
    if (windowMode && inTauri) {
      void import("@tauri-apps/api/event").then(({ listen }) =>
        listen<ChatMessage[]>(CARD_EVENTS.live, ({ payload }) => (liveFromMain = payload)).then((u) => (unlisten = u)),
      );
    }
    return () => unlisten?.();
  });

  // In a window, live messages come from the main window; inside the page, straight from chat.
  const live = $derived(windowMode ? liveFromMain : liveMessagesFor(target));

  /** History plus anything newer from live chat, oldest first, no duplicates. */
  const messages = $derived.by(() => {
    const byId = new Map<string, ChatMessage>();
    for (const m of stored) byId.set(m.id, m);
    for (const m of live) byId.set(m.id, m); // live copies carry the latest deleted/mod state
    return [...byId.values()].sort((a, b) => a.timestamp - b.timestamp || (a.seq ?? 0) - (b.seq ?? 0));
  });
  /** Start of each message's day, to put a date line between days. */
  const dayKey = (ts: number) => new Date(ts).toDateString();
  const dayFormat = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  function dayLabel(ts: number): string {
    const key = dayKey(ts);
    if (key === dayKey(Date.now())) return "Today";
    if (key === dayKey(Date.now() - 86_400_000)) return "Yesterday";
    return dayFormat.format(ts);
  }

  // Open at the newest message, and follow new ones while you're at the bottom; if you've
  // scrolled up to read older messages, stay put.
  let atBottom = true;
  function onListScroll() {
    if (list) atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 40;
  }
  $effect(() => {
    void messages.length;
    if (atBottom) void tick().then(() => list && (list.scrollTop = list.scrollHeight));
  });
  // Keep the bottom in view when the window is resized.
  $effect(() => {
    if (!list) return;
    const el = list;
    const observer = new ResizeObserver(() => {
      if (atBottom) el.scrollTop = el.scrollHeight;
    });
    observer.observe(el);
    return () => observer.disconnect();
  });

  const moderatable = $derived(!!author.id && !author.roles.broadcaster);
  const isMod = $derived(info?.isModerator ?? author.roles.mod);
  const sevenTvBadge = $derived(cosmetics.badgeFor(platform, author.id));
  const avatar = $derived(info?.profileImageUrl ?? author.avatarUrl);

  type Chip = { label: string; color: string };
  const chips = $derived.by<Chip[]>(() => {
    const r = author.roles;
    const out: Chip[] = [];
    if (r.broadcaster) out.push({ label: "Broadcaster", color: "#e91916" });
    if (isMod) out.push({ label: "Mod", color: "#00ad03" });
    if (info?.isVip ?? r.vip) out.push({ label: "VIP", color: "#e005b9" });
    if (info?.isSubscribed ?? r.sub) out.push({ label: info?.subscriptionTier === "3000" ? "Sub T3" : info?.subscriptionTier === "2000" ? "Sub T2" : "Sub", color: "#00b5ad" });
    if (r.member) out.push({ label: "Member", color: "#2ba640" });
    if (info?.isPartner) out.push({ label: "Partner", color: "#9146ff" });
    else if (info?.isAffiliate) out.push({ label: "Affiliate", color: "#e06cb5" });
    return out;
  });

  const channelUrl = $derived(platform === "twitch" ? `https://www.twitch.tv/${author.login ?? author.displayName}` : `https://www.youtube.com/channel/${author.id}`);
  const viewerCardUrl = $derived(
    platform === "twitch" && author.login && host?.broadcasterLogin ? `https://www.twitch.tv/popout/${host.broadcasterLogin}/viewercard/${author.login}` : null,
  );

  const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

  function accountAge(createdAt?: string): string | null {
    if (!createdAt) return null;
    const created = new Date(createdAt);
    if (Number.isNaN(created.getTime()) || created.getFullYear() < 2000) return null;
    const days = Math.floor((Date.now() - created.getTime()) / 86_400_000);
    const age = days >= 365 ? `${(days / 365).toFixed(1)}y` : days >= 30 ? `${Math.floor(days / 30)}mo` : `${days}d`;
    return `${dateFormat.format(created)} (${age})`;
  }

  const created = $derived(
    platform !== "twitch"
      ? null
      : (accountAge(info?.createdAt) ??
          (host && !host.bridgeReady ? "needs the Chatzooka Bridge" : host && !host.bridgeProfiles ? "needs a bridge update" : infoError ? "unavailable" : "loading…")),
  );

  async function copy(value: string, what: string) {
    try {
      await navigator.clipboard.writeText(value);
      toasts.show(`Copied ${what}`);
    } catch {
      toasts.show(`Couldn't copy ${what}`, "error");
    }
  }

  const act = (action: Parameters<typeof cardRequest>[1]) => cardRequest($state.snapshot(target) as CardTarget, action);

  function onBan() {
    if (!confirmBan) {
      confirmBan = true;
      setTimeout(() => (confirmBan = false), 3000);
      return;
    }
    confirmBan = false;
    void act({ kind: "ban" });
  }

  async function toggleMod() {
    const ok = await act({ kind: isMod ? "unmod" : "mod" });
    if (ok === true && info) info = { ...info, isModerator: !isMod };
  }

  function unbanOnYouTube() {
    void openExternal("https://studio.youtube.com/");
    toasts.show(`In YouTube Studio: Settings → Community → Hidden users, then remove ${author.displayName}`, "ok", 9000);
  }

  /**
   * Drag the card window by its header. Tauri's only reacts to the exact
   * element pressed, so pressing the name, picture or details lines didn't move the window.
   */
  function startDrag(e: MouseEvent) {
    if (!windowMode || !inTauri || e.button !== 0) return;
    if ((e.target as HTMLElement).closest("button, a, input, textarea, .name")) return;
    e.preventDefault();
    // Only start once the mouse actually moves with the button held: a plain click on the
    // header shouldn't hand the window to Windows' move loop (which can make it lose focus).
    const x0 = e.screenX;
    const y0 = e.screenY;
    const onMove = (m: MouseEvent) => {
      if (!(m.buttons & 1)) return stop();
      if (Math.abs(m.screenX - x0) + Math.abs(m.screenY - y0) < 4) return;
      stop();
      cardDrag.active = true;
      cardDrag.since = Date.now();
      void import("@tauri-apps/api/window").then(({ getCurrentWindow }) =>
        getCurrentWindow()
          .startDragging()
          .catch((err) => {
            cardDrag.active = false;
            console.warn("Couldn't drag the card window", err);
          }),
      );
    };
    const stop = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", stop);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", stop);
  }

  let notesTimer: ReturnType<typeof setTimeout> | null = null;
  function onNotesInput() {
    const p = platform;
    const id = author.id;
    const value = notes;
    if (notesTimer) clearTimeout(notesTimer);
    notesTimer = setTimeout(() => void saveNotes(p, id, value), 600);
  }
</script>

<div class="card" class:window={windowMode}>
  <!-- Fixed-height top: the same for every user. Dragging it moves the window. -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <header onmousedown={startDrag}>
    {#if avatar && !avatarFailed}
      <img class="avatar" src={avatar} alt="" referrerpolicy="no-referrer" onerror={() => (avatarFailed = true)} />
    {:else}
      <div class="avatar placeholder">{author.displayName.charAt(0).toUpperCase()}</div>
    {/if}
    <div class="identity">
      <div class="name-line">
        <PlatformIcon {platform} size={14} />
        <span class="big-name"><PaintedName {author} {platform} /></span>
        {#if sevenTvBadge}<img class="badge" src={sevenTvBadge.imageUrl} alt={sevenTvBadge.title} title={sevenTvBadge.title} />{/if}
        <button class="icon" title="Copy name" aria-label="Copy name" onclick={() => copy(author.displayName, "name")}><Copy size={12} /></button>
      </div>
      <div class="meta">
        <span>ID: {author.id}</span>
        <button class="icon" title="Copy ID" aria-label="Copy ID" onclick={() => copy(author.id, "ID")}><Copy size={11} /></button>
      </div>
      {#if created}<div class="meta">Created: {created}</div>{/if}
      {#if platform === "twitch" && !author.roles.broadcaster && (follow || info)}
        <div class="meta">
          {#if follow}
            {follow.following ? `Followed: ${accountAge(follow.followedAt) ?? "yes"}` : "Not following"}
          {:else if info}
            {info.isFollowing ? "Following" : "Not following"}
          {/if}
        </div>
      {/if}
      <div class="meta">
        {record ? `${record.messageCount.toLocaleString()} messages · first seen ${dateFormat.format(record.firstSeen)}` : "First seen this session"}
      </div>
      <div class="chips">
        {#each chips as chip (chip.label)}
          <span class="chip" style:--chip={chip.color}>{chip.label}</span>
        {/each}
      </div>
    </div>
    <div class="window-buttons">
      {#if windowMode}
        <button class="icon" class:on={pinned} title={pinned ? "Pinned: stays open (click to unpin)" : "Pin: keep this card open when you click elsewhere"} aria-label="Pin" aria-pressed={pinned} onclick={() => (pinned = !pinned)}>
          {#if pinned}<Pin size={15} />{:else}<PinOff size={15} />{/if}
        </button>
      {/if}
      <button class="icon" title="Close (Esc)" aria-label="Close" onclick={onClose}><X size={16} /></button>
    </div>
  </header>

  <div class="links">
    <button onclick={() => void openExternal(channelUrl)}>Channel <ArrowUpRight size={12} /></button>
    {#if viewerCardUrl}<button onclick={() => void openExternal(viewerCardUrl)}>Viewer card <ArrowUpRight size={12} /></button>{/if}
    <button class:on={notesOpen || !!notes} onclick={() => (notesOpen = !notesOpen)}><StickyNote size={12} /> {notes ? "Notes" : "Add notes"}</button>
    {#each host?.quickActions ?? [] as action (action.id)}
      <button class="qa" title={`Run "${action.name}" in Streamer.bot for ${author.displayName}`} onclick={() => void act({ kind: "quickAction", actionId: action.id })}>
        <Zap size={12} />{action.name}
      </button>
    {/each}
  </div>

  {#if moderatable}
    <div class="mod-bar">
      {#if platform === "twitch"}
        <button class="icon" title="Unban / remove timeout" aria-label="Unban" onclick={() => void act({ kind: "unban" })}><UserCheck size={15} /></button>
        <button class="icon" title={isMod ? "Remove moderator" : "Make moderator"} aria-label={isMod ? "Remove moderator" : "Make moderator"} disabled={!host?.bridgeProfiles} onclick={() => void toggleMod()}>
          {#if isMod}<ShieldMinus size={15} />{:else}<ShieldPlus size={15} />{/if}
        </button>
      {:else}
        <button class="icon" title="Unban on YouTube: opens YouTube Studio" aria-label="Unban on YouTube" onclick={unbanOnYouTube}><UserCheck size={15} /><ArrowUpRight size={11} /></button>
      {/if}
      <div class="presets">
        {#each TIMEOUT_PRESETS as preset (preset.seconds)}
          <button title={`Timeout ${preset.label}`} onclick={() => void act({ kind: "timeout", seconds: preset.seconds })}>{preset.label}</button>
        {/each}
      </div>
      <button class="icon ban" class:confirm={confirmBan} title={confirmBan ? "Click again to ban" : "Ban"} aria-label="Ban" onclick={onBan}>
        <Ban size={15} />{#if confirmBan}<span>Ban?</span>{/if}
      </button>
    </div>
  {/if}

  {#if notesOpen}
    <!-- svelte-ignore a11y_autofocus -->
    <textarea class="notes" bind:value={notes} oninput={onNotesInput} rows="2" placeholder="Notes only you can see, e.g. regular since 2024" autofocus></textarea>
  {/if}

  <div class="messages" bind:this={list} onscroll={onListScroll}>
    {#if messages.length === 0}
      <p class="empty">No messages recorded from {author.displayName} yet.</p>
    {:else}
      <div class="rows">
        {#each messages as message, i (message.id)}
          {#if i === 0 || dayKey(message.timestamp) !== dayKey(messages[i - 1].timestamp)}
            <div class="day" role="separator"><span>{dayLabel(message.timestamp)}</span></div>
          {/if}
          <MessageRow {message} alt={i % 2 === 1} tools={false} />
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  .card {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: #1e1e1e;
    font-size: 13px;
  }

  header {
    display: flex;
    gap: 12px;
    height: 140px;
    flex-shrink: 0;
    padding: 12px 10px 8px 12px;
    overflow: hidden;
  }

  .window header {
    cursor: default;
  }

  .avatar {
    width: 64px;
    height: 64px;
    border-radius: 50%;
    object-fit: cover;
    flex-shrink: 0;
  }

  .avatar.placeholder {
    display: grid;
    place-items: center;
    background: #333;
    font-size: 24px;
    font-weight: 700;
  }

  .identity {
    flex: 1;
    min-width: 0;
  }

  .name-line {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }

  .big-name {
    font-size: 16px;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .badge {
    width: 16px;
    height: 16px;
  }

  .meta {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-top: 2px;
    font-size: 12px;
    color: var(--text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: 5px;
    height: 18px;
    overflow: hidden;
  }

  .chip {
    padding: 0 6px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 600;
    line-height: 18px;
    color: var(--chip);
    background: color-mix(in srgb, var(--chip) 16%, transparent);
  }

  .window-buttons {
    display: flex;
    align-items: flex-start;
    gap: 6px;
  }

  .icon {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    color: var(--text-muted);
  }

  .icon:hover:not(:disabled),
  .icon.on {
    color: var(--text);
  }

  .icon:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .links {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 12px;
    padding: 6px 12px;
    border-top: 1px solid var(--border);
    flex-shrink: 0;
  }

  .links button {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    font-size: 12.5px;
    color: var(--text-muted);
  }

  .links button:hover,
  .links button.on {
    color: var(--text);
  }

  .links .qa {
    color: #c9b3ff;
  }

  .mod-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 12px;
    border-top: 1px solid var(--border);
    flex-shrink: 0;
  }

  .presets {
    flex: 1;
    min-width: 0;
    display: flex;
    justify-content: space-between;
  }

  .presets button {
    padding: 3px 2px;
    border-radius: 4px;
    font-size: 12px;
    white-space: nowrap;
    color: var(--text-muted);
  }

  .presets button:hover {
    background: #333;
    color: var(--text);
  }

  .ban:hover,
  .ban.confirm {
    color: #ff6b6b;
  }

  .ban.confirm span {
    font-size: 11.5px;
    font-weight: 700;
  }

  .notes {
    margin: 0 12px 6px;
    padding: 6px 8px;
    resize: none;
    background: var(--bg-input);
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--text);
    font: inherit;
    font-size: 12.5px;
    outline: none;
    user-select: text;
    flex-shrink: 0;
  }

  .messages {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    border-top: 1px solid var(--border);
    background: #191919;
  }

  .day {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px 4px;
    font-size: 11.5px;
    font-weight: 600;
    color: var(--text-muted);
  }

  .day::before,
  .day::after {
    content: "";
    flex: 1;
    height: 1px;
    background: #333;
  }

  .rows {
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    min-height: 100%;
  }

  .empty {
    padding: 20px;
    text-align: center;
    color: var(--text-muted);
  }

</style>
