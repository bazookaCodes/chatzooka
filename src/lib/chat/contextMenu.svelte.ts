// Which message the right-click menu is open for, and where.
import type { ChatMessage } from "./types";

class ContextMenu {
  target = $state<{ message: ChatMessage; x: number; y: number } | null>(null);

  open(message: ChatMessage, x: number, y: number): void {
    this.target = { message, x, y };
  }

  close(): void {
    this.target = null;
  }
}

export const contextMenu = new ContextMenu();
