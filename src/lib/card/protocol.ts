// User cards open as their own small windows (like Chatterino's). A card window has no Streamer.bot
// connection of its own: it asks the main window to do things (timeouts, bans, quick actions,
// profile lookups) over Tauri events, and the main window sends it that user's live messages.
// History and notes come straight from the shared SQLite database.
import type { SbAction } from "../quickActions.svelte";
import type { ChatAuthor, ChatMessage, Platform } from "../chat/types";
import type { TwitchUserInfo } from "../chat/moderation";
import type { Toast } from "../toasts.svelte";

export interface CardTarget {
  platform: Platform;
  author: ChatAuthor;
}

export const CARD_EVENTS = {
  /** card → main: { label, platform, authorId } */
  opened: "card:opened",
  /** card → main: { label } */
  closed: "card:closed",
  /** card → main: CardRequest */
  request: "card:request",
  /** main → card: CardResponse */
  response: "card:response",
  /** main → card: ChatMessage[] (that user's messages in the main window's chat) */
  live: "card:live",
} as const;

export type CardAction =
  | { kind: "state" }
  | { kind: "userInfo" }
  | { kind: "followInfo" }
  | { kind: "timeout"; seconds: number }
  | { kind: "ban" }
  | { kind: "unban" }
  | { kind: "mod" }
  | { kind: "unmod" }
  | { kind: "quickAction"; actionId: string };

export interface CardRequest {
  id: number;
  /** The card window's label, so the reply goes back to it. */
  label: string;
  target: CardTarget;
  action: CardAction;
}

export interface CardState {
  connected: boolean;
  bridgeReady: boolean;
  /** Bridge v2+: profile lookups and mod/unmod. */
  bridgeProfiles: boolean;
  /** Bridge v9+: follow dates. */
  bridgeFollowDates: boolean;
  quickActions: SbAction[];
  /** Your Twitch login, for the Twitch viewer-card link. */
  broadcasterLogin?: string;
  live: ChatMessage[];
}

/** Whether they follow your Twitch channel, and since when (bridge v9). */
export interface FollowInfo {
  following: boolean;
  followedAt?: string;
}

export type CardResult = boolean | CardState | TwitchUserInfo | FollowInfo | { error: string } | null;

export interface CardResponse {
  id: number;
  result: CardResult;
  /** Confirmations the action showed ("Timed out X for 10m"), to show in the card instead. */
  toasts: Toast[];
}

export function cardLabel(t: CardTarget): string {
  return `card-${t.platform}-${t.author.id.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
}

/** This page is a card window (opened with ?card=…). */
export function cardTargetFromUrl(): CardTarget | null {
  if (typeof window === "undefined") return null;
  const raw = new URLSearchParams(window.location.search).get("card");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as CardTarget;
  } catch {
    return null;
  }
}

export const inTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
