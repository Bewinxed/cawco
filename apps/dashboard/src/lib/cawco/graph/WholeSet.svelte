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
   * it, the cards raised on the group. The map opens fitted to every card,
   * by Svelte Flow's own `fitView` with the house's fit (flow/fit.ts
   * `FIT`), never under the zoom its notes stay readable at (`READABLE`):
   * a set too big for the room at that zoom stands on the kept card, the
   * rest a pan away. It fits again in place as the cards' measured heights lay it
   * out anew or the room changes size, while the view is still a fit
   * (FlowAutoFit). The Fit tool frames the same way, so a view he has not
   * moved is already its frame. No zoom figure. The kept card wears the
   * chosen card's coral edge (WholeCard). One press keeps a state, or,
   * while comparing, compares with it; resting on a card changes nothing.
   *
   * In a pane under 640px the map is a list (WholeList), as DESIGN.md's
   * Map mode draws a narrow map: fitted whole there, its words drew at
   * 2.6px.
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
  import FlowAutoFit from "#lib/components/features/flow/FlowAutoFit.svelte";
  import FlowCanvasTools from "#lib/components/features/flow/FlowCanvasTools.svelte";
  import FlowZoomTracker from "#lib/components/features/flow/FlowZoomTracker.svelte";
  import { FIT, ZOOM } from "#lib/components/features/flow/fit.js";
  import { theme } from "#lib/theme.svelte.js";
  import { browser } from "$app/env";
  import { layoutWhole } from "./layout";
  import MachineNode from "./MachineNode.svelte";
  import { holesOf, type Review } from "./model";
  import RouteEdge, { type RouteData } from "./RouteEdge.svelte";
  import StateNode, {
    type StateCard,
    type StateMark,
  } from "./StateNode.svelte";
  import WholeList from "./WholeList.svelte";
  import WholeMeasure from "./WholeMeasure.svelte";

  let {
    review,
    kept,
    against,
    onpress,
    narrow = false,
  }: {
    review: Review;
    kept: string;
    against: string | null;
    onpress: (state: string, variant: string | null) => void;
    /** A pane under 640px: the map is a list (DESIGN.md, Map mode; WholeList). */
    narrow?: boolean;
  } = $props();

  const nodeTypes = { state: StateNode, machine: MachineNode };
  const edgeTypes = { route: RouteEdge };
  /** A card's height until Svelte Flow has measured it: a name and a note's two lines. */
  const ESTIMATE = 72;

  /** Each card's height as drawn, by its state. */
  let heights = $state<Record<string, number>>({});
  /** The cards' lengths and the groups' room, read off the tokens. */
  const lengths = $derived(
    browser
      ? {
          card: numberOf("--c-graph-node-w"),
          head: numberOf("--space-7"),
          pad: numberOf("--space-3"),
          label: numberOf("--c-graph-label"),
          labelLine: numberOf("--space-5"),
        }
      : { card: 0, head: 0, pad: 0, label: 0, labelLine: 0 }
  );
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
  /** A mark from its sentence: its word the sentence's head, before its colon ("Unreachable", "Dead end"; "Error state" whole). */
  const markOf = (tone: StateMark["tone"], said: string): StateMark => ({
    tone,
    said,
    word: said.split(":")[0] ?? said,
  });
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
      marks: [
        state.failure ? markOf("fail", words.errorState) : null,
        holes.reaches ? null : markOf("attn", words.nothingReaches),
        holes.leaves ? null : markOf("attn", words.nothingLeaves),
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
  let fit = $state<ReturnType<typeof FlowAutoFit>>();
  /** Where the cards stand, as a key: laid out anew by their measured heights, the map fits again. */
  const placed = $derived(
    Object.entries(layout.states)
      .map(([id, box]) => `${id}:${box.x},${box.y},${box.h}`)
      .join(";")
  );
  let zoom = $state(1);
  /** The least size a word draws at anywhere (the probe kit's small-text rule), px. */
  const LEAST_TEXT = 10;
  /**
   * The least zoom a fit takes: the cards' notes, in the meta role, drawn
   * at the least size a word draws at. Fitted whole into a desk's room,
   * the routine form's four machines drew at half size, their notes at 6px:
   * a set too big for the room stands at this zoom on the kept card instead
   * (FlowAutoFit `focus`), the rest a pan away and the Fit tool's frame the
   * same; a set that fits whole above it opens whole, as before.
   */
  const READABLE = browser
    ? LEAST_TEXT /
      (numberOf("--text-meta") *
        Number.parseFloat(getComputedStyle(document.documentElement).fontSize))
    : 1;
  /** The kept card's middle, where a fit held at READABLE stands. */
  const keptMiddle = () => {
    const box = layout.states[kept];
    return box ? { x: box.x + box.w / 2, y: box.y + box.h / 2 } : null;
  };
</script>

{#if narrow}
  <WholeList {cardOf} {kept} {review} />
{:else}
  <div
    data-slot="whole-set"
    class="relative min-h-0 min-w-0 flex-1 overflow-hidden bg-surface-raised"
    style:--xy-edge-stroke="var(--border-contrast)"
    style:--xy-edge-stroke-width="var(--c-graph-edge)"
  >
    <SvelteFlow
      aria-label={words.wholeMap(review.name)}
      colorMode={theme.current}
      deleteKey={null}
      elementsSelectable={false}
      {edgeTypes}
      fitView
      fitViewOptions={{ ...FIT, minZoom: READABLE }}
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
      <FlowAutoFit
        bind:this={fit}
        focus={keptMiddle}
        {held}
        minZoom={READABLE}
        layout={placed}
        nodeCount={nodes.length}
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
          fit={() => fit?.fit()}
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
{/if}
