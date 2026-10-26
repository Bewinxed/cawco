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

  type LiveDotLooks = VariantProps<typeof liveDotVariants>;
</script>

<script lang="ts">
  import { breathPhase } from "@cawco/core/breath";
  import type { Attachment } from "svelte/attachments";
  import type { HTMLAttributes } from "svelte/elements";
  import { cn } from "#lib/utils.js";

  /**
   * Its breath on the one clock (core breath.ts): every live dot, here and
   * on a previewed page's pills, breathes in step, its loop begun on the
   * wall clock's multiples of `--breath`. Set as the effect's delay, which
   * leaves `animation-play-state` to CSS (CSS Animations 2, §2: only
   * `play()`, `pause()`, `reverse()` and setting `startTime` take it over),
   * so the rest rule still holds a dot nobody sees still: first from the
   * timeline's time, then exactly from the start time it was given. Under
   * reduced motion there is no breath to set.
   */
  const inStep: Attachment<HTMLElement> = (dot) => {
    const breath = dot
      .getAnimations()
      .find(
        (run): run is CSSAnimation =>
          run instanceof CSSAnimation && run.animationName === "breath"
      );
    const effect = breath?.effect;
    if (!(breath && effect)) {
      return;
    }
    const period = Number(effect.getComputedTiming().duration);
    const align = (at: number) =>
      effect.updateTiming({
        delay: -breathPhase(performance.timeOrigin, at, period),
      });
    align(Number(document.timeline.currentTime ?? performance.now()));
    breath.ready
      .then(() => {
        if (breath.startTime !== null) {
          align(Number(breath.startTime));
        }
      })
      .catch(() => undefined);
  };

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
  {@attach inStep}
></span>
