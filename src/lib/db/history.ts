// Permanent message history and per-user records in SQLite (app data folder, via
// tauri-plugin-sql). Writes are batched once a second. In a plain browser (npm run dev without
// Tauri) there's no database; callers fall back to the in-memory chat store.
import { isTauri } from "@tauri-apps/api/core";
import type Database from "@tauri-apps/plugin-sql";
import type { ChatMessage, Platform } from "../chat/types";

export interface UserRecord {
  platform: Platform;
  userId: string;
  login: string | null;
  displayName: string | null;
  firstSeen: number;
  lastSeen: number;
  messageCount: number;
  notes: string | null;
}

const FLUSH_MS = 1000;
/** Rows per INSERT; SQLite allows 999 parameters and messages use 8 each. */
const ROWS_PER_INSERT = 100;

let dbPromise: Promise<Database | null> | null = null;

function db(): Promise<Database | null> {
  if (!isTauri()) return Promise.resolve(null);
  dbPromise ??= import("@tauri-apps/plugin-sql")
    .then(({ default: Database }) => Database.load("sqlite:chatzooka.db"))
    .catch((e) => {
      console.error("Couldn't open the history database", e);
      return null;
    });
  return dbPromise;
}

const pendingMessages = new Map<string, ChatMessage>();
let timer: ReturnType<typeof setTimeout> | null = null;

/** Only messages from a real sender are kept (not mod-log rows or "chat cleared" notices). */
/**
 * Kept: messages from a real sender, plus join/leave notices (so they come back after a restart
 * like the rest of chat). Not kept: mod-log rows, which are rebuilt from events.
 */
function storable(m: ChatMessage): boolean {
  // Held AutoMod messages aren't kept: restored later, their Allow / Deny would be stale.
  if (m.kind === "modaction" || m.kind === "automod") return false;
  return m.kind === "presence" || !!m.author.id;
}

function schedule(): void {
  timer ??= setTimeout(() => void flush(), FLUSH_MS);
}

/** Save (or update) messages. Cheap to call for every message; writes are batched. */
export function saveMessages(messages: ChatMessage[]): void {
  for (const m of messages) if (storable(m)) pendingMessages.set(`${m.platform}:${m.id}`, m);
  if (pendingMessages.size) schedule();
}

async function flush(): Promise<void> {
  timer = null;
  const batch = [...pendingMessages.values()];
  pendingMessages.clear();
  const conn = await db();
  if (!conn || !batch.length) return;

  try {
    for (let i = 0; i < batch.length; i += ROWS_PER_INSERT) {
      const rows = batch.slice(i, i + ROWS_PER_INSERT);
      const params: unknown[] = [];
      const values = rows.map((m, j) => {
        const { seq: _seq, ...data } = m;
        params.push(m.platform, m.id, m.author.id, m.timestamp, m.kind, JSON.stringify(data), m.deleted ? 1 : 0, m.modNote ?? null);
        const b = j * 8;
        return `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}, $${b + 6}, $${b + 7}, $${b + 8})`;
      });
      await conn.execute(
        `INSERT INTO messages (platform, id, user_id, ts, kind, data, deleted, mod_note) VALUES ${values.join(", ")}
         ON CONFLICT (platform, id) DO UPDATE SET data = excluded.data, deleted = excluded.deleted, mod_note = excluded.mod_note`,
        params,
      );
    }

    // One upsert per sender with how many new chat messages they sent in this batch.
    const users = new Map<string, { m: ChatMessage; count: number; first: number; last: number }>();
    for (const m of batch) {
      // Join/leave notices don't count as someone being "seen" chatting.
      if (m.kind === "presence" || !m.author.id) continue;
      const key = `${m.platform}:${m.author.id}`;
      const isNewChat = (m.kind === "chat" || m.kind === "action") && !m.deleted && !m.modNote;
      const u = users.get(key) ?? { m, count: 0, first: m.timestamp, last: m.timestamp };
      u.m = m;
      if (isNewChat) u.count++;
      u.first = Math.min(u.first, m.timestamp);
      u.last = Math.max(u.last, m.timestamp);
      users.set(key, u);
    }
    for (const { m, count, first, last } of users.values()) {
      await conn.execute(
        `INSERT INTO users (platform, user_id, login, display_name, first_seen, last_seen, message_count)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (platform, user_id) DO UPDATE SET
           login = COALESCE(excluded.login, users.login),
           display_name = excluded.display_name,
           first_seen = MIN(users.first_seen, excluded.first_seen),
           last_seen = MAX(users.last_seen, excluded.last_seen),
           message_count = users.message_count + excluded.message_count`,
        [m.platform, m.author.id, m.author.login ?? null, m.author.displayName, first, last, count],
      );
    }
  } catch (e) {
    console.error("Couldn't save chat history", e);
  }
}

/** The most recent saved messages across all chat, oldest first (to restore chat at startup). */
export async function recentMessages(limit = 500): Promise<ChatMessage[]> {
  const conn = await db();
  if (!conn) return [];
  const rows = await conn.select<{ data: string; deleted: number; mod_note: string | null }[]>(
    `SELECT data, deleted, mod_note FROM messages ORDER BY ts DESC LIMIT $1`,
    [limit],
  );
  return rows.reverse().map((r) => ({ ...JSON.parse(r.data), deleted: !!r.deleted, modNote: r.mod_note ?? undefined }));
}

/**
 * Saved messages whose stored data contains `text` (any case), oldest first. The match is loose
 * (it also looks at names and other stored fields); the caller filters precisely.
 */
export async function searchHistory(text: string, limit = 500): Promise<ChatMessage[]> {
  const conn = await db();
  if (!conn) return [];
  const like = `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const rows = await conn.select<{ data: string; deleted: number; mod_note: string | null }[]>(
    `SELECT data, deleted, mod_note FROM messages WHERE kind != 'presence' AND data LIKE $1 ESCAPE '\\' ORDER BY ts DESC LIMIT $2`,
    [like, limit],
  );
  return rows.reverse().map((r) => ({ ...JSON.parse(r.data), deleted: !!r.deleted, modNote: r.mod_note ?? undefined }));
}

/** A user's messages, newest first. */
export async function userMessages(platform: Platform, userId: string, limit = 300): Promise<ChatMessage[]> {
  const conn = await db();
  if (!conn) return [];
  const rows = await conn.select<{ data: string; deleted: number; mod_note: string | null }[]>(
    `SELECT data, deleted, mod_note FROM messages WHERE platform = $1 AND user_id = $2 AND kind != 'presence' ORDER BY ts DESC LIMIT $3`,
    [platform, userId, limit],
  );
  return rows.map((r) => ({ ...JSON.parse(r.data), deleted: !!r.deleted, modNote: r.mod_note ?? undefined }));
}

/**
 * Delete saved messages older than `days` days (0 = keep everything). User records (first seen,
 * message count, notes) are kept. Returns how many messages were removed.
 */
export async function pruneHistory(days: number): Promise<number> {
  if (!days) return 0;
  const conn = await db();
  if (!conn) return 0;
  const cutoff = Date.now() - days * 86_400_000;
  const res = await conn.execute(`DELETE FROM messages WHERE ts < $1`, [cutoff]);
  return res.rowsAffected;
}

/** Number of saved messages and the oldest one's time, for Settings. */
export async function historyStats(): Promise<{ count: number; oldest: number | null } | null> {
  const conn = await db();
  if (!conn) return null;
  const rows = await conn.select<{ count: number; oldest: number | null }[]>(`SELECT COUNT(*) AS count, MIN(ts) AS oldest FROM messages`);
  return rows[0] ?? { count: 0, oldest: null };
}

/** Redemptions saved in the last `days` days, newest first (for the queue and reward history). */
export async function recentRedemptions(days = 7, rewardId?: string): Promise<ChatMessage[]> {
  const conn = await db();
  if (!conn) return [];
  const since = Date.now() - days * 86_400_000;
  const rows = await conn.select<{ data: string }[]>(
    `SELECT data FROM messages WHERE kind = 'redemption' AND ts >= $1
     ${rewardId ? "AND json_extract(data, '$.redemption.rewardId') = $2" : ""}
     ORDER BY ts DESC LIMIT 500`,
    rewardId ? [since, rewardId] : [since],
  );
  return rows.map((r) => JSON.parse(r.data));
}

export async function userRecord(platform: Platform, userId: string): Promise<UserRecord | null> {
  const conn = await db();
  if (!conn) return null;
  const rows = await conn.select<any[]>( // eslint-disable-line @typescript-eslint/no-explicit-any
    `SELECT * FROM users WHERE platform = $1 AND user_id = $2`,
    [platform, userId],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    platform: r.platform,
    userId: r.user_id,
    login: r.login,
    displayName: r.display_name,
    firstSeen: r.first_seen,
    lastSeen: r.last_seen,
    messageCount: r.message_count,
    notes: r.notes,
  };
}

export async function saveNotes(platform: Platform, userId: string, notes: string): Promise<void> {
  const conn = await db();
  if (!conn) return;
  const now = Date.now();
  await conn.execute(
    `INSERT INTO users (platform, user_id, first_seen, last_seen, notes) VALUES ($1, $2, $3, $3, $4)
     ON CONFLICT (platform, user_id) DO UPDATE SET notes = excluded.notes`,
    [platform, userId, now, notes || null],
  );
}
