<script lang="ts">
  /**
   * The map as a graph, on Svelte Flow (the owner's rule: graph primitives
   * from Svelte Flow, never hand-drawn): each state machine a region with
   * its name as the header, its states as nodes laid out top to bottom by
   * dagre from the moves alone, the moves as thin rounded elbows with small
   * heads and a label chip on the line, the kept move's edge drawn stronger.
   *
   * The view is fitted once per component, then it is the person's: a
   * press on a state keeps it and moves nothing else (his pin: a press
   * zoomed to 100%). The kept state's pill glides to the state pressed.
   * Where the graph runs on past the view, the edges fade (`kit-edge-fade`).
   */
  import "#lib/vendor-css/xyflow.css";
  import {
    type Edge,
    type EdgeTypes,
    MarkerType,
    type Node,
    type NodeTypes,
    SvelteFlow,
  } from "@xyflow/svelte";
  import { untrack } from "svelte";
  import { frameSize } from "#lib/cawco/frame-observer.js";
  import { tokenLengths } from "#lib/cawco/token-lengths.js";
  import { ZOOM } from "#lib/components/features/flow/fit.js";
  import { theme } from "#lib/theme.svelte.js";
  import { type GraphComponent, layoutMap } from "./graph";
  import KeptNode from "./KeptNode.svelte";
  import MapView from "./MapView.svelte";
  import MoveEdge from "./MoveEdge.svelte";
  import RegionNode from "./RegionNode.svelte";
  import StateNode from "./StateNode.svelte";

  let {
    graph,
    kept,
    cameFrom,
    onkeep,
    onpreview,
  }: {
    graph: GraphComponent;
    kept: string;
    /** The state the kept one was reached from: its move's edge is drawn stronger. */
    cameFrom: string | null;
    onkeep: (id: string) => void;
    onpreview: (id: string | null) => void;
  } = $props();

  const nodeTypes = {
    state: StateNode,
    region: RegionNode,
    kept: KeptNode,
  } as unknown as NodeTypes;
  const edgeTypes = { move: MoveEdge } as unknown as EdgeTypes;

  /** The map's lengths, read off the tokens once it stands. */
  let root = $state<HTMLElement>();
  let lengths = $state<{
    gap: number;
    head: number;
    nodeH: number;
    nodeW: number;
    pad: number;
    rank: number;
    sep: number;
    top: number;
  } | null>(null);
  $effect(() => {
    const at = root;
    if (!at) {
      return;
    }
    const read = tokenLengths(at, {
      nodeW: "--c-graph-node-w",
      nodeH: "--c-graph-node-h",
      pad: "--space-5",
      head: "--space-8",
      headPad: "--space-2",
      gap: "--space-6",
      rank: "--space-8",
      sep: "--space-4",
      controls: "--c-btn-h",
      controlsPad: "--space-2",
    });
    const { headPad, controls, controlsPad, ...rest } = read;
    lengths = {
      ...rest,
      head: rest.head + headPad,
      top: controls + controlsPad * 3,
    };
  });

  const layout = $derived(
    lengths
      ? layoutMap(
          graph,
          () => ({
            width: lengths?.nodeW ?? 0,
            height: lengths?.nodeH ?? 0,
          }),
          lengths
        )
      : null
  );

  let nodes = $state.raw<Node[]>([]);
  let edges = $state.raw<Edge[]>([]);
  $effect(() => {
    if (!layout) {
      nodes = [];
      edges = [];
      return;
    }
    const regionNodes: Node[] = layout.regions.map((region) => ({
      id: `region:${region.machine}`,
      type: "region",
      position: { x: region.box.x, y: region.box.y },
      width: region.box.width,
      height: region.box.height,
      data: { machine: region.machine },
      draggable: false,
      selectable: false,
      focusable: false,
      zIndex: 0,
    }));
    const regionAt = new Map(
      layout.regions.map((region) => [region.machine, region.box])
    );
    const stateNodes: Node[] = graph.states.flatMap((state) => {
      const box = layout.states.get(state.id);
      if (!box) {
        return [];
      }
      return [
        {
          id: state.id,
          type: "state",
          parentId: `region:${state.machine}`,
          position: { x: box.x, y: box.y },
          data: { state, kept: state.id === kept, onkeep, onpreview },
          draggable: false,
          selectable: false,
          focusable: false,
          zIndex: 2,
        },
      ];
    });
    const keptBox = layout.states.get(kept);
    const keptRegion = keptBox ? regionAt.get(keptBox.machine) : undefined;
    const keptNodes: Node[] =
      keptBox && keptRegion
        ? [
            {
              id: "kept",
              type: "kept",
              position: {
                x: keptRegion.x + keptBox.x,
                y: keptRegion.y + keptBox.y,
              },
              data: {},
              class:
                "motion-safe:transition-transform motion-safe:duration-(--dur-morph) motion-safe:ease-drawer",
              draggable: false,
              selectable: false,
              focusable: false,
              zIndex: 1,
            },
          ]
        : [];
    // A node built again keeps the size Svelte Flow measured: one without it
    // stays hidden, since its box never changes size to be measured again.
    const measured = new Map(
      untrack(() => nodes).map((one) => [one.id, one.measured])
    );
    nodes = [...regionNodes, ...keptNodes, ...stateNodes].map((one) => ({
      ...one,
      measured: measured.get(one.id) ?? one.measured,
    }));
    edges = graph.moves.map((move) => {
      const strong = move.from === cameFrom && move.to === kept;
      const from = layout.states.get(move.from);
      const to = layout.states.get(move.to);
      const back =
        from !== undefined &&
        to !== undefined &&
        (regionAt.get(to.machine)?.y ?? 0) + to.y <
          (regionAt.get(from.machine)?.y ?? 0) + from.y;
      return {
        id: `${move.from}->${move.to}`,
        source: move.from,
        target: move.to,
        sourceHandle: back ? "back-out" : "out",
        targetHandle: back ? "back-in" : "in",
        type: "move",
        data: { kept: strong, label: move.label },
        selectable: false,
        focusable: false,
        zIndex: 1,
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 12,
          height: 12,
          color: strong ? "var(--ink-muted)" : "var(--border-control-strong)",
        },
      };
    });
  });

  /** The graph's size at zoom 1: its regions' column. */
  const bounds = $derived(
    layout && layout.regions.length > 0
      ? {
          width: Math.max(...layout.regions.map((one) => one.box.width)),
          height: Math.max(
            ...layout.regions.map((one) => one.box.y + one.box.height)
          ),
        }
      : null
  );
  let view = $state({ width: 0, height: 0 });
  /** Framed readable once per component; Fit frames it whole. */
  let framer = $state<MapView>();
  export function fit(): void {
    framer?.fit();
  }
</script>

<div
  data-slot="state-graph"
  class="absolute inset-0"
  style:--xy-edge-stroke="var(--border-control-strong)"
  style:--xy-edge-stroke-width="var(--c-graph-edge)"
  style:--xy-background-color="transparent"
  bind:this={root}
  {@attach frameSize<HTMLElement>((node) => {
    view = { width: node.clientWidth, height: node.clientHeight };
  })}
>
  {#key graph.file}
    <SvelteFlow
      colorMode={theme.current}
      deleteKey={null}
      elementsSelectable={false}
      {...ZOOM}
      nodesConnectable={false}
      nodesDraggable={false}
      nodesFocusable={false}
      {edgeTypes}
      {nodeTypes}
      panOnDrag
      panOnScroll
      proOptions={{ hideAttribution: true }}
      bind:edges
      bind:nodes
    >
      <MapView
        bind:this={framer}
        {bounds}
        framing={graph.file}
        least={0.85}
        top={lengths?.top ?? 0}
        {view}
      />
    </SvelteFlow>
  {/key}
</div>
