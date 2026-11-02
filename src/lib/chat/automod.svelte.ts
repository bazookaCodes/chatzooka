// Allow / Deny for messages Twitch AutoMod held for review (through the Chatzooka Bridge, v5+).
import { SvelteSet } from "svelte/reactivity";
import { bridge } from "../streamerbot/bridge.svelte";
import { setHeldStatus } from "../streamerbot/modEvents";
import { toasts } from "../toasts.svelte";
import type { ChatMessage } from "./types";

const busy = new SvelteSet<string>();

export function isDeciding(m: ChatMessage): boolean {
  return !!m.automod && busy.has(m.automod.heldId);
}

export async function decideHeld(m: ChatMessage, allow: boolean): Promise<void> {
  const held = m.automod;
  if (!held || held.status !== "held" || busy.has(held.heldId)) return;
  if (!bridge.supports(5)) {
    toasts.show("Allow / Deny needs Chatzooka Bridge v5. Update it in Streamer.bot (Settings → Streamer.bot).", "error", 6000);
    return;
  }
  busy.add(held.heldId);
  try {
    const res = await bridge.call(allow ? "twitch.automodAllow" : "twitch.automodDeny", { messageId: held.heldId });
    if (res.ok) setHeldStatus(held.heldId, allow ? "approved" : "denied", "you");
    else toasts.show(`Couldn't ${allow ? "allow" : "deny"} the message: ${res.error}`, "error");
  } finally {
    busy.delete(held.heldId);
  }
}
