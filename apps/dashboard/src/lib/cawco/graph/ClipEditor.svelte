<script lang="ts">
  /**
   * A row's editor (the owner's answer: a full editor, presets first, the
   * rest for whoever wants it), opened in the row under its bar (the
   * owner's pick: the clip's controls open in its row), so the bars he
   * changes stay in view on a desk and in the phone's drawer alike.
   *
   * One pattern for every value, as a motion tool's inspector lays its
   * properties out (Jitter's Duration and Easing rows, Motion Studio's
   * Transition): the value's name in a column of its own, its control
   * beside it, every control one field's height. Duration and Delay are a
   * figure he types or steps; Duration's presets stand beside it. Curve is
   * one list: the design system's own curves, then the named shapes (Jitter's
   * presets: jitter.video/changelog/2023-11-08-easings-intensity), each with
   * its glyph; the chosen curve is drawn under it, its two control points
   * dragged on it (DialKit's easing editor), and one slider for the chosen
   * shape: its intensity, or a spring's bounce. Under Advanced: the curve's
   * four numbers, or a spring's mass, stiffness and damping.
   *
   * A value he changed is marked on itself (his pin 26): its figure in the
   * edit's coral, and its name a press, dashed underneath, that puts that
   * one value back (motion `restore`), named for what it goes back to, as
   * a property inspector's changed label resets its property. Every change
   * plays on the stage once.
   */
  import { HOUR_MS } from "@cawco/core/time";
  import { graphWords as words } from "@cawco/core/words/graph";
  import { Slider } from "bits-ui";
  import { ease } from "#lib/cawco/motion/curves.svelte.js";
  import { unfold } from "#lib/cawco/motion/fold.svelte.js";
  import * as InputGroup from "#lib/components/ui/input-group/index.js";
  import * as Select from "#lib/components/ui/select/index.js";
  import * as ToggleGroup from "#lib/components/ui/toggle-group/index.js";
  import { IconChevronDown, IconMinus, IconPlus } from "#lib/icons.js";
  import { figureOf } from "./figures";
  import {
    bezierOf,
    type Clip,
    cubic,
    curveGlyph,
    curveTokenOf,
    delayOf,
    deltaOf,
    easingOf,
    editsOf,
    redelay,
    relength,
    reshape,
    restore,
    type Shape,
    type Spring,
    shapeOfCurve,
    springEasing,
    springOf,
    springSettling,
    type Timing,
    type Track,
    untune,
  } from "./motion";

  let {
    track,
    name,
    onretime,
    lang,
  }: {
    track: Track;
    /** The row as a person says it. */
    name: string;
    onretime: (clips: Clip[]) => void;
    /** The page's language, for the figures. */
    lang: string | undefined;
  } = $props();

  const first = $derived(track.clips[0] as Clip);
  const figure = (n: number) => figureOf(Math.round(n), lang);
  /** The values he changed on this row. */
  const edits = $derived(editsOf(track));
  /** The row's first clip as the engine ran it. */
  const was = $derived(track.clips.find((clip) => clip.was)?.was ?? null);
  /** A curve's name: its token's, a spring's, or its own. */
  const curveWord = (clip: Clip) => {
    if (clip.spring) {
      return words.shapes.spring;
    }
    return (!clip.framed && clip.curve) || words.ownCurve;
  };
  /** Each changed value's press, named for what it goes back to. */
  const resets = $derived<Partial<Record<Timing, string>>>(
    was
      ? {
          ...(edits.has("length") && {
            length: words.resetLength(figure(was.duration)),
          }),
          ...(edits.has("start") && {
            start: words.resetDelay(
              figure(
                Math.min(
                  ...track.clips.map(
                    (clip) => untune(clip).start + untune(clip).delay
                  )
                ) - track.setOff
              )
            ),
          }),
          ...(edits.has("curve") && {
            curve: words.resetCurve(curveWord(was)),
          }),
        }
      : {}
  );
  /** What the clip changes, when it is one plain number. */
  const delta = $derived(track.clips.length === 1 ? deltaOf(first) : null);
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
  /** The row's delay, ms after the move set it off. */
  const delay = $derived(Math.round(delayOf(track)));
  const setDelay = (ms: number) => {
    onretime(redelay(track, Math.max(0, Math.round(ms))));
  };

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
      sendSpring(springSettling(duration, SPRING_START));
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
      sendSpring(springSettling(next, first.spring.bounce, first.spring.mass));
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
  /** The row's length as he sets it; a spring's where it settles, as its row says. */
  const shownLength = $derived(duration);

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
  /** The longest a length or a delay is set to, ms: an hour, past the 30-minute fill a states file may play. */
  const LONGEST = HOUR_MS;
  /**
   * The curve list's value: a design system curve's token, else a shape,
   * else the clip's own (a curve drawn into its frames, or one no shape is
   * near), which the list names but never offers.
   */
  const curveValue = $derived(
    houseCurve ? `house:${houseCurve}` : `shape:${curve.shape}`
  );
  const pickCurve = (value: string) => {
    const [kind, named] = value.split(":") as [string, string];
    if (kind === "house") {
      onretime(
        reshape(track, houseEasing(named as (typeof HOUSE)[number]), null)
      );
    } else if (kind === "shape" && named !== "own") {
      pickShape(named as Shape);
    }
  };
  /** The curve as the list's trigger names it, with its glyph. */
  const curveShown = $derived.by(() => {
    if (curve.shape === "own") {
      return { name: words.ownCurve, glyph: curveGlyph(first.easing) };
    }
    return {
      name: houseCurve ? words.curves[houseCurve] : words.shapes[curve.shape],
      glyph: glyphOf(curve.shape),
    };
  });
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
</script>

{#snippet glyph(path: string | null)}
  {#if path}
    <svg
      aria-hidden="true"
      class="size-icon-md flex-none"
      fill="none"
      stroke="currentColor"
      stroke-linecap="round"
      stroke-width="1.5"
      viewBox="0 0 24 24"
    >
      <path d={path} />
    </svg>
  {/if}
{/snippet}

{#snippet named(text: string, key: Timing | null, forId?: string)}
  <!-- A value's name in its column; once he changed the value, the press
       that puts it back, its edge dashed as the bar's original is. -->
  {#if key && resets[key]}
    <button
      type="button"
      aria-label={resets[key]}
      class="pointer-hit touch-hit flex min-h-c-input-h items-center justify-self-start rounded-xs type-label text-selected-ink underline decoration-selected-ink decoration-dashed underline-offset-4 transition-control can-hover:hover:bg-selected-bg"
      data-edited={key}
      onclick={() => onretime(restore(track, key))}
      title={resets[key]}
    >
      {text}
    </button>
  {:else if forId}
    <label
      class="flex min-h-c-input-h items-center type-label text-ink-muted"
      for={forId}>{text}</label
    >
  {:else}
    <span class="flex min-h-c-input-h items-center type-label text-ink-muted"
      >{text}</span
    >
  {/if}
{/snippet}

{#snippet stepped(
  id: string,
  label: string,
  value: number,
  edited: boolean,
  min: number,
  set: (ms: number) => void
)}
  <InputGroup.Root class="w-c-graph-figure-w flex-none">
    <InputGroup.Addon>
      <InputGroup.Button
        aria-label={words.shorter}
        onclick={() => set(value - STEP)}
        size="icon-xs"
      >
        <IconMinus aria-hidden="true" />
      </InputGroup.Button>
    </InputGroup.Addon>
    <InputGroup.Input
      {id}
      aria-label={label}
      field="number"
      text="label"
      tone={edited ? "edited" : undefined}
      max={LONGEST}
      {min}
      onchange={(event: Event) =>
        set(Number((event.currentTarget as HTMLInputElement).value))}
      step={STEP}
      type="number"
      {value}
    />
    <InputGroup.Addon align="inline-end">
      <span class="type-meta text-ink-muted">{words.msUnit}</span>
      <InputGroup.Button
        aria-label={words.longer}
        onclick={() => set(value + STEP)}
        size="icon-xs"
      >
        <IconPlus aria-hidden="true" />
      </InputGroup.Button>
    </InputGroup.Addon>
  </InputGroup.Root>
{/snippet}

<section
  data-slot="clip-editor"
  aria-label={name}
  class="grid min-w-0 grid-cols-(--cols) items-start gap-x-space-5 gap-y-space-3 rounded-md bg-surface-recess p-space-3"
  style:--cols="var(--c-graph-editor-label) minmax(0, 1fr)"
>
  {@render named(words.length, "length", `${track.id}-length`)}
  <div class="flex min-w-0 flex-wrap items-center gap-x-space-3 gap-y-space-2">
    {@render stepped(
      `${track.id}-length`,
      words.length,
      shownLength,
      edits.has("length"),
      STEP,
      setLength
    )}
    <ToggleGroup.Root
      aria-label={words.length}
      onValueChange={(next: string) => {
        if (next) {
          setLength(Number(next));
        }
      }}
      type="single"
      value={String(shownLength)}
    >
      {#each words.lengths as one (one.name)}
        <ToggleGroup.Item value={String(one.ms)}>{one.name}</ToggleGroup.Item>
      {/each}
    </ToggleGroup.Root>
  </div>

  {@render named(words.delay, "start", `${track.id}-delay`)}
  <div class="flex min-w-0 items-center">
    {@render stepped(
      `${track.id}-delay`,
      words.delay,
      delay,
      edits.has("start"),
      0,
      setDelay
    )}
  </div>

  {@render named(words.curve, "curve")}
  <div class="flex min-w-0 flex-wrap items-center gap-x-space-3 gap-y-space-2">
    <Select.Root onValueChange={pickCurve} type="single" value={curveValue}>
      <Select.Trigger
        aria-label={words.curve}
        class="w-c-graph-figure-w flex-none"
        tone={edits.has("curve") ? "edited" : undefined}
      >
        <span
          class="flex min-w-0 items-center gap-space-2"
          data-slot="select-value"
        >
          {@render glyph(curveShown.glyph)}
          <span class="truncate">{curveShown.name}</span>
        </span>
      </Select.Trigger>
      <Select.Content>
        <Select.Group>
          <Select.GroupHeading>{words.designSystem}</Select.GroupHeading>
          {#each HOUSE as house (house)}
            <Select.Item label={words.curves[house]} value="house:{house}">
              {@render glyph(curveGlyph(houseEasing(house)))}
              {words.curves[house]}
            </Select.Item>
          {/each}
        </Select.Group>
        <Select.Group>
          <Select.GroupHeading>{words.shapesHead}</Select.GroupHeading>
          {#each SHAPES as shape (shape)}
            <Select.Item label={words.shapes[shape]} value="shape:{shape}">
              {@render glyph(glyphOf(shape))}
              {words.shapes[shape]}
            </Select.Item>
          {/each}
        </Select.Group>
      </Select.Content>
    </Select.Root>
    {#if curve.shape === "own"}
      <span class="type-meta text-ink-muted">{words.ownShape}</span>
    {/if}
  </div>

  {#if preview}
    <span aria-hidden="true"></span>
    <div
      bind:this={graph}
      class="relative aspect-16/9 w-full max-w-c-graph-node-w"
      onpointercancel={letPoint}
      onpointermove={movePoint}
      onpointerup={letPoint}
      role="presentation"
    >
      <svg
        aria-hidden="true"
        class="size-full overflow-visible rounded-md border border-border-hairline bg-surface-raised text-ink-strong"
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

  {#if slider}
    <span class="flex min-h-c-input-h items-center type-label text-ink-muted"
      >{slider.label}</span
    >
    <div class="flex min-h-c-input-h min-w-0 items-center gap-space-3">
      <Slider.Root
        class="relative flex h-c-btn-h-sm w-full max-w-c-graph-node-w min-w-0 touch-none items-center select-none"
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
      <span class="type-meta text-ink-muted num"
        >{Math.round((held ?? slider.value) * 100)}%</span
      >
    </div>
  {/if}

  {#if delta}
    <span class="flex min-h-c-input-h items-center type-label text-ink-muted"
      >{words.changesHead}</span
    >
    <span
      class="flex min-h-c-input-h min-w-0 items-center type-code text-ink-row num wrap-anywhere"
      title={words.propertyOf(
        delta.property,
        figure(delta.from),
        figure(delta.to),
        delta.unit
      )}
      >{words.property(
        delta.property,
        figure(delta.from),
        figure(delta.to),
        delta.unit
      )}</span
    >
  {/if}

  {#if bezier || first.spring}
    <span aria-hidden="true"></span>
    <button
      type="button"
      aria-expanded={advanced}
      class="mark-line pointer-hit touch-hit -ms-space-1 flex h-c-btn-h-sm items-center gap-space-1 justify-self-start rounded-sm px-space-1 type-label text-ink-row transition-control can-hover:hover:bg-surface-hover"
      onclick={() => {
        advanced = !advanced;
      }}
    >
      <span>{words.advanced}</span>
      <IconChevronDown
        aria-hidden="true"
        class={[
          "size-icon-md flex-none text-ink-muted transition-transform duration-(--dur-control) ease-out",
          advanced && "rotate-180",
        ]}
        data-box
      />
    </button>
  {/if}
  {#if advanced}
    <div
      class="col-span-full grid min-w-0 grid-cols-subgrid gap-y-space-3"
      in:unfold
      out:unfold
    >
      {#if first.spring}
        {#each [["mass", words.mass, 0.1], ["stiffness", words.stiffness, 10], ["damping", words.damping, 1]] as const as [key, label, step] (key)}
          <label
            class="flex min-h-c-input-h items-center type-label text-ink-muted"
            for="{track.id}-{key}">{label}</label
          >
          <InputGroup.Root class="w-c-graph-figure-w">
            <InputGroup.Input
              id="{track.id}-{key}"
              field="number"
              text="label"
              min="0"
              onchange={(event: Event) =>
                setSpring(
                  key,
                  Number((event.currentTarget as HTMLInputElement).value)
                )}
              {step}
              type="number"
              value={Number(first.spring[key].toFixed(2))}
            />
          </InputGroup.Root>
        {/each}
      {:else if bezier}
        <span
          class="flex min-h-c-input-h items-center type-label text-ink-muted"
          >{words.custom}</span
        >
        <div class="grid min-w-0 grid-cols-4 gap-space-1">
          {#each bezier as value, at (at)}
            <InputGroup.Root>
              <InputGroup.Input
                aria-label={`${words.custom} ${at + 1}`}
                field="number"
                text="label"
                onchange={(event: Event) =>
                  setNumber(
                    at,
                    Number((event.currentTarget as HTMLInputElement).value)
                  )}
                step="0.01"
                type="number"
                value={Number(value.toFixed(3))}
              />
            </InputGroup.Root>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</section>
