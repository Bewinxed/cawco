/**
 * `bun scripts/token-contrast-check.ts` (part of `bun run lint`): every
 * text and background pair DESIGN.md's Colors section names, by day and at
 * night, holds its WCAG 2 contrast: 4.5:1 for text, 3:1 for an edge or a
 * glyph. Read from the token source itself, `design/tokens/cawco.tokens.json`
 * with `cawco.dark.tokens.json` over it for night (the resolver's `theme`
 * modifier), every alias resolved, colours converted to sRGB by colorjs.io.
 * A translucent ground is composited over what it sits on (a diff's row over
 * `code-bg`, its changed words over the row); translucent ink over its ground.
 *
 * Prints each pair below its floor as `theme  ink on ground  ratio < floor`,
 * then a count; exits 1 on any. Changes no token. `--all` prints every
 * pair's ratio.
 */
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const TOKENS = join(ROOT, "design", "tokens");
/** The dashboard's own colorjs.io (it is not hoisted to the root). */
const { default: Color } = (await import(
  Bun.resolveSync("colorjs.io", join(ROOT, "apps", "dashboard"))
)) as {
  default: new (
    space: string,
    coords: number[],
    alpha?: number
  ) => { alpha: number; to: (space: string) => { coords: number[] } };
};

/** `--all` prints every pair's ratio, not only the ones below their floor. */
const ALL = process.argv.includes("--all");
const TEXT = 4.5;
const EDGE = 3;
/** A pair: the ink, the ground (bottom layer first), its floor, and where DESIGN.md names it. */
type Pair = [ink: string, ground: string[], floor: number, named: string];

const syntax = [
  "code-keyword",
  "code-fn",
  "code-string",
  "code-number",
  "code-comment",
];
const codeGrounds = [
  ["code-bg"],
  ["code-bg", "diff-add-bg"],
  ["code-bg", "diff-del-bg"],
  ["code-bg", "diff-add-bg", "diff-add-emphasis"],
  ["code-bg", "diff-del-bg", "diff-del-emphasis"],
];
const PAIRS: Pair[] = [
  ["on-action", ["action-solid"], TEXT, "Coral Action"],
  ["on-action", ["action-hover"], TEXT, "Coral Action (hover)"],
  ["link-ink", ["surface-raised"], TEXT, "Brand ink: links on raised"],
  [
    "brand-ink-strong",
    ["surface-raised"],
    TEXT,
    "Brand ink strong on the pane",
  ],
  ["selected-ink", ["selected-bg"], TEXT, "Selected"],
  ["chip-chosen-ink", ["chip-chosen-bg"], TEXT, "Chosen option"],
  ["on-ink", ["ink-solid"], TEXT, "Ink-solid"],
  ...(["live", "attn", "done", "fail"] as const).map((s): Pair => [
    `status-${s}-ink`,
    [`status-${s}-bg`],
    TEXT,
    "Status chips",
  ]),
  ...syntax.flatMap((ink) =>
    codeGrounds.map((g): Pair => [ink, g, TEXT, "Syntax on every code ground"])
  ),
  ...["surface-fill", "surface-hover", "surface-raised"].map((g): Pair => [
    "ink-subtle",
    [g],
    TEXT,
    "Inks: ink-subtle",
  ]),
  ...(["new", "improved", "fixed"] as const).map((n): Pair => [
    `note-${n}-ink`,
    [`note-${n}-bg`],
    TEXT,
    "Release notes",
  ]),
  [
    "border-button-outline",
    ["surface-raised"],
    EDGE,
    "Edges: the outline button's edge",
  ],
  ["border-contrast", ["surface-raised"], EDGE, "Edges: border-contrast"],
  [
    "border-contrast",
    ["surface-recess"],
    EDGE,
    "Edges: border-contrast against the bar",
  ],
];

type Tokens = Record<string, unknown>;
const read = async (file: string) =>
  (await Bun.file(join(TOKENS, file)).json()) as Tokens;

/** `b` over `a`, group by group: the resolver's merge, the later source winning. */
function merge(a: Tokens, b: Tokens): Tokens {
  const out: Tokens = { ...a };
  for (const [key, value] of Object.entries(b)) {
    const was = out[key];
    out[key] =
      was &&
      typeof was === "object" &&
      !("$value" in (was as object)) &&
      value &&
      typeof value === "object" &&
      !("$value" in (value as object))
        ? merge(was as Tokens, value as Tokens)
        : value;
  }
  return out;
}

interface Rgba {
  a: number;
  rgb: [number, number, number];
}

/** A token's colour, its aliases followed, in sRGB 0–1. */
function colour(set: Tokens, path: string, seen = new Set<string>()): Rgba {
  if (seen.has(path)) {
    throw new Error(`an alias loop at ${path}`);
  }
  seen.add(path);
  const token = path
    .split(".")
    .reduce<unknown>((at, key) => (at as Tokens | undefined)?.[key], set) as
    { $value?: unknown } | undefined;
  const value = token?.$value;
  if (value === undefined) {
    throw new Error(`no token ${path}`);
  }
  if (typeof value === "string") {
    return colour(set, value.replace(/^\{|\}$/g, ""), seen);
  }
  const { colorSpace, components, alpha } = value as {
    alpha?: number;
    colorSpace: string;
    components: number[];
  };
  const space = colorSpace === "display-p3" ? "p3" : colorSpace;
  const [r, g, b] = new Color(space, components)
    .to("srgb")
    .coords.map((c) => Math.min(1, Math.max(0, Number.isFinite(c) ? c : 0)));
  return { rgb: [r ?? 0, g ?? 0, b ?? 0], a: alpha ?? 1 };
}

/** `top` over `under`, in sRGB (as a browser composites). */
const over = (top: Rgba, under: Rgba): Rgba => ({
  rgb: top.rgb.map(
    (c, i) => c * top.a + (under.rgb[i] ?? 0) * (1 - top.a)
  ) as Rgba["rgb"],
  a: 1,
});

/** WCAG 2's relative luminance and contrast ratio. */
const luminance = ({ rgb }: Rgba) =>
  rgb
    .map((c) => (c <= 0.040_45 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
    .reduce((sum, c, i) => sum + c * ([0.2126, 0.7152, 0.0722][i] ?? 0), 0);
const ratio = (x: Rgba, y: Rgba) => {
  const [hi, lo] = [luminance(x), luminance(y)].sort((p, q) => q - p);
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
};

const light = await read("cawco.tokens.json");
const themes: [string, Tokens][] = [
  ["light", light],
  ["dark", merge(light, await read("cawco.dark.tokens.json"))],
];
let failing = 0;
let checked = 0;
for (const [theme, set] of themes) {
  for (const [ink, ground, floor, named] of PAIRS) {
    checked += 1;
    try {
      const layers = ground.map((g) => colour(set, `color.${g}`));
      const base = layers.reduce((under, top) => over(top, under));
      const fg = over(colour(set, `color.${ink}`), base);
      const r = ratio(fg, base);
      if (ALL && r >= floor) {
        console.log(
          `${theme.padEnd(5)}  ${ink} on ${ground.join(" + ")}  ${r.toFixed(2)}:1  (${named})`
        );
      }
      if (r < floor) {
        failing += 1;
        console.log(
          `${theme.padEnd(5)}  ${ink} on ${ground.join(" + ")}  ${r.toFixed(2)}:1 < ${floor}:1  (${named})`
        );
      }
    } catch (error) {
      failing += 1;
      console.log(
        `${theme.padEnd(5)}  ${ink} on ${ground.join(" + ")}  ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}
console.log(
  failing === 0
    ? `token contrast: all ${checked} pairs DESIGN.md names hold (4.5:1 text, 3:1 edges), light and dark`
    : `token contrast: ${failing} of ${checked} pairs below their floor`
);
process.exit(failing === 0 ? 0 : 1);
