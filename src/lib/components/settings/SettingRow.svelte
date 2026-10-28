<script lang="ts">
  // One settings row: title + description on the left, the control on the right.
  import type { Snippet } from "svelte";

  let { title, description, children }: { title: string; description?: string; children: Snippet } = $props();
</script>

<div class="row">
  <div class="text">
    <div class="title">{title}</div>
    {#if description}<div class="description">{description}</div>{/if}
  </div>
  <div class="control">{@render children()}</div>
</div>

<style>
  .row {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 8px 0;
  }

  .text {
    flex: 1;
    min-width: 0;
  }

  .title {
    font-size: 13px;
    font-weight: 600;
  }

  .description {
    margin-top: 1px;
    font-size: 12px;
    color: var(--text-muted);
  }

  .control {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }
</style>
