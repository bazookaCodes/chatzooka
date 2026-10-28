// In-memory chat history shared by all tabs. Incoming messages are buffered and applied in
// small batches so a chat flood doesn't re-render on every single message. Everything is also
// saved to the SQLite history (db/history.ts) for user cards.
import { saveMessages } from "../db/history";
import type { ChatMessage } from "./types";

/** Messages kept in memory; older ones drop off here but stay in the SQLite history. */
const MAX_MESSAGES = 2000;
const FLUSH_MS = 75;

class MessageStore {
  messages = $state.raw<ChatMessage[]>([]);

  #pending: ChatMessage[] = [];
  #timer: ReturnType<typeof setTimeout> | null = null;
  #seq = 0;

  add(message: ChatMessage): void {
    message.seq = ++this.#seq;
    this.#pending.push(message);
    this.#timer ??= setTimeout(() => this.#flush(), FLUSH_MS);
  }

  /**
   * Put saved messages back in front of chat at startup, so the app opens where chat left off.
   * They get negative seq numbers (always "older" than this session) and aren't saved again.
   */
  restore(saved: ChatMessage[]): void {
    const live = new Set(this.messages.map((m) => `${m.platform}:${m.id}`));
    const older: ChatMessage[] = saved
      .filter((m) => !live.has(`${m.platform}:${m.id}`))
      .map((m, i, all) => ({ ...m, seq: i - all.length, restored: true, firstInSession: false }));
    if (older.length) this.messages = older.concat(this.messages);
  }

  /** Strike out matching messages (deleted, or sender timed out/banned) without removing them. */
  markDeleted(match: (m: ChatMessage) => boolean, modNote?: string): void {
    const mark = (m: ChatMessage) => (match(m) && !m.deleted ? { ...m, deleted: true, modNote: modNote ?? m.modNote } : m);
    this.#pending = this.#pending.map(mark);
    const changed: ChatMessage[] = [];
    const next = this.messages.map((m) => {
      const marked = mark(m);
      if (marked !== m) changed.push(marked);
      return marked;
    });
    if (changed.length) {
      this.messages = next;
      saveMessages(changed);
    }
  }

  /** Replace matching messages (in memory and in the history) with an updated copy. */
  updateWhere(match: (m: ChatMessage) => boolean, update: (m: ChatMessage) => ChatMessage): void {
    this.#pending = this.#pending.map((m) => (match(m) ? update(m) : m));
    const changed: ChatMessage[] = [];
    const next = this.messages.map((m) => {
      if (!match(m)) return m;
      const updated = update(m);
      if (updated !== m) changed.push(updated);
      return updated;
    });
    if (changed.length) {
      this.messages = next;
      saveMessages(changed);
    }
  }

  /** Add to the moderation note of matching already-removed messages (e.g. "· unbanned"). */
  annotate(match: (m: ChatMessage) => boolean, suffix: string): void {
    const changed: ChatMessage[] = [];
    const next = this.messages.map((m) => {
      if (!m.deleted || !match(m) || m.modNote?.endsWith(suffix)) return m;
      const updated = { ...m, modNote: m.modNote ? `${m.modNote} · ${suffix}` : suffix };
      changed.push(updated);
      return updated;
    });
    if (changed.length) {
      this.messages = next;
      saveMessages(changed);
    }
  }

  #flush(): void {
    this.#timer = null;
    saveMessages(this.#pending);
    const merged = this.messages.concat(this.#pending);
    this.#pending = [];
    this.messages = merged.length > MAX_MESSAGES ? merged.slice(merged.length - MAX_MESSAGES) : merged;
  }
}

export const chat = new MessageStore();
