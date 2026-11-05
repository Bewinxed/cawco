/**
 * The agent's dials (core stage.ts `CanvasDial`), as the design graph's
 * Dials face reads and writes them: each dial's value as written (read off
 * the drawing: its variable's computed value, or its arg as the story sets
 * it), his value where he turned it, the range a number moves in, and the
 * record `artifact_read` answers under `dials` (by name).
 */
import type { CanvasDial } from "@cawco/core/stage";

/**
 * A dial as the Dials face draws it: the agent's `CanvasDial` (a number, a
 * colour, a select, a toggle, a line of words, an action), under the
 * heading it names (`group`).
 */
export type GraphDial = CanvasDial;

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
 * range up to 1, a tenth up to 10, a unit up to 100, else ten, so a dial
 * an agent wrote for a panel library moves as it did there.
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

/** `value` held inside `range`: where a step or a drag stops (a typed figure is kept as typed). */
export const clampTo = (value: number, range: DialRange): number =>
  Math.min(range.max, Math.max(range.min, value));

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
 * form: painted on a one-pixel canvas and its pixel read back, so any colour
 * the browser reads (an oklch(), a color(display-p3 …), a token's resolved
 * value) converts, mapped into sRGB as the browser paints it; a colour it
 * can't read is black.
 */
const HEX6 = /^#[0-9a-f]{6}$/iu;

export function hexOf(colour: string): string {
  if (HEX6.test(colour)) {
    return colour.toLowerCase();
  }
  if (typeof document === "undefined" || !isColour(colour)) {
    return "#000000";
  }
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const paint = canvas.getContext("2d", { willReadFrequently: true });
  if (!paint) {
    return "#000000";
  }
  paint.fillStyle = colour;
  paint.fillRect(0, 0, 1, 1);
  const [r = 0, g = 0, b = 0] = paint.getImageData(0, 0, 1, 1).data;
  return `#${[r, g, b].map((one) => one.toString(16).padStart(2, "0")).join("")}`;
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

/** A select's option as a page's config writes it: its words, or a value with its own label. */
type ConfigOption = string | { label?: string; value: string };

/** A decision page's panel read: its dials, each by its path, and each one's value as written. */
export interface ConfigDials {
  dials: GraphDial[];
  written: DialValues;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** A key in words, camelCase broken: `shadowBlur` → "Shadow blur". */
const CASE_BREAK = /([a-z0-9])([A-Z])/gu;
const labelOf = (key: string): string => {
  const spaced = key.replace(CASE_BREAK, "$1 $2").toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
};

/** One control of a page's config read as a dial or two (a pad's X and Y), at `path`, under `group`. */
function configDial(
  path: string,
  key: string,
  value: unknown,
  group: string | undefined,
  out: ConfigDials
): void {
  const base = {
    name: path,
    label: labelOf(key),
    target: { arg: path },
    ...(group ? { group } : {}),
  };
  const add = (dial: GraphDial, written: DialValue) => {
    out.dials.push(dial);
    out.written[dial.name] = written;
  };
  if (Array.isArray(value) && typeof value[0] === "number") {
    const [start, min, max, step] = value as number[];
    add(
      { ...base, kind: "number", min, max, ...(step ? { step } : {}) },
      start ?? 0
    );
  } else if (typeof value === "number") {
    add({ ...base, kind: "number" }, value);
  } else if (typeof value === "boolean") {
    add({ ...base, kind: "toggle" }, value);
  } else if (typeof value === "string") {
    add({ ...base, kind: isColour(value) ? "color" : "text" }, value);
  } else if (isObject(value) && typeof value.type === "string") {
    typedDial(base, key, value, out, add);
  } else if (isObject(value)) {
    // A folder: its controls under its name as a heading.
    for (const [child, inner] of Object.entries(value)) {
      if (child !== "_collapsed") {
        configDial(`${path}.${child}`, child, inner, labelOf(key), out);
      }
    }
  }
}

/** A pad's two number dials, X and Y, under its one name: each `[default, min, max, step?]` as a number dial's. */
function padDials(
  base: Omit<GraphDial, "kind">,
  key: string,
  value: Record<string, unknown>,
  out: ConfigDials
): void {
  for (const axis of ["x", "y"] as const) {
    const said = value[axis];
    const [start = 0, min = 0, max = 1, step] = Array.isArray(said)
      ? (said as number[])
      : [];
    configDial(
      `${base.name}.${axis}`,
      axis,
      [start, min, max, ...(step ? [step] : [])],
      labelOf(key),
      out
    );
  }
}

/** A select's options as a page's config writes them: each its words, or a value with its own label. */
const optionsOf = (value: unknown): string[] =>
  Array.isArray(value)
    ? (value as ConfigOption[]).map((one) =>
        typeof one === "string" ? one : one.value
      )
    : [];

/** A control a page's config writes with its `type`: a select, a colour, words, an action, or a pad (two number dials, X and Y, under its one name). */
function typedDial(
  base: Omit<GraphDial, "kind">,
  key: string,
  value: Record<string, unknown>,
  out: ConfigDials,
  add: (dial: GraphDial, written: DialValue) => void
): void {
  const said = (fallback: string) => String(value.default ?? fallback);
  if (value.type === "select") {
    const options = optionsOf(value.options);
    add({ ...base, kind: "select", options }, said(options[0] ?? ""));
  } else if (value.type === "color") {
    add({ ...base, kind: "color" }, said("#000000"));
  } else if (value.type === "text") {
    add({ ...base, kind: "text" }, said(""));
  } else if (value.type === "action") {
    add(
      { ...base, kind: "action", label: String(value.label ?? base.label) },
      0
    );
  } else if (value.type === "pad") {
    padDials(base, key, value, out);
  }
}

/**
 * A decision page's panel (its program's `Dials` piece, or an HTML page's
 * `cawcoDials(name, config)`), in the config shape agents write: a number as
 * `[default, min, max, step?]` or bare, a colour as a CSS colour, a
 * boolean, a string, `{ type: "select" | "color" | "text" | "action" |
 * "pad", … }`, a nested object as a folder (its controls under its name),
 * each dial by its path (`shadow.blur`).
 */
export function dialsOfConfig(config: Record<string, unknown>): ConfigDials {
  const out: ConfigDials = { dials: [], written: {} };
  for (const [key, value] of Object.entries(config)) {
    configDial(key, key, value, undefined, out);
  }
  return out;
}
