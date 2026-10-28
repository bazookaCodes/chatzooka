// User quick actions: Streamer.bot actions you pick in Settings, shown as buttons on user cards.
// Clicking one runs the action with that user filled in, using the argument names Streamer.bot's
// own chat and command triggers use, so existing actions (e.g. a shoutout) work unchanged.
import type { ChatAuthor, Platform } from "./chat/types";
import { prefs } from "./prefs.svelte";
import { BRIDGE_ACTION } from "./streamerbot/bridge.svelte";
import { streamerbot } from "./streamerbot/connection.svelte";
import { toasts } from "./toasts.svelte";

export interface SbAction {
  id: string;
  name: string;
  group: string;
  enabled: boolean;
}

/* eslint-disable @typescript-eslint/no-explicit-any */

class QuickActions {
  /** Every action in Streamer.bot (except the Chatzooka Bridge itself), by group then name. */
  all = $state.raw<SbAction[]>([]);
  loaded = $state(false);

  constructor() {
    streamerbot.onConnected(() => void this.load());
  }

  async load(): Promise<void> {
    const client = streamerbot.client;
    if (!client) return;
    try {
      const res: any = await client.getActions();
      this.all = ((res.actions ?? []) as any[])
        .filter((a) => a.name !== BRIDGE_ACTION)
        .map((a) => ({ id: String(a.id), name: String(a.name), group: String(a.group ?? ""), enabled: a.enabled !== false }))
        .sort((a, b) => a.group.localeCompare(b.group) || a.name.localeCompare(b.name));
      this.loaded = true;
    } catch (e) {
      console.warn("Couldn't load Streamer.bot actions", e);
    }
  }

  /** The actions chosen for user cards, in the order they were picked. */
  get chosen(): SbAction[] {
    return prefs.value.quickActions
      .map((id) => this.all.find((a) => a.id === id))
      .filter((a): a is SbAction => !!a);
  }

  toggle(id: string): void {
    const list = prefs.value.quickActions;
    prefs.set("quickActions", list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  }

  async run(action: SbAction, platform: Platform, author: ChatAuthor): Promise<void> {
    const client = streamerbot.client;
    if (!client || streamerbot.status !== "connected") {
      toasts.show("Not connected to Streamer.bot", "error");
      return;
    }
    const login = author.login ?? author.displayName;
    const args = {
      // As if the user triggered it themselves (chat/command triggers)...
      user: author.displayName,
      userName: login,
      userId: author.id,
      userType: platform,
      // ...and as the target of a command like "!so @user".
      targetUser: author.displayName,
      targetUserName: login,
      targetUserId: author.id,
      input0: login,
      rawInput: login,
      triggeredBy: "Chatzooka",
    };
    try {
      const res: any = await client.doAction({ id: action.id }, args);
      if (res?.status === "ok") toasts.show(`Ran "${action.name}" for ${author.displayName}`);
      else toasts.show(`Couldn't run "${action.name}": ${res?.error ?? "Streamer.bot returned an error"}`, "error");
    } catch (e) {
      toasts.show(`Couldn't run "${action.name}": ${e instanceof Error ? e.message : String(e)}`, "error");
    }
  }
}

export const quickActions = new QuickActions();
