<script lang="ts">
  import type { ChatAuthor, Platform } from "../chat/types";
  import { userCard } from "../chat/userCard.svelte";
  import { prefs } from "../prefs.svelte";
  import { cosmetics } from "../seventv/cosmetics.svelte";

  let { author, platform }: { author: ChatAuthor; platform: Platform } = $props();

  const paint = $derived(prefs.value.sevenTvPaints ? cosmetics.paintFor(platform, author.id) : null);
</script>

<!-- Clicking a name opens that user's card. -->
<span
  class="name"
  class:painted={!!paint}
  role="button"
  tabindex="-1"
  style:color={paint ? undefined : author.color}
  style:background-image={paint?.backgroundImage}
  style:background-size={paint?.backgroundSize}
  style:filter={paint?.filter}
  style:--fallback={author.color}
  onclick={() => userCard.open(platform, author)}
  onkeydown={(e) => e.key === "Enter" && userCard.open(platform, author)}>{author.displayName}</span
>

<style>
  .name {
    font-weight: 700;
    cursor: pointer;
  }

  .name:hover {
    text-decoration: underline;
  }

  .painted {
    color: var(--fallback);
    background-clip: text;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-repeat: no-repeat;
  }
</style>
