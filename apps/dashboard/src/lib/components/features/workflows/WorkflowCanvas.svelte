<script lang="ts">
  /**
   * The workflow editor's graph. It is only ever edited here: a run is
   * watched in its own tab (WorkflowRunView), as a session is.
   */
  import type { Problem, WorkflowGraph } from "@cawco/core";
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
  import { newId } from "#lib/cawco/id.js";
  import { workflowState } from "#lib/cawco/workflow-state.svelte.js";
  import FlowAutoFit from "#lib/components/features/flow/FlowAutoFit.svelte";
  import FlowZoomTracker from "#lib/components/features/flow/FlowZoomTracker.svelte";
  import { FIT } from "#lib/components/features/flow/fit.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component group
  import * as ContextMenu from "#lib/components/ui/context-menu/index.js";
  import { IconChat } from "#lib/icons.js";
  import { theme } from "#lib/theme.svelte.js";
  import WorkflowCanvasTools from "./WorkflowCanvasTools.svelte";
  import WorkflowEdge from "./WorkflowEdge.svelte";
  import WorkflowNodeCard from "./WorkflowNodeCard.svelte";
  import { upstream } from "./workflow-ui";

  let {
    graph,
    selection,
    problems = [],
    onselect,
    onchange,
    undo,
    redo,
    canUndo = false,
    canRedo = false,
  }: {
    graph: WorkflowGraph;
    selection?: string;
    problems?: Problem[];
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
  /** The node a right-click (or a long press) opened the menu on. */
  let menuNode = $state<string | null>(null);
  const menuTarget = $derived(
    nodes.find((entry) => entry.id === menuNode)?.data.node
  );
  /**
   * The menu's trigger handler (a right-click, a long press), run only for
   * an event on a node, which it records first.
   */
  function onNode(handler: unknown) {
    return (event: Event) => {
      const at = (event.target as Element).closest<HTMLElement>(
        ".svelte-flow__node"
      );
      if (at?.dataset.id) {
        menuNode = at.dataset.id;
        (handler as (event: Event) => void)(event);
      }
    };
  }
  onMount(() => {
    mounted = true;
  });
  const nameOf = (key: string | undefined) =>
    workflowState.workflows.find((entry) => entry.id === key)?.name;
  $effect(() => {
    nodes = graph.nodes.map((node) => ({
      id: node.id,
      type: "workflow",
      position: node.position,
      selected: selection === node.id,
      data: {
        node,
        problem: problems.find((problem) => problem.nodeId === node.id)
          ?.message,
        childName:
          node.kind === "workflow" ? nameOf(node.workflowId) : undefined,
      },
    }));
    edges = graph.edges.map((edge) => ({
      id: edge.id,
      type: "workflow",
      source: edge.from.node,
      sourceHandle: edge.from.port,
      target: edge.to.node,
      selected: selection === edge.id,
      data: {
        label: [
          edge.when
            ? `${edge.when.path} ${edge.when.op} ${edge.when.value === undefined ? "" : JSON.stringify(edge.when.value)}`
            : "",
          edge.maxIterations ? `×${edge.maxIterations}` : "",
        ]
          .filter(Boolean)
          .join(" · "),
        remove,
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
<!-- The kit menu, popping from the pointer. It opens on a node only: the
     pane and the edges keep the browser's own menu. -->
<ContextMenu.Root
  onOpenChange={(open) => {
    if (!open) {
      menuNode = null;
    }
  }}
>
  <ContextMenu.Trigger>
    {#snippet child({
      props,
    })}
      <!-- biome-ignore lint/a11y/noNoninteractiveElementInteractions: these are the kit menu trigger's own handlers (in `props`), narrowed to a node; the node's inspector is the keyboard path to the same actions -->
      <section
        {...props}
        aria-label="Workflow graph"
        class="canvas"
        oncontextmenu={onNode(props.oncontextmenu)}
        onpointerdown={onNode(props.onpointerdown)}
        style:--hit-scale={zoom}
      >
        {#if mounted}
          <SvelteFlow
            colorMode={theme.current}
            deleteKey={null}
            {edgeTypes}
            fitView
            fitViewOptions={FIT}
            maxZoom={2}
            minZoom={0.15}
            nodesConnectable
            nodesDraggable={!pan}
            {nodeTypes}
            onconnect={connect}
            onedgeclick={({ edge }) => onselect(edge.id)}
            onnodeclick={({ node }) => onselect(node.id)}
            onnodedragstop={() =>
              onchange?.({
                ...graph,
                nodes: graph.nodes.map((node) => ({
                  ...node,
                  position:
                    nodes.find((entry) => entry.id === node.id)?.position ??
                    node.position,
                })),
              })}
            onpaneclick={() => onselect()}
            panOnDrag={pan ? true : [1, 2]}
            selectionOnDrag={!pan}
            snapGrid={[8, 8]}
            bind:edges
            bind:nodes
          >
            <Background gap={16} size={1} variant={BackgroundVariant.Dots} />
            <FlowAutoFit nodeCount={graph.nodes.length} />
            <FlowZoomTracker
              onZoomChange={(value) => {
                zoom = value;
              }}
            />
            <Panel position="bottom-center"
              ><WorkflowCanvasTools
                {canRedo}
                {canUndo}
                onpan={() => {
                  pan = !pan;
                }}
                {pan}
                {redo}
                {undo}
                {zoom}
              /></Panel
            >
          </SvelteFlow>
        {/if}
      </section>
    {/snippet}
  </ContextMenu.Trigger>
  <ContextMenu.Content aria-label="Node actions">
    <ContextMenu.CopyItem
      text={JSON.stringify(menuTarget ?? null, null, 2)}
      what="Node"
      >Copy content</ContextMenu.CopyItem
    >
    <ContextMenu.Item
      onSelect={() => {
        if (menuNode) {
          onselect(menuNode);
        }
      }}
      ><IconChat />Open inspector</ContextMenu.Item
    >
  </ContextMenu.Content>
</ContextMenu.Root>
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
    font-weight: var(--weight-body);
  }
  .canvas :global(.svelte-flow__attribution a) {
    display: inline-flex;
    align-items: center;
    min-height: 24px;
  }
</style>
