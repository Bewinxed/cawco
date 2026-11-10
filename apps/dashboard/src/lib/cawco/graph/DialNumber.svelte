<script lang="ts">
  import { untrack } from "svelte";
  /**
   * A number control (core stage.ts `CanvasDial`, kind `number`): one field
   * a control high, as every other control is, its fill running from its
   * leading edge to where the value stands in its range and its figure and
   * unit at its trailing end (the owner's pick, graph-dials-questions
   * `number-form`: a field with a fill, as Dessn's fields and the house
   * Effort chip draw theirs). A drag across it sets the value where the
   * pointer stands; a press without a drag takes the caret to type a figure
   * (Enter or leaving it keeps it, Escape puts the figure back). bits-ui has
   * no number field: the drag is the field's own, on the platform's text
   * input, a spinbutton to a reader.
   *
   * Up and Down a step, Shift or Page Up and Page Down ten, Home and End
   * the range's ends. A figure typed past an end is kept as typed (the fill
   * stands at that end). The figure keeps its own ink whatever its value:
   * a changed value is marked by its row's undo glyph, the agent's value
   * written under it (Dials).
   */
  import type { PointerEventHandler } from "svelte/elements";
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
    lang,
    label,
    dragging = $bindable(false),
    typing = $bindable(null),
    onchange,
  }: {
    dial: GraphDial;
    value: number;
    range: DialRange;
    lang: string | undefined;
    /** Its name, said to a reader. */
    label: string;
    /** A drag across it is under way. */
    dragging?: boolean;
    /** The figure while he types it; null while he doesn't. */
    typing?: string | null;
    onchange: (next: number) => void;
  } = $props();

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

  // --- The drag ----------------------------------------------------------

  /** Where a press on the field began, while it may become a drag. */
  let pressAt: { x: number; id: number } | null = null;
  /** A drag just ended: the click it ends in is the drag's, never a press on the field. */
  let dragged = false;
  /** A pointer that moves this far from its press is a drag, not a press to type. */
  const DRAG_FROM = 3;
  /** The value where the pointer stands across the field. */
  const valueAt = (x: number, frame: HTMLElement): number => {
    const box = frame.getBoundingClientRect();
    const at = Math.min(
      1,
      Math.max(0, (x - box.left) / Math.max(1, box.width))
    );
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
    pressAt = { x: event.clientX, id: event.pointerId };
  };
  const move: PointerEventHandler<HTMLElement> = (event) => {
    const frame = event.currentTarget;
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
    dragged = !pressed;
    pressAt = null;
    dragging = false;
    if (pressed) {
      // A press without a drag: the caret, the figure selected to type over
      // once the press's own click has landed (its caret would undo the
      // selection).
      field?.focus();
      requestAnimationFrame(() => field?.select());
    }
  };
</script>

<!-- The field: its fill to the value, its figure and unit at its end. A
     press anywhere on it is the field's own (`down`, `up`), so the figure
     takes the caret only from a press without a drag. -->
<!-- `data-vaul-no-drag`: in the phone's drawer a drag across the field is the
     field's, never the drawer's. -->
<InputGroup.Root
  data-dial-field
  data-vaul-no-drag
  onclickcapture={(event: MouseEvent) => {
    // The frame's own click (InputGroup's, which focuses its field) is no
    // press after a drag: the caret would stand where the drag let go.
    if (dragged) {
      dragged = false;
      event.stopImmediatePropagation();
    }
  }}
  data-dragging={dragging || undefined}
  onmousedown={hold}
  onpointercancel={up}
  onpointerdown={down}
  onpointermove={move}
  onpointerup={up}
  {share}
>
  <InputGroup.Input
    aria-label={label}
    aria-valuemax={range.max}
    aria-valuemin={range.min}
    aria-valuenow={value}
    aria-valuetext="{figureOf(value, lang)}{dial.unit ?? ''}"
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
    oninput={(event) => {
      typing = event.currentTarget.value;
    }}
    onkeydown={stepKey}
    role="spinbutton"
    spellcheck={false}
    value={shown}
    {@attach (node: HTMLInputElement) => {
      // Words held in it as it mounts (a states file's typing) hold the caret, as typing does.
      if (untrack(() => typing) !== null) {
        node.focus();
      }
    }}
  />
  {#if dial.unit}
    <InputGroup.Addon align="inline-end" look="unit">
      {dial.unit}
    </InputGroup.Addon>
  {/if}
</InputGroup.Root>
