// Sends chat messages through Streamer.bot as your broadcaster account.
import type { ChatMessage, Platform } from "../chat/types";
import { bridge } from "./bridge.svelte";
import { streamerbot } from "./connection.svelte";

export type SendResult = { platform: Platform; ok: true } | { platform: Platform; ok: false; error: string; needsAuth?: boolean };

/**
 * Sends through the Chatzooka Bridge (v7+), which works whether or not the WebSocket server has a
 * password. Without the bridge it falls back to Streamer.bot's SendMessage request, which
 * Streamer.bot only accepts on a password-authenticated connection.
 */
export async function sendChat(platform: Platform, text: string): Promise<SendResult> {
  const client = streamerbot.client;
  if (!client || streamerbot.status !== "connected") {
    return { platform, ok: false, error: "Not connected to Streamer.bot" };
  }
  if (bridge.supports(7)) {
    const res = await bridge.call(`${platform}.send`, { message: text });
    return res.ok ? { platform, ok: true } : { platform, ok: false, error: res.error };
  }
  try {
    const res = await client.sendMessage(platform, text, { bot: false });
    if (res.status === "ok") return { platform, ok: true };
    const error = "error" in res ? String(res.error) : "Streamer.bot returned an error";
    return { platform, ok: false, error, needsAuth: /authenticat/i.test(error) };
  } catch (e) {
    return { platform, ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Reply to a Twitch message (bridge v5). With an older bridge it falls back to a normal message
 * starting with "@name", which is what a reply looks like in most chat clients anyway.
 */
export async function sendTwitchReply(text: string, parent: ChatMessage): Promise<SendResult & { fallback?: boolean }> {
  if (!bridge.supports(5)) {
    const name = parent.author.login ?? parent.author.displayName;
    return { ...(await sendChat("twitch", `@${name} ${text}`)), fallback: true };
  }
  const res = await bridge.call("twitch.reply", { message: text, replyId: parent.id });
  return res.ok ? { platform: "twitch", ok: true } : { platform: "twitch", ok: false, error: res.error };
}

/** Twitch allows 500 characters per message, YouTube 200. */
export const MESSAGE_LIMITS: Record<Platform, number> = { twitch: 500, youtube: 200 };
