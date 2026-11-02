<script lang="ts">
  /**
   * The whole set (spec, The whole set): every state of every machine and
   * every move between them on one map that pans and zooms, for judging
   * whether the set is complete. On Svelte Flow, as the project's Canvas
   * and the canvas's map are, with their dots, their zoom tools and their
   * fit: fitted once to frame every card, then the person's; fitted again
   * in place while the view is still a fit (the room resized, the cards
   * measured). No translate extent: the flow's own bounds frame it, so a
   * pan reaches every card.
   *
   * Each machine is a group round its cards (MachineNode), each state a
   * card (StateNode), laid out by dagre (layout.ts) from the cards'
   * measured heights. A move the states file plays is a solid edge, one the
   * agent only named a dashed one, each under the cards, so none crosses a
   * card's words; what a person does to reach a state stands inside its
   * card. One press keeps a state, or, while comparing, compares with it;
   * resting on a card changes nothing.
   *
   * Light while panning: the node components are one constant map, each
   * card's data is set when the set, the kept state or the comparison
   * changes, and nothing reads the view but the zoom tools' figure. Svelte
   * Flow 1.7.0 (its newest release) still hands its pan-zoom new params on
   * every viewport change (Zoom.svelte's `use:zoom`), so what rides on a
   * pan is kept to that.
   */
  import "#lib/vendor-css/xyflow.css";
  import { graphWords as words } from "@cawco/core/words/graph";
  import {
    Background,
    BackgroundVariant,
    type Edge,
    MarkerType,
    type Node,
    Panel,
    SvelteFlow,
  } from "@xyflow/svelte";
  import { untrack } from "svelte";
  import { numberOf } from "#lib/cawco/motion/curves.svelte.js";
  import FlowAutoFit from "#lib/components/features/flow/FlowAutoFit.svelte";
  import FlowCanvasTools from "#lib/components/features/flow/FlowCanvasTools.svelte";
  import FlowZoomTracker from "#lib/components/features/flow/FlowZoomTracker.svelte";
  import { FIT, ZOOM } from "#lib/components/features/flow/fit.js";
  import { theme } from "#lib/theme.svelte.js";
  import { layoutWhole } from "./layout";
  import MachineNode from "./MachineNode.svelte";
  import { holesOf, type Review } from "./model";
  import StateNode, { type StateCard } from "./StateNode.svelte";
  import WholeMeasure from "./WholeMeasure.svelte";

  let {
    review,
    kept,
    against,
    onpress,
  }: {
    review: Review;
    kept: string;
    against: string | null;
    onpress: (state: string, variant: string | null) => void;
  } = $props();

  const nodeTypes = { state: StateNode, machine: MachineNode };
  /** A card's height until Svelte Flow has measured it: a name and a note's two lines. */
  const ESTIMATE = 72;

  /** Each card's height as drawn, by its state. */
  let heights = $state<Record<string, number>>({});
  /** The cards' lengths and the groups' room, read off the tokens. */
  const lengths = $derived({
    card: numberOf("--c-graph-node-w"),
    head: numberOf("--space-7"),
    pad: numberOf("--space-3"),
  });
  const layout = $derived(
    layoutWhole(
      review,
      (id) => ({ width: lengths.card, height: heights[id] ?? ESTIMATE }),
      { head: lengths.head, pad: lengths.pad }
    )
  );

  const press = (state: string) => onpress(state, null);
  /** What a person does to reach `id`, from the moves into it that say so. */
  const arrivesOf = (id: string): string | null => {
    const acts = review.moves
      .filter((move) => move.to === id && move.label)
      .map((move) => move.label as string);
    return acts.length > 0 ? words.arrivesBy([...new Set(acts)]) : null;
  };
  const cardOf = (id: string): StateCard | null => {
    const state = review.states[id];
    if (!state) {
      return null;
    }
    const holes = holesOf(review, id);
    return {
      id,
      name: state.name,
      note: state.note,
      arrives: arrivesOf(id),
      failure: state.failure,
      holed: !(holes.reaches && holes.leaves),
      marks: [
        state.failure ? words.errorState : null,
        holes.reaches ? null : words.nothingReaches,
        holes.leaves ? null : words.nothingLeaves,
      ].filter((mark) => mark !== null),
      kept: id === kept,
      against: id === against,
      onpress: press,
    };
  };

  // Svelte Flow keeps what it measures on the nodes it holds: a node rebuilt
  // keeps its measured box, so it is not hidden until measured again.
  let nodes = $state.raw<Node[]>([]);
  let edges = $state.raw<Edge[]>([]);
  $effect(() => {
    const placed = layout;
    const measured = new Map(
      untrack(() => nodes).map((one) => [one.id, one.measured])
    );
    const groups: Node[] = review.machines.flatMap((machine) => {
      const box = placed.machines[machine.name];
      return box
        ? [
            {
              id: `machine:${machine.name}`,
              type: "machine",
              position: { x: box.x, y: box.y },
              width: box.w,
              height: box.h,
              data: { name: machine.name },
              draggable: false,
              selectable: false,
              connectable: false,
              focusable: false,
              zIndex: 0,
            },
          ]
        : [];
    });
    const cards: Node[] = review.order.flatMap((id) => {
      const box = placed.states[id];
      const card = cardOf(id);
      return box && card
        ? [
            {
              id,
              type: "state",
              position: { x: box.x, y: box.y },
              data: card as unknown as Record<string, unknown>,
              draggable: false,
              selectable: false,
              connectable: false,
              focusable: false,
              zIndex: 2,
            },
          ]
        : [];
    });
    nodes = [...groups, ...cards].map((one) => ({
      ...one,
      measured: measured.get(one.id),
    }));
  });
  $effect(() => {
    edges = review.moves
      .filter((move) => move.from !== move.to)
      .map((move) => ({
        id: `${move.from}->${move.to}`,
        source: move.from,
        target: move.to,
        type: "smoothstep",
        // Over the groups, under the cards: a move never stands on a card's words.
        zIndex: 1,
        selectable: false,
        focusable: false,
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: "var(--border-contrast)",
        },
        style: move.played ? undefined : "stroke-dasharray: 4 4",
      }));
  });

  /** The view is the person's once he pans or zooms; a fit gives it back. */
  let held = $state(false);
  let zoom = $state(1);
  /** Where every card stands: a new placement refits in place while the view is a fit. */
  const placement = $derived(
    Object.values(layout.states)
      .map((box) => `${box.x},${box.y}`)
      .join(";")
  );
</script>

<div
  data-slot="whole-set"
  class="relative min-h-0 min-w-0 flex-1 overflow-hidden rounded-md bg-surface-recess-deep"
  style:--xy-edge-stroke="var(--border-contrast)"
  style:--xy-edge-stroke-width="var(--c-graph-edge)"
>
  <SvelteFlow
    aria-label={words.wholeMap(review.name)}
    colorMode={theme.current}
    deleteKey={null}
    elementsSelectable={false}
    fitView
    fitViewOptions={FIT}
    {...ZOOM}
    nodesConnectable={false}
    nodesDraggable={false}
    nodesFocusable={false}
    {nodeTypes}
    onmovestart={(event) => {
      if (event) {
        held = true;
      }
    }}
    panOnDrag
    proOptions={{ hideAttribution: true }}
    zoomOnDoubleClick={false}
    bind:edges
    bind:nodes
  >
    <Background gap={16} size={1} variant={BackgroundVariant.Dots} />
    <FlowZoomTracker
      onZoomChange={(value) => {
        zoom = value;
      }}
    />
    <FlowAutoFit {held} layout={placement} nodeCount={nodes.length} />
    <WholeMeasure
      {heights}
      onheights={(next) => {
        heights = next;
      }}
    />
    <Panel position="bottom-center">
      <FlowCanvasTools
        onfit={() => {
          held = false;
        }}
        onzoom={() => {
          held = true;
        }}
        {zoom}
      />
    </Panel>
  </SvelteFlow>
</div>
