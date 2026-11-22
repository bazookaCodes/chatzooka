// Opens a user's card: clicking a name anywhere in chat. In the desktop app each card is its own
// small window, opened in the middle of the main window (focused again if that user's card is
// already open); in a browser preview it floats inside the page instead.
import { cardLabel, inTauri, type CardTarget } from "../card/protocol";
import type { ChatAuthor, Platform } from "./types";

/** Every card opens at this size; drag its edges to make it bigger. */
export const CARD_SIZE = { width: 380, height: 470 };
const CARD_MIN_SIZE = { width: 320, height: 320 };

class UserCardState {
  /** The card floating in the page (browser previews only). */
  target = $state<CardTarget | null>(null);

  open(platform: Platform, author: ChatAuthor): void {
    if (!author.id) return;
    const target: CardTarget = { platform, author: $state.snapshot(author) as ChatAuthor };
    if (!inTauri) {
      this.target = target;
      return;
    }
    void openCardWindow(target);
  }

  close(): void {
    this.target = null;
  }
}

/** Top-left corner (logical pixels) that centres a card on the main window. */
async function centreOnMain(): Promise<{ x: number; y: number } | undefined> {
  try {
    const { Window } = await import("@tauri-apps/api/window");
    const main = await Window.getByLabel("main");
    if (!main) return undefined;
    const [pos, size, scale] = await Promise.all([main.outerPosition(), main.outerSize(), main.scaleFactor()]);
    return {
      x: Math.round(pos.x / scale + (size.width / scale - CARD_SIZE.width) / 2),
      y: Math.round(pos.y / scale + (size.height / scale - CARD_SIZE.height) / 2),
    };
  } catch (e) {
    console.warn("Couldn't find the main window to centre the card on", e);
    return undefined;
  }
}

async function openCardWindow(target: CardTarget): Promise<void> {
  const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
  const label = cardLabel(target);
  const existing = await WebviewWindow.getByLabel(label);
  if (existing) {
    await existing.setFocus().catch(() => {});
    return;
  }
  const pos = await centreOnMain();
  const card = new WebviewWindow(label, {
    url: `index.html?card=${encodeURIComponent(JSON.stringify(target))}`,
    title: `${target.author.displayName} · Chatzooka`,
    width: CARD_SIZE.width,
    height: CARD_SIZE.height,
    ...(pos ?? { center: true }),
    minWidth: CARD_MIN_SIZE.width,
    minHeight: CARD_MIN_SIZE.height,
    decorations: false,
    resizable: true,
    backgroundColor: "#1e1e1e",
    focus: true,
  });
  void card.once("tauri://error", (e) => console.warn("Couldn't open the user card window", e));
}

export const userCard = new UserCardState();
