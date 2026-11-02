<script lang="ts">
  /**
   * The whole set (spec, The whole set): every state of every machine and
   * every move between them on one map that pans and zooms, for judging
   * whether the set is complete. On Svelte Flow, as the project's Canvas
   * and the canvas's map are, with their dots and zoom tools.
   *
   * Each machine is a group round its cards (MachineNode), each state a
   * card (StateNode), laid out by dagre (layout.ts) from the cards'
   * measured heights. Every move is an arrow (RouteEdge), the moves
   * between machines too, routed by dagre round the cards and labelled by
   * the act that makes it ("Try again") where dagre left room, so no arrow
   * crosses a title and no label stands on a card. A move the states file
   * plays is solid, one the agent only named dashed.
   *
   * Three surfaces apart, so each reads (DESIGN.md, The Frame Recesses
   * Rule): the map on the room's raised surface, each group recessed on
   * it, the cards raised on the group. The map is framed by WholeFit: never
   * under the zoom where its 12px words stand at 12px, fitted when the
   * whole map fits its room there, else from its top-leading corner with
   * the kept card in view; no zoom figure. The kept card wears the list's
   * on-stage face. One press keeps a state, or, while comparing, compares
   * with it; resting on a card changes nothing.
   *
   * Light while panning: the node components are one constant map, each
   * card's data is set when the set, the kept state or the comparison
   * changes, and nothing reads the view but the zoom tools.
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
  import FlowCanvasTools from "#lib/components/features/flow/FlowCanvasTools.svelte";
  import FlowZoomTracker from "#lib/components/features/flow/FlowZoomTracker.svelte";

  import { theme } from "#lib/theme.svelte.js";
  import { layoutWhole } from "./layout";
  import MachineNode from "./MachineNode.svelte";
  import { holesOf, type Review } from "./model";
  import RouteEdge, { type RouteData } from "./RouteEdge.svelte";
  import StateNode, { type StateCard } from "./StateNode.svelte";
  import WholeFit from "./WholeFit.svelte";
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
  const edgeTypes = { route: RouteEdge };
  /** The zoom where the map's smallest words (meta, 12px) stand at 12px: the least it takes, and the most a frame takes. */
  const READABLE = 1;
  /** Its zoom range: never under the readable size; in to twice it. */
  const ZOOMS = { minZoom: READABLE, maxZoom: 2 } as const;
  /** A card's height until Svelte Flow has measured it: a name and a note's two lines. */
  const ESTIMATE = 72;

  /** Each card's height as drawn, by its state. */
  let heights = $state<Record<string, number>>({});
  /** The cards' lengths and the groups' room, read off the tokens. */
  const lengths = $derived({
    card: numberOf("--c-graph-node-w"),
    head: numberOf("--space-7"),
    pad: numberOf("--space-3"),
    label: numberOf("--c-graph-label"),
    labelLine: numberOf("--space-5"),
    edge: numberOf("--space-6"),
  });
  /** A hidden line in the label's own type, at its widest: what an act's label takes. */
  let ruler = $state<HTMLElement>();
  const labelSize = (label: string) => {
    if (!ruler) {
      return { width: lengths.label, height: lengths.labelLine };
    }
    ruler.textContent = label;
    return { width: ruler.offsetWidth + 2, height: ruler.offsetHeight + 2 };
  };
  const layout = $derived(
    layoutWhole(
      review,
      (id) => ({ width: lengths.card, height: heights[id] ?? ESTIMATE }),
      { head: lengths.head, pad: lengths.pad },
      labelSize
    )
  );

  const press = (state: string) => onpress(state, null);
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
    const { routes } = layout;
    edges = review.moves.flatMap((move) => {
      const route = routes[`${move.from}->${move.to}`];
      if (!route) {
        return [];
      }
      const data: RouteData = {
        label: move.label,
        labelAt: route.label,
        played: move.played !== null,
        points: route.points,
      };
      return [
        {
          id: `${move.from}->${move.to}`,
          source: move.from,
          target: move.to,
          type: "route",
          // Over the groups, under the cards.
          zIndex: 1,
          selectable: false,
          focusable: false,
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: "var(--border-contrast)",
          },
          data: data as unknown as Record<string, unknown>,
        },
      ];
    });
  });

  /** The view is the person's once he pans or zooms; the tools' frame gives it back. */
  let held = $state(false);
  let fit = $state<ReturnType<typeof WholeFit>>();
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
  class="relative min-h-0 min-w-0 flex-1 overflow-hidden rounded-md border border-border-hairline bg-surface-raised"
  style:--xy-edge-stroke="var(--border-contrast)"
  style:--xy-edge-stroke-width="var(--c-graph-edge)"
>
  <SvelteFlow
    aria-label={words.wholeMap(review.name)}
    colorMode={theme.current}
    deleteKey={null}
    elementsSelectable={false}
    {edgeTypes}
    {...ZOOMS}
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
    <WholeFit
      bind:this={fit}
      {held}
      group={`machine:${review.states[kept]?.machine ?? ""}`}
      {kept}
      layout={placement}
      pad={lengths.edge}
      zoom={READABLE}
    />
    <WholeMeasure
      {heights}
      onheights={(next) => {
        heights = next;
      }}
    />
    <Panel position="bottom-center">
      <FlowCanvasTools
        figure={false}
        fit={() => fit?.frame(true)}
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
  <!-- An act's label measured in its own type, at its widest. -->
  <span
    bind:this={ruler}
    aria-hidden="true"
    class="pointer-events-none invisible absolute start-0 top-0 max-w-c-graph-label border px-space-1 type-meta"
  ></span>
</div>
