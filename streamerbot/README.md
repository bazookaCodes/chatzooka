# Chatzooka Bridge (Streamer.bot action)

Chatzooka uses one Streamer.bot action for moderation (timeout, ban, unban, delete message) and channel point redemptions (fulfill/refund). Streamer.bot's WebSocket can run actions but has no direct moderation requests, so this action does the work and reports the result back.

## One-time setup

1. In Streamer.bot, open the **Actions** tab.
2. Right-click the actions list and choose **Add**. Name it exactly **`Chatzooka Bridge`** and click OK. Leave it enabled.
3. Select the new action. In the **Sub-Actions** panel, right-click and choose **Core → C# → Execute C# Code**.
4. In the code editor that opens, delete the sample code and paste the full contents of [`ChatzookaBridge.cs`](ChatzookaBridge.cs).
5. Add two references (needed since v5, which reads stream details from Twitch's API). In the code editor, open the **References** tab, right-click the list and choose **Add reference from file…**, then pick each of these files (skip any already listed):
   - `C:\Windows\Microsoft.NET\Framework64\v4.0.30319\System.dll`
   - `C:\Windows\Microsoft.NET\Framework64\v4.0.30319\System.Core.dll`
6. Click **Compile**. The log at the bottom should say it compiled successfully.
7. Click **Save and Compile** (or **OK**) to close the editor.

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
- **v5:** Allow / Deny for messages held by Twitch AutoMod, Twitch replies, and the stream info bar (live status, viewers, title and category, and changing them). Twitch stream details are read from Twitch's API using the login Streamer.bot already has.
- **v6:** start, end, lock, resolve and cancel Twitch polls and predictions.

Chatzooka shows "Update available" in Settings when Streamer.bot has an older version. Each feature keeps working with the version it needs, so an older bridge only lacks the newer features.

Moderation runs as your broadcaster account.

## Updating

When a new version of `ChatzookaBridge.cs` is released, open the existing action's **Execute C# Code** sub-action, replace the code, and repeat steps 5–7. (Updating from v4 or older to v5 needs the references in step 5; without them Compile fails with errors about `System.Net`, `Uri` and `WebClient`.)
