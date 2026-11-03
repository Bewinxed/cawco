<script lang="ts">
  /**
   * A row's editor (the owner's answer: a full editor, presets first, the
   * rest for whoever wants it), opened in the row under its bar (the
   * owner's pick: the clip's controls open in its row), so the bars he
   * changes stay in view on a desk and in the phone's drawer alike.
   *
   * Duration first: a figure he can type or step, over three plain presets
   * with their figure beside each. Then the curve: the design system's own
   * curves first (DESIGN.md's tokens), then the named shapes, drawn
   * (Jitter's presets: jitter.video/changelog/2023-11-08-easings-intensity),
   * and one slider for the chosen shape: its intensity, or a spring's
   * bounce. The chosen curve is drawn large, and a cubic curve's two
   * control points drag on it (DialKit's easing editor), the four numbers
   * under Advanced following. Under Advanced: the delay, the curve's four
   * numbers, and a spring's mass, stiffness and damping. The house's own
   * timing, when it is one, is named on the last line. Every change plays
   * on the stage once, and the row's chip for the value marks it changed.
   */
  import { graphWords as words } from "@cawco/core/words/graph";
  import { Slider } from "bits-ui";
  import { ease } from "#lib/cawco/motion/curves.svelte.js";
  import { unfold } from "#lib/cawco/motion/fold.svelte.js";
  import { IconMinus, IconPlus } from "#lib/icons.js";
  import {
    bezierOf,
    type Clip,
    cubic,
    curveGlyph,
    curveTokenOf,
    delayOf,
    easingOf,
    redelay,
    relength,
    reshape,
    type Shape,
    type Spring,
    shapeOfCurve,
    springEasing,
    springOf,
    type Track,
  } from "./motion";

  let {
    track,
    name,
    onretime,
    onreset,
  }: {
    track: Track;
    /** The row as a person says it. */
    name: string;
    onretime: (clips: Clip[]) => void;
    onreset: () => void;
  } = $props();

  const first = $derived(track.clips[0] as Clip);
  const tuned = $derived(track.clips.some((clip) => clip.was));
  /** The row's length: its clips' one length, else its first's. */
  const duration = $derived(first.duration);
  /** A curve drawn into a clip's frames is its own until he picks a shape. */
  const curve = $derived(
    first.framed
      ? { shape: "own" as const, intensity: 0 }
      : shapeOfCurve(first.easing, first.spring)
  );
  const bezier = $derived(bezierOf(first.easing));
  /** The design system's curves, offered first, by token. */
  const HOUSE = [
    "--ease-out",
    "--ease-in-out",
    "--ease-drawer",
    "--ease-crossfade",
    "--ease-goo",
    "linear",
  ] as const;
  const houseEasing = (named: (typeof HOUSE)[number]) =>
    named === "linear" ? "linear" : ease(named);
  /** The design system's curve the row runs on, when it runs on one. */
  const houseCurve = $derived(
    first.framed || first.spring ? null : curveTokenOf(first.easing)
  );

  const STEP = 10;
  /** A shape's intensity when he first picks it. */
  const START = 0.6;
  /** A spring's bounce when he first picks it, and how high it goes. */
  const SPRING_START = 0.2;
  const BOUNCE_MOST = 0.9;
  /** The spring's own length: how long it takes to swing to its end, s (its response). */
  const responseOf = (spring: Spring) =>
    (2 * Math.PI) / Math.sqrt(spring.stiffness / spring.mass);

  let advanced = $state(false);

  /** A spring drawn on every clip of the row, the clips as long as it takes to come to rest. */
  const sendSpring = (spring: Spring) => {
    const drawn = springEasing(spring);
    onretime(reshape(track, drawn.easing, spring, drawn.duration));
  };
  const pickShape = (shape: Shape) => {
    if (shape === "linear") {
      onretime(reshape(track, "linear", null));
      return;
    }
    if (shape === "spring") {
      sendSpring(springOf(duration / 1000, SPRING_START));
      return;
    }
    const keep = curve.shape === shape ? curve.intensity : START;
    onretime(reshape(track, easingOf(shape, keep), null));
  };
  const setIntensity = (value: number) => {
    if (curve.shape === "spring" && first.spring) {
      sendSpring({
        ...springOf(responseOf(first.spring), value),
        mass: first.spring.mass,
      });
      return;
    }
    if (
      curve.shape === "smooth" ||
      curve.shape === "slowDown" ||
      curve.shape === "speedUp"
    ) {
      onretime(reshape(track, easingOf(curve.shape, value), null));
    }
  };
  const setLength = (ms: number) => {
    const next = Math.max(STEP, Math.round(ms));
    if (first.spring) {
      sendSpring({
        ...springOf(next / 1000, first.spring.bounce),
        mass: first.spring.mass,
      });
      return;
    }
    onretime(relength(track, next));
  };
  const setNumber = (at: number, value: number) => {
    const next = [...(bezier ?? [0.33, 0.33, 0.67, 0.67])];
    next[at] = value;
    onretime(reshape(track, cubic(next), null));
  };
  const setSpring = (key: "mass" | "stiffness" | "damping", value: number) => {
    const base = first.spring ?? springOf(duration / 1000, SPRING_START);
    if (value > 0) {
      sendSpring({ ...base, [key]: value });
    }
  };
  /** The spring's length as he sets it: its response, ms. */
  const shownLength = $derived(
    first.spring ? Math.round(responseOf(first.spring) * 1000) : duration
  );

  /** Each shape drawn: its curve from the start to the end, in a 24-unit box (motion `curveGlyph`, as the rows draw theirs). */
  const glyphOf = (shape: Shape): string => {
    if (shape === "linear" || shape === "spring") {
      return (
        curveGlyph(
          shape === "linear"
            ? "linear"
            : springEasing(springOf(0.5, 0.45)).easing
        ) ?? ""
      );
    }
    return curveGlyph(easingOf(shape, 0.9)) ?? "";
  };
  const SHAPES: Shape[] = ["linear", "smooth", "slowDown", "speedUp", "spring"];
  /** The house's own timing, named only when the clip's timing is one (its length a token, its curve a token's or its frames'). */
  const token = $derived(
    first.adHoc
      ? ""
      : [first.token?.replace("--dur-", ""), first.framed ? null : first.curve]
          .filter(Boolean)
          .join(" · ")
  );
  const slider = $derived.by(() => {
    if (curve.shape === "spring") {
      return { label: words.bounce, max: BOUNCE_MOST, value: curve.intensity };
    }
    if (
      curve.shape === "smooth" ||
      curve.shape === "slowDown" ||
      curve.shape === "speedUp"
    ) {
      return { label: words.intensity, max: 1, value: curve.intensity };
    }
    return null;
  });
  /** The slider's value while a drag holds it; the row's own at rest. */
  let held = $state<number | null>(null);
  /** The curve's four numbers while a control point is dragged on the graph. */
  let bending = $state<number[] | null>(null);

  /**
   * The chosen curve drawn large, as it stands (or as the slider holds it
   * while he drags), progress up against time across: Rive draws the key's
   * curve beside its timeline, Jitter the chosen preset over its intensity
   * slider (mobbin.com/screens/52027cf8-1895-4b57-9a0d-1323cdd0da87,
   * mobbin.com/screens/807d0e3b-dec5-4e50-bfbe-431b86815e31). A curve kept
   * in a clip's frames has no line of its own to draw.
   */
  const GRAPH = { w: 160, h: 90, low: -0.25, high: 1.25 } as const;
  const yOf = (progress: number) =>
    (GRAPH.h * (GRAPH.high - progress)) / (GRAPH.high - GRAPH.low);
  const preview = $derived.by((): string | null => {
    if (curve.shape === "own" && !bezier) {
      return null;
    }
    if (curve.shape === "spring" && first.spring) {
      const spring =
        held === null
          ? first.spring
          : {
              ...springOf(responseOf(first.spring), held),
              mass: first.spring.mass,
            };
      const points = springEasing(spring)
        .easing.slice("linear(".length, -1)
        .split(",")
        .map(Number);
      return points
        .map(
          (at, i) =>
            `${i === 0 ? "M" : "L"}${((GRAPH.w * i) / (points.length - 1)).toFixed(1)} ${yOf(at).toFixed(1)}`
        )
        .join(" ");
    }
    const bent =
      bending ??
      (held !== null &&
      (curve.shape === "smooth" ||
        curve.shape === "slowDown" ||
        curve.shape === "speedUp")
        ? bezierOf(easingOf(curve.shape, held))
        : bezier);
    const [x1 = 0, y1 = 0, x2 = 1, y2 = 1] = bent ?? [];
    return `M0 ${yOf(0)} C${GRAPH.w * x1} ${yOf(y1)} ${GRAPH.w * x2} ${yOf(y2)} ${GRAPH.w} ${yOf(1)}`;
  });

  /** The graph's two control points, px in its box, where the curve is a cubic one. */
  const points = $derived.by(() => {
    const at =
      bending ??
      (curve.shape === "spring" || first.framed || first.spring
        ? null
        : bezier);
    if (!at) {
      return null;
    }
    const [x1 = 0, y1 = 0, x2 = 1, y2 = 1] = at;
    return [
      { x: GRAPH.w * x1, y: yOf(y1) },
      { x: GRAPH.w * x2, y: yOf(y2) },
    ];
  });
  let graph = $state<HTMLElement>();
  /** The control point held: its index, 0 or 1. */
  let dragging: number | null = null;
  const BEND = 1000;
  /** Where the pointer stands on the graph, as a curve's x (0 to 1) and progress. */
  const curveAt = (event: PointerEvent): [number, number] => {
    const box = (graph as HTMLElement).getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (event.clientX - box.left) / box.width));
    const y =
      GRAPH.high -
      ((event.clientY - box.top) / box.height) * (GRAPH.high - GRAPH.low);
    return [Math.round(x * BEND) / BEND, Math.round(y * BEND) / BEND];
  };
  const takePoint = (at: number, event: PointerEvent) => {
    event.preventDefault();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    dragging = at;
    bending = [...(bezier ?? [0.33, 0.33, 0.67, 0.67])];
  };
  const movePoint = (event: PointerEvent) => {
    if (dragging === null || !bending || !graph) {
      return;
    }
    const [x, y] = curveAt(event);
    const next = [...bending];
    next[dragging * 2] = x;
    next[dragging * 2 + 1] = y;
    bending = next;
  };
  const letPoint = () => {
    if (dragging !== null && bending) {
      onretime(reshape(track, cubic(bending), null));
    }
    dragging = null;
    bending = null;
  };

  const field =
    "hit-under touch-hit h-c-btn-h-sm w-full min-w-0 rounded-md border border-border-control bg-surface-raised px-space-2 type-label text-ink-strong num";
  const chip = (on: boolean) => [
    "pointer-hit touch-hit flex h-c-btn-h-sm min-w-0 items-center justify-center gap-space-1 rounded-sm px-space-2 type-label transition-control",
    on
      ? "bg-selected-bg text-selected-ink"
      : "text-ink-row can-hover:hover:bg-surface-hover",
  ];
  const stepper =
    "pointer-hit touch-hit grid size-c-btn-h-sm flex-none place-items-center rounded-md text-ink-strong transition-control can-hover:hover:bg-surface-hover";
</script>

<section
  data-slot="clip-editor"
  aria-label={name}
  class="flex min-w-0 flex-col gap-space-4 rounded-md bg-surface-recess p-space-3"
>
  <fieldset class="m-0 flex min-w-0 flex-col gap-space-2 border-0 p-0">
    <legend class="mb-space-2 type-label text-ink-muted">{words.length}</legend>
    <div class="flex min-w-0 items-center gap-space-1 coarse:gap-space-3">
      <button
        type="button"
        aria-label={words.shorter}
        class={stepper}
        onclick={() => setLength(shownLength - STEP)}
      >
        <IconMinus aria-hidden="true" class="size-icon-md" />
      </button>
      <label class="flex min-w-0 flex-1 items-center gap-space-2">
        <span class="sr-only">{words.length}</span>
        <input
          class={field}
          min={STEP}
          step={STEP}
          type="number"
          value={shownLength}
          onchange={(event) => setLength(Number(event.currentTarget.value))}
        />
        <span class="type-meta text-ink-muted">{words.msUnit}</span>
      </label>
      <button
        type="button"
        aria-label={words.longer}
        class={stepper}
        onclick={() => setLength(shownLength + STEP)}
      >
        <IconPlus aria-hidden="true" class="size-icon-md" />
      </button>
    </div>
    <div class="grid grid-cols-3 gap-space-1 coarse:gap-space-3">
      {#each words.lengths as one (one.name)}
        <!-- mark-line: a preset's name and its figure, both words -->
        <button
          type="button"
          aria-pressed={shownLength === one.ms}
          class={chip(shownLength === one.ms)}
          onclick={() => setLength(one.ms)}
        >
          <span>{one.name}</span>
          <span class="type-meta text-ink-muted num">{one.ms}</span>
        </button>
      {/each}
    </div>
  </fieldset>

  <!-- mark-line: a column; the curve's graph stands under the shapes, beside no words -->
  <fieldset class="m-0 flex min-w-0 flex-col gap-space-2 border-0 p-0">
    <legend class="mb-space-2 type-label text-ink-muted">{words.curve}</legend>
    <span class="type-meta text-ink-muted">{words.designSystem}</span>
    <div class="grid grid-cols-3 gap-space-1 coarse:gap-space-3">
      {#each HOUSE as house (house)}
        {@const on = houseCurve === house}
        <button
          type="button"
          aria-pressed={on}
          class={chip(on)}
          onclick={() => onretime(reshape(track, houseEasing(house), null))}
        >
          <span>{words.curves[house]}</span>
        </button>
      {/each}
    </div>
    <span class="type-meta text-ink-muted">{words.shapesHead}</span>
    <div class="grid grid-cols-5 gap-space-1">
      {#each SHAPES as shape (shape)}
        {@const on = curve.shape === shape}
        <!-- mark-line: the shape's glyph stands over its name, not beside it -->
        <button
          type="button"
          aria-pressed={on}
          class={[
            "pointer-hit touch-hit flex min-w-0 flex-col items-center gap-space-1 rounded-sm px-space-1 py-space-2 transition-control",
            on
              ? "bg-selected-bg text-selected-ink"
              : "text-ink-row can-hover:hover:bg-surface-hover",
          ]}
          onclick={() => pickShape(shape)}
        >
          <svg
            aria-hidden="true"
            class="size-icon-lg"
            fill="none"
            stroke="currentColor"
            stroke-linecap="round"
            stroke-width="1.5"
            viewBox="0 0 24 24"
          >
            <path d={glyphOf(shape)} />
          </svg>
          <span class="text-center type-meta text-balance"
            >{words.shapes[shape]}</span
          >
        </button>
      {/each}
    </div>
    {#if preview}
      <div
        bind:this={graph}
        class="relative aspect-16/10 w-full"
        onpointercancel={letPoint}
        onpointermove={movePoint}
        onpointerup={letPoint}
        role="presentation"
      >
        <svg
          aria-hidden="true"
          class="size-full overflow-visible rounded-md bg-surface-raised text-ink-strong"
          data-slot="curve-graph"
          fill="none"
          preserveAspectRatio="none"
          viewBox="0 0 {GRAPH.w} {GRAPH.h}"
        >
          <path
            class="stroke-border-control"
            d="M0 {yOf(0)} H{GRAPH.w} M0 {yOf(1)} H{GRAPH.w}"
            stroke-dasharray="2 3"
            vector-effect="non-scaling-stroke"
          />
          {#if points}
            <path
              class="stroke-ink-muted"
              d="M0 {yOf(0)} L{points[0]?.x} {points[0]?.y} M{GRAPH.w} {yOf(
                1
              )} L{points[1]?.x} {points[1]?.y}"
              vector-effect="non-scaling-stroke"
            />
          {/if}
          <path
            d={preview}
            stroke="currentColor"
            stroke-linecap="round"
            stroke-width="1.5"
            vector-effect="non-scaling-stroke"
          />
        </svg>
        {#if points}
          <!-- The curve's two control points, dragged on the graph; the
                 four numbers under Advanced are their keyboard's way. -->
          {#each points as point, at (at)}
            <span
              aria-hidden="true"
              class="pointer-hit touch-hit absolute start-(--x) top-(--y) size-space-3 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-pill border border-border-control-strong bg-surface-raised shadow-xs rtl:translate-x-1/2"
              onpointerdown={(event) => takePoint(at, event)}
              style:--x="{(point.x / GRAPH.w) * 100}%"
              style:--y="{(point.y / GRAPH.h) * 100}%"
            ></span>
          {/each}
        {/if}
      </div>
    {/if}
    {#if curve.shape === "own"}
      <p class="m-0 type-meta text-ink-muted">{words.ownShape}</p>
    {/if}
    {#if slider}
      <div class="flex min-w-0 items-center gap-space-3">
        <span class="type-label text-ink-muted">{slider.label}</span>
        <Slider.Root
          class="relative flex h-c-btn-h-sm min-w-0 flex-1 touch-none items-center select-none"
          max={slider.max}
          min={0}
          onValueChange={(next: number) => {
            held = next;
          }}
          onValueCommit={(next: number) => {
            held = null;
            setIntensity(next);
          }}
          step={0.05}
          type="single"
          value={held ?? Math.min(slider.max, slider.value)}
        >
          <span
            class="relative h-space-1 w-full overflow-clip rounded-pill bg-surface-fill"
          >
            <Slider.Range class="absolute h-full rounded-pill bg-ink-muted" />
          </span>
          <Slider.Thumb
            aria-label={slider.label}
            class="pointer-hit touch-hit block size-space-4 cursor-ew-resize rounded-pill border border-border-control bg-surface-raised shadow-xs focus-visible:outline-(length:--focus-ring-width) focus-visible:outline-solid focus-visible:outline-focus-ring focus-visible:outline-offset-2"
            index={0}
          />
        </Slider.Root>
        <span class="w-space-7 text-end type-meta text-ink-muted num"
          >{Math.round((held ?? slider.value) * 100)}%</span
        >
      </div>
    {/if}
  </fieldset>

  <button
    type="button"
    aria-expanded={advanced}
    class="pointer-hit touch-hit self-start rounded-sm type-label text-link-ink"
    onclick={() => {
      advanced = !advanced;
    }}
  >
    {words.advanced}
  </button>
  {#if advanced}
    <div class="grid grid-cols-2 gap-space-2" in:unfold out:unfold>
      <label class="flex flex-col gap-space-1 type-meta text-ink-muted">
        {words.delay}
        <input
          class={field}
          min="0"
          step={STEP}
          type="number"
          value={delayOf(track)}
          onchange={(event) =>
            onretime(
              redelay(track, Math.max(0, Number(event.currentTarget.value)))
            )}
        />
      </label>
      {#if first.spring}
        {#each [["mass", words.mass, 0.1], ["stiffness", words.stiffness, 10], ["damping", words.damping, 1]] as const as [key, label, step] (key)}
          <label class="flex flex-col gap-space-1 type-meta text-ink-muted">
            {label}
            <input
              class={field}
              min="0"
              {step}
              type="number"
              value={Number(first.spring[key].toFixed(2))}
              onchange={(event) =>
                setSpring(key, Number(event.currentTarget.value))}
            />
          </label>
        {/each}
      {:else if bezier}
        <fieldset
          class="col-span-2 m-0 grid grid-cols-4 gap-space-1 border-0 p-0"
        >
          <legend class="mb-space-1 type-meta text-ink-muted"
            >{words.custom}</legend
          >
          {#each bezier as value, at (at)}
            <input
              aria-label={`${words.custom} ${at + 1}`}
              class={field}
              step="0.01"
              type="number"
              value={Number(value.toFixed(3))}
              onchange={(event) =>
                setNumber(at, Number(event.currentTarget.value))}
            />
          {/each}
        </fieldset>
      {/if}
    </div>
  {/if}

  {#if token}
    <p class="m-0 type-meta text-ink-muted">{words.tokenLine(token)}</p>
  {/if}
  {#if tuned}
    <button
      type="button"
      class="pointer-hit touch-hit self-start rounded-sm type-label text-link-ink"
      onclick={onreset}
    >
      {words.reset}
    </button>
  {/if}
</section>
