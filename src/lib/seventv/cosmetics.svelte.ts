// Which chatters have a 7TV paint or badge. Lookups are batched and cached; the paint and
// badge catalog is loaded at startup. Both are saved locally so chatters seen before are
// painted instantly on their next message, even right after the app starts.
import { SvelteMap } from "svelte/reactivity";
import type { Badge, Platform } from "../chat/types";
import { loadSetting, saveSetting } from "../settings";
import { fetchCatalog, fetchUserStyles, USER_BATCH_SIZE, type Paint, type UserStyle } from "./api";
import { badgeImage, paintToCss, type PaintCss } from "./paint";

/** Re-check a chatter's cosmetics after this long, so paint changes show up mid-stream. */
const USER_TTL_MS = 10 * 60_000;
/** Short wait so a burst of new chatters goes out as one request. */
const BATCH_DELAY_MS = 40;
const CATALOG_RELOAD_MIN_MS = 5 * 60_000;
/** Chatters remembered between sessions (most recently seen kept). */
const MAX_SAVED_USERS = 5000;
const SAVE_DELAY_MS = 2000;

type Key = `${Platform}:${string}`;

interface SavedCatalog {
  savedAt: number;
  paints: [string, PaintCss | null][];
  badges: [string, Badge][];
}

/** [paintId, badgeId, checkedAt]; null style means "no 7TV account". */
type SavedUser = [string | null, string | null, number] | [null, null, number, 0];

class Cosmetics {
  #styles = new SvelteMap<Key, UserStyle | null>();
  #paintCss = new SvelteMap<string, PaintCss | null>();
  #badges = new SvelteMap<string, Badge>();

  #checkedAt = new Map<Key, number>();
  #queue = new Map<Platform, Set<string>>();
  #timer: ReturnType<typeof setTimeout> | null = null;
  #saveTimer: ReturnType<typeof setTimeout> | null = null;
  #catalogLoadedAt = 0;
  #catalogLoading: Promise<void> | null = null;
  /** Resolvers for callers waiting on a chatter's first lookup. */
  #waiters = new Map<Key, (() => void)[]>();

  constructor() {
    this.#restore();
  }

  /** Load the paint catalog now instead of on the first chat message. */
  preload(): void {
    void this.#ensureCatalog(true);
  }

  /** Ask for a chatter's cosmetics; cheap to call on every message. */
  request(platform: Platform, userId: string): void {
    if (!userId) return;
    const key: Key = `${platform}:${userId}`;
    const checked = this.#checkedAt.get(key);
    if (checked && Date.now() - checked < USER_TTL_MS) return;
    this.#checkedAt.set(key, Date.now());
    let set = this.#queue.get(platform);
    if (!set) this.#queue.set(platform, (set = new Set()));
    set.add(userId);
    this.#timer ??= setTimeout(() => void this.#flush(), BATCH_DELAY_MS);
  }

  /**
   * Resolves once we know whether this chatter has 7TV cosmetics (and the catalog to draw
   * them), or immediately if we already do. Also starts the lookup if needed.
   */
  ready(platform: Platform, userId: string): Promise<void> {
    const key: Key = `${platform}:${userId}`;
    this.request(platform, userId);
    if (this.#styles.has(key)) {
      const style = this.#styles.get(key);
      const needsCatalog = (style?.paintId || style?.badgeId) && this.#paintCss.size === 0;
      return needsCatalog ? this.#ensureCatalog() : Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      const list = this.#waiters.get(key) ?? [];
      list.push(resolve);
      this.#waiters.set(key, list);
    }).then(() => (this.#paintCss.size === 0 ? this.#ensureCatalog() : undefined));
  }

  paintFor(platform: Platform, userId: string): PaintCss | null {
    const paintId = this.#styles.get(`${platform}:${userId}`)?.paintId;
    return paintId ? (this.#paintCss.get(paintId) ?? null) : null;
  }

  badgeFor(platform: Platform, userId: string): Badge | null {
    const badgeId = this.#styles.get(`${platform}:${userId}`)?.badgeId;
    return badgeId ? (this.#badges.get(badgeId) ?? null) : null;
  }

  async #flush(): Promise<void> {
    this.#timer = null;
    const queued = [...this.#queue.entries()];
    this.#queue.clear();

    // User lookups don't wait for the catalog; names repaint once both have arrived.
    await Promise.all(
      queued.flatMap(([platform, idSet]) => {
        const ids = [...idSet];
        const batches: Promise<void>[] = [];
        for (let i = 0; i < ids.length; i += USER_BATCH_SIZE) {
          batches.push(this.#lookup(platform, ids.slice(i, i + USER_BATCH_SIZE)));
        }
        return batches;
      }),
    );
    this.#scheduleSave();
  }

  async #lookup(platform: Platform, batch: string[]): Promise<void> {
    try {
      const styles = await fetchUserStyles(platform, batch);
      let unknownCosmetic = false;
      for (const [id, style] of styles) {
        this.#styles.set(`${platform}:${id}`, style);
        if (this.#catalogLoadedAt) {
          if (style?.paintId && !this.#paintCss.has(style.paintId)) unknownCosmetic = true;
          if (style?.badgeId && !this.#badges.has(style.badgeId)) unknownCosmetic = true;
        }
      }
      if (unknownCosmetic) void this.#ensureCatalog(true);
    } catch (e) {
      console.warn("7TV user lookup failed", e);
      // Let these users be retried on their next message.
      for (const id of batch) this.#checkedAt.delete(`${platform}:${id}`);
    } finally {
      for (const id of batch) {
        const key: Key = `${platform}:${id}`;
        for (const resolve of this.#waiters.get(key) ?? []) resolve();
        this.#waiters.delete(key);
      }
    }
  }

  #ensureCatalog(reload = false): Promise<void> {
    if (this.#catalogLoading) return this.#catalogLoading;
    const loaded = this.#catalogLoadedAt > 0;
    if (loaded && (!reload || Date.now() - this.#catalogLoadedAt < CATALOG_RELOAD_MIN_MS)) return Promise.resolve();
    this.#catalogLoading = (async () => {
      try {
        const { paints, badges } = await fetchCatalog();
        for (const paint of paints) this.#paintCss.set(paint.id, safePaintCss(paint));
        for (const b of badges) {
          const url = badgeImage(b.images);
          if (url) this.#badges.set(b.id, { id: `7tv/${b.id}`, title: `7TV: ${b.name}`, imageUrl: url });
        }
        this.#catalogLoadedAt = Date.now();
        saveSetting<SavedCatalog>("7tv.catalog", {
          savedAt: this.#catalogLoadedAt,
          paints: [...this.#paintCss.entries()],
          badges: [...this.#badges.entries()],
        });
      } catch (e) {
        console.warn("Couldn't load the 7TV paint catalog", e);
      } finally {
        this.#catalogLoading = null;
      }
    })();
    return this.#catalogLoading;
  }

  #restore(): void {
    const catalog = loadSetting<SavedCatalog | null>("7tv.catalog", null);
    if (catalog) {
      for (const [id, css] of catalog.paints) this.#paintCss.set(id, css);
      for (const [id, badge] of catalog.badges) this.#badges.set(id, badge);
    }
    const users = loadSetting<Record<Key, SavedUser>>("7tv.users", {});
    for (const [key, [paintId, badgeId, checkedAt, has7tv]] of Object.entries(users) as [Key, SavedUser][]) {
      this.#styles.set(key, has7tv === 0 ? null : { paintId, badgeId });
      // Saved entries still count as checked, so they're refreshed on the usual schedule.
      this.#checkedAt.set(key, checkedAt);
    }
  }

  #scheduleSave(): void {
    this.#saveTimer ??= setTimeout(() => {
      this.#saveTimer = null;
      const entries = [...this.#checkedAt.entries()]
        .filter(([key]) => this.#styles.has(key))
        .sort((a, b) => b[1] - a[1])
        .slice(0, MAX_SAVED_USERS);
      const out: Record<string, SavedUser> = {};
      for (const [key, checkedAt] of entries) {
        const style = this.#styles.get(key);
        out[key] = style ? [style.paintId, style.badgeId, checkedAt] : [null, null, checkedAt, 0];
      }
      saveSetting("7tv.users", out);
    }, SAVE_DELAY_MS);
  }
}

function safePaintCss(paint: Paint): PaintCss | null {
  try {
    return paintToCss(paint);
  } catch {
    return null;
  }
}

export const cosmetics = new Cosmetics();
