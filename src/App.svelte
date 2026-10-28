<script lang="ts">
  import { chat } from "./lib/chat/store.svelte";
  import { filterForTab, type TabId } from "./lib/chat/types";
  import ChatView from "./lib/components/ChatView.svelte";
  import Composer from "./lib/components/Composer.svelte";
  import ConnectionBanner from "./lib/components/ConnectionBanner.svelte";
  import ContextMenu from "./lib/components/ContextMenu.svelte";
  import EventsPanel from "./lib/components/EventsPanel.svelte";
  import LinkPreviewCard from "./lib/components/LinkPreviewCard.svelte";
  import ModeBar from "./lib/components/ModeBar.svelte";
  import Toasts from "./lib/components/Toasts.svelte";
  import UserCard from "./lib/components/UserCard.svelte";
  import { bridge } from "./lib/streamerbot/bridge.svelte";
  import { redemptions } from "./lib/chat/redemptions.svelte";
  import SettingsDialog from "./lib/components/SettingsDialog.svelte";
  import TabBar from "./lib/components/TabBar.svelte";
  import { pruneHistory, recentMessages } from "./lib/db/history";
  import { prefs } from "./lib/prefs.svelte";
  import { cosmetics } from "./lib/seventv/cosmetics.svelte";
  import { loadSetting, saveSetting } from "./lib/settings";
  import { streamerbot } from "./lib/streamerbot/connection.svelte";
  import { startChatEvents } from "./lib/streamerbot/events";

  startChatEvents();
  void streamerbot.start();

  // History cleanup: once at startup, then every 6 hours while running.
  const prune = () => void pruneHistory(prefs.value.historyDays).catch((e) => console.warn("History cleanup failed", e));
  prune();

  // Open where chat left off: put the most recent saved messages back on screen.
  void recentMessages(500)
    .then((saved) => {
      chat.restore(saved);
      for (const m of saved) cosmetics.request(m.platform, m.author.id);
    })
    .catch((e) => console.warn("Couldn't restore chat history", e));
  setInterval(prune, 6 * 3_600_000);

  // Handy for poking at live state from the dev tools console.
  if (import.meta.env.DEV) {
    void import("./lib/dev/stress").then(({ stress }) =>
      Object.assign(window, { __chatzooka: { streamerbot, chat, cosmetics, redemptions, bridge, stress } }),
    );
  }

  let activeTab = $state<TabId>(loadSetting("activeTab", "all"));
  $effect(() => saveSetting("activeTab", activeTab));

  let settingsOpen = $state(false);
  let settingsSection = $state<"general" | "highlights" | "connection" | "history" | "quickActions">("general");
  const openSettings = (section: typeof settingsSection = "general") => {
    settingsSection = section;
    settingsOpen = true;
  };
  const openConnectionSettings = () => openSettings("connection");

  const visible = $derived.by(() => {
    const list = filterForTab(chat.messages, activeTab);
    // "Hide removed messages" applies to the chat tabs; the Mod actions log always shows them.
    const shown = prefs.value.joinLeaveNotices ? list : list.filter((m) => m.kind !== "presence");
    return prefs.value.removedMessages === "hide" && activeTab !== "mod" ? shown.filter((m) => !m.deleted) : shown;
  });

  // Unread = arrived since you last looked at that tab.
  const TABS: TabId[] = ["all", "twitch", "youtube", "events", "mod"];
  let lastSeenSeq = $state<Record<TabId, number>>({ all: 0, twitch: 0, youtube: 0, events: 0, mod: 0 });
  $effect(() => {
    // Viewing a tab marks everything in it as seen. All shows every platform's chat, so it
    // also counts as seeing the Twitch and YouTube tabs; Events keeps its own count.
    const latest = chat.messages.at(-1)?.seq ?? 0;
    const seen: TabId[] = activeTab === "all" ? ["all", "twitch", "youtube"] : [activeTab];
    for (const tab of seen) if (lastSeenSeq[tab] !== latest) lastSeenSeq[tab] = latest;
  });
  const unread = $derived(
    Object.fromEntries(
      TABS.map((t) => [t, filterForTab(chat.messages, t).filter((m) => (m.seq ?? 0) > lastSeenSeq[t] && m.kind !== "presence").length]),
    ) as Record<TabId, number>,
  );
</script>

<div class="app">
  <TabBar bind:active={activeTab} {unread} onOpenSettings={() => openSettings()} />
  <ConnectionBanner onOpenSettings={openConnectionSettings} />
  {#if activeTab !== "mod"}<ModeBar />{/if}
  {#if activeTab === "events"}
    <EventsPanel messages={visible} />
  {:else}
    <ChatView messages={visible} tab={activeTab} />
  {/if}
  <!-- The Mod actions tab is a log, not a chat, so the message box is hidden there (kept mounted
       so a half-typed message survives switching tabs). -->
  <div class="composer-wrap" hidden={activeTab === "mod"}>
    <Composer onOpenSettings={openConnectionSettings} />
  </div>
</div>

<SettingsDialog bind:open={settingsOpen} bind:section={settingsSection} />
<UserCard />
<ContextMenu />
<LinkPreviewCard />
<Toasts />

<style>
  .app {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .composer-wrap[hidden] {
    display: none;
  }
</style>
