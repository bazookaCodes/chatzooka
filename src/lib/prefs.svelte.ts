// User preferences from the Settings window (modeled on Streamer.bot's chat settings). Saved per
// device in localStorage; changes apply immediately everywhere that reads them.
import type { Platform } from "./chat/types";
import { loadSetting, saveSetting } from "./settings";

export type RemovedMessages = "strike" | "hide";
export type PlatformIcons = "always" | "all-tab" | "never";

export type HighlightCategory =
  | "mention"
  | "highlightedMessage"
  | "firstEver"
  | "firstSession"
  | "moderator"
  | "vip"
  | "subscriber"
  | "broadcaster"
  | "highlightedUser";

export interface HighlightSetting {
  enabled: boolean;
  color: string;
}

export interface HighlightPattern {
  id: string;
  type: "text" | "regex";
  pattern: string;
  enabled: boolean;
  color: string;
}

export interface FlaggedUser {
  platform: Platform;
  /** Login (Twitch) or display name (YouTube), lowercase. */
  name: string;
  addedAt: number;
}

export interface Prefs {
  // General
  fontFamily: string;
  /** Chat text size in px. */
  fontSize: number;
  alternateBackground: boolean;
  platformIcons: PlatformIcons;
  showAvatars: boolean;
  showBadges: boolean;
  animateEmotes: boolean;
  sevenTvPaints: boolean;
  /** Turn BetterTTV / FrankerFaceZ emote names in chat into emotes. */
  bttvEmotes: boolean;
  ffzEmotes: boolean;
  showTimestamps: boolean;
  timestamps24h: boolean;
  hideSeconds: boolean;
  /** Deleted / timed-out messages: keep them crossed out, or hide them from chat. */
  removedMessages: RemovedMessages;
  /** Show a page preview when hovering a link in chat. */
  linkPreviews: boolean;
  /** Check links in chat against phishing lists and look-alike rules. */
  linkSafety: boolean;
  /** Private notices when people join or leave your Twitch chat. */
  joinLeaveNotices: boolean;
  /** Count of people in chat in the tab bar; click it for the list. */
  viewerCount: boolean;
  /** Leave known bots and viewer-list crawlers out of the user list and viewer count. */
  hideBots: boolean;
  // Highlights
  highlights: Record<HighlightCategory, HighlightSetting>;
  patterns: HighlightPattern[];
  highlightUsers: FlaggedUser[];
  ignoreHighlightUsers: FlaggedUser[];
  // History
  /** Delete saved chat history older than this many days; 0 keeps everything. */
  historyDays: number;
  // Quick actions
  /** Streamer.bot action IDs shown as buttons on user cards. */
  quickActions: string[];
}

export const DEFAULT_HIGHLIGHTS: Record<HighlightCategory, HighlightSetting> = {
  mention: { enabled: true, color: "#d6303b" },
  highlightedMessage: { enabled: true, color: "#8a45d6" },
  firstEver: { enabled: true, color: "#6fbf24" },
  firstSession: { enabled: false, color: "#3f8f5a" },
  moderator: { enabled: false, color: "#00ad03" },
  vip: { enabled: false, color: "#e005b9" },
  subscriber: { enabled: false, color: "#00a3b5" },
  broadcaster: { enabled: false, color: "#e0661a" },
  highlightedUser: { enabled: true, color: "#7a4fd6" },
};

export const DEFAULT_PREFS: Prefs = {
  fontFamily: "",
  fontSize: 14,
  alternateBackground: true,
  platformIcons: "always",
  showAvatars: false,
  showBadges: true,
  animateEmotes: true,
  sevenTvPaints: true,
  bttvEmotes: true,
  ffzEmotes: true,
  showTimestamps: true,
  timestamps24h: false,
  hideSeconds: true,
  removedMessages: "strike",
  linkPreviews: true,
  linkSafety: true,
  joinLeaveNotices: false,
  viewerCount: true,
  hideBots: true,
  highlights: DEFAULT_HIGHLIGHTS,
  patterns: [],
  highlightUsers: [],
  ignoreHighlightUsers: [],
  historyDays: 0,
  quickActions: [],
};

/** Fonts offered in Settings ("" = the system font). Loaded from Google Fonts when picked. */
export const FONT_CHOICES = ["", "DM Sans", "Inter", "Roboto", "Open Sans", "Nunito", "Lexend", "Poppins"];

function load(): Prefs {
  const saved = loadSetting<Partial<Prefs>>("prefs", {});
  return {
    ...DEFAULT_PREFS,
    ...saved,
    // New highlight categories get their defaults even if older settings were saved.
    highlights: { ...DEFAULT_HIGHLIGHTS, ...(saved.highlights ?? {}) },
  };
}

class PrefsStore {
  value = $state<Prefs>(load());

  constructor() {
    this.#apply();
  }

  set<K extends keyof Prefs>(key: K, v: Prefs[K]): void {
    this.value[key] = v;
    this.#save();
  }

  setHighlight(category: HighlightCategory, patch: Partial<HighlightSetting>): void {
    this.value.highlights[category] = { ...this.value.highlights[category], ...patch };
    this.#save();
  }

  resetHighlight(category: HighlightCategory): void {
    this.value.highlights[category] = { ...DEFAULT_HIGHLIGHTS[category] };
    this.#save();
  }

  #save(): void {
    saveSetting("prefs", $state.snapshot(this.value));
    this.#apply();
  }

  /** Settings that live in CSS. */
  #apply(): void {
    const root = document.documentElement.style;
    root.setProperty("--font-size", `${this.value.fontSize}px`);
    const family = this.value.fontFamily;
    root.setProperty(
      "--font",
      family ? `"${family}", "Segoe UI", system-ui, sans-serif` : `"Segoe UI", system-ui, -apple-system, "Helvetica Neue", Ubuntu, sans-serif`,
    );
    if (family) loadGoogleFont(family);
  }
}

const loadedFonts = new Set<string>();
function loadGoogleFont(family: string): void {
  if (loadedFonts.has(family)) return;
  loadedFonts.add(family);
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@400;600;700&display=swap`;
  document.head.appendChild(link);
}

export const prefs = new PrefsStore();
