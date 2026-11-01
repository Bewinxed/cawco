<script lang="ts">
  /**
   * The map: a floating panel at the stage's trailing side holding the
   * component's states as a graph (StateGraph) or a list (StateOutline).
   *
   * It has no title bar (The Title Bars Follow Liquid Glass Rule; the
   * owner's pins on the old head): its controls float over the map in two
   * capsules of the panel's glass, bare symbols at the bar's item size.
   * Leading, while the canvas holds more than one component: the
   * component's name, a menu of the others, ‹ and › to step to the one
   * beside it, and where it stands ("1 of 2"). Trailing: Fit, Outline (the
   * list) and Hide, which folds the panel back into the Map button it grew
   * from, the same place on screen (Show and Hide are one object).
   *
   * It resizes by its edges and nothing else (the owner's picks "Its edges"
   * and "Edge only"): nothing is drawn at rest; a pointer at the leading
   * edge, the foot or their corner brings a short line up where it rests,
   * and a drag lights the whole edge in coral, its ends tapered, until it
   * lets go. Each edge is a separator the arrow keys move as well.
   */
  import { graphWords } from "@cawco/core/words/graph";
  import { mergeProps } from "bits-ui";
  import BarGlass from "#lib/components/ui/bar-glass/bar-glass.svelte";
  import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
  import Tip from "#lib/components/ui/tooltip/tip.svelte";
  import {
    IconChevronDown,
    IconChevronLeft,
    IconChevronRight,
    IconClose,
    IconListRows,
    IconMaximize,
    IconStructure,
  } from "#lib/icons.js";
  import type { GraphComponent } from "./graph";
  import StateGraph from "./StateGraph.svelte";
  import StateOutline from "./StateOutline.svelte";

  let {
    graphs,
    at,
    kept,
    cameFrom,
    outline = false,
    width,
    height,
    room,
    onswitch,
    onkeep,
    onpreview,
    onoutline,
    onhide,
    onresize,
  }: {
    graphs: GraphComponent[];
    /** The component on the map, by its place in `graphs`. */
    at: number;
    kept: string;
    cameFrom: string | null;
    /** The list rather than the graph. */
    outline?: boolean;
    width: number;
    height: number;
    /** The most the panel may take, the stage's room less its insets. */
    room: { height: number; width: number };
    onswitch: (at: number) => void;
    onkeep: (id: string) => void;
    onpreview: (id: string | null) => void;
    onoutline: (on: boolean) => void;
    onhide: () => void;
    onresize: (size: { height: number; width: number }) => void;
  } = $props();

  const graph = $derived(graphs[at] ?? graphs[0]);
  const many = $derived(graphs.length > 1);

  /** The least the map is drawn at: one node and its region's pads. */
  const LEAST = { width: 280, height: 240 };
  const clampSize = (next: { height: number; width: number }) => ({
    width: Math.round(
      Math.min(
        Math.max(next.width, LEAST.width),
        Math.max(LEAST.width, room.width)
      )
    ),
    height: Math.round(
      Math.min(
        Math.max(next.height, LEAST.height),
        Math.max(LEAST.height, room.height)
      )
    ),
  });

  /** The edge held, while a drag holds it; the one a pointer or the focus rests on. */
  let held = $state<"start" | "foot" | "corner" | null>(null);
  let near = $state<"start" | "foot" | null>(null);
  /** Which way an edge is lit: held, under a resting pointer or the focus, or at rest. */
  const litOf = (edge: "start" | "foot") => {
    if (held === edge || held === "corner") {
      return "held";
    }
    return near === edge ? "near" : "rest";
  };
  /** Each edge's line, lit each way: a short line that grows into the whole edge while held. */
  const LINE = {
    start: {
      held: "start-0 top-1/2 h-full w-c-graph-edge -translate-y-1/2 bg-linear-to-b opacity-100",
      near: "start-0 top-1/2 h-space-8 w-c-graph-edge -translate-y-1/2 bg-linear-to-b opacity-100",
      rest: "start-0 top-1/2 h-space-8 w-c-graph-edge -translate-y-1/2 bg-linear-to-b opacity-0",
    },
    foot: {
      held: "bottom-0 left-1/2 h-c-graph-edge w-full -translate-x-1/2 bg-linear-to-r opacity-100",
      near: "bottom-0 left-1/2 h-c-graph-edge w-space-8 -translate-x-1/2 bg-linear-to-r opacity-100",
      rest: "bottom-0 left-1/2 h-c-graph-edge w-space-8 -translate-x-1/2 bg-linear-to-r opacity-0",
    },
  } as const;
  const EDGES = [
    { at: "start", label: graphWords.resizeWidth },
    { at: "foot", label: graphWords.resizeHeight },
  ] as const;
  function grab(edge: "start" | "foot" | "corner", event: PointerEvent) {
    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }
    event.preventDefault();
    const target = event.currentTarget as HTMLElement;
    target.setPointerCapture(event.pointerId);
    held = edge;
    const from = { x: event.clientX, y: event.clientY, width, height };
    const move = (next: PointerEvent) => {
      onresize(
        clampSize({
          width:
            edge === "foot" ? from.width : from.width - (next.clientX - from.x),
          height:
            edge === "start"
              ? from.height
              : from.height + (next.clientY - from.y),
        })
      );
    };
    const up = () => {
      held = null;
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
      target.removeEventListener("pointercancel", up);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
    target.addEventListener("pointercancel", up);
  }
  /** The arrow keys move a focused edge a spacing step at a time. */
  function nudge(edge: "start" | "foot", event: KeyboardEvent) {
    const step = event.shiftKey ? 64 : 16;
    const by: Record<string, [number, number]> = {
      ArrowLeft: [step, 0],
      ArrowRight: [-step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const delta = by[event.key];
    if (!delta) {
      return;
    }
    event.preventDefault();
    onresize(
      clampSize({
        width: width + (edge === "start" ? delta[0] : 0),
        height: height + (edge === "foot" ? delta[1] : 0),
      })
    );
  }

  let graphView = $state<StateGraph>();
</script>

<!-- A bare symbol of a capsule: the bar's item recipe ([data-bar-item]). -->
{#snippet item(
  label: string,
  Icon: typeof IconMaximize,
  onclick: () => void,
  pressed?: boolean
)}
  <Tip {label}>
    {#snippet children(tip)}
      <button
        data-bar-item
        data-box
        {...mergeProps(tip, { onclick })}
        aria-label={label}
        aria-pressed={pressed}
        class="select-none touch-hit press-tint aria-pressed:bg-surface-pressed"
        type="button"
      >
        <Icon data-slot="bar-symbol" aria-hidden="true" />
      </button>
    {/snippet}
  </Tip>
{/snippet}

<section
  aria-label={graphWords.map}
  data-slot="map"
  class="relative h-(--map-h) w-(--map-w) overflow-hidden rounded-lg border border-border-control bg-surface-well shadow-overlay"
  style:--map-w={`${width}px`}
  style:--map-h={`${height}px`}
  style:--outline-top="calc(var(--c-btn-h) + var(--space-4))"
>
  {#if outline}
    <StateOutline {graph} {kept} {onkeep} {onpreview} />
  {:else}
    <StateGraph
      bind:this={graphView}
      {cameFrom}
      {graph}
      {kept}
      {onkeep}
      {onpreview}
    />
  {/if}

  <!-- The controls float over the map; the map runs under them. -->
  <div
    class="pointer-events-none absolute inset-x-0 top-0 z-2 flex items-start justify-between gap-space-2 p-space-2"
  >
    <div class="pointer-events-auto min-w-0">
      {#if many}
        <BarGlass form="group">
          <DropdownMenu.Root>
            <Tip label={graphWords.components}>
              {#snippet children(tip)}
                <DropdownMenu.Trigger>
                  {#snippet child({ props })}
                    <button
                      data-bar-item
                      {...mergeProps(tip, props)}
                      class="mark-line max-w-c-graph-node-w gap-space-1 px-space-3 select-none touch-hit press-tint"
                      type="button"
                    >
                      <span
                        class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap type-label text-ink-strong"
                        >{graph.name}</span
                      >
                      <IconChevronDown
                        aria-hidden="true"
                        class="size-icon-sm flex-none text-ink-muted"
                      />
                    </button>
                  {/snippet}
                </DropdownMenu.Trigger>
              {/snippet}
            </Tip>
            <DropdownMenu.Content align="start" width="regular">
              <DropdownMenu.RadioGroup
                onValueChange={(value) => onswitch(Number(value))}
                value={String(at)}
              >
                {#each graphs as one, index (one.file)}
                  <DropdownMenu.RadioItem value={String(index)}
                    >{one.name}</DropdownMenu.RadioItem
                  >
                {/each}
              </DropdownMenu.RadioGroup>
            </DropdownMenu.Content>
          </DropdownMenu.Root>
          {@render item(graphWords.previousComponent, IconChevronLeft, () =>
            onswitch((at - 1 + graphs.length) % graphs.length)
          )}
          {@render item(graphWords.nextComponent, IconChevronRight, () =>
            onswitch((at + 1) % graphs.length)
          )}
          <span
            class="relative pe-space-2 type-meta num text-ink-muted whitespace-nowrap"
            >{graphWords.componentOf(at + 1, graphs.length)}</span
          >
        </BarGlass>
      {/if}
    </div>
    <div class="pointer-events-auto flex-none">
      <BarGlass form="group">
        {#if !outline}
          {@render item(graphWords.fit, IconMaximize, () => graphView?.fit())}
        {/if}
        {@render item(
          outline ? graphWords.showGraph : graphWords.showOutline,
          outline ? IconStructure : IconListRows,
          () => onoutline(!outline)
        )}
        {@render item(graphWords.hideMap, IconClose, onhide)}
      </BarGlass>
    </div>
  </div>

  <!-- The edges: nothing at rest; a short line where a pointer or the focus
       rests, which grows into the whole edge, tapered at its ends, while
       held, and shrinks back on release. -->
  {#each EDGES as edge (edge.at)}
    {@const lit = litOf(edge.at)}
    <button
      aria-label={edge.label}
      class={[
        "absolute z-3 touch-none focus-visible:outline-solid focus-visible:outline-(length:--focus-ring-width) focus-visible:outline-focus-ring focus-visible:-outline-offset-(--focus-ring-width)",
        edge.at === "start"
          ? "inset-y-0 start-0 w-space-3 cursor-ew-resize"
          : "inset-x-0 bottom-0 h-space-3 cursor-ns-resize",
      ]}
      onblur={() => {
        near = null;
      }}
      onfocus={() => {
        near = edge.at;
      }}
      onkeydown={(event) => nudge(edge.at, event)}
      onpointerdown={(event) => grab(edge.at, event)}
      onpointerenter={(event) => {
        if (event.pointerType === "mouse") {
          near = edge.at;
        }
      }}
      onpointerleave={() => {
        near = null;
      }}
      type="button"
    >
      <span
        aria-hidden="true"
        class={[
          "absolute rounded-pill from-transparent via-brand-solid to-transparent motion-safe:transition-[opacity,height,width] motion-safe:duration-(--dur-morph) motion-safe:ease-drawer",
          LINE[edge.at][lit],
        ]}
      ></span>
    </button>
  {/each}
  <div
    aria-hidden="true"
    class="absolute bottom-0 start-0 z-4 size-space-5 cursor-nesw-resize touch-none"
    onpointerdown={(event) => grab("corner", event)}
  ></div>
</section>
