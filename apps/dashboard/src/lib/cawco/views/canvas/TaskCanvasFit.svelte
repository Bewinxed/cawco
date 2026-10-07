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
  import {
    dur,
    easeInOut,
    motionOk,
    numberOf,
  } from "../../motion/curves.svelte";

  let {
    nodeCount,
    ready,
    held,
    floor,
    direction,
  }: {
    nodeCount: number;
    /**
     * Every card is measured and laid out where its size puts it: a frame
     * taken sooner frames the cards stacked at their estimated size.
     */
    ready: boolean;
    /** The person has panned or zoomed since the last fit: the view is theirs. */
    held: boolean;
    /** Which way the graph runs: its start is along it, its first rank across it. */
    direction: "LR" | "TB";
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
    // Readable from its start, at the floor: along the graph's flow it
    // starts at the canvas's leading edge, inset by the page's own step; across
    // it, the whole graph is centred if it fits, else its first rank (the
    // cards it starts with, which dagre centres on the graph's middle) is:
    // whole if it fits, else from its own start.
    const zoom = floor;
    const inset = numberOf("--space-4");
    const across = direction === "TB" ? "x" : "y";
    const along = direction === "TB" ? "y" : "x";
    const size = { x: width, y: height };
    const span = (
      box: { x: number; y: number; width: number; height: number },
      axis: "x" | "y"
    ) => (axis === "x" ? box.width : box.height);
    const first = Math.min(...nodes.map((node) => node.position[along]));
    const rank = flow.getNodesBounds(
      nodes.filter((node) => node.position[along] - first < 2)
    );
    const place = (axis: "x" | "y", box: typeof bounds): number =>
      (size[axis] - span(box, axis) * zoom) / 2 - box[axis] * zoom;
    const at = { x: 0, y: 0 };
    at[along] = inset - bounds[along] * zoom;
    if (span(bounds, across) * zoom <= size[across] - 2 * inset) {
      at[across] = place(across, bounds);
    } else if (span(rank, across) * zoom <= size[across] - 2 * inset) {
      at[across] = place(across, rank);
    } else {
      at[across] = inset - rank[across] * zoom;
    }
    flow.setViewport({ zoom, ...at }, options);
  }

  // The first frame once every card is measured and placed; a refit,
  // gliding, once a card that came or went has been laid out too. The frame
  // is taken on the next frame, after the layout's places are drawn.
  let framed: number | undefined;
  let framedWay: "LR" | "TB" | undefined;
  let owed = false;
  $effect(() => {
    const count = nodeCount;
    const way = direction;
    const placed = ready;
    untrack(() => {
      // A card come or gone, or the graph turned (a canvas resized past the
      // floor lays it out the other way): framed again once laid out.
      if (framed !== undefined && (count !== framed || way !== framedWay)) {
        owed = true;
        framed = count;
      }
      framedWay = way;
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
