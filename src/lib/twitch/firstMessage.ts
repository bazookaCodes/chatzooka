// Twitch's own first-message marker (the `first-msg` tag on someone's first message ever in your
// channel), read from the anonymous chat connection. When Chatzooka saw a message there, this is
// the authority for the "first message ever" highlight; Streamer.bot's `meta.firstMessage` is
// only the fallback for messages the connection didn't see.
import { chat } from "../chat/store.svelte";

const MAX_REMEMBERED = 2000;

/** Twitch message ID → whether Twitch marked it as a first message. */
const seen = new Map<string, boolean>();

export function twitchFirstFlag(messageId: string): boolean | undefined {
  return seen.get(messageId);
}

export function onTwitchPrivmsg(tags: Record<string, string>): void {
  const id = tags["id"];
  if (!id) return;
  const first = tags["first-msg"] === "1";
  seen.set(id, first);
  if (seen.size > MAX_REMEMBERED) seen.delete(seen.keys().next().value!);

  // If Streamer.bot's copy of this message already arrived, correct its highlight to match.
  chat.updateWhere(
    (m) => m.platform === "twitch" && m.id === id && !!m.firstEver !== first && !m.author.roles.broadcaster,
    (m) => {
      if (import.meta.env.DEV) console.info(`first-msg: Twitch says ${first}, Streamer.bot said ${!!m.firstEver} for ${m.author.displayName}`);
      return { ...m, firstEver: first };
    },
  );
}
