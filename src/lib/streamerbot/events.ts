// Wires Streamer.bot chat and alert events into the message store.
import { emoteList } from "../chat/emoteList.svelte";
import { chatModes } from "../chat/chatModes.svelte";
import { markFirstEver } from "../chat/firstSeen";
import { redemptions } from "../chat/redemptions.svelte";
import { thirdPartyEmotes } from "../chat/thirdPartyEmotes.svelte";
import { viewers } from "../chat/viewers.svelte";
import { chat } from "../chat/store.svelte";
import type { ChatMessage } from "../chat/types";
import { cosmetics } from "../seventv/cosmetics.svelte";
import { recordRaw, type RawEvent } from "../dev/rawEvents";
import { streamInfo } from "../stream/streamInfo.svelte";
import { liveEvents } from "../stream/liveEvents.svelte";
import { streamerbot } from "./connection.svelte";
import { chatLineFor, twitchEventMappers, youtubeEventMappers } from "./eventRows";
import { plainText } from "../chat/plainText";
import { logChatSetting, modEventHandlers } from "./modEvents";
import { onPresentViewers, resetPresence, startPresencePolling } from "./presence.svelte";
import { startTwitchReadOnly } from "../twitch/setup.svelte";
import { twitchReplyParent, withReply } from "../twitch/replies";
import { twitchChatMessage, youtubeChatMessage } from "./normalize";

/* eslint-disable @typescript-eslint/no-explicit-any */

let started = false;

/** Longest a message waits for its sender's 7TV paint before showing unpainted. */
// 7TV lookups measured at 0.2–0.46 s, so 0.6 s covers almost all of them.
const MAX_HOLD_MS = 600;

// Messages leave this queue in arrival order. A first-time chatter's message waits (up to
// MAX_HOLD_MS) for their 7TV lookup so it appears already painted; anything that arrived
// after it waits too, so chat never reorders.
const outbox: { message: ChatMessage; ready: Promise<void> }[] = [];
let draining = false;

/** How close in time an event's chat line and a real chat message must be to count as the same. */
const SAME_MESSAGE_MS = 30_000;

function sameMessage(a: ChatMessage, b: ChatMessage): boolean {
  return (
    a.platform === b.platform &&
    a.author.id === b.author.id &&
    Math.abs(a.timestamp - b.timestamp) < SAME_MESSAGE_MS &&
    plainText(a).trim() === plainText(b).trim()
  );
}

const isEventLine = (m: ChatMessage) => m.id.startsWith("evmsg-");

/** A real chat message that repeats an event's chat line takes its place (keeping the tag). */
function replacesEventLine(message: ChatMessage): boolean {
  if (message.kind !== "chat" || isEventLine(message)) return false;
  const queued = outbox.find((o) => isEventLine(o.message) && sameMessage(o.message, message));
  if (queued) {
    queued.message = { ...message, viaEvent: queued.message.viaEvent };
    return true;
  }
  for (let i = chat.messages.length - 1; i >= 0 && i >= chat.messages.length - 200; i--) {
    const line = chat.messages[i];
    if (isEventLine(line) && sameMessage(line, message)) {
      chat.updateWhere((m) => m.id === line.id, () => ({ ...message, viaEvent: line.viaEvent, seq: line.seq }));
      return true;
    }
  }
  return false;
}

/** An event row, plus its viewer message as a chat line (unless chat already has it). */
function receiveEvent(row: ChatMessage | null): void {
  const line = row && chatLineFor(row);
  if (!row || !line) return receive(row);
  // The chat line stands in for the event row in the chat feed; the Events tab keeps the row.
  row.eventsOnly = true;
  receive(row);
  const recent = [...outbox.map((o) => o.message), ...chat.messages.slice(-200)];
  if (!recent.some((m) => m.kind === "chat" && !isEventLine(m) && sameMessage(m, line))) receive(line);
}

function receive(message: ChatMessage | null): void {
  if (!message) return;
  if (replacesEventLine(message)) return;
  if (message.platform === "twitch" && !message.replyTo) {
    const parent = twitchReplyParent(message.id);
    if (parent) message = withReply(message, parent);
  }
  message.fragments = thirdPartyEmotes.apply(message.fragments);
  // An event's chat line isn't a "first message"; the event row already covers it.
  if (!isEventLine(message)) markFirstEver(message);
  redemptions.track(message);
  const lookup = cosmetics.ready(message.platform, message.author.id);
  const ready = Promise.race([lookup, new Promise<void>((r) => setTimeout(r, MAX_HOLD_MS))]);
  outbox.push({ message, ready });
  void drain();
}

async function drain(): Promise<void> {
  if (draining) return;
  draining = true;
  while (outbox.length) {
    await outbox[0].ready;
    chat.add(outbox.shift()!.message);
  }
  draining = false;
}

/** Look up 7TV cosmetics for everyone already in chat, so their first message is painted. */
async function prefetchCosmetics(client: Parameters<Parameters<typeof streamerbot.onConnected>[0]>[0]) {
  try {
    const res = await client.getActiveViewers();
    if (res.status !== "ok") return;
    for (const viewer of res.viewers as any[]) {
      const platform = viewer.type === "youtube" ? "youtube" : viewer.type === "twitch" ? "twitch" : null;
      if (platform && viewer.id) cosmetics.request(platform, String(viewer.id));
    }
  } catch (e) {
    console.warn("GetActiveViewers failed", e);
  }
}

/** Feed one Streamer.bot alert or chat event through the normal path (for testing from dev tools). */
export function simulateEvent(name: string, data: any): void {
  if (name === "Twitch.ChatMessage") return receive(twitchChatMessage(data));
  const [source, type] = name.split(".");
  const map = (source === "Twitch" ? twitchEventMappers : youtubeEventMappers)[type];
  if (map) receiveEvent(map(data));
}

export function startChatEvents(): void {
  if (started) return;
  started = true;
  cosmetics.preload();
  streamInfo.start();
  liveEvents.start();
  thirdPartyEmotes.start();
  viewers.start();
  streamerbot.onConnected((client) => void prefetchCosmetics(client));
  streamerbot.onConnected((client) => void emoteList.load(client));
  streamerbot.onConnected(() => resetPresence());
  startPresencePolling();
  startTwitchReadOnly();
  streamerbot.use((client) => {
    void client.on("Twitch.ChatMessage", (event) => {
      const e = event as RawEvent;
      // Kept so the first-message flag can be checked against a known first-time chatter.
      if (e.data?.meta?.firstMessage) recordRaw("Twitch.ChatMessage(firstMessage)", e);
      // Kept so the reply fields (not documented) can be checked against a real reply.
      if (/"reply|parent_message/i.test(JSON.stringify(e.data ?? {}))) recordRaw("Twitch.ChatMessage(reply)", e);
      receive(twitchChatMessage(e.data, e.timeStamp));
    });
    void client.on("YouTube.Message", (event) => {
      const e = event as RawEvent;
      receive(youtubeChatMessage(e.data, e.timeStamp));
    });

    // Chat settings that Twitch's chat connection doesn't report.
    void client.on("Twitch.ShieldModeBegin", () => {
      chatModes.shield = true;
      logChatSetting("twitch", "shield mode on", "shield");
    });
    void client.on("Twitch.ShieldModeEnd", () => {
      chatModes.shield = false;
      logChatSetting("twitch", "shield mode off", "shield");
    });
    void client.on("YouTube.NewSponsorOnlyStarted", () => {
      chatModes.youtubeMembersOnly = true;
      logChatSetting("youtube", "members-only on", "members");
    });
    void client.on("YouTube.NewSponsorOnlyEnded", () => {
      chatModes.youtubeMembersOnly = false;
      logChatSetting("youtube", "members-only off", "members");
    });

    void client.on("Twitch.PresentViewers", (event) => {
      const e = event as RawEvent;
      recordRaw("Twitch.PresentViewers", e);
      onPresentViewers(e.data);
    });
    void client.on("Twitch.RewardRedemptionUpdated", (event) => {
      const e = event as RawEvent;
      recordRaw("Twitch.RewardRedemptionUpdated", e);
      redemptions.onUpdated(e.data);
    });
    for (const name of ["Twitch.RewardCreated", "Twitch.RewardUpdated", "Twitch.RewardDeleted"] as const) {
      void client.on(name, (event) => {
        recordRaw(name, event as RawEvent);
        void redemptions.loadRewards();
      });
    }

    for (const [name, handle] of Object.entries(modEventHandlers)) {
      void client.on(name as any, (event) => {
        const e = event as RawEvent;
        recordRaw(name, e);
        try {
          handle(e.data ?? {});
        } catch (err) {
          console.warn(`Couldn't apply ${name}`, err, e.data);
        }
      });
    }

    const sources = [
      ["Twitch", twitchEventMappers],
      ["YouTube", youtubeEventMappers],
    ] as const;
    for (const [source, mappers] of sources) {
      for (const [type, map] of Object.entries(mappers)) {
        const name = `${source}.${type}`;
        void client.on(name as any, (event) => {
          const e = event as RawEvent;
          recordRaw(name, e);
          try {
            receiveEvent(map(e.data ?? {}, e.timeStamp));
          } catch (err) {
            console.warn(`Couldn't show ${name}`, err, e.data);
          }
        });
      }
    }
  });
}
