/**
 * A token's DTCG value and its CSS form, each from the other.
 *
 * The value is what the W3C Design Tokens Format Module 2025.10 types say it
 * is (https://www.designtokens.org/tr/2025.10/format/#types): a colour is a
 * Color Module object (`colorSpace`, `components`, `alpha`, `hex`), a
 * dimension `{ value, unit }` in px or rem, a duration `{ value, unit }` in
 * ms or s, a cubic Bézier its four numbers, a shadow its layers, and so on.
 * Any tool reads it whole.
 *
 * The CSS form is what CawCo's stylesheet writes. Most tokens' CSS is their
 * value serialised ({@link toCss}). One whose CSS says more than a static
 * value can (a `color-mix()` or relative colour that follows its base, a
 * fluid `clamp()`, a `calc()` over other tokens, a shorthand) keeps that CSS
 * as its recipe in `$extensions["dev.cawco"].css`; its `$value` is the recipe
 * computed ({@link fromCss}), so the CSS still derives in the browser and
 * every other tool still reads a correct value.
 */
import type Color from "colorjs.io";
import { type CssEvaluator, call, splitTop } from "./design-css";

/** The `$extensions` key CawCo keeps a token's recipe under (reverse domain, as the spec recommends). */
export const TOKENS_EXTENSION = "dev.cawco";

const REF = /^\{([^}]+)\}$/;
const LENGTH = /^(-?\d*\.?\d+)(px|rem)$/;
const TIME = /^(-?\d*\.?\d+)(ms|s)$/;
const PLAIN_NUMBER = /^-?\d*\.?\d+$/;
const OKLCH =
  /^oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+|none)\s*(?:\/\s*([\d.]+))?\s*\)$/;
const HEX = /^#([0-9a-f]{6})$/i;
const GENERIC_FAMILY =
  /^(-apple-system|ui-[a-z]+|system-ui|sans-serif|serif|monospace|cursive|fantasy|emoji|math|fangsong)$/;
const QUOTES = /^["']|["']$/g;
const ZERO = /^0$/;

/** A DTCG colour value (Color Module 2025.10 §4.1). */
export interface DtcgColour {
  alpha?: number;
  colorSpace: string;
  components: (number | "none")[];
  hex?: string;
}

interface Dimension {
  unit: string;
  value: number;
}

/** colorjs.io's space ids, as the Color Module names them. */
const SPACES: Record<string, string> = {
  srgb: "srgb",
  "srgb-linear": "srgb-linear",
  hsl: "hsl",
  hwb: "hwb",
  lab: "lab",
  lch: "lch",
  oklab: "oklab",
  oklch: "oklch",
  p3: "display-p3",
  a98rgb: "a98-rgb",
  prophoto: "prophoto-rgb",
  rec2020: "rec2020",
  xyz: "xyz-d65",
  "xyz-d65": "xyz-d65",
  "xyz-d50": "xyz-d50",
};

/** A number as JSON and CSS write it: no float noise. */
export const num = (x: number): number => Number(x.toPrecision(12));
const fixed = (x: number): number => Number(x.toFixed(6));

const isRef = (value: unknown): value is string =>
  typeof value === "string" && REF.test(value);

// MARK: - CSS from a value

function colourCss(value: unknown): string {
  if (isRef(value)) {
    return value;
  }
  const colour = value as DtcgColour;
  const alpha = colour.alpha ?? 1;
  const [a, b, c] = colour.components.map((n) =>
    n === "none" ? "none" : String(num(n))
  );
  const slash = alpha === 1 ? "" : ` / ${num(alpha)}`;
  if (colour.colorSpace === "oklch") {
    const [l] = colour.components;
    return `oklch(${l === "none" ? "none" : `${num(Number(l) * 100)}%`} ${b} ${c}${slash})`;
  }
  if (colour.colorSpace === "srgb" && colour.hex && alpha === 1) {
    return colour.hex;
  }
  if (
    colour.colorSpace === "srgb" &&
    alpha === 0 &&
    colour.components.every((n) => n === 0)
  ) {
    return "transparent";
  }
  if (colour.colorSpace === "srgb") {
    const rgb = colour.components.map((n) =>
      n === "none" ? "none" : String(num(Number(n) * 255))
    );
    return `rgb(${rgb.join(" ")}${slash})`;
  }
  return `color(${colour.colorSpace} ${[a, b, c].join(" ")}${slash})`;
}

const lengthCss = (value: unknown): string => {
  if (isRef(value)) {
    return value;
  }
  const { value: n, unit } = value as Dimension;
  return n === 0 ? "0" : `${num(n)}${unit}`;
};

const familyCss = (value: unknown): string =>
  isRef(value)
    ? value
    : (Array.isArray(value) ? value : [value])
        .map((name: string) => (GENERIC_FAMILY.test(name) ? name : `"${name}"`))
        .join(", ");

function shadowCss(value: unknown): string {
  if (isRef(value)) {
    return value;
  }
  const layers = Array.isArray(value) ? value : [value];
  return layers
    .map((layer) => {
      if (isRef(layer)) {
        return layer;
      }
      const { color, offsetX, offsetY, blur, spread, inset } = layer as Record<
        string,
        unknown
      >;
      const lengths = [offsetX, offsetY, blur].map(lengthCss);
      const spreadCss = lengthCss(spread);
      return `${inset ? "inset " : ""}${lengths.join(" ")}${spreadCss === "0" ? "" : ` ${spreadCss}`} ${colourCss(color)}`;
    })
    .join(", ");
}

/**
 * The CSS a value writes as, or undefined when CSS has no plain form for it
 * (a transition list, whose properties a DTCG transition does not name).
 */
export function toCss(type: string, value: unknown): string | undefined {
  if (isRef(value)) {
    return value;
  }
  switch (type) {
    case "color":
      return colourCss(value);
    case "dimension":
      return lengthCss(value);
    case "duration": {
      const { value: n, unit } = value as Dimension;
      return `${num(n)}${unit}`;
    }
    case "number":
    case "fontWeight":
      return String(value);
    case "cubicBezier":
      return `cubic-bezier(${(value as number[]).map(num).join(", ")})`;
    case "fontFamily":
      return familyCss(value);
    case "shadow":
      return shadowCss(value);
    case "gradient":
      return `linear-gradient(${(value as { color: unknown }[]).map((stop) => colourCss(stop.color)).join(", ")})`;
    case "typography": {
      const t = value as Record<string, unknown>;
      return `${t.fontWeight} ${lengthCss(t.fontSize)} / ${t.lineHeight} ${familyCss(t.fontFamily)}`;
    }
    default:
      return;
  }
}

// MARK: - A value from CSS

/** A colour as the Color Module writes it, from colorjs.io's reading. */
export function dtcgColour(colour: Color): DtcgColour {
  const space = SPACES[colour.space.id];
  if (!space) {
    throw new Error(
      `colour space ${colour.space.id} has no DTCG name: write it in oklch`
    );
  }
  const alpha = fixed(Number(colour.alpha));
  return {
    colorSpace: space,
    components: colour.coords.map((n) =>
      n === null || Number.isNaN(Number(n)) ? "none" : fixed(Number(n))
    ),
    ...(alpha === 1 ? {} : { alpha }),
  };
}

/** A colour from its CSS: an authored oklch or hex kept as written, anything else computed. */
function colourFrom(
  css: string,
  ev: CssEvaluator,
  mode: string,
  where: string
): unknown {
  const s = css.trim();
  if (REF.test(s)) {
    return s;
  }
  const oklch = OKLCH.exec(s);
  if (oklch) {
    const [, l, pct, c, h, a] = oklch;
    const alpha = a === undefined ? 1 : Number(a);
    return {
      colorSpace: "oklch",
      components: [
        pct ? num(Number(l) / 100) : Number(l),
        Number(c),
        h === "none" ? "none" : Number(h),
      ],
      ...(alpha === 1 ? {} : { alpha }),
    };
  }
  const hex = HEX.exec(s);
  if (hex) {
    const rgb = [0, 2, 4].map((at) =>
      num(Number.parseInt(hex[1].slice(at, at + 2), 16) / 255)
    );
    return { colorSpace: "srgb", components: rgb, hex: s };
  }
  if (s === "transparent") {
    return { colorSpace: "srgb", components: [0, 0, 0], alpha: 0 };
  }
  return dtcgColour(ev.colour(s, mode, where));
}

const px = (n: number): Dimension => ({ value: fixed(n), unit: "px" });

function lengthFrom(
  css: string,
  ev: CssEvaluator,
  mode: string,
  where: string
): unknown {
  const s = css.trim();
  if (REF.test(s)) {
    return s;
  }
  const length = LENGTH.exec(s);
  if (length) {
    return { value: Number(length[1]), unit: length[2] };
  }
  if (ZERO.test(s)) {
    return { value: 0, unit: "px" };
  }
  const fn = call(s);
  if (fn?.name === "clamp") {
    // A fluid size's static value is its floor, the size it starts from.
    const [min = ""] = splitTop(fn.args, ",");
    return lengthFrom(min, ev, mode, where);
  }
  if (fn?.name === "min") {
    return px(ev.cap(s, where, mode));
  }
  // calc() over tokens, and em (at a 16px font), in px.
  return px(ev.numeric(s, where, mode) * (s.endsWith("em") ? 16 : 1));
}

function durationFrom(
  css: string,
  ev: CssEvaluator,
  mode: string,
  where: string
): unknown {
  const s = css.trim();
  if (REF.test(s)) {
    return s;
  }
  const time = TIME.exec(s);
  return time
    ? { value: Number(time[1]), unit: time[2] }
    : { value: fixed(ev.numeric(s, where, mode) * 1000), unit: "ms" };
}

function shadowFrom(
  css: string,
  ev: CssEvaluator,
  mode: string,
  where: string
): unknown {
  const s = css.trim();
  if (REF.test(s)) {
    return s;
  }
  const none = {
    color: { colorSpace: "srgb", components: [0, 0, 0], alpha: 0 },
    offsetX: { value: 0, unit: "px" },
    offsetY: { value: 0, unit: "px" },
    blur: { value: 0, unit: "px" },
    spread: { value: 0, unit: "px" },
  };
  if (s === "none") {
    return none;
  }
  const layers = splitTop(s, ",").map((layer) => {
    if (isRef(layer)) {
      return layer;
    }
    const parts = splitTop(layer, " ");
    const inset = parts.includes("inset");
    const lengths: unknown[] = [];
    let colour: string | undefined;
    for (const part of parts.filter((p) => p !== "inset")) {
      if (LENGTH.test(part) || ZERO.test(part)) {
        lengths.push(lengthFrom(part, ev, mode, where));
      } else if (colour === undefined) {
        colour = part;
      } else {
        throw new Error(`${where}: unsupported shadow "${layer}"`);
      }
    }
    const [offsetX, offsetY, blur = none.blur, spread = none.spread] = lengths;
    if (!(colour && offsetX && offsetY) || lengths.length > 4) {
      throw new Error(`${where}: unsupported shadow "${layer}"`);
    }
    return {
      color: colourFrom(colour, ev, mode, where),
      offsetX,
      offsetY,
      blur,
      spread,
      ...(inset ? { inset: true } : {}),
    };
  });
  return layers.length === 1 ? layers[0] : layers;
}

function gradientFrom(
  css: string,
  ev: CssEvaluator,
  mode: string,
  where: string
): unknown {
  const fn = call(css.trim());
  if (fn?.name !== "linear-gradient") {
    throw new Error(`${where}: unsupported gradient "${css}"`);
  }
  const stops = splitTop(fn.args, ",");
  return stops.map((stop, index) => ({
    color: colourFrom(stop, ev, mode, where),
    position: stops.length === 1 ? 0 : fixed(index / (stops.length - 1)),
  }));
}

function familyFrom(css: string): unknown {
  const s = css.trim();
  return isRef(s)
    ? s
    : splitTop(s, ",").map((name) => name.replace(QUOTES, ""));
}

/** `400 {type.text-meta} / 1.35 {font.font-body}`; the letter-spacing is the caller's. */
function typographyFrom(
  css: string,
  ev: CssEvaluator,
  mode: string,
  where: string
): unknown {
  const [weight, size, slash, leading, family] = splitTop(css, " ");
  if (slash !== "/" || !(weight && size && leading && family)) {
    throw new Error(`${where}: unsupported typography "${css}"`);
  }
  return {
    fontFamily: familyFrom(family),
    fontSize: lengthFrom(size, ev, mode, where),
    fontWeight: Number(weight),
    letterSpacing: { value: 0, unit: "px" },
    lineHeight: Number(leading),
  };
}

/** `background-color {motion.dur-control} {motion.ease-out}, …`: its first transition. */
function transitionFrom(
  css: string,
  ev: CssEvaluator,
  mode: string,
  where: string
): unknown {
  const [first = ""] = splitTop(css, ",");
  const [, duration = "", timing = ""] = splitTop(first, " ");
  return {
    duration: durationFrom(duration, ev, mode, where),
    delay: { value: 0, unit: "ms" },
    timingFunction: isRef(timing)
      ? timing
      : splitTop(call(timing)?.args ?? "", ",").map(Number),
  };
}

/** The DTCG value a token's CSS comes to under `mode`. */
export function fromCss(
  type: string,
  css: string,
  ev: CssEvaluator,
  mode: string,
  where: string
): unknown {
  const s = css.trim();
  if (REF.test(s)) {
    return s;
  }
  switch (type) {
    case "color":
      return colourFrom(s, ev, mode, where);
    case "dimension":
      return lengthFrom(s, ev, mode, where);
    case "duration":
      return durationFrom(s, ev, mode, where);
    case "number":
      return PLAIN_NUMBER.test(s)
        ? Number(s)
        : fixed(ev.numeric(s, where, mode));
    case "fontWeight":
      return Number(s);
    case "cubicBezier":
      return splitTop(call(s)?.args ?? "", ",").map(Number);
    case "fontFamily":
      return familyFrom(s);
    case "shadow":
      return shadowFrom(s, ev, mode, where);
    case "gradient":
      return gradientFrom(s, ev, mode, where);
    case "typography":
      return typographyFrom(s, ev, mode, where);
    case "transition":
      return transitionFrom(s, ev, mode, where);
    default:
      throw new Error(`${where}: $type "${type}" has no CSS reading`);
  }
}

/** Whether two values are the same JSON. */
export const sameValue = (a: unknown, b: unknown): boolean =>
  JSON.stringify(a) === JSON.stringify(b);
