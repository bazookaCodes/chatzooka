// The card's side: ask for something and wait for the answer. In a card window that goes to the
// main window over Tauri events; a card shown inside the main window (browser previews) runs it
// directly.
import { CARD_EVENTS, cardLabel, cardTargetFromUrl, inTauri, type CardAction, type CardResponse, type CardResult, type CardTarget } from "./protocol";
import { runCardAction } from "./server.svelte";
import { toasts } from "../toasts.svelte";

/**
 * Set while the card window is being dragged by its header. Windows can take focus away from the
 * window when a drag starts, which mustn't count as clicking elsewhere (that closes the card).
 */
export const cardDrag = { active: false, since: 0 };

const TIMEOUT_MS = 15_000;
let counter = 0;
const waiting = new Map<number, (r: CardResponse) => void>();
let listening: Promise<void> | null = null;

const isCardWindow = inTauri && !!cardTargetFromUrl();

async function listenForResponses(): Promise<void> {
  const { listen } = await import("@tauri-apps/api/event");
  await listen<CardResponse>(CARD_EVENTS.response, ({ payload }) => {
    waiting.get(payload.id)?.(payload);
    waiting.delete(payload.id);
  });
}

export async function cardRequest(target: CardTarget, action: CardAction): Promise<CardResult> {
  let response: Omit<CardResponse, "id">;
  if (!isCardWindow) {
    response = await runCardAction({ target, action });
  } else {
    listening ??= listenForResponses();
    await listening;
    const { emitTo } = await import("@tauri-apps/api/event");
    const id = ++counter;
    response = await new Promise<Omit<CardResponse, "id">>((resolve) => {
      const timer = setTimeout(() => {
        waiting.delete(id);
        resolve({ result: null, toasts: [{ id: 0, text: "Chatzooka's main window didn't answer", kind: "error" }] });
      }, TIMEOUT_MS);
      waiting.set(id, (r) => {
        clearTimeout(timer);
        resolve(r);
      });
      void emitTo("main", CARD_EVENTS.request, { id, label: cardLabel(target), target, action });
    });
  }
  for (const t of response.toasts) toasts.show(t.text, t.kind);
  return response.result;
}
