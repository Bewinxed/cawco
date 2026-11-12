// biome-ignore-all lint/performance/useTopLevelRegex: a one-shot script, run by hand, never on a hot path.
/**
 * `bun scripts/codemods/theme-audit.ts`: the dashboard's theme.css meets the
 * rules the audit found it failing. Safe to run twice (the second run
 * changes nothing).
 *
 *   1. Line heights: label, meta and the type-row role 1.4, body 1.5 (text
 *      that can wrap needs 1.4, body copy 1.5; better-typography).
 *   2. Form field edges: a field's resting edge is `border-row-outline`
 *      (3:1 on its surface, WCAG 1.4.11), not `border-control` (1.4 to 1.8:1);
 *      the focus step the field-edge utility makes goes to `border-contrast`.
 *   3. Fonts: `--font-display` (Fredoka) is `--font-wordmark` (Nunito); the
 *      Fredoka package goes.
 *   4. Tool colours: each `--color-tool-*` is the mark step nearest in OKLCH
 *      hue, and the tokens go.
 *   5. Identity colours: each `--color-hue-*` is the mark step nearest in
 *      OKLCH hue, the section hue strings in core's words with it, and the
 *      tokens go (skipped when the app's Swift has no colour for a mark).
 *   6. `--shadow-drawer` takes the overlay's near layer and night ring.
 *   7. `--color-chip-chosen-bg` is `--color-action-solid`.
 *
 * The merges are theme-unify.ts's (lib/token-merge.ts); the theme's lines
 * and the contrast figures are read as scripts/token-contrast-check.ts reads
 * them (lib/theme-measure.ts).
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import Color from "colorjs.io";
import postcss from "postcss";
import { ROOT } from "../lib/repo-files";
import {
  circular,
  clip,
  contrastBetween,
  evaluatorOver,
  hueOf,
} from "./lib/theme-measure";
import {
  CONTRAST,
  format,
  loadTexts,
  read,
  THEME,
  write,
} from "./lib/theme-tree";
import {
  applyMerges,
  declsOf,
  deleteDeclsIn,
  flat,
  type Merge,
  m,
  planMerges,
  setValueIn,
  themeNamesIn,
  valueIn,
} from "./lib/token-merge";

const texts = loadTexts();
const changed = new Set<string>();
const say = (line: string) => console.log(line);
let themeText = read(THEME);
const variablesBefore = themeNamesIn(themeText).size;
const contrastBefore = read(CONTRAST);
const PROPS_FIXTURE =
  "apps/dashboard/src/lib/cawco/graph/bench/props-fixture.ts";

/** Replaces `find` with `replace` in a file, where it is still there. */
const edit = (file: string, find: string, replace: string) => {
  const text = texts.get(file) ?? read(file);
  if (text.includes(find)) {
    const next = text.split(find).join(replace);
    texts.set(file, next);
    write(file, next);
    changed.add(file);
    say(
      `${file}: ${JSON.stringify(find.trim().slice(0, 70))} -> ${JSON.stringify(replace.trim().slice(0, 70))}`
    );
  }
};
const setValue = (name: string, value: string) => {
  const was = valueIn(themeText, name);
  if (was !== undefined && flat(was) !== value) {
    themeText = setValueIn(themeText, name, value);
    say(`${name}: ${flat(was)} -> ${value}`);
  }
};

// ---- 1. line heights --------------------------------------------------------

setValue("--leading-label", "1.4");
setValue("--leading-meta", "1.4");
setValue("--leading-body", "1.5");
// --type-row reads var(--leading-label), so it is 1.4 with it.
{
  const row = flat(valueIn(themeText, "--type-row") ?? "");
  if (!row.includes("var(--leading-label)")) {
    throw new Error(`--type-row no longer reads --leading-label: ${row}`);
  }
}

// ---- 2. form field edges ----------------------------------------------------

const KIT = "apps/dashboard/src/lib/components/ui";
const EDGE = "border-row-outline";
edit(
  `${KIT}/input/input.svelte`,
  "min-w-0 border border-border-control",
  `min-w-0 border border-${EDGE}`
);
edit(
  `${KIT}/textarea/textarea.svelte`,
  '"border border-border-control",',
  `"border border-${EDGE}",`
);
edit(
  `${KIT}/select/select-trigger.svelte`,
  "rounded-sm border border-border-control px-space-3",
  `rounded-sm border border-${EDGE} px-space-3`
);
edit(
  `${KIT}/select/select-trigger.svelte`,
  '"border border-border-control [--hit-edge:1px]"',
  `"border border-${EDGE} [--hit-edge:1px]"`
);
edit(
  `${KIT}/native-select/native-select.svelte`,
  "before:border-border-control",
  `before:border-${EDGE}`
);
edit(
  `${KIT}/checkbox/checkbox.svelte`,
  "pointer-hit border-input [--hit-edge:1px]",
  `pointer-hit border-${EDGE} [--hit-edge:1px]`
);
// The switch's track is its boundary: its unchecked fill is the edge colour, in both schemes.
edit(
  `${KIT}/switch/switch.svelte`,
  `    "data-unchecked:bg-input data-disabled:opacity-50",
    "dark:data-unchecked:bg-input/80",
`,
  `    "data-unchecked:bg-${EDGE} data-disabled:opacity-50",
`
);
// A field now rests on its edge: the step a caret makes goes to the strong edge.
edit(
  "apps/dashboard/src/design.css",
  `    ):not([aria-invalid="true"], :has([aria-invalid="true"])) {
    border-color: var(--color-border-row-outline);`,
  `    ):not([aria-invalid="true"], :has([aria-invalid="true"])) {
    border-color: var(--color-border-contrast);`
);
{
  const find = "/* The top bar's glass, solid under Increase Contrast";
  if (themeText.includes(find)) {
    themeText = themeText.replace(
      find,
      "/* A form field's edge while it has the caret (design.css `field-edge`; at rest it is border-row-outline), and the top bar's glass, solid under Increase Contrast"
    );
  }
}
{
  const surfaces = [
    "surface-page",
    "surface-raised",
    "surface-recess",
    "surface-fill",
  ];
  const ev = evaluatorOver(themeText);
  const figures = surfaces.map((bg) => ({
    bg,
    dark: contrastBetween(ev, "border-row-outline", bg, "dark"),
    light: contrastBetween(ev, "border-row-outline", bg, "base"),
  }));
  for (const f of figures) {
    say(
      `border-row-outline on ${f.bg}: ${f.light.toFixed(2)}:1 light, ${f.dark.toFixed(2)}:1 dark`
    );
  }
  const held = figures.filter((f) => f.light >= 3 && f.dark >= 3);
  const has = (bg: string) => held.some((f) => f.bg === bg);
  if (!(has("surface-raised") && has("surface-page"))) {
    throw new Error(
      "border-row-outline does not hold 3:1 on the page and the raised surface"
    );
  }
  const list = (names: string[]) =>
    `[${names.map((n) => `"${n}"`).join(", ")}]`;
  edit(
    CONTRAST,
    `...["surface-raised", "surface-recess"].map((bg) => ({
    label: \`border-row-outline on \${bg}\``,
    `...${list(held.map((f) => f.bg))}.map((bg) => ({
    label: \`border-row-outline on \${bg}\``
  );
  edit(
    CONTRAST,
    'rowOutline: "DESIGN.md, Borders are graded; token border-row-outline"',
    'rowOutline: "DESIGN.md, Borders are graded; token border-row-outline, a form field\'s edge (non-text 3:1, WCAG 2.2 SC 1.4.11)"'
  );
}

// ---- 3. 4. 5. 7. merges -----------------------------------------------------

const marks = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({
  hue: hueOf(valueIn(themeText, `--color-mark-${n}`) ?? ""),
  name: `--color-mark-${n}`,
}));
const nearestMark = (value: string) => {
  const angle = hueOf(value);
  const mark = marks.reduce((a, b) =>
    circular(b.hue, angle) < circular(a.hue, angle) ? b : a
  );
  return { angle, mark: mark.name, markHue: mark.hue };
};
const all: Merge[] = [];

// 4. Tool colours.
const tools = declsOf(postcss.parse(themeText)).filter(
  (d, i, list) =>
    d.prop.startsWith("--color-tool-") &&
    list.findIndex((o) => o.prop === d.prop) === i
);
for (const d of tools) {
  const near = nearestMark(d.value);
  say(
    `tool ${d.prop.slice("--color-tool-".length)} (${near.angle}deg) -> ${near.mark.slice("--color-".length)} (${near.markHue}deg)`
  );
  all.push(m(d.prop, near.mark, { noBare: true }));
}

// 5. Identity colours: the section strings are the colour's names, and the app's Swift must hold a colour for the mark.
const HUES: Record<string, string> = {
  "--color-hue-amber-500": "--color-mark-3",
  "--color-hue-blue-500": "--color-mark-6",
  "--color-hue-blue-600": "--color-mark-6",
  "--color-hue-cyan-400": "--color-mark-6",
  "--color-hue-cyan-500": "--color-mark-6",
  "--color-hue-green-500": "--color-mark-4",
  "--color-hue-green-600": "--color-mark-4",
  "--color-hue-orange-500": "--color-mark-2",
};
{
  const swift = read(
    "apps/apple/Packages/CawCoKit/Sources/CawCoDesign/Generated/Tokens.swift"
  );
  const needed = [...new Set(Object.values(HUES))].map((n) =>
    n.slice("--color-".length)
  );
  const missing = needed.filter(
    (n) => !swift.includes(`Palette.named("${n}")`)
  );
  const present = declsOf(postcss.parse(themeText)).filter((d) =>
    d.prop.startsWith("--color-hue-")
  );
  if (missing.length > 0) {
    say(
      `identity colours skipped: the Swift tokens have no colour for ${missing.join(", ")}`
    );
  } else {
    for (const d of present) {
      const near = nearestMark(d.value);
      const expected = HUES[d.prop];
      if (near.mark !== expected) {
        throw new Error(
          `${d.prop}: nearest mark is ${near.mark}, the brief names ${expected}`
        );
      }
      say(
        `hue ${d.prop} (${near.angle}deg) -> ${near.mark} (${near.markHue}deg)`
      );
      if (!all.some((x) => x.left === d.prop)) {
        all.push(m(d.prop, near.mark));
      }
    }
  }
}

// 7. The chosen chip's fill is the action's.
all.push(m("--color-chip-chosen-bg", "--color-action-solid"));

{
  const merges = planMerges(themeText, all, say);
  themeText = await applyMerges(
    { changed, say, texts, write },
    themeText,
    merges
  );
}
edit(
  CONTRAST,
  'label: "chip-chosen-ink on chip-chosen-bg"',
  'label: "chip-chosen-ink on action-solid"'
);
edit(
  CONTRAST,
  'chosen: "DESIGN.md, Chosen option; token chip-chosen-bg"',
  'chosen: "DESIGN.md, Chosen option; tokens chip-chosen-ink, action-solid"'
);

// The tool inks the contrast check lists are the mark steps now.
{
  const used = [
    ...new Set(
      all
        .filter((x) => x.left.startsWith("--color-tool-"))
        .map((x) => x.right.slice("--color-".length))
    ),
  ].sort();
  if (used.length > 0) {
    edit(
      CONTRAST,
      // biome-ignore lint/suspicious/noTemplateCurlyInString: the check's own source text, as it is written there.
      "...TOOLS.map((t) => `tool-${t}`),",
      `...[${used.map((n) => `"${n}"`).join(", ")}],`
    );
  }
}

edit(
  CONTRAST,
  `const TOOLS = [
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
`,
  ""
);

// 3. The display face is the wordmark's. Only the bench's font list names it as a class (a `font-display: swap` property is not a use of the token).
{
  const reads = [...texts].filter(
    ([path, text]) =>
      path !== PROPS_FIXTURE &&
      /(?<![\w-])(?:--)?font-display(?![\w:-])/u.test(
        text.replace(/font-display:/gu, "")
      )
  );
  if (reads.length > 0) {
    throw new Error(
      `--font-display is read in ${reads.map(([path]) => path).join(", ")}`
    );
  }
  edit(PROPS_FIXTURE, '"font-display"', '"font-wordmark"');
  if (themeNamesIn(themeText).has("--font-display")) {
    themeText = deleteDeclsIn(themeText, new Set(["--font-display"]));
    say(
      "--font-display: deleted, the wordmark's family (Nunito) is the display face"
    );
  }
}

// 3. The Fredoka package.
edit(
  "apps/dashboard/src/app.css",
  '@import "@fontsource/fredoka/600.css";\n',
  ""
);
edit(
  "apps/dashboard/package.json",
  '    "@fontsource/fredoka": "^5.3.0",\n',
  ""
);
edit("apps/dashboard/vite.config.ts", '        "@fontsource/fredoka",\n', "");
edit(
  "apps/dashboard/vite.config.ts",
  'join(import.meta.dirname, "node_modules/@fontsource/fredoka")',
  'join(import.meta.dirname, "node_modules/@xyflow/svelte")'
);
edit(
  "apps/dashboard/vite.config.ts",
  "read off where the dashboard's\n * own face package (Fredoka's) resolves;",
  "read off where a dashboard\n * dependency (@xyflow/svelte) resolves;"
);
edit(
  "apps/dashboard/vite.config.ts",
  "the\n * other pieces, Fredoka and KaTeX's load by URL when a page draws them\n * (under Vite's 4 KB default, Fredoka's 2.7 KB rode in every page's\n * stylesheet). Every other asset",
  "the\n * other pieces, KaTeX's load by URL when a page draws them. Every other asset"
);

// ---- the breath floor -------------------------------------------------------

// The tool inks are mark steps now, and a mark is a little darker at night than the tool ink was: the lowest opacity at which every breather holds 3:1 is measured again, as token-contrast-check.ts paints it (the ink at that alpha, source-over in sRGB, clipped), and set in both schemes.
{
  const listed =
    /"status-live-glyph",\s*"ink-muted",\s*\.\.\.\[([^\]]*)\]/u.exec(
      read(CONTRAST)
    )?.[1];
  if (listed === undefined) {
    throw new Error(`${CONTRAST}: the breathers' list is gone`);
  }
  const inks = [
    "status-live-glyph",
    "ink-muted",
    ...[...listed.matchAll(/"([\w-]+)"/gu)].map((x) => x[1] as string),
  ];
  const surfaces = [
    "surface-page",
    "surface-raised",
    "surface-recess",
    "surface-recess-deep",
    "surface-well",
  ];
  const ev = evaluatorOver(themeText);
  const at = (
    ink: string,
    bg: string,
    mode: "base" | "dark",
    alpha: number
  ) => {
    const f = clip(ev.colourOf(`color.${ink}`, mode, "ink")).coords as number[];
    const b = clip(ev.colourOf(`color.${bg}`, mode, "bg")).coords as number[];
    const over = new Color(
      "srgb",
      b.map((v, i) => v + alpha * ((f[i] as number) - v)) as [
        number,
        number,
        number,
      ]
    );
    return Color.contrastWCAG21(
      over,
      clip(ev.colourOf(`color.${bg}`, mode, "bg"))
    );
  };
  const floors = (["base", "dark"] as const).map((mode) => {
    let worst = { bg: "", floor: 0, ink: "", ratio: 0 };
    for (const ink of inks) {
      for (const bg of surfaces) {
        let alpha = 0.3;
        while (
          alpha < 1 &&
          at(ink, bg, mode, Math.round(alpha * 100) / 100) < 3
        ) {
          alpha += 0.01;
        }
        alpha = Math.round(alpha * 100) / 100;
        if (alpha > worst.floor) {
          worst = { bg, floor: alpha, ink, ratio: at(ink, bg, mode, alpha) };
        }
      }
    }
    return worst;
  });
  const [day, night] = floors as [(typeof floors)[0], (typeof floors)[0]];
  {
    const root = postcss.parse(themeText);
    root.walkDecls("--breath-floor", (d) => {
      const dark =
        d.parent?.type === "rule" &&
        d.parent.selectors.some((s) => s.includes("dark"));
      const next = String((dark ? night : day).floor);
      if (d.value !== next) {
        say(
          `--breath-floor (${dark ? "night" : "day"}): ${d.value} -> ${next} (${(dark ? night : day).ink} on ${(dark ? night : day).bg} the floor, ${(dark ? night : day).ratio.toFixed(2)}:1)`
        );
        d.value = next;
      }
    });
    themeText = root.toString();
  }
  const words = (f: (typeof floors)[0]) =>
    `${f.floor} (${f.ink} on ${f.bg.slice("surface-".length)} the floor, ${f.ratio.toFixed(2)}:1)`;
  const sentence = /By day [\d.]+ \([^)]*\); at night [\d.]+ \([^)]*\)\./u;
  if (sentence.test(themeText)) {
    themeText = themeText.replace(
      sentence,
      `By day ${words(day)}; at night ${words(night)}.`
    );
  }
}

// ---- 6. the drawer's shadow -------------------------------------------------

{
  const layers = (value: string) => flat(value).split(/,\s*(?![^(]*\))/u);
  const overlay = layers(valueIn(themeText, "--shadow-overlay") ?? "");
  const drawer = valueIn(themeText, "--shadow-drawer");
  if (overlay.length < 3 || drawer === undefined) {
    throw new Error("--shadow-overlay or --shadow-drawer is not as expected");
  }
  const own = layers(drawer);
  if (own.length === 1) {
    setValue("--shadow-drawer", [own[0], ...overlay.slice(1)].join(", "));
  }
}

// ---- write, format, report --------------------------------------------------

if (themeText !== read(THEME)) {
  write(THEME, themeText);
  changed.add(THEME);
}
const files = [...changed].filter((p) => existsSync(join(ROOT, p)));
if (files.length > 0) {
  format(files);
}
if (changed.has("apps/dashboard/package.json")) {
  const run = Bun.spawnSync(["bun", "install"], {
    cwd: ROOT,
    env: process.env,
    stderr: "inherit",
    stdout: "inherit",
  });
  if (run.exitCode !== 0) {
    process.exit(run.exitCode);
  }
}
if (changed.has("packages/core/src/words/configure.ts")) {
  const run = Bun.spawnSync(["bun", "run", "words"], {
    cwd: ROOT,
    env: process.env,
    stderr: "inherit",
    stdout: "inherit",
  });
  if (run.exitCode !== 0) {
    process.exit(run.exitCode);
  }
}
console.log(
  `theme variables: ${variablesBefore} before, ${themeNamesIn(read(THEME)).size} after; ${files.length} files changed${read(CONTRAST) === contrastBefore ? "" : " (the contrast check among them)"}`
);
