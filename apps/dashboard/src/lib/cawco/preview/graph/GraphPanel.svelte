<script lang="ts">
  import type { StagePoint } from "@cawco/core/design-graph";
  /**
   * The design graph over a component canvas's page (Projects spec §5.10,
   * "The design graph"; round 29). On a pane at least twice the panel's
   * width its two surfaces stand apart: the panel at the page's inline end
   * (a tab per component under review, its graph, the agent's dials) and,
   * while the kept move animates, the dock at its foot. On a narrower pane
   * they are one drawer across the page's foot, its head the switch between
   * its two faces and Hide. Every bar is floating glass groups of bare
   * symbols, three at most, with no title and no ground (DESIGN.md, The
   * Title Bars Follow Liquid Glass Rule).
   *
   * The panel resizes by its edges (the owner's pick "edges"): its leading
   * edge sets the width, its foot the graph's height, the corner both; the
   * dock's top edge its height; a double-press puts one back. Hide folds the
   * panel's shell into a tab tucked at the pane's trailing edge and Show
   * grows it back out of it, one box on one clock (pin 29, The One Object
   * Rule). It tells the page the room it takes, so the component stands
   * clear of it and never moves as it folds.
   */
  import {
    CANVAS_EMBED_FETCHED,
    CANVAS_EMBED_GO,
    CANVAS_EMBED_GRAPH,
    CANVAS_EMBED_READY,
    CANVAS_EMBED_SIZE,
    canvasEmbedUrl,
  } from "@cawco/core/stage";
  import { designGraphWords as words } from "@cawco/core/words/design-graph";
  import { tick, untrack } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  import { frameSize } from "#lib/cawco/frame-observer.js";
  import { dur, numberOf } from "#lib/cawco/motion/curves.svelte.js";
  import {
    TabItem,
    Tabs,
    TabsList,
  } from "#lib/components/ui/fluid-tabs/index.js";
  import {
    IconChevronDown,
    IconChevronRight,
    IconChevronUp,
    IconSteps,
    IconStructure,
    IconZoomIn,
    IconZoomOut,
  } from "#lib/icons.js";
  import type { DesignGraph } from "./design-graph.svelte";
  import GlassGroup from "./GlassGroup.svelte";
  import GraphDials from "./GraphDials.svelte";
  import GraphOptions from "./GraphOptions.svelte";
  import MoveDock from "./MoveDock.svelte";
  import { graphOptions } from "./options.svelte";
  import PlayButton from "./PlayButton.svelte";
  import ResizeHandle, { type HandleState } from "./ResizeHandle.svelte";
  import StateGraph from "./StateGraph.svelte";
  import type { NodePin } from "./StateNode.svelte";
  import StepsBar from "./StepsBar.svelte";
  import { RING, SYMBOL } from "./symbol";

  let {
    address = null,
    commenting = false,
    end = false,
    graph,
    nodePins = new Map(),
    onopenpin,
    onpin,
  }: {
    /** Comment mode: a press on a state pins it as a whole (the primitives spec §4.3). */
    commenting?: boolean;
    /** The pins on each state's node, by story. */
    nodePins?: Map<string, NodePin[]>;
    /** A node pin's pill pressed: its thread opens. */
    onopenpin?: (id: string) => void;
    /** Comment mode, a press on a state. */
    onpin?: (point: StagePoint) => void;
    /** The canvas page's address, absolute: the ultrawide pair's second page stands its embed of the hovered state. Null until the pane has one. */
    address?: string | null;
    /** The sheet's inspector stands beside the page: the graph stands clear of it, as the page does. */
    end?: boolean;
    graph: DesignGraph;
  } = $props();

  let host = $state<HTMLElement>();
  let hostWidth = $state(0);
  let hostHeight = $state(0);
  let panel = $state<HTMLElement>();
  let panelBox = $state({ w: 0, h: 0 });
  let dockBox = $state({ w: 0, h: 0 });
  let headHeight = $state(0);
  let zoom = $state(1);
  /** A drawer's pinned slab name (call 9's first side): its bar over the well says it, so it covers no state. */
  let pinnedSection = $state<string | null>(null);
  let stateGraph = $state<ReturnType<typeof StateGraph>>();
  let hide = $state<HTMLButtonElement>();
  let shell = $state<HTMLButtonElement>();

  /** A pane at least twice the panel's width holds it beside the page; a narrower one as one drawer at its foot. */
  const desk = $derived(
    hostWidth > 0 && hostWidth >= 2 * numberOf("--c-graph-panel-w")
  );
  /** How far the floating surfaces stand in from the pane's edges. */
  const inset = $derived(numberOf(desk ? "--space-3" : "--space-2"));
  const sections = $derived(graph.model?.sections ?? []);
  const hasMove = $derived(!!graph.move);
  const zoomLabel = $derived(`${Math.round(zoom * 100)}%`);
  /** The step slider stands over the page's top; the graph's panel folds to its tab (the primitives spec §1.2). */
  const onSteps = $derived(graph.index === "steps");
  /** The panel shown: open, and the graph the index standing. */
  const panelOpen = $derived(graph.open && !onSteps);
  /** The steps bar's stack (its bar, the dials' row with it) as tall as it stands; 0 folded or peeked. */
  let barHeight = $state(0);
  /** Where the steps bar stands: Dessn's field over the page's top, the scrubber and the player at its foot (call 1). */
  const barAtTop = $derived(graphOptions.sides.bar === "field");

  /* --- Sizes: the panel's width, the graph's height, the dock's height ---- */

  /** The panel's width: the person's, held between two narrow states side by side and leaving the page two. */
  const widthFloor = () =>
    2 * numberOf("--c-graph-node-min-w") + 4 * numberOf("--space-3");
  const widthCeil = () =>
    Math.max(
      widthFloor(),
      hostWidth - 2 * inset - 2 * numberOf("--c-graph-node-w")
    );
  const panelWidth = $derived(
    Math.round(
      Math.min(
        widthCeil(),
        Math.max(widthFloor(), graph.panelW ?? numberOf("--c-graph-panel-w"))
      )
    )
  );
  /** The graph's height: the person's, else its own up to the panel's room. */
  const graphFloor = () => 4 * numberOf("--c-row-h");
  const graphHeight = $derived(
    graph.graphH === null
      ? null
      : Math.round(
          Math.max(graphFloor(), Math.min(hostHeight - 2 * inset, graph.graphH))
        )
  );
  /** The dock folded as far as it goes: its head row whole, under its top padding (`pt-space-1`) inside its border. */
  const dockFloor = () =>
    numberOf("--c-row-h") +
    numberOf("--space-1") +
    2 * numberOf("--border-width");
  /** The dock's height: the person's, else its rows', never past what leaves the page its floor. */
  const dockCeil = () =>
    Math.max(
      dockFloor(),
      hostHeight - 2 * inset - numberOf("--c-page-h-floor")
    );
  const dockHeight = $derived(
    graph.dockH === null
      ? null
      : Math.round(Math.max(dockFloor(), Math.min(dockCeil(), graph.dockH)))
  );

  /* --- The drawer's stops: its head alone, peek, full ---------------------- */

  type Stop = "head" | "peek" | "full";
  let stop = $state<Stop>("peek");
  /**
   * On Steps the timeline is the drawer's one face, resting at its head (the
   * move's name and Play, as Music's mini player rests on its tab bar) so the
   * page keeps the screen; the grabber, a drag or the name opens it to its
   * detents (HIG Sheets: a grabber's tap cycles them).
   */
  let stepsStop = $state<Stop>("head");
  let dragged = $state<number | null>(null);
  /** A length token in px whatever its unit (`45dvh`, `85vh`), measured on a probe as the pane resolves it. */
  let probe = $state<HTMLElement>();
  const lengthOf = (token: `--${string}`): number => {
    if (!probe) {
      return 0;
    }
    probe.style.blockSize = `var(${token})`;
    return probe.getBoundingClientRect().height;
  };
  const stopHeight = (one: Stop): number => {
    if (one === "head") {
      return headHeight + 1;
    }
    const most = hostHeight - inset;
    return Math.round(
      Math.min(
        most,
        lengthOf(one === "full" ? "--c-sheet-max-h" : "--c-graph-drawer-stop")
      )
    );
  };
  /** On Steps with no move the bar holds the switch, so the drawer stands nowhere. */
  const drawerShown = $derived(!(onSteps && !hasMove));
  /** The detent the drawer rests at: on Steps the timeline's own, else the graph's while it is open. */
  const restsAt = $derived.by((): Stop => {
    if (onSteps) {
      return stepsStop;
    }
    return graph.open ? stop : "head";
  });
  const drawerHeight = $derived(
    drawerShown ? (dragged ?? stopHeight(restsAt)) : 0
  );

  /** What stands at the pane's foot under the page: the drawer on a narrow pane, the dock beside the panel on a desk. */
  const footRoom = $derived.by(() => {
    if (!desk) {
      return drawerHeight;
    }
    return hasMove ? dockBox.h + 2 * inset : 0;
  });
  /** The steps bar's room, with a gap past it, at the edge it stands at. */
  const barRoom = $derived(
    onSteps && barHeight > 0 ? barHeight + 2 * inset : 0
  );

  // The room it takes, said to the page: a desk's panel its width at the inline end whether folded or not (the
  // component never moves as it folds), the dock its height at the foot, a drawer its height at the foot; the steps bar
  // its height at its edge; on a wide window, every column beside the kept page's.
  $effect(() => {
    if (hostWidth === 0) {
      return;
    }
    const endRoom = desk ? panelWidth + 2 * inset : 0;
    const top = barAtTop ? barRoom : 0;
    const bottom = footRoom + (barAtTop ? 0 : barRoom);
    const endAll = endRoom + (columns - 1) * columnWidth;
    untrack(() => graph.room(endAll, bottom, top));
  });

  /* --- A wide window (call 2): the row of states beside the kept page, or the pair --- */

  /** The room beside the panel for pages, on a desk with a page to embed. */
  const wideRoom = $derived(
    desk && address ? hostWidth - (panelWidth + 2 * inset) : 0
  );
  /** The width a state's page takes: its widest story as an embed said it, with a gutter each side; null until one has. */
  let storyWidth = $state<number | null>(null);
  const stateWidth = $derived(
    storyWidth === null ? null : storyWidth + 2 * numberOf("--space-6")
  );
  const rowing = $derived(graphOptions.sides.wide === "row");
  /** The pages across: the kept one and the states beside it, as many as the component's width lets stand. */
  const columns = $derived.by(() => {
    if (wideRoom <= 0 || graph.steps.length < 2) {
      return 1;
    }
    if (!rowing) {
      return wideRoom >= numberOf("--c-pair-min-w") ? 2 : 1;
    }
    if (stateWidth === null) {
      return 1;
    }
    return Math.max(
      1,
      Math.min(graph.steps.length, Math.floor(wideRoom / stateWidth))
    );
  });
  const columnWidth = $derived(
    columns > 1 ? Math.floor(wideRoom / columns) : 0
  );
  /** A page beside the kept one hugs its story, so its edge, lit by a hover, draws round the state and not the column. */
  const pageWidth = $derived(
    Math.min(
      columnWidth - inset,
      (storyWidth ?? columnWidth) + 2 * numberOf("--space-1")
    )
  );
  /** The pair (the owner's pick "pair"): the hovered state's page beside the kept one, once a hover rests. */
  const pairing = $derived(!rowing && columns === 2);
  // Any page beside the kept one stands the hover there, so the kept page is never asked to preview it.
  $effect(() => {
    const on = columns > 1;
    untrack(() => graph.setPairing(on));
  });
  /**
   * The row (Dessn's flow, Unfold's slots): the stops after the kept one,
   * in order, as many as the columns hold; the stop a pointer rests on
   * stands beside the kept page when it isn't in the row already.
   */
  const rowSteps = $derived.by(() => {
    if (!rowing || columns < 2) {
      return [];
    }
    const at = Math.max(0, graph.at);
    const row = graph.steps
      .slice(at + 1)
      .filter((one) => !one.missing)
      .slice(0, columns - 1);
    const { peek } = graph;
    const hovered = peek
      ? graph.steps.find((one) => one.point.story === peek.story)
      : undefined;
    if (
      hovered &&
      hovered.point.story !== graph.keptHere?.story &&
      !row.includes(hovered)
    ) {
      if (row.length === columns - 1) {
        row.pop();
      }
      row.unshift(hovered);
    }
    return row;
  });
  /** The row's first page is measured before the columns are known: one embed of the kept state, unseen. */
  const measuring = $derived(
    rowing &&
      wideRoom > 0 &&
      stateWidth === null &&
      !!address &&
      !!graph.keptHere
  );
  /** What the Options card stands clear of at the pane's foot. */
  const optionsFoot = $derived(footRoom + (barAtTop ? 0 : barRoom));
  /** The pair's page, made on the first hover and kept for the session: its embed of the hovered state alone. */
  let pairSeen = $state<string | null>(null);
  // A hover that rests: the pair's page stands the hovered state; one passed over on the way stands none.
  $effect(() => {
    const { peek } = graph;
    if (!(pairing && address && peek)) {
      return;
    }
    const next = canvasEmbedUrl(address, [peek.story]);
    const rest = setTimeout(() => {
      pairSeen = next;
    }, dur("--dur-peek"));
    return () => clearTimeout(rest);
  });
  // Each embed asks for its graph before it fetches any of it (core CANVAS_EMBED_GRAPH): each takes its share at once,
  // is told when it has arrived, and says its shape, which sets the row's columns.
  $effect(() => {
    if (!(pairing || rowing)) {
      return;
    }
    const heard = (event: MessageEvent) => {
      const said = event.data as {
        type?: unknown;
        urls?: unknown;
        width?: unknown;
      } | null;
      const frame = [
        ...(host?.querySelectorAll<HTMLIFrameElement>("iframe[data-embed]") ??
          []),
      ].find((one) => one.contentWindow === event.source);
      if (!(frame && said)) {
        return;
      }
      const { origin } = new URL(frame.src);
      if (said.type === CANVAS_EMBED_GRAPH) {
        frame.contentWindow?.postMessage(
          {
            type: CANVAS_EMBED_GO,
            urls: Array.isArray(said.urls) ? said.urls : [],
          },
          origin
        );
      } else if (said.type === CANVAS_EMBED_FETCHED) {
        frame.contentWindow?.postMessage(
          { type: CANVAS_EMBED_READY, urls: [] },
          origin
        );
      } else if (
        said.type === CANVAS_EMBED_SIZE &&
        typeof said.width === "number" &&
        said.width > 0
      ) {
        storyWidth = Math.ceil(said.width);
      }
    };
    addEventListener("message", heard);
    return () => removeEventListener("message", heard);
  });

  /* --- Hide and Show: one box folding into its tab and back --------------- */

  async function setOpen(open: boolean): Promise<void> {
    if (open && onSteps) {
      graph.setIndex("graph");
    }
    graph.setOpen(open);
    if (!(desk || open)) {
      stop = "head";
    } else if (!desk && stop === "head") {
      stop = "peek";
    }
    await tick();
    (open ? hide : shell)?.focus({ preventScroll: true });
  }

  /* --- Resizing by the edges ----------------------------------------------- */

  let panelHandle = $state<HandleState>({ a: null, b: null, held: false });
  let dockHandle = $state<HandleState>({ a: null, b: null, held: false });

  /** A pointer on an edge's band: the leg reaches past it along that edge, from the corner. */
  function reach(
    which: "panel" | "dock",
    edge: "a" | "b" | "ab",
    event: PointerEvent | null
  ): void {
    const box = (which === "panel" ? panel : dock)?.getBoundingClientRect();
    const handle = which === "panel" ? panelHandle : dockHandle;
    if (handle.held) {
      return;
    }
    const extra = numberOf("--c-handle-reach");
    const next: HandleState = { a: null, b: null, held: false };
    if (box && event) {
      const fromCorner =
        which === "panel"
          ? { a: box.bottom - event.clientY, b: event.clientX - box.left }
          : { a: event.clientY - box.top, b: box.right - event.clientX };
      if (edge === "a" || edge === "ab") {
        next.a = Math.max(
          numberOf("--radius-panel") + extra,
          fromCorner.a + extra
        );
      }
      if (edge === "b" || edge === "ab") {
        next.b = Math.max(
          numberOf("--radius-panel") + extra,
          fromCorner.b + extra
        );
      }
    }
    if (which === "panel") {
      panelHandle = next;
    } else {
      dockHandle = next;
    }
  }

  /** A drag on an edge's band or the corner: the width, the graph's height or the dock's, from where the press began. */
  function resizeDown(
    which: "panel" | "dock",
    edge: "a" | "b" | "ab",
    event: PointerEvent
  ): void {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    const target = event.currentTarget as HTMLElement;
    target.setPointerCapture(event.pointerId);
    const x0 = event.clientX;
    const y0 = event.clientY;
    const w0 = panelWidth;
    const g0 =
      graphHeight ??
      panel?.querySelector<HTMLElement>("[data-design-graph]")?.offsetHeight ??
      0;
    const d0 = dockHeight ?? dockBox.h;
    const held = (state: HandleState): HandleState => ({
      ...state,
      held: true,
    });
    if (which === "panel") {
      panelHandle = held({
        a: edge === "b" ? null : panelBox.h,
        b: edge === "a" ? null : panelBox.w,
        held: true,
      });
    } else {
      dockHandle = held({ a: null, b: dockBox.w, held: true });
    }
    target.onpointermove = (one) => {
      const dx = one.clientX - x0;
      const dy = one.clientY - y0;
      if (which === "dock") {
        graph.resize({
          dockH: Math.max(dockFloor(), Math.min(dockCeil(), d0 - dy)),
        });
        return;
      }
      if (edge !== "b") {
        // The leading edge: a drag toward the page widens the panel (its end stays put).
        graph.resize({
          panelW: Math.max(widthFloor(), Math.min(widthCeil(), w0 - dx)),
        });
      }
      if (edge !== "a") {
        graph.resize({
          graphH: Math.max(
            graphFloor(),
            Math.min(hostHeight - 2 * inset, g0 + dy)
          ),
        });
      }
    };
    const done = (one: PointerEvent) => {
      target.onpointermove = null;
      target.onpointerup = null;
      target.onpointercancel = null;
      if (which === "panel") {
        panelHandle = { a: null, b: null, held: false };
      } else {
        dockHandle = { a: null, b: null, held: false };
      }
      reach(which, edge, one.type === "pointerup" ? one : null);
    };
    target.onpointerup = done;
    target.onpointercancel = done;
  }

  /** A double-press on a handle puts its size back to its own. */
  function restore(which: "panel" | "dock", edge: "a" | "b" | "ab"): void {
    if (which === "dock") {
      graph.resize({ dockH: null });
      return;
    }
    graph.resize({
      ...(edge === "b" ? {} : { panelW: null }),
      ...(edge === "a" ? {} : { graphH: null }),
    });
  }

  /** The corner square a key reaches: arrows step the size, Enter puts it back. */
  function resizeKey(which: "panel" | "dock", event: KeyboardEvent): void {
    const step = event.shiftKey ? 48 : 12;
    if (event.key === "Enter") {
      event.preventDefault();
      restore(which, which === "panel" ? "ab" : "b");
      return;
    }
    if (which === "dock") {
      const dy = { ArrowUp: step, ArrowDown: -step }[event.key];
      if (dy) {
        event.preventDefault();
        graph.resize({
          dockH: Math.max(
            dockFloor(),
            Math.min(dockCeil(), (dockHeight ?? dockBox.h) + dy)
          ),
        });
      }
      return;
    }
    const dw = { ArrowLeft: step, ArrowRight: -step }[event.key];
    const dh = { ArrowDown: step, ArrowUp: -step }[event.key];
    if (dw) {
      event.preventDefault();
      graph.resize({
        panelW: Math.max(widthFloor(), Math.min(widthCeil(), panelWidth + dw)),
      });
    } else if (dh) {
      event.preventDefault();
      const now =
        graphHeight ??
        panel?.querySelector<HTMLElement>("[data-design-graph]")
          ?.offsetHeight ??
        graphFloor();
      graph.resize({
        graphH: Math.max(
          graphFloor(),
          Math.min(hostHeight - 2 * inset, now + dh)
        ),
      });
    }
  }

  let dock = $state<HTMLElement>();

  /* --- The drawer's head: a press on the grabber steps it, a drag moves it -- */

  function headDown(event: PointerEvent): void {
    if (
      event.button !== 0 ||
      desk ||
      (event.target as Element).closest("[data-glass]")
    ) {
      return;
    }
    const { pointerId } = event;
    const y0 = event.clientY;
    const h0 = drawerHeight;
    let moved = false;
    // Followed on the window, never captured: a press that stays put stays the grabber's own click (a capture takes the click to the head), and a drag past the head is still heard.
    const move = (one: PointerEvent) => {
      if (one.pointerId !== pointerId) {
        return;
      }
      const dy = one.clientY - y0;
      if (!moved && Math.abs(dy) < 6) {
        return;
      }
      moved = true;
      dragged = Math.max(
        stopHeight("head"),
        Math.min(stopHeight("full"), h0 - dy)
      );
    };
    const done = (one: PointerEvent) => {
      if (one.pointerId !== pointerId) {
        return;
      }
      removeEventListener("pointermove", move);
      removeEventListener("pointerup", done);
      removeEventListener("pointercancel", done);
      if (moved && dragged !== null) {
        const at = dragged;
        const nearestStop = (["head", "peek", "full"] as const).reduce(
          (a, b) =>
            Math.abs(stopHeight(a) - at) <= Math.abs(stopHeight(b) - at) ? a : b
        );
        dragged = null;
        if (onSteps) {
          stepsStop = nearestStop;
        } else if (nearestStop === "head") {
          setOpen(false);
        } else {
          stop = nearestStop;
          graph.setOpen(true);
        }
      }
    };
    addEventListener("pointermove", move);
    addEventListener("pointerup", done);
    addEventListener("pointercancel", done);
  }
  function grabberPress(): void {
    if (onSteps) {
      stepsStop = ({ head: "peek", peek: "full", full: "head" } as const)[
        stepsStop
      ];
      return;
    }
    if (!graph.open) {
      setOpen(true);
      return;
    }
    stop = stop === "peek" ? "full" : "peek";
  }

  /** Under a finger every band and the corner take the touch floor's room. */
  const finger = new MediaQuery("pointer: coarse");
  const bandSize = $derived(
    numberOf(finger.current ? "--c-side-divider-hit" : "--c-handle-band")
  );
  const cornerSquare = $derived(
    numberOf(finger.current ? "--c-side-divider-hit" : "--c-handle-corner")
  );
  const radius = $derived(numberOf("--radius-panel"));
  /** Folded, the shell is the tab tucked flush at the pane's trailing edge: its insets in the panel's own box. */
  const tucked = $derived(numberOf("--c-tucked-tab"));
  /** A band's place on its side, in px; `auto` where the side is free. */
  const place = (value: number | undefined) =>
    value === undefined ? "auto" : `${value}px`;
  /** A handle's box on its custom properties (its classes read them): each side, its height and width. */
  const placed =
    (vars: Record<string, number>) =>
    (node: HTMLElement): void => {
      for (const [property, side] of [
        ["--b", "b"],
        ["--l", "l"],
        ["--r", "r"],
        ["--sh", "h"],
        ["--sw", "w"],
        ["--t", "t"],
      ] as const) {
        node.style.setProperty(property, place(vars[side]));
      }
    };
  const SHELL_OPEN =
    "rounded-panel border-e shadow-overlay-hung pointer-events-none";
  const SHELL_FOLDED =
    "rounded-s-lg rounded-e-none border-e-0 shadow-tile pointer-events-auto";
</script>

<div
  bind:this={host}
  {@attach frameSize((node: HTMLElement) => {
    hostWidth = node.clientWidth;
    hostHeight = node.clientHeight;
  })}
  class="pointer-events-none absolute inset-0 z-(--layer-dock) overflow-hidden data-end:end-c-sheet-inspector-w"
  data-design-graph-host
  data-end={end || undefined}
>
  <!-- Where a length token in a viewport's units is read in px. -->
  <span bind:this={probe} aria-hidden="true" class="invisible absolute w-0"
  ></span>
  {#if graph.section && graph.graph}
    {#snippet graphBody()}
      {#if graph.section?.state === "waiting" && graph.section.stories.length === 0}
        <p class="m-0 p-space-3 type-meta text-ink-muted" role="status">
          {words.waiting}
        </p>
      {:else if graph.section?.state === "failed"}
        <p
          class="m-0 p-space-3 type-body text-status-fail-ink text-pretty"
          role="status"
        >
          {words.failed}
        </p>
      {:else if graph.section && graph.graph}
        <StateGraph
          bind:this={stateGraph}
          bind:pinned={pinnedSection}
          bind:zoom
          {commenting}
          drawer={!desk}
          {onopenpin}
          {onpin}
          pins={nodePins}
          file={graph.section.file}
          graph={graph.graph}
          height={desk ? graphHeight : null}
          kept={graph.keptHere}
          onkeep={(point) => graph.keepAt(point)}
          onpreview={(point) => graph.preview(point)}
          peek={graph.peek}
          sectionName={graph.section.name}
        />
      {/if}
      <GraphDials {graph} />
    {/snippet}
    {#snippet tabs()}
      {#if sections.length > 1}
        <GlassGroup class="min-w-0 shrink">
          <Tabs
            onValueChange={(file) => graph.show(file)}
            size="compact"
            value={graph.file ?? undefined}
          >
            <TabsList aria-label={words.components} scrollable>
              {#each sections as section (section.file)}
                <TabItem label={section.name} value={section.file} />
              {/each}
            </TabsList>
          </Tabs>
        </GlassGroup>
      {/if}
    {/snippet}
    {#snippet indexSwitch(glass = true)}
      <!-- The two indexes over one stage (the primitives spec §0): two glyphs, the kit's segmented control; bare where the bar it stands in is the glass. -->
      {#snippet segments()}
        <Tabs
          onValueChange={(index) =>
            graph.setIndex(index === "steps" ? "steps" : "graph")}
          size="compact"
          value={graph.index}
        >
          <TabsList aria-label={words.views}>
            <TabItem
              glyphOnly
              icon={IconSteps}
              label={words.steps}
              value="steps"
            />
            <TabItem
              glyphOnly
              icon={IconStructure}
              label={words.graphView}
              value="graph"
            />
          </TabsList>
        </Tabs>
      {/snippet}
      {#if glass}
        <GlassGroup>{@render segments()}</GlassGroup>
      {:else}
        {@render segments()}
      {/if}
    {/snippet}
    {#snippet zoomGroup()}
      <!-- mark-line: the zoom's figure is a control of its own between two symbols, not words beside a mark -->
      <GlassGroup label={words.zoom}>
        <button
          aria-label={words.zoomOut}
          class={SYMBOL}
          onclick={() => stateGraph?.zoomOut()}
          title={words.zoomOutTip}
          type="button"><IconZoomOut /></button
        >
        <button
          aria-label={words.fitAll}
          class="{SYMBOL} w-auto min-w-c-bar-item px-space-1 type-code text-ink-strong tabular-nums"
          data-zoom-level
          onclick={() => stateGraph?.fit()}
          title={words.fitAll}
          type="button">{zoomLabel}</button
        >
        <button
          aria-label={words.zoomIn}
          class={SYMBOL}
          onclick={() => stateGraph?.zoomIn()}
          title={words.zoomInTip}
          type="button"><IconZoomIn /></button
        >
      </GlassGroup>
    {/snippet}
    {#snippet band(
      which: "panel" | "dock",
      edge: "a" | "b",
      name: string,
      cursor: string,
      vars: Record<string, number>
    )}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        aria-hidden="true"
        class={[
          "absolute z-6 top-(--t) right-(--r) bottom-(--b) left-(--l) h-(--sh) w-(--sw) touch-none",
          cursor,
        ]}
        {@attach placed(vars)}
        data-sash={name}
        ondblclick={() => restore(which, edge)}
        onpointerdown={(event) => resizeDown(which, edge, event)}
        onpointerleave={() => reach(which, edge, null)}
        onpointermove={(event) => reach(which, edge, event)}
      ></div>
    {/snippet}
    {#snippet corner(
      which: "panel" | "dock",
      edge: "b" | "ab",
      name: string,
      cursor: string,
      vars: Record<string, number>,
      label: string,
      orientation: "horizontal" | "vertical"
    )}
      <!-- biome-ignore lint/a11y/useSemanticElements: a focusable separator that resizes (the ARIA window splitter pattern); an hr takes no focus and no keys. -->
      <div
        aria-label={label}
        aria-orientation={orientation}
        aria-valuenow={which === "panel" ? panelWidth : Math.round(dockBox.h)}
        class={[
          "absolute z-6 top-(--t) right-(--r) bottom-(--b) left-(--l) h-(--sh) w-(--sw) touch-none rounded-sm",
          cursor,
          RING,
        ]}
        {@attach placed(vars)}
        data-sash={name}
        ondblclick={() => restore(which, edge)}
        onkeydown={(event) => resizeKey(which, event)}
        onpointerdown={(event) => resizeDown(which, edge, event)}
        onpointerleave={() => reach(which, edge, null)}
        onpointermove={(event) => reach(which, edge, event)}
        role="separator"
        tabindex="0"
      ></div>
    {/snippet}

    {#if onSteps && graph.steps.length > 0}
      <!-- The steps bar (call 1) with the dials: across the page's room, less the panel's, at the edge its side stands at; over the drawer or the dock at the foot. -->
      <div
        class={[
          "pointer-events-none absolute start-(--inset) end-(--se) z-1 flex",
          barAtTop ? "top-(--inset)" : "bottom-(--foot) justify-center",
        ]}
        data-steps-host
        style:--foot={`${footRoom + inset}px`}
        style:--inset={`${inset}px`}
        style:--se={`${desk ? panelWidth + 2 * inset : inset}px`}
      >
        <StepsBar
          {graph}
          onbox={(height) => {
            barHeight = height;
          }}
          phone={!desk}
        >
          {#snippet switcher()}{@render indexSwitch(false)}{/snippet}
          {#snippet dials()}<GraphDials {graph} layout="row" />{/snippet}
        </StepsBar>
      </div>
    {/if}
    {#snippet pageAt(
      start: number,
      width: number,
      src: string,
      title: string,
      lit: boolean
    )}
      <!-- A page beside the kept one: its state's embed alone, at rest; it takes no input and carries no pins. -->
      <iframe
        class={[
          "absolute top-(--top) bottom-(--bottom) start-(--start) w-(--w) rounded-panel border bg-surface-page transition-[border-color,opacity] duration-(--dur-fade) ease-out",
          lit ? "border-border-control-strong" : "border-border-hairline",
        ]}
        data-embed
        inert
        sandbox="allow-scripts allow-same-origin"
        {src}
        style:--bottom={`${footRoom + (barAtTop ? 0 : barRoom) + inset}px`}
        style:--start={`${start}px`}
        style:--top={`${(barAtTop ? barRoom : 0) + inset}px`}
        style:--w={`${width}px`}
        tabindex="-1"
        {title}
      ></iframe>
    {/snippet}
    {#if measuring && address && graph.keptHere}
      <!-- The kept state's embed, unseen, until it says how wide the component stands: the row's columns follow from it. -->
      <iframe
        aria-hidden="true"
        class="invisible absolute top-0 start-0 h-px w-(--w) border-0"
        data-embed
        inert
        sandbox="allow-scripts allow-same-origin"
        src={canvasEmbedUrl(address, [graph.keptHere.story])}
        style:--w={`${wideRoom}px`}
        tabindex="-1"
        title={words.pairTitle}
      ></iframe>
    {/if}
    {#if address && columns > 1}
      {#if rowing}
        {#each rowSteps as step, at (step.point.story)}
          {@const start = (at + 1) * columnWidth + inset}
          {@render pageAt(
            start,
            pageWidth,
            canvasEmbedUrl(address, [step.point.story]),
            words.rowTitle(step.name),
            graph.peek?.story === step.point.story
          )}
          <!-- Its name over its top edge, and the page's press, which keeps it: the row is a sequence to step along. -->
          <button
            aria-label={words.keepState(step.name)}
            class="group/page pointer-events-auto absolute top-(--top) bottom-(--bottom) start-(--start) w-(--w) rounded-panel {RING}"
            data-row-page={step.point.story}
            onclick={() => graph.keepAt(step.point)}
            onpointerenter={() => graph.preview(step.point)}
            onpointerleave={() => graph.preview(null)}
            style:--bottom={`${footRoom + (barAtTop ? 0 : barRoom) + inset}px`}
            style:--start={`${start}px`}
            style:--top={`${(barAtTop ? barRoom : 0) + inset}px`}
            style:--w={`${pageWidth}px`}
            title={words.keepState(step.name)}
            type="button"
          >
            <!-- Its name on the page's top edge, as a legend stands on a fieldset's, clear of what the page draws. -->
            <span
              class="absolute -top-space-2 start-space-3 max-w-full truncate rounded-xs bg-surface-page px-space-1 type-meta text-ink-muted group-hover/page:text-ink-strong"
              >{step.name}</span
            >
          </button>
        {/each}
      {:else if pairSeen}
        <div
          class={[
            "transition-opacity duration-(--dur-fade) ease-out",
            graph.peek ? "opacity-100" : "opacity-0",
          ]}
          data-pair
        >
          {@render pageAt(
            columnWidth + inset,
            pageWidth,
            pairSeen,
            words.pairTitle,
            false
          )}
        </div>
      {/if}
    {/if}
    {#if desk}
      <!-- The panel: its shell is its surface, which Hide folds into the tab and Show grows back out of. -->
      <aside
        bind:this={panel}
        {@attach frameSize((node: HTMLElement) => {
          panelBox = { w: node.offsetWidth, h: node.offsetHeight };
        })}
        aria-label={words.graph}
        class={[
          "absolute top-(--inset) right-(--inset) flex max-h-(--most) w-(--pw) flex-col gap-space-2 p-space-2",
          panelOpen ? "pointer-events-auto" : "pointer-events-none",
        ]}
        data-graph-panel="desk"
        data-open={panelOpen}
        style:--inset={`${inset}px`}
        style:--most={`${Math.max(0, hostHeight - 2 * inset)}px`}
        style:--pw={`${panelWidth}px`}
      >
        <button
          bind:this={shell}
          aria-hidden={panelOpen || undefined}
          aria-label={words.show}
          class={[
            "absolute -z-1 top-0 right-(--se) bottom-(--sb) left-(--ss) border border-border-control bg-surface-raised transition-[top,right,bottom,left,border-radius,border-width,box-shadow] duration-(--dur-panel) ease-drawer motion-reduce:transition-none",
            panelOpen ? SHELL_OPEN : SHELL_FOLDED,
            RING,
          ]}
          data-show-graph
          onclick={() => setOpen(true)}
          style:--sb={panelOpen
            ? "0px"
            : `${Math.max(0, panelBox.h - tucked)}px`}
          style:--se={panelOpen ? "0px" : `${-inset}px`}
          style:--ss={panelOpen
            ? "0px"
            : `${Math.max(0, panelBox.w + inset - tucked)}px`}
          tabindex={panelOpen ? -1 : 0}
          title={words.show}
          type="button"
        >
          <span
            class={[
              "absolute -top-px -left-px grid size-c-tucked-tab place-items-center text-ink-muted transition-opacity ease-out hover:text-ink-strong [&_svg]:size-c-bar-symbol",
              panelOpen
                ? "opacity-0 duration-(--dur-exit)"
                : "opacity-100 delay-(--dur-exit) duration-(--dur-exit)",
            ]}><IconStructure /></span
          >
        </button>
        <div
          class={[
            "flex min-w-0 flex-none items-center gap-space-2 transition-opacity ease-out",
            panelOpen
              ? "opacity-100 delay-(--dur-exit) duration-(--dur-exit)"
              : "opacity-0 duration-(--dur-exit)",
          ]}
          inert={!panelOpen}
        >
          {@render tabs()}
          <div class="ms-auto flex flex-none items-center gap-space-2">
            {@render indexSwitch()}
            {@render zoomGroup()}
            <GlassGroup>
              <button
                bind:this={hide}
                aria-expanded={panelOpen}
                aria-label={words.hide}
                class={SYMBOL}
                data-hide-graph
                onclick={() => setOpen(false)}
                title={words.hide}
                type="button"><IconChevronRight /></button
              >
            </GlassGroup>
          </div>
        </div>
        <div
          class={[
            "flex min-h-0 flex-1 flex-col transition-opacity ease-out",
            panelOpen
              ? "opacity-100 delay-(--dur-exit) duration-(--dur-exit)"
              : "opacity-0 duration-(--dur-exit)",
          ]}
          inert={!panelOpen}
        >
          {@render graphBody()}
        </div>
        {#if panelOpen}
          <!-- Resizing: bands on the leading edge and the foot take a pointer (44px under a finger); the corner square is the one
               separator a key reaches. -->
          {@render band("panel", "a", "width", "cursor-ew-resize", {
            t: radius,
            b: cornerSquare,
            l: -bandSize / 2,
            w: bandSize,
          })}
          {@render band("panel", "b", "height", "cursor-ns-resize", {
            l: cornerSquare,
            r: radius,
            b: -bandSize / 2,
            h: bandSize,
          })}
          {@render corner(
            "panel",
            "ab",
            "corner",
            "cursor-nesw-resize",
            {
              l: -bandSize / 2,
              b: -bandSize / 2,
              w: cornerSquare,
              h: cornerSquare,
            },
            words.resizePanel,
            "vertical"
          )}
          <ResizeHandle
            corner="bl"
            handle={panelHandle}
            height={panelBox.h}
            width={panelBox.w}
          />
        {/if}
      </aside>

      {#if graph.move}
        <!-- The dock: the kept move's clips, at the page's foot beside the panel. -->
        <section
          bind:this={dock}
          {@attach frameSize((node: HTMLElement) => {
            dockBox = { w: node.offsetWidth, h: node.offsetHeight };
          })}
          class={[
            "pointer-events-auto absolute right-(--de) bottom-(--inset) left-(--inset) flex max-h-(--dmost) flex-col rounded-panel border border-border-control bg-surface-raised pt-space-1 shadow-overlay-hung",
            dockHeight !== null && "h-(--dh)",
          ]}
          data-graph-dock="desk"
          style:--de={`${panelWidth + 2 * inset}px`}
          style:--dh={dockHeight === null ? undefined : `${dockHeight}px`}
          style:--dmost={`${dockCeil()}px`}
          style:--inset={`${inset}px`}
        >
          <MoveDock {graph} />
          {@render band("dock", "b", "dock", "cursor-ns-resize", {
            l: radius,
            r: cornerSquare,
            t: -bandSize / 2 - 1,
            h: bandSize,
          })}
          {@render corner(
            "dock",
            "b",
            "dock-corner",
            "cursor-ns-resize",
            {
              r: -bandSize / 2 - 1,
              t: -bandSize / 2 - 1,
              w: cornerSquare,
              h: cornerSquare,
            },
            words.resizeDock,
            "horizontal"
          )}
          <ResizeHandle
            corner="tr"
            handle={dockHandle}
            height={dockBox.h}
            width={dockBox.w}
          />
        </section>
      {/if}
    {:else if drawerShown}
      <!-- The drawer: one surface, its head the faces' switch and Hide, its height at its stop. -->
      <aside
        aria-label={words.graph}
        class={[
          "pointer-events-auto absolute inset-x-0 bottom-0 flex h-(--drawer-h) flex-col rounded-t-panel border-t border-border-control bg-surface-raised shadow-overlay-hung",
          dragged === null &&
            "transition-[height] duration-(--dur-panel) ease-drawer motion-reduce:transition-none",
        ]}
        data-graph-panel="drawer"
        data-open={graph.open}
        style:--drawer-h={`${drawerHeight}px`}
      >
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <header
          {@attach frameSize((node: HTMLElement) => {
            headHeight = node.offsetHeight;
          })}
          class={[
            "relative flex flex-none touch-none items-center justify-center gap-space-2 pt-space-3 pb-space-2",
            onSteps ? "px-c-btn-h-lg" : "px-space-2",
          ]}
          onpointerdown={headDown}
        >
          <button
            aria-label={words.drawer}
            class="absolute top-0 left-1/2 grid h-space-3 w-c-touch-floor -translate-x-1/2 place-items-center touch-hit after:block after:h-c-grabber-h after:w-c-grabber-w after:rounded-pill after:bg-border-control-strong {RING}"
            data-grabber
            onclick={grabberPress}
            type="button"
          ></button>
          {#if !onSteps}{@render indexSwitch()}{/if}
          {#if onSteps && graph.move && stepsStop === "head"}
            <!-- The timeline at rest: Play, and the move's name, which opens it. -->
            <GlassGroup class="absolute start-space-2"
              ><PlayButton {graph} /></GlassGroup
            >
            <button
              class="h-c-btn-h max-w-full min-w-0 truncate rounded-sm px-space-2 type-label text-ink-strong touch-hit {RING}"
              data-timeline-name
              onclick={() => {
                stepsStop = "peek";
              }}
              title={words.timelineShow}
              type="button">{words.move(graph.move.from, graph.move.to)}</button
            >
          {/if}
          {#if !onSteps && hasMove}
            <GlassGroup>
              <Tabs
                onValueChange={(face) => {
                  graph.face = face === "move" ? "move" : "graph";
                  if (!graph.open) {
                    setOpen(true);
                  }
                }}
                size="compact"
                value={graph.face === "move" ? "move" : "graph"}
              >
                <TabsList aria-label={words.faces}>
                  <TabItem label={words.faceGraph} value="graph" />
                  <TabItem label={words.faceTimeline} value="move" />
                </TabsList>
              </Tabs>
            </GlassGroup>
          {/if}
          <GlassGroup class="absolute end-space-2">
            {#if onSteps}
              <button
                aria-expanded={stepsStop !== "head"}
                aria-label={stepsStop === "head"
                  ? words.timelineShow
                  : words.timelineHide}
                class={SYMBOL}
                data-timeline-toggle
                onclick={() => {
                  stepsStop = stepsStop === "head" ? "peek" : "head";
                }}
                title={stepsStop === "head"
                  ? words.timelineShow
                  : words.timelineHide}
                type="button"
              >
                {#if stepsStop === "head"}<IconChevronUp
                  />{:else}<IconChevronDown />{/if}
              </button>
            {:else}
              <button
                bind:this={hide}
                aria-expanded={graph.open}
                aria-label={graph.open ? words.hide : words.show}
                class={SYMBOL}
                data-hide-graph
                onclick={() => setOpen(!graph.open)}
                title={graph.open ? words.hide : words.show}
                type="button"
              >
                {#if graph.open}<IconChevronDown />{:else}<IconChevronUp />{/if}
              </button>
            {/if}
          </GlassGroup>
        </header>
        <!-- Clipped to the drawer: folded to its head, what it holds stands inside it, never under the pane's foot. -->
        <div
          class={[
            "flex min-h-0 flex-1 flex-col gap-space-2 overflow-hidden pb-space-2",
            // The timeline lays its own inline room, so its head's hairline runs the drawer's whole width.
            !((onSteps || graph.face === "move") && hasMove) && "px-space-2",
          ]}
          inert={onSteps ? stepsStop === "head" : !graph.open}
        >
          {#if (onSteps || graph.face === "move") && hasMove}
            <MoveDock {graph} />
          {:else if !onSteps}
            <div class="flex min-w-0 items-center gap-space-2">
              {@render tabs()}
              {#if pinnedSection}
                <!-- The section the well's top stands in, while its slab's own name has scrolled out: in the bar, over no state. -->
                <p
                  class="m-0 min-w-0 truncate ps-space-1 type-label text-ink-row"
                  data-pinned="pinned"
                  title={pinnedSection}
                >
                  {pinnedSection}
                </p>
              {/if}
              <div class="ms-auto flex-none">{@render zoomGroup()}</div>
            </div>
            <div class="flex min-h-0 flex-1 flex-col">
              {@render graphBody()}
            </div>
          {/if}
        </div>
      </aside>
    {/if}
  {/if}
  {#if graphOptions.shown}
    <GraphOptions bottom={optionsFoot} />
  {/if}
</div>
