// Channel point redemptions: the fulfill/refund queue and your rewards list.
//
// Twitch only lets the app that created a reward change its redemptions. Chatzooka acts through
// Streamer.bot, so Fulfill/Refund work for rewards Streamer.bot created (`isOurs` in the rewards
// list). Other rewards still show up, just without buttons.
import { SvelteMap } from "svelte/reactivity";
import { recentRedemptions, saveMessages } from "../db/history";
import { bridge } from "../streamerbot/bridge.svelte";
import { streamerbot } from "../streamerbot/connection.svelte";
import { toasts } from "../toasts.svelte";
import { chat } from "./store.svelte";
import type { ChatMessage, Redemption } from "./types";

export interface Reward {
  id: string;
  title: string;
  group?: string;
  prompt?: string;
  cost: number;
  inputRequired: boolean;
  backgroundColor?: string;
  paused: boolean;
  enabled: boolean;
  isOurs: boolean;
}

type Status = Redemption["status"];

/* eslint-disable @typescript-eslint/no-explicit-any */

class Redemptions {
  /** Redemptions seen this session or loaded from the last week, by redemption ID. */
  #byId = new SvelteMap<string, ChatMessage>();
  rewards = $state.raw<Reward[] | null>(null);
  rewardsError = $state<string | null>(null);
  #busy = new SvelteMap<string, boolean>();

  constructor() {
    streamerbot.onConnected(() => void this.loadRewards());
    void this.#loadSaved();
  }

  /** Unfulfilled redemptions, oldest first (the order to handle them in). */
  get queue(): ChatMessage[] {
    return [...this.#byId.values()]
      // Redemptions of deleted rewards are gone on Twitch's side too, so they'd never clear.
      .filter((m) => m.redemption?.status === "unfulfilled" && !this.rewardDeleted(m.redemption.rewardId))
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  /** True once the rewards list is loaded and this reward isn't in it (deleted on Twitch). */
  rewardDeleted(rewardId: string): boolean {
    return this.rewards !== null && !this.reward(rewardId);
  }

  /** Every known redemption of one reward, newest first. */
  forReward(rewardId: string): ChatMessage[] {
    return [...this.#byId.values()]
      .filter((m) => m.redemption?.rewardId === rewardId)
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  isBusy(redemptionId: string): boolean {
    return this.#busy.get(redemptionId) ?? false;
  }

  reward(rewardId: string): Reward | undefined {
    return this.rewards?.find((r) => r.id === rewardId);
  }

  /**
   * Whether Fulfill/Refund can work. Unknown rewards (list not loaded, e.g. older bridge) are
   * treated as manageable; Twitch's answer then says if it wasn't.
   */
  canManage(rewardId: string): boolean {
    const r = this.reward(rewardId);
    return r ? r.isOurs : this.rewards === null;
  }

  track(message: ChatMessage): void {
    if (message.kind === "redemption" && message.redemption?.redemptionId) {
      this.#byId.set(message.redemption.redemptionId, message);
    }
  }

  /** Re-check the bridge version first (it may have been updated in Streamer.bot), then load. */
  async refresh(): Promise<void> {
    this.rewardsError = null;
    await bridge.check();
    await this.loadRewards();
  }

  async loadRewards(): Promise<void> {
    if (!bridge.supports(3)) {
      // Bridge status is checked on connect too; wait for it before deciding.
      if (bridge.status === "unknown") setTimeout(() => void this.loadRewards(), 1500);
      else this.rewardsError = bridge.status === "ready" ? "Update the Chatzooka Bridge to see your rewards." : "Needs the Chatzooka Bridge.";
      return;
    }
    const res = await bridge.call("twitch.listRewards");
    if (res.ok) {
      this.rewards = ((res.data as any[]) ?? []).map((r) => ({ ...r, cost: Number(r.cost ?? 0) }));
      this.rewardsError = null;
    } else {
      this.rewardsError = res.error;
    }
  }

  async fulfill(message: ChatMessage): Promise<void> {
    await this.#resolve(message, "fulfilled");
  }

  async refund(message: ChatMessage): Promise<void> {
    await this.#resolve(message, "canceled");
  }

  /** Apply all of one reward's unfulfilled redemptions. */
  async resolveAll(rewardId: string, status: "fulfilled" | "canceled"): Promise<void> {
    for (const m of this.queue.filter((q) => q.redemption?.rewardId === rewardId)) {
      await this.#resolve(m, status, true);
    }
  }

  async #resolve(message: ChatMessage, status: "fulfilled" | "canceled", quiet = false): Promise<void> {
    const r = message.redemption;
    if (!r || this.isBusy(r.redemptionId)) return;
    this.#busy.set(r.redemptionId, true);
    const res = await bridge.call(status === "fulfilled" ? "twitch.fulfill" : "twitch.refund", {
      rewardId: r.rewardId,
      redemptionId: r.redemptionId,
    });
    this.#busy.delete(r.redemptionId);
    const who = message.author.displayName;
    if (res.ok) {
      this.setStatus(r.redemptionId, status);
      if (!quiet) toasts.show(status === "fulfilled" ? `Fulfilled ${who}'s ${r.title}` : `Refunded ${who}'s ${r.title}`);
    } else {
      toasts.show(`Couldn't ${status === "fulfilled" ? "fulfill" : "refund"} ${who}'s ${r.title}: ${res.error}`, "error");
    }
  }

  /** Update a redemption's status everywhere (queue, chat rows, history). */
  setStatus(redemptionId: string, status: Status): void {
    const update = (m: ChatMessage): ChatMessage =>
      m.redemption?.redemptionId === redemptionId && m.redemption.status !== status
        ? { ...m, redemption: { ...m.redemption, status } }
        : m;
    const existing = this.#byId.get(redemptionId);
    if (existing) {
      const updated = update(existing);
      this.#byId.set(redemptionId, updated);
      saveMessages([updated]);
    }
    chat.updateWhere((m) => m.redemption?.redemptionId === redemptionId, update);
  }

  /** Twitch.RewardRedemptionUpdated: someone fulfilled/refunded it elsewhere (dashboard, Streamer.bot). */
  onUpdated(d: any): void {
    const id = d?.id ?? d?.redemptionId ?? d?.redemption?.id;
    const raw = String(d?.status ?? d?.redemption?.status ?? "").toLowerCase();
    const status: Status | null = raw.includes("fulfil") ? "fulfilled" : raw.includes("cancel") ? "canceled" : null;
    if (id && status) this.setStatus(String(id), status);
  }

  async #loadSaved(): Promise<void> {
    try {
      for (const m of await recentRedemptions(7)) {
        const id = m.redemption?.redemptionId;
        if (id && !this.#byId.has(id)) this.#byId.set(id, m);
      }
    } catch (e) {
      console.warn("Couldn't load saved redemptions", e);
    }
  }
}

export const redemptions = new Redemptions();
