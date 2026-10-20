<script lang="ts">
  /**
   * The Empty Starts Work Rule's second sentence: where the work can't
   * start, why, in its own meta line, over the way to do it by hand (when
   * the surface doesn't already stand that beside the empty state). Every
   * can't-start empty state draws it, through EmptyAsk or on its own.
   */
  import type { Snippet } from "svelte";

  let {
    reason,
    byHand,
  }: {
    /** Why it can't start and what fixes it, in a sentence. */
    reason: string;
    /** The way by hand. */
    byHand?: Snippet;
  } = $props();
</script>

<div class="flex min-w-0 flex-col items-start gap-space-2" data-empty-cant>
  <p class="max-w-c-measure-short type-meta text-ink-muted text-pretty">
    {reason}
  </p>
  {@render byHand?.()}
</div>
