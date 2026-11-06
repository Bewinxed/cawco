/**
 * The agent's dials (core stage.ts `CanvasDial`), as the design graph's
 * Dials face reads and writes them: each dial's value as written (read off
 * the drawing: its variable's computed value, or its arg as the story sets
 * it), his value where he turned it, the range a number moves in, and the
 * record `artifact_read` answers under `dials` (by name).
 */
import {
  type ConfigDials,
  dialsOfConfig as readConfig,
} from "@cawco/core/dial-config";
import type { CanvasDial } from "@cawco/core/stage";
import Color from "colorjs.io";

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
 * A colour as the picker takes it (`rgba()`, 0 to 255 and an alpha): any
 * colour the browser reads (an oklch(), a color(display-p3 …), a token's
 * resolved value) mapped into sRGB by colorjs.io; a colour it can't read is
 * opaque black.
 */
export function rgbaOf(colour: string): string {
  try {
    const srgb = new Color(colour.trim()).to("srgb").toGamut();
    const [r = 0, g = 0, b = 0] = srgb.coords.map((one) =>
      Math.round((one ?? 0) * 255)
    );
    return `rgba(${r}, ${g}, ${b}, ${srgb.alpha ?? 1})`;
  } catch {
    return "rgba(0, 0, 0, 1)";
  }
}

/** The notations a colour picked is written back in, by the space it was written in; any other is written as hex. */
const KEPT_SPACES = new Set(["oklch", "oklab", "lch", "lab", "p3", "hsl"]);

/**
 * A colour picked (`rgba()`) written as `like` is written, so a value the
 * agent wrote in oklch() stays in oklch() as he turns it: oklch, oklab,
 * lch, lab, display-p3 and hsl in their own notation; hex and everything
 * else as hex (eight digits with an alpha).
 */
export function colourLike(picked: string, like: string): string {
  const colour = new Color(picked);
  let space = "srgb";
  try {
    space = new Color(like.trim()).space.id;
  } catch {
    // A colour it can't read is written as hex.
  }
  return KEPT_SPACES.has(space)
    ? colour.to(space).toString({ precision: 4 })
    : colour.to("srgb").toString({ format: "hex", collapse: false });
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

/** A decision page's panel in the config shape agents write (core dial-config.ts), a colour told from words as the browser reads it. */
export const dialsOfConfig = (config: Record<string, unknown>): ConfigDials =>
  readConfig(config, isColour);
