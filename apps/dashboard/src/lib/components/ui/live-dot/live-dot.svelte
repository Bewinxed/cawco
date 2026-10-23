<script lang="ts">
  /**
   * The live dot (DESIGN.md, Status dot; Live work breathes): a
   * `status-dot-size` circle in the live glyph's ink that breathes on the one
   * shared `breath` loop while work runs, for a reader who has not asked for
   * less motion; still otherwise. It is the mark beside the words that say
   * what is running, or on a speaker's mark where its answer will come, never
   * a status on its own: what it means is said in words, on screen or to a
   * screen reader. `cut` rings it in the surface it stands over, where it
   * sits on a mark's corner.
   */
  import type { HTMLAttributes } from "svelte/elements";
  import { cn } from "#lib/utils.js";

  let {
    class: className,
    cut = false,
    ...rest
  }: HTMLAttributes<HTMLSpanElement> & {
    /** Cut round by `status-dot-cut` in the raised surface: on a mark's corner. */
    cut?: boolean;
  } = $props();
</script>

<span
  aria-hidden="true"
  class={cn(
    "breathe loops inline-block size-(--status-dot-size) flex-none rounded-pill bg-status-live-glyph",
    cut && "ring-(length:--status-dot-cut) ring-surface-raised",
    className
  )}
  data-box
  data-slot="live-dot"
  {...rest}
></span>
