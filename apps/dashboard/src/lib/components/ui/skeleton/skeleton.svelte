<script lang="ts" module>
  import type { VariantProps } from "tailwind-variants";
  import { tv } from "#lib/utils.js";

  /**
   * The one loading placeholder (DESIGN.md, Skeleton): a `surface-fill`
   * block at exactly the size of what it stands for. One band of the raised
   * surface at 60% crosses it every `--dur-loop`, by transform only; without
   * motion it sits still. Each prop names what it stands for, never a number.
   */
  export const skeletonVariants = tv({
    base: "loops relative block overflow-hidden rounded-sm bg-surface-fill motion-safe:after:absolute motion-safe:after:inset-0 motion-safe:after:-translate-x-full motion-safe:after:animate-skeleton-sweep motion-safe:after:bg-linear-to-r motion-safe:after:from-30% motion-safe:after:via-skeleton-sheen motion-safe:after:to-70%",
    variants: {
      /** The block it holds the place of, at that block's height. */
      height: {
        line: "h-6",
        figure: "h-7",
        item: "h-10",
        tabs: "h-11",
        row: "h-14",
        block: "h-20",
        plot: "h-24",
        view: "h-40",
        chart: "h-48",
        board: "h-64",
        /** A word's bar at its text's x-height, so it sits like the word's body. */
        "x-height": "h-c-skeleton-x-height",
        /** A card's picture well, at the ghost picture's 16:10. */
        picture: "aspect-16/10",
        /** The default 36px button, or a 36px row of a menu or a finder. */
        control: "h-c-btn-h",
        /** A small (30px) button or chip, or a rail row. */
        "control-sm": "h-c-btn-h-sm",
        /** A text field. */
        field: "h-c-input-h",
        /** A badge or a run's status chip. */
        badge: "h-c-badge-h",
        /** A suggestion chip under the composer. */
        chip: "h-c-suggest-chip",
        /** A stat tile. */
        stat: "h-c-stat-h",
        /** A card on a project's board. */
        card: "h-c-skeleton-card-h",
        /** A finder row with its reason under its name. */
        "reason-row": "h-c-find-skeleton-tall",
      },
      /** One line of text in its type role, at that role's line box, so the
          lines it stands for take its place without moving anything. */
      line: {
        meta: "type-meta h-lh",
        label: "type-label h-lh",
        body: "type-body h-lh",
        title: "type-title h-lh",
      },
      width: {
        glyph: "w-6",
        word: "w-14",
        short: "w-16",
        label: "w-20",
        name: "w-24",
        title: "w-40",
        "chart-cap": "max-w-144",
        /** A relative age ("3d"): two characters of the text it stands in. */
        age: "w-c-skeleton-age",
      },
      radius: {
        card: "rounded-lg",
        tile: "rounded-md",
        chip: "rounded-sm",
        text: "rounded-xs",
        flush: "rounded-none",
        /** A text line's bar, too thin to round further (the hair). */
        line: "rounded-hair",
        /** A pin's disc, a status dot. */
        pill: "rounded-pill",
      },
      cell: {
        rail: "rail-cell",
        /** A 16px glyph's own cell. */
        glyph: "size-icon-md",
        /** A speaker's or a row's 18px identity mark. */
        mark: "size-c-row-mark",
        /** A comment pin's disc. */
        pin: "size-c-pin",
      },
      /** The text role it stands in, so its x-height and its ch are that role's. */
      type: { label: "type-label", meta: "type-meta" },
      /** Over its whole frame, edge to edge, until what the frame holds
          loads (a shot's picture). */
      fill: { frame: "absolute inset-0" },
      /** Unseen until the wait has lasted `--dur-wait-grace`, then fading up
          (The Real Wait Rule); held still once the cover it stands on
          (`group/cover`) is ready and fading out. */
      reveal: {
        "wait-grace":
          "group-data-ready/cover:animation-paused group-data-ready/cover:after:animation-paused animate-wait-grace-in",
      },
    },
  });

  export type SkeletonLooks = VariantProps<typeof skeletonVariants>;
</script>

<script lang="ts">
  import type { Attachment } from "svelte/attachments";
  import type { HTMLAttributes } from "svelte/elements";
  import { cn, type WithElementRef, type WithoutChildren } from "#lib/utils.js";

  let {
    ref = $bindable(null),
    class: className,
    height,
    line,
    width,
    radius,
    cell,
    type,
    fill,
    reveal,
    ...restProps
  }: WithoutChildren<WithElementRef<HTMLAttributes<HTMLSpanElement>>> &
    SkeletonLooks = $props();

  /**
   * Every sweep on one clock (The One Loop Rule): its start is the document
   * timeline's origin, so placeholders mounted at different moments cross in
   * step. Only a running sweep is moved; one already held keeps its hold
   * (setting the start of a running CSS animation leaves it observing
   * `animation-play-state`: drafts.csswg.org/css-animations-2).
   */
  const oneClock: Attachment<HTMLElement> = (node) => {
    for (const animation of node.getAnimations({ subtree: true })) {
      if (
        animation instanceof CSSAnimation &&
        animation.animationName === "kit-skeleton-sweep" &&
        animation.playState === "running"
      ) {
        animation.startTime = 0;
      }
    }
  };
</script>

<!-- A span drawn as a block, so it may stand wherever its words would:
     inside a button, a label or a line of text. -->
<span
  class={cn(
    skeletonVariants({
      height,
      line,
      width,
      radius,
      cell,
      type,
      fill,
      reveal,
    }),
    className
  )}
  data-slot="skeleton"
  bind:this={ref}
  {@attach oneClock}
  {...restProps}
></span>
