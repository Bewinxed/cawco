<script lang="ts">
  /**
   * The line under an install command while no new machine has checked in.
   * A check-in ends it: the dialog moves to its joined row and the machines
   * popover back to its list, where the machine now is.
   */
  import type { Snippet } from "svelte";

  let { trail }: { trail?: Snippet } = $props();
</script>

<div class="status">
  <span aria-live="polite" class="said">
    <span class="dot"></span>
    Waiting for check-in…
  </span>
  {#if trail}
    {@render trail()}
  {/if}
</div>

<style>
  .status {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    min-height: 30px;
  }
  .said {
    display: flex;
    align-items: center;
    gap: 8px;
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  .dot {
    flex: none;
    width: 6px;
    height: 6px;
    border-radius: var(--radius-pill);
    background: var(--hue-orange-500);
  }
</style>
