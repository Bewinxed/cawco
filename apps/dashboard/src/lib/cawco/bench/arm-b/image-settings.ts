/**
 * The image settings' rules, apart from what draws them: which colours and
 * sizes are valid, what the nearest valid size is, and how a size reads as a
 * ratio and megapixels. Everything here is pure, so a story or a test can
 * force any state.
 */

/** One house accent: its name and the CSS colour it applies. */
export interface Swatch {
  css: string;
  id: string;
  name: string;
}

/**
 * The house accents: the brand coral (`brand-solid` at rest, DESIGN.md
 * Colors) and the eight identity marks at their day lightness (`mark-1` …
 * `mark-8`, design/tokens/cawco.resolver.json). An image takes one colour
 * whatever the reader's scheme, so each is its token's day value, fixed.
 */
export const SWATCHES: readonly Swatch[] = [
  { id: "coral", name: "Coral", css: "#E65D46" },
  { id: "red", name: "Red", css: "oklch(0.51 0.168 27.9)" },
  { id: "orange", name: "Orange", css: "oklch(0.53 0.15 47.4)" },
  { id: "yellow", name: "Yellow", css: "oklch(0.5 0.115 86.8)" },
  { id: "green", name: "Green", css: "oklch(0.51 0.132 121.2)" },
  { id: "cyan", name: "Cyan", css: "oklch(0.51 0.093 186.7)" },
  { id: "blue", name: "Blue", css: "oklch(0.51 0.14 251.4)" },
  { id: "purple", name: "Purple", css: "oklch(0.51 0.15 292.5)" },
  { id: "magenta", name: "Magenta", css: "oklch(0.51 0.165 349.8)" },
];

/** Why a typed colour was refused. */
export type ColourFault =
  | "empty"
  | "hex-digits"
  | "oklch-shape"
  | "lightness"
  | "chroma"
  | "hue"
  | "format";

export type ColourCheck =
  | { ok: true; css: string; swatch: Swatch | undefined }
  | { ok: false; fault: ColourFault };

const HEX = /^#?([0-9a-f]+)$/iu;
const OKLCH = /^oklch\((.*)\)$/isu;
const SPACES = /\s+/u;
const PX_SUFFIX = /\s*px$/iu;
const NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)$/u;

/** A number written plainly (no exponent, no unit), or undefined. */
function plain(text: string): number | undefined {
  return NUMBER.test(text) ? Number(text) : undefined;
}

/** An oklch lightness: 0 to 1, or 0% to 100%. */
function lightness(text: string): boolean {
  const percent = text.endsWith("%");
  const value = plain(percent ? text.slice(0, -1) : text);
  return value !== undefined && value >= 0 && value <= (percent ? 100 : 1);
}

/** An oklch chroma: 0 to 0.5, or 0% to 100% (100% is 0.4). */
function chroma(text: string): boolean {
  const percent = text.endsWith("%");
  const value = plain(percent ? text.slice(0, -1) : text);
  return value !== undefined && value >= 0 && value <= (percent ? 100 : 0.5);
}

/** An oklch hue in degrees: 0 to 360, `deg` optional. */
function hue(text: string): boolean {
  const value = plain(text.endsWith("deg") ? text.slice(0, -3) : text);
  return value !== undefined && value >= 0 && value <= 360;
}

/** The swatch a CSS colour is, if it is one. */
function swatchOf(css: string): Swatch | undefined {
  const key = css.split(SPACES).join(" ").toLowerCase();
  return SWATCHES.find((swatch) => swatch.css.toLowerCase() === key);
}

/**
 * A typed colour, read: a hex of 3 or 6 digits (the `#` optional, written
 * back as `#RRGGBB`) or `oklch(L C H)`, kept as typed with its spaces
 * evened. Anything else is refused with the reason.
 */
export function checkColour(typed: string): ColourCheck {
  const text = typed.trim();
  if (text === "") {
    return { ok: false, fault: "empty" };
  }
  const oklch = OKLCH.exec(text);
  if (oklch) {
    const parts = (oklch[1] ?? "").trim().split(SPACES);
    const [l = "", c = "", h = ""] = parts;
    if (parts.length !== 3) {
      return { ok: false, fault: "oklch-shape" };
    }
    if (!lightness(l)) {
      return { ok: false, fault: "lightness" };
    }
    if (!chroma(c)) {
      return { ok: false, fault: "chroma" };
    }
    if (!hue(h)) {
      return { ok: false, fault: "hue" };
    }
    const css = `oklch(${l} ${c} ${h})`;
    return { ok: true, css, swatch: swatchOf(css) };
  }
  const hex = HEX.exec(text);
  if (hex || text.startsWith("#")) {
    const digits = hex?.[1] ?? "";
    if (![3, 6].includes(digits.length)) {
      return { ok: false, fault: "hex-digits" };
    }
    const full =
      digits.length === 3
        ? [...digits].map((digit) => digit + digit).join("")
        : digits;
    const css = `#${full.toUpperCase()}`;
    return { ok: true, css, swatch: swatchOf(css) };
  }
  return { ok: false, fault: "format" };
}

/** The size rules: 256 to 4096 px, in steps of 8. */
const SIZE = { min: 256, max: 4096, step: 8 } as const;

/** Why a typed dimension was refused. */
export type SizeFault = "empty" | "not-number" | "below" | "above" | "step";

export type SizeCheck =
  | { ok: true; px: number }
  | { ok: false; fault: SizeFault; nearest: number | undefined };

/** The valid size nearest a number: clamped to the range, then to the step. */
function nearestSize(value: number): number {
  const stepped = Math.round(value / SIZE.step) * SIZE.step;
  return Math.min(SIZE.max, Math.max(SIZE.min, stepped));
}

/**
 * One step up or down the size grid from a typed value: from a value on the
 * grid, the next one; from one between, the grid line that way; from
 * nothing, the smallest size. Shift's big step is eight of them.
 */
export function stepSize(
  value: number | undefined,
  direction: 1 | -1,
  big: boolean
): number {
  if (value === undefined) {
    return SIZE.min;
  }
  const step = SIZE.step * (big ? 8 : 1);
  const onLine =
    direction > 0 ? Math.floor(value / step) : Math.ceil(value / step);
  return nearestSize((onLine + direction) * step);
}

/** A typed number of pixels (`px` optional), or undefined. */
export function readPixels(typed: string): number | undefined {
  const text = typed.trim().replace(PX_SUFFIX, "");
  const value = plain(text);
  return value === undefined || !Number.isFinite(value) ? undefined : value;
}

/** A typed width or height, read against the size rules. */
export function checkSize(typed: string): SizeCheck {
  if (typed.trim() === "") {
    return { ok: false, fault: "empty", nearest: undefined };
  }
  const value = readPixels(typed);
  if (value === undefined) {
    return { ok: false, fault: "not-number", nearest: undefined };
  }
  if (value < SIZE.min) {
    return { ok: false, fault: "below", nearest: SIZE.min };
  }
  if (value > SIZE.max) {
    return { ok: false, fault: "above", nearest: SIZE.max };
  }
  if (!Number.isInteger(value) || value % SIZE.step !== 0) {
    return { ok: false, fault: "step", nearest: nearestSize(value) };
  }
  return { ok: true, px: value };
}

/** A size preset: a ratio and the size it starts at, about a megapixel. */
export interface Preset {
  across: number;
  down: number;
  height: number;
  id: string;
  /** The ratio as it is said: "16:9". */
  ratio: string;
  width: number;
}

export const PRESETS: readonly Preset[] = [
  { id: "1:1", ratio: "1:1", across: 1, down: 1, width: 1024, height: 1024 },
  { id: "4:3", ratio: "4:3", across: 4, down: 3, width: 1152, height: 864 },
  { id: "3:2", ratio: "3:2", across: 3, down: 2, width: 1248, height: 832 },
  { id: "16:9", ratio: "16:9", across: 16, down: 9, width: 1280, height: 720 },
  { id: "9:16", ratio: "9:16", across: 9, down: 16, width: 720, height: 1280 },
];

/** The preset whose ratio a size has exactly, if any. */
export function presetOf(width: number, height: number): Preset | undefined {
  return PRESETS.find(
    (preset) => width * preset.down === height * preset.across
  );
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/**
 * A size's ratio as it is said: its whole terms ("25:14") while they are
 * small enough to read, else its width over its height to two places
 * ("1.32:1").
 */
export function ratioOf(width: number, height: number): string {
  if (Number.isInteger(width) && Number.isInteger(height)) {
    const divisor = gcd(width, height);
    const across = width / divisor;
    const down = height / divisor;
    if (across <= 32 && down <= 32) {
      return `${across}:${down}`;
    }
  }
  const twoPlaces = new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 2,
  });
  return `${twoPlaces.format(width / height)}:1`;
}

/** A size's megapixels, to two places. */
export function megapixels(width: number, height: number): string {
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format((width * height) / 1_000_000);
}

/** The height a locked ratio gives a width, on the step. */
export function heightFor(width: number, ratio: number): number {
  return Math.round(width / ratio / SIZE.step) * SIZE.step;
}

/** The width a locked ratio gives a height, on the step. */
export function widthFor(height: number, ratio: number): number {
  return Math.round((height * ratio) / SIZE.step) * SIZE.step;
}

/** What Apply hands on. */
export interface ImageSettingsValue {
  colour: string;
  height: number;
  width: number;
}

export function sameSettings(
  a: ImageSettingsValue | null | undefined,
  b: ImageSettingsValue | null | undefined
): boolean {
  return (
    !!a &&
    !!b &&
    a.colour === b.colour &&
    a.width === b.width &&
    a.height === b.height
  );
}
