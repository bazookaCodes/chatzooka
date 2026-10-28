// Turns Streamer.bot alert-style events (subs, raids, bits, redemptions, super chats, …) into
// event rows. These payloads aren't documented and haven't all been seen live yet, so every
// field is read from several likely places; dev builds record raw payloads (see events.ts) so
// the mappings can be confirmed against real events.
import type { ChatAuthor, ChatMessage, Fragment, MessageKind, Platform } from "../chat/types";
import { fallbackColor, parseTime, partsToFragments, textToFragments, twitchBadges, youtubeAuthor, youtubeFragments } from "./normalize";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Raw = any;

/** First non-empty value among the given dotted paths. */
function pick(obj: Raw, ...paths: string[]): any {
  for (const path of paths) {
    let v = obj;
    for (const key of path.split(".")) v = v?.[key];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
}

const plural = (n: number, word: string) => `${n.toLocaleString()} ${word}${n === 1 ? "" : "s"}`;

function tierName(tier: unknown): string {
  const t = String(tier ?? "");
  if (/prime/i.test(t)) return "Prime";
  if (t === "2000" || t === "2") return "Tier 2";
  if (t === "3000" || t === "3") return "Tier 3";
  return "Tier 1";
}

function twitchAuthor(d: Raw): ChatAuthor {
  const u = d.user ?? {};
  const name = pick(u, "name", "display", "displayName") ?? pick(d, "displayName", "userName", "user_name", "username", "from_broadcaster_user_name") ?? "unknown";
  return {
    id: String(pick(u, "id") ?? pick(d, "userId", "user_id", "from_broadcaster_user_id") ?? ""),
    login: pick(u, "login") ?? pick(d, "userName", "user_login", "username", "from_broadcaster_user_login"),
    displayName: String(name),
    color: pick(u, "color") ?? pick(d, "color") ?? fallbackColor(String(name)),
    badges: twitchBadges(pick(u, "badges") ?? pick(d, "badges")),
    roles: { broadcaster: false, mod: false, vip: false, sub: false, member: false },
  };
}

function twitchText(d: Raw): Fragment[] {
  const text = pick(d, "text", "message.text", "message", "rawInput", "user_input", "userInput");
  if (Array.isArray(d.parts) && d.parts.length) return partsToFragments(d.parts, String(text ?? ""));
  return typeof text === "string" ? textToFragments(text) : [];
}

let counter = 0;
function row(
  platform: Platform,
  kind: MessageKind,
  author: ChatAuthor,
  d: Raw,
  eventTime: string | undefined,
  headline: string,
  extra: Partial<ChatMessage> = {},
): ChatMessage {
  return {
    id: String(pick(d, "id", "msgId", "messageId", "eventId", "redemptionId") ?? `${platform}-${kind}-${Date.now()}-${++counter}`),
    platform,
    timestamp: parseTime(pick(d, "createdAt", "publishedAt", "redeemed_at", "followed_at", "meta.createdAt"), eventTime),
    author,
    fragments: [],
    kind,
    event: { headline },
    ...extra,
  };
}

type Mapper = (d: Raw, eventTime?: string) => ChatMessage | null;

export const twitchEventMappers: Record<string, Mapper> = {
  Follow: (d, t) => row("twitch", "follow", twitchAuthor(d), d, t, "followed", { eventsOnly: true }),

  Sub: (d, t) =>
    row("twitch", "sub", twitchAuthor(d), d, t, `subscribed with ${tierName(pick(d, "subTier", "tier", "user.subscriptionTier"))}`, {
      fragments: twitchText(d),
    }),

  ReSub: (d, t) => {
    const months = Number(pick(d, "cumulativeMonths", "cumulative_months", "months", "monthsSubscribed") ?? 0);
    const streak = Number(pick(d, "streakMonths", "streak_months") ?? 0);
    const parts = [`resubscribed with ${tierName(pick(d, "subTier", "tier"))}`];
    if (months) parts.push(plural(months, "month"));
    if (streak > 1) parts.push(`${streak}-month streak`);
    return row("twitch", "sub", twitchAuthor(d), d, t, parts.join(" · "), { fragments: twitchText(d) });
  },

  GiftSub: (d, t) => {
    const recipient = pick(d, "recipient.name", "recipient.login", "recipientDisplayName", "recipientUserName", "recipient_user_name");
    const anonymous = pick(d, "anonymous", "isAnonymous") === true;
    const author = anonymous ? { ...twitchAuthor(d), displayName: "Anonymous", id: "" } : twitchAuthor(d);
    return row("twitch", "gift", author, d, t, `gifted a ${tierName(pick(d, "subTier", "tier"))} sub${recipient ? ` to ${recipient}` : ""}`);
  },

  GiftBomb: (d, t) => {
    const n = Number(pick(d, "gifts", "total", "count", "quantity") ?? 0);
    return row("twitch", "gift", twitchAuthor(d), d, t, `is gifting ${plural(n, `${tierName(pick(d, "subTier", "tier"))} sub`)} to the community`);
  },

  Cheer: (d, t) => {
    const bits = Number(pick(d, "bits", "message.bits", "amount") ?? 0);
    return row("twitch", "cheer", twitchAuthor(d), d, t, "cheered", {
      event: { headline: "cheered", amount: plural(bits, "bit") },
      fragments: twitchText(d.message && typeof d.message === "object" ? d.message : d),
    });
  },

  Raid: (d, t) => {
    const viewers = Number(pick(d, "viewers", "viewerCount", "viewer_count") ?? 0);
    return row("twitch", "raid", twitchAuthor(d), d, t, `is raiding with ${plural(viewers, "viewer")}`);
  },

  Announcement: (d, t) =>
    row("twitch", "announcement", twitchAuthor(d), d, t, "announcement", { fragments: twitchText(d) }),

  RewardRedemption: (d, t) => {
    const reward = d.reward ?? {};
    const input = pick(d, "user_input", "userInput", "rawInput", "input");
    return row("twitch", "redemption", twitchAuthor(d), d, t, "redeemed", {
      redemption: {
        rewardId: String(pick(reward, "id") ?? pick(d, "rewardId") ?? ""),
        redemptionId: String(pick(d, "id", "redemptionId") ?? ""),
        title: String(pick(reward, "title", "name") ?? pick(d, "rewardName", "title") ?? "a reward"),
        cost: Number(pick(reward, "cost") ?? pick(d, "cost", "rewardCost") ?? 0),
        input: typeof input === "string" && input ? input : undefined,
        status: "unfulfilled",
      },
    });
  },
};

function youtubeMessageFragments(d: Raw): Fragment[] {
  const text = pick(d, "message", "text", "userComment", "comment");
  return typeof text === "string" && text ? youtubeFragments(text, d.emotes) : [];
}

export const youtubeEventMappers: Record<string, Mapper> = {
  SuperChat: (d, t) =>
    row("youtube", "superchat", youtubeAuthor(d.user), d, t, "sent a Super Chat", {
      event: { headline: "sent a Super Chat", amount: pick(d, "amount", "displayString", "amountDisplayString") },
      fragments: youtubeMessageFragments(d),
    }),

  SuperSticker: (d, t) =>
    row("youtube", "superchat", youtubeAuthor(d.user), d, t, "sent a Super Sticker", {
      event: { headline: "sent a Super Sticker", amount: pick(d, "amount", "displayString", "amountDisplayString") },
    }),

  NewSponsor: (d, t) =>
    row("youtube", "member", youtubeAuthor(d.user), d, t, `became a member${pick(d, "levelName", "tier") ? ` (${pick(d, "levelName", "tier")})` : ""}`),

  MemberMileStone: (d, t) => {
    const months = Number(pick(d, "months", "memberMonth", "milestoneMonths") ?? 0);
    return row("youtube", "member", youtubeAuthor(d.user), d, t, months ? `has been a member for ${plural(months, "month")}` : "hit a membership milestone", {
      fragments: youtubeMessageFragments(d),
    });
  },

  MembershipGift: (d, t) => {
    const n = Number(pick(d, "count", "gifts", "giftCount", "amount") ?? 0);
    return row("youtube", "gift", youtubeAuthor(d.user), d, t, n ? `gifted ${plural(n, "membership")}` : "gifted memberships");
  },
};
