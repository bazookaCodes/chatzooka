// Read-only, anonymous connection to your Twitch chat (Twitch's chat server, as a logged-out
// viewer: no account, no password, never sends a message). Used for two things Streamer.bot
// doesn't pass along accurately:
//   - JOIN/PART notices: who connects to or leaves chat (Twitch batches these, and stops sending
//     them for chats over ~1,000 people);
//   - the `first-msg` tag Twitch puts on someone's first message ever in your channel.
// Everything else (reading chat, sending, moderation) still goes through Streamer.bot.

const SERVER = "wss://irc-ws.chat.twitch.tv:443";
const RETRY_MAX_MS = 60_000;

export type IrcStatus = "off" | "connecting" | "connected";

export interface IrcHandlers {
  /** Users already in chat when the connection joined (may be omitted for big chats). */
  names?: (logins: string[]) => void;
  join?: (login: string) => void;
  part?: (login: string) => void;
  /** A chat message's tags (e.g. `id`, `first-msg`). */
  privmsg?: (tags: Record<string, string>) => void;
  /** Chat settings (slow, followers-only, subs-only, emote-only, r9k): all on join, then changes. */
  roomState?: (tags: Record<string, string>) => void;
  /** Connection lost (chat settings unknown until it's back). */
  disconnected?: () => void;
}

interface Parsed {
  tags: Record<string, string>;
  prefix: string;
  command: string;
  params: string[];
}

function parseLine(line: string): Parsed | null {
  let rest = line;
  const tags: Record<string, string> = {};
  if (rest.startsWith("@")) {
    const space = rest.indexOf(" ");
    for (const pair of rest.slice(1, space).split(";")) {
      const eq = pair.indexOf("=");
      tags[eq < 0 ? pair : pair.slice(0, eq)] = eq < 0 ? "" : pair.slice(eq + 1);
    }
    rest = rest.slice(space + 1);
  }
  let prefix = "";
  if (rest.startsWith(":")) {
    const space = rest.indexOf(" ");
    prefix = rest.slice(1, space);
    rest = rest.slice(space + 1);
  }
  const trailingAt = rest.indexOf(" :");
  const head = trailingAt >= 0 ? rest.slice(0, trailingAt) : rest;
  const params = head.split(" ").filter(Boolean);
  const command = params.shift() ?? "";
  if (trailingAt >= 0) params.push(rest.slice(trailingAt + 2));
  return command ? { tags, prefix, command, params } : null;
}

/** "name!name@name.tmi.twitch.tv" → "name" */
const loginOf = (prefix: string) => prefix.split("!")[0].toLowerCase();

class TwitchIrc {
  status = $state<IrcStatus>("off");
  channel = $state<string | null>(null);

  #ws: WebSocket | null = null;
  #handlers: IrcHandlers = {};
  #retryMs = 2000;
  #retryTimer: ReturnType<typeof setTimeout> | null = null;
  /** Our anonymous login, e.g. justinfan48211; ignored in join/leave notices. */
  #nick = `justinfan${Math.floor(10000 + Math.random() * 89999)}`;
  /** NAMES replies arrive in several lines; collected until "end of names". */
  #namesBuffer: string[] = [];

  setHandlers(h: IrcHandlers): void {
    this.#handlers = h;
  }

  /** Connect to (or switch to) a channel; null disconnects. */
  connect(channel: string | null): void {
    const login = channel?.toLowerCase() ?? null;
    if (login === this.channel && this.#ws) return;
    this.#close();
    this.channel = login;
    if (login) this.#open();
  }

  #open(): void {
    if (!this.channel) return;
    this.status = "connecting";
    const ws = new WebSocket(SERVER);
    this.#ws = ws;
    ws.onopen = () => {
      // Anonymous login: Twitch accepts any justinfanNNNN nick with no password, read-only.
      ws.send("CAP REQ :twitch.tv/membership twitch.tv/tags twitch.tv/commands");
      ws.send(`NICK ${this.#nick}`);
      ws.send(`JOIN #${this.channel}`);
    };
    ws.onmessage = (e) => {
      for (const line of String(e.data).split("\r\n")) if (line) this.#handle(line);
    };
    ws.onclose = () => {
      if (this.#ws !== ws) return;
      this.#ws = null;
      this.status = "connecting";
      this.#handlers.disconnected?.();
      this.#retryTimer = setTimeout(() => this.#open(), this.#retryMs);
      this.#retryMs = Math.min(this.#retryMs * 2, RETRY_MAX_MS);
    };
    ws.onerror = () => {};
  }

  #close(): void {
    if (this.#retryTimer) clearTimeout(this.#retryTimer);
    this.#retryTimer = null;
    const ws = this.#ws;
    this.#ws = null;
    ws?.close();
    this.status = "off";
  }

  #handle(line: string): void {
    const msg = parseLine(line);
    if (!msg) return;
    switch (msg.command) {
      case "PING":
        this.#ws?.send(`PONG :${msg.params[0] ?? "tmi.twitch.tv"}`);
        break;
      case "001": // welcome: logged in
        this.#retryMs = 2000;
        break;
      case "ROOMSTATE":
        this.status = "connected";
        this.#handlers.roomState?.(msg.tags);
        break;
      case "353": // NAMES list
        this.#namesBuffer.push(...(msg.params.at(-1) ?? "").split(" ").filter(Boolean));
        break;
      case "366": // end of NAMES
        this.#handlers.names?.(this.#namesBuffer.map((n) => n.toLowerCase()).filter((n) => n !== this.#nick));
        this.#namesBuffer = [];
        break;
      case "JOIN": {
        const login = loginOf(msg.prefix);
        if (login === this.#nick) this.status = "connected";
        else this.#handlers.join?.(login);
        break;
      }
      case "PART": {
        const login = loginOf(msg.prefix);
        if (login !== this.#nick) this.#handlers.part?.(login);
        break;
      }
      case "PRIVMSG":
        this.#handlers.privmsg?.(msg.tags);
        break;
      case "RECONNECT": // Twitch asks clients to reconnect (server restart)
        this.#ws?.close();
        break;
    }
  }
}

export const twitchIrc = new TwitchIrc();
