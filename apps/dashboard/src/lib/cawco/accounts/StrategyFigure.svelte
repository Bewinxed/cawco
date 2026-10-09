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
<div
  class="stage"
  bind:this={stage}
  style:height="{figureHeight(
    board,
    lanes.length,
    captioned(board, limits) ? 1 : 0
  )}px"
></div>

<style>
  .stage {
    position: relative;
    box-sizing: content-box;
    border-radius: var(--radius-md);
    background: var(--surface-recess);
    border: 1px solid var(--border-well);
    overflow: hidden;
    contain: layout paint;
  }
  .stage :global(.dg) {
    position: absolute;
    inset: 0;
  }
  .stage :global(.e) {
    position: absolute;
    left: 0;
    top: 0;
  }
  .stage :global(.ln-lbl) {
    display: flex;
    align-items: center;
    gap: 6px;
    height: 14px;
    font: var(--type-meta);
    font-weight: var(--weight-strong);
    line-height: 14px;
    color: var(--ink-row);
    white-space: nowrap;
  }
  .stage :global(.ln-lbl .nm) {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .stage :global(.ln-lbl .dot) {
    flex: none;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--c);
  }
  .stage :global(.ln-lbl svg) {
    width: 12px;
    height: 12px;
    color: var(--ink-muted);
  }
  .stage :global(.clk) {
    padding: 0 5px;
    border-radius: var(--radius-xs);
    font: var(--type-meta);
    line-height: 14px;
    font-variant-numeric: tabular-nums;
    text-align: right;
    color: var(--ink-muted);
    white-space: nowrap;
  }
  .stage :global(.clkw) {
    border-radius: var(--radius-xs);
    background: color-mix(in oklab, var(--c) 26%, transparent);
    opacity: 0;
  }
  .stage :global(.blk) {
    font: var(--type-meta);
    font-weight: var(--weight-strong);
    line-height: 14px;
    text-align: right;
    color: var(--data-bad);
    white-space: nowrap;
    opacity: 0;
  }
  .stage :global(.bar),
  .stage :global(.hr),
  .stage :global(.fl),
  .stage :global(.gh),
  .stage :global(.pu) {
    height: 10px;
    border-radius: var(--radius-hair);
  }
  .stage :global(.bar) {
    background: var(--surface-fill);
  }
  .stage :global(.hr) {
    background: color-mix(in oklab, var(--c) 42%, transparent);
    opacity: 0;
  }
  .stage :global(.fl) {
    background: var(--c);
    transform-origin: 0 50%;
  }
  .stage :global(.gh) {
    border: 1px dashed var(--c);
    background: color-mix(in oklab, var(--c) 22%, transparent);
    opacity: 0;
  }
  .stage :global(.chip) {
    width: 10px;
    height: 10px;
    border-radius: 3px;
    background: var(--c);
    box-shadow: 0 0 0 1.5px var(--surface-recess);
    offset-rotate: 0deg;
    offset-anchor: 50% 50%;
  }
  /* A fork is its parent's chip drawn hollow: the same lane, no extra mark. */
  .stage :global(.chip.child) {
    background: var(--surface-recess);
    box-shadow:
      inset 0 0 0 1.5px var(--c),
      0 0 0 1.5px var(--surface-recess);
  }
  .stage :global(.doc) {
    width: 10px;
    height: 13px;
    border-radius: var(--radius-hair);
    background: var(--warning-9);
    box-shadow: 0 1px 8px color-mix(in oklab, var(--warning-9) 55%, transparent);
  }
  .stage :global(.doc::after) {
    content: "";
    position: absolute;
    left: 2px;
    right: 2px;
    top: 3px;
    height: 5px;
    background: repeating-linear-gradient(
      var(--surface-recess) 0 1px,
      transparent 1px 2.5px
    );
    opacity: 0.55;
  }
  .stage :global(.tag) {
    padding: 0 4px;
    border-radius: var(--radius-xs);
    background: var(--surface-fill);
    font: var(--type-caps);
    font-size: 11px;
    line-height: 14px;
    font-variant-numeric: tabular-nums;
    color: var(--ink-row);
    white-space: nowrap;
  }
  /* A caption wraps where the stage is narrow; the stage grows to hold it. */
  .stage :global(.cap) {
    left: 12px;
    right: 12px;
    bottom: 8px;
    top: auto;
    font: var(--type-meta);
    line-height: 16px;
    color: var(--ink-row);
    text-wrap: pretty;
  }
</style>
