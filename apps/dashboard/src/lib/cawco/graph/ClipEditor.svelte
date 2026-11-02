<script lang="ts">
  /**
   * A row's editor (the owner's answer: a full editor, presets first, the
   * rest for whoever wants it), in the kit's popover, opened beside its row
   * so the bars he changes stay in view: to its leading side on a desk; in
   * the phone's drawer over the rows above it, never its own.
   *
   * Length first: a figure he can type or step, over three plain presets
   * with their figure beside each. Then the curve as named shapes, drawn
   * (Jitter's presets: jitter.video/changelog/2023-11-08-easings-intensity),
   * and one slider for the chosen one: its intensity, or a spring's bounce.
   * Under Advanced: the delay, the curve's four numbers (as Rive's
   * interpolation field: rive.app/docs/editor/animate-mode/
   * interpolation-easing), and a spring's mass, stiffness and damping. The
   * house's own token for the timing, when it is one, is named here and
   * nowhere on the row. Every change plays on the stage at once; the row
   * says it was tuned, before and after, and the agent reads it back.
   */
  import { graphWords as words } from "@cawco/core/words/graph";
  import { Slider } from "bits-ui";
  import { unfold } from "#lib/cawco/motion/fold.svelte.js";
  import * as Popover from "#lib/components/ui/popover/index.js";
  import { IconMinus, IconPlus, IconTuning } from "#lib/icons.js";
  import {
    bezierOf,
    type Clip,
    cubic,
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
    coarse = false,
    onretime,
    onreset,
  }: {
    track: Track;
    /** The row as a person says it. */
    name: string;
    /** It opens in the phone's drawer. */
    coarse?: boolean;
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

  /** Each shape drawn: its curve from the start to the end, in a 24-unit box. */
  const glyphOf = (shape: Shape): string => {
    if (shape === "linear") {
      return "M2 22 L22 2";
    }
    if (shape === "spring") {
      const points = springEasing(springOf(0.5, 0.45))
        .easing.slice(7, -1)
        .split(",")
        .map(Number);
      return points
        .map(
          (along, i) =>
            `${i === 0 ? "M" : "L"}${(2 + (20 * i) / (points.length - 1)).toFixed(1)} ${(22 - 16 * along).toFixed(1)}`
        )
        .join(" ");
    }
    const [x1 = 0, y1 = 0, x2 = 1, y2 = 1] =
      bezierOf(easingOf(shape, 0.9)) ?? [];
    const x = (t: number) => (2 + 20 * t).toFixed(1);
    const y = (t: number) => (22 - 20 * t).toFixed(1);
    return `M2 22 C${x(x1)} ${y(y1)} ${x(x2)} ${y(y2)} 22 2`;
  };
  const SHAPES: Shape[] = ["linear", "smooth", "slowDown", "speedUp", "spring"];
  const token = $derived(
    [first.token?.replace("--dur-", ""), first.framed ? null : first.curve]
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

<Popover.Root>
  <Popover.Trigger>
    {#snippet child({ props })}
      <button
        {...props}
        aria-label={words.edit(name)}
        class="pointer-hit touch-hit grid size-c-btn-h-sm flex-none place-items-center rounded-md text-ink-muted transition-control can-hover:hover:bg-surface-hover can-hover:hover:text-ink-strong"
        title={words.edit(name)}
        type="button"
      >
        <IconTuning aria-hidden="true" class="size-icon-md" />
      </button>
    {/snippet}
  </Popover.Trigger>
  <Popover.Content
    align="start"
    collisionPadding={8}
    side={coarse ? "top" : "left"}
    sideOffset={8}
    width="wide"
  >
    <div
      data-slot="clip-editor"
      class="flex min-w-0 flex-col gap-space-4 p-space-2"
    >
      <p class="m-0 type-label text-ink-strong wrap-anywhere num">{name}</p>

      <fieldset class="m-0 flex min-w-0 flex-col gap-space-2 border-0 p-0">
        <legend class="mb-space-2 type-label text-ink-muted"
          >{words.length}</legend
        >
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
        {#if first.spring}
          <p class="m-0 type-meta text-ink-muted num">
            {words.settles(duration)}
          </p>
        {/if}
      </fieldset>

      <fieldset class="m-0 flex min-w-0 flex-col gap-space-2 border-0 p-0">
        <legend class="mb-space-2 type-label text-ink-muted"
          >{words.curve}</legend
        >
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
                <Slider.Range
                  class="absolute h-full rounded-pill bg-ink-muted"
                />
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
      <p class="m-0 type-meta text-ink-muted">{words.tunedGoes}</p>
      {#if tuned}
        <button
          type="button"
          class="pointer-hit touch-hit self-start rounded-sm type-label text-link-ink"
          onclick={onreset}
        >
          {words.reset}
        </button>
      {/if}
    </div>
  </Popover.Content>
</Popover.Root>
