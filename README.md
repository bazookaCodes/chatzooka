# Chatzooka

A desktop chat client for streamers who go live on **Twitch** and **YouTube** at the same time. It shows both chats in one window, sends to either or both, and lets you moderate both from one place.

Chatzooka doesn't sign in to Twitch or YouTube itself. Everything goes through [Streamer.bot](https://streamer.bot), which you already have connected to your accounts. Chatzooka talks to it over its local WebSocket server.

Runs on Windows, macOS and Linux.

## Features

- **One chat window, five tabs:** All, Twitch, YouTube, Events (subs, raids, cheers, Super Chats, redemptions…) and Mod actions.
- **Emotes:** Twitch, YouTube, 7TV, BetterTTV and FrankerFaceZ, including animated ones. Emote picker and Tab completion.
- **7TV name paints and badges.**
- **Send to Twitch, YouTube or both** from one message box, with Twitch slash commands (`/timeout`, `/ban`, `/slow`, `/followers`, `/announce`, `/vip`, `/shoutout`, …).
- **Moderation on both platforms:** timeout, ban, unban and delete message from a hover bar, a right-click menu or the user card. Every mod action is logged on the Mod actions tab.
- **User cards:** profile picture, account age, follow and sub status, notes, and every message they've sent in your chat.
- **First-message highlight:** a chatter's first message ever in your chat is highlighted (Chatzooka keeps its own record rather than relying on Streamer.bot's).
- **Channel points:** redemptions in chat, plus a queue to fulfill or refund them.
- **Chat history:** chat is saved locally and restored when you reopen the app.
- **Chat settings at a glance:** chips show slow mode, followers-only, subs-only, emote-only, shield mode and YouTube members-only; click to turn them off.
- **Who's here:** a viewer count in the tab bar and a list of everyone in your chats.
- **Join/leave notices** for Twitch (optional, visible only to you).
- **Links:** hover previews and a built-in phishing check (see [Privacy](#privacy)).
- Streamer.bot-style settings: fonts, timestamps, badges, highlights, history cleanup and quick-action buttons.

## Download

Get the latest version from the [Releases page](https://github.com/bazookaCodes/chatzooka/releases/latest):

| Your computer | Download this |
|---|---|
| **Windows** 10 / 11 | `Chatzooka_…_x64-setup.exe` |
| **Mac** (any: Apple Silicon or Intel) | `Chatzooka_…_universal.dmg` |
| **Linux** (Ubuntu, Debian, Mint, Pop!_OS) | `Chatzooka_…_amd64.deb` |
| **Linux** (any other) | `Chatzooka_…_amd64.AppImage` |

The other files on the release (`.sig`, `.tar.gz`, `latest.json`) are for automatic updates; you can ignore them.

Chatzooka isn't code-signed, so the first launch shows a warning. On **Windows**, click **More info → Run anyway**. On **Mac**, right-click the app in Applications, choose **Open**, then **Open** again. After that, Chatzooka updates itself.

## What you need

- **[Streamer.bot](https://streamer.bot) 1.0 or newer**, running whenever you use Chatzooka.
- Your **Twitch broadcaster account** and/or **YouTube account** connected in Streamer.bot.

## Streamer.bot setup

Do this once. All steps are in Streamer.bot.

### 1. Turn on the WebSocket server

1. Open **Servers/Clients → WebSocket Server**.
2. Tick **Auto Start**, then click **Start Server**.
3. Leave the address as `127.0.0.1`, port `8080` and endpoint `/` (or note what you change them to).
4. Tick **Authentication** and set a password. This is **required for sending messages**: Streamer.bot only lets authenticated connections send chat. Reading chat works without it.

### 2. Add the Chatzooka Bridge action

Streamer.bot's WebSocket can't moderate, manage rewards or look up user details directly, so Chatzooka uses a small C# action for those.

1. Open the **Actions** tab, right-click the list and choose **Add**. Name it exactly **`Chatzooka Bridge`** and leave it enabled.
2. Select it. In **Sub-Actions**, right-click and choose **Core → C# → Execute C# Code**.
3. Replace the sample code with the full contents of [`streamerbot/ChatzookaBridge.cs`](streamerbot/ChatzookaBridge.cs).
4. In the code editor's **References** tab, right-click and choose **Add reference from file…**, and add `System.dll` and `System.Core.dll` from `C:\Windows\Microsoft.NET\Framework64\v4.0.30319\` (skip any already listed). The bridge uses them to read your stream's details from Twitch.
5. Click **Compile** (the log should say it compiled), then **Save and Compile**.

It needs no triggers; Chatzooka runs it directly. See [`streamerbot/README.md`](streamerbot/README.md) for exactly what it does and how to update it.

Without the bridge, chat, emotes and sending still work. Moderation, the channel points queue, user card details and most slash commands need it.

### 3. Channel point rewards (optional)

Twitch only lets the app that **created** a reward fulfill or refund its redemptions. To manage a reward from Chatzooka's queue, create it in Streamer.bot (**Platforms → Twitch → Channel Point Rewards**), not on the Twitch dashboard. Redemptions of other rewards still show in chat; they just can't be fulfilled or refunded from Chatzooka.

### 4. Connect Chatzooka

Open Chatzooka, click the **⚙ Settings** button, then **Streamer.bot**:

- Enter the host, port and endpoint from step 1, and the password.
- Click **Test connection**, then **Save**.

The **SB** pill in the top bar turns green when connected. The Streamer.bot page also shows which Twitch and YouTube accounts were found and whether the Chatzooka Bridge is ready or needs updating.

## Limits worth knowing

- **Emotes follow your Streamer.bot broadcaster account.** The emote picker and Tab completion list the emotes of the **broadcaster** accounts connected in Streamer.bot (not its bot account):
  - **Twitch and YouTube emotes** (your channel's emotes, your subs, YouTube's set) come only from Streamer.bot, so they're missing while it isn't running.
  - **7TV, BetterTTV and FrankerFaceZ** emotes are loaded by Chatzooka itself: the global sets always, plus your Twitch channel's sets once Streamer.bot has told Chatzooka which channel is yours. That's remembered, so they keep working when Streamer.bot is off. If you connect a different Twitch broadcaster account in Streamer.bot, Chatzooka switches to that channel's emotes the next time it connects.
- **YouTube** has no unban or delete-message method in Streamer.bot. The user card links to YouTube Studio for unbanning.
- **YouTube viewer list:** YouTube doesn't share who's watching, so the list shows people who chatted in the last 30 minutes.
- **Twitch join/leave notices** are batched by Twitch and can be up to a minute or two late; Twitch stops sending them in chats of roughly 1,000+ people.

## Privacy

- **No accounts, no servers.** Chatzooka runs entirely on your computer and talks to Streamer.bot on your machine.
- **Your Streamer.bot password** is kept in your system's credential store (Windows Credential Manager, macOS Keychain or Linux Secret Service), never in a file.
- **Chat history** is a local SQLite database in your user data folder, with automatic cleanup in Settings → History.
- **Outside requests** go only to public, login-free services: 7TV, BetterTTV and FrankerFaceZ (emotes and paints), Twitch's anonymous read-only chat (join/leave and room settings; it never sends anything), and the [Phishing.Database](https://github.com/Phishing-Database/Phishing.Database) and [OpenPhish](https://openphish.com) blocklists, downloaded every 12 hours. Links are checked against those lists **on your machine**; no URL is sent anywhere to be checked.
- **Link previews** fetch a page only when you hover its link, and can be turned off in Settings → General.

## Building from source

You will need:

- [Node.js](https://nodejs.org) 22.12 or newer
- [Rust](https://rustup.rs) (stable)
- Tauri's [platform prerequisites](https://tauri.app/start/prerequisites/) (on Windows: Microsoft C++ Build Tools and WebView2)

```bash
npm install
npm run tauri dev     # run the desktop app with hot reload
npm run dev           # UI only, in a browser at http://localhost:1420 (no Rust needed; no history or link previews)
npm run check         # type-check
npm run tauri build   # build an installer for this OS
```

Built with [Tauri 2](https://tauri.app), Svelte 5 and TypeScript, using [`@streamerbot/client`](https://github.com/Streamerbot/client) and SQLite. [PLAN.md](PLAN.md) has the design notes and the reasoning behind how each feature works.

## Releases

Pushing a tag like `v0.1.0` (or running the **Release** workflow manually from the Actions tab) builds installers for Windows (`setup.exe`), macOS (one universal `.dmg`) and Linux (`.deb` and `.AppImage`) and attaches them to a draft GitHub Release with a download guide. Publishing the draft makes it the update that installed copies pick up.

**Auto-update:** Chatzooka checks this repo's latest release for a new version when it starts and every 6 hours, and offers to install it (Settings → General → Updates to check by hand). Updates are signed, and the app only installs ones signed with this project's key. The release workflow needs two repository secrets for that:

- `TAURI_SIGNING_PRIVATE_KEY`: the contents of the private update-signing key file
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: its password

The matching public key is in `src-tauri/tauri.conf.json`. Forks that publish their own releases need their own key pair (`npx tauri signer generate`) and their own endpoint there.

To release a new version:

1. Push your changes to `main`.
2. On the **Actions** tab, open **Release** → **Run workflow** and pick how to bump the version: **patch** (0.1.0 → 0.1.1), **minor** (→ 0.2.0) or **major** (→ 1.0.0). The workflow updates `package.json` (the only place the version is kept), commits that to `main` as "Release vX.Y.Z", and builds from it.
3. When it finishes, publish the draft on the **Releases** page.
4. Pull before your next change, so your copy has the version commit.

Pushing a tag such as `v0.2.0` also starts a release, using the version already in `package.json` (no bump).

## License

[MIT](LICENSE)
