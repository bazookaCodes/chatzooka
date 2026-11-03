// Chatzooka Bridge: paste this into an "Execute C# Code" sub-action of a Streamer.bot action
// named exactly "Chatzooka Bridge". See streamerbot/README.md for setup steps.
//
// Chatzooka runs this action over Streamer.bot's WebSocket (DoAction) with arguments:
//   op         what to do (see the switch below)
//   requestId  echoed back so Chatzooka can match the reply
//   ...        op-specific arguments
// The result goes back to Chatzooka as a WebSocket broadcast (General.Custom event):
//   { "source": "chatzooka", "requestId": "...", "ok": true|false, "error": "...", "data": ... }
//
// Method signatures from https://docs.streamer.bot/api/csharp (Streamer.bot 1.0.x).
//
// Needs two references (References tab → right-click → Add reference from file…):
//   C:\Windows\Microsoft.NET\Framework64\v4.0.30319\System.dll
//   C:\Windows\Microsoft.NET\Framework64\v4.0.30319\System.Core.dll
using System;
using System.Collections.Generic;
using System.Net;
using System.Text;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

public class CPHInline
{
    public bool Execute()
    {
        string requestId = Arg("requestId");
        string op = Arg("op");
        bool ok;
        string error = null;
        object data = null;

        try
        {
            switch (op)
            {
                case "ping":
                    ok = true;
                    data = new { version = 7 };
                    break;

                // --- Sending chat (bridge v7), as the broadcaster account ---
                // Streamer.bot's WebSocket SendMessage request only works on a password-protected
                // connection; running it here works with authentication off too. Neither method
                // reports success, so ok means "Streamer.bot accepted it".
                case "twitch.send":
                    CPH.SendMessage(Required("message"), false, false);
                    ok = true;
                    break;
                case "youtube.send":
                    CPH.SendYouTubeMessage(Required("message"), false, false, Arg("broadcastId"));
                    ok = true;
                    break;

                // --- Twitch user card ---
                case "twitch.userInfo":
                {
                    var info = CPH.TwitchGetExtendedUserInfoByLogin(Required("login"));
                    ok = info != null;
                    if (ok)
                    {
                        data = new
                        {
                            userId = info.UserId,
                            login = info.UserLogin,
                            name = info.UserName,
                            description = info.Description,
                            profileImageUrl = info.ProfileImageUrl,
                            createdAt = info.CreatedAt,
                            isFollowing = info.IsFollowing,
                            isSubscribed = info.IsSubscribed,
                            subscriptionTier = info.SubscriptionTier,
                            isModerator = info.IsModerator,
                            isVip = info.IsVip,
                            isAffiliate = info.IsAffiliate,
                            isPartner = info.IsPartner,
                            game = info.Game,
                        };
                    }
                    else error = "Twitch user not found";
                    break;
                }
                case "twitch.mod":
                    ok = CPH.TwitchAddModerator(Required("login"));
                    break;
                case "twitch.unmod":
                    ok = CPH.TwitchRemoveModerator(Required("login"));
                    break;

                // --- Twitch (acts as the broadcaster account) ---
                case "twitch.timeout":
                    ok = CPH.TwitchTimeoutUser(Required("login"), IntArg("seconds", 600), Arg("reason") ?? "", false);
                    break;
                case "twitch.ban":
                    ok = CPH.TwitchBanUser(Required("login"), Arg("reason") ?? "", false);
                    break;
                case "twitch.unban":
                    ok = CPH.TwitchUnbanUser(Required("login"), false);
                    break;
                case "twitch.delete":
                    ok = CPH.TwitchDeleteChatMessage(Required("messageId"), false);
                    break;
                // --- Twitch chat settings and helpers (slash commands, bridge v4) ---
                // The chat-mode methods return nothing, so success means "Streamer.bot accepted it".
                case "twitch.slow":
                    CPH.TwitchSlowMode(BoolArg("enabled", true), IntArg("seconds", 30));
                    ok = true;
                    break;
                case "twitch.followers":
                    CPH.TwitchFollowMode(BoolArg("enabled", true), IntArg("minutes", 0));
                    ok = true;
                    break;
                case "twitch.subscribers":
                    CPH.TwitchSubscriberOnly(BoolArg("enabled", true));
                    ok = true;
                    break;
                case "twitch.emoteonly":
                    CPH.TwitchEmoteOnly(BoolArg("enabled", true));
                    ok = true;
                    break;
                case "twitch.clear":
                    ok = CPH.TwitchClearChatMessages(false);
                    break;
                case "twitch.announce":
                    CPH.TwitchAnnounce(Required("message"), false, Arg("color") ?? "default", false);
                    ok = true;
                    break;
                case "twitch.vip":
                    ok = CPH.TwitchAddVip(Required("login"));
                    break;
                case "twitch.unvip":
                    ok = CPH.TwitchRemoveVip(Required("login"));
                    break;
                case "twitch.shoutout":
                    ok = CPH.TwitchSendShoutoutByLogin(Required("login"));
                    if (!ok) error = "Twitch refused the shoutout (you must be live; 2-minute cooldown; once per hour per person)";
                    break;

                // --- Stream info bar (bridge v5) ---
                // Current live status, uptime, viewers, title and category for both platforms. Twitch
                // comes from Twitch's API using Streamer.bot's own broadcaster login; YouTube from the
                // broadcast Streamer.bot is monitoring. Each half reports its own error.
                case "streamInfo":
                {
                    object twitch = null;
                    object youtube = null;
                    string broadcasterId = Arg("broadcasterId");
                    if (broadcasterId != null)
                    {
                        try
                        {
                            var stream = Helix("streams?user_id=" + Uri.EscapeDataString(broadcasterId))["data"]?.First;
                            var channel = Helix("channels?broadcaster_id=" + Uri.EscapeDataString(broadcasterId))["data"]?.First;
                            twitch = new
                            {
                                live = stream != null,
                                startedAt = (string)stream?["started_at"],
                                viewers = (int?)stream?["viewer_count"],
                                title = (string)(stream?["title"] ?? channel?["title"]),
                                category = (string)(stream?["game_name"] ?? channel?["game_name"]),
                            };
                        }
                        catch (Exception e)
                        {
                            twitch = new { error = e.Message };
                        }
                    }
                    try
                    {
                        var broadcast = CPH.YouTubeGetLatestMonitoredBroadcast();
                        if (broadcast != null) youtube = JObject.FromObject(broadcast);
                    }
                    catch (Exception e)
                    {
                        youtube = new { error = e.Message };
                    }
                    ok = true;
                    data = new { twitch, youtube };
                    break;
                }
                case "twitch.setTitle":
                    ok = CPH.SetChannelTitle(Required("title"));
                    break;
                case "twitch.setCategory":
                {
                    string name = Required("name");
                    ok = CPH.SetChannelGame(name) != null;
                    if (ok) data = new { name };
                    else error = "Twitch didn't find that category";
                    break;
                }
                case "twitch.searchCategories":
                {
                    var found = Helix("search/categories?first=8&query=" + Uri.EscapeDataString(Required("query")))["data"];
                    var list = new List<object>();
                    if (found != null)
                        foreach (var c in found)
                            list.Add(new { id = (string)c["id"], name = (string)c["name"], boxArt = (string)c["box_art_url"] });
                    ok = true;
                    data = list;
                    break;
                }
                case "youtube.setTitle":
                    ok = CPH.YouTubeSetTitle(Required("title"), Arg("broadcastId"));
                    break;

                // --- Twitch replies (bridge v5), sent as the broadcaster like normal messages ---
                case "twitch.reply":
                    CPH.TwitchReplyToMessage(Required("message"), Required("replyId"), false, false);
                    ok = true;
                    break;

                // --- Twitch AutoMod queue (bridge v5) ---
                case "twitch.automodAllow":
                    ok = CPH.TwitchApproveAutoHeldMessage(Required("messageId"));
                    if (!ok) error = "Twitch refused (already handled, or expired)";
                    break;
                case "twitch.automodDeny":
                    ok = CPH.TwitchDenyAutoHeldMessage(Required("messageId"));
                    if (!ok) error = "Twitch refused (already handled, or expired)";
                    break;

                // --- Polls and predictions (bridge v6). Choices / outcomes arrive one per line. ---
                // The predictionLock / Resolve / Cancel and pollEnd methods return nothing, so success
                // means "Streamer.bot accepted it"; the matching events confirm what happened.
                case "twitch.pollCreate":
                    ok = CPH.TwitchPollCreate(Required("title"), Lines("choices"), IntArg("duration", 60));
                    if (!ok) error = "Twitch refused the poll (2–5 choices, 15 seconds to 30 minutes; one poll at a time)";
                    break;
                case "twitch.pollEnd":
                    CPH.TwitchPollTerminate(Required("pollId"));
                    ok = true;
                    break;
                case "twitch.predictionCreate":
                {
                    string id = CPH.TwitchPredictionCreate(Required("title"), Lines("outcomes"), IntArg("duration", 120));
                    ok = !string.IsNullOrEmpty(id);
                    if (ok) data = new { id };
                    else error = "Twitch refused the prediction (2–10 outcomes, 30 seconds to 30 minutes; one at a time)";
                    break;
                }
                case "twitch.predictionLock":
                    CPH.TwitchPredictionLock(Required("predictionId"));
                    ok = true;
                    break;
                case "twitch.predictionResolve":
                    CPH.TwitchPredictionResolve(Required("predictionId"), Required("winningId"));
                    ok = true;
                    break;
                case "twitch.predictionCancel":
                    CPH.TwitchPredictionCancel(Required("predictionId"));
                    ok = true;
                    break;

                case "twitch.listRewards":
                {
                    var rewards = CPH.TwitchGetRewards();
                    ok = rewards != null;
                    if (ok)
                    {
                        data = rewards.ConvertAll(r => new
                        {
                            id = r.Id,
                            title = r.Title,
                            group = r.Group,
                            prompt = r.Prompt,
                            cost = r.Cost,
                            inputRequired = r.InputRequired,
                            backgroundColor = r.BackgroundColor,
                            paused = r.Paused,
                            enabled = r.Enabled,
                            // True for rewards Streamer.bot created; only those can be fulfilled/refunded.
                            isOurs = r.IsOurs,
                        });
                    }
                    else error = "Couldn't read rewards from Streamer.bot";
                    break;
                }
                case "twitch.fulfill":
                    ok = CPH.TwitchRedemptionFulfill(Required("rewardId"), Required("redemptionId"));
                    break;
                case "twitch.refund":
                    ok = CPH.TwitchRedemptionCancel(Required("rewardId"), Required("redemptionId"));
                    break;

                // --- YouTube (Streamer.bot has no YouTube unban or delete-message method) ---
                case "youtube.timeout":
                {
                    string broadcastId = Arg("broadcastId");
                    ok = broadcastId == null
                        ? CPH.YouTubeTimeoutUserById(Required("userId"), IntArg("seconds", 300))
                        : CPH.YouTubeTimeoutUserById(Required("userId"), IntArg("seconds", 300), broadcastId);
                    break;
                }
                case "youtube.ban":
                {
                    string broadcastId = Arg("broadcastId");
                    ok = broadcastId == null
                        ? CPH.YouTubeBanUserById(Required("userId"))
                        : CPH.YouTubeBanUserById(Required("userId"), broadcastId);
                    break;
                }

                default:
                    ok = false;
                    error = "Unknown operation: " + (op ?? "(none)");
                    break;
            }
            if (!ok && error == null) error = "Streamer.bot reported the action failed";
        }
        catch (Exception e)
        {
            ok = false;
            error = e.Message;
        }

        CPH.WebsocketBroadcastJson(JsonConvert.SerializeObject(new
        {
            source = "chatzooka",
            requestId,
            ok,
            error,
            data,
        }));
        return true;
    }

    /// <summary>GET from Twitch's API as the broadcaster account Streamer.bot is signed in with.</summary>
    private JObject Helix(string path)
    {
        using (var web = new WebClient())
        {
            web.Encoding = Encoding.UTF8;
            web.Headers.Add("Client-Id", CPH.TwitchClientId);
            web.Headers.Add("Authorization", "Bearer " + CPH.TwitchOAuthToken);
            return JObject.Parse(web.DownloadString("https://api.twitch.tv/helix/" + path));
        }
    }

    private string Arg(string name)
    {
        if (CPH.TryGetArg(name, out object value) && value != null)
        {
            string s = value.ToString();
            return s.Length > 0 ? s : null;
        }
        return null;
    }

    private string Required(string name)
    {
        string value = Arg(name);
        if (value == null) throw new ArgumentException("Missing argument: " + name);
        return value;
    }

    /// <summary>A multi-line argument as a list of its non-empty lines.</summary>
    private List<string> Lines(string name)
    {
        var lines = new List<string>();
        foreach (string line in Required(name).Split('\n'))
            if (line.Trim().Length > 0) lines.Add(line.Trim());
        return lines;
    }

    private int IntArg(string name, int fallback)
    {
        return int.TryParse(Arg(name), out int n) ? n : fallback;
    }

    private bool BoolArg(string name, bool fallback)
    {
        return bool.TryParse(Arg(name), out bool b) ? b : fallback;
    }
}
