<script lang="ts">
  import { linkSafety, type SafetyStatus } from "../../linkSafety.svelte";
  import { presenceStatus } from "../../streamerbot/presence.svelte";
  import { twitchIrc } from "../../twitch/irc.svelte";
  import { FONT_CHOICES, prefs, type PlatformIcons, type RemovedMessages } from "../../prefs.svelte";
  import { toasts } from "../../toasts.svelte";
  import SettingRow from "./SettingRow.svelte";
  import Toggle from "./Toggle.svelte";

  const p = $derived(prefs.value);

  let status = $state<SafetyStatus | null>(null);
  let updating = $state(false);
  $effect(() => {
    void linkSafety.status().then((s) => (status = s));
  });

  // Re-render the "x min ago" text every 20 seconds.
  let now = $state(Date.now());
  $effect(() => {
    const t = setInterval(() => (now = Date.now()), 20_000);
    return () => clearInterval(t);
  });

  /** Whether Streamer.bot's viewer lists are arriving, so a missing feature can be diagnosed. */
  const presenceLine = $derived.by(() => {
    const s = presenceStatus;
    if (!s.lastAt) return "Status: no viewer list received from Streamer.bot yet.";
    const mins = Math.max(0, Math.round((now - s.lastAt) / 60_000));
    const when = mins < 1 ? "under a minute ago" : `${mins} min ago`;
    const from =
      s.source === "irc" ? "Twitch directly" : s.source === "event" ? "Streamer.bot's Present Viewers" : "a once-a-minute Streamer.bot check";
    return s.readable
      ? `Status: last viewer list ${when} (from ${from}), ${s.count} ${s.count === 1 ? "person" : "people"}.`
      : `Status: viewer list received ${when} but in an unexpected format (fields: ${s.keys || "none"}).`;
  });

  const safetyDescription = $derived.by(() => {
    const base = "Flags phishing and look-alike links with a ⚠. Checked on this PC against free phishing lists (Phishing.Database, OpenPhish); links are never sent anywhere.";
    if (!status) return base;
    if (!status.updatedAt) return `${base} Lists are downloading…`;
    const hours = Math.round((Date.now() - status.updatedAt) / 3_600_000);
    return `${base} ${status.domainCount.toLocaleString()} domains + ${status.urlCount.toLocaleString()} links, updated ${hours < 1 ? "under an hour" : `${hours}h`} ago.`;
  });

  async function updateLists() {
    updating = true;
    try {
      await linkSafety.updateNow();
      toasts.show("Phishing lists updated");
    } catch (e) {
      toasts.show(String(e), "error");
    } finally {
      updating = false;
      status = await linkSafety.status();
    }
  }
</script>

<h2>Settings</h2>
<p class="sub">General settings for the chat interface</p>

<div class="card">
  <h4>Font Settings</h4>
  <SettingRow title="Font Family" description="Font used for chat messages">
    <select value={p.fontFamily} onchange={(e) => prefs.set("fontFamily", e.currentTarget.value)} style:font-family={p.fontFamily || undefined}>
      {#each FONT_CHOICES as font (font)}
        <option value={font}>{font || "System default"}</option>
      {/each}
    </select>
  </SettingRow>
  <SettingRow title="Font Size" description="Set the font size for chat messages">
    <input
      class="number"
      type="number"
      min="10"
      max="28"
      value={p.fontSize}
      onchange={(e) => {
        const n = Math.round(Number(e.currentTarget.value));
        if (n >= 10 && n <= 28) prefs.set("fontSize", n);
        else e.currentTarget.value = String(p.fontSize);
      }}
    />
  </SettingRow>

  <h4>Appearance</h4>
  <SettingRow title="Alternate Background" description="Alternate the background color of every other chat message">
    <Toggle label="Alternate Background" checked={p.alternateBackground} onchange={(v) => prefs.set("alternateBackground", v)} />
  </SettingRow>
  <SettingRow title="Show Platform Icons" description="Display the source platform icon with each chat message row">
    <select value={p.platformIcons} onchange={(e) => prefs.set("platformIcons", e.currentTarget.value as PlatformIcons)}>
      <option value="always">Always</option>
      <option value="all-tab">Only in the All tab</option>
      <option value="never">Never</option>
    </select>
  </SettingRow>
  <SettingRow title="Show Avatars" description="Display the user avatar with each chat message row (YouTube sends avatars; Twitch rows show an initial)">
    <Toggle label="Show Avatars" checked={p.showAvatars} onchange={(v) => prefs.set("showAvatars", v)} />
  </SettingRow>
  <SettingRow title="Show Badges" description="Display user badges (moderator, VIP, subscriber, 7TV, etc.) with each chat message row">
    <Toggle label="Show Badges" checked={p.showBadges} onchange={(v) => prefs.set("showBadges", v)} />
  </SettingRow>
  <SettingRow title="Animate Emotes" description="Enable or disable emote animations in the chat">
    <Toggle label="Animate Emotes" checked={p.animateEmotes} onchange={(v) => prefs.set("animateEmotes", v)} />
  </SettingRow>
  <SettingRow title="7TV Name Paints" description="Show 7TV gradient and image paints on usernames">
    <Toggle label="7TV Name Paints" checked={p.sevenTvPaints} onchange={(v) => prefs.set("sevenTvPaints", v)} />
  </SettingRow>
  <SettingRow title="BetterTTV Emotes" description="Show BetterTTV emotes (global and your channel's) in Twitch and YouTube chat">
    <Toggle label="BetterTTV Emotes" checked={p.bttvEmotes} onchange={(v) => prefs.set("bttvEmotes", v)} />
  </SettingRow>
  <SettingRow title="FrankerFaceZ Emotes" description="Show FrankerFaceZ emotes (global and your channel's) in Twitch and YouTube chat">
    <Toggle label="FrankerFaceZ Emotes" checked={p.ffzEmotes} onchange={(v) => prefs.set("ffzEmotes", v)} />
  </SettingRow>
  <SettingRow title="Removed Messages" description="Deleted messages and messages from timed-out or banned users">
    <select value={p.removedMessages} onchange={(e) => prefs.set("removedMessages", e.currentTarget.value as RemovedMessages)}>
      <option value="strike">Show crossed out</option>
      <option value="hide">Hide from chat</option>
    </select>
  </SettingRow>

  <SettingRow
    title="Link Previews"
    description="Show a preview of the page when you hover a link. Pages are only fetched when you hover, never automatically."
  >
    <Toggle label="Link Previews" checked={p.linkPreviews} onchange={(v) => prefs.set("linkPreviews", v)} />
  </SettingRow>
  <SettingRow title="Link Safety Check" description={safetyDescription}>
    {#if p.linkSafety && status}
      <button class="btn" disabled={status.updating || updating} onclick={updateLists}>{status.updating || updating ? "Updating…" : "Update now"}</button>
    {/if}
    <Toggle label="Link Safety Check" checked={p.linkSafety} onchange={(v) => prefs.set("linkSafety", v)} />
  </SettingRow>

  <SettingRow
    title="Join/Leave Notices (Twitch)"
    description={`Quiet rows only you see when people join or leave your Twitch chat. Comes from Twitch through a read-only, logged-out connection (nothing is ever sent); Twitch batches these, so they can be up to a minute late, and stops sending them for chats over ~1,000 people. ${twitchIrc.status === "connected" ? "" : "Twitch connection: " + twitchIrc.status + ". "}${presenceLine}`}
  >
    <Toggle label="Join/Leave Notices" checked={p.joinLeaveNotices} onchange={(v) => prefs.set("joinLeaveNotices", v)} />
  </SettingRow>
  <SettingRow
    title="Viewer Count"
    description="Show how many people are in your chats next to the connection pill; click it to see who. Twitch counts everyone connected to chat, lurkers included; YouTube counts people who chatted in the last 30 minutes (YouTube doesn't share who's watching)."
  >
    <Toggle label="Viewer Count" checked={p.viewerCount} onchange={(v) => prefs.set("viewerCount", v)} />
  </SettingRow>
  <SettingRow
    title="Hide Bots"
    description="Leave chat bots (Nightbot, StreamElements, …), names ending in “bot” and known viewer-list crawler accounts out of the user list and viewer count"
  >
    <Toggle label="Hide Bots" checked={p.hideBots} onchange={(v) => prefs.set("hideBots", v)} />
  </SettingRow>

  <h4>Timestamps</h4>
  <SettingRow title="Show Timestamps" description="Display timestamps next to chat messages and events">
    <Toggle label="Show Timestamps" checked={p.showTimestamps} onchange={(v) => prefs.set("showTimestamps", v)} />
  </SettingRow>
  <SettingRow title="24h Timestamps" description="Display timestamps in 24 hour format">
    <Toggle label="24h Timestamps" checked={p.timestamps24h} onchange={(v) => prefs.set("timestamps24h", v)} />
  </SettingRow>
  <SettingRow title="Hide Seconds" description="Hide seconds from displayed timestamps">
    <Toggle label="Hide Seconds" checked={p.hideSeconds} onchange={(v) => prefs.set("hideSeconds", v)} />
  </SettingRow>
</div>
