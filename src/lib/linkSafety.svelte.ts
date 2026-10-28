// Safety verdicts for links in chat, from the Rust checker (src-tauri/src/link_safety.rs).
// Checks run entirely on this PC against downloaded phishing lists plus pattern rules; no link
// is sent anywhere to be checked.
import { invoke, isTauri } from "@tauri-apps/api/core";
import { SvelteMap } from "svelte/reactivity";
import { prefs } from "./prefs.svelte";

export interface LinkVerdict {
  url: string;
  level: "danger" | "warning" | "ok";
  reasons: string[];
}

export interface SafetyStatus {
  domainCount: number;
  urlCount: number;
  updatedAt: number | null;
  updating: boolean;
}

const BATCH_MS = 50;

class LinkSafety {
  #verdicts = new SvelteMap<string, LinkVerdict>();
  #queued = new Set<string>();
  #timer: ReturnType<typeof setTimeout> | null = null;

  verdict(url: string): LinkVerdict | undefined {
    return prefs.value.linkSafety ? this.#verdicts.get(url) : undefined;
  }

  /** Ask for verdicts on these links (cheap to call repeatedly; each link is checked once). */
  ensure(urls: string[]): void {
    if (!isTauri() || !prefs.value.linkSafety) return;
    for (const u of urls) if (!this.#verdicts.has(u)) this.#queued.add(u);
    if (this.#queued.size) this.#timer ??= setTimeout(() => void this.#flush(), BATCH_MS);
  }

  async #flush(): Promise<void> {
    this.#timer = null;
    const urls = [...this.#queued];
    this.#queued.clear();
    try {
      const results = await invoke<LinkVerdict[]>("check_links", { urls });
      for (const v of results) this.#verdicts.set(v.url, v);
    } catch (e) {
      console.warn("Link safety check failed", e);
    }
  }

  /** Re-check everything (after the lists update, so newly listed links get flagged). */
  recheckAll(): void {
    const urls = [...this.#verdicts.keys()];
    this.#verdicts.clear();
    this.ensure(urls);
  }

  async status(): Promise<SafetyStatus | null> {
    if (!isTauri()) return null;
    return invoke<SafetyStatus>("safety_status");
  }

  async updateNow(): Promise<void> {
    await invoke("safety_update");
    this.recheckAll();
  }
}

export const linkSafety = new LinkSafety();
