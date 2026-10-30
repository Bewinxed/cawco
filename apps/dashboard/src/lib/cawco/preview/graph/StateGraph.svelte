<script lang="ts">
  /**
   * One component's design graph (Projects spec §5.10; the primitives spec
   * §1.3), drawn by Svelte Flow (the owner: "graph primitives come from
   * Svelte Flow, not hand-rolled ones"): each state machine a parent node
   * (MachineNode), its states child nodes inside it (StateNode) with their
   * variations as chips, the moves and the agent's edges one custom edge on
   * Svelte Flow's smooth-step path (MoveEdge). Laid out by dagre from the
   * moves alone (graph-layout), at the sizes Svelte Flow measured: each
   * machine's states inside it, then the machines as boxes led one into
   * another. A hover, or a held press under a finger, previews a state on
   * the page; a press or Enter keeps it; in Comment mode a press pins the
   * state as a whole. Drag pans; ⌘ or Ctrl with the wheel, or a pinch,
   * zooms; the zoom group's buttons and Fit all are Svelte Flow's own. An
   * edge fade says where the graph runs on past the view (pin 30).
   */
  import "#lib/vendor-css/xyflow.css";
  import type {
    Machine,
    SectionGraph,
    StagePoint,
  } from "@cawco/core/design-graph";
  import { type Edge, MarkerType, type Node, SvelteFlow } from "@xyflow/svelte";
  import { untrack } from "svelte";
  import { dur, numberOf } from "#lib/cawco/motion/curves.svelte.js";
  import FlowAutoFit from "#lib/components/features/flow/FlowAutoFit.svelte";
  import FlowZoomTracker from "#lib/components/features/flow/FlowZoomTracker.svelte";
  import { FIT } from "#lib/components/features/flow/fit.js";
  import { theme } from "#lib/theme.svelte.js";
  import GraphView from "./GraphView.svelte";
  import { fitted, regions } from "./graph-layout";
  import MachineNode, { type MachineNodeData } from "./MachineNode.svelte";
  import MoveEdge, { type MoveEdgeData } from "./MoveEdge.svelte";
  import { graphOptions } from "./options.svelte";
  import StateNode, {
    type NodeHand,
    type NodePin,
    type StateNodeData,
  } from "./StateNode.svelte";

  interface Props {
    /** Comment mode: a press on a state pins it as a whole (`onpin`), never keeps it. */
    commenting?: boolean;
    /** The graph stands in a narrow pane's drawer (a phone, a tablet): where call 9's band may name its section. */
    drawer?: boolean;
    file: string;
    graph: SectionGraph;
    /** The well's height the person gave it by the panel's foot; null is its own, up to the panel's room. */
    height?: number | null;
    kept: StagePoint | null;
    /** A press kept a state. */
    onkeep: (point: StagePoint) => void;
    /** A node pin's pill pressed: its thread opens. */
    onopenpin?: (id: string) => void;
    /** In Comment mode, a press on a state: a pin on the state as a whole. */
    onpin?: (point: StagePoint) => void;
    /** A hover or a held press previews a state; null lets it go. */
    onpreview: (point: StagePoint | null) => void;
    peek: StagePoint | null;
    /** The pins placed on each story's node, by story. */
    pins?: Map<string, NodePin[]>;
    /** The section's name: the slab of its own stories is its tab's, so it is said only to a reader. */
    sectionName: string;
    /** The zoom, the panel's group shows. */
    zoom?: number;
  }

  let {
    commenting = false,
    drawer = false,
    file,
    graph,
    height = null,
    kept,
    onkeep,
    onopenpin,
    onpin,
    onpreview,
    peek,
    pins = new Map(),
    sectionName,
    zoom = $bindable(1),
  }: Props = $props();

  /** The least zoom Fit all takes: a state's name stays readable (the r24 ruling's floor). */
  const ZOOM_FLOOR = 0.5;
  /** The least zoom the graph opens and refits at: the kept state's machine held between 0.75 and 1 (the r24 ruling), then panned to the kept state. */
  const ZOOM_OPEN_FLOOR = 0.75;
  const ZOOM_MOST = 1.6;
  const nodeTypes = { machine: MachineNode, state: StateNode };
  const edgeTypes = { move: MoveEdge };
  const machineId = (id: string) => `m:${id}`;
  const stateId = (story: string) => `s:${story}`;

  /** The state a point stands in: its node's story, where the point is a chip of it. */
  const stateHolding = (point: StagePoint | null): string | null => {
    if (!point || point.file !== file) {
      return null;
    }
    for (const machine of graph.machines) {
      for (const state of machine.states) {
        if (
          state.story === point.story ||
          state.variations.some((one) => one.story === point.story)
        ) {
          return state.story;
        }
      }
    }
    return null;
  };
  const keptState = $derived(stateHolding(kept));
  const peekState = $derived(stateHolding(peek));
  const keptMachine = $derived(
    graph.machines.find((one) =>
      one.states.some((state) => state.story === keptState)
    )?.id ?? null
  );

  /** The link drawn strong: the move into the kept state. */
  const litLink = (machine: Machine, link: { from: string; to: string }) =>
    machine.id === keptMachine &&
    link.to === keptState &&
    kept?.interaction === "rest" &&
    (graph.links.get(machine.id) ?? []).some(
      (one) =>
        one.kind === "move" && one.from === link.from && one.to === link.to
    );

  /* --- The hand: hover previews, a held press previews, a press keeps --- */

  /** A press under a finger or a pen: held, it previews until it lifts; dragged past this, it was a pan. */
  const SLOP = 10;
  let held: {
    id: number;
    x: number;
    y: number;
    shown: boolean;
    dead: boolean;
    timer: ReturnType<typeof setTimeout>;
  } | null = null;
  /** The click a held press or a pan ends in keeps nothing. */
  let swallow = false;

  const release = (event: PointerEvent) => {
    if (!held || event.pointerId !== held.id) {
      return;
    }
    clearTimeout(held.timer);
    swallow = held.shown || held.dead;
    if (held.shown) {
      onpreview(null);
    }
    held = null;
  };
  const travel = (event: PointerEvent) => {
    if (
      !held ||
      event.pointerId !== held.id ||
      held.dead ||
      Math.hypot(event.clientX - held.x, event.clientY - held.y) <= SLOP
    ) {
      return;
    }
    held.dead = true;
    clearTimeout(held.timer);
    if (held.shown) {
      held.shown = false;
      onpreview(null);
    }
  };

  const hand: NodeHand = {
    down: (event, point) => {
      swallow = false;
      if (event.pointerType === "mouse" || commenting) {
        return;
      }
      const one = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        shown: false,
        dead: false,
        timer: setTimeout(() => {
          one.shown = true;
          onpreview(point);
        }, dur("--dur-press-hold")),
      };
      held = one;
    },
    press: (event, point) => {
      event.stopPropagation();
      if (swallow) {
        swallow = false;
        return;
      }
      if (commenting) {
        onpin?.(point);
        return;
      }
      onkeep(point);
    },
    hover: (event, point) => {
      // A finger never hovers; a mouse, a trackpad or a hovering pen does.
      if (event.pointerType !== "touch") {
        onpreview(point);
      }
    },
    key: (point) => (commenting ? onpin?.(point) : onkeep(point)),
    openPin: (id) => onopenpin?.(id),
  };

  /* --- Layout: measured by Svelte Flow, placed by dagre -------------------- */

  /** Each state's size as Svelte Flow measured it; until then its width and a row's guess. */
  let sizes = $state.raw(new Map<string, { h: number; w: number }>());
  let room = $state.raw({ w: 0, h: 0 });
  /** Whether every state has been measured: until then the graph stands unseen, so nothing jumps. */
  const laidOut = $derived(
    graph.machines.every((machine) =>
      machine.states.every((state) => sizes.has(stateId(state.story)))
    )
  );

  /** Each machine's states laid out inside it, then the machines as boxes; a machine's padding round its states. */
  const layout = $derived.by(() => {
    const pad = numberOf("--space-2");
    const margin = numberOf("--space-3");
    const guess = {
      w: numberOf("--c-graph-node-w"),
      h: 2 * numberOf("--c-row-h"),
    };
    const across = Math.max(room.w - 2 * margin - 2 * pad, guess.w);
    const inner = new Map<string, ReturnType<typeof fitted>>();
    for (const machine of graph.machines) {
      const items = machine.states.map((state) => ({
        id: stateId(state.story),
        ...(sizes.get(stateId(state.story)) ?? guess),
      }));
      const links = (graph.links.get(machine.id) ?? []).map(
        (one) => [stateId(one.from), stateId(one.to)] as [string, string]
      );
      inner.set(machine.id, fitted(items, links, across));
    }
    const outer = regions(
      graph.machines.map((machine) => ({
        id: machineId(machine.id),
        w: Math.ceil((inner.get(machine.id)?.w ?? 0) + 2 * pad),
        h: Math.ceil((inner.get(machine.id)?.h ?? 0) + 2 * pad),
      })),
      graph.between.map(
        ([a, b]) => [machineId(a), machineId(b)] as [string, string]
      ),
      Math.max(room.w, guess.w),
      margin
    );
    return { inner, outer, pad };
  });

  let nodes = $state.raw<Node[]>([]);
  let edges = $state.raw<Edge[]>([]);

  // The nodes: machines first (Svelte Flow: "Parents have to appear before their child nodes"), then their states.
  $effect(() => {
    const { inner, outer, pad } = layout;
    const measured = new Map(
      untrack(() => nodes).map((one) => [one.id, one.measured])
    );
    const pillAt = graphOptions.sides.nodePill;
    const parents: Node[] = graph.machines.map((machine) => {
      const id = machineId(machine.id);
      const box = outer.boxes.get(id) ?? { x: 0, y: 0 };
      const own = inner.get(machine.id);
      return {
        id,
        type: "machine",
        position: box,
        width: Math.ceil((own?.w ?? 0) + 2 * pad),
        height: Math.ceil((own?.h ?? 0) + 2 * pad),
        draggable: false,
        selectable: false,
        focusable: false,
        data: {
          name: machine.name ?? sectionName,
          kept: machine.id === keptMachine,
          dir: outer.dir,
        } satisfies MachineNodeData,
      };
    });
    const children: Node[] = graph.machines.flatMap((machine) => {
      const own = inner.get(machine.id);
      return machine.states.map((state) => {
        const id = stateId(state.story);
        const at = own?.boxes.get(id) ?? { x: 0, y: 0 };
        return {
          id,
          type: "state",
          parentId: machineId(machine.id),
          extent: "parent" as const,
          position: { x: at.x + pad, y: at.y + pad },
          draggable: false,
          selectable: false,
          focusable: false,
          measured: measured.get(id),
          data: {
            state,
            file,
            dir: own?.dir ?? "LR",
            hand,
            kept,
            peek,
            keptHere: keptState === state.story,
            peekHere: peekState === state.story && keptState !== state.story,
            pins: pins.get(state.story) ?? [],
            pillAt,
          } satisfies StateNodeData,
        };
      });
    });
    nodes = [...parents, ...children];
  });

  // The edges: each machine's moves and the agent's edges, then the links between machines.
  $effect(() => {
    const head = (lit: boolean) => ({
      type: MarkerType.Arrow,
      color: lit ? "var(--c-graph-edge-chosen)" : "var(--c-graph-edge-ink)",
      width: numberOf("--c-edge-head-leg"),
      height: numberOf("--c-edge-head-leg"),
      strokeWidth: 1,
    });
    edges = [
      ...graph.machines.flatMap((machine) =>
        (graph.links.get(machine.id) ?? []).map((link) => {
          const lit = litLink(machine, link);
          return {
            id: `${link.from}>${link.to}`,
            type: "move",
            source: stateId(link.from),
            target: stateId(link.to),
            sourceHandle: "out",
            targetHandle: "in",
            selectable: false,
            focusable: false,
            markerEnd: head(lit),
            zIndex: 1,
            data: {
              kind: link.kind,
              label: link.label,
              lit,
            } satisfies MoveEdgeData,
          };
        })
      ),
      ...graph.between.map(([a, b]) => ({
        id: `${machineId(a)}>${machineId(b)}`,
        type: "move",
        source: machineId(a),
        target: machineId(b),
        sourceHandle: "out",
        targetHandle: "in",
        selectable: false,
        focusable: false,
        data: {
          kind: "between",
          label: null,
          lit: false,
        } satisfies MoveEdgeData,
      })),
    ];
  });

  /** The placement as a key: a change refits in place while the view is still a fit (FlowAutoFit). */
  const layoutKey = $derived(
    [...layout.outer.boxes].map(([id, p]) => `${id}:${p.x},${p.y}`).join("|")
  );
  /** The person panned or zoomed: the view is theirs. */
  let own = $state(false);

  let view = $state<ReturnType<typeof GraphView>>();
  export function zoomIn(): void {
    own = true;
    view?.zoomIn();
  }
  export function zoomOut(): void {
    own = true;
    view?.zoomOut();
  }
  export function fit(): void {
    own = false;
    view?.fit();
  }

  /** Where the graph runs on past the view, and the machine its top stands in. */
  let fades = $state({
    top: false,
    foot: false,
    pinned: null as string | null,
  });
  const pinnedName = $derived.by(() => {
    if (!fades.pinned) {
      return null;
    }
    const machine = graph.machines.find(
      (one) => machineId(one.id) === fades.pinned
    );
    return machine ? (machine.name ?? sectionName) : null;
  });
  /** The section named over a phone's graph (call 9): a slab's name while its top has scrolled out, or a band always naming the one in view. */
  const band = $derived.by(() => {
    if (!drawer || graphOptions.sides.phoneBand === "pinned") {
      return pinnedName;
    }
    const [first] = graph.machines;
    return pinnedName ?? (first ? (first.name ?? sectionName) : null);
  });
</script>

<div
  class={[
    "relative min-h-0 overflow-clip rounded-sm border border-border-well bg-surface-well",
    (fades.top || fades.foot) && "graph-edge-fade",
    // A drawer's face gives the well its room; a desk's panel holds it at the drawer's first stop until the person sizes it.
    height === null && (drawer ? "flex-1" : "h-c-graph-drawer-stop flex-none"),
    height !== null && "h-(--graph-h) flex-none",
  ]}
  data-commenting={commenting || undefined}
  data-design-graph={file}
  data-laid={laidOut || undefined}
  data-zoom={zoom}
  style:--xy-background-color="transparent"
  style:--graph-fade-foot={fades.foot ? "var(--c-edge-fade-len)" : undefined}
  style:--graph-fade-foot-end={fades.foot ? "transparent" : undefined}
  style:--graph-fade-top={fades.top ? "var(--c-edge-fade-len)" : undefined}
  style:--graph-fade-top-end={fades.top ? "transparent" : undefined}
  style:--graph-h={height === null ? undefined : `${height}px`}
  onpointermove={travel}
  onpointerup={release}
  onpointercancel={release}
>
  <div
    class="size-full opacity-0 transition-opacity duration-(--dur-fade) ease-out in-data-laid:opacity-100"
  >
    <SvelteFlow
      colorMode={theme.current}
      deleteKey={null}
      {edgeTypes}
      elementsSelectable={false}
      fitView
      fitViewOptions={{ ...FIT, minZoom: ZOOM_OPEN_FLOOR }}
      maxZoom={ZOOM_MOST}
      minZoom={ZOOM_FLOOR}
      nodesConnectable={false}
      nodesDraggable={false}
      nodesFocusable={false}
      {nodeTypes}
      proOptions={{ hideAttribution: true }}
      onmoveend={(event) => {
        if (event) {
          own = true;
        }
      }}
      onpaneclick={() => onpreview(null)}
      panOnDrag
      panOnScroll
      zoomOnScroll={false}
      bind:edges
      bind:nodes
    >
      <FlowZoomTracker
        onZoomChange={(value) => {
          zoom = value;
        }}
      />
      <FlowAutoFit
        held={own}
        layout={layoutKey}
        minZoom={ZOOM_OPEN_FLOOR}
        nodeCount={nodes.length}
      />
      <GraphView
        bind:this={view}
        keptNode={keptState === null ? null : stateId(keptState)}
        layout={laidOut ? layoutKey : ""}
        minZoom={ZOOM_FLOOR}
        onfades={(next) => {
          fades = next;
        }}
        onmeasured={(next) => {
          const same =
            next.size === sizes.size &&
            [...next].every(([id, size]) => {
              const had = sizes.get(id);
              return (
                had &&
                Math.abs(had.w - size.w) < 1 &&
                Math.abs(had.h - size.h) < 1
              );
            });
          if (!same) {
            sizes = next;
          }
        }}
        onroom={(next) => {
          if (
            Math.abs(next.w - room.w) >= 1 ||
            Math.abs(next.h - room.h) >= 1
          ) {
            room = next;
          }
        }}
      />
    </SvelteFlow>
  </div>
  {#if band}
    <!-- The machine the view's top stands in, named while its own top has scrolled out (round 29's pinned slab name), or always (call 9's band). -->
    <p
      class="pointer-events-none absolute inset-x-space-2 top-space-2 m-0 flex justify-center"
      data-pinned={graphOptions.sides.phoneBand}
    >
      <span
        class="max-w-full truncate rounded-pill border border-border-hairline bg-c-graph-slab px-space-2 type-meta text-ink-row shadow-tile"
        >{band}</span
      >
    </p>
  {/if}
</div>
