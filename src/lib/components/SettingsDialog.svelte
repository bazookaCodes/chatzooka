<script lang="ts">
  import { Eye, EyeOff, Highlighter, History, MessageSquareOff, Plug, Settings, X, Zap } from "@lucide/svelte";
  import "./settings/settings-shared.css";
  import SettingsGeneral from "./settings/SettingsGeneral.svelte";
  import SettingsHighlights from "./settings/SettingsHighlights.svelte";
  import SettingsHistory from "./settings/SettingsHistory.svelte";
  import SettingsIgnore from "./settings/SettingsIgnore.svelte";
  import SettingsQuickActions from "./settings/SettingsQuickActions.svelte";
  import { redemptions } from "../chat/redemptions.svelte";
  import { bridge } from "../streamerbot/bridge.svelte";
  import { streamerbot } from "../streamerbot/connection.svelte";
  import PlatformIcon from "./PlatformIcon.svelte";

  let { open = $bindable(), section = $bindable("general") }: { open: boolean; section?: SectionId } = $props();

  type SectionId = "general" | "highlights" | "ignore" | "connection" | "history" | "quickActions";
  const SECTIONS = [
    { id: "general", label: "General", icon: Settings },
    { id: "highlights", label: "Highlights", icon: Highlighter },
    { id: "ignore", label: "Ignore", icon: MessageSquareOff },
    { id: "connection", label: "Streamer.bot", icon: Plug },
    { id: "history", label: "History", icon: History },
    { id: "quickActions", label: "Quick Actions", icon: Zap },
  ] as const satisfies readonly { id: SectionId; label: string; icon: unknown }[];

  let dialog: HTMLDialogElement | undefined = $state();
  let host = $state("");
  let port = $state(8080);
  let endpoint = $state("/");
  let password = $state("");
  let showPassword = $state(false);
  let testing = $state(false);
  let testResult = $state<{ ok: boolean; text: string } | null>(null);
  let saving = $state(false);

  // Load the current settings each time the dialog opens.
  $effect(() => {
    if (!dialog) return;
    if (open && !dialog.open) {
      ({ host, port, endpoint, password } = streamerbot.config);
      showPassword = false;
      testResult = null;
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  });

  const draft = $derived({ host: host.trim(), port: Number(port), endpoint: endpoint.trim() || "/", password });
  const valid = $derived(draft.host.length > 0 && Number.isInteger(draft.port) && draft.port > 0 && draft.port < 65536);

  async function test() {
    testing = true;
    testResult = null;
    const result = await streamerbot.test(draft);
    testResult = result.ok
      ? { ok: true, text: `Connected to Streamer.bot ${result.version}` }
      : { ok: false, text: `Couldn't connect: ${result.error}` };
    testing = false;
  }

  async function save() {
    saving = true;
    try {
      await streamerbot.applyConfig(draft);
      open = false;
    } catch (e) {
      testResult = { ok: false, text: `Couldn't save: ${e instanceof Error ? e.message : String(e)}` };
    } finally {
      saving = false;
    }
  }

  function resetDefaults() {
    host = "127.0.0.1";
    port = 8080;
    endpoint = "/";
  }
</script>

<dialog bind:this={dialog} onclose={() => (open = false)} aria-labelledby="settings-title">
  <nav class="sidebar" aria-label="Settings sections">
    {#each SECTIONS as s (s.id)}
      <button class:active={section === s.id} title={s.label} aria-label={s.label} onclick={() => (section = s.id)}>
        <s.icon size={18} />
      </button>
    {/each}
  </nav>

  <div class="main">
    <header>
      <h2 id="settings-title">Settings <span>/ {SECTIONS.find((s) => s.id === section)?.label}</span></h2>
      <button class="icon-btn" aria-label="Close" onclick={() => (open = false)}><X size={18} /></button>
    </header>

    <div class="content settings-page">
      {#if section === "general"}
        <SettingsGeneral />
      {:else if section === "highlights"}
        <SettingsHighlights />
      {:else if section === "ignore"}
        <SettingsIgnore />
      {:else if section === "history"}
        <SettingsHistory />
      {:else if section === "quickActions"}
        <SettingsQuickActions />
      {:else}
  <section>
    <h3>Streamer.bot connection</h3>
    <p class="hint">
      In Streamer.bot, open <strong>Servers/Clients → WebSocket Server</strong>, make sure it's enabled and started, and
      match these settings.
    </p>

    <div class="grid">
      <label>
        Host
        <input bind:value={host} spellcheck="false" autocomplete="off" />
      </label>
      <label>
        Port
        <input type="number" min="1" max="65535" bind:value={port} />
      </label>
      <label>
        Endpoint
        <input bind:value={endpoint} spellcheck="false" autocomplete="off" />
      </label>
    </div>

    <label>
      Password <span class="optional">(only if authentication is turned on in Streamer.bot)</span>
      <span class="password">
        <input type={showPassword ? "text" : "password"} bind:value={password} autocomplete="off" />
        <button
          class="icon-btn"
          type="button"
          aria-label={showPassword ? "Hide password" : "Show password"}
          onclick={() => (showPassword = !showPassword)}
        >
          {#if showPassword}<EyeOff size={16} />{:else}<Eye size={16} />{/if}
        </button>
      </span>
    </label>
    <p class="hint">The password is stored in your system's credential manager, not in a file.</p>

    {#if testResult}
      <p class="result" class:ok={testResult.ok}>{testResult.text}</p>
    {/if}

    <div class="row-buttons">
      <button class="btn" onclick={resetDefaults}>Defaults</button>
      <span class="spacer"></span>
      <button class="btn" disabled={!valid || testing} onclick={test}>{testing ? "Testing…" : "Test connection"}</button>
      <button class="btn primary" disabled={!valid || saving} onclick={save}>{saving ? "Saving…" : "Save"}</button>
    </div>
  </section>

  <section>
    <h3>Status</h3>
    <dl>
      <dt>Streamer.bot</dt>
      <dd>
        {#if streamerbot.status === "connected"}
          Connected{streamerbot.version ? ` (v${streamerbot.version})` : ""}
        {:else if streamerbot.status === "authFailed"}
          {streamerbot.error}
        {:else if streamerbot.status === "connecting"}
          Connecting…
        {:else}
          Not reachable at {streamerbot.address}
        {/if}
      </dd>
      <dt><PlatformIcon platform="twitch" size={14} /> Twitch</dt>
      <dd>{streamerbot.accounts.twitch?.displayName ?? "Not connected in Streamer.bot"}</dd>
      <dt><PlatformIcon platform="youtube" size={14} /> YouTube</dt>
      <dd>{streamerbot.accounts.youtube?.name ?? "Not connected in Streamer.bot"}</dd>
      <dt>Chatzooka Bridge</dt>
      <dd class="bridge">
        {#if bridge.outdated}
          <span class="warn">Update available (v{bridge.version} installed)</span>
          <button class="link-btn" onclick={() => void redemptions.refresh()}>Check again</button>
        {:else if bridge.status === "ready"}
          Ready (moderation enabled)
        {:else if bridge.status === "unknown"}
          Checking…
        {:else}
          <span class="warn">{bridge.status === "missing" ? "Not set up" : bridge.detail}</span>
          <button class="link-btn" onclick={() => void bridge.check()}>Check again</button>
        {/if}
      </dd>
    </dl>
    {#if bridge.outdated}
      <p class="hint bridge-hint">
        A newer <strong>Chatzooka Bridge</strong> is available (adds slash commands like /slow, /clear, /announce, /vip and /shoutout). Replace the code in the
        Streamer.bot action with the latest <code>streamerbot/ChatzookaBridge.cs</code> and compile.
      </p>
    {:else if bridge.status === "missing"}
      <p class="hint bridge-hint">
        Moderation needs the <strong>Chatzooka Bridge</strong> action in Streamer.bot. Setup steps are in
        <code>streamerbot/README.md</code> in the Chatzooka folder.
      </p>
    {/if}
  </section>
      {/if}
    </div>
  </div>
</dialog>

<style>
  /* Full-window settings, like Streamer.bot's: icon sidebar on the left, pages on the right. */
  dialog {
    width: calc(100vw - 16px);
    height: calc(100vh - 16px);
    max-width: none;
    max-height: none;
    padding: 0;
    background: #181818;
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 10px;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
    user-select: text;
    overflow: hidden;
  }

  dialog[open] {
    display: flex;
  }

  dialog::backdrop {
    background: rgba(0, 0, 0, 0.55);
  }

  .sidebar {
    display: flex;
    flex-direction: column;
    gap: 4px;
    width: 46px;
    padding: 8px 6px;
    border-right: 1px solid var(--border);
    flex-shrink: 0;
  }

  .sidebar button {
    display: grid;
    place-items: center;
    height: 34px;
    border-radius: 7px;
    color: var(--text-muted);
  }

  .sidebar button:hover {
    color: var(--text);
    background: #262626;
  }

  .sidebar button.active {
    color: #1a9fe0;
    background: #222;
  }

  .main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid var(--border);
  }

  h2 {
    margin: 0;
    font-size: 14px;
  }

  h2 span {
    color: var(--text-muted);
    font-weight: 600;
  }

  .content {
    flex: 1;
    overflow-y: auto;
    padding: 14px 16px 24px;
  }

  .content > section {
    padding: 4px 0 14px;
  }

  h3 {
    margin: 0 0 6px;
    font-size: 14px;
  }

  section {
    padding: 10px 16px 14px;
  }

  section + section {
    border-top: 1px solid var(--border);
  }

  .hint {
    margin: 0 0 10px;
    color: var(--text-muted);
    font-size: 12.5px;
    line-height: 17px;
  }

  .grid {
    display: grid;
    grid-template-columns: 1fr 90px 70px;
    gap: 8px;
    margin-bottom: 10px;
  }

  label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 12.5px;
    color: var(--text-muted);
  }

  .optional {
    font-size: 11.5px;
    color: var(--text-faint);
  }

  input {
    height: 32px;
    padding: 0 10px;
    background: var(--bg-input);
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--text);
    outline: none;
    min-width: 0;
  }

  input:focus {
    border-color: #555;
  }

  .password {
    display: flex;
    align-items: center;
    position: relative;
  }

  .password input {
    flex: 1;
    padding-right: 34px;
  }

  .password .icon-btn {
    position: absolute;
    right: 9px;
  }

  .icon-btn {
    display: grid;
    place-items: center;
    color: var(--text-muted);
  }

  .icon-btn:hover {
    color: var(--text);
  }

  .result {
    margin: 8px 0 0;
    padding: 6px 10px;
    border-radius: 6px;
    font-size: 13px;
    background: #2a1717;
    color: #f0b4b4;
  }

  .result.ok {
    background: #15281b;
    color: #9ee0b0;
  }

  .row-buttons {
    display: flex;
    gap: 8px;
    margin-top: 12px;
  }

  .spacer {
    flex: 1;
  }

  .btn {
    height: 30px;
    padding: 0 12px;
    border: 1px solid var(--border);
    border-radius: 6px;
    font-size: 13px;
  }

  .btn:hover:not(:disabled) {
    background: #2e2e2e;
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .btn.primary {
    background: #e8e8e8;
    color: #111;
    border-color: #e8e8e8;
  }

  .btn.primary:hover:not(:disabled) {
    background: #fff;
  }

  dl {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 6px 14px;
    margin: 0;
    font-size: 13px;
  }

  dt {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--text-muted);
  }

  dd {
    margin: 0;
  }

  .warn {
    color: #f0b4b4;
  }

  .link-btn {
    margin-left: 8px;
    color: #6cb4ff;
    text-decoration: underline;
    font-size: 12.5px;
  }

  .bridge-hint {
    margin: 10px 0 0;
  }

  code {
    font-size: 12px;
    background: var(--bg-input);
    padding: 1px 4px;
    border-radius: 3px;
  }
</style>
