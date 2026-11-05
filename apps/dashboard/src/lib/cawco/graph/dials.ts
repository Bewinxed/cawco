/**
 * The agent's dials (core stage.ts `CanvasDial`), as the design graph's
 * Dials face reads and writes them: each dial's value as written (read off
 * the drawing: its variable's computed value, or its arg as the story sets
 * it), his value where he turned it, the range a number moves in, and the
 * record `artifact_read` answers under `dials` (by name).
 */
import type { CanvasDial } from "@cawco/core/stage";

/**
 * A dial as the Dials face draws it: the agent's `CanvasDial`, and the two
 * kinds and the heading DialKit's panel had that `CanvasDial` doesn't yet
 * carry (slice 4 adds them to core stage.ts): `text`, a line of words set
 * on its arg; `action`, a button whose press sets its arg to the count of
 * presses so far (a story replays on it); `group`, the heading it stands
 * under (DialKit's folders).
 */
export type GraphDial = Omit<CanvasDial, "kind"> & {
  kind: CanvasDial["kind"] | "text" | "action";
  group?: string;
};

/** A dial's value: a number dial's figure, a colour or a select's option, a toggle's state. */
export type DialValue = number | string | boolean;

/** The values set on the drawing, by dial name. */
export type DialValues = Record<string, DialValue>;

/** A number dial's range: where its fill and slider run, and the step its keys and drag move by. */
export interface DialRange {
  max: number;
  min: number;
  step: number;
}

/**
 * The step a range moves by when the agent names none: a hundredth of a
 * range up to 1, a tenth up to 10, a unit up to 100, else ten (DialKit's
 * `inferStep`, so a dial an agent wrote for it moves as it did).
 */
const stepFor = (span: number): number => {
  if (span <= 1) {
    return 0.01;
  }
  if (span <= 10) {
    return 0.1;
  }
  return span <= 100 ? 1 : 10;
};

/**
 * A number dial's range: the agent's `min`, `max` and `step`, else 0 to
 * three times its written value (1 for a written 0) on a step from the
 * span. A figure typed past either end is kept as typed: the fill and the
 * slider stand at that end, and nothing is clamped on a reload.
 */
export function rangeOf(dial: GraphDial, written: number): DialRange {
  const min = dial.min ?? Math.min(0, written);
  const max = dial.max ?? Math.max(min + 1, written > 0 ? written * 3 : 1);
  return { min, max, step: dial.step ?? stepFor(max - min) };
}

/** `value` on `range`'s step, from its min, without the step's float dust. */
export function snapTo(value: number, range: DialRange): number {
  const steps = Math.round((value - range.min) / range.step);
  const places = Math.max(0, -Math.floor(Math.log10(range.step)));
  return Number((range.min + steps * range.step).toFixed(Math.min(places, 6)));
}

/** Where `value` stands along `range`, 0 to 1, held at the ends. */
export const shareOf = (value: number, range: DialRange): number =>
  range.max === range.min
    ? 0
    : Math.min(1, Math.max(0, (value - range.min) / (range.max - range.min)));

/**
 * A number read off a variable's computed value ("12px", "0.5", "1.25rem"
 * stays unread): its figure when it is a plain number or one in the dial's
 * own unit.
 */
export function figureFrom(
  raw: string,
  unit: string | undefined
): number | null {
  const text = raw.trim();
  const said = unit && text.endsWith(unit) ? text.slice(0, -unit.length) : text;
  const value = Number(said);
  return said !== "" && Number.isFinite(value) ? value : null;
}

/** A dial's value as its target takes it: a number with its unit, any other as it is. */
export const cssValueOf = (dial: GraphDial, value: DialValue): string =>
  typeof value === "number" ? `${value}${dial.unit ?? ""}` : String(value);

/** Whether `typed` is a colour the browser reads (any CSS colour: hex, rgb(), hsl(), oklch(), color(display-p3 …)). */
export const isColour = (typed: string): boolean =>
  typeof CSS !== "undefined" && CSS.supports("color", typed.trim());

/**
 * A colour as `#rrggbb` for the platform's picker, which takes no other
 * form: read through a canvas, so any colour the browser reads converts;
 * a colour it can't is black.
 */
const HEX6 = /^#[0-9a-f]{6}$/iu;

export function hexOf(colour: string): string {
  if (HEX6.test(colour)) {
    return colour.toLowerCase();
  }
  if (typeof document === "undefined") {
    return "#000000";
  }
  const paint = document.createElement("canvas").getContext("2d");
  if (!paint) {
    return "#000000";
  }
  paint.fillStyle = "#000000";
  paint.fillStyle = colour;
  const said = String(paint.fillStyle);
  return said.startsWith("#") ? said : "#000000";
}

/** The dials he changed from as written, by name. */
export const changedOf = (
  dials: readonly GraphDial[],
  written: DialValues,
  values: DialValues
): string[] =>
  dials
    .filter(
      (dial) => dial.name in values && values[dial.name] !== written[dial.name]
    )
    .map((dial) => dial.name);

/** The values as set on the drawing, his over the agent's, by name: what Copy writes and `artifact_read` answers. */
export const valuesAsSet = (
  dials: readonly GraphDial[],
  written: DialValues,
  values: DialValues
): DialValues =>
  Object.fromEntries(
    dials.flatMap((dial) => {
      const value = values[dial.name] ?? written[dial.name];
      return value === undefined ? [] : [[dial.name, value]];
    })
  );
