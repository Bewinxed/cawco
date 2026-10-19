<script lang="ts">
  /**
   * The decisions as a graph, derived by the hub from the project's decision
   * pages: a card per decision where the person put it (or laid out by its
   * depth), an edge from each decision another names in `after`, routed
   * square from one card to the next, a labelled frame round each Section's
   * cards, on the project's graph canvas (ViewCanvas's Svelte Flow, its
   * zoom, tools and dots). The writer revises a page and the graph follows
   * it; the person's drags save their places on release, into each page's
   * artifact. A press on a card opens its page scrolled to it. Fitted to the
   * canvas once, and again when the cards come or go.
   */
  import "#lib/vendor-css/xyflow.css";
  import type { DecisionGraph as Graph } from "@cawco/core/decisions";
  import {
    Background,
    BackgroundVariant,
    type Edge,
    type Node,
    Panel,
    SvelteFlow,
  } from "@xyflow/svelte";
  import { onMount, untrack } from "svelte";
  import FlowZoomTracker from "#lib/components/features/flow/FlowZoomTracker.svelte";
  import { FIT, ZOOM } from "#lib/components/features/flow/fit.js";
  import WorkflowCanvasTools from "#lib/components/features/workflows/WorkflowCanvasTools.svelte";
  import { theme } from "#lib/theme.svelte.js";
  import DecisionEdge from "./DecisionEdge.svelte";
  import DecisionGroup from "./DecisionGroup.svelte";
  import DecisionNode from "./DecisionNode.svelte";

  let {
    graph,
    onopen,
    onplace,
  }: {
    graph: Graph;
    /** A card pressed: its page, opened at it. */
    onopen: (page: string, card: string) => void;
    /** Cards dragged: their new places, to save. */
    onplace: (places: { id: string; x: number; y: number }[]) => void;
  } = $props();

  const nodeTypes = { decision: DecisionNode, frame: DecisionGroup };
  const edgeTypes = { decision: DecisionEdge };
  const uid = $props.id();
  const marker = `decision-edge-${uid}`;
  /** A card's box, as the hub's layout assumes it. */
  const CARD = { width: 148, height: 56 };
  /** How far a group's frame stands off its cards. */
  const FRAME = 16;

  let nodes = $state.raw<Node[]>([]);
  let edges = $state.raw<Edge[]>([]);
  let zoom = $state(1);
  let mounted = $state(false);
  onMount(() => {
    mounted = true;
  });

  /** Each group's frame round its cards where they stand now. */
  const framesOf = (at: Map<string, { x: number; y: number }>): Node[] =>
    graph.groups.flatMap((group) => {
      const placed = group.cards.flatMap((id) => at.get(id) ?? []);
      if (placed.length === 0) {
        return [];
      }
      const x = Math.min(...placed.map((p) => p.x)) - FRAME;
      const y = Math.min(...placed.map((p) => p.y)) - FRAME;
      const width =
        Math.max(...placed.map((p) => p.x + CARD.width)) + FRAME - x;
      const height =
        Math.max(...placed.map((p) => p.y + CARD.height)) + FRAME - y;
      return [
        {
          id: `group:${group.id}`,
          type: "frame",
          position: { x, y },
          width,
          height,
          zIndex: -1,
          draggable: false,
          selectable: false,
          connectable: false,
          focusable: false,
          data: { name: group.name },
        },
      ];
    });

  // The cards and edges, drawn where they stand.
  $effect(() => {
    const at = new Map(
      graph.cards.map((card) => [card.id, { x: card.x, y: card.y }])
    );
    const before = new Map(untrack(() => nodes).map((node) => [node.id, node]));
    nodes = [
      ...framesOf(at),
      ...graph.cards.map((card) => ({
        id: card.id,
        type: "decision",
        position: { x: card.x, y: card.y },
        // A card keeps what Svelte Flow measured of it across a redraw.
        // Handed in unmeasured, it is drawn hidden, and its edges unhooked,
        // until measured again: every change to the graph blinked them all.
        ...(before.get(card.id)?.measured
          ? { measured: before.get(card.id)?.measured }
          : {}),
        connectable: false,
        selectable: false,
        data: {
          name: card.name,
          picked: card.picked,
          page: card.page,
          card: card.card,
        },
      })),
    ];
    edges = graph.edges.map(([from, to]) => {
      const a = at.get(from);
      const b = at.get(to);
      // Cards on one row meet side to side; else from the foot to the head.
      const across = !!a && !!b && Math.abs(a.y - b.y) < CARD.height;
      return {
        id: `${from}->${to}`,
        type: "decision",
        source: from,
        target: to,
        sourceHandle: across ? "out-right" : "out-bottom",
        targetHandle: across ? "in-left" : "in-top",
        selectable: false,
        focusable: false,
        data: { marker },
      };
    });
  });

  /** While a card is dragged, its group's frame follows it. */
  function follow() {
    const at = new Map(
      untrack(() => nodes)
        .filter((node) => node.type === "decision")
        .map((node) => [node.id, node.position])
    );
    nodes = [
      ...framesOf(at),
      ...nodes.filter((node) => node.type === "decision"),
    ];
  }
</script>

<section
  aria-label="Decision graph"
  class="relative min-h-c-decision-graph-min-h min-w-0 flex-auto overflow-hidden rounded-lg bg-surface-recess inset-ring inset-ring-border-hairline"
  data-slot="decision-graph"
>
  <svg aria-hidden="true" class="absolute size-0">
    <defs>
      <marker
        id={marker}
        markerHeight="8"
        markerWidth="8"
        orient="auto-start-reverse"
        refX="9"
        refY="5"
        viewBox="0 0 10 10"
      >
        <path class="fill-ink-muted" d="M0,0 L10,5 L0,10 z" />
      </marker>
    </defs>
  </svg>
  {#if mounted}
    <SvelteFlow
      colorMode={theme.current}
      deleteKey={null}
      {edgeTypes}
      elementsSelectable={false}
      fitView
      fitViewOptions={FIT}
      {...ZOOM}
      nodesConnectable={false}
      nodesDraggable
      {nodeTypes}
      onnodeclick={({ node }) => {
        const data = node.data as { card?: string; page?: string };
        if (node.type === "decision" && data.page && data.card) {
          onopen(data.page, data.card);
        }
      }}
      onnodedrag={follow}
      onnodedragstop={({ nodes: moved }) => {
        follow();
        onplace(
          moved
            .filter((node) => node.type === "decision")
            .map((node) => ({
              id: node.id,
              x: node.position.x,
              y: node.position.y,
            }))
        );
      }}
      panOnDrag
      bind:edges
      bind:nodes
    >
      <Background gap={16} size={1} variant={BackgroundVariant.Dots} />
      <FlowZoomTracker
        onZoomChange={(value) => {
          zoom = value;
        }}
      />
      <Panel position="bottom-center">
        <WorkflowCanvasTools
          onfit={() => undefined}
          onzoom={() => undefined}
          {zoom}
        />
      </Panel>
    </SvelteFlow>
  {/if}
</section>
