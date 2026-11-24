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
  const liveDotVariants = tv({
    base: "breathe loops inline-block flex-none rounded-pill [animation-delay:var(--loop-at)]",
    variants: {
      /**
       * Its ink: the live glyph's (the default); the live ink, on a raised
       * tag (the catch-up tag); the muted ink, a wait not yet the session's
       * work (a connection being finished). Each stands at full opacity, so
       * the breath dims it to the floor and back like every breather.
       */
      tone: {
        live: "bg-live",
        "live-ink": "bg-live",
        muted: "bg-tx-2",
      },
      /** `status-dot-size` by default; `row`, a row's 7px dot beside its words (a task card's, a connection's). */
      size: {
        dot: "size-1.5",
        row: "size-space-2",
      },
      /** Cut round by `status-dot-cut` in the raised surface: on a mark's corner. */
      cut: { true: "ring-dot-cut ring-bg" },
    },
    defaultVariants: { tone: "live", size: "dot" },
  });

  type LiveDotLooks = VariantProps<typeof liveDotVariants>;
</script>

<script lang="ts">
  import type { HTMLAttributes } from "svelte/elements";
  import { inStep } from "#lib/platform/motion/in-step.svelte.js";
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

  const step = inStep();
</script>

<!-- Its breath on the one clock (motion/in-step): every live dot, here and
     on a previewed page's pills, breathes in step. Any mark that takes the
     breath (`breathe`) takes it in step so. -->
<span
  aria-hidden="true"
  class={cn(liveDotVariants({ cut, size, tone }), className)}
  data-box
  data-slot="live-dot"
  {...rest}
  style:--loop-at={step.delay}
  {@attach step.keep}
></span>
