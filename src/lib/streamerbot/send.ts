// Sends chat messages through Streamer.bot as your broadcaster account.
import type { Platform } from "../chat/types";
import { streamerbot } from "./connection.svelte";

export type SendResult = { platform: Platform; ok: true } | { platform: Platform; ok: false; error: string; needsAuth?: boolean };

/** Streamer.bot only accepts SendMessage on a password-authenticated WebSocket. */
export async function sendChat(platform: Platform, text: string): Promise<SendResult> {
  const client = streamerbot.client;
  if (!client || streamerbot.status !== "connected") {
    return { platform, ok: false, error: "Not connected to Streamer.bot" };
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

/** Twitch allows 500 characters per message, YouTube 200. */
export const MESSAGE_LIMITS: Record<Platform, number> = { twitch: 500, youtube: 200 };
