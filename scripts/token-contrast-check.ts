/**
 * `bun run token-contrast:check` (part of `bun run lint`): every colour pair
 * the design system promises holds its contrast floor in both themes, read
 * from the token source alone, with no browser. Text on its surfaces needs
 * 4.5:1; large or UI text and non-text marks (status glyphs, the focus ring,
 * nest lines, rims, edges) 3:1; a pair whose own words state a lower ratio on
 * purpose is held to that ratio. Contrast is WCAG 2.2's (relative luminance,
 * (L1 + 0.05) / (L2 + 0.05)), unrounded.
 *
 * The values come from the token build itself: `buildTokens` over
 * design/tokens/cawco.resolver.json and the build's own evaluator
 * (packages/hub/src/design-css.ts, on colorjs.io), which resolves
 * `light-dark()`, `color-mix()` and relative `oklch(from …)` as the cascade
 * does. Over that this check only paints: a colour with alpha (a wash, a
 * glyph at its breath floor) is laid over what stands under it, source-over
 * in sRGB as the browser composites, each layer clipped into sRGB as the
 * browser clips it (WCAG's luminance is defined there).
 *
 * Each row of PAIRS names the DESIGN.md line or token comment it comes from.
 * A row that fails today is marked `known` with its measured ratio, so it
 * reports without blocking; it fails the day it falls further, and says so
 * the day it holds (take the mark off then).
 *
 *   bun scripts/token-contrast-check.ts           failing pairs only
 *   bun scripts/token-contrast-check.ts --table   every pair, both themes
 */
import { join } from "node:path";
import Color from "colorjs.io";
import { buildTokens, evaluatorOf } from "../packages/hub/src/design-tokens";

const DIR = join(import.meta.dir, "../design/tokens");
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

const STATUSES = ["live", "attn", "done", "fail"] as const;
const TOOLS = [
  "run",
  "mcp",
  "search",
  "ask",
  "web",
  "read",
  "agent",
  "edit",
  "write",
  "skill",
  "plan",
] as const;
const ACCOUNTS = [
  "amber",
  "orange",
  "green",
  "cyan",
  "blue",
  "rose",
  "violet",
] as const;
const IDENTITY_HUES = [55, 85, 115, 145, 175, 205, 235, 265, 295, 330];
const CODE_INKS = [
  "code-ink",
  "code-keyword",
  "code-fn",
  "code-string",
  "code-number",
  "code-comment",
];
const CODE_GROUNDS: [string, string[]][] = [
  ["code-bg", ["code-bg"]],
  ["diff-add-bg", ["code-bg", "diff-add-bg"]],
  ["diff-del-bg", ["code-bg", "diff-del-bg"]],
  ["diff-add-emphasis", ["code-bg", "diff-add-bg", "diff-add-emphasis"]],
  ["diff-del-emphasis", ["code-bg", "diff-del-bg", "diff-del-emphasis"]],
];
const ACTION_TOP = "oklch(from {color.action-solid} calc(l + 0.03) c h)";
const ACTION_BOTTOM = "oklch(from {color.action-solid} calc(l - 0.03) c h)";
const HOVER_TOP = "oklch(from {color.action-hover} calc(l + 0.03) c h)";
const HOVER_BOTTOM = "oklch(from {color.action-hover} calc(l - 0.03) c h)";
const weekRim = (hue: string) =>
  `color-mix(in oklch, {color.account-${hue}}, {color.account-week-toward} calc({motion.account-week-mix} * 100%))`;

const S = {
  action: "DESIGN.md:536 Coral Action",
  brandInk: "DESIGN.md:538 Brand ink and wash",
  selected: "DESIGN.md:539 Selected",
  chosen: "DESIGN.md:540 Chosen option; token chip-chosen-bg",
  inkSolid: "DESIGN.md:544 Ink-solid",
  chips: "DESIGN.md:557 status chips",
  syntax: "DESIGN.md:561 Syntax; token code-ink",
  outline: "DESIGN.md:566 Edges; token border-button-outline",
  contrastEdge: "token border-contrast",
  inks: "DESIGN.md:567 Inks",
  subtle: "DESIGN.md:567 Inks; token ink-subtle",
  identity: "DESIGN.md:573 Project identity; token identity-ink",
  rowOutline: "DESIGN.md:683 Borders are graded; token border-row-outline",
  rim: "DESIGN.md:693 Session tab status rim; token tab-rim-mix-chosen/-idle",
  recall:
    "DESIGN.md:870 Recall wheel ('Every row standing in the shape is whole and holds 4.5:1')",
  hairline: "DESIGN.md:709 Needs you / Notices hairline",
  stale: "DESIGN.md:772 relay bar; token account-stale-opacity",
  dial: "DESIGN.md:776 The dial",
  week: "DESIGN.md:779 The week",
  spent: "DESIGN.md:780 The cell; token ring-track-spent",
  notes: "DESIGN.md:829 Release notes; token note-new-ink",
  duotone: "DESIGN.md:923 Solar Duotone Rule; token glyph-duo-status-opacity",
  ring: "DESIGN.md:927 One Ring Rule (non-text 3:1, WCAG 2.2 SC 1.4.11)",
  glyphs: "token status-live-glyph",
  breath: "DESIGN.md:511 Live work breathes; token breath-floor",
  nest: "token nest-ink ('about 2.3:1 to 2.5:1')",
};

const PAIRS: Pair[] = [
  // Text inks on the surfaces they stand on.
  ...["ink-strong", "ink-row", "ink-stat", "ink-muted"].flatMap((ink) =>
    [
      "surface-page",
      "surface-raised",
      "surface-recess",
      "surface-fill",
      "surface-hover",
    ].map((bg) => ({
      label: `${ink} on ${bg}`,
      fg: ink,
      bg: [bg],
      floor: TEXT,
      source: S.inks,
    }))
  ),
  ...["surface-fill", "surface-hover", "surface-raised"].map((bg) => ({
    label: `ink-subtle on ${bg}`,
    fg: "ink-subtle",
    bg: [bg],
    floor: TEXT,
    source: S.subtle,
  })),
  // White on coral: the action, every gradient stop, hover, the chosen chip.
  ...(
    [
      ["action-solid", "action-solid"],
      ["action-surface top stop", ACTION_TOP],
      ["action-surface bottom stop", ACTION_BOTTOM],
      ["action-hover", "action-hover"],
      ["action-hover top stop", HOVER_TOP],
      ["action-hover bottom stop", HOVER_BOTTOM],
    ] as const
  ).map(([name, bg]) => ({
    label: `on-action on ${name}`,
    fg: "on-action",
    bg: [bg],
    floor: TEXT,
    source: S.action,
  })),
  {
    label: "chip-chosen-ink on chip-chosen-bg",
    fg: "chip-chosen-ink",
    bg: ["chip-chosen-bg"],
    floor: TEXT,
    source: S.chosen,
  },
  // Brand and selection inks.
  ...["brand-ink", "link-ink"].map((ink) => ({
    label: `${ink} on surface-raised`,
    fg: ink,
    bg: ["surface-raised"],
    floor: TEXT,
    source: S.brandInk,
  })),
  {
    label: "brand-ink-strong on surface-page",
    fg: "brand-ink-strong",
    bg: ["surface-page"],
    floor: TEXT,
    source: S.brandInk,
  },
  {
    label: "selected-ink on selected-bg",
    fg: "selected-ink",
    bg: ["selected-bg"],
    floor: TEXT,
    source: S.selected,
  },
  {
    label: "on-ink on ink-solid",
    fg: "on-ink",
    bg: ["ink-solid"],
    floor: TEXT,
    source: S.inkSolid,
  },
  ...STATUSES.map((s) => ({
    label: `status-${s}-ink on status-${s}-bg`,
    fg: `status-${s}-ink`,
    bg: [`status-${s}-bg`],
    floor: TEXT,
    source: S.chips,
  })),
  ...(["new", "improved", "fixed"] as const).map((n) => ({
    label: `note-${n}-ink on note-${n}-bg`,
    fg: `note-${n}-ink`,
    bg: [`note-${n}-bg`],
    floor: TEXT,
    source: S.notes,
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
  {
    label: "border-button-outline on surface-raised",
    fg: "border-button-outline",
    bg: ["surface-raised"],
    floor: UI,
    source: S.outline,
  },
  {
    label: "border-contrast on surface-raised",
    fg: "border-contrast",
    bg: ["surface-raised"],
    floor: UI,
    source: S.contrastEdge,
  },
  ...["surface-raised", "surface-recess"].map((bg) => ({
    label: `border-row-outline on ${bg}`,
    fg: "border-row-outline",
    bg: [bg],
    floor: UI,
    source: S.rowOutline,
  })),
  ...["surface-page", "surface-raised", "surface-recess", "surface-fill"].map(
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
  ...STATUSES.flatMap((s) =>
    [
      ["surface-raised"],
      ["surface-page"],
      ["surface-fill"],
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
  // Every breather at its floor, on every surface it stands on.
  ...[
    "status-live-glyph",
    "ink-muted",
    ...TOOLS.map((t) => `tool-${t}`),
  ].flatMap((ink) =>
    [
      "surface-page",
      "surface-raised",
      "surface-recess",
      "surface-recess-deep",
      "surface-well",
    ].map((bg) => ({
      label: `${ink} at breath-floor on ${bg}`,
      fg: ink,
      fgOpacity: "motion.breath-floor",
      bg: [bg],
      floor: UI,
      source: S.breath,
    }))
  ),
  // An alert row's status glyph: its disc on the recess, its strokes on the disc.
  ...["ink-strong", "status-done-ink", "status-attn-ink"].flatMap((ink) => [
    {
      label: `${ink} disc (glyph-duo-status-opacity) on surface-recess`,
      fg: ink,
      fgOpacity: "motion.glyph-duo-status-opacity",
      bg: ["surface-recess"],
      floor: UI,
      source: S.duotone,
    },
    {
      label: `${ink} strokes on its disc`,
      fg: ink,
      bg: [
        "surface-recess",
        `color-mix(in srgb, {color.${ink}} calc({motion.glyph-duo-status-opacity} * 100%), transparent)`,
      ],
      floor: UI,
      source: S.duotone,
    },
  ]),
  // The chosen session tab's rim: its stroke over the tab's own sheet, read
  // against the shelf above its top and against the fills either side of its
  // sides (its sheet, and a receded neighbour's). Painted so, it measures the
  // stated 4.1 / 5.7 working and 3.2 / 3.8 idle at the top, 4.5 / 5.0
  // working and 3.5 / 3.4 idle at the sides.
  ...(
    [
      ["status-live-glyph", "effect.tab-rim-mix-chosen"],
      ["tab-rim-attn", "effect.tab-rim-mix-chosen"],
      ["status-fail-glyph", "effect.tab-rim-mix-chosen"],
      ["ink-muted", "effect.tab-rim-mix-idle"],
    ] as const
  ).flatMap(([ink, mix]) =>
    (
      [
        ["top, against surface-shelf", "surface-shelf"],
        ["side, against tab-sheet", "tab-sheet"],
        ["side, against tab-recede-1", "tab-recede-1"],
      ] as const
    ).map(([where, against]) => ({
      label: `${ink} rim at ${mix.split(".")[1]}: ${where}`,
      fg: ink,
      fgOpacity: mix,
      bg: ["tab-sheet"],
      against: [against],
      floor: UI,
      source: S.rim,
    }))
  ),
  // The recall wheel's rows on the grown shape (surface-raised, grown.ts),
  // the topmost faded furthest: 94% on a wide window, 95.5% on a compact one.
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
      ["selected-ink", "the pick"],
      ["ink-subtle", "an empty draft's hint"],
    ] as const
  ).map(([ink, what]) => ({
    label: `${ink} (${what}) on surface-raised`,
    fg: ink,
    bg: ["surface-raised"],
    floor: TEXT,
    source: S.recall,
  })),
  // Accounts: disc, rim and week sector on the border-control track.
  ...ACCOUNTS.flatMap((hue) => [
    {
      label: `account-${hue} disc on border-control`,
      fg: `account-${hue}`,
      bg: ["border-control"],
      floor: 3.9,
      // Rose at night is mark-8's oklch(70% 0.17 350); its own 70.5% holds 3.94.
      ...(hue === "rose" ? { known: { dark: 3.86 } } : {}),
      source: S.dial,
    },
    {
      label: `account-${hue} week rim on border-control`,
      fg: weekRim(hue),
      bg: ["border-control"],
      floor: 7.8,
      source: `${S.dial}; ${S.week}`,
    },
    {
      label: `account-${hue} week rim against its disc`,
      fg: weekRim(hue),
      bg: [`account-${hue}`],
      floor: { light: 1.9, dark: 1.8 },
      source: S.dial,
    },
    {
      label: `account-${hue} at account-stale-opacity on border-control`,
      fg: `account-${hue}`,
      fgOpacity: "motion.account-stale-opacity",
      bg: ["border-control"],
      floor: UI,
      source: S.stale,
    },
  ]),
  {
    label: "ring-track-spent on meter-wash-over (over surface-raised)",
    fg: "ring-track-spent",
    bg: ["surface-raised", "meter-wash-over"],
    floor: { light: 1.6, dark: 2 },
    // By day it is neutral-7, oklch(81% 0.016 80); its own 80.5% holds 1.62.
    known: { light: 1.59 },
    source: S.spent,
  },
  ...["sidebar", "surface-page"].map((bg) => ({
    label: `nest-ink on ${bg}`,
    fg: "nest-ink",
    bg: [bg],
    floor: 2.3,
    source: S.nest,
  })),
];

const built = await buildTokens(
  "cawco.resolver.json",
  (path) => Bun.file(join(DIR, path)).json(),
  { header: "", layer: "theme", typesFrom: "" }
);
const ev = evaluatorOf(built.view);
const [darkContext] = built.view.darkContexts;
if (!darkContext) {
  throw new Error("token-contrast: the resolver has no dark context");
}
const MODE: Record<Theme, string> = { light: "base", dark: darkContext };

const isCss = (s: string) => s.includes("(") || s.startsWith("#");
const tokenPath = (s: string) => (s.includes(".") ? s : `color.${s}`);

/** `{motion.x}` inside a raw form is a number token: its value under `mode`. */
const numbersIn = (css: string, mode: string) =>
  css.replace(/\{((?:motion|effect)\.[^}]+)\}/g, (_, path: string) =>
    String(ev.numeric(ev.cssOf(path, mode, path), path, mode))
  );

/** `calc(n * 100%)` the evaluator's color-mix reads as a plain percentage. */
const plainPercent = (css: string) =>
  css.replace(
    /calc\(([\d.]+) \* 100%\)/g,
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
