<script lang="ts">
  /**
   * One strategy figure in its stage (figure.ts). It is built for the
   * stage's width and rebuilt when that, its lanes, its numbers or the theme
   * change, keeping its place in the loop. It plays only while `playing` (its
   * card chosen or under the pointer) and while on screen; otherwise, and
   * always under reduced motion, it holds its last frame and caption.
   */
  import { motionOk } from "../motion/curves.svelte";
  import {
    type Board,
    buildFigure,
    captioned,
    figureHeight,
    type Lane,
    type Policy,
    type Timeline,
  } from "./figure";

  let {
    board,
    lanes,
    playing,
    limits = true,
    pin,
    policy,
  }: {
    board: Board;
    lanes: Lane[];
    playing: boolean;
    /** Whether CawCo reads the provider's limits: the at-the-limit policy shows below. */
    limits?: boolean;
    pin?: number;
    policy?: Policy;
  } = $props();

  let stage = $state<HTMLElement | null>(null);
  let width = $state(0);
  let onScreen = $state(false);
  let dark = $state(false);
  let timeline: Timeline | null = null;

  /** What the figure is drawn from; a change rebuilds it. */
  const key = $derived(
    JSON.stringify({ board, lanes, limits, pin, policy, width, dark })
  );

  $effect(() => {
    const node = stage;
    if (!node) {
      return;
    }
    const sizes = new ResizeObserver(() => {
      width = node.clientWidth;
    });
    sizes.observe(node);
    const seen = new IntersectionObserver(
      ([entry]) => {
        onScreen = entry.isIntersecting;
      },
      { threshold: 0.2 }
    );
    seen.observe(node);
    const root = document.documentElement;
    dark = root.classList.contains("dark");
    const theme = new MutationObserver(() => {
      dark = root.classList.contains("dark");
    });
    theme.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => {
      sizes.disconnect();
      seen.disconnect();
      theme.disconnect();
      timeline?.stop();
      timeline = null;
    };
  });

  // Rebuilt a beat after its inputs settle (a number being typed), from the
  // place in the loop it had reached.
  $effect(() => {
    const node = stage;
    const spec = JSON.parse(key) as {
      board: Board;
      lanes: Lane[];
      limits: boolean;
      pin?: number;
      policy?: Policy;
      width: number;
    };
    if (!node || spec.width === 0 || spec.lanes.length === 0) {
      return;
    }
    const timer = setTimeout(
      () => {
        const at = timeline?.time() ?? undefined;
        timeline?.stop();
        timeline = buildFigure(node, spec);
        sync(at);
      },
      timeline ? 120 : 0
    );
    return () => clearTimeout(timer);
  });

  const live = $derived(playing && onScreen && motionOk.current);
  $effect(() => {
    sync(undefined, live);
  });

  function sync(at?: number, on = live) {
    if (!timeline) {
      return;
    }
    if (on && !timeline.anims) {
      timeline.play(at);
    } else if (!on && timeline.anims) {
      timeline.stop();
    }
  }
</script>

<!-- Stands at its lanes' height from the first frame, with a caption's line
     only on a board that writes one; the build sets it again once its
     captions are measured, taller only where one wraps. -->
<!-- literal: the figure's sizes the build (figure.ts) draws it at; none has a token -->
<div
  data-slot="stage"
  class="relative box-content h-(--stage-h) overflow-hidden contain-layout contain-paint rounded-md border border-border-well bg-surface-recess"
  bind:this={stage}
  style:--stage-h="{figureHeight(
    board,
    lanes.length,
    captioned(board, limits) ? 1 : 0
  )}px"
  style:--fig-lbl-gap="6px"
  style:--fig-dot="7px"
  style:--fig-clk-pad="5px"
  style:--fig-bar-h="10px"
  style:--fig-chip="10px"
  style:--fig-chip-r="3px"
  style:--fig-ring="1.5px"
  style:--fig-tag-fs="11px"
  style:--fig-cap-inset="12px"
  style:--fig-cap-bottom="8px"
  style:--fig-cap-lh="16px"
></div>

<style>
  /* residual: foreign-dom */
  [data-slot="stage"] :global(.dg) {
    position: absolute;
    inset: 0;
  }
  [data-slot="stage"] :global(.e) {
    position: absolute;
    left: 0;
    top: 0;
  }
  [data-slot="stage"] :global(.ln-lbl) {
    display: flex;
    align-items: center;
    gap: var(--fig-lbl-gap);
    height: var(--space-4);
    font: var(--type-meta);
    font-weight: var(--weight-strong);
    line-height: var(--space-4);
    color: var(--ink-row);
    white-space: nowrap;
  }
  [data-slot="stage"] :global(.ln-lbl .nm) {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  [data-slot="stage"] :global(.ln-lbl .dot) {
    flex: none;
    width: var(--fig-dot);
    height: var(--fig-dot);
    border-radius: 50%;
    background: var(--c);
  }
  [data-slot="stage"] :global(.ln-lbl svg) {
    width: var(--icon-sm);
    height: var(--icon-sm);
    color: var(--ink-muted);
  }
  [data-slot="stage"] :global(.clk) {
    padding: 0 var(--fig-clk-pad);
    border-radius: var(--radius-xs);
    font: var(--type-meta);
    line-height: var(--space-4);
    font-variant-numeric: tabular-nums;
    text-align: right;
    color: var(--ink-muted);
    white-space: nowrap;
  }
  [data-slot="stage"] :global(.clkw) {
    border-radius: var(--radius-xs);
    background: color-mix(in oklab, var(--c) 26%, transparent);
    opacity: 0;
  }
  [data-slot="stage"] :global(.blk) {
    font: var(--type-meta);
    font-weight: var(--weight-strong);
    line-height: var(--space-4);
    text-align: right;
    color: var(--data-bad);
    white-space: nowrap;
    opacity: 0;
  }
  [data-slot="stage"] :global(.bar),
  [data-slot="stage"] :global(.hr),
  [data-slot="stage"] :global(.fl),
  [data-slot="stage"] :global(.gh),
  [data-slot="stage"] :global(.pu) {
    height: var(--fig-bar-h);
    border-radius: var(--radius-hair);
  }
  [data-slot="stage"] :global(.bar) {
    background: var(--surface-fill);
  }
  [data-slot="stage"] :global(.hr) {
    background: color-mix(in oklab, var(--c) 42%, transparent);
    opacity: 0;
  }
  [data-slot="stage"] :global(.fl) {
    background: var(--c);
    transform-origin: 0 50%;
  }
  [data-slot="stage"] :global(.gh) {
    border: 1px dashed var(--c);
    background: color-mix(in oklab, var(--c) 22%, transparent);
    opacity: 0;
  }
  [data-slot="stage"] :global(.chip) {
    width: var(--fig-chip);
    height: var(--fig-chip);
    border-radius: var(--fig-chip-r);
    background: var(--c);
    box-shadow: 0 0 0 var(--fig-ring) var(--surface-recess);
    offset-rotate: 0deg;
    offset-anchor: 50% 50%;
  }
  /* A fork is its parent's chip drawn hollow: the same lane, no extra mark. */
  [data-slot="stage"] :global(.chip.child) {
    background: var(--surface-recess);
    box-shadow:
      inset 0 0 0 var(--fig-ring) var(--c),
      0 0 0 var(--fig-ring) var(--surface-recess);
  }
  /* residual: foreign-dom */
  [data-slot="stage"] :global(.tag) {
    padding: 0 var(--space-1);
    border-radius: var(--radius-xs);
    background: var(--surface-fill);
    font: var(--type-caps);
    font-size: var(--fig-tag-fs);
    line-height: var(--space-4);
    font-variant-numeric: tabular-nums;
    color: var(--ink-row);
    white-space: nowrap;
  }
  /* A caption wraps where the stage is narrow; the stage grows to hold it. */
  [data-slot="stage"] :global(.cap) {
    left: var(--fig-cap-inset);
    right: var(--fig-cap-inset);
    bottom: var(--fig-cap-bottom);
    top: auto;
    font: var(--type-meta);
    line-height: var(--fig-cap-lh);
    color: var(--ink-row);
    text-wrap: pretty;
  }
</style>
