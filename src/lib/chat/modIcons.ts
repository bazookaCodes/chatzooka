// Small icons shown at the right edge of Mod actions rows, like Streamer.bot's chat.
import { Ban, Clock, Eraser, Heart, Hourglass, Repeat, Shield, Smile, Star, TimerOff, Trash2, UserCheck, Users } from "@lucide/svelte";
import type { Component } from "svelte";

export type ModIcon =
  | "ban"
  | "timeout"
  | "unban"
  | "untimeout"
  | "delete"
  | "clear"
  | "slow"
  | "followers"
  | "subs"
  | "emote"
  | "unique"
  | "shield"
  | "members";

export const MOD_ICONS: Record<ModIcon, { icon: Component<{ size?: number }>; color: string }> = {
  ban: { icon: Ban, color: "#ff6b6b" },
  timeout: { icon: Clock, color: "#f5a623" },
  unban: { icon: UserCheck, color: "#5cc98a" },
  untimeout: { icon: TimerOff, color: "#5cc98a" },
  delete: { icon: Trash2, color: "#e57373" },
  clear: { icon: Eraser, color: "#e57373" },
  slow: { icon: Hourglass, color: "#c0c0c0" },
  followers: { icon: Heart, color: "#c0c0c0" },
  subs: { icon: Star, color: "#c0c0c0" },
  emote: { icon: Smile, color: "#c0c0c0" },
  unique: { icon: Repeat, color: "#c0c0c0" },
  shield: { icon: Shield, color: "#c0c0c0" },
  members: { icon: Users, color: "#c0c0c0" },
};
