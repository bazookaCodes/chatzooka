import type { ChatMessage } from "./types";

/** A message as plain text: emotes become their names, links their URLs. */
export function plainText(m: ChatMessage): string {
  return m.fragments
    .map((f) => (f.type === "text" || f.type === "mention" ? f.text : f.type === "emote" ? f.name : f.url))
    .join("");
}
