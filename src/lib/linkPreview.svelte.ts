// Link previews: which link is hovered, and cached preview data fetched by the Rust side
// (src-tauri/src/link_preview.rs). Pages are only fetched when you hover a link, never just
// because someone posted it, so posting a link can't be used to learn your IP address.
import { invoke, isTauri } from "@tauri-apps/api/core";

export interface LinkPreviewData {
  url: string;
  siteName?: string | null;
  title?: string | null;
  description?: string | null;
  image?: string | null;
  isImage: boolean;
}

export type PreviewResult = { ok: true; data: LinkPreviewData } | { ok: false; error: string };

const cache = new Map<string, Promise<PreviewResult>>();

export function fetchPreview(url: string): Promise<PreviewResult> {
  let p = cache.get(url);
  if (!p) {
    p = isTauri()
      ? invoke<LinkPreviewData>("link_preview", { url })
          .then((data): PreviewResult => ({ ok: true, data }))
          .catch((e): PreviewResult => ({ ok: false, error: String(e) }))
      : Promise.resolve({ ok: false, error: "Previews work in the desktop app" });
    cache.set(url, p);
    // Forget failures after a minute so a temporarily down site can be retried.
    void p.then((r) => {
      if (!r.ok) setTimeout(() => cache.delete(url), 60_000);
    });
  }
  return p;
}

const SHOW_DELAY_MS = 350;
const HIDE_DELAY_MS = 200;

class LinkHover {
  target = $state<{ url: string; rect: DOMRect } | null>(null);
  #showTimer: ReturnType<typeof setTimeout> | null = null;
  #hideTimer: ReturnType<typeof setTimeout> | null = null;

  enter(url: string, el: HTMLElement): void {
    this.#cancelHide();
    if (this.#showTimer) clearTimeout(this.#showTimer);
    this.#showTimer = setTimeout(() => {
      this.target = { url, rect: el.getBoundingClientRect() };
    }, SHOW_DELAY_MS);
  }

  leave(): void {
    if (this.#showTimer) clearTimeout(this.#showTimer);
    this.#showTimer = null;
    this.#hideTimer = setTimeout(() => (this.target = null), HIDE_DELAY_MS);
  }

  /** Keeps the card open while the pointer moves from the link onto it. */
  keep(): void {
    this.#cancelHide();
  }

  close(): void {
    this.#cancelHide();
    this.target = null;
  }

  #cancelHide(): void {
    if (this.#hideTimer) clearTimeout(this.#hideTimer);
    this.#hideTimer = null;
  }
}

export const linkHover = new LinkHover();
