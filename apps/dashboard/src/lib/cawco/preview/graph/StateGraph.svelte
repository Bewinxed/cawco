<script lang="ts">
  /**
   * One component's design graph (Projects spec §5.10, "The design graph"):
   * its state machines as filled regions, each named by its own header band
   * (the owner's pick "headers": "the state machines are already namedin the
   * grpah, stop adding redundant/useless copy"), their states as nodes with
   * their variations as chips, the moves between them as rounded elbows
   * with small open heads and the agent's edges as the same with their label
   * on a chip (pin 30). Laid out by dagre from what is drawn (graph-layout).
   * A hover, or a held press under a finger, previews a state on the page;
   * a press or Enter keeps it. Coral marks the kept state alone: its node,
   * its region's band and the move into it. The well scrolls; ⌘ or Ctrl with
   * the wheel zooms, a drag on its ground pans, and an edge fade says where
   * the graph runs on past the view (pin 30).
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
  import { dur, numberOf } from "#lib/cawco/motion/curves.svelte.js";
  import {
    fitted,
    type Laid,
    midway,
    type Point,
    regions,
    rounded,
  } from "./graph-layout";

  interface Props {
    file: string;
    graph: SectionGraph;
    kept: StagePoint | null;
    /** A press kept a state. */
    onkeep: (point: StagePoint) => void;
    /** A hover or a held press previews a state; null lets it go. */
    onpreview: (point: StagePoint | null) => void;
    peek: StagePoint | null;
    /** The section's name: the region of its own stories is its tab's, so it is said only to a reader. */
    sectionName: string;
    /** The zoom, the panel's group shows and steps it. */
    zoom?: number;
  }

  let {
    file,
    graph,
    kept,
    onkeep,
    onpreview,
    peek,
    sectionName,
    zoom = $bindable(1),
  }: Props = $props();

  const uid = $props.id();
  /** The margin round the graph inside the well, and between regions side by side. Ours, the mockup's 10px. */
  const MARGIN = 10;
  /** The least a fitted or opening zoom takes: a state's name stays readable (the r24 ruling's floor). */
  const ZOOM_FLOOR = 0.5;
  const ZOOM_OPEN_FLOOR = 0.75;
  const ZOOM_MOST = 1.6;

  let well = $state<HTMLElement>();
  let wellWidth = $state(0);
  let wellHeight = $state(0);
  /** A node's width: two to a region's row where the well has room, never under the floor. */
  let nodeWidth = $state(0);
  let laid = $state.raw<{
    inner: Map<string, Laid>;
    outer: Laid;
    sizes: Map<string, { h: number; w: number }>;
  } | null>(null);
  /** The person zoomed: the graph stops fitting its kept machine. */
  let own = false;
  /** Elements by key, for measuring. */
  const nodes = new Map<string, HTMLElement>();
  const regionEls = new Map<string, HTMLElement>();
  const nodeKey = (machine: string, story: string) => `${machine}|${story}`;

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

  /** The link lit: the move into the kept state, from the story its move starts from. */
  const litLink = (machine: Machine, link: GraphLink) =>
    machine.id === keptMachine &&
    link.kind === "move" &&
    link.to === keptState &&
    kept?.interaction === "rest";

  // The node width, from the well's: two states to a region's row, two regions side by side past the r22 ruling's 778px.
  $effect(() => {
    const width = wellWidth;
    if (width <= 0) {
      return;
    }
    const full = numberOf("--c-graph-node-w");
    const least = numberOf("--c-graph-node-min-w");
    const pad = numberOf("--space-2");
    const gap = 22;
    const chrome = 2 * (pad + 1);
    const two = width >= 2 * (2 * full + gap + chrome) + 3 * MARGIN;
    const room = width - 2 * MARGIN;
    const regionRoom = two ? Math.floor((room - MARGIN) / 2) : room;
    nodeWidth = Math.max(
      least,
      Math.min(full, Math.floor((regionRoom - chrome - gap) / 2))
    );
  });

  /**
   * Lays the graph out from what is drawn: each node's box at the node
   * width, each machine's states by its links, then the regions by the
   * links between them. Run as the graph, the node width or the well's
   * width change; a change of tier (kept, previewed) changes no size.
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
      const inner = new Map<string, Laid>();
      const two = width >= 2 * (2 * wide + 22 + 2 * (pad + 1)) + 3 * MARGIN;
      const room = width - 2 * MARGIN;
      const regionRoom = two ? Math.floor((room - MARGIN) / 2) : room;
      for (const machine of shape.machines) {
        const items = machine.states.map((state) => {
          const el = nodes.get(nodeKey(machine.id, state.story));
          return {
            id: state.story,
            w: el?.offsetWidth ?? wide,
            h: el?.offsetHeight ?? 40,
          };
        });
        const links = (shape.links.get(machine.id) ?? []).map(
          (one) => [one.from, one.to] as [string, string]
        );
        inner.set(
          machine.id,
          fitted(items, links, regionRoom - 2 * (pad + 1))
        );
      }
      // Each region drawn round its states, its band wrapping at its width: measured as drawn.
      laid = { inner, outer: { boxes: new Map(), edges: [], w: 0, h: 0 }, sizes: new Map() };
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
        room + 2 * MARGIN,
        MARGIN
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
    const points = laid.outer.edges.flatMap((one) => one.points);
    return {
      w: Math.max(laid.outer.w, ...points.map((p) => p.x + MARGIN)),
      h: Math.max(laid.outer.h, ...points.map((p) => p.y + MARGIN)),
    };
  });

  /**
   * The kept state brought into view: until the person zooms, the graph
   * opens zoomed to hold the kept state's machine whole, between 0.75 and
   * 1 (the r24 ruling); then scrolled so its machine's top, or the kept
   * state's own, stands a gap under the well's top, centred across.
   */
  function revealKept(fit: boolean): void {
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
    if (fit && !own) {
      zoom = Math.max(
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
      nodeBottom - regionTop + 2 * pad <= view ? regionTop - pad : nodeTop - pad;
    const shows =
      nodeTop >= well.scrollTop && nodeBottom <= well.scrollTop + view;
    if (fit || !shows) {
      well.scrollTop = Math.max(0, top);
    }
    const nodeLeft = (region.x + (nodeEl?.offsetLeft ?? 0)) * zoom;
    const nodeWide = (nodeEl?.offsetWidth ?? 0) * zoom;
    well.scrollLeft = Math.max(0, nodeLeft + nodeWide / 2 - well.clientWidth / 2);
  }

  // A press keeping another state brings it into view, as a key's focus does.
  $effect(() => {
    if (keptState !== null && laid) {
      untrack(() => revealKept(false));
    }
  });

  /** Zooms by `factor` around a point of the well (its middle by default); `fit` holds the whole graph. */
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
    const more = well.scrollHeight - well.clientHeight - well.scrollTop;
    fades = { top: well.scrollTop > 1, foot: more > 1 };
  };
  $effect(() => {
    void [zoom, extent, wellHeight];
    tick().then(readFades);
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
    keptState === story && kept ? kept : pointOf(file, { story, interaction: "rest" });
  const chipPoint = (variation: Variation): StagePoint =>
    pointOf(file, variation);

  /* --- Pan: a drag on the well's ground; zoom: ⌘ or Ctrl with the wheel - */

  let pan: { id: number; x: number; y: number; left: number; top: number } | null = null;
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
    if (!(event.ctrlKey || event.metaKey) || !well) {
      return;
    }
    event.preventDefault();
    const box = well.getBoundingClientRect();
    zoomBy(Math.exp(-event.deltaY * 0.01), {
      x: event.clientX - box.left,
      y: event.clientY - box.top,
    });
  }

  const markerOf = (lit: boolean) => `graph-head-${uid}${lit ? "-lit" : ""}`;
  /** An edge label's chip: its words' room, the chip's 6px pad and 3px over and under. */
  const labelBox = (points: Point[], label: string) => {
    const at = midway(points);
    const w = label.length * 6.6 + 12;
    return { x: at.x - w / 2, y: at.y - 11, w, h: 22, cx: at.x, cy: at.y };
  };
</script>

<!-- The well's ground pans under a drag; its states are buttons of their own. -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  bind:this={well}
  bind:clientWidth={wellWidth}
  bind:clientHeight={wellHeight}
  class="relative min-h-0 flex-1 cursor-grab overflow-auto overscroll-contain rounded-[calc(var(--radius-panel)-var(--space-2))] border border-border-well bg-surface-well touch-pan-x touch-pan-y data-panning:cursor-grabbing"
  data-panning={panning || undefined}
  data-design-graph={file}
  data-zoom={zoom}
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
    class="relative mx-auto"
    style:inline-size={`${extent.w * zoom}px`}
    style:block-size={`${extent.h * zoom}px`}
  >
    <div
      class="absolute start-0 top-0 origin-top-left"
      style:inline-size={`${extent.w}px`}
      style:block-size={`${extent.h}px`}
      style:transform={`scale(${zoom})`}
      style:--node-w={`${nodeWidth}px`}
    >
      <svg
        aria-hidden="true"
        class="graph-edges pointer-events-none absolute start-0 top-0 overflow-visible"
        height={extent.h}
        width={extent.w}
      >
        {#each laid?.outer.edges ?? [] as edge (`${edge.from}>${edge.to}`)}
          <path class="between" d={rounded(edge.points, numberOf("--radius-sm"))}></path>
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
          class="group/region absolute w-max rounded-panel border border-border-hairline bg-surface-recess p-space-2 data-unlaid:invisible"
          data-machine={machine.id}
          data-kept={region || undefined}
          data-unlaid={!at || undefined}
          style:left={`${at?.x ?? 0}px`}
          style:top={`${at?.y ?? 0}px`}
        >
          {#if machine.name}
            <!-- The machine's name, its region's header band: the label role, on the brand wash where the kept state stands. -->
            <p
              class="-mx-space-2 -mt-space-2 mb-space-2 flex min-h-c-graph-region-band-h w-0 min-w-[calc(100%+2*var(--space-2))] items-center rounded-t-[calc(var(--radius-panel)-1px)] px-space-3 type-label text-ink-row text-pretty wrap-anywhere transition-colors duration-(--dur-control) ease-out group-data-kept/region:bg-brand-wash group-data-kept/region:text-brand-ink"
              data-band
            >
              {machine.name}
            </p>
          {/if}
          <div
            class="relative"
            style:inline-size={`${inner?.w ?? 0}px`}
            style:block-size={`${inner?.h ?? 0}px`}
          >
            <svg
              aria-hidden="true"
              class="graph-edges pointer-events-none absolute start-0 top-0 overflow-visible"
              height={inner?.h ?? 0}
              width={inner?.w ?? 0}
            >
              <defs>
                {#each [false, true] as lit (lit)}
                  <marker
                    id={markerOf(lit)}
                    markerHeight="6"
                    markerUnits="userSpaceOnUse"
                    markerWidth="6"
                    orient="auto-start-reverse"
                    refX="7"
                    refY="4"
                    viewBox="0 0 8 8"
                  >
                    <path class="head" class:lit d="M1.5,1 L7,4 L1.5,7"></path>
                  </marker>
                {/each}
              </defs>
              {#each graph.links.get(machine.id) ?? [] as link (`${link.from}>${link.to}`)}
                {@const edge = inner?.edges.find((one) => one.from === link.from && one.to === link.to)}
                {#if edge}
                  {@const lit = litLink(machine, link)}
                  <path
                    class="move"
                    class:lit
                    d={rounded(edge.points, numberOf("--radius-sm"))}
                    data-from={link.from}
                    data-to={link.to}
                    data-lit={lit || undefined}
                    marker-end={`url(#${markerOf(lit)})`}
                  ></path>
                  {#if link.label}
                    {@const box = labelBox(edge.points, link.label)}
                    <rect class="label-chip" height={box.h} rx="5" width={box.w} x={box.x} y={box.y}></rect>
                    <text class="label" dominant-baseline="central" text-anchor="middle" x={box.cx} y={box.cy}>{link.label}</text>
                  {/if}
                {/if}
              {/each}
            </svg>
            {#each machine.states as state (state.story)}
              {@const box = inner?.boxes.get(state.story)}
              {@const isKept = keptState === state.story}
              <!-- A state: the selected card while kept, the hover's fill while previewed. -->
              <div
                {@attach (node) => {
                  nodes.set(nodeKey(machine.id, state.story), node);
                  return () => nodes.delete(nodeKey(machine.id, state.story));
                }}
                aria-current={isKept || undefined}
                class="group/node absolute flex w-(--node-w) cursor-pointer flex-col gap-space-row rounded-sm border border-border-control bg-surface-raised px-space-3 py-space-2 shadow-tile transition-[background-color,border-color,box-shadow] duration-(--dur-control) ease-out not-data-kept:hover:bg-surface-hover data-peek:not-data-kept:bg-surface-hover data-kept:border-brand-solid data-kept:bg-selected-bg data-kept:shadow-selected-shadow focus-visible:outline-(length:--focus-ring-width) focus-visible:outline-focus-ring focus-visible:outline-offset-(--focus-ring-offset)"
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
                onpointerdown={(event) => pressDown(event, nodePoint(state.story))}
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
                style:left={`${box?.x ?? 0}px`}
                style:top={`${box?.y ?? 0}px`}
                tabindex="0"
              >
                <span
                  class="type-label text-ink-strong text-pretty wrap-anywhere group-data-kept/node:text-selected-ink"
>{state.label}</span
                >
                {#if state.variations.length > 0}
                  <span class="mt-space-1 flex flex-col gap-space-1">
                    {#each state.variations as variation (`${variation.story}|${variation.interaction}`)}
                      {@const point = chipPoint(variation)}
                      {@const chipKept = samePoint(point, kept)}
                      <button
                        class="touch-hit min-h-c-badge-h cursor-pointer rounded-xs border border-border-control bg-surface-raised px-space-2 py-space-row text-start type-meta text-ink-row wrap-anywhere transition-[background-color,border-color,color] duration-(--dur-control) ease-out not-data-kept:hover:bg-surface-hover data-peek:not-data-kept:bg-surface-hover data-kept:border-chip-chosen-bg data-kept:bg-chip-chosen-bg data-kept:text-chip-chosen-ink focus-visible:outline-(length:--focus-ring-width) focus-visible:outline-focus-ring focus-visible:outline-offset-(--focus-ring-offset)"
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

<style>
  /* The edges: rounded elbows in the edge ink, the house's open chevron at their end (two strokes, round caps); the move
     into the kept state in coral, a step heavier; the links between machines a hairline with no head (pin 30). */
  .graph-edges :global(path) {
    fill: none;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .move {
    stroke: var(--border-contrast);
    stroke-width: var(--c-graph-edge);
    transition:
      stroke var(--dur-control) var(--ease-out),
      stroke-width var(--dur-control) var(--ease-out);
  }
  .move.lit {
    stroke: var(--brand-solid);
    stroke-width: var(--c-block-drop-line);
  }
  .head {
    stroke: var(--border-contrast);
    stroke-width: var(--c-graph-edge);
  }
  .head.lit {
    stroke: var(--brand-solid);
  }
  .between {
    stroke: var(--border-hairline);
    stroke-width: 1;
  }
  /* An edge's label on its chip, on its line: the raised surface and a hairline, the label role. */
  .label-chip {
    fill: var(--surface-raised);
    stroke: var(--border-hairline);
    stroke-width: 1;
  }
  .label {
    font: var(--type-label);
    font-weight: var(--weight-body);
    fill: var(--ink-row);
  }
</style>
