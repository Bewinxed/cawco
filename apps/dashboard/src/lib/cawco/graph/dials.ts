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
 * three times its written value (1 for a written 0; a negative one three
 * times its size either side of 0, so its fill stands a third along) on a
 * step from the span. A figure typed past either end is kept as typed: the
 * fill and the slider stand at that end, and nothing is clamped on a reload.
 */
export function rangeOf(dial: GraphDial, written: number): DialRange {
  const reach = Math.abs(written) * 3;
  const min = dial.min ?? (written < 0 ? -reach : 0);
  const max = dial.max ?? Math.max(min + 1, reach > 0 ? reach : 1);
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

/**
 * Each CSS colour function a picked colour is written back in: the
 * colorjs.io space it reads, what 100% means for each of its channels in
 * that space's numbers (a hue has none), so a channel the agent wrote as a
 * percentage stays one, and what a bare number counts in (rgb's 0 to 255).
 */
interface Notation {
  full: (number | null)[];
  scale?: number;
  space: string;
}
const NOTATIONS: Record<string, Notation> = {
  rgb: { space: "srgb", full: [1, 1, 1], scale: 255 },
  rgba: { space: "srgb", full: [1, 1, 1], scale: 255 },
  hsl: { space: "hsl", full: [null, 100, 100] },
  hsla: { space: "hsl", full: [null, 100, 100] },
  hwb: { space: "hwb", full: [null, 100, 100] },
  lab: { space: "lab", full: [100, 125, 125] },
  lch: { space: "lch", full: [100, 150, null] },
  oklab: { space: "oklab", full: [1, 0.4, 0.4] },
  oklch: { space: "oklch", full: [1, 0.4, null] },
};
/** `color(<space> …)`'s spaces, by the name CSS gives them. */
const COLOR_SPACES: Record<string, string> = {
  srgb: "srgb",
  "srgb-linear": "srgb-linear",
  "display-p3": "p3",
  rec2020: "rec2020",
  "a98-rgb": "a98rgb",
  "prophoto-rgb": "prophoto",
};
const FUNCTION = /^([a-z-]+)\((.*)\)$/iu;
/** A channel as written: its figure, its decimals, then a % or a unit. */
const CHANNEL = /^-?\d*(?:\.(\d+))?(%|[a-z]+)?$/iu;
const UPPER_HEX = /[A-F]/u;
const SPACES = /\s+/u;
const HEX = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/iu;

/** How a channel was written: its decimals, as a percentage or not, and any unit after it ("deg"). */
interface Written {
  percent: boolean;
  places: number;
  unit: string;
}
const writtenOf = (token: string): Written => {
  const match = CHANNEL.exec(token);
  return {
    places: Math.min(6, match?.[1]?.length ?? 0),
    percent: match?.[2] === "%",
    unit: match?.[2] && match[2] !== "%" ? match[2] : "",
  };
};
/**
 * `value` written as `as` was: its decimals, its percentage (100% being
 * `full`), its unit; a bare number counted in `scale`. A channel whose
 * bare range is 0 to 1 keeps two decimals at least, so a `1 0 0` the
 * agent wrote moves in hundredths.
 */
const writeAs = (
  value: number,
  as: Written,
  full: number | null,
  scale = 1
): string => {
  const percent = as.percent && full !== null;
  const said = percent ? (value / full) * 100 : value * scale;
  const fine = !percent && full !== null && full * scale <= 1;
  const places = fine ? Math.max(2, as.places) : as.places;
  return `${Number(said.toFixed(places))}${as.percent ? "%" : as.unit}`;
};

/** A picked colour as hex, written as `like` was (its case, three digits where it can, an alpha's two). */
const hexLike = (colour: Color, like: string): string => {
  const srgb = colour.to("srgb").toGamut();
  const bytes = srgb.coords.map((one) => Math.round((one ?? 0) * 255));
  const alpha = srgb.alpha ?? 1;
  if (alpha < 1) {
    bytes.push(Math.round(alpha * 255));
  }
  const pairs = bytes.map((one) => one.toString(16).padStart(2, "0"));
  const short =
    (like.length === 4 || like.length === 5) &&
    pairs.every((pair) => pair[0] === pair[1]);
  const hex = `#${pairs.map((pair) => (short ? pair[0] : pair)).join("")}`;
  return UPPER_HEX.test(like) ? hex.toUpperCase() : hex;
};

/**
 * A colour picked (`rgba()`) written as `like` is written, so the agent's
 * value keeps its form as he turns it: its function (rgb, hsl, hwb, lab,
 * lch, oklab, oklch, `color(display-p3 …)` and the other `color()`
 * spaces), commas or spaces, each channel's decimals, percentages and unit,
 * and an alpha only where the picked one is under 1; a hex as hex. A hue
 * the picked colour has none of (a grey) keeps the one written. Anything
 * else (a name, a colour it can't read) is written as hex.
 */
export function colourLike(picked: string, like: string): string {
  const colour = new Color(picked);
  const written = like.trim();
  if (HEX.test(written)) {
    return hexLike(colour, written);
  }
  const match = FUNCTION.exec(written);
  const name = match?.[1]?.toLowerCase() ?? "";
  const body = match?.[2]?.trim() ?? "";
  const commas = body.includes(",");
  const [channelsSaid = "", alphaSaid] = commas
    ? [body.split(",").slice(0, 3).join(" "), body.split(",")[3]]
    : body.split("/");
  let tokens = channelsSaid.trim().split(SPACES);
  let notation: Notation | undefined = NOTATIONS[name];
  let lead = "";
  if (name === "color") {
    const space = COLOR_SPACES[tokens[0]?.toLowerCase() ?? ""];
    notation = space ? { space, full: [1, 1, 1] } : undefined;
    lead = `${tokens[0]} `;
    tokens = tokens.slice(1);
  }
  if (!notation || tokens.length !== 3) {
    return hexLike(colour, "#000000");
  }
  const { space, full, scale } = notation;
  const to = colour.to(space);
  const channels = tokens.map((token, at) => {
    const value = to.coords[at];
    const as = writtenOf(token);
    // A grey has no hue: the hue the agent wrote stands.
    if (value === null || value === undefined || Number.isNaN(value)) {
      return token;
    }
    return writeAs(value, as, full[at] ?? null, scale);
  });
  const alpha = to.alpha ?? 1;
  const alphaAs = writtenOf(alphaSaid?.trim() ?? "0.00");
  const alphaText =
    alpha < 1
      ? writeAs(alpha, { ...alphaAs, places: Math.max(2, alphaAs.places) }, 1)
      : null;
  if (commas) {
    return `${match?.[1]}(${[...channels, ...(alphaText ? [alphaText] : [])].join(", ")})`;
  }
  return `${match?.[1]}(${lead}${channels.join(" ")}${alphaText ? ` / ${alphaText}` : ""})`;
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
