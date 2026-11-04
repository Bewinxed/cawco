<script lang="ts">
  /**
   * A row's lane on the move's one scale (MoveFace: the ruler, every bar and
   * the playhead are placed by one rule, `t / scale` of the lane's width).
   * Each run of the row (motion `Run`, the clips that ran together) is a
   * bar of its own, and a gesture on one moves that run and nothing else: a
   * row of two runs drawn as one grabbed body moved both.
   *
   * The pointer is interact.js's (1.10, MIT; the run record of 4 November
   * names why: the one maintained library with a body drag, edge resizes
   * and touch on any element, our markup kept): each bar is its own
   * interactable, its body dragged (its delay) and its two ends resized
   * (its start or its length). A press does nothing; interact.js starts a
   * drag only once the pointer travels. The drag's distance from where it
   * was taken goes through one rule (motion `moveRun`): the one snapper
   * (`snapRun`: 10 ms on the body, the duration ladder on an end, 10 ms
   * steps while ⌥ is held) and the clamps (`clampRun*`, after DialKit's).
   * Letting go retimes that run's clips (motion `retimeRun`) and the move
   * plays once on the stage.
   *
   * Keyboard (WAI-ARIA APG, Slider): each bar's body and each end is a
   * slider of its own; the arrows move it 10 ms, with Shift 100 ms, Home and
   * End to its least and most, through the same `moveRun`. A key's nudge
   * plays nothing (T9: stillness after a keyboard nudge).
   *
   * A press on a bar, or a drag of it, selects its row (the row's settings
   * open under it). Unless ⌥ is held, a dragged edge settles on another
   * bar's edge it comes within `--space-2` of, as on a duration token.
   * Under a finger a bar's ends grip outside it, so its whole width is its
   * body's: two 44px end areas covered a 29px bar, and no finger could
   * move it. Its ends are
   * our own slider elements, not bits-ui's Slider: a Slider's track takes a
   * press and moves its nearest thumb, the jump a press on a bar once made.
   *
   * Each bar is drawn in its kind's wash and edge (the `c-clip-*` tokens),
   * thin marks inside its ends at rest. While a run is tuned, its timing as
   * the engine ran it stands as a dashed outline under it; the moment the
   * move set it off, when after the lane's start, as a dashed hairline.
   */
  import { graphWords as words } from "@cawco/core/words/graph";
  import interact from "interactjs";
  import { frameSize } from "#lib/cawco/frame-observer.js";
  import { numberOf } from "#lib/cawco/motion/curves.svelte.js";
  import { browser } from "$app/env";
  import { figureOf } from "./figures";
  import {
    type ClipKind,
    moveRun,
    RUN_BIG_STEP,
    RUN_STEP,
    type Run,
    type RunPart,
    type Track,
  } from "./motion";

  let {
    track,
    name,
    scale,
    onretime,
    onhold,
    lang,
    selected = false,
    onselect,
    edges,
  }: {
    track: Track;
    /** Its row is the one whose settings are open. */
    selected?: boolean;
    /** A press or a drag on one of its bars. */
    onselect: () => void;
    /** Every other bar's edges on the lane, ms: where a dragged edge settles. */
    edges: (run: Run) => number[];
    /** The row as a person says it, for each part's name. */
    name: string;
    /** The lane's end, ms: the ruler's. */
    scale: number;
    /** A run's new stretch, ms into the move. */
    onretime: (run: Run, from: number, to: number, replay: boolean) => void;
    /** The stretch a drag holds, as it moves (null: let go), so the row's words follow it. */
    onhold: (run: Run, span: { from: number; to: number } | null) => void;
    /** The page's language, for the figures. */
    lang: string | undefined;
  } = $props();

  const pct = (t: number) => `${(t / scale) * 100}%`;
  /** The lane's width, px: what a drag's pixels are in ms. */
  let wide = $state(0);
  /** The stretch a gesture holds, by its run. */
  let held = $state<{ id: string; from: number; to: number } | null>(null);
  /** The part a pointer holds, by its run: its cursor. */
  let holding = $state<{ id: string; part: RunPart } | null>(null);
  const spanOf = (run: Run) =>
    held?.id === run.id ? held : { from: run.from, to: run.to };
  const many = $derived(track.runs.length > 1);

  /** A run's name for a reader: the row's, and which run when it has several. */
  const runName = (at: number) =>
    many ? words.runOf(name, at + 1, track.runs.length) : name;

  const commit = (
    run: Run,
    next: { from: number; to: number },
    replay: boolean
  ) => {
    if (next.from !== run.from || next.to !== run.to) {
      onretime(run, next.from, next.to, replay);
    }
  };
  /** How near a dragged edge must come to another bar's to settle on it: `--space-2` of the lane, in ms. */
  const NEAR_PX = browser ? numberOf("--space-2") : 0;

  /**
   * The bar of `run` made an interact.js target: its body draggable, its
   * two ends resizable, each gesture's distance in ms through `moveRun`.
   */
  const grabbable = (run: Run) => (node: HTMLElement) => {
    let taken = { from: run.from, to: run.to };
    const sign = () => (getComputedStyle(node).direction === "rtl" ? -1 : 1);
    /** The gesture's distance from where it was taken, ms. */
    let travelled = 0;
    const toMs = (px: number) => (wide > 0 ? (px / wide) * scale : 0);
    const follow = (part: RunPart, dx: number, free: boolean) => {
      travelled += dx * sign();
      held = {
        id: run.id,
        ...moveRun({ ...run, ...taken }, part, toMs(travelled), scale, free, {
          edges: edges(run),
          within: toMs(NEAR_PX),
        }),
      };
      onhold(run, held);
    };
    const start = (part: RunPart) => () => {
      onselect();
      taken = { from: run.from, to: run.to };
      travelled = 0;
      holding = { id: run.id, part };
    };
    const end = () => {
      const next = held;
      held = null;
      holding = null;
      onhold(run, null);
      if (next) {
        commit(run, next, true);
      }
    };
    const target = interact(node)
      .draggable({
        listeners: {
          start: start("body"),
          move: (event) => follow("body", event.dx, event.altKey),
          end,
        },
      })
      .resizable({
        edges: {
          left: "[data-run-end='start']",
          right: "[data-run-end='end']",
        },
        listeners: {
          start: (event) => start(event.edges?.left ? "start" : "end")(),
          move: (event) =>
            follow(
              event.edges?.left ? "start" : "end",
              event.edges?.left ? event.deltaRect.left : event.deltaRect.right,
              event.altKey
            ),
          end,
        },
      })
      .styleCursor(false);
    return () => target.unset();
  };

  /** The arrows, Shift, Home and End on a part of a run, through the drag's own rule. */
  const keyOf = (run: Run, part: RunPart) => (event: KeyboardEvent) => {
    const step = event.shiftKey ? RUN_BIG_STEP : RUN_STEP;
    const by = {
      ArrowRight: step,
      ArrowUp: step,
      ArrowLeft: -step,
      ArrowDown: -step,
      Home: -scale,
      End: scale,
    }[event.key];
    if (by === undefined) {
      return;
    }
    event.preventDefault();
    commit(run, moveRun(run, part, by, scale, true), false);
  };

  /** Each kind's bar: its wash and its edge, as whole classes. */
  const BAR: Record<ClipKind, string> = {
    size: "bg-c-clip-size-wash border-c-clip-size",
    move: "bg-c-clip-move-wash border-c-clip-move",
    fade: "bg-c-clip-fade-wash border-c-clip-fade",
    tint: "bg-c-clip-tint-wash border-c-clip-tint",
    effect: "bg-c-clip-effect-wash border-c-clip-effect",
    other: "bg-c-clip-other-wash border-c-clip-other",
  };
  /** Each kind's ink: an end's mark. */
  const INK: Record<ClipKind, string> = {
    size: "bg-c-clip-size",
    move: "bg-c-clip-move",
    fade: "bg-c-clip-fade",
    tint: "bg-c-clip-tint",
    effect: "bg-c-clip-effect",
    other: "bg-c-clip-other",
  };
  const ring =
    "focus-visible:outline-(length:--focus-ring-width) focus-visible:outline-solid focus-visible:outline-focus-ring focus-visible:outline-offset-2";
  const ms = (t: number) => words.ms(figureOf(Math.round(t), lang));
  /** An end's grip, px wide: the bar keeps its grips inside it while it is three grips wide. */
  const GRIPS = 3;
  let grip = $state(0);
</script>

<div
  class="relative h-c-badge-h w-full select-none"
  data-slot="bar-lane"
  {@attach frameSize((node: HTMLElement) => {
    wide = node.clientWidth;
    grip =
      node.querySelector<HTMLElement>("[data-run-end]")?.offsetWidth ?? grip;
  })}
>
  {#each track.runs as run, at (run.id)}
    {@const span = spanOf(run)}
    {@const tuned =
      run.ran.from !== run.from ||
      run.ran.to !== run.to ||
      run.clips.some((clip) => clip.was)}
    {@const narrow =
      wide > 0 &&
      grip > 0 &&
      ((span.to - span.from) / scale) * wide < GRIPS * grip}
    {#if tuned}
      <!-- Its timing as the engine ran it, under the tuned bar. -->
      <span
        aria-hidden="true"
        class="absolute inset-y-0 start-(--from) w-(--wide) rounded-xs border border-dashed border-ink-muted"
        data-slot="was"
        style:--from={pct(run.ran.from)}
        style:--wide={pct(run.ran.to - run.ran.from)}
      ></span>
    {/if}
    {#if run.floor > 0}
      <!-- The moment the move set it off, after the lane's start: no
           gesture takes the bar before it. -->
      <span
        aria-hidden="true"
        class="absolute inset-y-0 start-(--at) border-s border-dashed border-border-control"
        data-slot="floor"
        style:--at={pct(run.floor)}
      ></span>
    {/if}
    <!-- The run's bar: its body a slider of its delay, its two ends
         sliders of their own, the whole one interact.js target. -->
    <div
      {@attach grabbable(run)}
      aria-label={words.moveClip(runName(at))}
      aria-valuemax={Math.round(scale - (span.to - span.from))}
      aria-valuemin={Math.round(run.floor)}
      aria-valuenow={Math.round(span.from)}
      aria-valuetext={ms(span.from)}
      class={[
        "absolute inset-y-0 start-(--from) w-(--wide) touch-none rounded-xs border",
        BAR[track.kind],
        selected && "ring-(length:--focus-ring-width) ring-ink-strong",
        holding?.id === run.id && holding.part === "body"
          ? "cursor-grabbing"
          : "cursor-grab",
        ring,
      ]}
      data-run={run.id}
      data-slot="bar"
      onkeydown={keyOf(run, "body")}
      onpointerdown={onselect}
      role="slider"
      style:--from={pct(span.from)}
      style:--wide={pct(span.to - span.from)}
      tabindex="0"
      title={words.runSpan(
        runName(at),
        figureOf(Math.round(span.from), lang),
        figureOf(Math.round(span.to), lang)
      )}
    >
      {#each ["start", "end"] as const as end (end)}
        {@const edge = end === "start" ? span.from : span.to}
        <div
          aria-label={end === "start"
            ? words.clipStarts(runName(at))
            : words.clipEnds(runName(at))}
          aria-valuemax={Math.round(
            end === "start" ? span.to - RUN_STEP : scale
          )}
          aria-valuemin={Math.round(
            end === "start" ? run.floor : span.from + RUN_STEP
          )}
          aria-valuenow={Math.round(edge)}
          aria-valuetext={ms(edge)}
          class={[
            "pointer-hit absolute inset-y-0 grid w-space-2 cursor-ew-resize touch-none place-items-center rounded-xs",
            end === "start" ? "start-0" : "end-0",
            // A bar too narrow for its grips stands them outside its ends.
            // Under a finger every end grips outside its bar, its area
            // reaching away from the bar, never over it, so the whole bar
            // is its body's (the review of round three: a 29px bar's two
            // 44px end areas covered it).
            narrow &&
              (end === "start"
                ? "-translate-x-full rtl:translate-x-full"
                : "translate-x-full rtl:-translate-x-full"),
            "coarse:-inset-y-space-3 coarse:w-space-7",
            end === "start"
              ? "coarse:-translate-x-full coarse:justify-items-end coarse:rtl:translate-x-full"
              : "coarse:translate-x-full coarse:justify-items-start coarse:rtl:-translate-x-full",
            ring,
          ]}
          data-run-end={end}
          data-slot={end}
          onkeydown={(event) => {
            event.stopPropagation();
            keyOf(run, end)(event);
          }}
          role="slider"
          tabindex="0"
        >
          <span
            aria-hidden="true"
            class={["h-space-3 w-px rounded-pill", INK[track.kind]]}
          ></span>
        </div>
      {/each}
    </div>
  {/each}
</div>
