<script lang="ts">
  /**
   * The design graph: where the person judges what an agent built, one live
   * component at a time, and leaves remarks on it (projects plan §5.10, The
   * design graph; it replaces the component canvas's grid of frames).
   *
   * What he does here, in order of how often, and the one part for each:
   * - See the component at a state: the stage, the component itself at its
   *   own width, 1:1, whole, nothing standing over it.
   * - Walk its states: the steps bar (StepsPill), always there, over the
   *   states in the agent's order; it lands only on states.
   * - See how the states connect, and jump to any: the map (MapPanel),
   *   opened by Map, a column at the trailing side that the stage gives
   *   room to. Resting on a state previews it on the stage with washes
   *   behind what changed (on a window wide enough, beside the kept one: the
   *   owner's pick "pair"); a press keeps it.
   * - Judge and tune a move's motion: the dock (MoveDock), at the foot only
   *   while the move into the kept state animates.
   * - Try the data: the dials (DataDials), beside the steps, only on states
   *   that show records.
   * - Remark: the panel's own Comment mode; a pin carries the kept state.
   *
   * Desk: the steps on their own row at the top, the stage under them, the
   * map's column at the end, the dock on its own row at the foot, so no
   * control covers the component. Phone (under 640px): the stage fills the
   * well and one glass bar stands at the foot in the thumb's reach, the
   * steps across it, then Data, Timing and Map, each opening its sheet over
   * the stage's foot.
   *
   * Everything a state needs arrives as props (`graphs`, and where the
   * person stands: `start`), so its states file draws each.
   */
  import { graphWords } from "@cawco/core/words/graph";
  import { tick, untrack } from "svelte";
  import { frameSize } from "#lib/cawco/frame-observer.js";
  import { curveOf, dur, motionOk } from "#lib/cawco/motion/curves.svelte.js";
  import * as Popover from "#lib/components/ui/popover/index.js";
  import Tip from "#lib/components/ui/tooltip/tip.svelte";
  import { IconClock, IconStructure, IconTuning } from "#lib/icons.js";
  import DataDials from "./DataDials.svelte";
  import {
    type Clip,
    type GraphComponent,
    type GraphMove,
    moveLength,
    propsOf,
  } from "./graph";
  import MapPanel from "./MapPanel.svelte";
  import MoveDock from "./MoveDock.svelte";
  import StepsPill from "./StepsPill.svelte";
  import { readValues, type Wash, washesOf } from "./washes";

  let {
    graphs,
    start = {},
    layout = {},
  }: {
    graphs: GraphComponent[];
    /** Where the person stands as it opens (its states file's states). */
    start?: {
      /** The component on show. */
      at?: number;
      /** The kept state, and the one it was reached from. */
      kept?: string;
      cameFrom?: string | null;
      /** A state previewed by a resting pointer. */
      preview?: string | null;
      map?: boolean;
      outline?: boolean;
      mapWidth?: number;
      /** Edits to the kept move's clips, by clip id. */
      edits?: Record<string, Partial<Clip>>;
      showing?: "original" | "edited";
      /** The playhead stands here, 0 to 1. */
      progress?: number | null;
      /** A sheet open on the phone. */
      sheet?: "map" | "dock" | null;
    };
    /**
     * The two layouts still open with the owner (decision page
     * design-graph-room); the one he doesn't pick is deleted. `room`: at a
     * desk, the steps and the dock in rows of their own, or floating over
     * the stage. `bar`: on a phone, the glass bar at the foot or the top.
     */
    layout?: { bar?: "foot" | "top"; room?: "rows" | "float" };
  } = $props();

  // Where the person stands: the story's opening, then his.
  let at = $state(untrack(() => start.at ?? 0));
  const graph = $derived(graphs[at] ?? graphs[0]);
  let keptBy = $state<Record<string, string>>(
    untrack(() => ({
      [graphs[start.at ?? 0]?.file ?? ""]:
        start.kept ?? graphs[start.at ?? 0]?.states[0]?.id ?? "",
    }))
  );
  const kept = $derived(keptBy[graph.file] ?? graph.states[0]?.id ?? "");
  let cameFrom = $state<string | null>(untrack(() => start.cameFrom ?? null));
  let preview = $state<string | null>(untrack(() => start.preview ?? null));
  let mapOpen = $state(untrack(() => start.map ?? false));
  let outline = $state(untrack(() => start.outline ?? false));
  /** A phone's map opens as the list. */
  let phoneOutline = $state(untrack(() => start.outline ?? true));
  const floating = $derived(layout.room === "float");
  const barTop = $derived(layout.bar === "top");
  let dials = $state<Record<string, number>>({});
  let editsBy = $state<Record<string, Record<string, Partial<Clip>>>>({});
  let showing = $state<"original" | "edited">(
    untrack(() => start.showing ?? "edited")
  );
  let sheet = $state<"map" | "dock" | null>(untrack(() => start.sheet ?? null));
  /** A phone's map sheet stands over this share of the well, the stage's top in view above it. */
  const SHEET = 0.62;

  const stateOf = (id: string | null) =>
    graph.states.find((one) => one.id === id) ?? null;
  const keptState = $derived(stateOf(kept) ?? graph.states[0]);

  function keep(id: string) {
    if (id === kept) {
      return;
    }
    cameFrom = kept;
    keptBy = { ...keptBy, [graph.file]: id };
    preview = null;
  }
  function switchTo(next: number) {
    at = next;
    cameFrom = null;
    preview = null;
  }

  /** The kept move: the one from where he came, else the first that animates into the kept state. */
  const keptMove = $derived.by((): GraphMove | null => {
    const into = graph.moves.filter((one) => one.to === kept);
    return (
      into.find((one) => one.from === cameFrom) ??
      into.find((one) => one.clips.length > 0) ??
      null
    );
  });
  const moveKey = $derived(
    keptMove ? `${graph.file}:${keptMove.from}->${keptMove.to}` : ""
  );
  const edits = $derived(editsBy[moveKey] ?? start.edits ?? {});
  const shownDials = $derived(
    graph.dials.filter((one) => keptState.dials?.includes(one.id))
  );
  const animates = $derived(keptMove !== null && keptMove.clips.length > 0);

  // The room the surface has, and its form.
  let width = $state(0);
  let height = $state(0);
  const phone = $derived(width > 0 && width < 640);
  let mapSize = $state<{ height: number; width: number } | null>(null);
  let roomHeight = $state(0);
  const mapRoom = $derived({
    width: Math.max(280, width * 0.6),
    height: Math.max(240, roomHeight),
  });
  const mapBox = $derived({
    width: Math.min(
      mapSize?.width ?? untrack(() => start.mapWidth) ?? 480,
      mapRoom.width
    ),
    height: Math.min(mapSize?.height ?? mapRoom.height, mapRoom.height),
  });

  // The stage: the shown state's props on the live instance.
  let stageWidth = $state(0);
  /** A replay runs: the stage stands at the move's start for a frame. */
  let replayAt = $state<string | null>(null);
  function frameWidth(one: GraphComponent) {
    return Math.min(one.width ?? stageWidth, stageWidth);
  }
  /** On a stage that holds two, a preview stands beside the kept state (the owner's pick "pair"). */
  const pair = $derived(
    !phone &&
      preview !== null &&
      preview !== kept &&
      stageWidth >= 2 * (graph.width ?? stageWidth) + 32
  );
  const shownId = $derived(replayAt ?? (pair ? kept : (preview ?? kept)));
  const previewState = $derived(stateOf(preview));
  const dialKey = $derived(JSON.stringify(dials));
  const instanceOf = (id: string | undefined) =>
    `${graph.file}:${id}:${dialKey}`;

  /** The lengths the edits give the house's tokens on the stage, while Edited plays. */
  const timing = $derived.by((): [string, string][] => {
    if (!keptMove || showing === "original") {
      return [];
    }
    return keptMove.clips.flatMap((clip): [string, string][] => {
      const change = edits[clip.id];
      return clip.token && change?.duration !== undefined
        ? [[clip.token, `${change.duration}ms`]]
        : [];
    });
  });
  /** Sets the edited lengths on the stage's frame, and takes them off again. */
  const timed = (lengths: [string, string][]) => (node: HTMLElement) => {
    for (const [token, value] of lengths) {
      node.style.setProperty(token, value);
    }
    return () => {
      for (const [token] of lengths) {
        node.style.removeProperty(token);
      }
    };
  };

  // The washes: what the preview changed against the kept state. The
  // stage's frame shows the shown state; while a preview stands over the
  // kept one, an unseen copy of the kept state stands beside it to read
  // against; in a pair, the preview's own frame is read against the kept.
  let keptFrame = $state<HTMLElement>();
  let otherFrame = $state<HTMLElement>();
  let washes = $state<Wash[]>([]);
  const comparing = $derived(
    replayAt === null && preview !== null && preview !== kept
  );
  $effect(() => {
    const now = comparing;
    const pairNow = pair;
    const main = keptFrame;
    const side = otherFrame;
    track(shownId, kept, dialKey, at);
    if (!(now && main && side)) {
      washes = [];
      return;
    }
    // Read again whenever either frame changes (a value the component reads
    // from its hub lands a moment after it mounts), once a frame.
    let frame = 0;
    const read = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        washes = pairNow
          ? washesOf(readValues(main), readValues(side))
          : washesOf(readValues(side), readValues(main));
      });
    };
    const watch = new MutationObserver(read);
    for (const one of [main, side]) {
      watch.observe(one, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
      });
    }
    read();
    return () => {
      cancelAnimationFrame(frame);
      watch.disconnect();
    };
  });
  /** Reads what an effect depends on. */
  function track(..._values: unknown[]) {
    // Read for the effect's dependencies.
  }

  // Playing the kept move: the stage stands at its start for a frame, then
  // at the kept state, so the component plays its own motion; the playhead
  // crosses the lanes on the move's own clock.
  let progress = $state<number | null>(untrack(() => start.progress ?? null));
  let playing = $state(false);
  let run = 0;
  async function play() {
    const move = keptMove;
    if (!move) {
      return;
    }
    if (playing) {
      run += 1;
      playing = false;
      progress = null;
      return;
    }
    run += 1;
    const mine = run;
    playing = true;
    progress = 0;
    replayAt = move.from;
    await tick();
    await new Promise((done) =>
      requestAnimationFrame(() => requestAnimationFrame(done))
    );
    replayAt = null;
    const clips = move.clips.map((one) => ({
      ...one,
      ...(showing === "edited" ? (edits[one.id] ?? {}) : {}),
    }));
    const length = moveLength({ ...move, clips });
    const began = performance.now();
    const step = (now: number) => {
      if (mine !== run) {
        return;
      }
      const t = Math.min(1, (now - began) / Math.max(1, length));
      progress = t;
      if (t < 1) {
        requestAnimationFrame(step);
      } else {
        playing = false;
      }
    };
    requestAnimationFrame(step);
  }
  function edit(id: string, change: Partial<Clip>, commit = true) {
    editsBy = {
      ...editsBy,
      [moveKey]: { ...edits, [id]: { ...(edits[id] ?? {}), ...change } },
    };
    showing = "edited";
    if (commit) {
      run += 1;
      playing = false;
      play();
    }
  }

  /**
   * The map grows out of the Map button and folds back into it (one object):
   * its box opens from the button's corner, on the popover's clocks.
   */
  function grow(_node: Element, { out }: { out: boolean }) {
    if (!motionOk.current) {
      return {
        duration: dur("--dur-fade"),
        css: (t: number) => `opacity: ${t}`,
      };
    }
    return {
      duration: dur(out ? "--dur-exit" : "--dur-pop"),
      easing: curveOf("--ease-drawer"),
      css: (t: number) => {
        const u = 1 - t;
        const cut = `calc((100% - var(--c-btn-h)) * ${u})`;
        return `clip-path: inset(0 0 ${cut} ${cut} round var(--radius-lg)); opacity: ${Math.min(1, t * 3)}`;
      },
    };
  }
</script>

{#snippet frame(
  id: string,
  bindTo: "kept" | "other",
  withWashes: boolean,
  unseen = false
)}
  {@const state = stateOf(id) ?? keptState}
  {@const Shown = graph.component}
  <div
    class={[
      "relative mx-auto w-(--frame-w) min-w-0 shrink-0",
      unseen && "pointer-events-none invisible absolute start-0 top-0",
    ]}
    aria-hidden={unseen || undefined}
    data-slot="stage-frame"
    inert={unseen || undefined}
    style:--frame-w={`${frameWidth(graph)}px`}
  >
    {#if bindTo === "kept"}
      <div class="relative" {@attach timed(timing)} bind:this={keptFrame}>
        {#key instanceOf(state.instance)}
          <Shown {...propsOf(graph, state, dials)} />
        {/key}
      </div>
    {:else}
      <div class="relative" bind:this={otherFrame}>
        {#key instanceOf(`${state.instance}:other`)}
          <Shown {...propsOf(graph, state, dials)} />
        {/key}
      </div>
    {/if}
    {#if withWashes}
      <div aria-hidden="true" class="pointer-events-none absolute inset-0">
        {#each washes as wash, index (index)}
          <span
            class={[
              "absolute start-(--x) top-(--y) h-(--h) w-(--w) rounded-xs mix-blend-multiply dark:mix-blend-screen",
              wash.kind === "in" ? "bg-diff-add-bg" : "bg-diff-del-bg",
            ]}
            style:--x={`calc(${wash.box.x}px - var(--space-row))`}
            style:--y={`calc(${wash.box.y}px - var(--space-row))`}
            style:--w={`calc(${wash.box.width}px + 2 * var(--space-row))`}
            style:--h={`calc(${wash.box.height}px + 2 * var(--space-row))`}
          ></span>
        {/each}
      </div>
    {/if}
  </div>
{/snippet}

{#snippet stage()}
  <div
    class="relative min-h-0 flex-1 overflow-auto overscroll-contain"
    data-slot="stage"
    {@attach frameSize<HTMLElement>((node) => {
      stageWidth = node.clientWidth;
    })}
  >
    <div
      class="relative flex min-h-full items-start justify-center gap-space-8 py-space-5"
    >
      {@render frame(shownId, "kept", !pair && washes.length > 0)}
      {#if pair && previewState}
        {@render frame(previewState.id, "other", true)}
      {:else if comparing}
        {@render frame(kept, "other", false, true)}
      {/if}
    </div>
  </div>
{/snippet}

{#snippet mapButton()}
  <Tip label={graphWords.showMap}>
    {#snippet children(tip)}
      <button
        {...tip}
        aria-expanded={phone ? sheet === "map" : mapOpen}
        aria-label={graphWords.showMap}
        class="grid size-c-btn-h flex-none place-items-center rounded-md text-ink-muted transition-control touch-hit press-tint can-hover:hover:not-aria-expanded:bg-surface-hover can-hover:hover:not-aria-expanded:text-ink-strong aria-expanded:bg-surface-pressed aria-expanded:text-ink-strong"
        data-box
        onclick={() => {
          if (phone) {
            sheet = sheet === "map" ? null : "map";
          } else {
            mapOpen = true;
          }
        }}
        type="button"
      >
        <IconStructure aria-hidden="true" class="size-c-bar-symbol" />
      </button>
    {/snippet}
  </Tip>
{/snippet}

{#snippet dock()}
  {#if keptMove && animates}
    <MoveDock
      {edits}
      fromTitle={stateOf(keptMove.from)?.title ?? keptMove.from}
      move={keptMove}
      onedit={edit}
      onplay={play}
      onshow={(which) => {
        showing = which;
        run += 1;
        playing = false;
        play();
      }}
      {playing}
      {progress}
      {showing}
      toTitle={keptState.title}
    />
  {/if}
{/snippet}

<div
  data-slot="design-graph"
  class="relative flex size-full min-h-0 flex-col overflow-hidden bg-surface-well"
  style:--foot="calc(var(--c-effort-track-h-phone) + var(--space-5))"
  {@attach frameSize<HTMLElement>((node) => {
    width = node.clientWidth;
    height = node.clientHeight;
  })}
>
  {#if !phone}
    <div class="flex min-h-0 flex-1 gap-space-3 p-space-3">
      <div
        class={[
          "relative flex min-w-0 flex-1 flex-col",
          floating ? "gap-0" : "gap-space-3",
        ]}
      >
        <div
          class={[
            "flex min-w-0 items-center justify-center gap-space-3",
            floating &&
              "absolute inset-x-0 top-0 z-2 mx-auto w-fit max-w-full rounded-lg border border-border-hairline bg-material-panel p-space-1 shadow-tile glass-backdrop",
          ]}
          data-slot="steps-row"
        >
          <StepsPill
            class={floating
              ? "w-c-measure max-w-full"
              : "w-full max-w-c-measure"}
            onchange={keep}
            states={graph.states}
            value={kept}
          />
          {#if shownDials.length > 0}
            <DataDials
              dials={shownDials}
              onchange={(id, value) => {
                dials = { ...dials, [id]: value };
              }}
              values={dials}
            />
          {/if}
        </div>
        {@render stage()}
        {#if floating && animates}
          <div class="absolute inset-x-0 bottom-0 z-2">{@render dock()}</div>
        {/if}
      </div>
      <div
        class="flex flex-none flex-col"
        {@attach frameSize<HTMLElement>((node) => {
          roomHeight = node.clientHeight;
        })}
        data-slot="map-column"
      >
        {#if mapOpen}
          <div in:grow={{ out: false }} out:grow={{ out: true }}>
            <MapPanel
              {at}
              {cameFrom}
              {graphs}
              height={mapBox.height}
              {kept}
              onhide={() => {
                mapOpen = false;
                preview = null;
              }}
              onkeep={keep}
              onoutline={(on) => {
                outline = on;
              }}
              onpreview={(id) => {
                preview = id;
              }}
              onresize={(size) => {
                mapSize = size;
              }}
              onswitch={switchTo}
              {outline}
              room={mapRoom}
              width={mapBox.width}
            />
          </div>
        {:else}
          <div
            class="rounded-lg border border-border-hairline bg-material-panel p-space-1 shadow-tile glass-backdrop"
          >
            {@render mapButton()}
          </div>
        {/if}
      </div>
    </div>
    {#if animates && !floating}
      <div class="flex-none px-space-3 pb-space-3">{@render dock()}</div>
    {/if}
  {:else}
    <div class="flex min-h-0 flex-1 flex-col px-space-3">
      {@render stage()}
    </div>
    {#if sheet === "map"}
      <div
        class={[
          "absolute inset-x-space-2 z-2",
          barTop ? "bottom-space-2" : "bottom-(--foot)",
        ]}
        in:grow={{ out: false }}
        out:grow={{ out: true }}
      >
        <MapPanel
          {at}
          {cameFrom}
          {graphs}
          height={Math.round(height * SHEET)}
          {kept}
          onhide={() => {
            sheet = null;
            preview = null;
          }}
          onkeep={keep}
          onoutline={(on) => {
            phoneOutline = on;
          }}
          onpreview={(id) => {
            preview = id;
          }}
          onresize={() => undefined}
          onswitch={switchTo}
          outline={phoneOutline}
          room={{ width, height }}
          width={width - 14}
        />
      </div>
    {:else if sheet === "dock" && animates}
      <div
        class={[
          "absolute inset-x-space-2 z-2",
          barTop ? "bottom-space-2" : "bottom-(--foot)",
        ]}
      >
        {@render dock()}
      </div>
    {/if}
    <!-- The foot: one glass bar in the thumb's reach. -->
    <div
      class={[
        "relative z-3 flex-none px-space-2",
        barTop ? "order-first pt-space-2 pb-space-1" : "pt-space-1 pb-space-2",
      ]}
    >
      <div
        class="flex min-w-0 items-center gap-space-1 rounded-lg border border-border-hairline bg-material-panel p-space-1 shadow-tile glass-backdrop"
      >
        <StepsPill
          class="min-w-0 flex-1"
          onchange={keep}
          states={graph.states}
          value={kept}
        />
        {#if shownDials.length > 0}
          <Popover.Root>
            <Popover.Trigger>
              {#snippet child({ props })}
                <button
                  {...props}
                  aria-label={graphWords.dials}
                  class="grid size-c-effort-track-h-phone flex-none place-items-center rounded-md text-ink-muted press-tint"
                  data-box
                  type="button"
                >
                  <IconTuning aria-hidden="true" class="size-c-bar-symbol" />
                </button>
              {/snippet}
            </Popover.Trigger>
            <Popover.Content align="end" class="w-auto">
              <div class="flex flex-col items-start gap-space-3">
                <DataDials
                  dials={shownDials}
                  onchange={(id, value) => {
                    dials = { ...dials, [id]: value };
                  }}
                  values={dials}
                />
              </div>
            </Popover.Content>
          </Popover.Root>
        {/if}
        {#if animates}
          <button
            aria-expanded={sheet === "dock"}
            aria-label={graphWords.play}
            class="grid size-c-effort-track-h-phone flex-none place-items-center rounded-md text-ink-muted press-tint aria-expanded:bg-surface-pressed aria-expanded:text-ink-strong"
            data-box
            onclick={() => {
              sheet = sheet === "dock" ? null : "dock";
            }}
            type="button"
          >
            <IconClock aria-hidden="true" class="size-c-bar-symbol" />
          </button>
        {/if}
        {@render mapButton()}
      </div>
    </div>
  {/if}
</div>
