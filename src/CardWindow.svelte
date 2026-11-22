<script lang="ts">
  // Root of a user card window. Like Chatterino's cards it closes when you click elsewhere,
  // unless pinned. Drag its edges to resize it.
  import { onMount } from "svelte";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import { emitTo } from "@tauri-apps/api/event";
  import { cardDrag } from "./lib/card/client";
  import { CARD_EVENTS, cardLabel, type CardTarget } from "./lib/card/protocol";
  import CardView from "./lib/components/CardView.svelte";
  import Toasts from "./lib/components/Toasts.svelte";

  let { target }: { target: CardTarget } = $props();

  const win = getCurrentWindow();
  /** Every card starts unpinned; pinning applies to that card only. */
  let pinned = $state(false);

  function close() {
    void emitTo("main", CARD_EVENTS.closed, { label: cardLabel(target) });
    void win.close();
  }

  onMount(() => {
    void emitTo("main", CARD_EVENTS.opened, { label: cardLabel(target), target });
    // Close when you click somewhere else. Only a focus loss that lasts counts: if focus comes back within a moment (as it can around
    // a drag), the pending close is cancelled. (No "was it focused yet" check: the card gets focus
    // as it opens, usually before this listener exists, so that first focus is never seen.)
    let pendingClose: ReturnType<typeof setTimeout> | null = null;
    const cancelClose = () => {
      if (pendingClose) clearTimeout(pendingClose);
      pendingClose = null;
    };
    const closeIfStillAway = () => {
      pendingClose = null;
      if (pinned) return;
      if (cardDrag.active) {
        pendingClose = setTimeout(closeIfStillAway, 300); // look again once the drag ends
        return;
      }
      close();
    };
    const unlisten = win.onFocusChanged(({ payload: focused }) => {
      if (focused) {
        cardDrag.active = false;
        cancelClose();
        return;
      }
      if (pinned) return;
      cancelClose();
      pendingClose = setTimeout(closeIfStillAway, 250);
    });
    // Windows may swallow the mouse release at the end of a drag, so later mouse movement in the
    // card (or a few seconds passing) also ends it.
    const movedAfterDrag = () => {
      if (cardDrag.active && Date.now() - cardDrag.since > 500) cardDrag.active = false;
    };
    window.addEventListener("mousemove", movedAfterDrag);
    // Pressing anywhere in the card means you're in it.
    window.addEventListener("mousedown", cancelClose);
    const dragTimer = setInterval(() => {
      if (cardDrag.active && Date.now() - cardDrag.since > 10_000) cardDrag.active = false;
    }, 1000);
    const onUnload = () => void emitTo("main", CARD_EVENTS.closed, { label: cardLabel(target) });
    window.addEventListener("beforeunload", onUnload);
    return () => {
      void unlisten.then((u) => u());
      window.removeEventListener("beforeunload", onUnload);
      window.removeEventListener("mousedown", cancelClose);
      window.removeEventListener("mousemove", movedAfterDrag);
      cancelClose();
      clearInterval(dragTimer);
    };
  });
</script>

<svelte:window onkeydown={(e) => e.key === "Escape" && close()} />

<div class="frame">
  <CardView {target} windowMode bind:pinned onClose={close} />
</div>
<Toasts />

<style>
  .frame {
    height: 100%;
    border: 1px solid #3a3a3a;
    overflow: hidden;
  }
</style>
