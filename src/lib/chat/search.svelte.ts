// Ctrl+F chat search. While a search is open the chat list shows only matching messages (by text
// or name). "Search older history" adds matches from the saved history database.
import { searchHistory } from "../db/history";
import { plainText } from "./plainText";
import { filterForTab, type ChatMessage, type TabId } from "./types";

const key = (m: ChatMessage) => `${m.platform}:${m.id}`;

class ChatSearch {
  open = $state(false);
  query = $state("");
  /** Matches from saved history, oldest first (replaced on each history search). */
  history = $state.raw<ChatMessage[]>([]);
  historyFor = $state<string | null>(null);
  historyLoading = $state(false);

  /** A search is filtering the list (open with something typed). */
  get active(): boolean {
    return this.open && this.query.trim().length > 0;
  }

  show(): void {
    this.open = true;
  }

  close(): void {
    this.open = false;
    this.query = "";
    this.history = [];
    this.historyFor = null;
  }

  matches(m: ChatMessage, q = this.query.trim().toLowerCase()): boolean {
    if (m.kind === "presence") return false;
    return (
      plainText(m).toLowerCase().includes(q) ||
      m.author.displayName.toLowerCase().includes(q) ||
      (m.author.login?.toLowerCase().includes(q) ?? false) ||
      (m.event?.headline?.toLowerCase().includes(q) ?? false)
    );
  }

  /** The list to show for a tab while searching: history matches, then matches in loaded chat. */
  apply(list: ChatMessage[], tab: TabId): ChatMessage[] {
    const q = this.query.trim().toLowerCase();
    const live = list.filter((m) => this.matches(m, q));
    if (this.historyFor !== q || !this.history.length) return live;
    const loaded = new Set(list.map(key));
    const older = filterForTab(this.history, tab).filter((m) => !loaded.has(key(m)) && this.matches(m, q));
    return [...older, ...live].sort((a, b) => a.timestamp - b.timestamp);
  }

  async searchHistory(): Promise<void> {
    const q = this.query.trim().toLowerCase();
    if (!q || this.historyLoading) return;
    this.historyLoading = true;
    try {
      const found = await searchHistory(q);
      if (this.query.trim().toLowerCase() === q) {
        this.history = found.filter((m) => this.matches(m, q));
        this.historyFor = q;
      }
    } finally {
      this.historyLoading = false;
    }
  }
}

export const search = new ChatSearch();
