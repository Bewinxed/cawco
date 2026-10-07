<script lang="ts">
  /**
   * How the task canvas frames its graph (PRD §5.2, fit on open): the whole
   * graph, as large as the canvas holds it up to 100%, unless that would set
   * the cards' smallest text under 11px (`floor`). Then the graph is shown
   * at the floor from its start, its first card at the canvas's leading
   * corner, and the rest is a pan away: readable first, whole second.
   *
   * It frames on the first measure, again whenever the graph gains or loses
   * a card (gliding over --dur-panel on --ease-in-out, movement on screen),
   * and in place when the canvas changes size while the view is still the
   * one a fit gave (`held` false). The Fit tool frames the same way.
   */
  import { useStore, useSvelteFlow } from "@xyflow/svelte";
  import { untrack } from "svelte";
  import { FIT } from "#lib/components/features/flow/fit.js";
  import { dur, easeInOut, motionOk } from "../../motion/curves.svelte";

  let {
    nodeCount,
    ready,
    held,
    floor,
  }: {
    nodeCount: number;
    /**
     * Every card is measured and laid out where its size puts it: a frame
     * taken sooner frames the cards stacked at their estimated size.
     */
    ready: boolean;
    /** The person has panned or zoomed since the last fit: the view is theirs. */
    held: boolean;
    /** The least zoom at which the cards' smallest text is still 11px. */
    floor: number;
  } = $props();

  const flow = useSvelteFlow();
  const store = useStore();

  /** Frames the graph now; `glide` moves to the frame instead of cutting. */
  export function frame(glide = false): void {
    const { nodes, width, height } = store;
    if (nodes.length === 0 || !(width && height)) {
      return;
    }
    const options = glide
      ? {
          duration: motionOk.current ? dur("--dur-panel") : 0,
          ease: easeInOut,
        }
      : {};
    const bounds = flow.getNodesBounds(nodes);
    const room = 1 + FIT.padding;
    const whole = Math.min(
      FIT.maxZoom,
      width / (bounds.width * room),
      height / (bounds.height * room)
    );
    if (whole >= floor) {
      flow.fitView({ ...FIT, ...options });
      return;
    }
    // Readable from its start: the leading corner, inset by the fit's
    // padding share of the canvas; an axis the graph fits in is centred.
    const zoom = floor;
    const insetX = (width * FIT.padding) / 2;
    const insetY = (height * FIT.padding) / 2;
    const fitsX = bounds.width * zoom <= width - 2 * insetX;
    const fitsY = bounds.height * zoom <= height - 2 * insetY;
    flow.setViewport(
      {
        zoom,
        x: fitsX
          ? (width - bounds.width * zoom) / 2 - bounds.x * zoom
          : insetX - bounds.x * zoom,
        y: fitsY
          ? (height - bounds.height * zoom) / 2 - bounds.y * zoom
          : insetY - bounds.y * zoom,
      },
      options
    );
  }

  // The first frame once every card is measured and placed; a refit,
  // gliding, once a card that came or went has been laid out too. The frame
  // is taken on the next frame, after the layout's places are drawn.
  let framed: number | undefined;
  let owed = false;
  $effect(() => {
    const count = nodeCount;
    const placed = ready;
    untrack(() => {
      if (framed !== undefined && count !== framed) {
        owed = true;
        framed = count;
      }
      if (!placed) {
        return;
      }
      if (framed === undefined) {
        framed = count;
        requestAnimationFrame(() => frame());
      } else if (owed) {
        owed = false;
        requestAnimationFrame(() => frame(true));
      }
    });
  });

  // The canvas taking its share of a pane, or the window turning: the
  // fitted view follows, a held one stays.
  let sized: string | undefined;
  $effect(() => {
    const size = `${store.width}x${store.height}`;
    const before = sized;
    sized = size;
    if (
      before !== undefined &&
      before !== size &&
      store.width > 0 &&
      store.height > 0 &&
      framed !== undefined &&
      !untrack(() => held)
    ) {
      untrack(() => frame());
    }
  });
</script>
