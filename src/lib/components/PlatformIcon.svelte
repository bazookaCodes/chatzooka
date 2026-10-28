<script lang="ts">
  import type { Platform } from "../chat/types";

  let { platform, size = 16, color }: { platform: Platform; size?: number; color?: string } = $props();
</script>

{#if platform === "twitch"}
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill={color ?? "var(--twitch)"}
    role="img"
    aria-label="Twitch"
  >
    <path
      fill-rule="evenodd"
      d="M4.3 2 3 5.5v14h4.6V22h2.6l2.5-2.5h3.8L22 14V2H4.3Zm15.4 11-3 3h-4.6l-2.6 2.6V16H5.6V4.3h14.1V13ZM16.6 7v5.2h-2.2V7h2.2Zm-5.6 0v5.2H8.8V7H11Z"
    />
  </svg>
{:else}
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill={color ?? "var(--youtube)"}
    role="img"
    aria-label="YouTube"
  >
    <path
      fill-rule="evenodd"
      d="M21.6 7.2a2.5 2.5 0 0 0-1.8-1.8C18.2 5 12 5 12 5s-6.2 0-7.8.4a2.5 2.5 0 0 0-1.8 1.8C2 8.8 2 12 2 12s0 3.2.4 4.8a2.5 2.5 0 0 0 1.8 1.8C5.8 19 12 19 12 19s6.2 0 7.8-.4a2.5 2.5 0 0 0 1.8-1.8c.4-1.6.4-4.8.4-4.8s0-3.2-.4-4.8ZM10 15V9l5.2 3L10 15Z"
    />
  </svg>
{/if}
