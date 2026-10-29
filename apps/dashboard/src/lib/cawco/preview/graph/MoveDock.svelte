<script lang="ts">
  /**
   * The dock (Projects spec §5.10, "The dock"; round 29, section B): the
   * kept move's clips over time, shown only while the move into the kept
   * state animates. Its head names the move, then, once it has edits, the
   * Original | Edited switch (the owner's pick "segments"), the count and
   * Reset, then play and loop and the playhead's figure. Each clip is a row
   * on the house row grid: its kind's glyph in its hue, its element and its
   * property, then its facts each in its own dress (a Measured length with
   * its token's code chip, or a dashed chip where it is ad hoc; its curve
   * drawn small with its word); and its bar on the lane in the same hue.
   * A bar drags whole or by either end, snapping to the page's duration
   * tokens and to the other clips' edges and the playhead; ⌥ frees it (the
   * owner's pick "snap"). A drop replays the move (the owner's pick
   * "replay"); a key's nudge stays still. A press opens the clip's controls
   * in its row, under its facts (the owner's pick "in the row").
   */
  import {
    type ClipKind,
    type ClipTiming,
    durationTokenOf,
    runEnd,
    stateName,
  } from "@cawco/core/design-graph";
  import { designGraphWords as words } from "@cawco/core/words/design-graph";
  import { tick } from "svelte";
  import { frameSize } from "#lib/cawco/frame-observer.js";
  import { numberOf } from "#lib/cawco/motion/curves.svelte.js";
  import {
    TabItem,
    Tabs,
    TabsList,
  } from "#lib/components/ui/fluid-tabs/index.js";
  import { IconPause, IconPlay, IconRepeat } from "#lib/icons.js";
  import ClipControls from "./ClipControls.svelte";
  import CurveGlyph from "./CurveGlyph.svelte";
  import {
    curveWord,
    dragTo,
    ladderOf,
    propertyWords,
    tokenWord,
  } from "./clip-words";
  import type { DesignGraph } from "./design-graph.svelte";
  import GlassGroup from "./GlassGroup.svelte";
  import KindGlyph from "./KindGlyph.svelte";
  import { GHOST, RING, SYMBOL } from "./symbol";

  let { graph }: { graph: DesignGraph } = $props();

  const move = $derived(graph.move);
  const tokens = $derived(move?.tokens ?? { durations: [], easings: [] });
  /** The timings drawn: a drag's work while it is held, else the view's. */
  let work = $state.raw<ClipTiming[] | null>(null);
  const drawn = $derived(work ?? graph.timings);
  const editing = $derived(graph.view === "edited");

  /** The ruler's end: past both the agent's move and the person's, so a bar never runs off it while edited. */
  const end = $derived(
    Math.max(
      1,
      ...[graph.original, graph.edited, drawn].flatMap((list) =>
        list.map((one) => Math.max(one.start + one.duration, runEnd(one)))
      )
    ) + 100
  );
  let laneW = $state(0);
  const xOf = (ms: number) => (laneW * ms) / end;
  const msOf = (px: number) => (px / Math.max(1, laneW)) * end;

  /** The ruler's marks: round times, 50 or 100ms apart where they fit, else the next step up a 1-2-5 ladder that leaves each label room. */
  const marks = $derived.by(() => {
    if (laneW <= 0) {
      return [] as number[];
    }
    const label = 7 * String(Math.round(end)).length + numberOf("--space-2");
    const ladder = [
      50, 100, 200, 500, 1000, 2000, 5000, 10_000, 20_000, 50_000,
    ];
    const base = graph.length < 300 ? 50 : 100;
    const step =
      ladder.find((one) => one >= base && xOf(one) >= 1.5 * label) ??
      (ladder.at(-1) as number);
    const out: number[] = [];
    for (let t = 0; t <= end + 0.5; t += step) {
      out.push(t);
    }
    return out;
  });

  const time = $derived(graph.time ?? graph.length);
  const readout = $derived(Math.round(Math.min(time, graph.playLength)));

  /* --- Scrubbing the ruler ------------------------------------------------- */

  let ruler = $state<HTMLElement>();
  function scrubDown(event: PointerEvent): void {
    if (event.button !== 0 || !ruler) {
      return;
    }
    event.preventDefault();
    ruler.setPointerCapture(event.pointerId);
    const at = (one: PointerEvent) => {
      const box = ruler?.getBoundingClientRect();
      if (box) {
        graph.seek(msOf(one.clientX - box.left));
      }
    };
    at(event);
    const done = () => {
      if (ruler) {
        ruler.onpointermove = null;
        ruler.onpointerup = null;
        ruler.onpointercancel = null;
      }
    };
    ruler.onpointermove = at;
    ruler.onpointerup = done;
    ruler.onpointercancel = done;
  }

  /* --- Bars: a drag whole or by an end, snapping; a press opens the controls -- */

  /** Where a press on a bar takes it: its start edge, its end edge, or its body. */
  const zoneOf = (
    bar: HTMLElement,
    x: number,
    finger: boolean
  ): "start" | "end" | "body" => {
    const box = bar.getBoundingClientRect();
    const zone = finger
      ? numberOf("--c-touch-floor") / 2
      : numberOf("--c-bar-handle-zone");
    if (box.width < 3 * zone) {
      return x > box.right - zone ? "end" : "body";
    }
    if (x - box.left < zone) {
      return "start";
    }
    return box.right - x < zone ? "end" : "body";
  };

  function barDown(event: PointerEvent, id: number): void {
    if (event.button !== 0 || !editing) {
      return;
    }
    const bar = event.currentTarget as HTMLElement;
    const zone = zoneOf(bar, event.clientX, event.pointerType !== "mouse");
    const base = graph.edited.map((one) => ({ ...one }));
    const was = base[id];
    if (!was) {
      return;
    }
    const x0 = event.clientX;
    let moved = false;
    bar.setPointerCapture(event.pointerId);
    const reach = msOf(numberOf("--c-detent-snap"));
    const ladder = ladderOf(tokens.durations);
    const edges = [
      0,
      graph.time ?? graph.length,
      ...base.flatMap((one, at) =>
        at === id ? [] : [one.start, one.start + one.duration]
      ),
    ];
    bar.onpointermove = (one) => {
      const dx = one.clientX - x0;
      if (!moved && Math.abs(dx) < 4) {
        return;
      }
      if (!moved) {
        moved = true;
        graph.stop();
      }
      const next = dragTo(zone, was, msOf(dx), {
        edges,
        free: one.altKey,
        ladder,
        reach,
      });
      work = base.map((timing, at) => (at === id ? next : timing));
    };
    const done = (one: PointerEvent) => {
      bar.onpointermove = null;
      bar.onpointerup = null;
      bar.onpointercancel = null;
      const held = work;
      work = null;
      if (!moved) {
        if (one.type === "pointerup") {
          open(id);
        }
        return;
      }
      if (held) {
        // A drop: the move plays once from the start with the clip where it was let go.
        graph.edit(held, { replay: true });
      }
    };
    bar.onpointerup = done;
    bar.onpointercancel = done;
  }

  /** Keys on a focused bar: arrows nudge its start (to the next snap target; ⇧ 50ms; ⌥ 1ms), [ and ] step its length on the ladder; Enter opens its controls. A nudge stays still. */
  function barKey(event: KeyboardEvent, id: number): void {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      open(id);
      return;
    }
    if (!editing) {
      return;
    }
    const was = graph.edited[id];
    if (!was) {
      return;
    }
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      const dir = event.key === "ArrowRight" ? 1 : -1;
      let start: number;
      if (event.shiftKey) {
        start = was.start + 50 * dir;
      } else if (event.altKey) {
        start = was.start + dir;
      } else {
        const targets = [
          0,
          ...ladderOf(tokens.durations),
          ...graph.edited.flatMap((one, at) =>
            at === id ? [] : [one.start, one.start + one.duration]
          ),
        ]
          .filter((one) =>
            dir > 0 ? one > was.start + 0.5 : one < was.start - 0.5
          )
          .sort((a, b) => dir * (a - b));
        start = targets[0] ?? was.start + 10 * dir;
      }
      graph.editClip(id, (one) => ({ ...one, start: Math.max(0, start) }), {
        replay: false,
      });
    } else if (event.key === "[" || event.key === "]") {
      event.preventDefault();
      const dir = event.key === "]" ? 1 : -1;
      const [next] = ladderOf(tokens.durations)
        .filter((one) => (dir > 0 ? one > was.duration : one < was.duration))
        .sort((a, b) => dir * (a - b));
      if (next !== undefined) {
        graph.editClip(id, (one) => ({ ...one, duration: next }), {
          replay: false,
        });
      }
    }
  }

  /* --- A clip's controls, in its row ------------------------------------- */

  let dock = $state<HTMLElement>();
  let dockW = $state(0);
  /** A dock too narrow for a name column beside the lanes stacks each row (the dock's own width, not the window's). */
  const stacked = $derived(
    dockW > 0 && dockW < numberOf("--c-dock-name-w") * 2
  );
  function open(id: number): void {
    if (!editing) {
      return;
    }
    graph.chosen = graph.chosen === id ? null : id;
    tick().then(() => {
      dock
        ?.querySelector<HTMLElement>(`[data-clip-controls="${id}"]`)
        ?.scrollIntoView({ block: "nearest" });
    });
  }
  function close(): void {
    const id = graph.chosen;
    graph.chosen = null;
    if (id !== null) {
      tick().then(() =>
        dock
          ?.querySelector<HTMLElement>(`[data-bar="${id}"]`)
          ?.focus({ preventScroll: true })
      );
    }
  }

  /* --- The timeline's edge cue: a fade where more rows stand past the view -- */

  let lanes = $state<HTMLElement>();
  let fades = $state({ top: false, foot: false });
  const readFades = () => {
    if (lanes) {
      const below = lanes.scrollHeight - lanes.clientHeight - lanes.scrollTop;
      fades = { top: lanes.scrollTop > 1, foot: below > 1 };
    }
  };
  // The fades read again as the rows change, a clip's controls open or the dock resizes.
  $effect(() => {
    const view = `${drawn.length}|${graph.chosen}|${dockW}`;
    tick().then(() => view && readFades());
  });

  /** Each kind's hue (the owner's pick "Its own colour per kind"; mockup round 29's hue option): its bar's wash, held or chosen its hue mixed in, its edge, a spring's tail, its length's figure. */
  const HUES = {
    opacity: {
      fill: "bg-c-clip-opacity-wash",
      held: "bg-c-clip-opacity-held",
      edge: "border-c-clip-opacity",
      tail: "bg-c-clip-opacity-wash",
      figure: "text-c-clip-opacity",
    },
    position: {
      fill: "bg-c-clip-position-wash",
      held: "bg-c-clip-position-held",
      edge: "border-c-clip-position",
      tail: "bg-c-clip-position-wash",
      figure: "text-c-clip-position",
    },
    size: {
      fill: "bg-c-clip-size-wash",
      held: "bg-c-clip-size-held",
      edge: "border-c-clip-size",
      tail: "bg-c-clip-size-wash",
      figure: "text-c-clip-size",
    },
    colour: {
      fill: "bg-c-clip-colour-wash",
      held: "bg-c-clip-colour-held",
      edge: "border-c-clip-colour",
      tail: "bg-c-clip-colour-wash",
      figure: "text-c-clip-colour",
    },
    text: {
      fill: "bg-c-clip-text-wash",
      held: "bg-c-clip-text-held",
      edge: "border-c-clip-text",
      tail: "bg-c-clip-text-wash",
      figure: "text-c-clip-text",
    },
    unfold: {
      fill: "bg-c-clip-unfold-wash",
      held: "bg-c-clip-unfold-held",
      edge: "border-c-clip-unfold",
      tail: "bg-c-clip-unfold-wash",
      figure: "text-c-clip-unfold",
    },
  } as const;

  /** A bar's ground: an outline where Original shows an edited clip, twice the fill chosen, its hue's fill else. */
  const barFill = (kind: ClipKind, outlined: boolean, chosen: boolean) => {
    if (outlined) {
      return "border-dashed bg-transparent";
    }
    return chosen ? HUES[kind].held : HUES[kind].fill;
  };

  const lengthWords = (timing: ClipTiming) => {
    const token = durationTokenOf(timing.duration, tokens.durations);
    return {
      token,
      label: words.length(
        Math.round(timing.duration),
        token ? tokenWord(token.name) : null
      ),
    };
  };
</script>

{#if move}
  <section
    bind:this={dock}
    {@attach frameSize((node: HTMLElement) => {
      dockW = node.clientWidth;
    })}
    aria-label={words.move(stateName(move.from), stateName(move.to))}
    class="flex h-full min-h-0 min-w-0 flex-col"
    data-move-dock
    data-stacked={stacked || undefined}
    data-view={graph.view}
  >
    <!-- The head is one row at every width with a hairline the dock's whole width under it (pins 11, 14): Original | Edited once the move has edits, then play and loop, one trailing glass group of bare symbols. No title (the graph's lit edge names the move; the dock says it to a reader), no time (the playhead's pill says it) and no count (it stands over the rows it counts): DESIGN.md, One bar, one row. -->
    <header
      class="flex min-h-c-row-h min-w-0 flex-none items-center gap-space-2 border-b border-border-hairline px-space-2"
      data-dock-head
    >
      {#if graph.changed.size > 0}
        <Tabs
          class="flex-none"
          onValueChange={(view) =>
            graph.setView(view === "original" ? "original" : "edited")}
          size="compact"
          value={graph.view}
        >
          <TabsList aria-label={words.compare}>
            <TabItem label={words.original} value="original" />
            <TabItem label={words.edited} value="edited" />
          </TabsList>
        </Tabs>
      {/if}
      <GlassGroup class="ms-auto flex-none">
        <button
          aria-label={graph.playing ? words.pause : words.play}
          class={SYMBOL}
          data-play
          onclick={() => (graph.playing ? graph.stop() : graph.play())}
          title={graph.playing ? words.pause : words.play}
          type="button"
        >
          {#if graph.playing}<IconPause />{:else}<IconPlay />{/if}
        </button>
        <button
          aria-label={words.loop}
          aria-pressed={graph.looping}
          class={SYMBOL}
          data-loop
          onclick={() => {
            graph.looping = !graph.looping;
            if (graph.looping && !graph.playing) {
              graph.play();
            }
          }}
          title={words.loop}
          type="button"><IconRepeat /></button
        >
      </GlassGroup>
    </header>

    {#if move.error}
      <p
        class="m-0 px-space-3 pb-space-2 type-body text-status-fail-ink text-pretty"
        role="status"
      >
        {words.didntRun(move.error)}
      </p>
    {:else if move.clips.length === 0}
      <p
        class="m-0 px-space-3 pb-space-2 type-meta text-ink-muted"
        role="status"
      >
        {words.noClips}
      </p>
    {/if}

    <div class="flex min-h-0 flex-1 gap-space-2">
      <div class="relative flex min-h-0 min-w-0 flex-1 flex-col">
        <div
          aria-hidden="true"
          class="pointer-events-none absolute inset-x-0 top-0 z-3 h-c-edge-fade-len bg-linear-to-b from-surface-raised to-transparent opacity-0 transition-opacity duration-(--dur-control) ease-out data-on:opacity-100"
          data-fade="top"
          data-on={fades.top || undefined}
        ></div>
        <div
          bind:this={lanes}
          class="grid min-h-0 flex-1 auto-rows-min grid-cols-(--cols) overflow-auto overscroll-contain px-space-2 pb-space-2"
          data-lanes
          onscroll={readFades}
          style:--cols={stacked
            ? "minmax(0, 1fr)"
            : "minmax(0, var(--c-dock-name-w)) minmax(0, 1fr)"}
        >
          {#if graph.changed.size > 0}
            <!-- The timeline's own head: how many clips stand edited away from the agent's timing, and Reset beside it, only above 0 (The Earned Count Rule). -->
            <div
              class="col-span-full flex min-w-0 items-center gap-space-2 pb-space-1"
              data-edits-line
            >
              <span
                class="min-w-0 truncate type-meta text-ink-muted tabular-nums"
                data-edits>{words.changed(graph.changed.size)}</span
              >
              <button
                class={GHOST}
                data-reset-all
                onclick={() => graph.resetAll()}
                title={words.resetTip}
                type="button">{words.reset}</button
              >
            </div>
          {/if}
          <!-- The ruler: round times, sticky over the rows; a press or a drag on it scrubs. -->
          {#if !stacked}<span class="sticky top-0 z-2 bg-surface-raised"
            ></span>{/if}
          <div
            bind:this={ruler}
            {@attach frameSize((node: HTMLElement) => {
              laneW = node.clientWidth;
            })}
            class="sticky top-0 z-2 h-c-badge-h cursor-ew-resize touch-none bg-surface-raised"
            data-ruler
            onpointerdown={scrubDown}
            role="presentation"
          >
            {#each marks as mark (mark)}
              <i
                class="absolute bottom-0 left-(--x) h-space-1 w-px bg-border-hairline"
                style:--x={`${xOf(mark)}px`}
              ></i>
              <span
                class="absolute top-0 left-(--x) -translate-x-1/2 type-meta text-ink-muted tabular-nums"
                style:--x={`${Math.max(numberOf("--space-3"), Math.min(laneW - numberOf("--space-3"), xOf(mark)))}px`}
                >{mark}</span
              >
            {/each}
            <!-- The playhead's head (pin 13), the one place the time is said: a pill saying the moment the page stands in tabular figures, over the ruler's marks, its line down through the lanes; ink, never coral (DESIGN.md, The Coral Is Where You Act Rule), as a tooltip is (The Ink Stays Ink Rule). Held inside the ruler at its ends. -->
            <output
              aria-label={words.readout(readout, Math.round(graph.length))}
              class="pointer-events-none absolute inset-y-0 left-(--x) z-1 grid -translate-x-1/2 place-items-center rounded-pill bg-ink-solid px-space-1 type-code text-on-ink tabular-nums"
              data-playhead-knob
              style:--x={`${Math.max(numberOf("--space-4"), Math.min(laneW - numberOf("--space-4"), xOf(Math.min(time, end))))}px`}
              >{readout}</output
            >
          </div>
          {#each move.clips as clip (clip.id)}
            {@const timing = drawn[clip.id]}
            {@const was = graph.original[clip.id]}
            {@const changed = graph.changed.has(clip.id)}
            {@const chosen = graph.chosen === clip.id}
            {#if timing && was}
              {@const length = lengthWords(timing)}
              <!-- One clip: its name cell and its lane, the controls under them when they open in the row. -->
              <div
                class="relative col-span-full grid grid-cols-subgrid items-center gap-y-space-1 rounded-sm py-space-1 data-chosen:bg-c-chosen-wash data-chosen:ring-1 data-chosen:ring-brand-solid data-chosen:ring-inset"
                data-chosen={chosen || undefined}
                data-clip={clip.id}
                data-kind={clip.kind}
              >
                <div class="grid min-w-0 gap-y-space-row px-space-1">
                  <div
                    class="mark-line flex min-w-0 items-center gap-x-space-2"
                  >
                    <KindGlyph kind={clip.kind} />
                    <p
                      class="m-0 min-w-0 overflow-clip text-ellipsis whitespace-nowrap type-label text-ink-strong"
                      title={`${clip.element} ${clip.property}`}
                    >
                      {clip.element}
                      <code class="type-code text-ink-muted"
                        >{propertyWords(clip.property)}</code
                      >
                    </p>
                  </div>
                  <div
                    class="flex min-w-0 items-center gap-space-2 overflow-hidden ps-(--lead)"
                    style:--lead={`${numberOf("--icon-md") + numberOf("--space-2")}px`}
                  >
                    <button
                      aria-label={length.label}
                      class="flex flex-none items-baseline gap-space-1 rounded-xs px-space-row touch-hit hover:bg-surface-hover {RING}"
                      data-changed={(changed &&
                        timing.duration !== was.duration) ||
                        undefined}
                      data-fact="duration"
                      onclick={() => open(clip.id)}
                      type="button"
                    >
                      <span
                        class={[
                          "type-code tabular-nums",
                          HUES[clip.kind].figure,
                        ]}>{Math.round(timing.duration)}</span
                      ><span class="type-meta text-ink-muted">ms</span>
                    </button>
                    {#if length.token}
                      <code
                        class="flex-none rounded-xs bg-surface-recess px-space-1 type-code text-ink-row"
                        data-token>{tokenWord(length.token.name)}</code
                      >
                    {:else}
                      <!-- Off the token scale: the agent's own value, dashed so the row says which (the owner: "it chooses to use the tokens or adhoc values"). -->
                      <span
                        class="flex-none rounded-xs border border-dashed border-border-control-strong px-space-1 type-meta text-ink-row"
                        data-ad-hoc="duration">{words.adHoc}</span
                      >
                    {/if}
                    <button
                      aria-label={words.curveOf(
                        curveWord(timing, tokens.easings)
                      )}
                      class="mark-line flex min-w-0 items-center gap-space-1 rounded-xs px-space-row text-ink-row touch-hit hover:bg-surface-hover data-changed:text-selected-ink {RING}"
                      data-changed={(changed &&
                        JSON.stringify(timing.curve) !==
                          JSON.stringify(was.curve)) ||
                        undefined}
                      data-fact="curve"
                      onclick={() => open(clip.id)}
                      type="button"
                    >
                      <CurveGlyph
                        curve={timing.curve}
                        response={timing.duration}
                      />
                      <span
                        class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap type-meta"
                        >{curveWord(timing, tokens.easings)}</span
                      >
                    </button>
                  </div>
                </div>
                <!-- Its lane: the agent's timing as an outline under an edited bar, the bar in its kind's hue, a spring's settle as its tail. -->
                <div class="relative h-c-badge-h min-w-0" data-lane={clip.id}>
                  {#if editing && changed}
                    <div
                      aria-hidden="true"
                      class="absolute inset-y-0 left-(--x) w-(--w) rounded-xs border border-dashed border-border-control-strong"
                      data-ghost
                      style:--w={`${Math.max(1, xOf(was.duration))}px`}
                      style:--x={`${xOf(was.start)}px`}
                    ></div>
                  {/if}
                  {#if runEnd(timing) > timing.start + timing.duration}
                    <div
                      aria-hidden="true"
                      class={[
                        "absolute inset-y-1/3 left-(--x) w-(--w) rounded-e-pill",
                        HUES[clip.kind].tail,
                      ]}
                      data-tail
                      style:--w={`${Math.max(0, xOf(runEnd(timing) - timing.start - timing.duration))}px`}
                      style:--x={`${xOf(timing.start + timing.duration)}px`}
                    ></div>
                  {/if}
                  <button
                    aria-label={`${clip.element} ${clip.property}`}
                    aria-pressed={chosen}
                    class={[
                      "absolute inset-y-0 left-(--x) w-(--w) touch-none rounded-xs border transition-colors duration-(--dur-control) ease-out",
                      HUES[clip.kind].edge,
                      barFill(clip.kind, !editing && changed, chosen),
                      editing ? "cursor-grab" : "cursor-default",
                      RING,
                    ]}
                    data-bar={clip.id}
                    data-kind={clip.kind}
                    data-outline={(!editing && changed) || undefined}
                    onkeydown={(event) => barKey(event, clip.id)}
                    onpointerdown={(event) => barDown(event, clip.id)}
                    style:--w={`${Math.max(2, xOf(timing.duration))}px`}
                    style:--x={`${xOf(timing.start)}px`}
                    type="button"
                  ></button>
                  <!-- The playhead: ink, through every lane at the moment the page stands. -->
                  <div
                    aria-hidden="true"
                    class="pointer-events-none absolute -inset-y-space-1 left-(--x) w-px bg-ink-strong"
                    data-playhead
                    style:--x={`${xOf(Math.min(time, end))}px`}
                  ></div>
                </div>
                {#if chosen}
                  <div class="col-span-full px-space-1 pt-space-2">
                    <ClipControls {graph} id={clip.id} onclose={close} />
                  </div>
                {/if}
              </div>
            {/if}
          {/each}
        </div>
        <div
          aria-hidden="true"
          class="pointer-events-none absolute inset-x-0 bottom-0 z-3 h-c-edge-fade-len bg-linear-to-t from-surface-raised to-transparent opacity-0 transition-opacity duration-(--dur-control) ease-out data-on:opacity-100"
          data-fade="foot"
          data-on={fades.foot || undefined}
        ></div>
      </div>
    </div>
  </section>
{/if}
