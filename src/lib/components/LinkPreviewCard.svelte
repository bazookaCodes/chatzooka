<script lang="ts">
  // Small card with a link's title, description and image, shown while hovering a chat link.
  import { ArrowUpRight } from "@lucide/svelte";
  import { fetchPreview, linkHover, type PreviewResult } from "../linkPreview.svelte";
  import { linkSafety } from "../linkSafety.svelte";
  import { openExternal } from "../openExternal";
  import { prefs } from "../prefs.svelte";

  const target = $derived(linkHover.target);
  let result = $state<PreviewResult | null>(null);
  let card: HTMLDivElement | undefined = $state();
  let pos = $state({ left: 0, top: 0 });
  let imageFailed = $state(false);
  let confirmBlocked = $state(false);
  $effect(() => {
    void target;
    confirmBlocked = false;
  });

  const verdict = $derived(target ? linkSafety.verdict(target.url) : undefined);
  /** Flagged-dangerous links are never fetched: that would send your IP to the phishing site. */
  const blocked = $derived(verdict?.level === "danger");

  $effect(() => {
    const t = target;
    result = null;
    imageFailed = false;
    if (!t || blocked || !prefs.value.linkPreviews) return;
    void fetchPreview(t.url).then((r) => {
      if (linkHover.target === t) result = r;
    });
  });

  // Place under the link, or above it if there's no room below; keep inside the window.
  $effect(() => {
    void result;
    if (!target || !card) return;
    const { width, height } = card.getBoundingClientRect();
    const r = target.rect;
    const below = r.bottom + 6;
    const top = below + height > window.innerHeight - 8 ? Math.max(8, r.top - height - 6) : below;
    pos = { left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)), top };
  });

  function host(url: string): string {
    try {
      return new URL(url).host.replace(/^www\./, "");
    } catch {
      return url;
    }
  }
</script>

{#if target}
  <div
    class="card"
    bind:this={card}
    style:left="{pos.left}px"
    style:top="{pos.top}px"
    role="tooltip"
    onmouseenter={() => linkHover.keep()}
    onmouseleave={() => linkHover.leave()}
  >
    {#if verdict && verdict.level !== "ok"}
      <div class="safety {verdict.level}">
        <strong>{verdict.level === "danger" ? "⚠ Dangerous link" : "⚠ Be careful"}</strong>
        {#each verdict.reasons as reason (reason)}<div>{reason}</div>{/each}
        {#if blocked}<div class="note">Preview not loaded, so this site never sees your IP address.</div>{/if}
      </div>
    {/if}
    {#if blocked}
      <!-- No preview for dangerous links. -->
    {:else if !result}
      <div class="loading">Loading preview…</div>
    {:else if !result.ok}
      <div class="error">{result.error}</div>
    {:else if result.data.isImage}
      {#if !imageFailed}
        <img class="full" src={result.data.url} alt="" referrerpolicy="no-referrer" onerror={() => (imageFailed = true)} />
      {/if}
    {:else}
      {#if result.data.image && !imageFailed}
        <img class="thumb" src={result.data.image} alt="" referrerpolicy="no-referrer" onerror={() => (imageFailed = true)} />
      {/if}
      <div class="text">
        <div class="site">{result.data.siteName ?? host(result.data.url)}</div>
        {#if result.data.title}<div class="title">{result.data.title}</div>{/if}
        {#if result.data.description}<div class="description">{result.data.description}</div>{/if}
      </div>
    {/if}
    <!-- Always show where the link really goes, so look-alike links are easy to spot. -->
    <button
      class="open"
      class:danger={blocked}
      onclick={() => {
        if (blocked && !confirmBlocked) {
          confirmBlocked = true;
          return;
        }
        void openExternal(target.url);
        linkHover.close();
      }}
      title={blocked ? "Click twice to open this dangerous link anyway" : "Open in your browser"}
    >
      {#if blocked && confirmBlocked}<strong>Click again to open anyway:</strong>{/if}
      <span>{host(result?.ok ? result.data.url : target.url)}</span>
      <ArrowUpRight size={13} />
    </button>
  </div>
{/if}

<style>
  .card {
    position: fixed;
    z-index: 25;
    width: min(340px, calc(100vw - 16px));
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    border-radius: 8px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.55);
    overflow: hidden;
    user-select: text;
  }

  .loading,
  .error {
    padding: 10px 12px;
    font-size: 12.5px;
    color: var(--text-muted);
  }

  .thumb {
    display: block;
    width: 100%;
    max-height: 170px;
    object-fit: cover;
    background: #111;
  }

  .full {
    display: block;
    max-width: 100%;
    max-height: 260px;
    margin: 0 auto;
  }

  .text {
    padding: 8px 12px 4px;
  }

  .site {
    font-size: 11.5px;
    color: var(--text-muted);
  }

  .title {
    margin-top: 2px;
    font-size: 13.5px;
    font-weight: 700;
    line-height: 1.3;
  }

  .description {
    margin-top: 4px;
    font-size: 12.5px;
    color: var(--text-muted);
    line-height: 1.35;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .open {
    display: flex;
    align-items: center;
    gap: 4px;
    width: 100%;
    padding: 6px 12px 8px;
    font-size: 12px;
    color: #6cb4ff;
  }

  .open span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .open:hover span {
    text-decoration: underline;
  }

  .open.danger {
    color: #ff8a8a;
  }

  .safety {
    padding: 8px 12px;
    font-size: 12.5px;
    line-height: 1.4;
  }

  .safety.danger {
    background: #3a1a1a;
    color: #ffb4b4;
  }

  .safety.warning {
    background: #3a301a;
    color: #f0d48f;
  }

  .safety strong {
    display: block;
    margin-bottom: 2px;
  }

  .safety .note {
    margin-top: 4px;
    font-size: 11.5px;
    opacity: 0.85;
  }
</style>
