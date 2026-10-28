// Unified message model shared by both platforms (PLAN.md §2.3).
import type { ModIcon } from "./modIcons";

export type Platform = "twitch" | "youtube";

export type TabId = "all" | "twitch" | "youtube" | "events" | "mod";

export interface Badge {
  id: string;
  title: string;
  imageUrl: string;
}

export interface ChatAuthor {
  /** Twitch user id or YouTube channel id */
  id: string;
  login?: string;
  displayName: string;
  color?: string;
  badges: Badge[];
  roles: {
    broadcaster: boolean;
    mod: boolean;
    vip: boolean;
    sub: boolean;
    member: boolean;
  };
  /** 7TV paint id, if any */
  paintId?: string;
  /** Profile picture, when the platform sends one with messages (YouTube does). */
  avatarUrl?: string;
}

export type EmoteProvider = "twitch" | "youtube" | "7tv" | "bttv" | "ffz";

export type Fragment =
  | { type: "text"; text: string }
  | { type: "emote"; name: string; url: string; provider: EmoteProvider; zeroWidth?: boolean }
  | { type: "mention"; text: string }
  | { type: "link"; url: string };

export type MessageKind =
  | "chat"
  | "action"
  | "redemption"
  | "sub"
  | "gift"
  | "raid"
  | "cheer"
  | "follow"
  | "announcement"
  | "superchat"
  | "member"
  | "system"
  /** Moderation log entry (timeout, ban, unban, deleted message); shown only on the Mod actions tab. */
  | "modaction"
  /** Private "joined/left chat" notice; shown only to you, never saved. */
  | "presence";

/** Headline for an event row, e.g. "subscribed at Tier 1 · 12 months". */
export interface EventInfo {
  headline: string;
  /** Highlighted amount, e.g. "500 bits" or "$5.00". */
  amount?: string;
  /** Mod actions rows: which icon to show at the right edge. */
  icon?: ModIcon;
}

export interface Redemption {
  rewardId: string;
  redemptionId: string;
  title: string;
  cost: number;
  input?: string;
  status: "unfulfilled" | "fulfilled" | "canceled";
}

export interface ChatMessage {
  id: string;
  /** Arrival order, assigned by the message store. */
  seq?: number;
  /** Loaded from history when the app started (not received this session). */
  restored?: boolean;
  platform: Platform;
  timestamp: number;
  author: ChatAuthor;
  fragments: Fragment[];
  kind: MessageKind;
  redemption?: Redemption;
  event?: EventInfo;
  /** The sender's first message ever in your chat. */
  firstEver?: boolean;
  /** The sender's first message since Chatzooka started (this session). */
  firstInSession?: boolean;
  /** Sent with Twitch's "Highlight my message" channel point reward. */
  highlighted?: boolean;
  /** YouTube: the live broadcast the message was sent in (needed to moderate in that chat). */
  broadcastId?: string;
  /** Only shown on the Events tab (e.g. follows, which would flood chat during a follow-bot wave). */
  eventsOnly?: boolean;
  deleted?: boolean;
  /** Why it was removed, e.g. "timed out 10m" or "banned". */
  modNote?: string;
}

/** Messages that belong on the Events tab. First-ever messages go there too so they aren't missed. */
export function isEvent(message: ChatMessage): boolean {
  if (message.kind === "modaction" || message.kind === "presence") return false;
  return (message.kind !== "chat" && message.kind !== "action") || !!message.firstEver;
}

/** Shown in the chat tabs (All / Twitch / YouTube). */
function inChat(m: ChatMessage): boolean {
  return !m.eventsOnly && m.kind !== "modaction";
}

export function filterForTab(messages: ChatMessage[], tab: TabId): ChatMessage[] {
  switch (tab) {
    case "all":
      return messages.filter(inChat);
    case "twitch":
    case "youtube":
      return messages.filter((m) => m.platform === tab && inChat(m));
    case "events":
      return messages.filter(isEvent);
    case "mod":
      return messages.filter((m) => m.kind === "modaction");
  }
}
