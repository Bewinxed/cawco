<script lang="ts">
  /**
   * The Canvas view (PRD §5.2): the project's tasks as the graph their files
   * draw — `after`, `parent`, `related`, `found_in` — on Svelte Flow, set up
   * as the workflow editor's canvas is (its fit, zoom, theme and tools).
   *
   * Only tasks that meet an edge are on it. dagre lays it out left to right
   * along `after` (task-graph.ts) from the cards' measured sizes; nothing is
   * placed by hand and nothing drags. A change to the tasks (`tasks.changed`
   * reaches the page, which reads them again) lays it out again: the cards
   * ease to their new places over --dur-panel on --ease-in-out, a new one
   * fades in where it lands, and the view refits when the count changes.
   * The first layout is drawn in place. A card opens its sheet.
   */
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
  import type { StageKind, TaskSummary } from "#lib/cawco/project-tasks.js";
  import FlowAutoFit from "#lib/components/features/flow/FlowAutoFit.svelte";
  import FlowZoomTracker from "#lib/components/features/flow/FlowZoomTracker.svelte";
  import { FIT, ZOOM } from "#lib/components/features/flow/fit.js";
  import WorkflowCanvasTools from "#lib/components/features/workflows/WorkflowCanvasTools.svelte";
  import { theme } from "#lib/theme.svelte.js";
  import TaskEdgeLine from "./canvas/TaskEdgeLine.svelte";
  import TaskNode from "./canvas/TaskNode.svelte";
  import { layoutTasks, taskEdges } from "./task-graph";

  let {
    tasks,
    hrefOf,
    kindOf,
    onopen,
  }: {
    tasks: TaskSummary[];
    hrefOf: (id: string) => string;
    kindOf: (id: string) => StageKind | null | undefined;
    onopen: (id: string) => void;
  } = $props();

  const nodeTypes = { task: TaskNode };
  const edgeTypes = { task: TaskEdgeLine };
  /** The arrow `after` edges end in: one marker per canvas, its own id. */
  const uid = $props.id();
  const marker = `task-after-${uid}`;

  const graphEdges = $derived(taskEdges(tasks));
  const inGraph = $derived(
    new Set(graphEdges.flatMap((edge) => [edge.source, edge.target]))
  );
  const graphTasks = $derived(tasks.filter((task) => inGraph.has(task.id)));

  let nodes = $state.raw<Node[]>([]);
  let edges = $state.raw<Edge[]>([]);
  let mounted = $state(false);
  let zoom = $state(1);
  /** The person has panned or zoomed since the last fit: the view is theirs. */
  let held = $state(false);
  /**
   * Each card's size as Svelte Flow measured it, by task: what the layout
   * places. Until a card is measured it is placed at the board column's
   * width and a two-line card's height.
   */
  let sizes = $state.raw<Record<string, { width: number; height: number }>>({});
  /** Every card on the canvas has been measured and placed: moves ease from here on. */
  const settled = $derived(
    graphTasks.length > 0 && graphTasks.every((task) => sizes[task.id])
  );
  const ESTIMATE = { width: 240, height: 64 };

  onMount(() => {
    mounted = true;
  });

  // The cards and edges, laid out from the tasks and their measured sizes.
  $effect(() => {
    const measured = sizes;
    const placed = layoutTasks(
      graphTasks.map((task) => task.id),
      graphEdges,
      (id) => measured[id] ?? ESTIMATE
    );
    const before = new Map(untrack(() => nodes).map((node) => [node.id, node]));
    nodes = graphTasks.map((task) => ({
      id: task.id,
      type: "task",
      position: placed.get(task.id) ?? { x: 0, y: 0 },
      // A card keeps what Svelte Flow measured of it across a layout.
      ...(before.get(task.id)?.measured
        ? { measured: before.get(task.id)?.measured }
        : {}),
      draggable: false,
      connectable: false,
      selectable: false,
      data: { task, href: hrefOf(task.id), kindOf, onopen },
    }));
    const kinds = new Map(tasks.map((task) => [task.id, task.kind]));
    edges = graphEdges.map((edge) => ({
      id: edge.id,
      type: "task",
      source: edge.source,
      target: edge.target,
      selectable: false,
      focusable: false,
      data: {
        kind: edge.kind,
        landed: kinds.get(edge.source) === "done",
        marker,
      },
    }));
  });

  // What Svelte Flow measured, into the layout's sizes: a card that changed
  // size is laid out again; one that did not leaves the layout as it is.
  $effect(() => {
    let changed = false;
    const next = { ...sizes };
    for (const node of nodes) {
      const width = node.measured?.width;
      const height = node.measured?.height;
      if (!(width && height)) {
        continue;
      }
      const was = next[node.id];
      if (
        !was ||
        Math.round(was.width) !== Math.round(width) ||
        Math.round(was.height) !== Math.round(height)
      ) {
        next[node.id] = { width, height };
        changed = true;
      }
    }
    if (changed) {
      sizes = next;
    }
  });
</script>

<section
  aria-label="Task graph"
  class="canvas"
  data-settled={settled || undefined}
>
  <!-- The arrow every `after` edge ends in, filled from the tokens. -->
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
      nodesDraggable={false}
      {nodeTypes}
      onmovestart={(event) => {
        // A move with no event behind it is a fit or a tool's glide.
        if (event) {
          held = true;
        }
      }}
      panOnDrag
      bind:edges
      bind:nodes
    >
      <Background gap={16} size={1} variant={BackgroundVariant.Dots} />
      <FlowAutoFit {held} nodeCount={graphTasks.length} />
      <FlowZoomTracker
        onZoomChange={(value) => {
          zoom = value;
        }}
      />
      <Panel position="bottom-center"
        ><WorkflowCanvasTools
          onfit={() => {
            held = false;
          }}
          onzoom={() => {
            held = true;
          }}
          {zoom}
        /></Panel
      >
    </SvelteFlow>
  {/if}
</section>

<style>
  .canvas {
    position: relative;
    block-size: 100%;
    min-block-size: 280px;
    min-inline-size: 0;
    border-radius: var(--radius-lg);
    overflow: hidden;
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
  /* Once placed, a card that the layout moves eases to its new place
     (movement on screen); a card new to the canvas fades in where it lands. */
  @media (prefers-reduced-motion: no-preference) {
    .canvas[data-settled] :global(.svelte-flow__node) {
      transition:
        transform var(--dur-panel) var(--ease-in-out),
        opacity var(--dur-fade) var(--ease-out);

      @starting-style {
        opacity: 0;
      }
    }
  }
</style>
