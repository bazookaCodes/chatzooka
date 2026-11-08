# Chatzooka — Multi-Stream Chat Client Plan

A desktop chat client for monitoring and moderating Twitch and YouTube chat side by side, with full 7TV support. Chatzooka connects through **Streamer.bot**, which is already running and signed in to both platforms. Chatzooka needs no logins of its own.

## Feature list

| # | Feature | Platforms |
|---|---------|-----------|
| 1 | Runs on Windows, Linux, macOS | — |
| 2 | 7TV name paints | Twitch, YouTube (where users have linked 7TV) |
| 3 | Emotes: 7TV, Twitch native, YouTube native and member emotes | Both |
| 4 | Animated emotes (GIF / animated WebP / AVIF) | Both |
| 5 | Send to Twitch, YouTube, or both (target selector) | Both |
| 6 | Mod actions: timeout, ban, unban, delete message | Both |
| 7 | User card: profile summary plus the user's previous messages | Both |
| 8 | Twitch channel points: redemptions in chat, fulfill/refund queue, rewards list | Twitch |
| 9 | Tabs: **All**, **Twitch**, **YouTube**, **Events** | — |
| 10 | **First-ever message highlight**: a chatter's first message ever in your chat is highlighted | Both |
| 11 | **Mod actions tab**: log of every timeout, ban, unban, lifted timeout and deleted message (by anyone), with a red unread count | Both |
| 13 | **Chat-setting chips**: slow / followers-only / subs-only / emote-only / unique chat / shield mode (Twitch, from ROOMSTATE + Streamer.bot) and members-only (YouTube); click to turn off; confirmed live | Both |
| 12 | **Link previews + link safety**: clickable links; hover preview (fetched only on hover, never for flagged links); local phishing/look-alike scanner with ⚠ warnings | Both |

## Decisions so far

| Question | Answer |
|----------|--------|
| Current client | Streamer.bot (its chat window is the design reference) |
| How Chatzooka connects | Through Streamer.bot's WebSocket server. No Twitch/Google logins in Chatzooka. |
| On-stream overlay | Not needed |
| Who uses it | Just you |
| Channel points | Redemptions shown in chat, plus a fulfill/refund queue and a rewards list. Streamer.bot keeps owning and managing the rewards. |
| Redeeming rewards yourself | Dropped (no API for it) |
| Repo | Will be published on GitHub. Set up as a repo now; no git actions until you do them. |

---

## 1. Tech stack

Streamer.bot does the platform work, so Chatzooka is mostly an interface. Most logic lives in TypeScript; the Rust side stays small.

| Layer | Choice | Why |
|-------|--------|-----|
| App shell | **Tauri 2** | One app with native installers for all 3 OSes (.msi/.exe, .deb/.AppImage, .dmg). Far lighter than Electron next to OBS and a game. |
| UI | **Svelte 5 + TypeScript** (Vite) | Fast reactive rendering for high-volume chat. |
| Streamer.bot connection | **`@streamerbot/client`** (Streamer.bot's official JS client) | Handles the WebSocket connection, reconnects, event subscriptions and requests. |
| Chat list | Virtualized list (e.g. `@tanstack/virtual`) | Only rows on screen exist, so long sessions stay smooth. |
| Storage | **SQLite** via `tauri-plugin-sql` | Message history for user cards, user notes, settings. Lives in the OS app-data folder. |
| Emote images | Webview's built-in HTTP cache + preloading | Animated GIF/WebP/AVIF play natively in the webview. |
| Rust side | Tauri plugins only (SQL, window state, updater, single instance) | Nothing custom unless performance testing shows a need. |

---

## 2. Architecture

```
┌──────────── Streamer.bot (already running, logged in) ────────────┐
│  Twitch + YouTube connections, rewards, moderation permissions    │
│                                                                   │
│  WebSocket server  ws://127.0.0.1:8080/   (optional password)     │
│    events  ─────────────────────────────────────────────┐         │
│    requests: SendMessage, DoAction, GetActiveViewers,   │         │
│              TwitchGetEmotes, YouTubeGetEmotes, ...     │         │
│                                                         │         │
│  "Chatzooka Bridge" action (C#, imported once) ◄── DoAction       │
│    timeout / ban / unban / delete / fulfill / refund /  │         │
│    user info / list rewards  ──► broadcasts result ─────┤         │
└─────────────────────────────────────────────────────────┼─────────┘
                                                          ▼
┌──────────────────────────── Chatzooka ─────────────────────────────┐
│  SbConnection ──► Normalizer ──► ChatMessage ──► MessageStore      │
│                       ▲                              │   │         │
│  SevenTv (REST + EventAPI) ── emotes + paints        │   └► SQLite │
│                                                      ▼             │
│  UI: Tabs [All|Twitch|YouTube|Events] · MessageRow · Composer      │
│      UserCard · ModBar · Redemptions queue · Settings              │
└────────────────────────────────────────────────────────────────────┘
```

### 2.1 What comes straight from Streamer.bot

| Need | Streamer.bot feature |
|------|----------------------|
| Twitch chat | Event `Twitch.ChatMessage` (user, color, badges, roles, emotes, message ID) |
| YouTube chat | Event `YouTube.Message` |
| Deletions/bans by anyone | `Twitch.ChatMessageDeleted`, `Twitch.ChatCleared`, `Twitch.UserTimedOut`, `Twitch.UserBanned`, `Twitch.UserUnbanned`, `YouTube.MessageDeleted`, `YouTube.UserTimedout`, `YouTube.UserBanned` |
| Events tab | `Twitch.Sub/ReSub/GiftSub/GiftBomb/Cheer/Raid/Follow/Announcement`, `YouTube.SuperChat/SuperSticker/NewSponsor/MembershipGift` |
| Redemptions | `Twitch.RewardRedemption`, `Twitch.RewardRedemptionUpdated` |
| Sending chat | Request `SendMessage` with `platform: "twitch"` or `"youtube"` (for "Both", sent once per platform) |
| Platform emotes for the picker | Requests `TwitchGetEmotes`, `YouTubeGetEmotes` |
| Your account info | Request `GetBroadcaster` (Twitch user ID and YouTube channel ID, used to look up 7TV) |

### 2.1a Findings from Phase 1 (Streamer.bot 1.0.7)

- Real `Twitch.ChatMessage` payloads differ from the types bundled with `@streamerbot/client`: the shape is `data.user` (id, login, name, color, role, badges, subscribed), `data.messageId`, `data.meta` (isMe, createdAt, firstMessage, …), `data.text`, and `data.parts`. `parts` is already split into `text` and `emote` pieces, and **Streamer.bot resolves 7TV emotes itself** (`source: "7TVChannel"`), not just Twitch ones. Phase 2 can lean on that and focus on paints, animated formats and live emote updates.
- `YouTube.Message` only fires for a broadcast Streamer.bot is monitoring (i.e. while live). **Confirmed on a live stream:** the payload is `data.message`, `data.eventId`, `data.publishedAt`, `data.user` (id, name, profileImageUrl, isOwner, isModerator, isSponsor, isVerified), `data.broadcast`, and `data.emotes` with inclusive UTF-16 `startIndex`/`endIndex`. Unlike Twitch, YouTube `parts` have no `type` field, so Chatzooka builds fragments from `emotes`. Standard emoji (`type: "Twemoji"`) stay as text; YouTube custom emoji (`type: "youtube"`) become images, requested at 48px instead of the 24px default.
- `SendMessage` only works on an **authenticated** WebSocket, so Phase 4 needs a password set in Streamer.bot's WebSocket Server settings and in Chatzooka's.
- The chat list uses CSS `content-visibility: auto` on rows plus a 2,000-message cap instead of a virtualization library; it keeps stick-to-bottom simple. Revisit if the Phase 2 stress test shows problems.

### 2.1b Findings from Phase 2 (7TV)

- 7TV's v3 cosmetics endpoint is gone; paints and badges come from the **v4 GraphQL API** (`https://7tv.io/v4/gql`). Looking up full paint data per user is rejected as "too complex" in batches, so Chatzooka loads the whole paint + badge catalog once (~1.2 MB: ~1,050 paints, ~150 badges) and looks up only paint/badge **IDs** per chatter, 25 per request. Lookups are cached for 10 minutes, so paint changes appear within that time. The catalog reloads if a chatter has a paint it hasn't seen.
- To avoid names showing their plain color first: the catalog loads at startup, everyone already in chat (`GetActiveViewers`) is looked up on connect, and both the catalog (~250 KB of CSS) and up to 5,000 chatters' paint IDs are saved locally, so known chatters are painted instantly after a restart. A brand-new chatter's lookup takes ~0.3 s.
- Paint layers seen in the catalog: linear gradient, radial gradient, image (no multi-layer paints yet). All are rendered with `background-clip: text` plus `drop-shadow` filters.
- Streamer.bot hands out 7TV emotes as `4x.png` (a still frame for animated emotes); Chatzooka swaps that for `2x.webp`, which animates.
- **Live emote set updates are handled by Streamer.bot**, which resolves 7TV emotes in each message itself, so Chatzooka doesn't need its own 7TV EventAPI connection for that.
- Stress test (`__chatzooka.stress()` in dev builds): 100 msgs/s with 8 animated emotes each ran with under 1% main-thread load after fixing a bug where trimming old messages redrew every row.

### 2.1c Findings from Phase 3

- **Paused view:** scrolling up freezes the list at what was on screen, so new messages (and old ones dropping off the 2,000 cap) don't shift what you're reading. The pill counts what arrived since.
- **Event rows** (`src/lib/streamerbot/eventRows.ts`): Twitch Follow, Sub, ReSub, GiftSub, GiftBomb, Cheer, Raid, Announcement, RewardRedemption; YouTube SuperChat, SuperSticker, NewSponsor, MemberMileStone, MembershipGift. **None of these payloads have been seen live yet**, so each field is read from several likely names. Dev builds save the last 5 raw payloads per event type in localStorage (`chatzooka.dev.rawEvents`). Check them after a stream with real subs/raids/super chats and tighten the mappings.
- Follows are Events-tab only, so follow-bot waves don't flood chat.
- **First-ever highlight** (`src/lib/chat/firstSeen.ts`): Twitch uses `meta.firstMessage` (still to verify with a never-used alt; raw payloads with the flag set are saved under `Twitch.ChatMessage(firstMessage)`); YouTube uses Chatzooka's own permanent record of channel IDs (localStorage for now, SQLite in Phase 6). First-ever messages also appear on the Events tab.

### 2.1d Findings from Phase 6

- **History:** SQLite via `tauri-plugin-sql` (`chatzooka.db` in the app data folder). Tables `messages` (full message JSON, deleted flag, mod note; indexed by platform + user + time) and `users` (first/last seen, message count, notes). Writes are batched once a second. Message retention/cleanup isn't built yet.
- **Bridge v2** adds `twitch.userInfo` (`TwitchGetExtendedUserInfoByLogin`), `twitch.mod`, `twitch.unmod`. Twitch's extended info has **no follow date**, only `IsFollowing`, so the card shows "Following: yes/no". Settings flags an outdated bridge.
- The first-ever record (`firstSeen.ts`) still uses its own permanent list in localStorage. It works and stays separate from history cleanup; moving it into the `users` table is optional.
- Links (View Channel, Viewer Card) open in your normal browser via `tauri-plugin-opener`.

### 2.1e Findings from Phase 7

- Bridge v3 adds `twitch.listRewards` (`CPH.TwitchGetRewards`). **`TwitchReward.IsOurs` is true for rewards created in Streamer.bot** (confirmed live), which are the only ones Fulfill/Refund can act on.
- The real `Twitch.RewardRedemption` payload mapped correctly (reward title + cost); fulfill/refund via `TwitchRedemptionFulfill`/`TwitchRedemptionCancel` confirmed live.
- YouTube reports timeouts as "temporary bans", which can arrive as `YouTube.UserBanned`. Chatzooka treats a ban event as a timeout when it's marked temporary/has a duration or matches a timeout it just sent (confirmed live). Duplicate events for one action are logged once.
- YouTube avatars (`yt3.ggpht.com`) need `referrerpolicy="no-referrer"` to load.
- **YouTube timeouts/bans need the broadcast ID** (`data.broadcast.id` on each YouTube message). Without it `YouTubeTimeoutUserById` returns false. Confirmed working live once passed.
- Redemptions of a reward that's no longer in the rewards list (deleted) show "Reward deleted" and are left out of the queue.
- At startup the last 500 saved messages are restored (`chat.restore`) with a "Chatzooka opened" divider; they don't count as unread.
- Each feature checks the bridge version it needs (`bridge.supports(n)`), so an older bridge keeps working for what it has. Refresh / Check again re-reads the installed version.

### 2.1f Phase 8 notes

- **Settings** mirror Streamer.bot's chat settings: General (font family/size, alternate background, platform icons, avatars, badges, animate emotes, 7TV paints, removed messages, timestamps) and Highlights (category table with enable + color, text/regex patterns, custom user highlights, ignore list). Highlight order: mentions you → highlighted message → **first message ever** → first message this session → highlighted user → broadcaster → mod → VIP → subscriber → patterns. Chatzooka's first-ever flag is its own (`firstSeen.ts`); Streamer.bot's First Words is not used.
- Avatars: YouTube sends them with each message; Twitch messages don't, so Twitch rows show an initial. "Animate emotes" off swaps 7TV/Twitch emotes for their static versions; BTTV/FFZ stay as sent.
- Not built from Streamer.bot's General page: invert chat direction.
- **Quick actions** run any chosen Streamer.bot action with `user`/`userName`/`userId`/`userType` and `targetUser`/`targetUserName`/`targetUserId`/`input0` set to that user.
- **Auto-update** needs the GitHub repo (owner/name) for the release feed and an updater signing key (private key kept out of the repo, as a GitHub Actions secret).

### 2.1g Link previews and link safety (confirmed live)

- **Previews** (`src-tauri/src/link_preview.rs`): fetched by Rust only when you hover a link (posting a link can't be used to learn your IP; hovering does reveal it to that site, as clicking would). Public internet only: loopback/LAN/link-local/CGNAT addresses refused, DNS pinned per hop, redirects re-checked, 6 s timeout, 1 MB cap. Tor and third-party preview services were considered and declined.
- **Safety** (`src-tauri/src/link_safety.rs`): Phishing.Database (MIT) + OpenPhish community feed, downloaded every 12 h to the app data folder and matched locally as 64-bit hashes; pattern checks for look-alike domains of streaming/gaming brands (same first letter, 1–2 typos), raw IPs, punycode, shorteners, and brand + giveaway wording. Dangerous links never load a preview and need a second click to open. URLhaus now requires a key; the Discord phishing list is stale (2024); VirusTotal skipped (needs a personal key).
- Unit tests: `cargo test --lib link_` (9 tests).

### 2.2 The "Chatzooka Bridge" action

Streamer.bot's WebSocket has no direct requests for moderation, redemption status, or user lookups, and actions run via `DoAction` don't return a result. So Chatzooka ships one Streamer.bot action with a C# sub-action that does the work and **reports back**:

1. Chatzooka sends `DoAction("Chatzooka Bridge", { op, requestId, ...args })`.
2. The C# code runs the matching `CPH` method, for example:
   - `timeout` / `ban` / `unban` → `CPH.TwitchTimeoutUser`, `CPH.TwitchBanUser`, `CPH.TwitchUnbanUser`, `CPH.YouTubeTimeoutUserById`, `CPH.YouTubeBanUserById`
   - `delete` → Twitch/YouTube delete-message methods
   - `fulfill` / `refund` → `CPH.TwitchRedemptionFulfill`, `CPH.TwitchRedemptionCancel` (cancel refunds the points)
   - `userInfo` → Twitch extended user info (avatar, account created, follow date where available)
   - `listRewards` → `CPH.TwitchGetRewards`
3. It sends the result back with `CPH.WebsocketBroadcastJson({ source: "chatzooka", requestId, ok, data | error })`.
4. Chatzooka matches the `requestId`, so each button gets a real success/failure result (e.g. a red toast if a timeout failed).

The C# source lives in the repo (`streamerbot/ChatzookaBridge.cs`) with manual setup steps in `streamerbot/README.md` (create the action, paste the code, compile). An import code isn't generated by hand: Streamer.bot's export format isn't documented, so one can be produced later by exporting the working action from Streamer.bot. Replies use `CPH.WebsocketBroadcastJson`, which arrives as a `General.Custom` event. Streamer.bot has **no YouTube unban or delete-message methods**, so those are Twitch-only. Chatzooka checks on startup that the action exists (`GetActions`) and shows setup instructions if it doesn't.

Exact `CPH` method names and arguments get confirmed against the Streamer.bot docs in phase 5, and some YouTube operations (e.g. unban, delete) may not exist there. Any that are missing are hidden in the UI for YouTube.

### 2.3 Unified message model

Everything from both platforms is turned into one shape, so the UI never cares where a message came from:

```ts
type Platform = "twitch" | "youtube";

interface ChatMessage {
  id: string;                 // platform message id
  platform: Platform;
  timestamp: number;
  author: {
    id: string;               // Twitch user id / YouTube channel id
    login?: string;
    displayName: string;
    color?: string;
    badges: Badge[];          // image URLs from Streamer.bot
    roles: { broadcaster: boolean; mod: boolean; vip: boolean; sub: boolean; member: boolean };
    paintId?: string;         // 7TV paint, if any
  };
  fragments: Fragment[];      // text | emote | mention | link
  kind: "chat" | "action" | "redemption" | "sub" | "raid" | "cheer" | "superchat" | "member" | "system";
  redemption?: { rewardId: string; redemptionId: string; title: string; cost: number; input?: string;
                 status: "unfulfilled" | "fulfilled" | "canceled" };
  deleted?: boolean;
}

type Fragment =
  | { type: "text"; text: string }
  | { type: "emote"; name: string; url: string; provider: "twitch" | "youtube" | "7tv"; zeroWidth?: boolean }
  | { type: "mention"; text: string }
  | { type: "link"; url: string };
```

The tabs are filters over one in-memory store. Each keeps its own scroll position and paused state.

---

## 3. 7TV (direct, no login)

7TV isn't involved with Streamer.bot; Chatzooka talks to it directly. Its public API needs no account.

| Need | Approach |
|------|----------|
| Global emotes | `GET https://7tv.io/v3/emote-sets/global` |
| Channel emotes (Twitch) | `GET https://7tv.io/v3/users/twitch/{twitchUserId}` (user ID from `GetBroadcaster`) |
| Channel emotes (YouTube) | `GET https://7tv.io/v3/users/youtube/{youtubeChannelId}` (works if your YouTube is linked on 7TV) |
| Live updates | **EventAPI** WebSocket `wss://events.7tv.io/v3`: `emote_set.update` for emotes added/removed mid-stream, and `cosmetic.*` / `entitlement.*` to receive **paints and badges** for chatters |
| Paint rendering | Paints are `LINEAR_GRADIENT`, `RADIAL_GRADIENT`, or `URL` (image) with color stops, angle, repeat and drop shadows. Rendered on the username with `background-image: …gradient(…)`, `background-clip: text`, `color: transparent`, plus `filter: drop-shadow(…)` per shadow. One CSS class per paint, reused. |
| Zero-width emotes | Stacked on top of the previous emote |
| Images | `https://cdn.7tv.app/emote/{id}/2x.webp`, with `.avif` / `.gif` fallbacks |

Emote order when tokenizing a word: emotes Streamer.bot already marked → 7TV channel → 7TV global. 7TV has a newer v4 GraphQL API; all 7TV calls sit in one module so switching is a one-file change.

---

## 4. Feature design

### 4.1 Visual design: modeled on Streamer.bot's chat window
Based on the reference screenshots.

**Main window**
- Dark theme: near-black background, rows separated by a subtle alternating shade, muted grey timestamps, white message text.
- **Icon tab bar** at the top left: All (chat bubbles), Twitch, YouTube, **Events** (sparkle). Settings gear at the top right. The active tab is underlined. Unread counts on inactive tabs.
- **Message row:** `10:24 PM` · platform icon · badges · **bold colored name** (7TV paint when present) · `:` · message with inline emotes. Compact rows that wrap when long.
- **Paused pill** at the bottom right when scrolled up: "⏸ Paused · N new messages ↵" (click to jump back down).
- **Composer:** menu button on the left; input with placeholder "Send a message to all platforms…"; **Twitch and YouTube toggle icons inside the input** on the right (both lit = send to both; the placeholder text follows the selection); emote picker button; send button.
- **Connection indicator** for Streamer.bot (connected / reconnecting / not running).

### 4.2 Sending
- Platform toggles in the composer, remembered between sessions. On the Twitch or YouTube tab, it defaults to that platform.
- Emote autocomplete with `Tab` / `:` and an emote picker (7TV + platform emotes).
- "Both" sends to each platform separately. A failure on one shows a small error on the composer.

### 4.3 Moderation
- **Hover row:** quick icons to delete the message, time out (default 10m), or ban.
- **Right-click:** full menu with timeout presets, ban, unban, delete, copy message, open user card.
- Confirmation for permanent bans (can be turned off).
- Deleted or timed-out messages stay visible, struck through and greyed (can be turned off).
- Every action goes through the Chatzooka Bridge and shows success or failure.

### 4.4 User card
Opens when you click a username. A modal over the chat with an ✕ to close.
- **Header:** avatar, platform icon, painted display name, copy-name button.
- **Role chips:** colored pills such as **Moderator** (green), **Subscriber** (teal), **Affiliate** (pink), VIP, Member.
- **Links:** View Channel ↗, Viewer Card ↗ (Twitch's popout viewer card).
- **Quick actions:** user-defined buttons that run any of your Streamer.bot actions with this user as the target, e.g. "Shoutout" (shows "No User Quick Actions found" when none are set up).
- **Mod bar:** unban, mod/unmod, timeout presets `1s 30s 60s 10m 30m 1h 4h 12h 1d 7d 14d`, ban.
- **Messages tab:** that user's history from SQLite, rendered like chat rows, newest first, deleted ones marked.
- **Details tab:** account created, follow date, first seen, message count, local notes.

### 4.5 Channel points
**Redemptions in chat:** every redemption appears as a highlighted row in **All**, **Twitch** and **Events**: "**user** redeemed **Hydrate** (500)" plus the user's input text. Per-reward setting to hide a reward from chat.

**Redemption queue:** a panel on the Events tab listing unfulfilled redemptions, oldest first (user, reward, input, time waiting), with **Fulfill** and **Refund** buttons, also inline on the chat row. Bulk fulfill/refund per reward. Status changes made anywhere (Twitch dashboard, Streamer.bot) show up through `RewardRedemptionUpdated`.

**Rewards list:** loaded via the Bridge (`listRewards`): title, cost, prompt, enabled/paused. Click a reward to see its redemption history (stored in SQLite, filterable by reward, user and status).

**The one Twitch rule that still applies:** only the app that created a reward can fulfill or refund its redemptions. Because the buttons run through Streamer.bot, they work for **rewards created in Streamer.bot**. Rewards made in the Twitch dashboard appear in chat and the list, marked "not managed by Streamer.bot", without buttons. To make one manageable, recreate it in Streamer.bot.

Requires Twitch Affiliate or Partner.

### 4.5a First-ever message highlight
Requested after Phase 2: you need to know when someone is talking in your chat **for the first time ever**.

- **Look:** like Streamer.bot's "FIRST WORDS" rows: a green-tinted row with a small **FIRST MESSAGE** label at the top right, so it stands out while scrolling. It shows on All and the platform tab, and also goes in the Events tab so it's not missed in a busy chat.
- **Do not rely on Streamer.bot's notion of "first".** Its First Words is broken for this purpose (it labeled your own message in the reference screenshot), and that's one of the reasons Chatzooka exists. Chatzooka decides "first ever" itself.
- **Twitch:** Twitch itself tracks this: its chat servers mark a user's first message ever in a channel (the IRC `first-msg` tag). Streamer.bot passes a `meta.firstMessage` field, but it's unknown whether that is Twitch's flag or Streamer.bot's own tracking (Streamer.bot also sends a `firstMessageTimestamp` of its own). **Verify before trusting it:** chat from a never-used alt account and confirm the flag is true, and that it's false for a viewer who first chatted before Streamer.bot was installed. If it's Twitch's flag, use it. If not, read Twitch's flag directly, either through a lightweight read-only Twitch IRC connection (anonymous login, no setup) that carries the `first-msg` tag, or by treating Twitch the same as YouTube below.
- **Chatzooka's own record, both platforms:** a permanent list of every user ID ever seen chatting (SQLite), kept independently of message history retention. It backs up the Twitch flag and is the only source for YouTube.
- **YouTube:** YouTube has no first-ever flag. Chatzooka marks a YouTube chatter's first message the first time it has **ever seen** that channel ID, using its own SQLite history. It's only accurate from when Chatzooka started recording, so early streams will over-highlight returning YouTube viewers until the history fills in. Possible later improvement: seed the history from Streamer.bot's user records.
- **Settings:** on/off, and an optional sound.

### 4.6 Message history
- Every message is saved to SQLite (in the OS app-data folder) for user cards and the redemption history.
- Each tab keeps at most ~1,000–2,000 messages in memory; older ones stay only in SQLite.
- Setting to delete history older than N days.
- Only messages received while Chatzooka is open are saved. Streamer.bot doesn't replay past chat.

---

## 5. Streamer.bot setup (one time)

1. **Servers/Clients → WebSocket Server:** enable it (default `127.0.0.1:8080`, endpoint `/`). Turning on authentication with a password is recommended. The password is entered in Chatzooka's settings and stored in the OS keychain.
2. **Import the Chatzooka Bridge action:** paste the import code from `streamerbot/` in this repo.
3. Make sure Twitch (broadcaster account) and YouTube are connected in Streamer.bot.

Chatzooka's settings screen has host, port and password fields, a "Test connection" button, and a checklist that shows which of these steps are done.

---

## 6. Performance

- The Rust side is minimal; memory is mostly the webview, roughly 100–200 MB total.
- Normal chat uses almost no CPU. Animated emote spam is the main cost.
- Kept light by: the virtualized list, the per-tab message cap, one CSS class per paint, adding new messages to the screen in small batches (every 50–100 ms), and pausing emote animations when the window isn't focused (setting).
- Phase 2 includes a stress test: a replayed high-volume chat full of animated 7TV emotes.

---

## 7. Project layout

```
chatzooka/
├── src/                         # Svelte + TypeScript app
│   ├── lib/
│   │   ├── streamerbot/         # connection, event mapping, bridge requests
│   │   ├── seventv/             # REST, EventAPI, paints
│   │   ├── chat/                # ChatMessage model, normalizer, tokenizer, store
│   │   ├── db/                  # SQLite access
│   │   └── components/          # ChatView, MessageRow, PaintedName, Emote, Composer,
│   │                            # UserCard, ModBar, Tabs, Redemptions, Settings
│   └── App.svelte
├── src-tauri/                   # Tauri shell (plugins + config)
├── streamerbot/
│   ├── ChatzookaBridge.cs       # C# source for the bridge action
│   └── import.txt               # Streamer.bot import code
├── .github/workflows/release.yml  # builds Windows/macOS/Linux installers
├── PLAN.md
└── README.md
```

---

## 8. Build phases

| Phase | Deliverable | Covers |
|-------|-------------|--------|
| **0. Skeleton** ✅ (native build pending Rust install) | Tauri + Svelte app opens on Windows; GitHub Actions builds all 3 OSes; dark theme and icon tab bar | #1 |
| **1. Streamer.bot connection** ✅ (YouTube format unverified until a live stream) | Settings screen, connect/reconnect, Twitch + YouTube chat in one list with badges and native emotes | — |
| **2. 7TV** ✅ | 7TV emotes, animated and zero-width emotes, live emote updates, **paints**; stress test | #2, #3, #4 |
| **3. Tabs** ✅ (event payloads + Twitch first-message flag not yet seen live) | All / Twitch / YouTube / Events tabs, unread counts, paused pill, event rows, **first-ever message highlight** | #9, #10 |
| **4. Sending** ✅ (Twitch and YouTube confirmed live) | Composer with platform toggles, emote autocomplete and picker | #5 |
| **5. Bridge + moderation** ✅ (Twitch timeout, unban, delete; YouTube timeout and ban; Mod actions log, all confirmed live. YouTube unban: Streamer.bot has no method, so the card links to YouTube Studio) | Chatzooka Bridge action + import code; timeout, ban, unban, delete with results; deleted-message display | #6 |
| **6. User cards** ✅ (confirmed live with bridge v2) | SQLite history, Bridge `userInfo`, card UI matching the design | #7 |
| **7. Channel points** ✅ (confirmed live: real redemption, fulfill/refund via bridge) | Redemption rows, queue with fulfill/refund, rewards list and history | #8 |
| **8. Polish** (settings ✅, quick actions ✅, history cleanup ✅; auto-update waiting on the GitHub repo) | Full-window Settings modeled on Streamer.bot (General, Highlights incl. first message ever/this session, Streamer.bot, History, Quick Actions), auto-update | #10 |

Phases 0–3 give you a read-only client to try on stream.

---

## 9. Costs and distribution

- No server or hosting. Chatzooka and Streamer.bot both run on your PC.
- Code on GitHub, installers built by GitHub Actions (free for public repos) and published to GitHub Releases.
- Optional: macOS signing ($99/yr Apple Developer account) and Windows signing. For personal use, skip both and click past the first-launch warning.

## 10. Later (requested, not started)

1. **Join/leave notices (Twitch)**: ✅ built (`src/lib/streamerbot/presence.svelte.ts`, `src/lib/twitch/`). Main source is Twitch's own JOIN/PART via a read-only anonymous chat connection (justinfan login, never sends anything); Streamer.bot's lists turned out to track recent activity, not connections (a quiet rejoin was missed even with Live Update on), so they're only the backup. The same connection supplies Twitch's `first-msg` tag, which now decides the Twitch "first message ever" highlight (Streamer.bot's flag is the fallback). Confirmed live: Twitch sends JOINs for everyone already present ~40 s after connecting (its NAMES list is empty), so joins in the first 2 minutes are recorded silently; real rejoins arrive ~1–2 minutes late, and a quick leave+rejoin may produce no events at all. A setting (off by default) that adds a private row in Chatzooka, visible only to you and never sent to chat, when someone joins or leaves your Twitch chat.
   - Streamer.bot has no join/part events; it sends `Twitch.PresentViewers` (everyone connected to chat) every few minutes. Chatzooka diffs consecutive lists; the first list after connecting is a silent baseline; more than 8 changes at once become one summary row; rows aren't saved or counted as unread.
   - Expect delays and batching. Twitch reports joins/leaves in batches several minutes late, only for people connected to chat (not all viewers), and stops reporting them entirely in large channels (roughly 1,000+ chatters).
   - Likely shape: a quiet grey row like "→ name joined" / "← name left", with an option to show it only on the Twitch tab, plus a cap so a raid doesn't flood chat.
   - Not possible for YouTube: YouTube doesn't report viewers joining or leaving.
2. **"Who's here" button.** A button in the top bar that opens a list of everyone currently in both chats.
   - Twitch: Streamer.bot's `GetActiveViewers` request (already used for 7TV prefetch) lists current chatters with roles; refresh while the list is open.
   - YouTube: only people who've chatted recently can be listed. YouTube has no "who's watching" list, but `YouTube.PresentViewers` may help.
   - Ideas: group by role (broadcaster, mods, VIPs, subs, viewers), search box, click a name for the user card, counts per platform.
3. **☰ menu next to the message box, like Streamer.bot's**: ✅ built (`ChatMenu.svelte`, `chat/slashCommands.ts`, `chat/usersList.ts`; slash commands need bridge v4; /slow and /slowoff confirmed live). Items:
   - **Slash Commands:** list of `/timeout`, `/ban`, `/unban`, `/me`, `/clear`, slow/followers/subs/emote-only mode, etc.; picking one fills the message box. Chatzooka must carry these out itself through the bridge (Twitch doesn't run slash commands sent as normal messages); mostly Twitch-only.
   - **Emotes:** the existing emote picker, moved here.
   - **Commands:** your Streamer.bot chat commands (`GetCommands` request), click to insert (e.g. `!video`, `!so`).
   - **Users:** the "who's here" list (item 2).
   - 2026-10-27: Emotes removed from the ☰ menu (the emote button next to the message box covers it). The Users list also opens from a **viewer count** in the tab bar (Settings → General → Viewer Count, on by default; `ViewerCount.svelte`, `chat/viewers.svelte.ts`). The number is people in chat (Twitch connected chatters + recent YouTube chatters), not stream viewers; it refreshes on joins/leaves and every 30 s. Known bots are left out of both by default (`chat/knownBots.ts`: popular chat bots and services, known viewer-list crawler accounts, and any name ending in "bot"; Settings → General → Hide Bots); the list notes how many were hidden.
4. **Auto-update**: ✅ built 2026-10-28 (`updater.svelte.ts`, `UpdateBanner.svelte`, Settings → General → Updates). tauri-plugin-updater checks `https://github.com/bazookaCodes/chatzooka/releases/latest/download/latest.json` 15 s after start and every 6 h (release builds only; dev builds check when asked), shows a banner, then downloads, installs (Windows: passive NSIS) and restarts. Signing key pair generated locally; the private key and password live outside the repo and go in the repo's Actions secrets. The release workflow publishes `latest.json` (NSIS preferred on Windows). A local signed NSIS build was verified.
5. **Icons on mod-action rows**: ✅ built (`chat/modIcons.ts`). Each Mod actions row has a colored icon at the right edge, like Streamer.bot's chat: ban, timeout, unban, timeout removed, deleted message, chat cleared. Chat setting changes are now logged there too ("Chat slow mode on (10s)", followers-only, subs-only, emote-only, unique chat, shield mode, YouTube members-only), worked out from Twitch's ROOMSTATE changes (the full set sent on connect is not logged). Not covered: mod/unmod and VIP changes (no Streamer.bot event wired up for them yet).

## 10a. Round 2 (requested 2026-11-01, not started)

Requested after comparing with Chatterino, Twitch Mod View, Social Stream Ninja and Restream chat. Not wanted for now: OBS chat overlay, Kick, TikTok. Streamer.bot does the work wherever it can; the bridge grows to **v5** for the new operations. Names below come from the Streamer.bot docs (triggers and CPH method lists) and get confirmed against real payloads while building, as before.

| Phase | What | Streamer.bot does | Chatzooka does |
|---|---|---|---|
| **R1. Window** ✅ 2026-11-02 (pin + compact; see-through not done) | 📌 **Always on top** button in the top bar; **compact mode** (tab bar shrinks to icons, smaller padding) for a small window over a game; optional **see-through** slider | — (window behaviour) | Tauri `setAlwaysOnTop`; remembered with the window-state plugin; opacity needs a transparent window, so it's last and optional |
| **R2. Find and filter** ✅ 2026-11-02 (history search not yet tried in the desktop app) | **Ctrl+F search** across the open tab (highlights matches, ↑/↓ to step through, optional "search history" that queries SQLite); **custom highlight words** (Settings → Highlights, own color, e.g. your name, "giveaway"); **ignore list** for users and words (hide locally, or show collapsed "hidden message" rows) | — (local only; Streamer.bot's blocked terms are a Twitch-side ban list, a different thing) | `highlights.ts` gets keyword rules; new `chat/ignore.ts` filter before messages reach the list; search UI over `ChatView` |
| **R3. Moderation** ✅ 2026-11-02 (payload field names guessed; confirm on a live stream; needs bridge v5 pasted into Streamer.bot) | **AutoMod queue**: held messages appear in chat as a dimmed row with **Allow / Deny**, plus a count on the Mod actions tab; resolved ones update in place. Also fills the known gap: **mod / unmod / VIP / unVIP** rows on the Mod actions tab, and **warnings** | Triggers `Twitch.AutomodMessageHeld`, `Twitch.AutomodMessageUpdated`, `ModeratorAdded/Removed`, `VipAdded/Removed`, `WarnedUser`; bridge ops `automodAllow`/`automodDeny` → `CPH.TwitchApproveAutoHeldMessage` / `TwitchDenyAutoHeldMessage` | New held-message row kind; `modEvents.ts` handlers + icons |
| **R4. Replies** ✅ 2026-11-02 (sending a real reply needs bridge v5; not yet tried live) | Twitch reply threads: a small "↪ replying to @name: …" line above replies; **Reply** button on the hover bar and right-click menu; the composer shows "Replying to …" with ✕ | Reply info from the `Twitch.ChatMessage` payload (field name to confirm from a saved raw event); send with `CPH.TwitchReplyToMessage` via bridge op `reply` | Parse the parent into `ChatMessage.replyTo`; click the line to scroll to the parent if it's loaded |
| **R5. Stream info bar** ✅ 2026-11-02 (bridge v5 compiles; not yet seen with real stream data; event payloads unconfirmed) | A slim bar (toggle in Settings) showing per platform: **live/offline + uptime**, **stream viewer count**, **title** and **category**. Click to edit title (both) and category (Twitch, with search) | Triggers `Twitch.StreamOnline/Offline`, `Twitch.ViewerCountUpdate`, `Twitch.StreamUpdate`, `YouTube.BroadcastStarted/Ended/Updated`, `YouTube.BroadcastStatisticsUpdated`; bridge ops `streamInfo` (current state on connect), `setTitle` → `CPH.SetChannelTitle` / `CPH.YouTubeSetTitle`, `setCategory` → `CPH.SetChannelGame` | Category search: needs a lookup; check for a CPH method first, otherwise Twitch's public category list via the bridge. The real viewer count can sit next to the existing in-chat count |
| **R6. Polls, predictions, hype trains** ✅ 2026-11-02 (bridge v6 compiles; payloads unconfirmed) | A banner under the tab bar while one is running: poll options with live bars, prediction outcomes with points and lock/resolve, hype train level + progress + time left. Start/end/archive rows on the Events tab. **Create a poll or prediction** from the ☰ menu (`/poll`, `/prediction` slash commands) and lock / resolve / cancel from the banner | Triggers `Twitch.PollCreated/Updated/Completed/Terminated`, `Twitch.PredictionCreated/Updated/Locked/Completed/Canceled`, `Twitch.HypeTrainStart/Update/LevelUp/End`, `YouTube.PollStarted/Updated/Closed`; bridge ops → `CPH.TwitchPollCreate/Terminate/Archive`, `TwitchPredictionCreate/Lock/Resolve/Cancel` | Banner component + event mappers. YouTube polls are view-only (Streamer.bot has no create method) |

R1 as built: `alwaysOnTop` and `compact` prefs (Settings → General → Window, plus pin and compact buttons in the tab bar; the compact button hides below 400 px wide). Compact mode sets `html.compact`, which shrinks `--row-pad-y`, `--tabbar-h`, `--tab-w` and `--composer-pad` (app.css). Always on top uses `setAlwaysOnTop` (capability `core:window:allow-set-always-on-top`). Window position and size are remembered by tauri-plugin-window-state. The tab bar now fits at the 320 px minimum width (tabs shrink to 28 px). R2 note: custom highlight words already exist (Settings → Highlights patterns, text or regex), so R2 is search + ignore list.

R2 as built: **Search** (`chat/search.svelte.ts`, `SearchBar.svelte`): Ctrl+F opens a bar under the tabs; typing filters the open tab to messages whose text, name or event headline contains the query (plain "contains", any case). Each result has a "Show in chat" arrow that closes the search and scrolls to the message, paused, with a brief flash. "Search history" (or Enter; desktop app only) adds matches from SQLite (`searchHistory`, a loose `LIKE` on the stored JSON, filtered precisely afterwards), marked "saved". Changed from the plan: results are a filtered list rather than step-through highlighting. **Ignore** (`chat/ignore.ts`, Settings → Ignore, right-click → Ignore): ignored users and words (whole words, any case) are hidden or collapsed to a clickable "Hidden message from …" line; local only, still saved to history; never applies to events, the Mod actions log or the broadcaster; ignored messages don't count as unread.

R3 as built: new message kind `automod` (`AutoModHold` on the message: heldId, status held/approved/denied/expired, reason, by), shown in the chat tabs and on the Mod actions tab, not saved to history. `Twitch.AutoModMessageHeld` adds the row (reason from category + level, or "blocked term"); `Twitch.AutoModMessageUpdate` sets the status; `AutoModButtons.svelte` calls bridge ops `twitch.automodAllow` / `twitch.automodDeny` (bridge **v5**, `CPH.TwitchApproveAutoHeldMessage` / `TwitchDenyAutoHeldMessage`), which need bridge v5 or show a toast saying to update. Mod actions rows (with icons) for `ModeratorAdded/Removed`, `VipAdded/Removed`, `WarnedUser`, `WarningAcknowledged`. The WebSocket payload shapes for all of these are undocumented, so fields are read from several likely names (`modEvents.ts`) and raw events are saved in dev builds; check them on the next stream.

R4 as built: `ChatMessage.replyTo` (parent id, name, login, text). Two sources: the Streamer.bot `Twitch.ChatMessage` payload (`reply.*` fields under several likely names; raw reply events saved in dev builds) and, as a documented backup, the anonymous chat connection's `reply-parent-*` IRC tags (`twitch/replies.ts`), which fill in replies after the fact. The leading "@parent" Twitch adds to reply text is removed. Rows show "↪ Replying to @name: …"; clicking it jumps to the parent if it's in the view. Reply from the hover bar (now shown on every Twitch chat row, with mod buttons only where you can moderate) or right-click → Reply; the composer shows a "Replying to … · Twitch only" row (Esc cancels) and sends with bridge op `twitch.reply` (`CPH.TwitchReplyToMessage`, as the broadcaster), or as a plain "@name …" message with an older bridge.

R5 as built: `stream/streamInfo.svelte.ts` holds live/startedAt/viewers/title/category per platform; `StreamInfoBar.svelte` (under the tabs, Settings → General → Stream Info Bar, on by default, only for platforms connected in Streamer.bot) and `StreamEditor.svelte` (title for both, Twitch category with search). Current state: bridge op `streamInfo` on connect and every 3 minutes. Streamer.bot has no CPH getter for Twitch stream status, so the bridge calls Twitch's API (`helix/streams`, `helix/channels`, `helix/search/categories`) with `CPH.TwitchClientId` / `CPH.TwitchOAuthToken` (Streamer.bot's own broadcaster login; no extra setup). YouTube: `CPH.YouTubeGetLatestMonitoredBroadcast()` serialized as-is (its class isn't documented, so fields are read defensively). Edits: `CPH.SetChannelTitle`, `CPH.SetChannelGame(name)`, `CPH.YouTubeSetTitle(title, broadcastId)`. Live updates from `Twitch.StreamOnline/StreamOffline/ViewerCountUpdate/StreamUpdate` and `YouTube.BroadcastStarted/BroadcastUpdated/BroadcastEnded/StatisticsUpdated` (raw payloads saved in dev builds; `dev/rawEvents.ts`). The C# uses `CPH.TwitchClientId`/`TwitchOAuthToken` (known from the Streamer.bot community, not the method docs) and `WebClient`, so the Execute C# Code sub-action needs references to `System.dll` and `System.Core.dll` (Framework64\v4.0.30319); with those, bridge v5 compiled in the user's Streamer.bot on 2026-11-02.

R6 as built: `stream/liveEvents.svelte.ts` tracks polls (Twitch and YouTube), the current Twitch prediction and hype train from Streamer.bot events (`Twitch.Poll*`, `Twitch.Prediction*`, `Twitch.HypeTrain*`, `YouTube.Poll*`), reading both Streamer.bot's documented variable shapes (`poll.Title`, `choice0.totalVotes`, `prediction.outcome0.points`, …) and Twitch EventSub names. `LiveBanner.svelte` (under the tabs, collapsible) shows vote bars and countdowns; finished items show the result for a minute. Controls through bridge **v6**: End poll (`CPH.TwitchPollTerminate`), Lock / Winner (click twice) / Cancel-refund (click twice) for predictions (`TwitchPredictionLock/Resolve/Cancel`). `/poll Question | A | B [| 2m]` and `/prediction` (alias `/predict`) create them (`TwitchPollCreate`, `TwitchPredictionCreate` with the documented `List<string>` signature; Streamer.bot's own example uses a different overload, so watch Compile). Start/lock/end rows go to the Events tab. `liveEvents.simulate(name, data)` replays an event for testing. YouTube polls are view-only (no Streamer.bot method to create them).

Order: R1 and R2 are local and quick; R3–R6 each need a bridge update (one v5 release covering all of them is easier for you than four separate pastes, so the C# is written up front and shipped once). Payloads not seen live yet get saved to `chatzooka.dev.rawEvents` and checked during your next stream, like Phase 3.

Not in this round: OBS overlay, Kick/TikTok, unban requests (Streamer.bot has `UnbanRequestCreated/Approved/Denied`, easy to add to R3 if wanted), Twitch shared chat (Stream Together) labels.

### Event messages in the chat feed (2026-11-08)

Twitch sends a viewer's sub/resub/watch-streak message as part of the event (EventSub chat notification), not as a chat message, so it only appeared inside the event row. Now `chatLineFor` (eventRows.ts) turns the message of sub, announcement, Super Chat, member-milestone and watch-streak (`Twitch.WatchStreak`, new mapper) events into a normal chat line (`id` `evmsg-…`, `viaEvent` tag shown as a chip after the name). The event row stays on the Events tab and is marked `eventsOnly` so chat doesn't show both. If the same text from the same user also arrives as a real chat message within 30 s (either order), the real message replaces the line and keeps the tag. Cheers and redemption input aren't copied: Twitch already sends those as chat messages. `simulateEvent(name, data)` in events.ts replays an event for testing.

## 11. Open questions

1. **Other channels:** your channel only (the Streamer.bot setup naturally covers only your own channel), or do you also want to watch other channels?
2. Any must-keep behaviours from Streamer.bot's chat window (keyboard shortcuts, highlights or mention sounds, filters)?
3. ~~Also add **BTTV / FFZ** emotes?~~ ✅ Built (`chat/thirdPartyEmotes.svelte.ts`): Chatzooka loads BetterTTV and FrankerFaceZ global + channel emotes itself (public APIs, no login; a 404 means the channel has none) and turns matching words into emotes in Twitch and YouTube messages, skipping words Streamer.bot already made emotes. They're in the emote picker and Tab completion, with on/off toggles in Settings → General. A channel without BTTV/FFZ accounts just gets the global sets. 2026-10-29: the same loader now also fetches **7TV** (global set + your channel's set from `7tv.io/v3`), so the picker has 7TV emotes even when Streamer.bot is off (it used to rely on Streamer.bot's GetEmotes); the Twitch channel ID is remembered (`twitch.channelId` setting) so channel emotes load without Streamer.bot. The picker opens with a **Your channel** group (non-global emotes from any provider except YouTube), Tab completion ranks channel emotes first, and the picker notes when Streamer.bot isn't connected (Twitch/YouTube emotes can only come from it).
4. ~~**License** for the public repo?~~ ✅ MIT (`LICENSE`, held by "Chatzooka contributors").
