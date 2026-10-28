// The "who's here" list shared by ☰ → Users and the viewer count in the tab bar. While the count
// is switched on it refreshes on its own: when Twitch reports joins/leaves, and every 30 seconds.
import { prefs } from "../prefs.svelte";
import { presenceStatus } from "../streamerbot/presence.svelte";
import { isKnownBot } from "./knownBots";
import { loadUsers, type ListedUser } from "./usersList";

const AUTO_REFRESH_MS = 30_000;
/** Joins/leaves come in bursts; wait for a burst to finish before recounting. */
const SETTLE_MS = 2_000;

const isBot = (u: ListedUser) => !u.author.roles.broadcaster && isKnownBot(u.author.login ?? u.author.displayName);

class Viewers {
  /** Everyone found, bots included. */
  all = $state.raw<ListedUser[] | null>(null);
  /** The list to show: bots left out unless Settings says to show them. */
  users = $derived(this.all && prefs.value.hideBots ? this.all.filter((u) => !isBot(u)) : this.all);
  /** How many bots were left out. */
  hiddenBots = $derived(this.all && this.users ? this.all.length - this.users.length : 0);
  loading = $state(false);
  count = $derived(this.users?.length ?? null);
  #running: Promise<void> | null = null;

  refresh(): Promise<void> {
    this.#running ??= (async () => {
      this.loading = true;
      try {
        this.all = await loadUsers();
      } finally {
        this.loading = false;
        this.#running = null;
      }
    })();
    return this.#running;
  }

  /** Keep the count current while the tab-bar count is on. */
  start(): void {
    $effect.root(() => {
      $effect(() => {
        if (!prefs.value.viewerCount) return;
        void this.refresh();
        const timer = setInterval(() => void this.refresh(), AUTO_REFRESH_MS);
        return () => clearInterval(timer);
      });
      $effect(() => {
        if (!prefs.value.viewerCount || presenceStatus.lastAt === null) return;
        const timer = setTimeout(() => void this.refresh(), SETTLE_MS);
        return () => clearTimeout(timer);
      });
    });
  }
}

export const viewers = new Viewers();
