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
  import "#lib/vendor-css/xyflow.css";
  import { onMount, untrack } from "svelte";
  import { newId } from "#lib/cawco/id.js";
  import { numberOf } from "#lib/cawco/motion/curves.svelte.js";
  import { workflowState } from "#lib/cawco/workflow-state.svelte.js";
  import FlowAutoFit from "#lib/components/features/flow/FlowAutoFit.svelte";
  import FlowZoomTracker from "#lib/components/features/flow/FlowZoomTracker.svelte";
  import { FIT, ZOOM } from "#lib/components/features/flow/fit.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component group
  import * as ContextMenu from "#lib/components/ui/context-menu/index.js";
  import { IconChat } from "#lib/icons.js";
  import { theme } from "#lib/theme.svelte.js";
  import WorkflowCanvasTools from "./WorkflowCanvasTools.svelte";
  import WorkflowEdge from "./WorkflowEdge.svelte";
  import WorkflowNodeCard from "./WorkflowNodeCard.svelte";
  import { placeNodes, upstream } from "./workflow-ui";

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
  /**
   * The view is the person's own: they have panned or zoomed since the last
   * fit. Until then a change of the canvas's size fits the graph again.
   */
  let held = $state(false);
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
  /**
   * The least zoom a fit takes: a node's name (the label role) stays 10px,
   * so a fit goes down only that far and a larger graph is panned. The
   * reader's own zoom keeps the flow's range (`ZOOM`).
   */
  const READABLE_PX = 10;
  let floor = $state<number>(ZOOM.minZoom);
  let fitter = $state<ReturnType<typeof FlowAutoFit>>();
  /**
   * The gaps between nodes, in px: `space-5` across the flow (DESIGN.md Map
   * mode's neighbours), and along it the run an edge crosses, two `space-8`
   * (as the Canvas view's ranks stand, task-graph.ts), room for an edge's
   * Delete button clear of the dots at both its ends.
   */
  let gap = $state.raw({ across: 0, along: 0 });
  /** Each node's box as Svelte Flow measured it, by id. */
  let sizes = $state.raw(new Map<string, { width: number; height: number }>());
  onMount(() => {
    const root = getComputedStyle(document.documentElement);
    const label =
      Number.parseFloat(root.getPropertyValue("--text-label")) *
      Number.parseFloat(root.fontSize);
    floor =
      label > 0 ? Math.min(FIT.maxZoom, READABLE_PX / label) : ZOOM.minZoom;
    gap = { across: numberOf("--space-5"), along: numberOf("--space-8") * 2 };
    mounted = true;
  });
  const nameOf = (key: string | undefined) =>
    workflowState.workflows.find((entry) => entry.id === key)?.name;
  /** Where each node is drawn: its stored place, cleared of every other node. */
  const placed = $derived(
    placeNodes(
      graph.nodes,
      (id) => sizes.get(id) ?? { width: numberOf("--c-wf-node-w"), height: 0 },
      mounted ? gap : { across: 0, along: 0 }
    )
  );
  /** The placement as a key: a new one refits a view that is still a fit. */
  const layout = $derived(
    [...placed].map(([id, at]) => `${id}:${at.x},${at.y}`).join(" ")
  );
  // What Svelte Flow measured of each node, once it changes: a node's
  // height (its summary, its ports) decides what it must clear.
  $effect(() => {
    const measured = new Map(
      nodes.flatMap((node) =>
        node.measured?.width && node.measured.height
          ? [
              [
                node.id,
                { width: node.measured.width, height: node.measured.height },
              ] as const,
            ]
          : []
      )
    );
    const known = untrack(() => sizes);
    const same =
      measured.size === known.size &&
      [...measured].every(
        ([id, box]) =>
          known.get(id)?.width === box.width &&
          known.get(id)?.height === box.height
      );
    if (!same) {
      sizes = measured;
    }
  });
  $effect(() => {
    const before = new Map(untrack(() => nodes).map((node) => [node.id, node]));
    nodes = graph.nodes.map((node) => ({
      id: node.id,
      type: "workflow",
      position: placed.get(node.id) ?? node.position,
      // A node keeps what Svelte Flow measured of it across a rebuild.
      // Handed in unmeasured, it is drawn hidden until measured again: each
      // pick hid every node for a frame, and the node just picked, hidden
      // while it held focus, lost it.
      ...(before.get(node.id)?.measured
        ? { measured: before.get(node.id)?.measured }
        : {}),
      selected: selection === node.id,
      data: {
        node,
        problem: problems.find((problem) => problem.nodeId === node.id)
          ?.message,
        childName:
          node.kind === "workflow" ? nameOf(node.workflowId) : undefined,
      },
    }));
    edges = graph.edges.map((edge) => {
      return {
        id: edge.id,
        type: "workflow",
        source: edge.from.node,
        sourceHandle: edge.from.port,
        target: edge.to.node,
        selected: selection === edge.id,
        data: {
          /**
           * Another edge leaves the same node, from the next of its stacked
           * ports: their Delete buttons stand a port's pitch apart.
           */
          stacked: graph.edges.some(
            (other) =>
              other.id !== edge.id && other.from.node === edge.from.node
          ),
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
      };
    });
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
    {#snippet child({ props })}
      <!-- biome-ignore lint/a11y/noNoninteractiveElementInteractions: these are the kit menu trigger's own handlers (in `props`), narrowed to a node; the node's inspector is the keyboard path to the same actions -->
      <section
        {...props}
        aria-label="Workflow graph"
        class="h-full min-h-c-graph-canvas-min min-w-0 bg-surface-recess"
        data-slot="workflow-canvas"
        oncontextmenu={onNode(props.oncontextmenu)}
        onpointerdown={onNode(props.onpointerdown)}
        style:--hit-scale={zoom}
        style:--xy-handle-background-color="var(--neutral-8)"
        style:--xy-handle-border-color="var(--surface-raised)"
      >
        {#if mounted}
          <!-- The attribution stands at the top right: the canvas tools
               float at the bottom centre, and on a phone they run under
               the bottom corner. -->
          <SvelteFlow
            attributionPosition="top-right"
            colorMode={theme.current}
            deleteKey={null}
            {edgeTypes}
            fitView
            fitViewOptions={{ ...FIT, minZoom: floor }}
            {...ZOOM}
            nodesConnectable
            nodesDraggable={!pan}
            {nodeTypes}
            onconnect={connect}
            onedgeclick={({ edge }) => onselect(edge.id)}
            onmovestart={(event) => {
              // A move with no event behind it is a fit or a tool's glide.
              if (event) {
                held = true;
              }
            }}
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
            <FlowAutoFit
              bind:this={fitter}
              {held}
              {layout}
              minZoom={floor}
              nodeCount={graph.nodes.length}
            />
            <FlowZoomTracker
              onZoomChange={(value) => {
                zoom = value;
              }}
            />
            <Panel position="bottom-center"
              ><WorkflowCanvasTools
                {canRedo}
                {canUndo}
                fit={() => fitter?.fit()}
                onfit={() => {
                  held = false;
                }}
                onpan={() => {
                  pan = !pan;
                }}
                onzoom={() => {
                  held = true;
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
      what="Node">Copy content</ContextMenu.CopyItem
    >
    <ContextMenu.Item
      onSelect={() => {
        if (menuNode) {
          onselect(menuNode);
        }
      }}><IconChat /><span>Open inspector</span></ContextMenu.Item
    >
  </ContextMenu.Content>
</ContextMenu.Root>
