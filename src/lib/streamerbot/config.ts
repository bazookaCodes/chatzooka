// Where to find Streamer.bot's WebSocket server. Host/port/endpoint are plain settings;
// the password lives in the OS credential store.
import { getSecret, setSecret } from "../secrets";
import { loadSetting, saveSetting } from "../settings";

export interface SbConfig {
  host: string;
  port: number;
  endpoint: string;
  password: string;
}

const PASSWORD_KEY = "streamerbot-password";

export const defaultConfig: SbConfig = { host: "127.0.0.1", port: 8080, endpoint: "/", password: "" };

export async function loadConfig(): Promise<SbConfig> {
  const saved = loadSetting<Omit<SbConfig, "password">>("streamerbot", defaultConfig);
  let password = "";
  try {
    password = (await getSecret(PASSWORD_KEY)) ?? "";
  } catch (e) {
    console.error("Couldn't read the Streamer.bot password from the credential store", e);
  }
  return { ...defaultConfig, ...saved, password };
}

export async function saveConfig(config: SbConfig): Promise<void> {
  const { password, ...plain } = config;
  saveSetting("streamerbot", plain);
  await setSecret(PASSWORD_KEY, password || null);
}
