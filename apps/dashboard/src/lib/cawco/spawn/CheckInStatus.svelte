<script lang="ts">
  /**
   * The line under the Machines chip's install command while no new machine
   * has checked in. A check-in ends it: the popover goes back to its list,
   * where the machine now is.
   */
  import type { Snippet } from "svelte";

  let { trail }: { trail?: Snippet } = $props();
</script>

<div class="flex min-h-c-btn-h-sm items-center justify-between gap-space-2">
  <span
    aria-live="polite"
    class="mark-line flex items-center gap-space-2 type-meta text-ink-muted"
  >
    <span
      data-slot="dot"
      class="size-space-2 flex-none rounded-pill bg-hue-orange-500"
      data-box
    ></span>
    <span>Waiting for check-in…</span>
  </span>
  {#if trail}
    {@render trail()}
  {/if}
</div>
