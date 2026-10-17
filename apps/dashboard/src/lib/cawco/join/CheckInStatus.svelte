<script lang="ts">
  /**
   * The line under an install command while no new machine has checked in.
   * A check-in ends it: the dialog moves to its joined row and the machines
   * popover back to its list, where the machine now is.
   */
  import type { Snippet } from "svelte";

  let { trail }: { trail?: Snippet } = $props();
</script>

<!-- literal: 8px -->
<div
  class="flex min-h-c-btn-h-sm items-center justify-between gap-(--gap)"
  style:--gap="8px"
>
  <!-- literal: 8px -->
  <span
    aria-live="polite"
    class="mark-line flex items-center gap-(--gap) type-meta text-ink-muted"
    style:--gap="8px"
  >
    <!-- literal: 6px -->
    <span
      data-slot="dot"
      class="size-(--dot) flex-none rounded-pill bg-hue-orange-500"
      data-box
      style:--dot="6px"
    ></span>
    <span>Waiting for check-in…</span>
  </span>
  {#if trail}
    {@render trail()}
  {/if}
</div>
