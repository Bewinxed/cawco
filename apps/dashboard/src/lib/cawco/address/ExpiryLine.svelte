<script lang="ts">
  /**
   * Key expiry drawn, not written (DESIGN.md, The Show Don't Tell Rule):
   * today's mark at the line's start, the day it lapses at its end, the
   * days between as its length. Switched off, the line runs on past the
   * end with no stop, and says so.
   */
  import { dateOf, EXPIRES, EXPIRY_DAYS } from "./tray.svelte";

  let { off }: { off: boolean } = $props();
</script>

<div
  class="grid grid-cols-(--expiry-cols) items-center gap-x-space-2 gap-y-space-1 type-meta text-ink-muted"
  data-off={off || undefined}
  data-slot="expiry-line"
  style:--expiry-cols="auto minmax(0, 1fr) auto"
>
  <span>Today</span>
  <span class="relative flex h-icon-md items-center" aria-hidden="true">
    <span class="size-space-2 flex-none rounded-pill bg-status-live-glyph"
    ></span>
    <span
      class="h-px flex-1 bg-ink-muted data-off:bg-status-done-ink"
      data-off={off || undefined}
    ></span>
    {#if !off}
      <span
        class="box-border size-space-2 flex-none rounded-pill border border-ink-muted"
      ></span>
    {/if}
  </span>
  <span class="num text-ink-strong">{off ? "No expiry" : dateOf(EXPIRES)}</span>
  <span class="col-2 text-center"
    >{off ? "Expiry is off" : `${EXPIRY_DAYS} days`}</span
  >
</div>
