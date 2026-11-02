// Connects the read-only Twitch chat connection to your channel once Streamer.bot reports which
// Twitch account you're signed in with, and routes its events.
import { chatModes } from "../chat/chatModes.svelte";
import { streamerbot } from "../streamerbot/connection.svelte";
import { logChatSetting } from "../streamerbot/modEvents";
import { ircJoin, ircNames, ircPart } from "../streamerbot/presence.svelte";
import { onTwitchPrivmsg } from "./firstMessage";
import { twitchIrc } from "./irc.svelte";
import { onTwitchReplyTags } from "./replies";

let started = false;

export function startTwitchReadOnly(): void {
  if (started) return;
  started = true;
  twitchIrc.setHandlers({
    names: ircNames,
    join: ircJoin,
    part: ircPart,
    privmsg: (tags) => {
      onTwitchPrivmsg(tags);
      onTwitchReplyTags(tags);
    },
    roomState: (tags) => {
      for (const c of chatModes.applyRoomState(tags)) logChatSetting("twitch", c.headline, c.icon);
    },
    disconnected: () => chatModes.resetTwitch(),
  });
  $effect.root(() => {
    $effect(() => {
      twitchIrc.connect(streamerbot.accounts.twitch?.login ?? null);
    });
  });
}
