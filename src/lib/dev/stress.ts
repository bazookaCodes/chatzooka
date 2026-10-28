// Dev-only chat flood for performance testing. From the dev tools console:
//   await __chatzooka.stress({ perSecond: 50, seconds: 20 })
// Reports how smooth rendering stayed (frame times) while the flood ran.
import { chat } from "../chat/store.svelte";
import type { ChatMessage, Fragment } from "../chat/types";

interface StressOptions {
  perSecond?: number;
  seconds?: number;
  emotesPerMessage?: number;
}

export async function stress({ perSecond = 50, seconds = 20, emotesPerMessage = 6 }: StressOptions = {}) {
  const set = await (await fetch("https://7tv.io/v3/emote-sets/global")).json();
  const emotes: { id: string; name: string }[] = set.emotes;
  const animated = emotes.filter((e: any) => e.data?.animated); // eslint-disable-line @typescript-eslint/no-explicit-any
  const pool = animated.length ? animated : emotes;
  const colors = ["#ff4500", "#1e90ff", "#9acd32", "#ff69b4", "#daa520", "#8a2be2"];

  let n = 0;
  const makeMessage = (): ChatMessage => {
    n++;
    const fragments: Fragment[] = [{ type: "text", text: `spam ${n} ` }];
    for (let i = 0; i < emotesPerMessage; i++) {
      const e = pool[(n * 7 + i * 13) % pool.length];
      fragments.push({ type: "emote", name: e.name, url: `https://cdn.7tv.app/emote/${e.id}/2x.webp`, provider: "7tv" });
      fragments.push({ type: "text", text: " " });
    }
    return {
      id: `stress-${n}-${Date.now()}`,
      platform: n % 3 === 0 ? "youtube" : "twitch",
      timestamp: Date.now(),
      author: {
        id: `stress-user-${n % 200}`,
        displayName: `Spammer${n % 200}`,
        color: colors[n % colors.length],
        badges: [],
        roles: { broadcaster: false, mod: false, vip: false, sub: false, member: false },
      },
      fragments,
      kind: "chat",
    };
  };

  const frames: number[] = [];
  let last = performance.now();
  let running = true;
  const onFrame = (t: number) => {
    frames.push(t - last);
    last = t;
    if (running) requestAnimationFrame(onFrame);
  };
  requestAnimationFrame(onFrame);

  const interval = 1000 / perSecond;
  const end = performance.now() + seconds * 1000;
  await new Promise<void>((resolve) => {
    const tick = () => {
      if (performance.now() >= end) return resolve();
      chat.add(makeMessage());
      setTimeout(tick, interval);
    };
    tick();
  });
  running = false;

  frames.sort((a, b) => a - b);
  const pct = (p: number) => frames[Math.floor(frames.length * p)]?.toFixed(1);
  return {
    messages: n,
    frames: frames.length,
    fps: +(frames.length / seconds).toFixed(1),
    medianFrameMs: pct(0.5),
    p95FrameMs: pct(0.95),
    worstFrameMs: frames.at(-1)?.toFixed(1),
    slowFrames: frames.filter((f) => f > 50).length,
    rowsInDom: document.querySelectorAll(".row").length,
    heapMB: (performance as any).memory ? +((performance as any).memory.usedJSHeapSize / 1e6).toFixed(0) : null, // eslint-disable-line @typescript-eslint/no-explicit-any
  };
}
