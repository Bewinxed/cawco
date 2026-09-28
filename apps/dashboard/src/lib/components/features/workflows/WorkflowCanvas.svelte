<script lang="ts">
  import type {
    Problem,
    WorkflowGraph,
    WorkflowRun,
    WorkflowStep,
  } from "@whiffle/core";
  import {
    Background,
    BackgroundVariant,
    type Connection,
    type Edge,
    type Node,
    Panel,
    SvelteFlow,
  } from "@xyflow/svelte";
  import "@xyflow/svelte/dist/style.css";
  import { onMount } from "svelte";
  import FlowAutoFit from "$lib/components/features/flow/FlowAutoFit.svelte";
  import FlowContextMenu from "$lib/components/features/flow/FlowContextMenu.svelte";
  import FlowZoomTracker from "$lib/components/features/flow/FlowZoomTracker.svelte";
  import { theme } from "$lib/theme.svelte";
  import { copyToClipboard } from "$lib/whiffle/copy";
  import { newId } from "$lib/whiffle/id";
  import { workflowState } from "$lib/whiffle/workflow-state.svelte";
  import type { JournalCheckpoint, JournalGraph } from "./journal-graph";
  import WorkflowCanvasTools from "./WorkflowCanvasTools.svelte";
  import WorkflowEdge from "./WorkflowEdge.svelte";
  import WorkflowNodeCard from "./WorkflowNodeCard.svelte";
  import { duration, upstream } from "./workflow-ui";

  let {
    graph,
    journal,
    checkpoints = {},
    selection,
    problems = [],
    readonly = false,
    run,
    steps = [],
    executionScope = "root",
    costs = {},
    now = Date.now(),
    onselect,
    onchange,
    undo,
    redo,
    canUndo = false,
    canRedo = false,
  }: {
    graph: WorkflowGraph;
    /** A code-origin run: the shape read back out of the effect journal. */
    journal?: JournalGraph;
    checkpoints?: Record<string, JournalCheckpoint[]>;
    selection?: string;
    problems?: Problem[];
    readonly?: boolean;
    run?: WorkflowRun;
    steps?: WorkflowStep[];
    executionScope?: string;
    costs?: Record<string, number>;
    now?: number;
    onselect: (id?: string) => void;
    onchange?: (graph: WorkflowGraph) => void;
    undo?: () => void;
    redo?: () => void;
    canUndo?: boolean;
    canRedo?: boolean;
  } = $props();
  const nodeTypes = { workflow: WorkflowNodeCard };
  const edgeTypes = { workflow: WorkflowEdge };
  let nodes = $state.raw<Node[]>([]);
  let edges = $state.raw<Edge[]>([]);
  let mounted = $state(false);
  let zoom = $state(1);
  let pan = $state(false);
  let menu = $state<{ x: number; y: number; id: string } | null>(null);
  onMount(() => {
    mounted = true;
  });
  /** What every node card shows about the step that ran on it, either origin. */
  function progress(id: string) {
    const step = steps.findLast((item) => item.nodeId === id);
    const child = step?.childRunId
      ? workflowState.runs[step.childRunId]
      : undefined;
    return {
      step,
      child,
      checkpoints: checkpoints[id],
      duration: step ? duration(step.startedAt, step.endedAt, now) : "",
      cost:
        step?.instanceId && costs[step.instanceId] !== undefined
          ? `$${costs[step.instanceId].toFixed(4)}`
          : "cost unreported",
    };
  }
  const nameOf = (key: string | undefined) =>
    workflowState.workflows.find((entry) => entry.id === key)?.name;
  $effect(() => {
    if (journal) {
      nodes = journal.nodes.map((entry) => {
        const state = progress(entry.id);
        return {
          id: entry.id,
          type: "workflow",
          position: entry.position,
          selected: selection === entry.id,
          data: {
            ...state,
            node: entry.node,
            journal: entry,
            childName: nameOf(state.child?.workflowId),
          },
        };
      });
      edges = journal.edges.map((edge) => ({
        id: edge.id,
        type: "workflow",
        source: edge.from,
        target: edge.to,
        data: { fired: true, label: "" },
      }));
      return;
    }
    nodes = graph.nodes.map((node) => {
      const state = progress(node.id);
      return {
        id: node.id,
        type: "workflow",
        position: node.position,
        selected: selection === node.id,
        data: {
          ...state,
          node,
          problem: problems.find((problem) => problem.nodeId === node.id)
            ?.message,
          childName:
            node.kind === "workflow"
              ? nameOf(node.workflowId)
              : nameOf(state.child?.workflowId),
        },
      };
    });
    edges = graph.edges.map((edge) => ({
      id: edge.id,
      type: "workflow",
      source: edge.from.node,
      sourceHandle: edge.from.port,
      target: edge.to.node,
      selected: selection === edge.id,
      data: {
        fired: run?.edges[executionScope]?.[edge.id] === "fired",
        label: [
          edge.when
            ? `${edge.when.path} ${edge.when.op} ${edge.when.value === undefined ? "" : JSON.stringify(edge.when.value)}`
            : "",
          edge.maxIterations
            ? `×${run ? `${run.loops[executionScope]?.[edge.id] ?? 0}/` : ""}${edge.maxIterations}`
            : "",
        ]
          .filter(Boolean)
          .join(" · "),
        remove: readonly ? undefined : remove,
      },
    }));
  });
  function remove(id: string) {
    onchange?.({
      ...graph,
      edges: graph.edges.filter((edge) => edge.id !== id),
    });
  }
  function connect(connection: Connection) {
    onchange?.({
      ...graph,
      edges: [
        ...graph.edges,
        {
          id: newId(),
          from: {
            node: connection.source,
            port: connection.sourceHandle ?? "out",
          },
          to: { node: connection.target },
          ...(upstream(graph, connection.source).some(
            (node) => node.id === connection.target
          )
            ? { maxIterations: 3 }
            : {}),
        },
      ],
    });
  }
</script>
<section aria-label="Workflow graph" class="canvas" style:--hit-scale={zoom}>
  {#if mounted}
    <SvelteFlow
      colorMode={theme.current}
      deleteKey={null}
      {edgeTypes}
      fitView
      maxZoom={2}
      minZoom={.15}
      nodesConnectable={!readonly}
      nodesDraggable={!(readonly || pan)}
      {nodeTypes}
      onconnect={connect}
      onedgeclick={({ edge }) => onselect(edge.id)}
      onnodeclick={({ node }) => onselect(node.id)}
      onnodecontextmenu={({ node, event }) => { event.preventDefault(); menu = { x: event.clientX, y: event.clientY, id: node.id }; }}
      onnodedragstop={() => onchange?.({ ...graph, nodes: graph.nodes.map((node) => ({ ...node, position: nodes.find((entry) => entry.id === node.id)?.position ?? node.position })) })}
      onpaneclick={() => onselect()}
      panOnDrag={pan || readonly ? true : [1, 2]}
      selectionOnDrag={!(pan || readonly)}
      snapGrid={[8, 8]}
      bind:edges
      bind:nodes
    >
      <Background gap={16} size={1} variant={BackgroundVariant.Dots} />
      <FlowAutoFit mode="fit" nodeCount={graph.nodes.length} {nodes} />
      <FlowZoomTracker nodes={[]} onZoomChange={(value) => { zoom = value; }} />
      <Panel position="bottom-center"
        ><WorkflowCanvasTools
          {canRedo}
          {canUndo}
          onpan={() => { pan = !pan; }}
          {pan}
          {readonly}
          {redo}
          {undo}
          {zoom}
        /></Panel
      >
    </SvelteFlow>
  {/if}
  {#if menu}
    <FlowContextMenu
      jumpLabel="Open inspector"
      onAction={(action) => { if (!menu) { return; } if (action === 'jump') { onselect(menu.id); } else { copyToClipboard('Node', JSON.stringify(graph.nodes.find((node) => node.id === menu?.id), null, 2)); } menu = null; }}
      onClose={() => { menu = null; }}
      x={menu.x}
      y={menu.y}
    />
  {/if}
</section>
<style>
  .canvas {
    height: 100%;
    min-height: 280px;
    min-width: 0;
    background: var(--surface-recess);
  }
  .canvas :global(.svelte-flow__handle) {
    background: var(--neutral-8);
    border-color: var(--surface-raised);
    width: 10px;
    height: 10px;
  }
  /* A handle is placed by its transform, so its press is colour, not scale. */
  .canvas :global(.svelte-flow__handle:active) {
    background: var(--brand-solid);
  }
  .canvas :global(.svelte-flow__attribution) {
    font-size: var(--text-meta);
  }
  .canvas :global(.svelte-flow__attribution a) {
    display: inline-flex;
    align-items: center;
    min-height: 24px;
  }
</style>
