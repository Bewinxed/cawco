/**
 * Builds the dashboard's tokens stylesheet from the one token source,
 * design/tokens/cawco.resolver.json: a W3C Design Tokens (DTCG 2025.10)
 * resolver over cawco.tokens.json (the base set) and one file per context
 * (cawco.dark, cawco.coarse, cawco.compact). Every visual value the
 * dashboard uses is defined there; app.css only imports the result. Beside
 * it, tokens.ts types the token names (design-tokens.ts `tokenTypes`).
 *
 * The stylesheet comes from the hub's generator (packages/hub/src/
 * design-tokens.ts), the one every project's design/tokens.css is made
 * with. It settles the files first: a token whose CSS is a recipe
 * (`$extensions["dev.cawco"].css`) has its static `$value` computed, here
 * and in every context, and a file it changes is written back. Non-colour
 * dark values go under `:root.dark`, lib/theme.svelte.ts's class.
 *
 * The same build writes the Tailwind theme over those tokens (theme.css,
 * imported by app.css after tokens.css): every Tailwind namespace reset, one
 * key per token a utility reads, and the literals Tailwind reads at build
 * time. A utility exists only where a token does.
 *
 * The same build emits the Apple app's tokens into CawCoKit's CawCoDesign
 * module: a colour asset catalog and Tokens.swift (build-tokens-apple.ts).
 *
 *   bun run tokens                          (with --ladder: print the theme's keys and values)
 *   bun scripts/build-tokens.ts --check     (part of `bun run lint`)
 *
 * Every output is made in memory and formatted as `bun fmt` writes that file
 * (scripts/fmt.ts `formatText`), so what the build writes is final: no
 * formatter runs after it.
 *
 * `--check` builds the same and writes nothing: it fails on a value its type
 * refuses (dtcg-validate.ts, before anything evaluates one), on any output
 * whose bytes differ from the committed file (a source file that would
 * settle included, and a committed colour set no token makes), and on a
 * `font` shorthand utility (a type role, `font-inherit` …) that Tailwind
 * sorts after a font longhand utility (role-order.ts).
 */
import { readdirSync, rmSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import StyleDictionary from "style-dictionary";
import type { TransformedToken } from "style-dictionary/types";
import {
  buildTokens,
  cssLeafName,
  tailwindThemeCss,
} from "../../../packages/hub/src/design-tokens";
import { formatText } from "../../../scripts/fmt";
import {
  COLOUR_CATALOG,
  colourSetFiles,
  swiftFormat,
} from "./build-tokens-apple";
import { fontOrderDrift } from "./role-order";
import { printLadder } from "./theme-ladder";
import { isProductToken } from "./token-groups";

const CHECK = process.argv.includes("--check");
/** The outputs unlike the committed files, in check mode. */
const drift: string[] = [];
/** How many outputs the build made. */
let made = 0;

/**
 * An output as the build leaves it: formatted as `bun fmt` writes that file,
 * so the bytes are final. The build writes them; check mode holds them to the
 * committed file, byte for byte.
 */
async function emit(path: string, content: string): Promise<void> {
  made += 1;
  const formatted = await formatText(path, content);
  const file = Bun.file(path);
  if (!CHECK) {
    await mkdir(dirname(path), { recursive: true });
    await Bun.write(path, formatted);
  } else if (!(await file.exists())) {
    drift.push(`${path}: not committed`);
  } else if ((await file.text()) !== formatted) {
    drift.push(`${path}: unlike the committed file`);
  }
}

const DIR = "../../design/tokens";
const RESOLVER = "cawco.resolver.json";
const OUT = "src/lib/tokens/tokens.css";
/** The typed module beside it: `TokenColor`, `TokenSize`, `TokenFont`, which a component's props take to be offered the names in a sheet's inspector. */
const TYPES_OUT = "src/lib/tokens/tokens.ts";
const THEME_OUT = "src/lib/tokens/theme.css";
/**
 * The browser's `::selection`, its tint written out from `color.selection`
 * rather than read as `var(--selection)`. Chrome resolves an element's
 * ::selection again on each restyle when that rule reads a var() and the
 * element declares a custom property of its own (an inline `--icon-action`,
 * a utility's `--tw-*`): Element::ShouldRecalcHighlightPseudoStyle,
 * chromium 89fc3a5, "If the highlight depends on variables and the
 * variables on the originating element have changed, we need to
 * re-evaluate". With the value written out, every element takes its
 * parent's, and a restyle styles the element alone.
 */
const SELECTION_OUT = "src/lib/tokens/selection.css";

/**
 * The kit's bridge names (shadcn's `background`, `muted-foreground` …) that
 * resolve, in both schemes, to a house token: markup names the house token
 * (scripts/vocab-codemod.ts), and the theme makes no key for them. `card`,
 * `accent`, `border` and `input` resolve to no other token, so they keep
 * theirs. `font-sans` is `font-body`'s stack; markup names the role.
 */
const RETIRED = new Set([
  "background",
  "foreground",
  "card-foreground",
  "muted",
  "muted-foreground",
  "destructive",
  "success",
  "warning",
  "info",
  "error",
  "sidebar",
  "sidebar-foreground",
  "sidebar-border",
  "font-sans",
]);

/**
 * The house's animations, one `animate-<name>` each, every one on the motion
 * tokens. A plain fade names app.css's `kit-fade-in` / `kit-fade-out`; the
 * keyframes app.css keeps for script-built names (`breath`, `rail-label-in`,
 * `kit-tip-fade`, ns-theme's `ns-in`, `ns-panel`) are named from there; the
 * rest are below. Every travelling one is used under `motion-safe:`.
 */
const ANIMATIONS: Record<string, string> = {
  // Live work breathes (DESIGN.md): one loop of --breath on ease-in-out.
  "animate-breath": "breath var(--breath) var(--ease-in-out) infinite",
  // Fades: a toast, a tip, a step, a scrim, a sheet under reduced motion.
  "animate-kit-fade-out": "kit-fade-out var(--dur-exit) var(--ease-out) both",
  "animate-kit-tip-fade": "kit-tip-fade var(--dur-menu) var(--ease-out)",
  "animate-thinking-step-in":
    "kit-fade-in var(--dur-menu) var(--ease-out) backwards",
  "animate-sheet-fade-in": "kit-fade-in var(--dur-control) var(--ease-out)",
  "animate-sheet-fade-out":
    "kit-fade-out var(--dur-control) var(--ease-out) forwards",
  // What waits out --dur-wait-grace before it shows, so a fast answer never
  // flashes it: fading in, or (with reduced motion) at once.
  "animate-wait-grace-in":
    "kit-fade-in var(--dur-fade) var(--ease-out) var(--dur-wait-grace) both",
  "animate-wait-grace-show": "kit-fade-in 1ms var(--dur-wait-grace) both",
  // A tick draws itself along its stroke over --dur-toggle (DESIGN.md Ticks
  // and dots), on a path of pathLength="1" with `dash-unit`; with reduced
  // motion it only fades in.
  "animate-check-in": "kit-fade-in var(--dur-toggle) var(--ease-out) both",
  "animate-check-draw": "check-draw var(--dur-toggle) var(--ease-out) both",
  // The rail's travelling label settling in as it re-labels.
  "animate-rail-label-in": "rail-label-in var(--dur-exit) var(--ease-out) both",
  // The thinking indicator (DESIGN.md Status displays): each of four words
  // holds two breaths of an eight-breath cycle (`--word-delay` per word); the
  // circle and the infinity trade places twice a three-breath loop; a band of
  // strong ink crosses the word once a breath while the word inside it
  // slides back, so only the light moves. An active step's words shimmer on
  // the same breath.
  "animate-thinking-word":
    "thinking-word calc(var(--breath) * 8) var(--ease-out) var(--word-delay, 0s) infinite both",
  "animate-thinking-circle":
    "thinking-circle calc(var(--breath) * 3) var(--ease-in-out) infinite both",
  "animate-thinking-lemniscate":
    "thinking-lemniscate calc(var(--breath) * 3) var(--ease-in-out) infinite both",
  "animate-thinking-sheen":
    "thinking-sheen var(--breath) var(--ease-in-out) infinite",
  "animate-thinking-sheen-hold":
    "thinking-sheen-hold var(--breath) var(--ease-in-out) infinite",
  "animate-step-shimmer":
    "step-shimmer var(--breath) var(--ease-in-out) infinite",
  // A config row the change just landed on flashes from 35% up.
  "animate-row-flash":
    "row-flash calc(var(--dur-fade) * 3) var(--ease-out) both",
  // Cards and marks arriving: a pin's card, a mention's tip, an unlock's mark.
  "animate-pin-card-in": "pin-card-in var(--dur-pop) var(--ease-out)",
  "animate-mention-tip-in": "mention-tip-in var(--dur-menu) var(--ease-out)",
  "animate-mark-in": "mark-in var(--dur-pop) var(--ease-out) both",
  // A kit sheet slides in and out from its side (`--sheet-away`).
  "animate-sheet-in": "sheet-in var(--dur-panel) var(--ease-drawer)",
  "animate-sheet-out": "sheet-out var(--dur-exit) var(--ease-drawer) forwards",
  // The new-session dialog (DESIGN.md New-session dialog): its sections fade
  // up in turn (`--delay`), its card enters with ns-panel and leaves sinking
  // and shrinking, its scrim fades.
  "animate-ns-sec":
    "ns-in var(--dur-pop) var(--ease-out) var(--delay, 0ms) backwards",
  "animate-ns-card-in": "ns-panel var(--dur-panel) var(--ease-out) backwards",
  "animate-ns-card-out": "ns-panel-out var(--dur-exit) var(--ease-out) both",
  "animate-ns-scrim-in":
    "kit-fade-in var(--dur-panel) var(--ease-out) backwards",
  "animate-ns-scrim-out": "kit-fade-out var(--dur-exit) var(--ease-out) both",
  // A reply's filed tasks arrive in a cascade (`arrive-delay`), rising, or
  // with reduced motion fading; a project offer settles in the same rise.
  "animate-filed-fade": "kit-fade-in var(--dur-pop) var(--ease-out) backwards",
  "animate-filed-rise": "rise-in var(--dur-pop) var(--ease-out) backwards",
  "animate-offer-settle":
    "rise-in calc(var(--dur-control) * 2) var(--ease-out) backwards",
  // An offer's face swapping: the old out, the new in.
  "animate-face-out": "kit-fade-out var(--dur-exit) var(--ease-out) forwards",
  "animate-face-in": "kit-fade-in var(--dur-menu) var(--ease-out) backwards",
  // The compaction line draws along its dash (`wave-dash`), arriving after
  // the rail and its own lead; while it compacts it breathes, drawing out
  // over one breath and fading where it stands over the next.
  "animate-wave-arrive":
    "wave-draw var(--dur-pop) var(--ease-out) calc(var(--dur-rail) + var(--lead)) backwards",
  "animate-wave-draw": "wave-draw var(--dur-pop) var(--ease-out) backwards",
  "animate-wave-breathe":
    "wave-breath-draw calc(var(--breath) * 2) var(--ease-out) infinite, wave-breath-fade calc(var(--breath) * 2) var(--ease-in-out) infinite",
  // A glyph swapping in its slot grows in as a mark does; with reduced
  // motion it only fades.
  "animate-icon-swap": "mark-in var(--dur-control) var(--ease-out) both",
  "animate-icon-swap-still":
    "kit-fade-in var(--dur-control) var(--ease-out) both",
  // An update cell's new state pops in; with reduced motion it fades.
  "animate-cell-swap": "cell-swap var(--dur-control) var(--ease-out)",
  "animate-cell-fade": "kit-fade-in var(--dur-control) var(--ease-out)",
  // A delegate tray chip arriving fades in, its contents a beat later; a
  // finished one flashes the done fill once.
  "animate-arrive": "kit-fade-in var(--dur-menu) var(--ease-out) both",
  "animate-arrive-late":
    "kit-fade-in var(--dur-menu) var(--ease-out) var(--dur-control) both",
  "animate-finish": "finish calc(var(--dur-fade) * 2) var(--ease-out)",
  // The transcript head's layers come in over the first c-head-fade of
  // scroll, on the transcript's scroll timeline (`head-fade-scrub`).
  "animate-head-fade": "head-fade linear both",
};
/** The keyframes the house's animations name that app.css does not keep. */
const KEYFRAMES: Record<string, string> = {
  "check-draw":
    "from {\n  stroke-dashoffset: 1;\n}\nto {\n  stroke-dashoffset: 0;\n}",
  "thinking-word":
    "0% {\n  opacity: 0;\n  transform: translateY(80%);\n}\n1.5%,\n25% {\n  opacity: 1;\n  transform: translateY(0);\n}\n26%,\n100% {\n  opacity: 0;\n  transform: translateY(-80%);\n}",
  "thinking-circle":
    "0%,\n50%,\n100% {\n  opacity: 1;\n  transform: none;\n}\n25%,\n75% {\n  opacity: 0;\n  transform: scale(1.15, 0.8);\n}",
  "thinking-lemniscate":
    "0%,\n50%,\n100% {\n  opacity: 0;\n  transform: scale(0.7, 1.1);\n}\n25%,\n75% {\n  opacity: 1;\n  transform: none;\n}",
  "thinking-sheen": "to {\n  transform: translateX(-66.6667%);\n}",
  "thinking-sheen-hold": "to {\n  transform: translateX(200%);\n}",
  "step-shimmer":
    "from {\n  background-position: 0% 0;\n}\nto {\n  background-position: 100% 0;\n}",
  "row-flash": "from {\n  opacity: 0.35;\n}",
  "pin-card-in":
    "from {\n  opacity: 0;\n  transform: translateY(var(--pop-rise)) scale(var(--press-scale));\n}",
  "mention-tip-in": "from {\n  opacity: 0;\n  scale: var(--press-scale);\n}",
  "mark-in":
    "from {\n  opacity: 0;\n  scale: 0.25;\n  filter: blur(var(--space-1));\n}",
  "sheet-in": "from {\n  transform: var(--sheet-away);\n}",
  "sheet-out": "to {\n  transform: var(--sheet-away);\n}",
  "ns-panel-out":
    "to {\n  transform: translateY(var(--space-2)) scale(var(--press-scale));\n  opacity: 0;\n}",
  "rise-in": "from {\n  opacity: 0;\n  translate: 0 var(--pop-rise);\n}",
  "wave-draw": "from {\n  stroke-dashoffset: var(--run);\n}",
  "wave-breath-draw":
    "0% {\n  stroke-dashoffset: var(--run);\n}\n50%,\n100% {\n  stroke-dashoffset: 0;\n}",
  "wave-breath-fade": "0%,\n50% {\n  opacity: 1;\n}\n100% {\n  opacity: 0;\n}",
  "cell-swap": "from {\n  opacity: 0;\n  scale: var(--pop-scale);\n}",
  finish: "35% {\n  background-color: var(--status-done-bg);\n}",
  "head-fade": "to {\n  opacity: 1;\n}",
};

/**
 * Every literal width a container query reads (container queries cannot read
 * var()), named by its container; a container with two widths names each by
 * its width. Measured with
 * `git grep -ohE '@container[^{]+' -- 'apps/dashboard/src/**\/*.svelte'`,
 * and the kit's field group (`@md/field-group:`, Tailwind's 28rem).
 */
const CONTAINERS = {
  "field-group": "28rem",
  details: "30rem",
  "table-34rem": "34rem",
  "task-frame": "56rem",
  "table-400px": "400px",
  "stop-tray": "420px",
  kinds: "480px",
  "decisions-520px": "520px",
  leaf: "620px",
  setup: "640px",
  "decisions-900px": "900px",
  // The project page holds Caw's docked panel beside the page: the panel
  // (c-panel-w and its space-6 end margin), the pane's inline padding
  // (space-7, space-6), two 240px board columns and the space-3 between.
  "project-dock": "938px",
};
const APPLE_DIR = "../apple/Packages/CawCoKit/Sources/CawCoDesign/";
/** The decision-page skill CawCo ships (packages/hub/src/bundled-skills.ts): its pages wear the same tokens. */
const SKILL_OUT = "../../packages/hub/skills/decision-page/kit/tokens.css";

const built = await buildTokens(
  RESOLVER,
  (path) => Bun.file(join(DIR, path)).json(),
  {
    header: [
      "/* Generated by `bun run tokens` from design/tokens/cawco.tokens.json.",
      "   Do not edit: change the token source and rebuild. */",
    ].join("\n"),
    layer: "theme",
    include: isProductToken,
    // The specifier spells the file (scripts/lib-import-check.ts).
    typesFrom: "#lib/tokens/tokens.js",
  }
);
const theme = tailwindThemeCss(built.view, {
  header: [
    "/* Generated by `bun run tokens` from design/tokens/cawco.tokens.json.",
    "   Do not edit: change the token source and rebuild. The Tailwind theme",
    "   over tokens.css: a utility exists only where a token does. */",
  ].join("\n"),
  include: isProductToken,
  retired: RETIRED,
  // The owner's call: Tailwind's numeric step stays as the one key no token
  // gives, so an off-ladder grid value keeps its utility (`gap-2`); the
  // ratchet (scripts/spacing-ratchet.ts) holds their count from rising.
  spacing: "0.25rem",
  breakpoints: { phone: "640px", desk: "900px", wide: "1025px" },
  containers: CONTAINERS,
  spacingSizes: /^(c|icon)-/,
  weights: { "weight-body": "normal", "weight-strong": "medium" },
  // Fredoka ships one weight (@fontsource/fredoka/600.css), for the brand's
  // display only. Not `display`: `font-display` is the family.
  literalWeights: { brand: "600" },
  dropShadows: new Set(["shadow-drop", "shadow-drop-near"]),
  // The roles markup already names (`text-meta`), as the old theme's
  // `--text-*` keys made them. A conversion from a component's <style>
  // writes `type-<role>` (for `font:`) or `text-size-<role>` (for
  // `font-size:`), never these.
  markupRoles: ["meta", "label", "body", "title", "kpi"],
  // What every use of a role sets beside its shorthand: a kpi figure is
  // always tabular (`num`). Title's tracking and code's ligatures off are
  // set by only some of their uses, which carry `tracking-title` and
  // `liga-none` themselves.
  roleExtras: {
    "type-kpi": { "font-variant-numeric": "tabular-nums" },
  },
  defaults: {
    // Preflight's faces for html and code: the roles' stacks.
    "default-font-family": "var(--font-body)",
    "default-mono-font-family": "var(--font-mono)",
    // `transition-colors` and its siblings run --dur-control on --ease-out,
    // and the stock loops turn on --dur-loop (a rotation is linear; a pulse
    // breathes in-out).
    "default-transition-duration": "var(--dur-control)",
    "default-transition-timing-function": "var(--ease-out)",
    "animate-spin": "spin var(--dur-loop) linear infinite",
    "animate-pulse": "pulse var(--dur-loop) var(--ease-in-out) infinite",
    "animate-ping": "ping var(--dur-loop) var(--ease-out) infinite",
    ...ANIMATIONS,
  },
  // Tailwind's own, which `--*: initial` clears with the keys that name
  // them, then the house's.
  keyframes: {
    spin: "to {\n  transform: rotate(360deg);\n}",
    ping: "75%,\n100% {\n  transform: scale(2);\n  opacity: 0;\n}",
    pulse: "50% {\n  opacity: 0.5;\n}",
    ...KEYFRAMES,
  },
});
const selection = built.view.byPath.get("color.selection");
const [darkContext] = built.view.darkContexts;
const night = darkContext ? selection?.variants[darkContext] : undefined;
// A reference would be written as var() again, and bring the restyle back.
if (!(selection && night) || `${selection.css}${night}`.includes("{")) {
  throw new Error(
    "color.selection: ::selection is written from its light and dark values, and they reference no other token"
  );
}
const selectionCss = [
  "/* Generated by `bun run tokens` from design/tokens/cawco.tokens.json.",
  "   Do not edit: change the token source and rebuild. The browser's",
  "   selection in the selection tint (color.selection), its value written",
  "   out: a var() here restyles every element that declares a custom",
  "   property of its own (scripts/build-tokens.ts SELECTION_OUT). */",
  "@layer base {",
  "  ::selection {",
  `    background: light-dark(${selection.css}, ${night});`,
  "  }",
  "}",
  "",
].join("\n");
await Promise.all([
  // A source file whose recipes settle to new values is rewritten with them.
  ...[...built.changed].map(([path, json]) =>
    emit(join(DIR, path), `${JSON.stringify(json, null, 2)}\n`)
  ),
  emit(OUT, built.css),
  emit(TYPES_OUT, built.types),
  emit(SKILL_OUT, built.css),
  emit(THEME_OUT, theme.css),
  emit(SELECTION_OUT, selectionCss),
]);
const counts = [...theme.keys].map(([ns, list]) => `${ns} ${list.length}`);
console.log(
  `theme.css: ${counts.join(", ")}; ${theme.utilities.length} utilities`
);
if (process.argv.includes("--ladder")) {
  await printLadder(theme, built.view);
}

// Style Dictionary only makes the Apple module's text here; emit writes it.
const sd = new StyleDictionary({
  tokens: built.system.base,
  usesDtcg: true,
  log: { verbosity: "silent", warnings: "error" },
  hooks: {
    transforms: {
      "name/css-leaf": {
        type: "name",
        transform: (token: TransformedToken) => cssLeafName(token),
      },
    },
    formats: { "swift/cawco-tokens": swiftFormat(built.view) },
  },
  platforms: {
    apple: {
      transforms: ["name/css-leaf"],
      buildPath: APPLE_DIR,
      files: [
        { destination: "Generated/Tokens.swift", format: "swift/cawco-tokens" },
      ],
    },
  },
});

// A destination is under the platform's buildPath already.
const swift = (await sd.formatPlatform("apple")).map(
  ({ output, destination }) => emit(destination ?? "", String(output))
);
const catalog = join(APPLE_DIR, COLOUR_CATALOG);
const sets = colourSetFiles(built.view, await sd.getPlatformTokens("apple"));
await Promise.all([
  ...swift,
  ...[...sets].map(([path, content]) => emit(join(catalog, path), content)),
]);
// A colour set no token makes any more goes, folder and all.
for (const set of readdirSync(catalog).filter((f) => f.endsWith(".colorset"))) {
  if (sets.has(join(set, "Contents.json"))) {
    continue;
  }
  if (CHECK) {
    drift.push(`${join(catalog, set)}: committed, and no token makes it`);
  } else {
    rmSync(join(catalog, set), { recursive: true });
  }
}

if (CHECK) {
  // Every `font` shorthand utility sorts before every font longhand utility.
  for (const wrong of await fontOrderDrift(theme)) {
    drift.push(`${THEME_OUT}: ${wrong}`);
  }
  console.log(
    drift.length === 0
      ? `tokens: the token source conforms and every output is byte for byte the committed file (${made} files)`
      : `tokens: ${drift.length} output(s) unlike the committed files (run bun run tokens):\n  ${drift.join("\n  ")}`
  );
  process.exit(drift.length === 0 ? 0 : 1);
}
console.log(`tokens: ${made} outputs written`);
