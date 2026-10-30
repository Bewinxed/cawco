<script lang="ts">
  /**
   * The design graph's view, inside its Svelte Flow (StateGraph): the zoom
   * group's zoom in, zoom out and Fit all on Svelte Flow's own `zoomIn`,
   * `zoomOut` and `fitView`; the kept state brought into view when a press
   * keeps one off screen; the measured size of each state reported for the
   * layout; and, as the view moves, where the graph runs on past it (the
   * well's edge fades) and which machine the view's top stands in (a
   * phone's pinned name, call 9).
   */
  import { useNodesInitialized, useStore, useSvelteFlow } from "@xyflow/svelte";
  import { untrack } from "svelte";
  import {
    dur,
    easeInOut,
    motionOk,
    numberOf,
  } from "#lib/cawco/motion/curves.svelte.js";
  import { FIT } from "#lib/components/features/flow/fit.js";

  let {
    keptNode,
    layout,
    minZoom,
    onfades,
    onmeasured,
    onroom,
  }: {
    /** The kept state's node id; null when none stands in this graph. */
    keptNode: string | null;
    /** The placement as a key: laid out again, the kept state is brought into view again. */
    layout: string;
    minZoom: number;
    /** Where the graph runs on past the view, and the machine standing at the view's top whose own top has scrolled out. */
    onfades: (fades: {
      foot: boolean;
      pinned: string | null;
      top: boolean;
    }) => void;
    /** Each state node's measured size, by id, once Svelte Flow has measured them. */
    onmeasured: (sizes: Map<string, { h: number; w: number }>) => void;
    /** The well's size: the room a machine's ranks are laid out across. */
    onroom: (room: { h: number; w: number }) => void;
  } = $props();

  const flow = useSvelteFlow();
  const store = useStore();
  const measured = useNodesInitialized();

  const glide = () => ({
    duration: motionOk.current ? dur("--dur-panel") : 0,
    ease: easeInOut,
  });
  export function zoomIn(): void {
    flow.zoomIn(glide());
  }
  export function zoomOut(): void {
    flow.zoomOut(glide());
  }
  /** Fit all: the whole graph in the well, never past its own size. */
  export function fit(): void {
    flow.fitView({ ...FIT, minZoom, ...glide() });
  }

  // The well's size, for the layout's room.
  $effect(() => {
    const room = { w: store.width, h: store.height };
    if (room.w > 0 && room.h > 0) {
      untrack(() => onroom(room));
    }
  });

  // Each state's size as drawn, once measured: the layout places by it, so nothing is guessed.
  $effect(() => {
    if (!measured.current) {
      return;
    }
    const sizes = new Map<string, { h: number; w: number }>();
    for (const node of store.nodes) {
      if (node.type === "state" && node.measured?.width) {
        sizes.set(node.id, {
          w: Math.ceil(node.measured.width),
          h: Math.ceil(node.measured.height ?? 0),
        });
      }
    }
    untrack(() => onmeasured(sizes));
  });

  // A press keeping a state off screen, or the graph laid out anew, brings it whole into view (clear of the edge fades) at the zoom it has.
  $effect(() => {
    const id = keptNode;
    if (!(id && layout)) {
      return;
    }
    // After the frame a refit lands in (FlowAutoFit), so the reveal is the last word.
    const frame = requestAnimationFrame(() => {
      const node = flow.getInternalNode(id);
      if (!node?.measured.width) {
        return;
      }
      const { x, y, zoom } = flow.getViewport();
      const box = node.internals.positionAbsolute;
      const w = node.measured.width ?? 0;
      const h = node.measured.height ?? 0;
      const left = box.x * zoom + x;
      const top = box.y * zoom + y;
      const fade = numberOf("--c-edge-fade-len");
      const shows =
        left >= 0 &&
        top >= fade &&
        left + w * zoom <= store.width &&
        top + h * zoom <= store.height - fade;
      if (!shows) {
        flow.setCenter(box.x + w / 2, box.y + h / 2, { zoom, ...glide() });
      }
    });
    return () => cancelAnimationFrame(frame);
  });

  // Where the graph runs past the view, and the machine at its top, read as the view moves.
  $effect(() => {
    const { y, zoom } = store.viewport;
    const { height } = store;
    const machines = store.nodes.filter((node) => node.type === "machine");
    if (height <= 0 || machines.length === 0) {
      return;
    }
    let topmost = Number.POSITIVE_INFINITY;
    let foot = Number.NEGATIVE_INFINITY;
    let pinned: string | null = null;
    for (const machine of machines) {
      const h = machine.height ?? machine.measured?.height ?? 0;
      const top = machine.position.y * zoom + y;
      const bottom = top + h * zoom;
      topmost = Math.min(topmost, top);
      foot = Math.max(foot, bottom);
      if (top < -0.5 && bottom > 0.5) {
        pinned = machine.id;
      }
    }
    // A pinned name never stands on a state (round 29): where its band would cover one, it scrolls away with its slab.
    if (pinned) {
      const band = numberOf("--c-row-h");
      const mid = store.width / 2;
      const reach = numberOf("--c-graph-node-w");
      const covers = store.nodes.some((node) => {
        if (node.type !== "state") {
          return false;
        }
        const at = flow.getInternalNode(node.id)?.internals.positionAbsolute;
        const w = (node.measured?.width ?? 0) * zoom;
        const h = (node.measured?.height ?? 0) * zoom;
        const left = (at?.x ?? 0) * zoom + store.viewport.x;
        const top = (at?.y ?? 0) * zoom + y;
        return (
          top < band &&
          top + h > 0 &&
          left < mid + reach / 2 &&
          left + w > mid - reach / 2
        );
      });
      if (covers) {
        pinned = null;
      }
    }
    untrack(() =>
      onfades({
        top: topmost < -0.5,
        foot: foot > height + 0.5,
        pinned,
      })
    );
  });
</script>
