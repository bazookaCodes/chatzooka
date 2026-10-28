// Small per-device preferences kept in localStorage. Reads and writes never throw.

export function loadSetting<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`chatzooka.${key}`);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function saveSetting<T>(key: string, value: T): void {
  try {
    localStorage.setItem(`chatzooka.${key}`, JSON.stringify(value));
  } catch {
    // Storage unavailable; the setting just won't persist.
  }
}
