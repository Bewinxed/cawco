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
   * - **slider**: bits-ui's Slider (as the Curve chip's Bounce), its figure
   *   in a number field beside it, typed the same way.
   *
   * Both: Up and Down a step, Shift or Page Up and Page Down ten, Home and
   * End the range's ends. A figure typed past an end is kept as typed (the
   * fill stands at that end). Changed from as written, the figure takes
   * the edit's ink (the input's `edited` tone), as a changed timing does.
   */
  import { Slider } from "bits-ui";
  import * as InputGroup from "#lib/components/ui/input-group/index.js";
  import { type DialRange, type GraphDial, shareOf, snapTo } from "./dials";
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
    form: "field" | "slider";
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
  const parsed = (typed: string): number | null => {
    const said = typed.replace(/\s/gu, "").replace(",", ".");
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
      onchange(snapTo(to[event.key] ?? value, range));
    }
  };

  // --- The field's drag --------------------------------------------------

  /** Where a press on the field began, while it may become a drag. */
  let pressAt: { x: number; id: number } | null = null;
  let dragging = $state(false);
  /** A pointer that moves this far from its press is a drag, not a press to type. */
  const DRAG_FROM = 3;
  const valueAt = (x: number, frame: HTMLElement): number => {
    const box = frame.getBoundingClientRect();
    const at = Math.min(1, Math.max(0, (x - box.left) / box.width));
    return snapTo(range.min + at * (range.max - range.min), range);
  };
  const down = (event: PointerEvent) => {
    if (focused || event.button !== 0) {
      return;
    }
    // The press is the field's until it is known to be a drag or a press.
    event.preventDefault();
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
  };
</script>

{#snippet figureField(drag: boolean)}
  <InputGroup.Input
    aria-label={label}
    aria-valuemax={drag ? range.max : undefined}
    aria-valuemin={drag ? range.min : undefined}
    aria-valuenow={drag ? value : undefined}
    aria-valuetext={drag
      ? `${figureOf(value, lang)}${dial.unit ?? ""}`
      : undefined}
    autocomplete="off"
    bind:ref={field}
    field="figure"
    inputmode="decimal"
    onblur={() => {
      focused = false;
      keep();
    }}
    onfocus={() => {
      focused = true;
    }}
    oninput={(event: Event) => {
      typing = (event.currentTarget as HTMLInputElement).value;
    }}
    onkeydown={stepKey}
    role={drag ? "spinbutton" : undefined}
    spellcheck={false}
    text="label"
    tone={changed ? "edited" : undefined}
    value={shown}
  />
  <InputGroup.Addon align="inline-end" look="unit">
    {dial.unit ?? ""}
  </InputGroup.Addon>
{/snippet}

{#if form === "field"}
  <!-- The field: its fill to the value, its figure and unit at its end. A
       press anywhere on it is the field's own (`down`, `up`), so the
       figure takes the caret only from a press without a drag. -->
  <InputGroup.Root
    data-dial-field
    data-dragging={dragging || undefined}
    onclick={() => {
      // A press focuses the field itself (`up`); a drag's click focuses nothing.
    }}
    onmousedown={(event: MouseEvent) => {
      // Until it holds the caret, a press on the figure is the field's (a drag or a press), never the caret's.
      if (!focused) {
        event.preventDefault();
      }
    }}
    onpointercancel={up}
    onpointerdown={down}
    onpointermove={move}
    onpointerup={up}
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
