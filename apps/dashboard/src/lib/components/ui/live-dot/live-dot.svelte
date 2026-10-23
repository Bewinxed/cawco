<script lang="ts" module>
  import type { VariantProps } from "tailwind-variants";
  import { tv } from "#lib/utils.js";

  /**
   * The live dot (DESIGN.md, Status dot; Live work breathes): the one
   * breathing dot of live work, on the one shared `breath` loop for a reader
   * who has not asked for less motion, still otherwise. It is the mark
   * beside the words that say what is running, or on a speaker's mark where
   * its answer will come, never a status on its own: what it means is said
   * in words, on screen or to a screen reader.
   */
  export const liveDotVariants = tv({
    base: "breathe loops inline-block flex-none rounded-pill",
    variants: {
      /**
       * Its ink: the live glyph's (the default); the live ink, on a raised
       * tag (the catch-up tag); the muted ink, a wait not yet the session's
       * work (a connection being finished). Each stands at full opacity, so
       * the breath dims it to the floor and back like every breather.
       */
      tone: {
        live: "bg-status-live-glyph",
        "live-ink": "bg-status-live-ink",
        muted: "bg-ink-muted",
      },
      /** `status-dot-size` by default; `row`, a row's 7px dot beside its words (a task card's, a connection's). */
      size: {
        dot: "size-(--status-dot-size)",
        row: "size-space-2",
      },
      /** Cut round by `status-dot-cut` in the raised surface: on a mark's corner. */
      cut: { true: "ring-(length:--status-dot-cut) ring-surface-raised" },
    },
    defaultVariants: { tone: "live", size: "dot" },
  });

  export type LiveDotLooks = VariantProps<typeof liveDotVariants>;
</script>

<script lang="ts">
  import type { HTMLAttributes } from "svelte/elements";
  import { cn } from "#lib/utils.js";

  let {
    class: className,
    cut = false,
    size,
    tone,
    ...rest
  }: HTMLAttributes<HTMLSpanElement> & {
    cut?: boolean;
    size?: LiveDotLooks["size"];
    tone?: LiveDotLooks["tone"];
  } = $props();
</script>

<span
  aria-hidden="true"
  class={cn(liveDotVariants({ cut, size, tone }), className)}
  data-box
  data-slot="live-dot"
  {...rest}
></span>
