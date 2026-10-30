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
  import { dur, easeInOut, motionOk } from "#lib/cawco/motion/curves.svelte.js";
  import { FIT } from "#lib/components/features/flow/fit.js";

  let {
    keptNode,
    minZoom,
    onfades,
    onmeasured,
    onroom,
  }: {
    /** The kept state's node id; null when none stands in this graph. */
    keptNode: string | null;
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

  // A press keeping a state off screen brings it into view at the zoom the person has.
  $effect(() => {
    const id = keptNode;
    if (!id) {
      return;
    }
    untrack(() => {
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
      const shows =
        left >= 0 &&
        top >= 0 &&
        left + w * zoom <= store.width &&
        top + h * zoom <= store.height;
      if (!shows) {
        flow.setCenter(box.x + w / 2, box.y + h / 2, { zoom, ...glide() });
      }
    });
  });

  // Where the graph runs past the view, and the machine at its top, read as the view moves.
  $effect(() => {
    // A sideways pan moves no edge it reads: x is not read.
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
    untrack(() =>
      onfades({
        top: topmost < -0.5,
        foot: foot > height + 0.5,
        pinned,
      })
    );
  });
</script>
