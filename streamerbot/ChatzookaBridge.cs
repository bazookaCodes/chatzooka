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
using System;
using Newtonsoft.Json;

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
                    data = new { version = 4 };
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

    private int IntArg(string name, int fallback)
    {
        return int.TryParse(Arg(name), out int n) ? n : fallback;
    }

    private bool BoolArg(string name, bool fallback)
    {
        return bool.TryParse(Arg(name), out bool b) ? b : fallback;
    }
}
