// Decides whether a message is the sender's first message ever in your chat. Chatzooka makes
// this call itself; Streamer.bot's "First Words" is not used (it isn't "first ever").
//
// - Twitch: Twitch's own `first-msg` tag, read from Chatzooka's anonymous chat connection
//   (twitch/firstMessage.ts), which also corrects the row if it arrives after Streamer.bot's copy.
//   Streamer.bot's `meta.firstMessage` is only the fallback for messages that connection missed.
// - YouTube: has no such flag, so Chatzooka keeps a permanent record of every channel ID it has
//   seen chat. Only accurate from when Chatzooka started recording.
import { twitchFirstFlag } from "../twitch/firstMessage";
import { loadSetting, saveSetting } from "../settings";
import type { ChatMessage } from "./types";

const STORAGE_KEY = "knownChatters";
const SAVE_DELAY_MS = 3000;

const known = new Set<string>(loadSetting<string[]>(STORAGE_KEY, []));
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function remember(key: string): void {
  if (known.has(key)) return;
  known.add(key);
  saveTimer ??= setTimeout(() => {
    saveTimer = null;
    saveSetting(STORAGE_KEY, [...known]);
  }, SAVE_DELAY_MS);
}

/** Chatters who have talked since Chatzooka started, for the "first message this session" highlight. */
const seenThisSession = new Set<string>();

/**
 * Sets `message.firstEver` and `message.firstInSession` and records the sender. Call once per
 * incoming chat message.
 */
export function markFirstEver(message: ChatMessage): void {
  if (message.kind !== "chat" && message.kind !== "action") return;
  const { author, platform } = message;
  if (!author.id) return;
  const key = `${platform}:${author.id}`;
  const seenBefore = known.has(key);
  remember(key);

  message.firstInSession = !seenThisSession.has(key) && !author.roles.broadcaster;
  seenThisSession.add(key);

  if (author.roles.broadcaster) {
    message.firstEver = false;
  } else if (platform === "twitch") {
    // Twitch's own tag when the anonymous connection saw it, else Streamer.bot's flag.
    message.firstEver = twitchFirstFlag(message.id) ?? !!message.firstEver;
  } else {
    message.firstEver = !seenBefore;
  }
}
