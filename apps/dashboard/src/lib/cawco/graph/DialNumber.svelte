<script lang="ts">
  /**
   * A number dial (core stage.ts `CanvasDial`, kind `number`): its figure
   * with its unit, in one of two forms the owner picks between (tsk-193,
   * tsk-198):
   *
   * - **field**: one field a control high, as every other dial is (the
   *   settings pattern: every control one field high). Its fill runs from
   *   its leading edge to where the value stands in its range, the figure
   *   and its unit at its trailing end inside it (DialKit's slider, Dessn's
   *   field, the house Effort chip's fill). A drag across it sets the
   *   value where the pointer stands; a press without a drag takes the
   *   caret to type a figure (Enter or leaving it keeps it, Escape puts the
   *   figure back). bits-ui has no number field: the drag is the field's
   *   own, on the platform's text input, a spinbutton to a reader.
   * - **pill**: the house Effort chip's track, his pick for the step
   *   slider (design-graph-spec, "Pill": the knob shows the value, like the
   *   effort control): a fill from the leading edge whose end is a knob
   *   carrying the figure and its unit; a drag across the track moves the
   *   knob, a press without a drag types into it.
   * - **slider**: bits-ui's Slider (as the Curve chip's Bounce), its figure
   *   in a number field beside it, typed the same way.
   *
   * Both: Up and Down a step, Shift or Page Up and Page Down ten, Home and
   * End the range's ends. A figure typed past an end is kept as typed (the
   * fill stands at that end). Changed from as written, the figure takes
   * the edit's ink (the input's `edited` tone), as a changed timing does.
   */
  import { Slider } from "bits-ui";
  import { frameSize } from "#lib/cawco/frame-observer.js";
  import * as InputGroup from "#lib/components/ui/input-group/index.js";
  import {
    clampTo,
    type DialRange,
    type GraphDial,
    shareOf,
    snapTo,
  } from "./dials";
  import { figureOf } from "./figures";

  let {
    dial,
    value,
    range,
    changed,
    form,
    lang,
    label,
    onchange,
  }: {
    dial: GraphDial;
    value: number;
    range: DialRange;
    /** Changed from as written: the figure in the edit's ink. */
    changed: boolean;
    form: "pill" | "field" | "slider";
    lang: string | undefined;
    /** Its name, said to a reader. */
    label: string;
    onchange: (next: number) => void;
  } = $props();

  /** The figure while he types it; null while he doesn't. */
  let typing = $state<string | null>(null);
  let field = $state<HTMLInputElement | null>(null);
  /** The field holds the caret: a press in it places the caret, and a drag selects, as in any field. */
  let focused = $state(false);
  const shown = $derived(typing ?? figureOf(value, lang));
  const share = $derived(shareOf(value, range));
  /** A typed figure, in the page's language or with a point: its number; null when it is none. */
  const parsed = (text: string): number | null => {
    const said = text.replace(/\s/gu, "").replace(",", ".");
    const next = Number(said);
    return said !== "" && Number.isFinite(next) ? next : null;
  };
  const keep = () => {
    const next = typing === null ? null : parsed(typing);
    typing = null;
    if (next !== null && next !== value) {
      onchange(next);
    }
  };
  /** Steps by the keys: a step, ten with Shift or Page keys, the ends with Home and End. */
  const stepKey = (event: KeyboardEvent) => {
    const by =
      event.shiftKey || event.key.startsWith("Page")
        ? range.step * 10
        : range.step;
    const to: Record<string, number> = {
      ArrowUp: value + by,
      ArrowDown: value - by,
      PageUp: value + by,
      PageDown: value - by,
      Home: range.min,
      End: range.max,
    };
    if (event.key === "Enter") {
      keep();
      field?.select();
      return;
    }
    if (event.key === "Escape" && typing !== null) {
      // The figure back as it was; Escape goes no further (the room stays).
      event.preventDefault();
      event.stopPropagation();
      typing = null;
      field?.blur();
      return;
    }
    if (event.key in to) {
      event.preventDefault();
      typing = null;
      // A step stops at the range's ends; a figure typed past one is kept until stepped.
      onchange(clampTo(snapTo(to[event.key] ?? value, range), range));
    }
  };

  // --- The field's drag --------------------------------------------------

  /** Where a press on the field began, while it may become a drag. */
  let pressAt: { x: number; id: number } | null = null;
  let dragging = $state(false);
  /** A pointer that moves this far from its press is a drag, not a press to type. */
  const DRAG_FROM = 3;
  /**
   * The pill's knob as drawn, with the fill's padding round it, px: the fill
   * runs to its end, so the fill's width and the drag both read it (a long
   * figure widens the knob, and the fill never starts under it). 0 until it
   * is measured, and for the field.
   */
  let knob = $state(0);
  /** The value where the pointer stands: on the pill, where the knob's middle would stand. */
  const valueAt = (x: number, frame: HTMLElement): number => {
    const box = frame.getBoundingClientRect();
    const held = form === "pill" ? knob : 0;
    const span = Math.max(1, box.width - held);
    const at = Math.min(1, Math.max(0, (x - box.left - held / 2) / span));
    return clampTo(
      snapTo(range.min + at * (range.max - range.min), range),
      range
    );
  };
  const down = (event: PointerEvent) => {
    if (focused || event.button !== 0) {
      return;
    }
    // The press is the field's until it is known to be a drag or a press.
    event.preventDefault();
    pressing = true;
    pressAt = { x: event.clientX, id: event.pointerId };
  };
  const move = (event: PointerEvent) => {
    const frame = event.currentTarget as HTMLElement;
    if (!pressAt || pressAt.id !== event.pointerId) {
      return;
    }
    if (!dragging && Math.abs(event.clientX - pressAt.x) < DRAG_FROM) {
      return;
    }
    if (!dragging) {
      dragging = true;
      frame.setPointerCapture(event.pointerId);
    }
    const next = valueAt(event.clientX, frame);
    if (next !== value) {
      onchange(next);
    }
  };
  /** Until it holds the caret, a press on the figure is the field's (a drag or a press), never the caret's. */
  const hold = (event: MouseEvent) => {
    if (!focused) {
      event.preventDefault();
    }
  };
  const up = (event: PointerEvent) => {
    if (!pressAt || pressAt.id !== event.pointerId) {
      return;
    }
    const pressed = !dragging;
    pressAt = null;
    dragging = false;
    if (pressed) {
      // A press without a drag: the caret, the figure selected to type over.
      field?.focus();
      field?.select();
    }
    pressing = false;
  };
  /** The pill's figure took the focus from the keyboard (no press before it): the track wears the focus ring until it goes. */
  let keyed = $state(false);
  /** A press is under way on the pill: the focus it gives is a pointer's. */
  let pressing = false;
  /** The figure's field, typed in place in every form: a press selects it, Enter or leaving keeps it, Escape puts it back. */
  const typed = $derived({
    autocomplete: "off" as const,
    inputmode: "decimal" as const,
    spellcheck: false,
    value: shown,
    onblur: () => {
      focused = false;
      keyed = false;
      keep();
    },
    onfocus: () => {
      focused = true;
      keyed = !pressing;
      pressing = false;
    },
    oninput: (event: Event) => {
      typing = (event.currentTarget as HTMLInputElement).value;
    },
    onkeydown: stepKey,
  });
  /** The track's own drag, on the field's or the pill's frame. */
  const drag = {
    onmousedown: hold,
    onpointercancel: up,
    onpointerdown: down,
    onpointermove: move,
    onpointerup: up,
  };
</script>

{#snippet figureField(spin: boolean)}
  <InputGroup.Input
    aria-label={label}
    aria-valuemax={spin ? range.max : undefined}
    aria-valuemin={spin ? range.min : undefined}
    aria-valuenow={spin ? value : undefined}
    aria-valuetext={drag
      ? `${figureOf(value, lang)}${dial.unit ?? ""}`
      : undefined}
    bind:ref={field}
    field="figure"
    {...typed}
    role={spin ? "spinbutton" : undefined}
    tone={changed ? "edited" : undefined}
  />
  <InputGroup.Addon align="inline-end" look="unit">
    {dial.unit ?? ""}
  </InputGroup.Addon>
{/snippet}

{#if form === "pill"}
  <!-- The track (the Effort chip's): its fill runs to the knob, the knob
       carries the figure; the figure is typed in the knob. -->
  <!-- Focus come by the keyboard rings the whole track (The One Ring Rule);
       a press that puts the caret in the knob shows the caret alone. -->
  <div
    class="relative h-c-input-h min-w-0 cursor-ew-resize touch-none rounded-md border border-border-control bg-surface-raised select-none data-keyed:outline-(length:--focus-ring-width) data-keyed:outline-solid data-keyed:outline-focus-ring data-keyed:outline-offset-2"
    data-dial-field
    data-dragging={dragging || undefined}
    data-keyed={keyed || undefined}
    {...drag}
  >
    <div class="pointer-events-none absolute inset-0 overflow-clip rounded-md">
      <div
        class="absolute inset-y-0 start-0 flex w-(--fill) items-center justify-end rounded-md bg-surface-recess-deep p-space-row"
        style:--fill={knob > 0
          ? `calc(${knob}px + ${share} * (100% - ${knob}px))`
          : `calc(var(--c-number-field-w) + ${share} * (100% - var(--c-number-field-w)))`}
      >
        <span
          {@attach frameSize((node: HTMLElement) => {
            const pad = node.parentElement
              ? Number.parseFloat(
                  getComputedStyle(node.parentElement).paddingInlineStart
                )
              : 0;
            knob = node.offsetWidth + 2 * pad;
          })}
          class="flex h-full min-w-c-number-field-w flex-none items-center justify-center gap-space-1 rounded-sm bg-surface-lift px-space-2 shadow-knob"
        >
          <input
            aria-label={label}
            aria-valuemax={range.max}
            aria-valuemin={range.min}
            aria-valuenow={value}
            aria-valuetext="{figureOf(value, lang)}{dial.unit ?? ''}"
            bind:this={field}
            class={[
              "min-w-space-4 bg-transparent text-center type-body num outline-none",
              changed ? "text-selected-ink" : "text-ink-strong",
            ]}
            role="spinbutton"
            size={Math.max(2, shown.length)}
            {...typed}
          />
          {#if dial.unit}
            <span class="type-body text-ink-muted">{dial.unit}</span>
          {/if}
        </span>
      </div>
    </div>
  </div>
{:else if form === "field"}
  <!-- The field: its fill to the value, its figure and unit at its end. A
       press anywhere on it is the field's own (`down`, `up`), so the
       figure takes the caret only from a press without a drag. -->
  <InputGroup.Root
    data-dial-field
    data-dragging={dragging || undefined}
    onclick={() => {
      // A press focuses the field itself (`up`); a drag's click focuses nothing.
    }}
    {...drag}
    {share}
  >
    {@render figureField(true)}
  </InputGroup.Root>
{:else}
  <!-- The slider, its figure in a number field beside it. -->
  <div class="flex min-w-0 items-center gap-space-3">
    <Slider.Root
      class="relative flex h-c-btn-h min-w-0 flex-1 touch-none items-center select-none"
      max={range.max}
      min={range.min}
      onValueChange={(next: number) => {
        if (next !== value) {
          onchange(next);
        }
      }}
      step={range.step}
      type="single"
      value={Math.min(range.max, Math.max(range.min, value))}
    >
      <span
        class="relative h-space-1 w-full overflow-clip rounded-pill bg-surface-fill"
      >
        <Slider.Range class="absolute h-full rounded-pill bg-ink-muted" />
      </span>
      <Slider.Thumb
        aria-label={label}
        aria-valuetext="{figureOf(value, lang)}{dial.unit ?? ''}"
        class="pointer-hit touch-hit block size-space-4 cursor-ew-resize rounded-pill border border-border-control bg-surface-raised shadow-xs focus-visible:outline-(length:--focus-ring-width) focus-visible:outline-solid focus-visible:outline-focus-ring focus-visible:outline-offset-2"
        index={0}
      />
    </Slider.Root>
    <div class="w-c-number-field-w flex-none">
      <InputGroup.Root>
        {@render figureField(false)}
      </InputGroup.Root>
    </div>
  </div>
{/if}
