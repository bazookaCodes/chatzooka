// Which user's card is open. Opened by clicking a name anywhere in chat.
import type { ChatAuthor, Platform } from "./types";

class UserCardState {
  target = $state<{ platform: Platform; author: ChatAuthor } | null>(null);

  open(platform: Platform, author: ChatAuthor): void {
    if (!author.id) return;
    this.target = { platform, author };
  }

  close(): void {
    this.target = null;
  }
}

export const userCard = new UserCardState();
