import { loadSetting, saveSetting } from "../settings";

/* eslint-disable @typescript-eslint/no-explicit-any */
export type RawEvent = { timeStamp?: string; data?: any };

/**
 * Dev builds keep the last few raw payloads of each event type (in localStorage under
 * `chatzooka.dev.rawEvents`) so undocumented Streamer.bot formats can be checked later.
 */
export function recordRaw(name: string, e: RawEvent): void {
  if (!import.meta.env.DEV) return;
  const all = loadSetting<Record<string, RawEvent[]>>("dev.rawEvents", {});
  all[name] = [e, ...(all[name] ?? [])].slice(0, 5);
  saveSetting("dev.rawEvents", all);
}
