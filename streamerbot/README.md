# Chatzooka Bridge (Streamer.bot action)

Chatzooka uses one Streamer.bot action for moderation (timeout, ban, unban, delete message) and channel point redemptions (fulfill/refund). Streamer.bot's WebSocket can run actions but has no direct moderation requests, so this action does the work and reports the result back.

## One-time setup

1. In Streamer.bot, open the **Actions** tab.
2. Right-click the actions list and choose **Add**. Name it exactly **`Chatzooka Bridge`** and click OK. Leave it enabled.
3. Select the new action. In the **Sub-Actions** panel, right-click and choose **Core → C# → Execute C# Code**.
4. In the code editor that opens, delete the sample code and paste the full contents of [`ChatzookaBridge.cs`](ChatzookaBridge.cs).
5. Click **Compile**. The log at the bottom should say it compiled successfully.
6. Click **Save and Compile** (or **OK**) to close the editor.

The action needs **no triggers**; Chatzooka runs it directly.

Chatzooka checks for the action when it connects. Settings shows whether the bridge is set up.

## What it can do

| Operation | Twitch | YouTube |
|-----------|--------|---------|
| Timeout | ✅ | ✅ |
| Ban | ✅ | ✅ |
| Unban | ✅ | ❌ (no Streamer.bot method) |
| Delete message | ✅ | ❌ (no Streamer.bot method) |
| Fulfill / refund redemption | ✅ (rewards created in Streamer.bot) | — |
| Add / remove moderator | ✅ | ❌ |
| User card details (account age, following, sub, avatar) | ✅ | ❌ (avatar comes from the chat message) |

## Versions

- **v1:** moderation and redemptions.
- **v2:** user card details and mod/unmod.
- **v3:** rewards list (for the channel points panel).
- **v4:** slash commands: slow/followers/subscribers/emote-only modes, clear chat, announcements, VIP, shoutouts.

Chatzooka shows "Update available" in Settings when Streamer.bot has an older version. Each feature keeps working with the version it needs, so an older bridge only lacks the newer features.

Moderation runs as your broadcaster account.

## Updating

When a new version of `ChatzookaBridge.cs` is released, repeat steps 3–6 on the existing action, replacing the code.
