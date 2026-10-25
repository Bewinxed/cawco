<script lang="ts">
  /**
   * One component's design graph (Projects spec §5.10, "The design graph"):
   * its state machines as slabs, each named by its own header (the owner's
   * pick "headers": "the state machines are already namedin the grpah, stop
   * adding redundant/useless copy"), their states as nodes with their
   * variations as chips, the moves between them as thin rounded elbows with
   * open chevrons and the agent's edges as the same with their label as a
   * badge on the line (pin 30; round 29, section F). Laid out by dagre from
   * the moves alone (graph-layout). A hover, or a held press under a
   * finger, previews a state on the page; a press or Enter keeps it. The
   * kept state is the selected pair, its slab's header on the brand wash,
   * the move into it drawn stronger. The well scrolls; ⌘ or Ctrl with the
   * wheel zooms, a drag on its ground pans, and an edge fade says where the
   * graph runs on past the view (pin 30).
   */
  import {
    type GraphLink,
    type Machine,
    pointOf,
    type SectionGraph,
    type StagePoint,
    samePoint,
    type Variation,
  } from "@cawco/core/design-graph";
  import { tick, untrack } from "svelte";
  import { frameSize } from "#lib/cawco/frame-observer.js";
  import { dur, numberOf } from "#lib/cawco/motion/curves.svelte.js";
  import {
    fitted,
    headPath,
    type Laid,
    type Routed,
    reachOf,
    regions,
    rounded,
    routeEdges,
  } from "./graph-layout";

  interface Props {
    file: string;
    graph: SectionGraph;
    /** The well's height the person gave it by the panel's foot; null is its own, up to the panel's room. */
    height?: number | null;
    kept: StagePoint | null;
    /** A press kept a state. */
    onkeep: (point: StagePoint) => void;
    /** A hover or a held press previews a state; null lets it go. */
    onpreview: (point: StagePoint | null) => void;
    peek: StagePoint | null;
    /** The section's name: the slab of its own stories is its tab's, so it is said only to a reader. */
    sectionName: string;
    /** The zoom, the panel's group shows and steps it. */
    zoom?: number;
  }

  let {
    file,
    graph,
    height = null,
    kept,
    onkeep,
    onpreview,
    peek,
    sectionName,
    zoom = $bindable(1),
  }: Props = $props();

  /** The margin round the graph inside the well, and between slabs side by side: the spacing ladder's 11px. */
  const margin = () => numberOf("--space-3");
  /** The least a fitted or opening zoom takes: a state's name stays readable (the r24 ruling's floor). */
  const ZOOM_FLOOR = 0.5;
  const ZOOM_OPEN_FLOOR = 0.75;
  const ZOOM_MOST = 1.6;

  let well = $state<HTMLElement>();
  let wellWidth = $state(0);
  let wellHeight = $state(0);
  /** A node's width: two to a slab's row where the well has room, never under the floor. */
  let nodeWidth = $state(0);
  interface Inner {
    /** Each node's box corner, shifted so every lane and label stands inside. */
    boxes: Map<string, { x: number; y: number }>;
    h: number;
    routes: Routed[];
    w: number;
  }
  let laid = $state.raw<{
    inner: Map<string, Inner>;
    outer: Laid;
    sizes: Map<string, { h: number; w: number }>;
  } | null>(null);
  /** The person zoomed: the graph stops fitting its kept machine. */
  let own = false;
  /** Elements by key, for measuring. */
  const nodes = new Map<string, HTMLElement>();
  const regionEls = new Map<string, HTMLElement>();
  const nodeKey = (machine: string, story: string) => `${machine}|${story}`;

  /** An edge label's width in the meta role, measured once per word on a canvas in the face its probe resolves. */
  const widths = new Map<string, number>();
  let pen: CanvasRenderingContext2D | null = null;
  const labelW = (words: string): number => {
    const had = widths.get(words);
    if (had !== undefined) {
      return had;
    }
    if (!pen && well) {
      const probe = document.createElement("span");
      probe.style.font = "var(--type-meta)";
      well.append(probe);
      const style = getComputedStyle(probe);
      pen = document.createElement("canvas").getContext("2d");
      if (pen) {
        pen.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      }
      probe.remove();
    }
    const w = Math.ceil(pen?.measureText(words).width ?? words.length * 7);
    widths.set(words, w);
    return w;
  };

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

  // The node width, from the well's: two states to a slab's row, two slabs side by side where both fit.
  $effect(() => {
    const width = wellWidth;
    if (width <= 0) {
      return;
    }
    const full = numberOf("--c-graph-node-w");
    const least = numberOf("--c-graph-node-min-w");
    const pad = numberOf("--space-2");
    const gap = numberOf("--space-5");
    const chrome = 2 * (pad + 1);
    const m = margin();
    const two = width >= 2 * (2 * full + gap + chrome) + 3 * m;
    const room = width - 2 * m;
    const slabRoom = two ? Math.floor((room - m) / 2) : room;
    nodeWidth = Math.max(
      least,
      Math.min(full, Math.floor((slabRoom - chrome - gap) / 2))
    );
  });

  /**
   * Lays the graph out from what is drawn: each node's box at the node
   * width, each machine's states by its links and its edges routed round
   * them, then the slabs by the links between them. Run as the graph, the
   * node width or the well's width change; a change of tier (kept,
   * previewed) changes no size.
   */
  $effect(() => {
    const shape = graph;
    const width = wellWidth;
    const wide = nodeWidth;
    if (width <= 0 || wide <= 0) {
      return;
    }
    let stale = false;
    (async () => {
      await tick();
      if (stale) {
        return;
      }
      const pad = numberOf("--space-2");
      const gap = numberOf("--space-1");
      const badgeH = numberOf("--c-badge-h");
      const m = margin();
      const inner = new Map<string, Inner>();
      const two = width >= 2 * (2 * wide + 22 + 2 * (pad + 1)) + 3 * m;
      const room = width - 2 * m;
      const slabRoom = two ? Math.floor((room - m) / 2) : room;
      for (const machine of shape.machines) {
        const sizes = new Map<string, { h: number; w: number }>();
        const items = machine.states.map((state) => {
          const el = nodes.get(nodeKey(machine.id, state.story));
          const size = {
            w: el?.offsetWidth ?? wide,
            h: el?.offsetHeight ?? 40,
          };
          sizes.set(state.story, size);
          return { id: state.story, ...size };
        });
        const links = shape.links.get(machine.id) ?? [];
        const placed = fitted(
          items,
          links.map((one) => [one.from, one.to] as [string, string]),
          slabRoom - 2 * (pad + 1)
        );
        const labels = new Map(
          links.flatMap((one) =>
            one.label ? [[`${one.from}>${one.to}`, one.label] as const] : []
          )
        );
        const routes = routeEdges(
          placed,
          sizes,
          links,
          labelW,
          numberOf("--space-2")
        );
        const ext = reachOf(
          routes,
          placed.w,
          placed.h,
          labelW,
          labels,
          badgeH,
          gap
        );
        const shift = (p: { x: number; y: number }) => ({
          x: p.x - ext.l,
          y: p.y - ext.t,
        });
        inner.set(machine.id, {
          w: Math.ceil(ext.r - ext.l),
          h: Math.ceil(ext.b - ext.t),
          boxes: new Map([...placed.boxes].map(([id, p]) => [id, shift(p)])),
          routes: routes.map((one) => ({
            ...one,
            points: one.points.map(shift),
            at: one.at ? shift(one.at) : null,
          })),
        });
      }
      // Each slab drawn round its states, its header wrapping at its width: measured as drawn.
      laid = {
        inner,
        outer: { boxes: new Map(), dir: "TB", edges: [], w: 0, h: 0 },
        sizes: new Map(),
      };
      await tick();
      if (stale) {
        return;
      }
      const sizes = new Map<string, { h: number; w: number }>();
      for (const machine of shape.machines) {
        const el = regionEls.get(machine.id);
        sizes.set(machine.id, {
          w: Math.ceil(el?.offsetWidth ?? 0),
          h: Math.ceil(el?.offsetHeight ?? 0),
        });
      }
      const outer = regions(
        shape.machines.map((machine) => ({
          id: machine.id,
          ...(sizes.get(machine.id) ?? { w: 0, h: 0 }),
        })),
        shape.between,
        room + 2 * m,
        m
      );
      laid = { inner, outer, sizes };
      await tick();
      if (!stale) {
        untrack(() => revealKept(true));
      }
    })();
    return () => {
      stale = true;
    };
  });

  /** The graph's own size, at zoom 1. */
  const extent = $derived.by(() => {
    if (!laid) {
      return { w: 0, h: 0 };
    }
    const m = margin();
    const points = laid.outer.edges.flatMap((one) => one.points);
    return {
      w: Math.max(laid.outer.w, ...points.map((p) => p.x + m)),
      h: Math.max(laid.outer.h, ...points.map((p) => p.y + m)),
    };
  });

  /**
   * The kept state brought into view: until the person zooms, the graph
   * opens zoomed to hold the kept state's machine whole, between 0.75 and 1
   * (the r24 ruling), never under 1 where a finger needs its targets whole;
   * then scrolled so its machine's top, or the kept state's own, stands a
   * gap under the well's top, centred across.
   */
  function revealKept(fitting: boolean): void {
    if (!(well && laid && keptMachine !== null)) {
      return;
    }
    const pad = numberOf("--space-2");
    const region = laid.outer.boxes.get(keptMachine);
    const size = laid.sizes.get(keptMachine);
    const node = laid.inner.get(keptMachine)?.boxes.get(keptState ?? "");
    if (!(region && size && node)) {
      return;
    }
    if (fitting && !own) {
      const finger = matchMedia("(pointer: coarse)").matches;
      zoom = finger
        ? 1
        : Math.max(
            ZOOM_OPEN_FLOOR,
            Math.min(1, (well.clientHeight - 2 * pad) / Math.max(1, size.h))
          );
    }
    const regionTop = region.y * zoom;
    const nodeEl = nodes.get(nodeKey(keptMachine, keptState ?? ""));
    const nodeTop = (region.y + (nodeEl?.offsetTop ?? 0)) * zoom;
    const nodeBottom = nodeTop + (nodeEl?.offsetHeight ?? 0) * zoom;
    const view = well.clientHeight;
    const top =
      nodeBottom - regionTop + 2 * pad <= view
        ? regionTop - pad
        : nodeTop - pad;
    const shows =
      nodeTop >= well.scrollTop && nodeBottom <= well.scrollTop + view;
    if (fitting || !shows) {
      well.scrollTop = Math.max(0, top);
    }
    const nodeLeft = (region.x + (nodeEl?.offsetLeft ?? 0)) * zoom;
    const nodeWide = (nodeEl?.offsetWidth ?? 0) * zoom;
    well.scrollLeft = Math.max(
      0,
      nodeLeft + nodeWide / 2 - well.clientWidth / 2
    );
  }

  // A press keeping another state brings it into view, as a key's focus does.
  $effect(() => {
    if (keptState !== null && laid) {
      untrack(() => revealKept(false));
    }
  });

  /** Zooms by `factor` around a point of the well (its middle by default). */
  export function zoomBy(factor: number, at?: { x: number; y: number }): void {
    if (!well) {
      return;
    }
    own = true;
    const next = Math.max(ZOOM_FLOOR, Math.min(ZOOM_MOST, zoom * factor));
    const ax = at?.x ?? well.clientWidth / 2;
    const ay = at?.y ?? well.clientHeight / 2;
    const wx = (well.scrollLeft + ax) / zoom;
    const wy = (well.scrollTop + ay) / zoom;
    zoom = next;
    tick().then(() => {
      if (well) {
        well.scrollLeft = wx * next - ax;
        well.scrollTop = wy * next - ay;
      }
    });
  }
  /** Fit all: the whole graph in the well, never past its own size. */
  export function fit(): void {
    if (!(well && extent.w > 0)) {
      return;
    }
    own = true;
    zoom = Math.max(
      ZOOM_FLOOR,
      Math.min(
        1,
        (well.clientWidth - 8) / extent.w,
        (well.clientHeight - 8) / extent.h
      )
    );
  }

  /** Where the well's edge fades stand: where the graph runs on past the view. */
  let fades = $state({ top: false, foot: false });
  const readFades = () => {
    if (!well) {
      return;
    }
    const below = well.scrollHeight - well.clientHeight - well.scrollTop;
    fades = { top: well.scrollTop > 1, foot: below > 1 };
  };
  // The fades read again whenever the view changes size or zoom.
  $effect(() => {
    const view = `${zoom}|${extent.w}|${extent.h}|${wellWidth}|${wellHeight}`;
    tick().then(() => view && readFades());
  });

  /* --- The hand: hover previews, a held press previews, a press keeps --- */

  /** A press under a finger or a pen: held, it previews until it lifts; dragged past this, it was a scroll. */
  const SLOP = 10;
  let held: {
    id: number;
    x: number;
    y: number;
    shown: boolean;
    dead: boolean;
    timer: ReturnType<typeof setTimeout>;
  } | null = null;
  /** The click a held press or a scroll ends in keeps nothing. */
  let swallow = false;

  function pressDown(event: PointerEvent, point: StagePoint): void {
    swallow = false;
    if (event.pointerType === "mouse") {
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
  }
  function pressMove(event: PointerEvent): void {
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
  }
  function pressUp(event: PointerEvent): void {
    if (!held || event.pointerId !== held.id) {
      return;
    }
    clearTimeout(held.timer);
    swallow = held.shown || held.dead;
    if (held.shown) {
      onpreview(null);
    }
    held = null;
  }
  function pressed(event: MouseEvent, point: StagePoint): void {
    event.stopPropagation();
    if (swallow) {
      swallow = false;
      return;
    }
    onkeep(point);
  }
  /** A hover previews on a pointer that hovers (a mouse, a trackpad, a hovering pen); a finger never hovers. */
  const hovers = (event: PointerEvent) => event.pointerType !== "touch";

  /** What a node keeps: its kept chip when the kept state is one of its own, else the state at rest. */
  const nodePoint = (story: string): StagePoint =>
    keptState === story && kept
      ? kept
      : pointOf(file, { story, interaction: "rest" });
  const chipPoint = (variation: Variation): StagePoint =>
    pointOf(file, variation);

  /* --- Pan: a drag on the well's ground; zoom: ⌘ or Ctrl with the wheel - */

  let pan: {
    id: number;
    x: number;
    y: number;
    left: number;
    top: number;
  } | null = null;
  let panning = $state(false);
  function groundDown(event: PointerEvent): void {
    const target = event.target as Element;
    if (
      event.button !== 0 ||
      !well ||
      target.closest("[data-node], [data-chip]")
    ) {
      return;
    }
    pan = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      left: well.scrollLeft,
      top: well.scrollTop,
    };
  }
  function groundMove(event: PointerEvent): void {
    pressMove(event);
    if (!(pan && well) || event.pointerId !== pan.id) {
      return;
    }
    const dx = event.clientX - pan.x;
    const dy = event.clientY - pan.y;
    if (!panning && Math.hypot(dx, dy) < 4) {
      return;
    }
    if (!panning) {
      well.setPointerCapture(event.pointerId);
      panning = true;
    }
    well.scrollLeft = pan.left - dx;
    well.scrollTop = pan.top - dy;
  }
  function groundUp(event: PointerEvent): void {
    pressUp(event);
    if (pan && event.pointerId === pan.id) {
      pan = null;
      panning = false;
    }
  }
  function wheel(event: WheelEvent): void {
    if (!((event.ctrlKey || event.metaKey) && well)) {
      return;
    }
    event.preventDefault();
    const box = well.getBoundingClientRect();
    zoomBy(Math.exp(-event.deltaY * 0.01), {
      x: event.clientX - box.left,
      y: event.clientY - box.top,
    });
  }

  /** An edge's ink (round 29, section F): the graph's edge ink at the graph stroke; the move into the kept state in the chosen ink, a step heavier. */
  const inkOf = (lit: boolean) =>
    `fill-none transition-[stroke,stroke-width] duration-(--dur-control) ease-out ${lit ? "stroke-c-graph-edge-chosen stroke-(length:--c-graph-edge-lit)" : "stroke-c-graph-edge-ink stroke-(length:--c-graph-edge)"}`;

  const linkOf = (machine: Machine, route: Routed): GraphLink | undefined =>
    (graph.links.get(machine.id) ?? []).find(
      (one) => one.from === route.from && one.to === route.to
    );
</script>

<!-- The well's ground pans under a drag; its states are buttons of their own. -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  bind:this={well}
  {@attach frameSize((node: HTMLElement) => {
    wellWidth = node.clientWidth;
    wellHeight = node.clientHeight;
  })}
  class={[
    "relative min-h-0 cursor-grab overflow-auto overscroll-contain rounded-sm border border-border-well bg-surface-well touch-pan-x touch-pan-y data-panning:cursor-grabbing",
    height === null ? "flex-1" : "h-(--graph-h) flex-none",
  ]}
  data-panning={panning || undefined}
  data-design-graph={file}
  data-zoom={zoom}
  style:--graph-h={height === null ? undefined : `${height}px`}
  onpointerdown={groundDown}
  onpointermove={groundMove}
  onpointerup={groundUp}
  onpointercancel={groundUp}
  onscroll={readFades}
  onwheel={wheel}
>
  <div
    aria-hidden="true"
    class="pointer-events-none sticky top-0 left-0 z-2 -mb-c-edge-fade-len h-c-edge-fade-len bg-linear-to-b from-surface-well to-transparent opacity-0 transition-opacity duration-(--dur-control) ease-out data-on:opacity-100"
    data-fade="top"
    data-on={fades.top || undefined}
  ></div>
  <div
    class="relative mx-auto h-(--sh) w-(--sw)"
    style:--sh={`${extent.h * zoom}px`}
    style:--sw={`${extent.w * zoom}px`}
  >
    <div
      class="absolute top-0 left-0 h-(--gh) w-(--gw) origin-top-left scale-(--zoom)"
      style:--gh={`${extent.h}px`}
      style:--gw={`${extent.w}px`}
      style:--node-w={`${nodeWidth}px`}
      style:--zoom={zoom}
    >
      <svg
        aria-hidden="true"
        class="pointer-events-none absolute start-0 top-0 overflow-visible"
        height={extent.h}
        width={extent.w}
      >
        {#each laid?.outer.edges ?? [] as edge (`${edge.from}>${edge.to}`)}
          <path
            class="fill-none stroke-border-hairline stroke-1"
            d={rounded(edge.points, numberOf("--radius-sm"))}
            stroke-linecap="round"
            stroke-linejoin="round"
          ></path>
        {/each}
      </svg>
      {#each graph.machines as machine (machine.id)}
        {@const at = laid?.outer.boxes.get(machine.id)}
        {@const inner = laid?.inner.get(machine.id)}
        {@const region = machine.id === keptMachine}
        <section
          {@attach (node) => {
            regionEls.set(machine.id, node);
            return () => regionEls.delete(machine.id);
          }}
          aria-label={machine.name ?? sectionName}
          class="group/region absolute top-(--y) left-(--x) flex w-max flex-col overflow-hidden rounded-panel border border-border-hairline bg-c-graph-slab data-unlaid:invisible"
          data-machine={machine.id}
          data-kept={region || undefined}
          data-unlaid={!at || undefined}
          style:--x={`${at?.x ?? 0}px`}
          style:--y={`${at?.y ?? 0}px`}
        >
          {#if machine.name}
            <!-- The machine's name, its slab's header: the label role, on the brand wash where the kept state stands. -->
            <h4
              class="m-0 flex min-h-c-graph-region-band-h w-0 min-w-full items-center px-space-3 py-space-row type-label text-ink-row text-pretty wrap-anywhere transition-colors duration-(--dur-control) ease-out group-data-kept/region:bg-brand-wash group-data-kept/region:text-brand-ink"
              data-band
            >
              {machine.name}
            </h4>
          {/if}
          <div
            class="relative m-space-2 h-(--ih) w-(--iw)"
            style:--ih={`${inner?.h ?? 0}px`}
            style:--iw={`${inner?.w ?? 0}px`}
          >
            <svg
              aria-hidden="true"
              class="pointer-events-none absolute start-0 top-0 overflow-visible"
              height={inner?.h ?? 0}
              width={inner?.w ?? 0}
            >
              {#each inner?.routes ?? [] as route (`${route.from}>${route.to}`)}
                {@const link = linkOf(machine, route)}
                {@const lit = litLink(machine, route)}
                {@const tip = route.points.at(-1)}
                {@const before = route.points.at(-2)}
                <g
                  data-from={route.from}
                  data-kind={link?.kind}
                  data-lit={lit || undefined}
                  data-to={route.to}
                >
                  <path
                    class={inkOf(lit)}
                    d={rounded(route.points, numberOf("--radius-sm"))}
                    data-line
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  ></path>
                  {#if tip && before}
                    <path
                      class={inkOf(lit)}
                      d={headPath(tip, before, numberOf("--c-edge-head-leg"))}
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    ></path>
                  {/if}
                  {#if link?.label && route.at}
                    {@const w = labelW(link.label) + 2 * numberOf("--space-2")}
                    <rect
                      class={[
                        "stroke-border-hairline stroke-1",
                        lit ? "fill-brand-wash" : "fill-c-graph-label-bg",
                      ]}
                      height={numberOf("--c-badge-h")}
                      rx={numberOf("--radius-xs")}
                      width={w}
                      x={route.at.x - w / 2}
                      y={route.at.y - numberOf("--c-badge-h") / 2}
                    ></rect>
                    <text
                      class="fill-ink-row type-meta"
                      dominant-baseline="central"
                      text-anchor="middle"
                      x={route.at.x}
                      y={route.at.y}>{link.label}</text
                    >
                  {/if}
                </g>
              {/each}
            </svg>
            {#each machine.states as state (state.story)}
              {@const box = inner?.boxes.get(state.story)}
              {@const isKept = keptState === state.story}
              <!-- A state: the selected pair while kept, the hover's fill while previewed. -->
              <!-- biome-ignore lint/a11y/useSemanticElements: a state's node holds its variations' own buttons, which a button cannot contain. -->
              <div
                {@attach (node) => {
                  nodes.set(nodeKey(machine.id, state.story), node);
                  return () => nodes.delete(nodeKey(machine.id, state.story));
                }}
                aria-current={isKept || undefined}
                class="group/node absolute top-(--y) left-(--x) flex w-(--node-w) flex-col gap-space-row rounded-sm border border-border-control bg-surface-raised px-space-3 py-space-2 shadow-tile transition-[background-color,border-color,box-shadow,scale] duration-(--dur-control) ease-out not-data-kept:hover:bg-surface-hover active:scale-(--press-scale) data-peek:not-data-kept:bg-surface-hover data-kept:border-brand-solid data-kept:bg-selected-bg data-kept:shadow-selected-shadow focus-visible:outline-(length:--focus-ring-width) focus-visible:outline-focus-ring focus-visible:outline-offset-(--focus-ring-offset)"
                data-kept={isKept || undefined}
                data-node={state.story}
                data-peek={peekState === state.story || undefined}
                onclick={(event) => pressed(event, nodePoint(state.story))}
                onkeydown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onkeep(nodePoint(state.story));
                  }
                }}
                onpointerdown={(event) =>
                  pressDown(event, nodePoint(state.story))}
                onpointerenter={(event) => {
                  if (hovers(event)) {
                    onpreview(nodePoint(state.story));
                  }
                }}
                onpointerleave={(event) => {
                  if (hovers(event)) {
                    onpreview(null);
                  }
                }}
                role="button"
                style:--x={`${box?.x ?? 0}px`}
                style:--y={`${box?.y ?? 0}px`}
                tabindex="0"
              >
                <!-- Its name in words, then the agent's note on it (its doc comment), as round 29 draws a state. -->
                <span
                  class="type-label text-ink-strong text-pretty wrap-anywhere group-data-kept/node:text-selected-ink"
                  >{state.name}</span
                >
                {#if state.label}
                  <span
                    class="type-meta text-ink-muted text-pretty wrap-anywhere group-data-kept/node:text-ink-row"
                    data-note>{state.label}</span
                  >
                {/if}
                {#if state.variations.length > 0}
                  <span class="mt-space-1 flex flex-col gap-space-1">
                    {#each state.variations as variation (`${variation.story}|${variation.interaction}`)}
                      {@const point = chipPoint(variation)}
                      {@const chipKept = samePoint(point, kept)}
                      <button
                        class="min-h-c-badge-h rounded-xs border border-border-control bg-surface-raised px-space-2 py-space-row text-start type-meta text-ink-row wrap-anywhere touch-hit transition-[background-color,border-color,color] duration-(--dur-control) ease-out not-data-kept:hover:bg-surface-hover data-peek:not-data-kept:bg-surface-hover data-kept:border-chip-chosen-bg data-kept:bg-chip-chosen-bg data-kept:text-chip-chosen-ink focus-visible:outline-(length:--focus-ring-width) focus-visible:outline-focus-ring focus-visible:outline-offset-(--focus-ring-offset)"
                        data-chip={`${variation.story}|${variation.interaction}`}
                        data-kept={chipKept || undefined}
                        data-peek={samePoint(point, peek) || undefined}
                        onclick={(event) => pressed(event, point)}
                        onpointerdown={(event) => {
                          event.stopPropagation();
                          pressDown(event, point);
                        }}
                        onpointerenter={(event) => {
                          if (hovers(event)) {
                            onpreview(point);
                          }
                        }}
                        title={variation.note ?? undefined}
                        type="button">{variation.label}</button
                      >
                    {/each}
                  </span>
                {/if}
              </div>
            {/each}
          </div>
        </section>
      {/each}
    </div>
  </div>
  <div
    aria-hidden="true"
    class="pointer-events-none sticky bottom-0 left-0 z-2 -mt-c-edge-fade-len h-c-edge-fade-len bg-linear-to-t from-surface-well to-transparent opacity-0 transition-opacity duration-(--dur-control) ease-out data-on:opacity-100"
    data-fade="foot"
    data-on={fades.foot || undefined}
  ></div>
</div>
