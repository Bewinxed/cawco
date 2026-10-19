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
  data-slot="stage"
  class="relative box-content overflow-hidden contain-layout contain-paint rounded-md border border-border-well bg-surface-recess h-(--stage-h)"
  bind:this={stage}
  style:--stage-h="{figureHeight(
    board,
    lanes.length,
    captioned(board, limits) ? 1 : 0
  )}px"
></div>
