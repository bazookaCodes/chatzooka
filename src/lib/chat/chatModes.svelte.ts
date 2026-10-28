// Current chat settings (slow mode, followers-only, …) for the chips under the tabs.
//  - Twitch modes come from ROOMSTATE on Chatzooka's read-only Twitch connection: a full set when
//    it joins, then just what changed.
//  - Shield mode (Twitch) and members-only (YouTube) come from Streamer.bot events.
import type { ModIcon } from "./modIcons";

/** "30m", "2h", "7d" for a followers-only minimum. */
export function followTimeLabel(minutes: number): string {
  if (minutes % 1440 === 0) return `${minutes / 1440}d`;
  if (minutes % 60 === 0) return `${minutes / 60}h`;
  return `${minutes}m`;
}

export interface ModeChange {
  headline: string;
  icon: ModIcon;
}

class ChatModes {
  /** Seconds between messages; 0 = off. */
  slow = $state(0);
  /** Minimum follow time in minutes; -1 = off, 0 = any follower. */
  followers = $state(-1);
  subsOnly = $state(false);
  emoteOnly = $state(false);
  /** Twitch "unique chat" (r9k): no repeated messages. */
  unique = $state(false);
  shield = $state(false);
  youtubeMembersOnly = $state(false);
  /** Twitch modes are only known once the connection has joined. */
  twitchKnown = $state(false);

  /**
   * ROOMSTATE tags from Twitch (any subset). Returns what changed, for the Mod actions log
   * (nothing for the full set Twitch sends when the connection joins).
   */
  applyRoomState(tags: Record<string, string>): ModeChange[] {
    const changes: ModeChange[] = [];
    const known = this.twitchKnown;
    if ("slow" in tags) {
      const slow = Number(tags["slow"]) || 0;
      if (known && slow !== this.slow) changes.push(slow ? { headline: `slow mode on (${slow}s)`, icon: "slow" } : { headline: "slow mode off", icon: "slow" });
      this.slow = slow;
    }
    if ("followers-only" in tags) {
      const followers = Number(tags["followers-only"]);
      if (known && followers !== this.followers) {
        changes.push(followers < 0 ? { headline: "followers-only off", icon: "followers" } : { headline: `followers-only on${followers > 0 ? ` (${followTimeLabel(followers)})` : ""}`, icon: "followers" });
      }
      this.followers = followers;
    }
    const flag = (tag: string, current: boolean, label: string, icon: ModIcon): boolean => {
      if (!(tag in tags)) return current;
      const on = tags[tag] === "1";
      if (known && on !== current) changes.push({ headline: `${label} ${on ? "on" : "off"}`, icon });
      return on;
    };
    this.subsOnly = flag("subs-only", this.subsOnly, "subs-only", "subs");
    this.emoteOnly = flag("emote-only", this.emoteOnly, "emote-only", "emote");
    this.unique = flag("r9k", this.unique, "unique chat", "unique");
    this.twitchKnown = true;
    return changes;
  }

  /** Forget Twitch modes (connection lost); they're re-read on reconnect. */
  resetTwitch(): void {
    this.twitchKnown = false;
  }
}

export const chatModes = new ChatModes();
