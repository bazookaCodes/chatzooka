// The message you're replying to (Twitch only), set from the hover bar or right-click menu and
// shown above the message box until you send or cancel.
import type { ChatMessage } from "./types";

class ReplyDraft {
  target = $state.raw<ChatMessage | null>(null);
  /** Bumped on every start(), so the message box refocuses even for the same message. */
  requested = $state(0);

  canReply(m: ChatMessage): boolean {
    return m.platform === "twitch" && (m.kind === "chat" || m.kind === "action") && !m.deleted;
  }

  start(m: ChatMessage): void {
    if (!this.canReply(m)) return;
    this.target = m;
    this.requested++;
  }

  clear(): void {
    this.target = null;
  }
}

export const reply = new ReplyDraft();
