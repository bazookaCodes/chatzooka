<script lang="ts">
  // In the desktop app user cards are their own windows (CardWindow.svelte). This shows the same
  // card floating in the page instead, for browser previews (`npm run dev`).
  import { CARD_SIZE, userCard } from "../chat/userCard.svelte";
  import CardView from "./CardView.svelte";
</script>

<svelte:window onkeydown={(e) => e.key === "Escape" && userCard.target && userCard.close()} />

{#if userCard.target}
  {#key userCard.target}
    <div class="backdrop" role="presentation" onclick={() => userCard.close()}></div>
    <div
      class="floating"
      role="dialog"
      aria-label={`${userCard.target.author.displayName}'s user card`}
      style:width="{CARD_SIZE.width}px"
      style:height="{Math.min(CARD_SIZE.height, window.innerHeight - 40)}px"
    >
      <CardView target={userCard.target} windowMode={false} onClose={() => userCard.close()} />
    </div>
  {/key}
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 15;
  }

  .floating {
    position: fixed;
    z-index: 16;
    top: 20px;
    left: 50%;
    max-width: calc(100vw - 16px);
    translate: -50% 0;
    border: 1px solid #3a3a3a;
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 0 16px 50px rgba(0, 0, 0, 0.6);
  }
</style>
