import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

const host = process.env.TAURI_DEV_HOST;

// https://v2.tauri.app/start/frontend/vite/
export default defineConfig({
  plugins: [
    svelte(),
    {
      // Hot-swapping plain .ts modules leaves old copies alive inside open connections and
      // listeners, so the app keeps running stale code. Reload the page fully instead.
      name: "full-reload-on-ts-change",
      handleHotUpdate({ file, server }) {
        if (file.endsWith(".ts") && file.includes("/src/")) {
          server.ws.send({ type: "full-reload" });
          return [];
        }
      },
    },
  ],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
    watch: { ignored: ["**/src-tauri/**"] },
  },
  envPrefix: ["VITE_", "TAURI_ENV_*"],
  build: {
    target: process.env.TAURI_ENV_PLATFORM === "windows" ? "chrome105" : "safari15",
    minify: !process.env.TAURI_ENV_DEBUG,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
});
