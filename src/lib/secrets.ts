// Secrets go to the OS credential store through the Rust side. When the UI runs in a plain
// browser (npm run dev without Tauri), they are kept in memory only.
import { invoke, isTauri } from "@tauri-apps/api/core";

const memory = new Map<string, string>();

export async function getSecret(key: string): Promise<string | null> {
  if (!isTauri()) return memory.get(key) ?? null;
  return invoke<string | null>("get_secret", { key });
}

export async function setSecret(key: string, value: string | null): Promise<void> {
  if (!isTauri()) {
    if (value) memory.set(key, value);
    else memory.delete(key);
    return;
  }
  await invoke("set_secret", { key, value: value || null });
}
