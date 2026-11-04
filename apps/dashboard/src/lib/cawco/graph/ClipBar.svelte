<script lang="ts">
  /**
   * A row's bar on the move's one scale (MoveFace: the ruler, every bar and
   * the playhead are placed by one rule, `t / scale` of the lane's width).
   * The bar is a thing you grab, as in Motion Studio, Chrome DevTools'
   * Animations panel and After Effects: a press does nothing; a drag on
   * the body moves the row by the drag's distance from where it was
   * grabbed (its delay), and a drag on either end retimes it (its start or
   * its length). A drag begins once the pointer has travelled `--space-1`
   * from the press, so a click never changes a value. Nothing under the
   * bar takes a press: the empty lane does nothing either.
   *
   * Round 29's bar: a rounded bar in its kind's wash with its kind's edge
   * (the `c-clip-*` tokens); a thing that moves more than once shows each
   * stretch, joined by a hairline in its kind's hue, and moves and
   * stretches as one. Its two ends carry thin marks in its kind's hue at
   * rest, so a person sees where to take it. While he has tuned it, its
   * timing as the engine ran it stands as a dashed outline under the bar.
   * When the move set it off after its start, that moment stands as a
   * dashed hairline: no drag takes the bar before it (a delay is never
   * below 0).
   *
   * An end drag snaps the row's length to the duration ladder (motion
   * `snapLength`), as the owner decided ("Snap, and ⌥ frees it"); with ⌥
   * held it moves on 10 ms steps. A body drag moves on 10 ms steps.
   * Letting go moves and stretches the row's clips together (motion
   * `retime`), and the move plays once on the stage.
   *
   * Keyboard (WAI-ARIA APG, Slider): the body and each end are a slider of
   * their own; the arrows move it 10 ms, with Shift 100 ms, Home and End to
   * its least and most.
   */
  import { graphWords as words } from "@cawco/core/words/graph";
  import { frameSize } from "#lib/cawco/frame-observer.js";
  import { numberOf } from "#lib/cawco/motion/curves.svelte.js";
  import { browser } from "$app/env";
  import { figureOf } from "./figures";
  import { type ClipKind, snapLength, type Track } from "./motion";

  let {
    track,
    name,
    scale,
    original = null,
    onretime,
    onhold,
    lang,
  }: {
    track: Track;
    /** The row as a person says it, for each part's name. */
    name: string;
    /** The lane's end, ms: the ruler's. */
    scale: number;
    /** Its stretches as the engine ran them, while he has tuned it: drawn as an outline. */
    original?: Track["spans"] | null;
    /** The row's new stretch, ms into the move. */
    onretime: (from: number, to: number) => void;
    /** The stretch a drag holds, as it moves (null: let go), so the row's words follow it. */
    onhold: (span: { from: number; to: number } | null) => void;
    /** The page's language, for the figures. */
    lang: string | undefined;
  } = $props();

  /** A step, ms: a body drag's and an arrow's. */
  const STEP = 10;
  /** Shift and an arrow, ms. */
  const BIG_STEP = 100;
  /** How far a press travels before it is a drag, px: under it, a click. */
  const SLOP = browser ? numberOf("--space-1") : 4;
  /** An end's grip, px (`w-space-2`): the bar keeps its grips inside it while it is three grips wide. */
  const GRIP = browser ? numberOf("--space-2") : 7;

  /** The earliest it may begin: the moment the move set it off. */
  const floor = $derived(track.setOff);
  let held = $state<{ from: number; to: number } | null>(null);
  const span = $derived(held ?? { from: track.begins, to: track.ends });
  const pct = (t: number) => `${(t / scale) * 100}%`;
  /** The lane's width, px: what a drag's pixels are in ms. */
  let wide = $state(0);
  /** Too narrow for its grips inside it: they stand outside its ends. */
  const narrow = $derived(
    wide > 0 && ((span.to - span.from) / scale) * wide < 3 * GRIP
  );

  type Part = "body" | "start" | "end";
  /** The stretch a part moved to, `by` ms from where it was taken, inside the lane and never before the floor. */
  const moved = (
    part: Part,
    from: number,
    to: number,
    by: number,
    free: boolean
  ) => {
    if (part === "body") {
      const length = to - from;
      const begins = Math.round((from + by) / STEP) * STEP;
      const at = Math.max(floor, Math.min(scale - length, begins));
      return { from: at, to: at + length };
    }
    if (part === "start") {
      const begins = Math.max(floor, Math.min(to - STEP, from + by));
      const length = free ? to - begins : snapLength(to - begins);
      return { from: Math.max(floor, to - length), to };
    }
    const ends = Math.min(scale, Math.max(from + STEP, to + by));
    const length = free ? ends - from : snapLength(ends - from);
    return { from, to: Math.min(scale, from + length) };
  };
  const commit = (next: { from: number; to: number }) => {
    if (next.from !== track.begins || next.to !== track.ends) {
      onretime(next.from, next.to);
    }
  };

  /** A press held on a part: where it was taken, the stretch then, and whether it has become a drag. */
  let press: {
    part: Part;
    x: number;
    from: number;
    to: number;
    dragging: boolean;
    sign: number;
  } | null = null;
  let dragging = $state<Part | null>(null);
  const take = (part: Part) => (event: PointerEvent) => {
    if (event.button !== 0 || wide === 0) {
      return;
    }
    event.preventDefault();
    const node = event.currentTarget as HTMLElement;
    node.setPointerCapture(event.pointerId);
    press = {
      part,
      x: event.clientX,
      from: track.begins,
      to: track.ends,
      dragging: false,
      sign: getComputedStyle(node).direction === "rtl" ? -1 : 1,
    };
  };
  const drag = (event: PointerEvent) => {
    if (!press) {
      return;
    }
    const dx = (event.clientX - press.x) * press.sign;
    if (!press.dragging && Math.abs(dx) < SLOP) {
      return;
    }
    press.dragging = true;
    dragging = press.part;
    held = moved(
      press.part,
      press.from,
      press.to,
      (dx / wide) * scale,
      event.altKey
    );
    onhold(held);
  };
  const letGo = (event: PointerEvent) => {
    const was = press;
    press = null;
    dragging = null;
    const next = held;
    held = null;
    onhold(null);
    // A press that never travelled is a click: nothing changes.
    if (event.type === "pointerup" && was?.dragging && next) {
      commit(next);
    }
  };

  /** The arrows, Shift, Home and End on a part, as a slider takes them. */
  const keyOf = (part: Part) => (event: KeyboardEvent) => {
    const { begins: from, ends: to } = track;
    const step = event.shiftKey ? BIG_STEP : STEP;
    const by = {
      ArrowRight: step,
      ArrowUp: step,
      ArrowLeft: -step,
      ArrowDown: -step,
      Home: -Number.MAX_SAFE_INTEGER,
      End: Number.MAX_SAFE_INTEGER,
    }[event.key];
    if (by === undefined) {
      return;
    }
    event.preventDefault();
    commit(moved(part, from, to, Math.max(-scale, Math.min(scale, by)), true));
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
  /** Each kind's ink: an end's mark and the hairline joining its stretches. */
  const INK: Record<ClipKind, string> = {
    size: "bg-c-clip-size",
    move: "bg-c-clip-move",
    fade: "bg-c-clip-fade",
    tint: "bg-c-clip-tint",
    effect: "bg-c-clip-effect",
    other: "bg-c-clip-other",
  };
  /** Where a stretch stands inside the bar, as the bar is held: its share of the row's stretch. */
  const inside = (t: number) =>
    `${((t - track.begins) / Math.max(1, track.ends - track.begins)) * 100}%`;
  const ring =
    "focus-visible:outline-(length:--focus-ring-width) focus-visible:outline-solid focus-visible:outline-focus-ring focus-visible:outline-offset-2";
  const ms = (t: number) => words.ms(figureOf(Math.round(t), lang));
</script>

<div
  class="relative h-c-badge-h w-full touch-none select-none"
  data-dragging={dragging ?? undefined}
  data-slot="bar-lane"
  {@attach frameSize((node: HTMLElement) => {
    wide = node.clientWidth;
  })}
>
  {#if original}
    <!-- Its timing as the engine ran it, under the tuned bar. -->
    {#each original as was, at (at)}
      <span
        aria-hidden="true"
        class="absolute inset-y-0 start-(--from) w-(--wide) rounded-xs border border-dashed border-ink-muted"
        data-slot="was"
        style:--from={pct(was.from)}
        style:--wide={pct(was.to - was.from)}
      ></span>
    {/each}
  {/if}
  {#if floor > 0}
    <!-- The moment the move set it off, when that is after its start: no
         drag takes the bar before it. -->
    <span
      aria-hidden="true"
      class="absolute inset-y-0 start-(--at) border-s border-dashed border-border-control"
      data-slot="floor"
      style:--at={pct(floor)}
    ></span>
  {/if}
  <!-- The body: its stretches, drawn where each runs; grabbed and dragged
       as one. -->
  <div
    aria-label={words.moveClip(name)}
    aria-valuemax={Math.round(scale - (span.to - span.from))}
    aria-valuemin={Math.round(floor)}
    aria-valuenow={Math.round(span.from)}
    aria-valuetext={ms(span.from)}
    class={[
      "absolute inset-y-0 start-(--from) w-(--wide) rounded-xs",
      dragging === "body" ? "cursor-grabbing" : "cursor-grab",
      ring,
    ]}
    data-slot="bar"
    onkeydown={keyOf("body")}
    onlostpointercapture={letGo}
    onpointercancel={letGo}
    onpointerdown={take("body")}
    onpointermove={drag}
    onpointerup={letGo}
    role="slider"
    style:--from={pct(span.from)}
    style:--wide={pct(span.to - span.from)}
    tabindex="0"
    title={words.moveClip(name)}
  >
    {#if track.spans.length > 1}
      <span
        aria-hidden="true"
        class={["absolute inset-x-0 top-1/2 h-px", INK[track.kind]]}
      ></span>
    {/if}
    {#each track.spans as part, at (at)}
      <span
        aria-hidden="true"
        class={[
          "absolute inset-y-0 start-(--from) w-(--wide) rounded-xs border",
          BAR[track.kind],
        ]}
        data-slot="stretch"
        style:--from={inside(part.from)}
        style:--wide={inside(track.begins + (part.to - part.from))}
      ></span>
    {/each}
  </div>
  <!-- Its two ends, each a grip of its own inside the bar's end (outside it
       while the bar is too narrow to hold both), its mark drawn at rest. -->
  {#each ["start", "end"] as const as end (end)}
    {@const at = end === "start" ? span.from : span.to}
    <div
      aria-label={end === "start"
        ? words.clipStarts(name)
        : words.clipEnds(name)}
      aria-valuemax={Math.round(end === "start" ? span.to - STEP : scale)}
      aria-valuemin={Math.round(end === "start" ? floor : span.from + STEP)}
      aria-valuenow={Math.round(at)}
      aria-valuetext={ms(at)}
      class={[
        "pointer-hit touch-hit absolute inset-y-0 start-(--at) grid w-space-2 cursor-ew-resize place-items-center rounded-xs",
        (end === "start") === narrow
          ? "-translate-x-full rtl:translate-x-full"
          : "",
        ring,
      ]}
      data-slot={end}
      onkeydown={keyOf(end)}
      onlostpointercapture={letGo}
      onpointercancel={letGo}
      onpointerdown={take(end)}
      onpointermove={drag}
      onpointerup={letGo}
      role="slider"
      style:--at={pct(at)}
      tabindex="0"
    >
      <span
        aria-hidden="true"
        class={["h-space-3 w-px rounded-pill", INK[track.kind]]}
      ></span>
    </div>
  {/each}
</div>
