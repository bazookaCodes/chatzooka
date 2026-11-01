<script lang="ts" module>
  // Formatters are shared by all rows (creating one per row is slow with thousands of messages).
  const formatters = new Map<string, Intl.DateTimeFormat>();
  /** Dangerous links clicked once and waiting for a confirming second click. */
  const confirmOpen = new Set<string>();
  function formatter(opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
    const key = JSON.stringify(opts);
    let f = formatters.get(key);
    if (!f) formatters.set(key, (f = new Intl.DateTimeFormat(undefined, opts)));
    return f;
  }
</script>

<script lang="ts">
  import { highlightFor } from "../chat/highlights";
  import { linkHover } from "../linkPreview.svelte";
  import { linkSafety } from "../linkSafety.svelte";
  import { openExternal } from "../openExternal";
  import { toasts } from "../toasts.svelte";
  import { contextMenu } from "../chat/contextMenu.svelte";
  import { canModerate } from "../chat/moderation";
  import { MOD_ICONS } from "../chat/modIcons";
  import type { ChatMessage, Fragment } from "../chat/types";
  import { cosmetics } from "../seventv/cosmetics.svelte";
  import ModActions from "./ModActions.svelte";
  import PaintedName from "./PaintedName.svelte";
  import RedemptionButtons from "./RedemptionButtons.svelte";
  import PlatformIcon from "./PlatformIcon.svelte";
  import { prefs } from "../prefs.svelte";

  let {
    message,
    alt = false,
    showPlatform = true,
  }: { message: ChatMessage; alt?: boolean; showPlatform?: boolean } = $props();

  const p = $derived(prefs.value);

  const timeFormat = $derived.by(() => {
    if (!p.showTimestamps) return null;
    const opts: Intl.DateTimeFormatOptions = { hour: p.timestamps24h ? "2-digit" : "numeric", minute: "2-digit", hour12: !p.timestamps24h };
    if (!p.hideSeconds) opts.second = "2-digit";
    return formatter(opts);
  });
  const time = $derived(timeFormat?.format(message.timestamp) ?? null);
  // The widest times this format can show (12:59 AM and PM). Invisible copies sit under the real
  // time so "9:13 PM" and "10:41 AM" take the same width and the names after them line up.
  const timeSizers = $derived(
    timeFormat ? [...new Set([0, 12].map((h) => timeFormat.format(new Date(2000, 0, 1, h, 59, 59))))] : [],
  );
  const highlight = $derived(highlightFor(message));
  const sevenTvBadge = $derived(p.showBadges ? cosmetics.badgeFor(message.platform, message.author.id) : null);
  const platformIcon = $derived(showPlatform && p.platformIcons !== "never");

  /** Still images instead of animations when "Animate emotes" is off. */
  function emoteSrc(url: string): string {
    if (p.animateEmotes) return url;
    return url
      .replace(/(cdn\.7tv\.app\/emote\/[^/]+\/\dx)\.(webp|gif|avif)/, "$1_static.webp")
      .replace(/(static-cdn\.jtvnw\.net\/emoticons\/v2\/[^/]+\/)default\//, "$1static/")
      .replace(/(cdn\.betterttv\.net\/emote\/[^/]+)\/(\dx\.webp)$/, "$1/static/$2")
      .replace(/(cdn\.frankerfacez\.com\/emote\/\d+)\/animated\/(\d)/, "$1/$2");
  }

  const ACCENTS: Partial<Record<ChatMessage["kind"], string>> = {
    redemption: "#a970ff",
    sub: "#a970ff",
    gift: "#ff6ec7",
    cheer: "#f5a623",
    raid: "#ff7043",
    follow: "#4fc3f7",
    announcement: "#5e84f1",
    superchat: "#ffca28",
    member: "#2ba640",
    system: "#8c8c8c",
    modaction: "#e57373",
    presence: "#5c5c5c",
  };
  const isEventRow = $derived(message.kind !== "chat" && message.kind !== "action");
  const modIcon = $derived(message.event?.icon ? MOD_ICONS[message.event.icon] : undefined);

  type EmoteFragment = Extract<Fragment, { type: "emote" }>;
  type Piece = Exclude<Fragment, EmoteFragment> | { type: "emote"; base: EmoteFragment; overlays: EmoteFragment[] };

  // Zero-width emotes (e.g. a hat or rain effect) draw on top of the emote before them.
  // Check this message's links (verdicts appear as ⚠ marks once ready).
  $effect(() => {
    const urls = message.fragments.flatMap((f) => (f.type === "link" ? [f.url] : []));
    if (urls.length) linkSafety.ensure(urls);
  });

  /** Opens a link; a flagged-dangerous one needs a second click within 5 seconds. */
  function openLink(url: string) {
    linkHover.close();
    const v = linkSafety.verdict(url);
    if (v?.level === "danger" && !confirmOpen.has(url)) {
      confirmOpen.add(url);
      setTimeout(() => confirmOpen.delete(url), 5000);
      toasts.show(`Dangerous link: ${v.reasons[0]}. Click it again within 5 seconds to open anyway.`, "error", 6000);
      return;
    }
    confirmOpen.delete(url);
    void openExternal(url);
  }

  const pieces = $derived.by(() => {
    const out: Piece[] = [];
    for (const f of message.fragments) {
      if (f.type === "emote") {
        let prev = out.at(-1);
        // Skip back over the single space that separates emotes.
        if (f.zeroWidth && prev?.type === "text" && prev.text.trim() === "" && out.at(-2)?.type === "emote") {
          out.pop();
          prev = out.at(-1);
        }
        if (f.zeroWidth && prev?.type === "emote") prev.overlays.push(f);
        else out.push({ type: "emote", base: f, overlays: [] });
      } else {
        out.push(f);
      }
    }
    return out;
  });
</script>

<div
  class="row"
  class:alt={alt && p.alternateBackground}
  class:action={message.kind === "action"}
  style:--action-color={message.author.color}
  class:event={isEventRow && message.kind !== "presence"}
  class:presence={message.kind === "presence"}
  style:--accent={isEventRow ? ACCENTS[message.kind] : undefined}
  class:hl={!!highlight}
  class:labelled={!!highlight?.label}
  style:--hl={highlight?.color}
  class:deleted={message.deleted}
  role="listitem"
  oncontextmenu={(e) => {
    e.preventDefault();
    contextMenu.open(message, e.clientX, e.clientY);
  }}
>
  {#if canModerate(message) && !message.deleted}
    <ModActions {message} />
  {/if}
  {#if highlight?.label}
    <span class="hl-label">{highlight.label}</span>
  {/if}
  {#if time}<span class="time">{#each timeSizers as s (s)}<span class="time-sizer" aria-hidden="true">{s}</span>{/each}<span>{time}</span></span>{/if}
  {#if platformIcon}<span class="platform"><PlatformIcon platform={message.platform} size={15} /></span>{/if}
  {#if p.showAvatars}
    {#if message.author.avatarUrl}
      <img class="avatar" src={message.author.avatarUrl} alt="" referrerpolicy="no-referrer" />
    {:else}
      <span class="avatar initial">{message.author.displayName.charAt(0).toUpperCase()}</span>
    {/if}
  {/if}
  {#if p.showBadges}
    {#each message.author.badges as badge (badge.id)}
      <img class="badge" src={badge.imageUrl} alt={badge.title} title={badge.title} />
    {/each}
  {/if}
  {#if sevenTvBadge}
    <img class="badge" src={sevenTvBadge.imageUrl} alt={sevenTvBadge.title} title={sevenTvBadge.title} />
  {/if}

  {#if message.kind === "redemption" && message.redemption}
    <PaintedName author={message.author} platform={message.platform} />
    <span class="headline">
      redeemed <strong>{message.redemption.title}</strong>
      <span class="amount">{message.redemption.cost.toLocaleString()}</span>
      {#if message.platform === "twitch"}<RedemptionButtons {message} />{/if}
    </span>
    {#if message.redemption.input}
      <span class="event-text">{message.redemption.input}</span>
    {/if}
  {:else if isEventRow}
    <PaintedName author={message.author} platform={message.platform} />
    <span class="headline">
      {message.event?.headline ?? ""}
      {#if message.event?.amount}<span class="amount">{message.event.amount}</span>{/if}
    </span>
    {#if pieces.length}
      <span class="event-text text">{@render messageText()}</span>
    {/if}
  {:else}
    <PaintedName author={message.author} platform={message.platform} /><span class="colon">:</span>
    <span class="text">{@render messageText()}</span>
  {/if}
  {#if message.modNote}
    <span class="mod-note">{message.modNote}</span>
  {/if}
  {#if modIcon}
    <span class="mod-icon" style:color={modIcon.color} aria-hidden="true"><modIcon.icon size={15} /></span>
  {/if}
</div>

{#snippet messageText()}
  {#each pieces as piece, i (i)}
    {#if piece.type === "text"}{piece.text}{:else if piece.type === "emote"}<span class="emote-stack"
        ><img class="emote" src={emoteSrc(piece.base.url)} alt={piece.base.name} title={piece.base.name} />{#each piece.overlays as overlay, j (j)}<img
            class="emote overlay"
            src={emoteSrc(overlay.url)}
            alt={overlay.name}
            title={overlay.name}
          />{/each}</span
      >{:else if piece.type === "mention"}<span class="mention">{piece.text}</span
      >{:else if piece.type === "link"}{@const verdict = linkSafety.verdict(piece.url)}{#if verdict && verdict.level !== "ok"}<span
            class="link-flag {verdict.level}"
            title={verdict.reasons.join("\n")}
            aria-label={verdict.level === "danger" ? "Dangerous link" : "Suspicious link"}>⚠</span
          >{/if}<a
          class="link"
          class:danger={verdict?.level === "danger"}
          class:warning={verdict?.level === "warning"}
          href={piece.url}
          onclick={(e) => { e.preventDefault(); openLink(piece.url); }}
          onmouseenter={(e) => (p.linkPreviews || verdict?.level === "danger") && linkHover.enter(piece.url, e.currentTarget)}
          onmouseleave={() => linkHover.leave()}>{piece.url}</a
        >{/if}
  {/each}
{/snippet}

<style>
  .row {
    position: relative;
    padding: 7px 14px 7px 28px;
    line-height: 1.45;
    overflow-wrap: anywhere;
    user-select: text;
    /* Lets the browser skip layout/paint for rows that are off screen. */
    content-visibility: auto;
    contain-intrinsic-size: auto 34px;
  }

  .row.alt {
    background: var(--bg-row-alt);
  }

  .action .text {
    font-style: italic;
    color: var(--action-color, inherit);
  }

  .row:hover {
    background: var(--bg-row-hover);
  }

  .time {
    color: var(--text-muted);
    font-size: 0.93em;
    margin-right: 6px;
    font-variant-numeric: tabular-nums;
    display: inline-grid;
    justify-items: end;
  }

  .time > span {
    grid-area: 1 / 1;
  }

  .time-sizer {
    visibility: hidden;
    user-select: none;
  }

  .platform,
  .badge {
    display: inline-block;
    vertical-align: -3px;
    margin-right: 4px;
  }

  .badge {
    width: 18px;
    height: 18px;
  }

  .colon {
    margin-right: 4px;
  }

  .emote-stack {
    display: inline-grid;
    vertical-align: middle;
    margin: -4px 1px;
  }

  /* All emotes in a stack share one grid cell, centered on each other. */
  .emote-stack > .emote {
    grid-area: 1 / 1;
    place-self: center;
  }

  .emote {
    height: calc(var(--font-size) * 2);
    max-width: 112px;
    object-fit: contain;
  }

  .mention {
    font-weight: 600;
  }

  .link {
    color: #6cb4ff;
    text-decoration: underline;
  }

  .link.danger {
    color: #ff7676;
    text-decoration: underline wavy #ff4d4d;
  }

  .link.warning {
    text-decoration-color: #e0b030;
  }

  .link-flag {
    margin-right: 3px;
    font-weight: 700;
    cursor: help;
  }

  .link-flag.danger {
    color: #ff5555;
  }

  .link-flag.warning {
    color: #e0b030;
  }

  /* Event rows: tinted with the event's accent color and a bar on the left. */
  .event,
  .event.alt,
  .event:hover {
    background: color-mix(in srgb, var(--accent) 13%, var(--bg));
    box-shadow: inset 3px 0 0 var(--accent);
  }

  .headline {
    margin-left: 4px;
  }

  /* Private join/leave notices: quiet, smaller, no tint. */
  .presence {
    padding-top: 3px;
    padding-bottom: 3px;
    font-size: 0.88em;
    color: var(--text-muted);
    opacity: 0.8;
  }

  .presence :global(.name) {
    font-weight: 600;
  }

  .amount {
    display: inline-block;
    margin-left: 4px;
    padding: 0 6px;
    border-radius: 4px;
    background: color-mix(in srgb, var(--accent) 30%, transparent);
    color: var(--text);
    font-weight: 700;
    font-size: 0.93em;
    line-height: 18px;
  }

  .event-text {
    display: block;
    margin-top: 3px;
  }

  /* Highlighted chat messages (Settings → Highlights): tinted with the highlight color, plus a
     corner label for labelled ones like "First message ever", as in Streamer.bot. */
  .hl,
  .hl.alt {
    background: color-mix(in srgb, var(--hl) 16%, var(--bg));
  }

  .hl:hover {
    background: color-mix(in srgb, var(--hl) 22%, var(--bg));
  }

  /* Room above the text for the corner label, so it never sits on top of the message when the
     window is narrow. */
  .row.labelled {
    padding-top: 15px;
  }

  .hl-label {
    position: absolute;
    top: 2px;
    right: 10px;
    line-height: 12px;
    font-size: 9.5px;
    font-weight: 800;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: color-mix(in srgb, var(--hl) 75%, white);
    pointer-events: none;
  }

  .avatar {
    display: inline-block;
    width: 20px;
    height: 20px;
    margin-right: 5px;
    border-radius: 50%;
    vertical-align: -5px;
    object-fit: cover;
  }

  .avatar.initial {
    background: #3a3a3a;
    color: var(--text-muted);
    font-size: 11px;
    font-weight: 700;
    line-height: 20px;
    text-align: center;
  }

  .deleted .text,
  .deleted .event-text {
    color: var(--text-faint);
    text-decoration: line-through;
  }

  .deleted .emote {
    opacity: 0.35;
  }

  /* Mod actions rows: icon at the right edge, like Streamer.bot's chat. */
  .row:has(.mod-icon) {
    padding-right: 36px;
  }

  .mod-icon {
    position: absolute;
    right: 12px;
    top: 50%;
    transform: translateY(-50%);
    display: flex;
    opacity: 0.85;
  }

  .mod-note {
    margin-left: 6px;
    font-size: 11.5px;
    color: #e57373;
    font-style: italic;
  }
</style>
