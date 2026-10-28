// Auto-update from GitHub Releases. Installed copies check latest.json on the newest published
// release (a short while after starting, then every 6 hours); updates are signed and verified
// against the public key in tauri.conf.json before installing.
import { getVersion } from "@tauri-apps/api/app";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";

const FIRST_CHECK_MS = 15_000;
const CHECK_EVERY_MS = 6 * 3_600_000;

type Status = "idle" | "checking" | "upToDate" | "available" | "downloading" | "error";

const inApp = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

class Updater {
  status = $state<Status>("idle");
  current = $state<string | null>(null);
  /** Version on offer, once one is found. */
  latest = $state<string | null>(null);
  /** Download progress, 0–1 (null when the size isn't known). */
  progress = $state<number | null>(null);
  error = $state<string | null>(null);
  /** The banner was closed for this version. */
  dismissed = $state(false);
  lastChecked = $state<number | null>(null);
  #update: Update | null = null;
  #started = false;

  /** Check now and then on a timer. Dev builds only check when asked. */
  start(): void {
    if (this.#started || !inApp) return;
    this.#started = true;
    void getVersion().then((v) => (this.current = v));
    if (import.meta.env.DEV) return;
    setTimeout(() => void this.check(), FIRST_CHECK_MS);
    setInterval(() => void this.check(), CHECK_EVERY_MS);
  }

  async check(): Promise<void> {
    if (!inApp || this.status === "checking" || this.status === "downloading") return;
    this.status = "checking";
    this.error = null;
    try {
      const update = await check();
      this.lastChecked = Date.now();
      if (update) {
        if (update.version !== this.latest) this.dismissed = false;
        this.#update = update;
        this.latest = update.version;
        this.status = "available";
      } else {
        this.status = "upToDate";
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      // No published release (or one built without update files) has no latest.json yet.
      if (/valid release JSON|404/i.test(message)) {
        this.lastChecked = Date.now();
        this.status = "upToDate";
        return;
      }
      this.status = "error";
      this.error = message;
      console.warn("Update check failed", e);
    }
  }

  /** Download, install and restart into the new version. */
  async install(): Promise<void> {
    const update = this.#update;
    if (!update || this.status === "downloading") return;
    this.status = "downloading";
    this.progress = 0;
    let total = 0;
    let received = 0;
    try {
      await update.downloadAndInstall((event) => {
        if (event.event === "Started") total = event.data.contentLength ?? 0;
        else if (event.event === "Progress") {
          received += event.data.chunkLength;
          this.progress = total ? received / total : null;
        }
      });
      await relaunch();
    } catch (e) {
      this.status = "error";
      this.error = e instanceof Error ? e.message : String(e);
      console.warn("Update install failed", e);
    }
  }
}

export const updater = new Updater();
