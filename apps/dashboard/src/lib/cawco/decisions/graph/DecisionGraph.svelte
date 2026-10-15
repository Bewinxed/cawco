<script lang="ts">
  /**
   * The decisions as a graph (`decisions/decisions.json`): its cards where
   * the file places them, its edges routed square from one card to the
   * next, its groups as labelled frames round their cards, on the project's
   * graph canvas (ViewCanvas's Svelte Flow, its zoom, tools and dots). Caw
   * edits the file and the graph follows it; the person's drags save their
   * places to it on release. A press on a card opens its page scrolled to
   * it. Fitted to the canvas once, and again when the cards come or go.
   */
  import type { DecisionGraph as Graph } from "@cawco/core/decisions";
  import {
    Background,
    BackgroundVariant,
    type Edge,
    type Node,
    Panel,
    SvelteFlow,
  } from "@xyflow/svelte";
  import "@xyflow/svelte/dist/style.css";
  import "#lib/components/features/workflows/workflows.css";
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
  /** A card's box, as the file's places assume it. */
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

  // The file's cards and edges, drawn where it places them.
  $effect(() => {
    const at = new Map(
      graph.cards.map((card) => [card.id, { x: card.x, y: card.y }])
    );
    nodes = [
      ...framesOf(at),
      ...graph.cards.map((card) => ({
        id: card.id,
        type: "decision",
        position: { x: card.x, y: card.y },
        connectable: false,
        selectable: false,
        data: {
          name: card.name,
          picked: card.picked === true,
          page: card.page,
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

<section aria-label="Decision graph" class="graph">
  <svg aria-hidden="true" class="defs">
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
        <path class="arrow" d="M0,0 L10,5 L0,10 z" />
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
        const data = node.data as { page?: string };
        if (node.type === "decision" && data.page) {
          onopen(data.page, node.id);
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

<style>
  .graph {
    position: relative;
    flex: 1 1 auto;
    min-block-size: 24rem;
    min-inline-size: 0;
    overflow: hidden;
    border-radius: var(--radius-lg);
    background: var(--surface-recess);
    box-shadow: inset 0 0 0 1px var(--border-hairline);
  }
  .defs {
    position: absolute;
    inline-size: 0;
    block-size: 0;
  }
  .arrow {
    fill: var(--ink-muted);
  }
  /* A card new to the graph fades up where it lands. */
  @media (prefers-reduced-motion: no-preference) {
    .graph :global(.svelte-flow__node-decision) {
      transition: opacity var(--dur-fade) var(--ease-out);

      @starting-style {
        opacity: 0;
      }
    }
  }
</style>
