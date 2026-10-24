<script lang="ts">
  /**
   * A workflow's shape, drawn as the Canvas view draws the task graph: Svelte
   * Flow, laid out by dagre along `after` (views/task-graph `layoutTasks`)
   * from the nodes' measured sizes, framed by the task canvas's fit
   * (TaskCanvasFit), on the canvas's recess with its dots and tools. Read-only:
   * nothing is placed by hand here. In a run each step is lit by its work
   * item's state (`lit`).
   */
  import {
    Background,
    BackgroundVariant,
    type Edge,
    type Node,
    Panel,
    SvelteFlow,
  } from "@xyflow/svelte";
  import "#lib/vendor-css/xyflow.css";
  import { onMount, type Snippet, untrack } from "svelte";
  import TaskCanvasFit from "#lib/cawco/views/canvas/TaskCanvasFit.svelte";
  import { layoutTasks, type TaskEdge } from "#lib/cawco/views/task-graph.js";
  import FlowCanvasTools from "#lib/components/features/flow/FlowCanvasTools.svelte";
  import { ZOOM } from "#lib/components/features/flow/fit.js";
  import { theme } from "#lib/theme.svelte.js";
  import { type Lit, STEPS, type Step } from "./release";
  import WfShapeEdge from "./WfShapeEdge.svelte";
  import WfShapeNode from "./WfShapeNode.svelte";

  let {
    label,
    lit = null,
    selected = null,
    start = false,
    compact = false,
    flow = "TB",
    tools = true,
    editing = false,
    panel,
  }: {
    label: string;
    /** A run's states, joined on each step's id. */
    lit?: Lit[] | null;
    /** The node the inspector holds. */
    selected?: string | null;
    /** The run's start node leads (option C's canvas). */
    start?: boolean;
    /** A phone's node: the short title. */
    compact?: boolean;
    flow?: "LR" | "TB";
    /** The canvas's zoom and fit tools at its foot. */
    tools?: boolean;
    /** Edited (option C): the tools add the pan / select switch and undo. */
    editing?: boolean;
    /** What else stands on the canvas (C's node tray). */
    panel?: Snippet;
  } = $props();

  const nodeTypes = { step: WfShapeNode };
  const edgeTypes = { step: WfShapeEdge };
  const uid = $props.id();
  const marker = `wf-after-${uid}`;
  const START = "start";

  const graph = $derived.by(() => {
    const edges: (TaskEdge & { decides?: string })[] = [];
    for (const step of STEPS) {
      for (const n of step.after) {
        const from = STEPS[n - 1];
        if (from) {
          edges.push({
            id: `${from.id}:${step.id}`,
            kind: "after",
            source: from.id,
            target: step.id,
            decides: step.when ? "if beta" : undefined,
          });
        }
      }
      if (start && step.after.length === 0) {
        edges.push({
          id: `${START}:${step.id}`,
          kind: "after",
          source: START,
          target: step.id,
        });
      }
    }
    return edges;
  });
  const ids = $derived([...(start ? [START] : []), ...STEPS.map((s) => s.id)]);

  let nodes = $state.raw<Node[]>([]);
  let edges = $state.raw<Edge[]>([]);
  let mounted = $state(false);
  let sizes = $state.raw<Record<string, { width: number; height: number }>>({});
  const settled = $derived(ids.every((id) => sizes[id]));
  const ESTIMATE = { width: 148, height: 72 };

  onMount(() => {
    mounted = true;
  });

  const litOf = (id: string): Lit | null =>
    lit?.find((one) => one.step === id) ?? null;
  const stepOf = (id: string): Step | null =>
    STEPS.find((step) => step.id === id) ?? null;

  $effect(() => {
    const measured = sizes;
    const placed = layoutTasks(
      ids,
      graph,
      (id) => measured[id] ?? ESTIMATE,
      flow
    );
    const before = new Map(untrack(() => nodes).map((node) => [node.id, node]));
    nodes = ids.map((id) => ({
      id,
      type: "step",
      position: placed.get(id) ?? { x: 0, y: 0 },
      ...(before.get(id)?.measured
        ? { measured: before.get(id)?.measured }
        : {}),
      draggable: false,
      connectable: false,
      selectable: false,
      data: {
        step: stepOf(id),
        lit: litOf(id),
        selected: selected === id,
        flow,
        compact,
      },
    }));
    edges = graph.map((edge) => ({
      id: edge.id,
      type: "step",
      source: edge.source,
      target: edge.target,
      sourceHandle: "flow-out",
      targetHandle: "flow-in",
      selectable: false,
      focusable: false,
      data: {
        kind: edge.decides ? "decides" : "fixed",
        sentence: edge.decides,
        landed: litOf(edge.source)?.status === "done",
        marker,
      },
    }));
  });

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

  let fitter = $state<ReturnType<typeof TaskCanvasFit>>();
</script>

<section
  aria-label={label}
  class="relative h-full min-h-c-canvas-min-h min-w-0 overflow-hidden rounded-lg bg-surface-recess inset-ring inset-ring-border-hairline"
  data-slot="wf-shape"
>
  <svg aria-hidden="true" class="absolute h-0 w-0">
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
      {...ZOOM}
      nodesConnectable={false}
      nodesDraggable={false}
      {nodeTypes}
      panOnDrag
      bind:edges
      bind:nodes
    >
      <Background gap={16} size={1} variant={BackgroundVariant.Dots} />
      <TaskCanvasFit
        direction={flow}
        floor={0.6}
        held={false}
        nodeCount={ids.length}
        ready={settled}
        bind:this={fitter}
      />
      {#if tools}
        <Panel position="bottom-center"
          ><FlowCanvasTools
            fit={() => fitter?.frame(true)}
            onfit={() => undefined}
            onpan={editing ? () => undefined : undefined}
            onzoom={() => undefined}
            pan={editing ? false : undefined}
            redo={editing ? () => undefined : undefined}
            undo={editing ? () => undefined : undefined}
            canUndo={editing}
            zoom={1}
          /></Panel
        >
      {/if}
      {@render panel?.()}
    </SvelteFlow>
  {/if}
</section>
