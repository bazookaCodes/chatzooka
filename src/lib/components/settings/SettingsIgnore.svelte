<script lang="ts">
  import { Plus, Trash2 } from "@lucide/svelte";
  import type { Platform } from "../../chat/types";
  import { prefs, type FlaggedUser, type IgnoredDisplay } from "../../prefs.svelte";
  import PlatformIcon from "../PlatformIcon.svelte";
  import SettingRow from "./SettingRow.svelte";

  const p = $derived(prefs.value);
  const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

  let addingUser = $state<{ platform: Platform; name: string } | null>(null);
  let addingWord = $state<string | null>(null);

  function confirmUser() {
    if (!addingUser) return;
    const name = addingUser.name.trim().replace(/^@/, "").toLowerCase();
    const platform = addingUser.platform;
    if (name && !p.ignoredUsers.some((u) => u.platform === platform && u.name === name)) {
      prefs.set("ignoredUsers", [...p.ignoredUsers, { platform, name, addedAt: Date.now() }]);
    }
    addingUser = null;
  }
  function removeUser(u: FlaggedUser) {
    prefs.set("ignoredUsers", p.ignoredUsers.filter((x) => !(x.platform === u.platform && x.name === u.name)));
  }

  function confirmWord() {
    const word = addingWord?.trim();
    if (word && !p.ignoredWords.some((w) => w.toLowerCase() === word.toLowerCase())) {
      prefs.set("ignoredWords", [...p.ignoredWords, word]);
    }
    addingWord = null;
  }
  function removeWord(word: string) {
    prefs.set("ignoredWords", p.ignoredWords.filter((w) => w !== word));
  }
</script>

<h2>Ignore</h2>
<p class="sub">
  Hide chat you don't want to see. This only changes what Chatzooka shows on this computer: nothing is sent to Twitch or YouTube, and
  the messages are still saved to history. Your own messages, events and the Mod actions log are never hidden.
</p>

<div class="card">
  <SettingRow title="Ignored Messages" description="Leave them out of chat completely, or show a one-line “hidden message” you can click to read">
    <select value={p.ignoredDisplay} onchange={(e) => prefs.set("ignoredDisplay", e.currentTarget.value as IgnoredDisplay)}>
      <option value="hide">Hide</option>
      <option value="collapse">Collapse</option>
    </select>
  </SettingRow>
</div>

<h2>Ignored Users</h2>
<p class="sub">Hide everything these users say. You can also right-click a message and choose “Ignore”.</p>
<div class="card">
  <table>
    <thead><tr><th>Platform</th><th>Username</th><th>Added at</th><th class="right">Actions</th></tr></thead>
    <tbody>
      {#each p.ignoredUsers as u (u.platform + u.name)}
        <tr>
          <td><PlatformIcon platform={u.platform} size={15} /></td>
          <td>{u.name}</td>
          <td class="desc">{dateFormat.format(u.addedAt)}</td>
          <td class="right"><button class="remove" title="Stop ignoring" aria-label={`Stop ignoring ${u.name}`} onclick={() => removeUser(u)}><Trash2 size={14} /></button></td>
        </tr>
      {/each}
    </tbody>
  </table>
  {#if p.ignoredUsers.length === 0 && !addingUser}<p class="empty">No ignored users.</p>{/if}
  {#if addingUser}
    <form class="add-row" onsubmit={(e) => { e.preventDefault(); confirmUser(); }}>
      <select class="small" bind:value={addingUser.platform}>
        <option value="twitch">Twitch</option>
        <option value="youtube">YouTube</option>
      </select>
      <!-- svelte-ignore a11y_autofocus -->
      <input class="text wide" bind:value={addingUser.name} placeholder={addingUser.platform === "twitch" ? "Twitch username" : "YouTube channel name"} autofocus />
      <button class="btn" type="submit">Add</button>
      <button class="btn" type="button" onclick={() => (addingUser = null)}>Cancel</button>
    </form>
  {:else}
    <button class="btn" onclick={() => (addingUser = { platform: "twitch", name: "" })}><Plus size={14} /> Add User</button>
  {/if}
</div>

<h2>Ignored Words</h2>
<p class="sub">Hide messages containing any of these words or phrases. Whole words only, any case: “gg” hides “GG wp” but not “eggs”.</p>
<div class="card">
  <table>
    <thead><tr><th>Word or phrase</th><th class="right">Actions</th></tr></thead>
    <tbody>
      {#each p.ignoredWords as word (word)}
        <tr>
          <td>{word}</td>
          <td class="right"><button class="remove" title="Remove" aria-label={`Remove ${word}`} onclick={() => removeWord(word)}><Trash2 size={14} /></button></td>
        </tr>
      {/each}
    </tbody>
  </table>
  {#if p.ignoredWords.length === 0 && addingWord === null}<p class="empty">No ignored words.</p>{/if}
  {#if addingWord !== null}
    <form class="add-row" onsubmit={(e) => { e.preventDefault(); confirmWord(); }}>
      <!-- svelte-ignore a11y_autofocus -->
      <input class="text wide" bind:value={addingWord} placeholder="e.g. spoiler" autofocus />
      <button class="btn" type="submit">Add</button>
      <button class="btn" type="button" onclick={() => (addingWord = null)}>Cancel</button>
    </form>
  {:else}
    <button class="btn" onclick={() => (addingWord = "")}><Plus size={14} /> Add Word</button>
  {/if}
</div>

<style>
  .right {
    text-align: right;
  }

  .remove {
    display: inline-grid;
    place-items: center;
    width: 26px;
    height: 26px;
    border-radius: 5px;
    color: var(--text-faint);
  }

  .remove:hover {
    background: #2e2e2e;
    color: var(--text);
  }

  select.small {
    min-width: 0;
  }

  .wide {
    width: 100%;
  }

  .add-row {
    display: flex;
    gap: 8px;
    align-items: center;
    margin-top: 8px;
  }
</style>
