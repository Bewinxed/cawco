/**
 * The image settings' rules, apart from any drawing: which colours and sizes
 * an image can be generated at, and what is wrong with a value that is not
 * one of them. Every reading takes the text as typed and never rewrites it;
 * a fault names the nearest value that would pass.
 */

/** A house accent an image can take: its name and its value by day. */
export interface Swatch {
  id: string;
  name: string;
  value: string;
}

/**
 * The house accents: coral (`coral-9`, `brand-solid`) and the eight identity
 * accents (`mark-1` … `mark-8`), named for the colour each draws (mark-3 at
 * 0.5 L is an ochre, mark-4 an olive, mark-5 a teal), at their day values in
 * design/tokens/cawco.tokens.json. An image's colour is the same in both
 * schemes, so the swatch carries one value, never `light-dark()`.
 */
export const SWATCHES: readonly Swatch[] = [
  { id: "coral", name: "Coral", value: "oklch(0.645 0.175 33)" },
  { id: "red", name: "Red", value: "oklch(0.51 0.168 27.9)" },
  { id: "orange", name: "Orange", value: "oklch(0.53 0.15 47.4)" },
  { id: "ochre", name: "Ochre", value: "oklch(0.5 0.115 86.8)" },
  { id: "olive", name: "Olive", value: "oklch(0.51 0.132 121.2)" },
  { id: "teal", name: "Teal", value: "oklch(0.51 0.093 186.7)" },
  { id: "blue", name: "Blue", value: "oklch(0.51 0.14 251.4)" },
  { id: "purple", name: "Purple", value: "oklch(0.51 0.15 292.5)" },
  { id: "magenta", name: "Magenta", value: "oklch(0.51 0.165 349.8)" },
];

/** A size preset: its ratio, as it is named, and the pixels it sets. */
export interface Preset {
  height: number;
  id: string;
  width: number;
}

/**
 * The presets, each near one megapixel and exact to its ratio on the
 * 8px step (1152 × 864 is 4:3, 1248 × 832 is 3:2, 1280 × 720 is 16:9).
 */
export const PRESETS: readonly Preset[] = [
  { id: "1:1", width: 1024, height: 1024 },
  { id: "4:3", width: 1152, height: 864 },
  { id: "3:2", width: 1248, height: 832 },
  { id: "16:9", width: 1280, height: 720 },
  { id: "9:16", width: 720, height: 1280 },
];

export const CUSTOM = "custom";

export const SIDE_MIN = 256;
export const SIDE_MAX = 4096;
export const SIDE_STEP = 8;

/** Brings a number of pixels to the nearest side that passes. */
export function nearestSide(px: number): number {
  const stepped = Math.round(px / SIDE_STEP) * SIDE_STEP;
  return Math.min(SIDE_MAX, Math.max(SIDE_MIN, stepped));
}

/** A side as typed: a size in pixels, or what keeps it from being one. */
export type SideReading =
  | { ok: true; px: number }
  | { ok: false; fault: "empty" }
  | { ok: false; fault: "nan" | "low" | "high" | "step"; nearest: number };

const WHOLE = /^\d+$/u;
const PX_SUFFIX = /\s*px$/iu;

export function readSide(text: string): SideReading {
  const bare = text.trim().replace(PX_SUFFIX, "");
  if (bare === "") {
    return { ok: false, fault: "empty" };
  }
  if (!WHOLE.test(bare)) {
    const loose = Number.parseFloat(bare);
    return {
      ok: false,
      fault: "nan",
      nearest: Number.isFinite(loose) ? nearestSide(loose) : 1024,
    };
  }
  const px = Number(bare);
  if (px < SIDE_MIN) {
    return { ok: false, fault: "low", nearest: SIDE_MIN };
  }
  if (px > SIDE_MAX) {
    return { ok: false, fault: "high", nearest: SIDE_MAX };
  }
  if (px % SIDE_STEP !== 0) {
    return { ok: false, fault: "step", nearest: nearestSide(px) };
  }
  return { ok: true, px };
}

/** The preset whose pixels these are, or Custom. */
export function presetFor(width: number, height: number): string {
  return (
    PRESETS.find((p) => p.width === width && p.height === height)?.id ?? CUSTOM
  );
}

/** The other side under an aspect lock: `ratio` is width over height. */
export function lockedSide(
  px: number,
  ratio: number,
  from: "width" | "height"
) {
  return nearestSide(from === "width" ? px / ratio : px * ratio);
}

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

/**
 * The ratio as people say it: "16:9" when its reduced terms are small,
 * otherwise the width per unit of height ("1.33:1").
 */
export function ratioWords(width: number, height: number): string {
  const d = gcd(width, height);
  const w = width / d;
  const h = height / d;
  if (w <= 32 && h <= 32) {
    return `${w}:${h}`;
  }
  const per = new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 2,
  }).format(width / height);
  return `${per}:1`;
}

export function megapixels(width: number, height: number): string {
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format((width * height) / 1_000_000);
}

/** A colour as typed: its CSS value, or what keeps it from being one. */
export type ColourReading =
  | { ok: true; value: string }
  | { ok: false; fault: "empty" }
  | { ok: false; fault: "hex-length"; digits: number }
  | { ok: false; fault: "lightness" | "chroma" }
  | { ok: false; fault: "unknown" };

const HEX = /^#?([0-9a-f]+)$/iu;
const HEX_LIKE = /^#/u;
const OKLCH = /^oklch\(\s*(.+?)\s*\)$/iu;
const NUMBER = /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/iu;
const ARGS = /[\s,]+/u;
const DEG = /deg$/iu;
const DIGIT = /\d/u;

/** Chroma past 0.5 is outside every display a generator targets. */
const CHROMA_MAX = 0.5;

function readHex(text: string): ColourReading | null {
  const hex = HEX.exec(text);
  if (!hex) {
    return HEX_LIKE.test(text) ? { ok: false, fault: "unknown" } : null;
  }
  const digits = hex[1] ?? "";
  if (digits.length === 3 || digits.length === 6) {
    return { ok: true, value: `#${digits.toLowerCase()}` };
  }
  // Bare digits that could be a misspelt word are no hex at all.
  if (!(HEX_LIKE.test(text) || DIGIT.test(digits))) {
    return null;
  }
  return { ok: false, fault: "hex-length", digits: digits.length };
}

function readOklch(text: string): ColourReading | null {
  const call = OKLCH.exec(text);
  if (!call) {
    return null;
  }
  const parts = (call[1] ?? "").split(ARGS);
  if (parts.length !== 3) {
    return { ok: false, fault: "unknown" };
  }
  const [lText = "", cText = "", hText = ""] = parts;
  const percent = lText.endsWith("%");
  const lBare = percent ? lText.slice(0, -1) : lText;
  const hBare = hText.replace(DEG, "");
  if (![lBare, cText, hBare].every((part) => NUMBER.test(part))) {
    return { ok: false, fault: "unknown" };
  }
  const l = Number(lBare) / (percent ? 100 : 1);
  if (l < 0 || l > 1) {
    return { ok: false, fault: "lightness" };
  }
  const c = Number(cText);
  if (c < 0 || c > CHROMA_MAX) {
    return { ok: false, fault: "chroma" };
  }
  return { ok: true, value: `oklch(${lText} ${cText} ${hText})` };
}

export function readColour(text: string): ColourReading {
  const bare = text.trim();
  if (bare === "") {
    return { ok: false, fault: "empty" };
  }
  return readHex(bare) ?? readOklch(bare) ?? { ok: false, fault: "unknown" };
}

/** What Apply sends: a colour and a size that all pass. */
export interface ImageSettingsValue {
  colour: string;
  height: number;
  width: number;
}

export const sameSettings = (
  a: ImageSettingsValue | null,
  b: ImageSettingsValue | null
): boolean =>
  a !== null &&
  b !== null &&
  a.colour === b.colour &&
  a.width === b.width &&
  a.height === b.height;
