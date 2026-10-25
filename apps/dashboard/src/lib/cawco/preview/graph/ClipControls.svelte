<script lang="ts">
  import { designGraphWords as words } from "@cawco/core";
  /**
   * A clip's controls (Projects spec §5.10; round 29, section C), one
   * component wherever they open (clip-controls.ts: in the clip's row, or in
   * an inspector beside the timeline), never a popover (the owner: "popover?
   * lol.."). One thing at a time: the length (a slider with a detent at each
   * of the page's duration tokens, and a figure that takes any number), the
   * curve (the page's easing tokens as glyphs, Spring, Custom, and the
   * agent's own curve as written; the chosen one drawn large, a bézier's
   * handles to drag), and a spring's every parameter as a figure that takes
   * any value (the owner: "why restrict yourself to this?"). A change applies
   * at once and the move replays (the owner's pick "replay"); a key's step
   * stays still. No foot and no Save.
   */
  import {
    type Bezier,
    type ClipTiming,
    type Curve,
    curvePoints,
    durationTokenOf,
    easingTokenOf,
    type Spring,
    springFrom,
    springPath,
    springPhysics,
  } from "@cawco/core/design-graph";
  import { motionOk } from "#lib/cawco/motion/curves.svelte.js";
  import { IconChevronLeft, IconClose } from "#lib/icons.js";
  import CurveGlyph from "./CurveGlyph.svelte";
  import {
    adHoc,
    choiceOf,
    curveFor,
    curveWord,
    ladderOf,
    nearest,
    propertyWords,
    sliderMax,
    tokenWord,
  } from "./clip-words";
  import type { DesignGraph } from "./design-graph.svelte";
  import GlassGroup from "./GlassGroup.svelte";
  import KindGlyph from "./KindGlyph.svelte";
  import { GHOST, RING, SYMBOL } from "./symbol";

  let {
    graph,
    id,
    placement,
    narrow = false,
    onclose,
  }: {
    graph: DesignGraph;
    id: number;
    /** Where they stand: in the clip's own row, or in the dock's inspector. */
    placement: "row" | "inspector";
    /** An inspector standing in the timeline's place (a dock too narrow for both): Close is Back. */
    narrow?: boolean;
    onclose: () => void;
  } = $props();

  const move = $derived(graph.move);
  const clip = $derived(move?.clips[id] ?? null);
  const timing = $derived(graph.edited[id] ?? null);
  const original = $derived(graph.original[id] ?? null);
  const tokens = $derived(move?.tokens ?? { durations: [], easings: [] });
  const edited = $derived(graph.changed.has(id));
  const spring = $derived(
    timing?.curve.kind === "spring" ? timing.curve : null
  );
  const ladder = $derived(ladderOf(tokens.durations));
  /** The agent's own values off the token scale, as it wrote them (a person's edit takes the selection pair instead). */
  const ownAdHoc = $derived(
    timing && original && !edited
      ? adHoc(timing, tokens)
      : { duration: false, curve: false }
  );

  /** A custom curve's four figures, split on spaces or commas. */
  const FIGURES = /[\s,]+/;

  const change = (next: (one: ClipTiming) => ClipTiming, replay: boolean) =>
    graph.editClip(id, next, { replay });

  /* --- The length: a slider with a detent at each duration token, and its figure -- */

  let slider = $state<HTMLElement>();
  const max = $derived(sliderMax(timing?.duration ?? 0));
  const at = (ms: number) => `${(Math.min(ms, max) / max) * 100}%`;
  const onToken = $derived(
    timing ? durationTokenOf(timing.duration, tokens.durations) : null
  );

  function slideAt(x: number, free: boolean): number {
    const box = slider?.getBoundingClientRect();
    if (!box || box.width === 0) {
      return timing?.duration ?? 0;
    }
    const value = Math.max(
      10,
      Math.min(max, ((x - box.left) / box.width) * max)
    );
    if (free) {
      return Math.round(value / 10) * 10;
    }
    const snap =
      (Number.parseFloat(
        getComputedStyle(slider as HTMLElement).getPropertyValue(
          "--c-detent-snap"
        )
      ) /
        box.width) *
      max;
    return nearest(value, ladder, snap) ?? Math.round(value / 10) * 10;
  }
  function slideDown(event: PointerEvent): void {
    if (event.button !== 0 || !slider) {
      return;
    }
    event.preventDefault();
    slider.focus({ preventScroll: true });
    slider.setPointerCapture(event.pointerId);
    const moveTo = (one: PointerEvent) => {
      const duration = slideAt(one.clientX, one.altKey);
      change((was) => ({ ...was, duration }), false);
    };
    moveTo(event);
    const done = () => {
      if (slider) {
        slider.onpointermove = null;
        slider.onpointerup = null;
        slider.onpointercancel = null;
      }
      // A drop: the move plays once from the start with the length let go.
      graph.play();
    };
    slider.onpointermove = moveTo;
    slider.onpointerup = done;
    slider.onpointercancel = done;
  }
  function slideKey(event: KeyboardEvent): void {
    const now = timing?.duration ?? 0;
    let next: number | undefined;
    if (event.key === "ArrowRight" || event.key === "ArrowUp") {
      next = event.shiftKey ? now + 10 : ladder.find((one) => one > now);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
      next = event.shiftKey
        ? Math.max(10, now - 10)
        : [...ladder].reverse().find((one) => one < now);
    } else if (event.key === "Home") {
      [next] = ladder;
    } else if (event.key === "End") {
      next = ladder.at(-1);
    } else {
      return;
    }
    event.preventDefault();
    if (next !== undefined) {
      const duration = next;
      change((was) => ({ ...was, duration }), false);
    }
  }

  /* --- Fields: any finite number; Enter or leaving commits and replays, Esc puts it back -- */

  /** What each field says now; reset from the clip when it changes under them. */
  const figures = $derived.by(() => {
    if (!timing) {
      return {} as Record<string, string>;
    }
    const out: Record<string, string> = {
      duration: String(Math.round(timing.duration * 100) / 100),
    };
    if (timing.curve.kind === "bezier") {
      out.bezier = timing.curve.points.map((one) => +one.toFixed(3)).join(", ");
    }
    if (timing.curve.kind === "spring") {
      const physics = springPhysics(timing.duration, timing.curve);
      out.bounce = String(+timing.curve.bounce.toFixed(3));
      out.mass = String(+timing.curve.mass.toFixed(3));
      out.velocity = String(+timing.curve.velocity.toFixed(2));
      out.stiffness = String(+physics.stiffness.toFixed(1));
      out.damping = String(+physics.damping.toFixed(2));
    }
    return out;
  });

  /** A spring's field applied: the bounce (up to 1), the velocity, or mass, stiffness and damping solved back into the response and the bounce, the other two held as a spring holds them. */
  function appliedSpring(
    field: string,
    value: number,
    was: ClipTiming,
    curve: Spring
  ): ClipTiming | null {
    if (field === "bounce") {
      // Any bounce up to 1 (undamped); under 0 it is overdamped and creeps in.
      return value <= 1
        ? { ...was, curve: { kind: "spring", ...curve, bounce: value } }
        : null;
    }
    if (field === "velocity") {
      return { ...was, curve: { kind: "spring", ...curve, velocity: value } };
    }
    const least = field === "damping" ? 0 : Number.MIN_VALUE;
    if (value < least) {
      return null;
    }
    const physics = springPhysics(was.duration, curve);
    const mass = field === "mass" ? value : curve.mass;
    const solved = springFrom(
      mass,
      field === "stiffness" ? value : physics.stiffness,
      field === "damping" ? value : physics.damping
    );
    return solved.bounce <= 1
      ? {
          duration: Math.max(1, solved.response),
          start: was.start,
          curve: { kind: "spring", ...curve, mass, bounce: solved.bounce },
        }
      : null;
  }

  /** A field's words applied to the clip: the timing it gives, or null when they are no number it takes. */
  function applied(field: string, raw: string): ClipTiming | null {
    if (!timing) {
      return null;
    }
    const text = raw.trim();
    if (field === "bezier") {
      const points = text.split(FIGURES).map(Number);
      return points.length === 4 && points.every(Number.isFinite)
        ? { ...timing, curve: { kind: "bezier", points: points as Bezier } }
        : null;
    }
    const value = Number(text);
    if (text === "" || !Number.isFinite(value)) {
      return null;
    }
    if (field === "duration") {
      return value >= 1 ? { ...timing, duration: value } : null;
    }
    const { curve } = timing;
    return curve.kind === "spring"
      ? appliedSpring(field, value, timing, curve)
      : null;
  }

  /** The length a key steps to: the next token up or down the ladder, or 10ms with ⇧ or ⌥. */
  function steppedLength(up: boolean, fine: boolean): number | undefined {
    const now = timing?.duration ?? 0;
    if (fine) {
      return Math.max(1, now + (up ? 10 : -10));
    }
    return up
      ? ladder.find((one) => one > now)
      : [...ladder].reverse().find((one) => one < now);
  }

  function commit(field: string, input: HTMLInputElement): void {
    const next = applied(field, input.value);
    if (next) {
      change(() => next, true);
    } else {
      input.value = figures[field] ?? "";
    }
  }
  function fieldKey(field: string, event: KeyboardEvent): void {
    const input = event.currentTarget as HTMLInputElement;
    if (event.key === "Enter") {
      event.preventDefault();
      commit(field, input);
    } else if (event.key === "Escape") {
      if (input.value !== (figures[field] ?? "")) {
        event.preventDefault();
        event.stopPropagation();
        input.value = figures[field] ?? "";
      }
    } else if (
      field === "duration" &&
      (event.key === "ArrowUp" || event.key === "ArrowDown")
    ) {
      event.preventDefault();
      const duration = steppedLength(
        event.key === "ArrowUp",
        event.shiftKey || event.altKey
      );
      if (duration !== undefined) {
        change((was) => ({ ...was, duration }), false);
      }
    }
  }

  /* --- The curve: the page's tokens, Spring, Custom, and the agent's own as written -- */

  const choice = $derived(timing ? choiceOf(timing.curve, tokens.easings) : "");
  const choices = $derived.by(() => {
    const out: { id: string; curve: Curve; word: string }[] =
      tokens.easings.map((one) => ({
        id: one.name,
        curve: { kind: "bezier", points: one.points },
        word: tokenWord(one.name),
      }));
    out.push({
      id: "spring",
      curve: { kind: "spring", bounce: 0.3, mass: 1, velocity: 0 },
      word: words.spring,
    });
    out.push({
      id: "custom",
      curve: { kind: "bezier", points: [0.6, 0, 0.3, 1] },
      word: words.custom,
    });
    if (original?.curve.kind === "css") {
      out.push({ id: "written", curve: original.curve, word: words.asWritten });
    }
    return out;
  });
  function choose(next: string): void {
    if (!timing || next === choice) {
      return;
    }
    const curve =
      next === "written" && original
        ? original.curve
        : curveFor(next, timing.curve, tokens.easings);
    change((was) => ({ ...was, curve }), true);
  }
  function choiceKey(event: KeyboardEvent, index: number): void {
    const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[
      event.key
    ];
    if (!step) {
      return;
    }
    event.preventDefault();
    const target = choices[(index + step + choices.length) % choices.length];
    if (target) {
      choose(target.id);
      const list = (event.currentTarget as HTMLElement).parentElement;
      list
        ?.querySelector<HTMLElement>(`[data-curve="${CSS.escape(target.id)}"]`)
        ?.focus();
    }
  }

  /* --- The curve drawn large: its plot, a bézier's two handles, a dot playing the clip -- */

  const ED = { x0: 10, x1: 110, y0: 58, y1: 14 };
  const edX = (x: number) => ED.x0 + x * (ED.x1 - ED.x0);
  const edY = (y: number) => ED.y0 + y * (ED.y1 - ED.y0);
  const plotted = $derived(
    timing
      ? curvePoints(timing.curve, 48, timing.duration)
          .map(
            ([x, y], k) =>
              `${k ? "L" : "M"}${edX(x).toFixed(2)} ${edY(y).toFixed(2)}`
          )
          .join(" ")
      : ""
  );
  const handles = $derived(
    timing?.curve.kind === "bezier" ? timing.curve.points : null
  );
  let editor = $state<SVGSVGElement>();
  function knobDown(event: PointerEvent, which: 1 | 2): void {
    if (!(editor && handles)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const target = event.currentTarget as SVGElement;
    target.setPointerCapture(event.pointerId);
    const box = editor.getBoundingClientRect();
    const sx = 120 / box.width;
    const sy = 72 / box.height;
    const moveTo = (one: PointerEvent) => {
      const ux = (one.clientX - box.left) * sx;
      const uy = (one.clientY - box.top) * sy;
      const x = Math.max(0, Math.min(1, (ux - ED.x0) / (ED.x1 - ED.x0)));
      const y = Math.max(-0.5, Math.min(1.5, (uy - ED.y0) / (ED.y1 - ED.y0)));
      change((was) => {
        const points = (
          was.curve.kind === "bezier"
            ? [...was.curve.points]
            : [0.23, 1, 0.32, 1]
        ) as Bezier;
        const k = which === 1 ? 0 : 2;
        points[k] = Math.round(x * 1000) / 1000;
        points[k + 1] = Math.round(y * 1000) / 1000;
        return { ...was, curve: { kind: "bezier", points } };
      }, false);
    };
    const done = () => {
      target.onpointermove = null;
      target.onpointerup = null;
      target.onpointercancel = null;
      graph.play();
    };
    target.onpointermove = moveTo;
    target.onpointerup = done;
    target.onpointercancel = done;
  }
  function knobKey(event: KeyboardEvent, which: 1 | 2): void {
    if (!handles) {
      return;
    }
    const step = event.shiftKey ? 0.01 : 0.05;
    const points = [...handles] as Bezier;
    const k = which === 1 ? 0 : 2;
    const dx = { ArrowLeft: -step, ArrowRight: step }[event.key] ?? 0;
    const dy = { ArrowDown: -step, ArrowUp: step }[event.key] ?? 0;
    if (!(dx || dy)) {
      return;
    }
    event.preventDefault();
    points[k] = Math.max(0, Math.min(1, (points[k] as number) + dx));
    points[k + 1] = Math.max(
      -0.5,
      Math.min(1.5, (points[k + 1] as number) + dy)
    );
    change((was) => ({ ...was, curve: { kind: "bezier", points } }), false);
  }

  /** The dot that plays the clip on its curve after each change: across in time, up with the value; with less motion it stands at the end. */
  let dot = $state<SVGCircleElement>();
  $effect(() => {
    const now = timing;
    const one = dot;
    if (!(now && one)) {
      return;
    }
    const points = curvePoints(now.curve, 24, now.duration);
    const end = points.at(-1) ?? [1, 1];
    const place = ([x, y]: [number, number]) =>
      `translate(${(edX(x) - edX(0)).toFixed(2)}px, ${(edY(y) - edY(0)).toFixed(2)}px)`;
    one.style.transform = place(end);
    for (const running of one.getAnimations()) {
      running.cancel();
    }
    if (!motionOk.current) {
      return;
    }
    const length =
      now.curve.kind === "spring"
        ? Math.max(
            now.duration,
            springPath(now.duration, now.curve.bounce, now.curve.velocity)
              .settle
          )
        : now.duration;
    one.animate(
      points.map((point, k) => ({
        transform: place(point),
        offset: k / (points.length - 1),
      })),
      { duration: Math.max(1, length), easing: "linear" }
    );
  });

  const rootKey = (event: KeyboardEvent) => {
    if (event.key === "Escape" && !event.defaultPrevented) {
      event.preventDefault();
      onclose();
    }
  };

  /** A figure's field: the input recipe (DESIGN.md, Inputs and fields), its unit after it inside the frame, the frame the control. */
  const FIELD =
    "flex h-c-input-h min-w-0 items-center gap-space-1 rounded-md border border-border-control bg-surface-raised px-space-2 shadow-xs transition-control focus-within:outline-(length:--focus-ring-width) focus-within:outline-focus-ring focus-within:outline-offset-(--focus-ring-inset)";
  const INPUT =
    "min-w-0 flex-1 bg-transparent font-mono text-body text-ink-strong tabular-nums outline-none";
</script>

{#if clip && timing && original && move}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <!-- biome-ignore lint/a11y/noNoninteractiveElementInteractions: Esc anywhere in the controls closes them; each control inside takes its own keys first. -->
  <section
    aria-label={words.controls(clip.element, clip.property)}
    class="grid min-w-0 gap-space-3 data-[placement=row]:col-span-full data-[placement=row]:pb-space-2"
    data-clip-controls={id}
    data-placement={placement}
    onkeydown={rootKey}
  >
    <header class="flex min-w-0 items-center gap-space-2">
      {#if placement === "inspector"}
        {#if narrow}
          <GlassGroup>
            <button
              aria-label={words.back}
              class={SYMBOL}
              onclick={onclose}
              title={words.back}
              type="button"><IconChevronLeft /></button
            >
          </GlassGroup>
        {/if}
        <div class="mark-line flex min-w-0 flex-1 items-center gap-space-2">
          <KindGlyph kind={clip.kind} />
          <p
            class="m-0 min-w-0 overflow-clip text-ellipsis whitespace-nowrap type-label text-ink-strong"
          >
            {clip.element}
            <code class="type-code text-ink-muted"
              >{propertyWords(clip.property)}</code
            >
          </p>
        </div>
      {:else}
        <span class="flex-1"></span>
      {/if}
      {#if edited}
        <button
          class={GHOST}
          data-reset-clip
          onclick={() => graph.resetClip(id)}
          type="button">{words.reset}</button
        >
      {/if}
      {#if !(placement === "inspector" && narrow)}
        <GlassGroup>
          <button
            aria-label={words.close}
            class={SYMBOL}
            data-close-controls
            onclick={onclose}
            title={words.closeTip}
            type="button"><IconClose /></button
          >
        </GlassGroup>
      {/if}
    </header>

    <!-- The length: a slider with a detent at each duration token, and a figure that takes any number. -->
    <div class="grid gap-space-1">
      <div class="flex items-center gap-space-2 type-meta text-ink-muted">
        <span>{spring ? words.response : words.duration}</span>
        {#if ownAdHoc.duration}
          <span
            class="rounded-xs border border-dashed border-border-control-strong px-space-1 type-meta text-ink-row"
            data-ad-hoc="duration"
            title={words.adHocTip(`${Math.round(timing.duration)} ms`)}
            >{words.adHoc}</span
          >
        {/if}
      </div>
      <div class="flex min-w-0 items-center gap-space-3">
        <div
          bind:this={slider}
          aria-label={spring ? words.response : words.duration}
          aria-valuemax={max}
          aria-valuemin={0}
          aria-valuenow={Math.round(timing.duration)}
          aria-valuetext={`${Math.round(timing.duration)} ms${onToken ? `, the ${tokenWord(onToken.name)} token` : ""}`}
          class="relative h-c-btn-h-sm min-w-0 flex-1 cursor-ew-resize touch-none rounded-pill {RING}"
          data-slider="duration"
          onkeydown={slideKey}
          onpointerdown={slideDown}
          role="slider"
          tabindex="0"
        >
          <span
            class="absolute inset-x-0 top-1/2 h-space-1 -translate-y-1/2 rounded-pill bg-surface-fill-strong"
          ></span>
          <span
            class="absolute start-0 top-1/2 h-space-1 w-(--at) -translate-y-1/2 rounded-pill bg-ink-strong"
            style:--at={at(timing.duration)}
          ></span>
          {#each tokens.durations as token (token.name)}
            <i
              class="absolute top-1/2 left-(--at) h-space-2 w-px -translate-y-1/2 bg-border-control-strong data-on:bg-ink-strong"
              data-on={onToken?.ms === token.ms || undefined}
              data-tick={token.name}
              style:--at={at(token.ms)}
            ></i>
          {/each}
          <span
            class="absolute top-1/2 left-(--at) size-icon-md -translate-x-1/2 -translate-y-1/2 rounded-pill border border-border-control bg-surface-lift shadow-knob"
            style:--at={at(timing.duration)}
          ></span>
        </div>
        <label class="{FIELD} w-c-number-field-w flex-none">
          <input
            aria-label={`${spring ? words.response : words.duration}, ms`}
            class={INPUT}
            data-field="duration"
            inputmode="decimal"
            onblur={(event) => commit("duration", event.currentTarget)}
            onkeydown={(event) => fieldKey("duration", event)}
            value={figures.duration}
          />
          <span class="type-meta text-ink-muted">ms</span>
        </label>
      </div>
    </div>

    <!-- The curve: a radio list in two columns, then the chosen one drawn large beside its words. -->
    <div class="grid gap-space-2">
      <span class="type-meta text-ink-muted" id={`curve-${id}`}
        >{words.curve}</span
      >
      <div
        aria-labelledby={`curve-${id}`}
        class="grid grid-cols-2 gap-space-1"
        role="radiogroup"
      >
        {#each choices as one, k (one.id)}
          <!-- biome-ignore lint/a11y/useSemanticElements: the ARIA radio group's pattern, each choice its curve drawn small beside its word, which a native radio cannot hold. -->
          <button
            aria-checked={choice === one.id}
            class="mark-line flex min-h-c-btn-h-sm min-w-0 items-center gap-space-2 rounded-sm border border-transparent px-space-2 text-start type-label text-ink-row touch-hit transition-[background-color,border-color,color] duration-(--dur-control) ease-out not-aria-checked:hover:bg-surface-hover aria-checked:border-brand-solid aria-checked:bg-selected-bg aria-checked:text-selected-ink {RING}"
            data-curve={one.id}
            onclick={() => choose(one.id)}
            onkeydown={(event) => choiceKey(event, k)}
            role="radio"
            tabindex={choice === one.id ? 0 : -1}
            type="button"
          >
            <CurveGlyph curve={one.curve} />
            <span class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap"
              >{one.word}</span
            >
          </button>
        {/each}
      </div>
      <div class="flex min-w-0 flex-wrap items-center gap-space-3">
        <svg
          bind:this={editor}
          aria-label={curveWord(timing, tokens.easings)}
          class="h-c-curve-editor-h w-c-curve-editor-w flex-none overflow-visible"
          role="img"
          viewBox="0 0 120 72"
        >
          <rect
            class="fill-surface-recess stroke-border-hairline"
            height={ED.y0 - ED.y1}
            rx="2"
            width={ED.x1 - ED.x0}
            x={ED.x0}
            y={ED.y1}
          ></rect>
          <path
            class="fill-none stroke-ink-strong"
            d={plotted}
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="1.5"
          ></path>
          {#if handles}
            {#each [1, 2] as const as which (which)}
              {@const hx = edX(handles[which === 1 ? 0 : 2])}
              {@const hy = edY(handles[which === 1 ? 1 : 3])}
              <line
                class="stroke-border-control-strong"
                x1={edX(which === 1 ? 0 : 1)}
                x2={hx}
                y1={edY(which === 1 ? 0 : 1)}
                y2={hy}
              ></line>
              <circle
                aria-label={which === 1
                  ? words.firstHandle
                  : words.secondHandle}
                class="cursor-grab fill-surface-lift stroke-ink-strong focus-visible:outline-(length:--focus-ring-width) focus-visible:outline-focus-ring"
                cx={hx}
                cy={hy}
                data-handle={which}
                onkeydown={(event) => knobKey(event, which)}
                onpointerdown={(event) => knobDown(event, which)}
                r="4"
                role="slider"
                aria-valuenow={handles[which === 1 ? 1 : 3]}
                tabindex="0"
              ></circle>
            {/each}
          {/if}
          <circle
            bind:this={dot}
            class="fill-ink-strong"
            cx={edX(0)}
            cy={edY(0)}
            r="3"
          ></circle>
        </svg>
        <div class="grid min-w-0 flex-1 gap-space-1">
          <span
            class="flex items-center gap-space-2 type-label text-ink-strong"
          >
            {curveWord(timing, tokens.easings)}
            {#if ownAdHoc.curve}
              <span
                class="rounded-xs border border-dashed border-border-control-strong px-space-1 type-meta text-ink-row"
                data-ad-hoc="curve"
                title={words.adHocTip(words.curve.toLowerCase())}
                >{words.adHoc}</span
              >
            {/if}
          </span>
          {#if timing.curve.kind === "bezier" && !easingTokenOf(timing.curve, tokens.easings)}
            <label class="{FIELD} w-full">
              <input
                aria-label={words.customCurve}
                class={INPUT}
                data-field="bezier"
                onblur={(event) => commit("bezier", event.currentTarget)}
                onkeydown={(event) => fieldKey("bezier", event)}
                value={figures.bezier}
              />
            </label>
          {:else if timing.curve.kind === "bezier"}
            <span class="type-meta text-ink-muted text-pretty"
              >{words.dragHandle}</span
            >
          {:else if timing.curve.kind === "css"}
            <code class="type-code text-ink-muted wrap-anywhere"
              >{timing.curve.value}</code
            >
          {/if}
        </div>
      </div>
    </div>

    {#if spring}
      <!-- A spring's every parameter, each a figure that takes any value: the bounce as a slider too. -->
      <div class="grid gap-space-2" data-spring>
        <div class="grid gap-space-1">
          <span class="type-meta text-ink-muted">{words.bounce}</span>
          <div class="flex min-w-0 items-center gap-space-3">
            <input
              aria-label={words.bounce}
              class="min-w-0 flex-1 accent-ink-strong"
              max="1"
              min="0"
              oninput={(event) => {
                const bounce = Number(event.currentTarget.value);
                change(
                  (was) =>
                    was.curve.kind === "spring"
                      ? { ...was, curve: { ...was.curve, bounce } }
                      : was,
                  false
                );
              }}
              onchange={() => graph.play()}
              step="0.01"
              type="range"
              value={Math.min(1, Math.max(0, spring.bounce))}
            />
            <label class="{FIELD} w-c-number-field-w flex-none">
              <input
                aria-label={words.bounce}
                class={INPUT}
                data-field="bounce"
                inputmode="decimal"
                onblur={(event) => commit("bounce", event.currentTarget)}
                onkeydown={(event) => fieldKey("bounce", event)}
                value={figures.bounce}
              />
            </label>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-space-2">
          {#each [["mass", words.mass, ""], ["stiffness", words.stiffness, ""], ["damping", words.damping, ""], ["velocity", words.velocity, "/s"]] as const as [field, word, unit] (field)}
            <label class="grid min-w-0 gap-space-1">
              <span class="type-meta text-ink-muted">{word}</span>
              <span class={FIELD}>
                <input
                  aria-label={word}
                  class={INPUT}
                  data-field={field}
                  inputmode="decimal"
                  onblur={(event) => commit(field, event.currentTarget)}
                  onkeydown={(event) => fieldKey(field, event)}
                  value={figures[field]}
                />
                {#if unit}<span class="type-meta text-ink-muted">{unit}</span
                  >{/if}
              </span>
            </label>
          {/each}
        </div>
      </div>
    {/if}
  </section>
{/if}
