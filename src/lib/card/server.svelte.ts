// The main window's side of user card windows: carries out what cards ask for and keeps each
// open card's live messages up to date. (See protocol.ts.)
import { banUser, modUser, timeoutUser, twitchUserInfo, unbanUser, unmodUser } from "../chat/moderation";
import { chat } from "../chat/store.svelte";
import type { ChatMessage } from "../chat/types";
import { quickActions } from "../quickActions.svelte";
import { bridge } from "../streamerbot/bridge.svelte";
import { streamerbot } from "../streamerbot/connection.svelte";
import { toasts, type Toast } from "../toasts.svelte";
import { CARD_EVENTS, inTauri, type CardRequest, type CardResult, type CardState, type CardTarget, type FollowInfo } from "./protocol";

const LIVE_LIMIT = 300;

/** That user's messages in the main window's chat (newest last). */
export function liveMessagesFor(t: CardTarget): ChatMessage[] {
  const out = chat.messages.filter(
    (m) => m.platform === t.platform && m.author.id === t.author.id && m.kind !== "modaction" && m.kind !== "presence",
  );
  return out.slice(-LIVE_LIMIT);
}

/** A message from the user for the moderation helpers to act on. */
function subject(t: CardTarget): ChatMessage {
  return liveMessagesFor(t).at(-1) ?? { id: "", platform: t.platform, timestamp: Date.now(), author: t.author, fragments: [], kind: "chat" };
}

/** Do what a card asked. Also used directly by the in-window card in browser previews. */
export async function runCardAction(req: Omit<CardRequest, "id" | "label">): Promise<{ result: CardResult; toasts: Toast[] }> {
  const t = req.target;
  const before = Math.max(0, ...toasts.list.map((x) => x.id));
  let result: CardResult = null;
  switch (req.action.kind) {
    case "state": {
      const state: CardState = {
        connected: streamerbot.status === "connected",
        bridgeReady: bridge.status === "ready",
        bridgeProfiles: bridge.supports(2),
        bridgeFollowDates: bridge.supports(9),
        quickActions: $state.snapshot(quickActions.chosen),
        broadcasterLogin: streamerbot.accounts.twitch?.login,
        live: $state.snapshot(liveMessagesFor(t)),
      };
      result = state;
      break;
    }
    case "userInfo":
      result = t.platform === "twitch" && t.author.login && bridge.supports(2) ? await twitchUserInfo(t.author.login) : null;
      break;
    case "followInfo": {
      const broadcasterId = streamerbot.accounts.twitch?.id;
      if (t.platform !== "twitch" || !broadcasterId || !bridge.supports(9)) break;
      const res = await bridge.call("twitch.followInfo", { broadcasterId, userId: t.author.id });
      result = res.ok ? (res.data as FollowInfo) : { error: res.error };
      break;
    }
    case "timeout":
      result = await timeoutUser(subject(t), req.action.seconds);
      break;
    case "ban":
      result = await banUser(subject(t));
      break;
    case "unban":
      result = await unbanUser(subject(t));
      break;
    case "mod":
      result = await modUser(subject(t));
      break;
    case "unmod":
      result = await unmodUser(subject(t));
      break;
    case "quickAction": {
      const actionId = req.action.actionId;
      const action = quickActions.all.find((a) => a.id === actionId);
      if (action) await quickActions.run(action, t.platform, t.author);
      result = !!action;
      break;
    }
  }
  // Confirmations go to the card that asked, not the main window.
  const shown = toasts.list.filter((x) => x.id > before);
  for (const x of shown) toasts.dismiss(x.id);
  return { result, toasts: shown };
}

const openCards = new Map<string, { target: CardTarget; signature: string }>();

function signature(list: ChatMessage[]): string {
  const last = list.at(-1);
  return `${list.length}:${last?.id}:${list.filter((m) => m.deleted).length}`;
}

export function startCardServer(): void {
  if (!inTauri) return;
  void import("@tauri-apps/api/event").then(({ listen, emitTo }) => {
    void listen<CardRequest>(CARD_EVENTS.request, async ({ payload }) => {
      const { result, toasts: shown } = await runCardAction(payload);
      void emitTo(payload.label, CARD_EVENTS.response, { id: payload.id, result, toasts: shown });
    });
    void listen<{ label: string; target: CardTarget }>(CARD_EVENTS.opened, ({ payload }) => {
      openCards.set(payload.label, { target: payload.target, signature: signature(liveMessagesFor(payload.target)) });
    });
    void listen<{ label: string }>(CARD_EVENTS.closed, ({ payload }) => openCards.delete(payload.label));

    // Send each open card its user's messages whenever they change (new, deleted, timed out…).
    $effect.root(() => {
      $effect(() => {
        void chat.messages;
        for (const [label, card] of openCards) {
          const list = liveMessagesFor(card.target);
          const sig = signature(list);
          if (sig === card.signature) continue;
          card.signature = sig;
          void emitTo(label, CARD_EVENTS.live, $state.snapshot(list));
        }
      });
    });
  });
}
