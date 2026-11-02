// Reply info from the anonymous chat connection's `reply-parent-*` tags. Backup for when
// Streamer.bot's copy of a reply doesn't say what it answers (its fields aren't documented).
import { chat } from "../chat/store.svelte";
import type { ChatMessage, ReplyParent } from "../chat/types";
import { withoutLeadingMention } from "../streamerbot/normalize";

const MAX_REMEMBERED = 500;

/** Twitch message ID → the message it replies to. */
const parents = new Map<string, ReplyParent>();

/** IRC tag values escape spaces, semicolons and backslashes. */
function unescapeTag(v: string): string {
  return v.replace(/\\(.)/g, (_, c: string) => ({ s: " ", ":": ";", "\\": "\\", r: "\r", n: "\n" })[c] ?? c);
}

export function twitchReplyParent(messageId: string): ReplyParent | undefined {
  return parents.get(messageId);
}

/** Give a reply its parent (and drop the leading "@parent"). */
export function withReply(m: ChatMessage, parent: ReplyParent): ChatMessage {
  return { ...m, replyTo: parent, fragments: withoutLeadingMention(m.fragments, parent) };
}

export function onTwitchReplyTags(tags: Record<string, string>): void {
  const id = tags["id"];
  const parentId = tags["reply-parent-msg-id"];
  if (!id || !parentId) return;
  const login = tags["reply-parent-user-login"] || undefined;
  const parent: ReplyParent = {
    id: parentId,
    name: unescapeTag(tags["reply-parent-display-name"] || login || "someone"),
    login,
    text: unescapeTag(tags["reply-parent-msg-body"] ?? ""),
  };
  parents.set(id, parent);
  if (parents.size > MAX_REMEMBERED) parents.delete(parents.keys().next().value!);

  // If Streamer.bot's copy already arrived without reply info, add it.
  chat.updateWhere((m) => m.platform === "twitch" && m.id === id && !m.replyTo, (m) => withReply(m, parent));
}
