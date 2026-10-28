<script lang="ts">
  // Chips under the tabs for chat settings that are on (slow mode, followers-only, …).
  // Hidden when everything is off. Clicking a Twitch chip turns that setting off.
  import { Clock, Heart, Repeat, Shield, Smile, Star, Users } from "@lucide/svelte";
  import type { Component } from "svelte";
  import { chatModes, followTimeLabel } from "../chat/chatModes.svelte";
  import { runSlashCommand } from "../chat/slashCommands";
  import { openExternal } from "../openExternal";
  import { streamerbot } from "../streamerbot/connection.svelte";
  import PlatformIcon from "./PlatformIcon.svelte";

  interface Chip {
    id: string;
    platform: "twitch" | "youtube";
    label: string;
    icon: Component<{ size?: number }>;
    title: string;
    /** Slash command that turns it off, if Chatzooka can. */
    off?: string;
    url?: string;
  }

  function followLabel(minutes: number): string {
    return minutes <= 0 ? "Followers-only" : `Followers-only (${followTimeLabel(minutes)})`;
  }

  const chips = $derived.by<Chip[]>(() => {
    const m = chatModes;
    const out: Chip[] = [];
    if (m.twitchKnown) {
      if (m.slow > 0) out.push({ id: "slow", platform: "twitch", label: `Slow ${m.slow}s`, icon: Clock, title: `Slow mode: viewers wait ${m.slow}s between messages`, off: "/slowoff" });
      if (m.followers >= 0) out.push({ id: "followers", platform: "twitch", label: followLabel(m.followers), icon: Heart, title: "Only followers can chat", off: "/followersoff" });
      if (m.subsOnly) out.push({ id: "subs", platform: "twitch", label: "Subs-only", icon: Star, title: "Only subscribers can chat", off: "/subscribersoff" });
      if (m.emoteOnly) out.push({ id: "emote", platform: "twitch", label: "Emote-only", icon: Smile, title: "Only emotes allowed in chat", off: "/emoteonlyoff" });
      if (m.unique) out.push({ id: "unique", platform: "twitch", label: "Unique chat", icon: Repeat, title: "Unique-chat mode: repeated messages are blocked. Turn it off in Twitch's chat settings." });
    }
    if (m.shield) {
      const login = streamerbot.accounts.twitch?.login;
      out.push({
        id: "shield",
        platform: "twitch",
        label: "Shield mode",
        icon: Shield,
        title: "Shield mode is on. Click to open Twitch's mod view to manage it.",
        url: login ? `https://www.twitch.tv/moderator/${login}` : undefined,
      });
    }
    if (m.youtubeMembersOnly) out.push({ id: "members", platform: "youtube", label: "Members-only", icon: Users, title: "YouTube chat is members-only. Change it in YouTube Studio's live chat settings." });
    return out;
  });

  let busy = $state<string | null>(null);

  async function clickChip(c: Chip) {
    if (c.url) return void openExternal(c.url);
    if (!c.off || busy) return;
    busy = c.id;
    await runSlashCommand(c.off, [c.platform]);
    busy = null;
  }
</script>

{#if chips.length}
  <div class="modes" aria-label="Active chat settings">
    {#each chips as c (c.id)}
      <button
        class="chip {c.platform}"
        class:clickable={!!c.off || !!c.url}
        disabled={busy === c.id}
        title={c.off ? `${c.title}. Click to turn off.` : c.title}
        onclick={() => void clickChip(c)}
      >
        <PlatformIcon platform={c.platform} size={11} />
        <c.icon size={12} />
        <span>{c.label}</span>
        {#if c.off}<span class="x" aria-hidden="true">×</span>{/if}
      </button>
    {/each}
  </div>
{/if}

<style>
  .modes {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding: 6px 10px;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }

  .chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 22px;
    padding: 0 8px;
    border-radius: 11px;
    font-size: 11.5px;
    font-weight: 600;
    background: #262626;
    border: 1px solid #333;
    color: var(--text);
    cursor: default;
  }

  .chip.twitch {
    border-color: color-mix(in srgb, var(--twitch) 45%, #333);
  }

  .chip.youtube {
    border-color: color-mix(in srgb, var(--youtube) 45%, #333);
  }

  .chip.clickable {
    cursor: pointer;
  }

  .chip.clickable:hover:not(:disabled) {
    background: #303030;
  }

  .chip:disabled {
    opacity: 0.5;
  }

  .x {
    margin-left: 1px;
    color: var(--text-muted);
    font-size: 13px;
    line-height: 1;
  }

  .chip:hover .x {
    color: var(--text);
  }
</style>
