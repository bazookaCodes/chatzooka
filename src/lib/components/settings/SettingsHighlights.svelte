<script lang="ts">
  import { Plus, RotateCcw, Trash2 } from "@lucide/svelte";
  import type { Platform } from "../../chat/types";
  import { DEFAULT_HIGHLIGHTS, prefs, type FlaggedUser, type HighlightCategory, type HighlightPattern } from "../../prefs.svelte";
  import PlatformIcon from "../PlatformIcon.svelte";
  import ColorPicker from "./ColorPicker.svelte";
  import Toggle from "./Toggle.svelte";

  const p = $derived(prefs.value);

  const CATEGORIES: { id: HighlightCategory; title: string; description: string }[] = [
    { id: "mention", title: "Mentions You", description: "Highlight messages when chat mentions you" },
    { id: "highlightedMessage", title: "Highlighted Message", description: "Highlight messages sent using the Highlighted Message power-up" },
    {
      id: "firstEver",
      title: "First Message Ever",
      description: "A viewer's first message ever in your chat (Twitch's own flag; on YouTube, the first time Chatzooka has seen them)",
    },
    { id: "firstSession", title: "First Message This Session", description: "A viewer's first message since Chatzooka was opened" },
    { id: "highlightedUser", title: "Highlighted User", description: "Always highlight specific flagged users (below)" },
    { id: "broadcaster", title: "Broadcaster", description: "Highlight messages from the broadcaster account" },
    { id: "moderator", title: "Moderator", description: "Highlight messages from moderators" },
    { id: "vip", title: "VIP", description: "Highlight messages from VIPs" },
    { id: "subscriber", title: "Subscriber", description: "Highlight messages from subscribers and members" },
  ];

  // --- Patterns ---
  function addPattern() {
    const next: HighlightPattern = { id: crypto.randomUUID(), type: "text", pattern: "", enabled: true, color: "#c27c0e" };
    prefs.set("patterns", [...p.patterns, next]);
  }
  function updatePattern(id: string, patch: Partial<HighlightPattern>) {
    prefs.set("patterns", p.patterns.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  }
  function removePattern(id: string) {
    prefs.set("patterns", p.patterns.filter((x) => x.id !== id));
  }
  function invalidRegex(pattern: string): boolean {
    try {
      new RegExp(pattern);
      return false;
    } catch {
      return true;
    }
  }

  // --- Flagged users ---
  type ListKey = "highlightUsers" | "ignoreHighlightUsers";
  let adding = $state<{ list: ListKey; platform: Platform; name: string } | null>(null);
  const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

  function startAdd(list: ListKey) {
    adding = { list, platform: "twitch", name: "" };
  }
  function confirmAdd() {
    if (!adding) return;
    const name = adding.name.trim().replace(/^@/, "").toLowerCase();
    if (name) {
      const list = p[adding.list];
      if (!list.some((u) => u.platform === adding!.platform && u.name === name)) {
        prefs.set(adding.list, [...list, { platform: adding.platform, name, addedAt: Date.now() }]);
      }
    }
    adding = null;
  }
  function removeUser(list: ListKey, u: FlaggedUser) {
    prefs.set(list, p[list].filter((x) => !(x.platform === u.platform && x.name === u.name)));
  }
</script>

<h2>Highlights</h2>
<p class="sub">Customize how chat messages are highlighted. The first enabled match (top to bottom) decides the color.</p>

<div class="card">
  <table>
    <thead>
      <tr><th>Category</th><th class="center">Enabled</th><th class="center">Color</th><th></th></tr>
    </thead>
    <tbody>
      {#each CATEGORIES as cat (cat.id)}
        {@const h = p.highlights[cat.id]}
        {@const changed = h.color !== DEFAULT_HIGHLIGHTS[cat.id].color || h.enabled !== DEFAULT_HIGHLIGHTS[cat.id].enabled}
        <tr>
          <td><div class="name">{cat.title}</div><div class="desc">{cat.description}</div></td>
          <td class="center"><Toggle label={`${cat.title} highlight`} checked={h.enabled} onchange={(v) => prefs.setHighlight(cat.id, { enabled: v })} /></td>
          <td class="center"><ColorPicker label={`${cat.title} color`} value={h.color} onchange={(c) => prefs.setHighlight(cat.id, { color: c })} /></td>
          <td class="center">
            <button class="reset" class:changed title="Reset to default" aria-label="Reset to default" onclick={() => prefs.resetHighlight(cat.id)}>
              <RotateCcw size={14} />
            </button>
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>

<h2>Highlight Patterns</h2>
<p class="sub">Highlight messages matching custom text or regex patterns.</p>
<div class="card">
  <table>
    <thead><tr><th>Match Type</th><th>Pattern</th><th class="center">Enabled</th><th class="center">Color</th><th></th></tr></thead>
    <tbody>
      {#each p.patterns as pat (pat.id)}
        <tr>
          <td>
            <select class="small" value={pat.type} onchange={(e) => updatePattern(pat.id, { type: e.currentTarget.value as "text" | "regex" })}>
              <option value="text">Text</option>
              <option value="regex">Regex</option>
            </select>
          </td>
          <td>
            <input
              class="text wide"
              class:bad={pat.type === "regex" && invalidRegex(pat.pattern)}
              value={pat.pattern}
              placeholder={pat.type === "regex" ? "e.g. ^!so\\b" : "e.g. giveaway"}
              onchange={(e) => updatePattern(pat.id, { pattern: e.currentTarget.value })}
            />
          </td>
          <td class="center"><Toggle label="Pattern enabled" checked={pat.enabled} onchange={(v) => updatePattern(pat.id, { enabled: v })} /></td>
          <td class="center"><ColorPicker label="Pattern color" value={pat.color} onchange={(c) => updatePattern(pat.id, { color: c })} /></td>
          <td class="center"><button class="reset" title="Remove" aria-label="Remove pattern" onclick={() => removePattern(pat.id)}><Trash2 size={14} /></button></td>
        </tr>
      {/each}
    </tbody>
  </table>
  {#if p.patterns.length === 0}<p class="empty">No highlight patterns yet</p>{/if}
  <button class="btn" onclick={addPattern}><Plus size={14} /> Add Highlight Pattern</button>
</div>

{#snippet userList(list: ListKey, title: string, description: string, emptyText: string)}
  <h2>{title}</h2>
  <p class="sub">{description}</p>
  <div class="card">
    <table>
      <thead><tr><th>Platform</th><th>Username</th><th>Added at</th><th class="right">Actions</th></tr></thead>
      <tbody>
        {#each p[list] as u (u.platform + u.name)}
          <tr>
            <td><PlatformIcon platform={u.platform} size={15} /></td>
            <td>{u.name}</td>
            <td class="desc">{dateFormat.format(u.addedAt)}</td>
            <td class="right"><button class="reset" title="Remove" aria-label={`Remove ${u.name}`} onclick={() => removeUser(list, u)}><Trash2 size={14} /></button></td>
          </tr>
        {/each}
      </tbody>
    </table>
    {#if p[list].length === 0 && adding?.list !== list}<p class="empty">{emptyText}</p>{/if}
    {#if adding?.list === list}
      <form class="add-row" onsubmit={(e) => { e.preventDefault(); confirmAdd(); }}>
        <select class="small" bind:value={adding.platform}>
          <option value="twitch">Twitch</option>
          <option value="youtube">YouTube</option>
        </select>
        <!-- svelte-ignore a11y_autofocus -->
        <input class="text wide" bind:value={adding.name} placeholder={adding.platform === "twitch" ? "Twitch username" : "YouTube channel name"} autofocus />
        <button class="btn" type="submit">Add</button>
        <button class="btn" type="button" onclick={() => (adding = null)}>Cancel</button>
      </form>
    {:else}
      <button class="btn" onclick={() => startAdd(list)}><Plus size={14} /> Add User</button>
    {/if}
  </div>
{/snippet}

{@render userList("highlightUsers", "Custom User Highlights", "Always highlight specific users", 'No users have been flagged with the "highlight" flag.')}
{@render userList("ignoreHighlightUsers", "Ignore Highlights", "Never highlight the following users", 'No users have been flagged with the "ignore highlights" flag.')}

<style>
  .name {
    font-weight: 600;
  }

  .center {
    text-align: center;
    width: 70px;
  }

  .right {
    text-align: right;
  }

  .reset {
    display: inline-grid;
    place-items: center;
    width: 26px;
    height: 26px;
    border-radius: 5px;
    color: var(--text-faint);
  }

  .reset.changed {
    color: #e0b030;
  }

  .reset:hover {
    background: #2e2e2e;
    color: var(--text);
  }

  select.small {
    min-width: 0;
  }

  .wide {
    width: 100%;
  }

  .bad {
    border-color: #a33 !important;
  }

  .add-row {
    display: flex;
    gap: 8px;
    align-items: center;
    margin-top: 8px;
  }
</style>
