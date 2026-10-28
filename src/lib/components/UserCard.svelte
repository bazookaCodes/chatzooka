<script lang="ts">
  // User card, modeled on Streamer.bot's viewer card: header with roles and links, a moderation
  // bar, and Messages / Details tabs backed by the SQLite history.
  import { ArrowUpRight, Ban, Copy, Info, MessageSquareText, ShieldMinus, ShieldPlus, UserCheck, X, Zap } from "@lucide/svelte";
  import {
    banUser,
    canModerate,
    TIMEOUT_PRESETS,
    timeoutUser,
    twitchUserInfo,
    unbanUser,
    modUser,
    unmodUser,
    type TwitchUserInfo,
  } from "../chat/moderation";
  import { chat } from "../chat/store.svelte";
  import type { ChatMessage } from "../chat/types";
  import { userCard } from "../chat/userCard.svelte";
  import { saveNotes, userMessages, userRecord, type UserRecord } from "../db/history";
  import { openExternal } from "../openExternal";
  import { quickActions } from "../quickActions.svelte";
  import { cosmetics } from "../seventv/cosmetics.svelte";
  import { bridge } from "../streamerbot/bridge.svelte";
  import { streamerbot } from "../streamerbot/connection.svelte";
  import { toasts } from "../toasts.svelte";
  import MessageRow from "./MessageRow.svelte";
  import PaintedName from "./PaintedName.svelte";
  import PlatformIcon from "./PlatformIcon.svelte";

  const target = $derived(userCard.target);
  const author = $derived(target?.author);
  const platform = $derived(target?.platform);

  let tab = $state<"messages" | "details">("messages");
  let stored = $state.raw<ChatMessage[]>([]);
  let record = $state<UserRecord | null>(null);
  let info = $state<TwitchUserInfo | null>(null);
  let infoError = $state<string | null>(null);
  let notes = $state("");
  let confirmBan = $state(false);

  // Load history and profile whenever a different user's card opens.
  $effect(() => {
    const t = target;
    if (!t) return;
    tab = "messages";
    stored = [];
    record = null;
    info = null;
    infoError = null;
    notes = "";
    confirmBan = false;
    const { platform: p, author: a } = t;
    void userMessages(p, a.id).then((m) => userCard.target === t && (stored = m));
    void userRecord(p, a.id).then((r) => {
      if (userCard.target !== t) return;
      record = r;
      notes = r?.notes ?? "";
    });
    if (p === "twitch" && a.login && bridge.supports(2)) {
      void twitchUserInfo(a.login).then((res) => {
        if (userCard.target !== t) return;
        if ("error" in res) infoError = res.error;
        else info = res;
      });
    }
  });

  /** History from the database plus anything newer still in memory, newest first, no duplicates. */
  const messages = $derived.by(() => {
    if (!author || !platform) return [];
    const live = chat.messages.filter((m) => m.platform === platform && m.author.id === author.id && m.kind !== "modaction" && m.kind !== "presence");
    const byId = new Map<string, ChatMessage>();
    for (const m of stored) byId.set(m.id, m);
    for (const m of live) byId.set(m.id, m); // live copies carry the latest deleted/mod state
    return [...byId.values()].sort((a, b) => b.timestamp - a.timestamp || (b.seq ?? 0) - (a.seq ?? 0));
  });

  /** A message from this user to act on with the moderation helpers. */
  const subject = $derived<ChatMessage | null>(
    author && platform
      ? (messages[0] ?? { id: "", platform, timestamp: Date.now(), author, fragments: [], kind: "chat" })
      : null,
  );
  const moderatable = $derived(subject ? canModerate(subject) : false);
  const isMod = $derived(info?.isModerator ?? author?.roles.mod ?? false);
  const sevenTvBadge = $derived(author && platform ? cosmetics.badgeFor(platform, author.id) : null);
  const avatar = $derived(info?.profileImageUrl ?? author?.avatarUrl);
  /** Shows the initial instead of a broken image if the picture won't load. */
  let avatarFailed = $state(false);
  $effect(() => {
    void avatar;
    avatarFailed = false;
  });

  type Chip = { label: string; color: string };
  const chips = $derived.by<Chip[]>(() => {
    if (!author) return [];
    const r = author.roles;
    const out: Chip[] = [];
    if (r.broadcaster) out.push({ label: "Broadcaster", color: "#e91916" });
    if (isMod) out.push({ label: "Moderator", color: "#00ad03" });
    if (info?.isVip ?? r.vip) out.push({ label: "VIP", color: "#e005b9" });
    if (info?.isSubscribed ?? r.sub) out.push({ label: subTierLabel(info?.subscriptionTier), color: "#00b5ad" });
    if (r.member) out.push({ label: "Member", color: "#2ba640" });
    if (info?.isPartner) out.push({ label: "Partner", color: "#9146ff" });
    else if (info?.isAffiliate) out.push({ label: "Affiliate", color: "#e06cb5" });
    return out;
  });

  function subTierLabel(tier?: string): string {
    if (tier === "2000") return "Subscriber (T2)";
    if (tier === "3000") return "Subscriber (T3)";
    return "Subscriber";
  }

  const channelUrl = $derived(
    !author ? "" : platform === "twitch" ? `https://www.twitch.tv/${author.login ?? author.displayName}` : `https://www.youtube.com/channel/${author.id}`,
  );
  const viewerCardUrl = $derived(
    platform === "twitch" && author?.login && streamerbot.accounts.twitch
      ? `https://www.twitch.tv/popout/${streamerbot.accounts.twitch.login}/viewercard/${author.login}`
      : null,
  );

  const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });
  const dateTimeFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

  function accountAge(createdAt?: string): string | null {
    if (!createdAt) return null;
    const created = new Date(createdAt);
    if (Number.isNaN(created.getTime()) || created.getFullYear() < 2000) return null;
    const days = Math.floor((Date.now() - created.getTime()) / 86_400_000);
    const age = days >= 365 ? `${(days / 365).toFixed(1)} years` : days >= 30 ? `${Math.floor(days / 30)} months` : `${days} days`;
    return `${dateFormat.format(created)} (${age} ago)`;
  }

  async function copyName() {
    if (!author) return;
    try {
      await navigator.clipboard.writeText(author.displayName);
      toasts.show("Copied name");
    } catch {
      toasts.show("Couldn't copy name", "error");
    }
  }

  function onBan() {
    if (!subject) return;
    if (!confirmBan) {
      confirmBan = true;
      setTimeout(() => (confirmBan = false), 3000);
      return;
    }
    confirmBan = false;
    void banUser(subject);
  }

  function unbanOnYouTube() {
    void openExternal("https://studio.youtube.com/");
    toasts.show(`In YouTube Studio: Settings → Community → Hidden users, then remove ${author?.displayName ?? "the user"}`, "ok", 9000);
  }

  async function toggleMod() {
    if (!subject) return;
    const ok = await (isMod ? unmodUser(subject) : modUser(subject));
    if (ok && info) info = { ...info, isModerator: !isMod };
  }

  let notesTimer: ReturnType<typeof setTimeout> | null = null;
  function onNotesInput() {
    if (!author || !platform) return;
    const p = platform;
    const id = author.id;
    const value = notes;
    if (notesTimer) clearTimeout(notesTimer);
    notesTimer = setTimeout(() => void saveNotes(p, id, value), 600);
  }
</script>

<svelte:window onkeydown={(e) => e.key === "Escape" && target && userCard.close()} />

{#if target && author && platform}
  <div class="backdrop" role="presentation" onclick={() => userCard.close()}></div>
  <div class="card" role="dialog" aria-modal="true" aria-label={`${author.displayName}'s user card`}>
    <button class="close icon-btn" aria-label="Close" onclick={() => userCard.close()}><X size={18} /></button>

    <header>
      {#if avatar && !avatarFailed}
        <img class="avatar" src={avatar} alt="" referrerpolicy="no-referrer" onerror={() => (avatarFailed = true)} />
      {:else}
        <div class="avatar placeholder">{author.displayName.charAt(0).toUpperCase()}</div>
      {/if}
      <div class="identity">
        <div class="name-line">
          <PlatformIcon {platform} size={16} />
          <span class="big-name"><PaintedName {author} {platform} /></span>
          {#if sevenTvBadge}<img class="badge" src={sevenTvBadge.imageUrl} alt={sevenTvBadge.title} title={sevenTvBadge.title} />{/if}
          <button class="icon-btn" title="Copy name" aria-label="Copy name" onclick={copyName}><Copy size={14} /></button>
        </div>
        {#if chips.length}
          <div class="chips">
            {#each chips as chip (chip.label)}
              <span class="chip" style:--chip={chip.color}>{chip.label}</span>
            {/each}
          </div>
        {/if}
        <div class="links">
          <button onclick={() => void openExternal(channelUrl)}>View Channel <ArrowUpRight size={13} /></button>
          {#if viewerCardUrl}
            <button onclick={() => void openExternal(viewerCardUrl)}>Viewer Card <ArrowUpRight size={13} /></button>
          {/if}
        </div>
      </div>
    </header>

    <div class="quick-actions">
      <Zap size={14} />
      {#if quickActions.chosen.length === 0}
        <span>No User Quick Actions found</span>
        <span class="qa-hint">(pick some in Settings)</span>
      {:else}
        {#each quickActions.chosen as action (action.id)}
          <button class="qa" title={`Run "${action.name}" in Streamer.bot for ${author.displayName}`} onclick={() => void quickActions.run(action, platform, author)}>
            {action.name}
          </button>
        {/each}
      {/if}
    </div>

    {#if moderatable && subject}
      <div class="mod-bar">
        {#if platform === "twitch"}
          <button class="icon-btn" title="Unban / remove timeout" aria-label="Unban" onclick={() => void unbanUser(subject)}>
            <UserCheck size={16} />
          </button>
          <button
            class="icon-btn"
            title={isMod ? "Remove moderator" : "Make moderator"}
            aria-label={isMod ? "Remove moderator" : "Make moderator"}
            onclick={() => void toggleMod()}
            disabled={!bridge.supports(2)}
          >
            {#if isMod}<ShieldMinus size={16} />{:else}<ShieldPlus size={16} />{/if}
          </button>
        {:else}
          <!-- Streamer.bot has no YouTube unban, so send you to YouTube Studio's hidden-users list. -->
          <button
            class="icon-btn"
            title="Unban on YouTube: opens YouTube Studio (Settings → Community → Hidden users)"
            aria-label="Unban on YouTube"
            onclick={unbanOnYouTube}
          >
            <UserCheck size={16} /><ArrowUpRight size={12} />
          </button>
        {/if}
        <div class="presets">
          {#each TIMEOUT_PRESETS as preset (preset.seconds)}
            <button title={`Timeout ${preset.label}`} onclick={() => void timeoutUser(subject, preset.seconds)}>{preset.label}</button>
          {/each}
        </div>
        <button class="icon-btn ban" class:confirm={confirmBan} title={confirmBan ? "Click again to ban" : "Ban"} aria-label="Ban" onclick={onBan}>
          <Ban size={16} />{#if confirmBan}<span>Ban?</span>{/if}
        </button>
      </div>
    {/if}

    <nav class="tabs">
      <button class:active={tab === "messages"} onclick={() => (tab = "messages")}><MessageSquareText size={15} /> Messages</button>
      <button class:active={tab === "details"} onclick={() => (tab = "details")}><Info size={15} /> Details</button>
    </nav>

    <div class="body">
      {#if tab === "messages"}
        {#if messages.length === 0}
          <p class="empty">No messages recorded from {author.displayName} yet.</p>
        {:else}
          {#each messages as message, i (message.id)}
            <MessageRow {message} alt={i % 2 === 1} />
          {/each}
        {/if}
      {:else}
        <dl>
          {#if platform === "twitch"}
            <dt>Account created</dt>
            <dd>
              {accountAge(info?.createdAt) ??
                (bridge.status === "ready" && !bridge.supports(2)
                  ? "Needs bridge update"
                  : infoError
                    ? `Unavailable (${infoError})`
                    : bridge.status === "ready"
                      ? "Loading…"
                      : "Needs the Chatzooka Bridge")}
            </dd>
            {#if !author.roles.broadcaster}
              <dt>Following</dt>
              <dd>{info ? (info.isFollowing ? "Yes" : "No") : "—"}</dd>
            {/if}
            {#if info?.game}
              <dt>Last streamed</dt>
              <dd>{info.game}</dd>
            {/if}
          {/if}
          <dt>First seen</dt>
          <dd>{record ? dateTimeFormat.format(record.firstSeen) : "This session"}</dd>
          <dt>Last seen</dt>
          <dd>{record ? dateTimeFormat.format(record.lastSeen) : "—"}</dd>
          <dt>Messages</dt>
          <dd>{(record?.messageCount ?? 0).toLocaleString()}</dd>
          {#if info?.description}
            <dt>Bio</dt>
            <dd class="bio">{info.description}</dd>
          {/if}
        </dl>
        {#if bridge.status === "ready" && !bridge.supports(2) && platform === "twitch"}
          <p class="hint">Update the Chatzooka Bridge in Streamer.bot to see account age and following (see Settings).</p>
        {/if}
        <label class="notes">
          Notes <span>(only you can see these)</span>
          <textarea bind:value={notes} oninput={onNotesInput} rows="3" placeholder="e.g. regular since 2024, plays Deadlock"></textarea>
        </label>
      {/if}
    </div>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.45);
    z-index: 15;
  }

  .card {
    position: fixed;
    z-index: 16;
    top: 56px;
    left: 50%;
    transform: translateX(-50%);
    width: min(620px, calc(100vw - 24px));
    max-height: calc(100vh - 80px);
    display: flex;
    flex-direction: column;
    background: #1e1e1e;
    border: 1px solid var(--border);
    border-radius: 10px;
    box-shadow: 0 16px 50px rgba(0, 0, 0, 0.6);
    overflow: hidden;
  }

  .close {
    position: absolute;
    top: 12px;
    right: 12px;
  }

  header {
    display: flex;
    gap: 14px;
    padding: 18px 48px 12px 18px;
  }

  .avatar {
    width: 56px;
    height: 56px;
    border-radius: 50%;
    object-fit: cover;
    flex-shrink: 0;
  }

  .avatar.placeholder {
    display: grid;
    place-items: center;
    background: #333;
    font-size: 22px;
    font-weight: 700;
  }

  .identity {
    min-width: 0;
  }

  .name-line {
    display: flex;
    align-items: center;
    gap: 7px;
  }

  .big-name {
    font-size: 19px;
  }

  .badge {
    width: 18px;
    height: 18px;
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 8px;
  }

  .chip {
    padding: 3px 9px;
    border-radius: 6px;
    font-size: 12.5px;
    font-weight: 600;
    color: var(--chip);
    background: color-mix(in srgb, var(--chip) 16%, transparent);
  }

  .links {
    display: flex;
    gap: 18px;
    margin-top: 8px;
  }

  .links button {
    display: flex;
    align-items: center;
    gap: 3px;
    font-size: 13px;
    color: var(--text-muted);
  }

  .links button:hover {
    color: var(--text);
  }

  .quick-actions {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 0 14px;
    padding: 8px 4px;
    border-top: 1px solid var(--border);
    font-size: 13px;
    color: var(--text-muted);
    flex-wrap: wrap;
  }

  .qa-hint {
    color: var(--text-faint);
    font-size: 12px;
  }

  .qa {
    padding: 3px 10px;
    border-radius: 5px;
    background: #2a2a2a;
    border: 1px solid var(--border);
    color: var(--text);
    font-size: 12.5px;
  }

  .qa:hover {
    background: #343434;
  }

  .mod-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 14px;
    padding: 6px 4px;
    border-top: 1px solid var(--border);
    border-bottom: 1px solid var(--border);
  }

  /* All timeout presets stay on one line; spacing shrinks on narrow windows. */
  .presets {
    flex: 1;
    min-width: 0;
    display: flex;
    justify-content: space-between;
  }

  .presets button {
    padding: 4px clamp(2px, 0.6vw, 6px);
    border-radius: 4px;
    font-size: 12.5px;
    white-space: nowrap;
    color: var(--text-muted);
  }

  .presets button:hover {
    background: #333;
    color: var(--text);
  }

  .icon-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    color: var(--text-muted);
  }

  .icon-btn:hover:not(:disabled) {
    color: var(--text);
  }

  .icon-btn:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .ban:hover,
  .ban.confirm {
    color: #ff6b6b;
  }

  .ban.confirm span {
    font-size: 12px;
    font-weight: 700;
  }

  .tabs {
    display: flex;
    gap: 4px;
    padding: 6px 14px 0;
    border-bottom: 1px solid var(--border);
  }

  .tabs button {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 10px;
    font-size: 13px;
    font-weight: 600;
    color: var(--text-muted);
    border-bottom: 2px solid transparent;
    margin-bottom: -1px;
  }

  .tabs button.active {
    color: #4fb3ff;
    border-bottom-color: #4fb3ff;
  }

  .body {
    flex: 1;
    min-height: 120px;
    overflow-y: auto;
    padding-bottom: 8px;
  }

  .empty {
    padding: 24px;
    text-align: center;
    color: var(--text-muted);
  }

  dl {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 8px 18px;
    margin: 14px 18px;
    font-size: 13.5px;
  }

  dt {
    color: var(--text-muted);
  }

  dd {
    margin: 0;
  }

  .bio {
    white-space: pre-wrap;
    user-select: text;
  }

  .hint {
    margin: 0 18px 8px;
    font-size: 12.5px;
    color: var(--text-muted);
  }

  .notes {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin: 4px 18px 12px;
    font-size: 13px;
    color: var(--text-muted);
  }

  .notes span {
    color: var(--text-faint);
    font-size: 12px;
  }

  textarea {
    resize: vertical;
    padding: 8px 10px;
    background: var(--bg-input);
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--text);
    font: inherit;
    outline: none;
  }

  textarea:focus {
    border-color: #555;
  }
</style>
