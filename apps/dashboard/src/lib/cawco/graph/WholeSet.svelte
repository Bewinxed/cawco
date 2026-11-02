<script lang="ts">
  /**
   * The whole set (spec, The whole set): every state of every machine and
   * every move between them in one look, on Svelte Flow at 1:1 (no zoom,
   * no zoom figure: no type renders under 12px), each machine a box with
   * its name in its head. Where the drawing is larger than its room it
   * scrolls, by wheel or drag, inside its bounds; it opens on the kept
   * state's machine, from its top-left corner, so nothing is cut on open.
   * A move the states file plays is a solid edge; one the agent only named
   * (the canvas spec's `edges`) is dashed, with its label.
   */
  import "#lib/vendor-css/xyflow.css";
  import {
    type Edge,
    MarkerType,
    type Node,
    SvelteFlow,
    type Viewport,
  } from "@xyflow/svelte";
  import { untrack } from "svelte";
  import { frameSize } from "#lib/cawco/frame-observer.js";
  import { theme } from "#lib/theme.svelte.js";
  import { layoutOf } from "./layout";
  import MachineNode from "./MachineNode.svelte";
  import { holesOf, type Review } from "./model";
  import StateNode from "./StateNode.svelte";

  let {
    review,
    kept,
    keptVariant,
    compared,
    direction,
    focus,
    onpreview,
    onpress,
  }: {
    review: Review;
    kept: string;
    keptVariant: string | null;
    compared: string | null;
    direction: "down" | "across";
    /** The machine to bring into view: the region names' one navigation. */
    focus: string;
    onpreview: (state: string, variant: string | null) => void;
    onpress: (state: string, variant: string) => void;
  } = $props();

  const nodeTypes = { state: StateNode, machine: MachineNode };
  /** The air round the drawing, so no card stands on the room's edge. */
  const AIR = 18;

  const marked = (id: string) => {
    const holes = holesOf(review, id);
    return (
      Boolean(review.states[id]?.failure) || !holes.reaches || !holes.leaves
    );
  };
  let room = $state({ w: 0, h: 0 });
  /** Each card's height as Svelte Flow measured it: the layout is drawn again from them. */
  let measured = $state<Record<string, number>>({});
  /** Down a tall room the columns wrap at its width; across a strip they run on and it scrolls sideways. */
  const layout = $derived(
    layoutOf(
      review,
      marked,
      measured,
      direction === "down" ? Math.max(0, room.w - 2 * AIR) : null
    )
  );

  const nodesNow = $derived<Node[]>([
    ...review.machines.map((machine) => {
      const box = layout.machines[machine.name] ?? { x: 0, y: 0, w: 0, h: 0 };
      return {
        id: `m:${machine.name}`,
        type: "machine",
        position: { x: box.x, y: box.y },
        width: box.w,
        height: box.h,
        data: { name: machine.name },
        selectable: false,
        draggable: false,
        focusable: false,
        // Over the moves, so none crosses a machine's name; its body lets them through.
        zIndex: 1,
      } satisfies Node;
    }),
    ...review.order.map((id) => {
      const box = layout.states[id] ?? { x: 0, y: 0, w: 0, h: 0 };
      const state = review.states[id];
      return {
        id,
        type: "state",
        position: { x: box.x, y: box.y },
        data: {
          state,
          holes: holesOf(review, id),
          kept: id === kept,
          keptVariant: id === kept ? keptVariant : null,
          compared: id === compared,
          onpreview: (variant: string | null) => onpreview(id, variant),
          onpress: (variant: string) => onpress(id, variant),
        },
        selectable: false,
        draggable: false,
        focusable: false,
        zIndex: 2,
      } satisfies Node;
    }),
  ]);

  const edgesNow = $derived<Edge[]>(
    review.moves.map((move) => ({
      id: `${move.from}→${move.to}`,
      source: move.from,
      target: move.to,
      type: "smoothstep",
      label: move.label ?? undefined,
      // Under the cards: a move never stands over a state's name.
      zIndex: 0,
      markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
      style: `stroke: var(--border-contrast); stroke-width: var(--c-graph-edge);${move.played ? "" : " stroke-dasharray: 4 4;"}`,
      labelStyle: "font: var(--type-meta); color: var(--ink-muted);",
      selectable: false,
      focusable: false,
    }))
  );

  // Svelte Flow keeps what it measures on the nodes it holds: it holds its own copies.
  let nodes = $state.raw<Node[]>([]);
  let edges = $state.raw<Edge[]>([]);
  $effect(() => {
    nodes = nodesNow;
  });
  $effect(() => {
    // Once every card is drawn, the layout takes their heights.
    const heights: Record<string, number> = {};
    for (const node of nodes) {
      if (node.type === "state" && node.measured?.height) {
        heights[node.id] = Math.round(node.measured.height);
      }
    }
    const known = untrack(() => measured);
    if (
      Object.keys(heights).length === review.order.length &&
      Object.entries(heights).some(([id, h]) => known[id] !== h)
    ) {
      measured = heights;
    }
  });
  $effect(() => {
    edges = edgesNow;
  });

  const at = (machine: string): Viewport => {
    const box = layout.machines[machine] ?? { x: 0, y: 0 };
    return { x: AIR - box.x, y: AIR - box.y, zoom: 1 };
  };
  let viewport = $state<Viewport>(
    untrack(() => at(review.states[kept]?.machine ?? ""))
  );
  $effect(() => {
    const machine = focus;
    untrack(() => {
      viewport = at(machine);
    });
  });
  const extent = $derived<[[number, number], [number, number]]>([
    [-AIR, -AIR],
    [
      Math.max(layout.bounds.w + AIR, room.w - AIR),
      Math.max(layout.bounds.h + AIR, room.h - AIR),
    ],
  ]);
</script>

<div
  data-slot="whole-set"
  class="relative size-full min-h-0 min-w-0"
  {@attach frameSize((node: HTMLElement) => {
    room = { w: node.clientWidth, h: node.clientHeight };
  })}
>
  <SvelteFlow
    colorMode={theme.current}
    deleteKey={null}
    elementsSelectable={false}
    maxZoom={1}
    minZoom={1}
    {nodeTypes}
    nodesConnectable={false}
    nodesDraggable={false}
    nodesFocusable={false}
    panOnDrag
    panOnScroll
    preventScrolling
    proOptions={{ hideAttribution: true }}
    translateExtent={extent}
    bind:edges
    bind:nodes
    bind:viewport
    zoomOnDoubleClick={false}
    zoomOnPinch={false}
    zoomOnScroll={false}
  />
</div>
