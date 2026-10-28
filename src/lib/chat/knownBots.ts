// Chat bots and automation accounts, so the "who's here" list and viewer count show people.
// Covers popular chat bots, alert/overlay services and the "viewer list" crawler accounts that
// sit in thousands of Twitch chats at once, plus any name ending in "bot" (Nightbot, Moobot,
// your own Streamer.bot bot account if it's named that way, …).

const KNOWN_BOTS = new Set([
  // Chat bots and stream tools whose names don't end in "bot"
  "streamelements",
  "streamlabs",
  "botisimo",
  "botrixoficial",
  "streamstickers",
  "soundalerts",
  "blerp",
  "own3d",
  "pretzelrocks",
  "frostytoolsdotcom",
  "pokemoncommunitygame",
  "playwithviewers",
  "streamjar",
  "streamraiders",
  "lumiastream",
  "dixperbro",
  "twitchprimereminder",
  // Viewer-list crawlers and lurker accounts found in most chats
  "commanderroot",
  "anotherttvviewer",
  "lurxx",
  "aliceydra",
  "drapsnatt",
  "0ax2",
  "d0nk7",
  "streamfahrer",
  "einfachuwe42",
  "kattah",
  "morgane2k22",
  "rogueg1rl",
  "nouvelle_twitch",
  "streamholics",
  "v_and_k",
  "smallstreamersconnect",
  "discordstreamercommunity",
  "twitchdetails",
  "virgoproz",
  "bingcortana",
  "lylituta",
  "arctlco",
  "creepyonions",
  "communityshowcase",
]);

/** True for a known bot/automation account, or any name ending in "bot". */
export function isKnownBot(name: string | undefined): boolean {
  if (!name) return false;
  const n = name.toLowerCase().replace(/\s+/g, "");
  return KNOWN_BOTS.has(n) || n.endsWith("bot");
}
