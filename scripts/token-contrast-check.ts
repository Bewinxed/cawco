/**
 * `bun run token-contrast:check` (part of `bun run check`): every colour pair
 * the design system promises holds its contrast floor in both themes, read
 * from the token source alone, with no browser. Text on its surfaces needs
 * 4.5:1; large or UI text and non-text marks (status glyphs, the focus ring,
 * nest lines, rims, edges) 3:1; a pair whose own words state a lower ratio on
 * purpose is held to that ratio. Contrast is WCAG 2.2's (relative luminance,
 * (L1 + 0.05) / (L2 + 0.05)), unrounded.
 *
 * The values are the declarations of the dashboard's theme.css (its
 * `@theme static` block, and the dark scheme's block where a value differs),
 * plus the component-local paints in design.css and libraries.css,
 * read by the evaluator (packages/design-tokens/src/design-css.ts, on colorjs.io),
 * which resolves `light-dark()`, `color-mix()` and relative `oklch(from …)` as
 * the cascade does. Over that this check only paints: a colour with alpha (a
 * wash, a glyph at its breath floor) is laid over what stands under it,
 * source-over in sRGB as the browser composites, each layer clipped into sRGB
 * as the browser clips it (WCAG's luminance is defined there).
 *
 *   bun scripts/token-contrast-check.ts           failing pairs only
 *   bun scripts/token-contrast-check.ts --table   every pair, both themes
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import Color from "colorjs.io";
import postcss from "postcss";
import {
  ACCOUNT_HUES,
  type AccountHue,
} from "../packages/core/src/accounts/kinds";
import { STATUS_PAIRS } from "../packages/core/src/views";
import {
  CssEvaluator,
  type CssToken,
} from "../packages/design-tokens/src/design-css";

const THEME = join(
  import.meta.dir,
  "../apps/dashboard/src/lib/tokens/theme.css"
);
const DESIGN = join(import.meta.dir, "../apps/dashboard/src/design.css");
const LIBRARIES = join(
  import.meta.dir,
  "../apps/dashboard/src/lib/tokens/libraries.css"
);

// Read at run time beyond its imports; check.ts keys the check on them.
export const checkReads = [
  "apps/dashboard/src/lib/tokens/theme.css",
  "apps/dashboard/src/design.css",
  "apps/dashboard/src/lib/tokens/libraries.css",
];
const TEXT = 4.5;
const UI = 3;

type Theme = "light" | "dark";
type Floor = number | Record<Theme, number>;

interface Pair {
  /**
   * What the mark is measured against, when it is not what it is painted
   * over: a stroke on an edge is painted over its own sheet and read against
   * the fill beyond it. Painted as `bg` is.
   */
  against?: string[];
  /** Painted bottom first: token paths, `color.` taken as read, or raw CSS. */
  bg: string[];
  /** A token path (`color.` taken as read) or raw CSS over the token CSS. */
  fg: string;
  /** The fg's opacity: a number token's path, or a number. */
  fgOpacity?: string | number;
  floor: Floor;
  /** Measured today under its floor; the token change that fixes it is in the report. */
  known?: Partial<Record<Theme, number>>;
  label: string;
  source: string;
}

const IDENTITY_HUES = [55, 85, 115, 145, 175, 205, 235, 265, 295, 330];
const ACCOUNT_MARK: Record<AccountHue, number> = {
  orange: 2,
  amber: 3,
  green: 4,
  cyan: 5,
  blue: 6,
  violet: 7,
  rose: 8,
};
const CODE_INKS = [
  "code-syntax-foreground",
  "code-syntax-token-keyword",
  "code-syntax-token-function",
  "code-syntax-token-string",
  "code-syntax-token-constant",
  "code-syntax-token-comment",
];
const CODE_GROUNDS: [string, string[]][] = [
  ["surface-recess", ["surface-recess"]],
  ["diff-add", ["surface-recess", "diffs-bg-addition-override"]],
  ["diff-del", ["surface-recess", "diffs-bg-deletion-override"]],
  [
    "diff-add-emphasis",
    [
      "surface-recess",
      "diffs-bg-addition-override",
      "diffs-bg-addition-emphasis-override",
    ],
  ],
  [
    "diff-del-emphasis",
    [
      "surface-recess",
      "diffs-bg-deletion-override",
      "diffs-bg-deletion-emphasis-override",
    ],
  ],
];
const weekRim = (mark: number) =>
  `color-mix(in oklch, {color.mark-${mark}}, {color.account-week-toward} calc({motion.account-week-mix} * 100%))`;

const S = {
  action: "DESIGN.md, Colour: coral is the act",
  brandInk: "DESIGN.md, Colour: coral ink and wash",
  selected: "DESIGN.md, Colour: coral marks what is selected",
  inkSolid: "the ink-strong fill (theme.css)",
  chips: "DESIGN.md, Colour: status hues (each chip 4.5:1)",
  syntax: "syntax colours (libraries.css + design.css diff washes)",
  strongEdge:
    "token border-strong (theme.css, non-text 3:1 WCAG 2.2 SC 1.4.11)",
  inks: "the text inks (theme.css)",
  subtle: "token ink-subtle (theme.css)",
  identity: "DESIGN.md, Colour: identity hues; token identity-ink",
  rim: "session tabs' status rim (design.css tab-rim-mix-chosen/-idle)",
  recall: "the recall wheel's rows (Composer), text 4.5:1 (WCAG 2.2 SC 1.4.3)",
  hairline:
    "Caw's panel section rule; token brand-solid (non-text 3:1, WCAG 2.2 SC 1.4.11)",
  stale: "usage relay bar (UsageMeter); token account-stale-opacity",
  dial: "usage dial (UsageMeter); token account-week-mix",
  week: "usage week mark (UsageMeter)",
  spent: "usage cell at its limit (UsageMeter); token ring-track-spent",
  ring: "DESIGN.md, Colour: the focus ring (non-text 3:1, WCAG 2.2 SC 1.4.11)",
  glyphs: "status glyphs (theme.css)",
  breath: "DESIGN.md, Motion: live marks breathe; token breath-floor",
  nest: "token nest-ink ('about 2.3:1 to 2.5:1')",
};

const PAIRS: Pair[] = [
  // Text inks on the surfaces they stand on.
  ...["ink-strong", "ink-row", "ink-muted"].flatMap((ink) =>
    [
      "surface-page",
      "surface-raised",
      "surface-recess",
      "surface-fill",
      "surface-hover",
      "option-picked",
    ].map((bg) => ({
      label: `${ink} on ${bg}`,
      fg: ink,
      bg: [bg],
      floor: TEXT,
      source: S.subtle,
    })
  ),
  // White on coral: the action, its gradient stops, and hover.
  ...(
    [
      ["action-solid", "action-solid"],
      [
        "action-surface top stop",
        "oklch(from {color.action-solid} calc(l + 0.03) c h)",
      ],
      [
        "action-surface bottom stop",
        "oklch(from {color.action-solid} calc(l - 0.03) c h)",
      ],
      ["action-hover", "action-hover"],
      [
        "action-hover top stop",
        "oklch(from {color.action-hover} calc(l + 0.03) c h)",
      ],
      [
        "action-hover bottom stop",
        "oklch(from {color.action-hover} calc(l - 0.03) c h)",
      ],
    ] as const
  ).map(([name, bg]) => ({
    label: `on-action on ${name}`,
    fg: "on-action",
    bg: [bg],
    floor: TEXT,
    source: S.action,
  })),
  // Brand and selection inks on surfaces they sit on.
  ...["surface-page", "surface-raised", "selected-bg"].map((bg) => ({
    label: `brand-ink on ${bg}`,
    fg: "brand-ink",
    bg: [bg],
    floor: TEXT,
    source: bg === "selected-bg" ? S.selected : S.brandInk,
  })),
  {
    label: "brand-ink on brand-wash (over surface-raised)",
    fg: "brand-ink",
    bg: ["surface-raised", "brand-wash"],
    floor: TEXT,
    source: S.brandInk,
  },
  {
    label: "on-ink on ink-strong",
    fg: "on-ink",
    bg: ["ink-strong"],
    floor: TEXT,
    source: S.inkSolid,
  },
  ...STATUS_PAIRS.map((s) => ({
    label: `status-${s}-ink on status-${s}-bg`,
    fg: `status-${s}-ink`,
    bg: [`status-${s}-bg`],
    floor: TEXT,
    source: S.chips,
  })),
  ...CODE_INKS.flatMap((ink) =>
    CODE_GROUNDS.map(([name, bg]) => ({
      label: `${ink} on ${name}`,
      fg: ink,
      bg,
      floor: TEXT,
      source: S.syntax,
    }))
  ),
  ...IDENTITY_HUES.map((h) => ({
    label: `identity-ink at hue ${h} on surface-hover`,
    fg: `oklch(from {color.identity-ink} l c ${h})`,
    bg: ["surface-hover"],
    floor: TEXT,
    source: S.identity,
  })),
  // Non-text: edges, rings, rims, marks.
  ...["surface-page", "surface-raised", "surface-recess", "surface-shelf"].map(
    (bg) => ({
      label: `border-strong on ${bg}`,
      fg: "border-strong",
      bg: [bg],
      floor: UI,
      source: S.strongEdge,
    })
  ),
  // The quiet control edge: no 3:1 floor, held to its shipped figures.
  {
    label: "border-control on surface-raised",
    fg: "border-control",
    bg: ["surface-raised"],
    floor: { light: 1.36, dark: 1.43 },
    source: "token border-control (theme.css)",
  },
  ...["surface-page", "surface-raised", "surface-recess", "surface-hover"].map(
    (bg) => ({
      label: `focus-ring on ${bg}`,
      fg: "focus-ring",
      bg: [bg],
      floor: UI,
      source: S.ring,
    })
  ),
  {
    label: "brand-solid hairline on surface-raised",
    fg: "brand-solid",
    bg: ["surface-raised"],
    floor: UI,
    source: S.hairline,
  },
  ...STATUS_PAIRS.flatMap((s) =>
    [
      ["surface-raised"],
      ["surface-page"],
      ["surface-hover"],
      ["selected-bg"],
      ["status-attn-bg"],
    ].map((bg) => ({
      label: `status-${s}-glyph on ${bg[0]}`,
      fg: `status-${s}-glyph`,
      bg,
      floor: UI,
      source: S.glyphs,
    }))
  ),
  {
    label: "status-done-glyph on status-done-bg",
    fg: "status-done-glyph",
    bg: ["status-done-bg"],
    floor: UI,
    source: S.glyphs,
  },
  // Every breather at its floor, on every surface it stands on.
  ...[
    "status-live-glyph",
    "ink-muted",
    "mark-2",
    "mark-3",
    "mark-4",
    "mark-5",
    "mark-6",
    "mark-7",
    "mark-8",
  ].flatMap((ink) =>
    ["surface-page", "surface-raised", "surface-recess", "surface-sunk"].map(
      (bg) => ({
        label: `${ink} at breath-floor on ${bg}`,
        fg: ink,
        fgOpacity: "motion.breath-floor",
        bg: [bg],
        floor: UI,
        source: S.breath,
      })
    )
  ),
  // The chosen session tab's rim over surface-recess, read against shelf and neighbours.
  ...(
    [
      ["status-live-glyph", "effect.tab-rim-mix-chosen"],
      ["status-attn-glyph", "effect.tab-rim-mix-chosen"],
      ["status-fail-glyph", "effect.tab-rim-mix-chosen"],
      ["ink-muted", "effect.tab-rim-mix-idle"],
    ] as const
  ).flatMap(([ink, mix]) =>
    (
      [
        ["top, against surface-shelf", "surface-shelf"],
        ["side, against surface-recess", "surface-recess"],
        ["side, against surface-sunk", "surface-sunk"],
      ] as const
    ).map(([where, against]) => ({
      label: `${ink} rim at ${mix.split(".")[1]}: ${where}`,
      fg: ink,
      fgOpacity: mix,
      bg: ["surface-recess"],
      against: [against],
      floor: UI,
      source: S.rim,
    }))
  ),
  // The recall wheel's rows on the grown shape (surface-raised, grown.ts).
  ...(
    [
      ["ink-strong", "a row's words"],
      ["ink-muted", "a row's time"],
    ] as const
  ).map(([ink, what]) => ({
    label: `${ink} (${what}) at the top row's 94% on surface-raised`,
    fg: ink,
    fgOpacity: 0.94,
    bg: ["surface-raised"],
    floor: TEXT,
    source: S.recall,
  })),
  ...(
    [
      ["brand-ink", "the pick"],
      ["ink-subtle", "an empty draft's hint"],
    ] as const
  ).map(([ink, what]) => ({
    label: `${ink} (${what}) on surface-raised`,
    fg: ink,
    bg: ["surface-raised"],
    floor: TEXT,
    source: S.recall,
  })),
  // Accounts (mapped to categorical marks 2..8): disc, rim and week sector on border-control.
  ...ACCOUNT_HUES.flatMap((hue) => {
    const mark = ACCOUNT_MARK[hue];
    return [
      {
        label: `account ${hue} (mark-${mark}) disc on border-control`,
        fg: `mark-${mark}`,
        bg: ["border-control"],
        floor: 3.9,
        source: S.dial,
      },
      {
        label: `account ${hue} (mark-${mark}) week rim on border-control`,
        fg: weekRim(mark),
        bg: ["border-control"],
        floor: 7.8,
        source: `${S.dial}; ${S.week}`,
      },
      {
        label: `account ${hue} (mark-${mark}) week rim against its disc`,
        fg: weekRim(mark),
        bg: [`mark-${mark}`],
        floor: { light: 1.9, dark: 1.8 },
        source: S.dial,
      },
      {
        label: `account ${hue} (mark-${mark}) at account-stale-opacity on border-control`,
        fg: `mark-${mark}`,
        fgOpacity: "motion.account-stale-opacity",
        bg: ["border-control"],
        floor: UI,
        source: S.stale,
      },
    ];
  }),
  {
    label: "ring-track-spent on meter-wash-over (over surface-raised)",
    fg: "ring-track-spent",
    bg: ["surface-raised", "meter-wash-over"],
    floor: { light: 1.6, dark: 2 },
    source: S.spent,
  },
  {
    label: "nest-ink on surface-page",
    fg: "nest-ink",
    bg: ["surface-page"],
    floor: 2.3,
    source: S.nest,
  },
];

/** A value with each `var(--x)` written `{x}`, as the evaluator reads a reference. */
const refs = (value: string) => value.replace(/var\(--([\w-]+)\)/gu, "{$1}");
/** Variables declared in theme.css, design.css, and libraries.css (:root + dark overrides). */
const themeLight = new Map<string, string>();
const themeDark = new Map<string, string>();
for (const file of [THEME, LIBRARIES, DESIGN]) {
  postcss.parse(readFileSync(file, "utf8")).walkDecls((decl) => {
    const rule = decl.parent;
    if (!decl.prop.startsWith("--")) {
      return;
    }
    if (
      (rule?.type === "atrule" &&
        rule.name === "theme" &&
        rule.params === "static") ||
      (rule?.type === "rule" && rule.selectors.includes(":root"))
    ) {
      themeLight.set(decl.prop.slice(2), refs(decl.value));
    } else if (
      rule?.type === "rule" &&
      rule.selectors.includes('[data-scheme="dark"]')
    ) {
      themeDark.set(decl.prop.slice(2), refs(decl.value));
    }
  });
}
/** A token path (`color.surface-page`) as the stylesheets name it: its last segment, under `--color-` or as it stands. */
const lookup = (path: string): CssToken | undefined => {
  const leaf = path.split(".").at(-1) ?? path;
  for (const name of [`color-${leaf}`, leaf]) {
    const css = themeLight.get(name);
    if (css !== undefined) {
      const variant = themeDark.get(name);
      return {
        css,
        name,
        variants: variant === undefined ? {} : { dark: variant },
      };
    }
  }
  return undefined;
};
const ev = new CssEvaluator(lookup, new Set(["dark"]));
const MODE: Record<Theme, string> = { light: "base", dark: "dark" };

const isCss = (s: string) => s.includes("(") || s.startsWith("#");
const tokenPath = (s: string) => (s.includes(".") ? s : `color.${s}`);

/** `{motion.x}` inside a raw form is a number token: its value under `mode`. */
const numbersIn = (css: string, mode: string) =>
  css.replace(/\{((?:motion|effect)\.[^}]+)\}/gu, (_, path: string) =>
    String(ev.numeric(ev.cssOf(path, mode, path), path, mode))
  );

/** `calc(n * 100%)` the evaluator's color-mix reads as a plain percentage. */
const plainPercent = (css: string) =>
  css.replace(
    /calc\(([\d.]+) \* 100%\)/gu,
    (_, n: string) => `${Number(n) * 100}%`
  );

function paint(spec: string, mode: string): Color {
  if (isCss(spec)) {
    return ev.colour(plainPercent(numbersIn(spec, mode)), mode, spec);
  }
  return ev.colourOf(tokenPath(spec), mode, spec);
}

/**
 * Into sRGB as the screen draws it: each channel clipped to 0..1. Browsers
 * clip an out-of-gamut colour per channel rather than gamut-map it ("Because
 * Chrome and Firefox do naive clipping", w3c/csswg-drafts#9449), and so did
 * the probe that measured the breath floor's 3.13:1 and 3.14:1.
 */
const srgb = (c: Color): [number, number, number, number] => {
  const s = c.to("srgb");
  const [r, g, b] = s.coords.map((v) =>
    Math.min(1, Math.max(0, Number(v ?? 0)))
  );
  return [r, g, b, Number(s.alpha ?? 1)];
};

/** `top` laid over the opaque `under`, source-over in sRGB. */
function over(
  top: Color,
  under: [number, number, number]
): [number, number, number] {
  const [r, g, b, a] = srgb(top);
  return [
    r * a + under[0] * (1 - a),
    g * a + under[1] * (1 - a),
    b * a + under[2] * (1 - a),
  ];
}

const opacity = (spec: string | number | undefined, mode: string): number => {
  if (spec === undefined) {
    return 1;
  }
  if (typeof spec === "number") {
    return spec;
  }
  return ev.numeric(ev.cssOf(spec, mode, spec), spec, mode);
};

const hex = (rgb: [number, number, number]) =>
  new Color("srgb", rgb).toString({ format: "hex", collapse: false });

interface Measure {
  bg: [number, number, number];
  fg: [number, number, number];
  ratio: number;
}

/** A stack of layers, bottom first, painted into one opaque colour. */
function ground(layers: string[], mode: string, where: string) {
  const [first, ...rest] = layers;
  if (!first) {
    throw new Error(`${where}: no ground`);
  }
  const base = srgb(paint(first, mode));
  if (base[3] < 1) {
    throw new Error(`${where}: its first ground ${first} is translucent`);
  }
  let painted: [number, number, number] = [base[0], base[1], base[2]];
  for (const layer of rest) {
    painted = over(paint(layer, mode), painted);
  }
  return painted;
}

function measure(pair: Pair, theme: Theme): Measure {
  const mode = MODE[theme];
  const under = ground(pair.bg, mode, pair.label);
  const ink = paint(pair.fg, mode).clone();
  ink.alpha = Number(ink.alpha ?? 1) * opacity(pair.fgOpacity, mode);
  const fg = over(ink, under);
  const bg = pair.against ? ground(pair.against, mode, pair.label) : under;
  const ratio = Color.contrastWCAG21(
    new Color("srgb", fg),
    new Color("srgb", bg)
  );
  return { bg, fg, ratio };
}

const floorOf = (floor: Floor, theme: Theme) =>
  typeof floor === "number" ? floor : floor[theme];
/** Two-decimal slack on a known ratio, so a rounding in the mark never fails it. */
const SLACK = 0.005;

const table = process.argv.includes("--table");
const failures: string[] = [];
const knownRows: string[] = [];
const healed: string[] = [];
for (const pair of PAIRS) {
  const cells: string[] = [];
  for (const theme of ["light", "dark"] as const) {
    const m = measure(pair, theme);
    const floor = floorOf(pair.floor, theme);
    const known = pair.known?.[theme];
    const detail = `${pair.label} [${theme}]: ${hex(m.fg)} on ${hex(m.bg)} = ${m.ratio.toFixed(2)}:1, floor ${floor}:1 (${pair.source})`;
    cells.push(m.ratio.toFixed(2));
    if (m.ratio >= floor) {
      if (known !== undefined) {
        healed.push(`${detail}; marked known at ${known}, take the mark off`);
      }
    } else if (known !== undefined && m.ratio >= known - SLACK) {
      knownRows.push(`${detail}; known`);
    } else {
      failures.push(
        known === undefined
          ? detail
          : `${detail}; fell under its known ${known}`
      );
    }
  }
  if (table) {
    const floor =
      typeof pair.floor === "number"
        ? `${pair.floor}`
        : `${pair.floor.light} / ${pair.floor.dark}`;
    console.log(
      `| ${pair.label} | ${floor} | ${pair.source} | ${cells[0]} | ${cells[1]} |`
    );
  }
}

for (const line of knownRows) {
  console.log(`token-contrast: ${line}`);
}
for (const line of healed) {
  console.log(`token-contrast: now holds: ${line}`);
}
if (failures.length > 0) {
  for (const line of failures) {
    console.error(`token-contrast: FAIL ${line}`);
  }
  console.error(
    `token-contrast: ${failures.length} of ${PAIRS.length * 2} promised pairs fall under their floor`
  );
  process.exit(1);
}
console.log(
  `token-contrast: ${PAIRS.length * 2 - knownRows.length} of ${PAIRS.length * 2} promised pairs hold their floor in both themes${knownRows.length > 0 ? `, ${knownRows.length} known under it` : ""}`
);
