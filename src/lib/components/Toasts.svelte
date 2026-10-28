<script lang="ts">
  import { toasts } from "../toasts.svelte";
</script>

<div class="toasts" aria-live="polite">
  {#each toasts.list as toast (toast.id)}
    <button class="toast {toast.kind}" onclick={() => toasts.dismiss(toast.id)}>{toast.text}</button>
  {/each}
</div>

<style>
  .toasts {
    position: fixed;
    top: 48px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    z-index: 30;
    pointer-events: none;
    width: calc(100% - 32px);
  }

  .toast {
    pointer-events: auto;
    max-width: 100%;
    padding: 7px 12px;
    border-radius: 6px;
    font-size: 13px;
    background: #15281b;
    border: 1px solid #2b5a38;
    color: #9ee0b0;
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.45);
  }

  .toast.error {
    background: #2a1717;
    border-color: #5a2b2b;
    color: #f0b4b4;
  }
</style>
