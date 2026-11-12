<script lang="ts">
  /**
   * The whole set (spec, The whole set): every state of every machine and
   * every move between them on one map that pans and zooms, for judging
   * whether the set is complete. On Svelte Flow, as the project's Canvas
   * is, with its dots and zoom tools.
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
   * (FlowAutoFit). The fit tool frames the same way, never under the
   * readable zoom (fitted whole at 0.47 its words drew at 6px), and says so
   * ("Fit at a readable size"); the pan stops at the set's own bounds. No
   * zoom figure. Each edge with more of the set past it (a set too big
   * for the room at the readable zoom, or panned) wears the house edge
   * fade (edge-fade.css `kit-edge-fade-pan`, WholeFade), so a cut card
   * reads as more to pan to; an edge with nothing past it stays sharp.
   * The fade is the map's alone: the zoom tools stand over it, outside
   * it, on the flow's provider. The kept card wears the
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
    SvelteFlow,
    SvelteFlowProvider,
  } from "@xyflow/svelte";
  import { untrack } from "svelte";
  import { on } from "svelte/events";
  import { numberOf } from "#lib/cawco/motion/curves.svelte.js";
  import FlowAutoFit from "#lib/components/features/flow/FlowAutoFit.svelte";
  import FlowCanvasTools from "#lib/components/features/flow/FlowCanvasTools.svelte";
  import FlowZoomTracker from "#lib/components/features/flow/FlowZoomTracker.svelte";
  import { FIT, fitPadding, ZOOM } from "#lib/components/features/flow/fit.js";
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
  import WholeFade, { type PastEdges } from "./WholeFade.svelte";
  import WholeList from "./WholeList.svelte";
  import WholeMeasure from "./WholeMeasure.svelte";

  let {
    review,
    kept,
    against,
    onpress,
    onmove,
    narrow = false,
    top: headRoom = 0,
  }: {
    review: Review;
    kept: string;
    against: string | null;
    onpress: (state: string, variant: string | null) => void;
    /** A move's arrow pressed: its move opens on the Animation face. */
    onmove: (from: string, to: string) => void;
    /** A pane under 640px: the map is a list (DESIGN.md, Map mode; WholeList). */
    narrow?: boolean;
    /** What floats over the map's top, px (the room's head): the fit stands clear of it. */
    top?: number;
  } = $props();
  /**
   * What floats over the map, px: the room's head at its top, and at its
   * foot the zoom tools' glass with its inset (a control's height and the
   * page's step round it). The fit and the kept card stand clear of both,
   * and what the map holds past either edge fades out under them, as a
   * list fades under a floating bar.
   */
  const insets = $derived({
    top: headRoom,
    bottom: browser
      ? numberOf("--spacing-c-btn-h") + 2 * numberOf("--spacing-space-4")
      : 0,
  });

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
          card: numberOf("--spacing-c-graph-node-w"),
          head: numberOf("--spacing-space-7"),
          pad: numberOf("--spacing-space-3"),
          label: numberOf("--spacing-c-graph-label"),
          labelLine: numberOf("--spacing-space-5"),
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
        open: () => onmove(move.from, move.to),
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
          // A press, Enter or Space on it opens its move.
          focusable: true,
          ariaRole: "button",
          // Its name as a person says it, never the states' ids.
          ariaLabel: words.moveEdge(
            review.states[move.from]?.name ?? move.from,
            review.states[move.to]?.name ?? move.to,
            move.label ?? null
          ),
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: "var(--color-border-contrast)",
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
   * (FlowAutoFit `focus`), the rest a pan away; a set that fits whole above
   * it opens whole. The fit tool frames the same way.
   */
  const READABLE = browser
    ? LEAST_TEXT /
      (numberOf("--text-meta") *
        Number.parseFloat(getComputedStyle(document.documentElement).fontSize))
    : 1;
  /**
   * How far the map pans: the set's own bounds, a gutter round them. A view
   * stood past them showed a band of bare dots beside a set cut at the
   * other edge; held to them, a set smaller than the room stands in its
   * middle (d3-zoom's constrain).
   */
  /** The set's own bounds: every card and group, in the flow's coordinates; null with none. */
  const bounds = $derived.by(() => {
    const boxes = [
      ...Object.values(layout.states),
      ...Object.values(layout.machines),
    ];
    if (boxes.length === 0) {
      return null;
    }
    return {
      left: Math.min(...boxes.map((box) => box.x)),
      top: Math.min(...boxes.map((box) => box.y)),
      right: Math.max(...boxes.map((box) => box.x + box.w)),
      bottom: Math.max(...boxes.map((box) => box.y + box.h)),
    };
  });
  const translateExtent = $derived.by(
    (): [[number, number], [number, number]] => {
      const gutter = browser ? numberOf("--spacing-space-8") : 0;
      if (!bounds) {
        return [
          [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY],
          [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY],
        ];
      }
      // The view reaches past the set by the room what floats over it
      // takes, so the set's first and last cards can stand clear of it.
      return [
        [bounds.left - gutter, bounds.top - gutter - insets.top / READABLE],
        [
          bounds.right + gutter,
          bounds.bottom + gutter + insets.bottom / READABLE,
        ],
      ];
    }
  );
  /** The edges with more of the set past them, each faded. */
  let past = $state<PastEdges>({
    top: false,
    right: false,
    bottom: false,
    left: false,
  });
  /** A move by its arrow's id (`from->to`), opened on the Animation face. */
  const openMove = (id: string) => {
    const one = review.moves.find((move) => `${move.from}->${move.to}` === id);
    if (one) {
      onmove(one.from, one.to);
    }
  };
  /** The map's own box on screen, read as a fit asks: the first fit comes before any observer has reported its size. */
  let pane = $state<HTMLElement>();
  /** `at` held so a view of `span` around it stays inside `[low, high]`; the middle when the view is the wider. */
  const within = (at: number, span: number, low: number, high: number) =>
    high - low <= span
      ? (low + high) / 2
      : Math.min(high - span / 2, Math.max(low + span / 2, at));
  /**
   * Where a fit held at READABLE stands: on the kept card, held so the room
   * clear of the head and the tools (`insets`, the fit's own) never reaches
   * past the set's bounds. Centred on the card alone, a card
   * near the set's edge left a band of bare dots on one side and the set
   * cut on the other.
   */
  const keptMiddle = () => {
    const box = layout.states[kept];
    if (!box) {
      return null;
    }
    const [[left, top], [right, bottom]] = translateExtent;
    return {
      x: within(
        box.x + box.w / 2,
        (pane?.clientWidth ?? 0) / READABLE,
        left,
        right
      ),
      // Held in the room left clear of the room's head and the tools (the
      // fit's own `insets`), then said as the view's middle, which stands
      // that much off the clear room's.
      y:
        within(
          box.y + box.h / 2,
          ((pane?.clientHeight ?? 0) - insets.top - insets.bottom) / READABLE,
          top,
          bottom
        ) -
        (insets.top - insets.bottom) / 2 / READABLE,
    };
  };
</script>

{#if narrow}
  <WholeList {cardOf} {kept} {onmove} {review} />
{:else}
  <!-- Enter and Space on a focused arrow (Svelte Flow's edge, role
       button) open its move: the key is the arrow's, heard where it
       bubbles. In the drawer a drag on the map pans it, never the drawer
       (vaul's `data-vaul-no-drag`): the drawer moves by its grabber. -->
  <div
    data-slot="whole-set"
    data-vaul-no-drag
    bind:this={pane}
    {@attach (node: HTMLElement) =>
      on(node, "keydown", (event) => {
        const edge = (event.target as Element | null)?.closest(
          ".svelte-flow__edge"
        );
        const id = edge?.getAttribute("data-id");
        if (id && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          openMove(id);
        }
      })}
    class="relative min-h-0 min-w-0 flex-1 overflow-hidden bg-surface-raised"
    style:--xy-edge-stroke="var(--color-border-contrast)"
    style:--xy-edge-stroke-width="var(--spacing-c-graph-edge)"
  >
    <SvelteFlowProvider>
      <div
        class="kit-edge-fade-pan absolute inset-0"
        data-fade-bottom={past.bottom || undefined}
        data-fade-left={past.left || undefined}
        data-fade-right={past.right || undefined}
        data-fade-top={past.top || undefined}
        style:--fade-top={past.top && insets.top > 0
          ? `${insets.top}px`
          : undefined}
        style:--fade-bottom={past.bottom ? `${insets.bottom}px` : undefined}
      >
        <SvelteFlow
          aria-label={words.wholeMap(review.name)}
          colorMode={theme.current}
          deleteKey={null}
          elementsSelectable={false}
          {edgeTypes}
          fitView
          fitViewOptions={{
            ...FIT,
            padding: fitPadding(insets),
            minZoom: READABLE,
          }}
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
          onedgeclick={({ edge }) => openMove(edge.id)}
          panOnDrag
          {translateExtent}
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
            {insets}
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
          <WholeFade
            {bounds}
            onedges={(next) => {
              past = next;
            }}
          />
        </SvelteFlow>
      </div>
      <!-- The zoom tools over the map's foot, outside its fade. -->
      <div
        class="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center p-space-4"
      >
        <div class="pointer-events-auto">
          <FlowCanvasTools
            figure={false}
            fit={() => fit?.fit()}
            fitLabel={words.fitReadable}
            onfit={() => {
              held = false;
            }}
            onzoom={() => {
              held = true;
            }}
            {zoom}
          />
        </div>
      </div>
    </SvelteFlowProvider>
    <!-- An act's label measured in its own type, at its widest. -->
    <span
      bind:this={ruler}
      aria-hidden="true"
      class="pointer-events-none invisible absolute start-0 top-0 max-w-c-graph-label border px-space-1 type-meta"
    ></span>
  </div>
{/if}
