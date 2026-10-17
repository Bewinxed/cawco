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
 * `--check` builds the same in memory and writes nothing: it fails on a
 * value its type refuses (dtcg-validate.ts, before anything evaluates one)
 * and on any output unlike the committed file, a source file that would
 * settle included, and on a type role that Tailwind sorts after a font
 * longhand utility (role-order.ts). Outputs are compared as `bun run tokens` leaves them
 * formatted: JSON parsed, CSS and Swift with whitespace and numerals'
 * trailing zeros set aside (`bun fmt` rewrites `0.010` as `0.01`).
 */
import { readdirSync } from "node:fs";
import { join } from "node:path";
import StyleDictionary from "style-dictionary";
import type { TransformedToken } from "style-dictionary/types";
import {
  buildTokens,
  cssLeafName,
  tailwindThemeCss,
} from "../../../packages/hub/src/design-tokens";
import {
  COLOUR_CATALOG,
  colourSetFiles,
  colourSetsAction,
  swiftFormat,
} from "./build-tokens-apple";
import { roleOrderDrift } from "./role-order";
import { printLadder } from "./theme-ladder";
import { isProductToken } from "./token-groups";

const CHECK = process.argv.includes("--check");
/** The outputs unlike the committed files, in check mode. */
const drift: string[] = [];
/** How many outputs check mode held to the committed files. */
let held = 0;
const TRAILING_ZEROS = /(\d\.\d*?)0+(?!\d)/g;
const BARE_POINT = /(\d)\.(?!\d)/g;
const WHITESPACE = /\s+/g;
const HEX_COLOUR = /#[0-9a-f]{3,8}\b/gi;
/** A text output as its formatter leaves it equal to another: hex in lower case, numerals' trailing zeros and then all whitespace set aside. */
const canonical = (text: string): string =>
  text
    .replace(HEX_COLOUR, (hex) => hex.toLowerCase())
    .replace(TRAILING_ZEROS, "$1")
    .replace(BARE_POINT, "$1")
    .replace(WHITESPACE, "")
    .replaceAll("'", '"');
const sameOutput = (path: string, made: string, committed: string): boolean =>
  path.endsWith(".json")
    ? JSON.stringify(JSON.parse(made)) === JSON.stringify(JSON.parse(committed))
    : canonical(made) === canonical(committed);

/** Writes `content` to `path`, or in check mode holds it to the committed file. */
async function emit(path: string, content: string): Promise<void> {
  if (!CHECK) {
    await Bun.write(path, content);
    return;
  }
  held += 1;
  const file = Bun.file(path);
  if (!(await file.exists())) {
    drift.push(`${path}: not committed`);
  } else if (!sameOutput(path, content, await file.text())) {
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
 * Every literal width a container query reads (container queries cannot read
 * var()), named by its container; a container with two widths names each by
 * its width. Measured with
 * `git grep -ohE '@container[^{]+' -- 'apps/dashboard/src/**\/*.svelte'`,
 * and the kit's field group (`@md/field-group:`, Tailwind's 28rem).
 */
const CONTAINERS = {
  "field-group": "28rem",
  details: "30rem",
  "routines-ledger-34rem": "34rem",
  "task-frame": "56rem",
  "routines-ledger-399px": "399px",
  "routines-ledger-400px": "400px",
  "stop-tray": "420px",
  kinds: "480px",
  "decisions-520px": "520px",
  leaf: "620px",
  setup: "640px",
  "decisions-900px": "900px",
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
  breakpoints: { phone: "640px", desk: "901px", wide: "1025px" },
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
  },
  // Tailwind's own, which `--*: initial` clears with the keys that name them.
  keyframes: {
    spin: "to {\n  transform: rotate(360deg);\n}",
    ping: "75%,\n100% {\n  transform: scale(2);\n  opacity: 0;\n}",
    pulse: "50% {\n  opacity: 0.5;\n}",
  },
});
await Promise.all([
  ...[...built.changed].map(([path, json]) =>
    CHECK
      ? drift.push(
          `${join(DIR, path)}: settles to new values (run bun run tokens)`
        )
      : Bun.write(join(DIR, path), `${JSON.stringify(json, null, 2)}\n`)
  ),
  emit(OUT, built.css),
  emit(TYPES_OUT, built.types),
  emit(SKILL_OUT, built.css),
  emit(THEME_OUT, theme.css),
]);
const counts = [...theme.keys].map(([ns, list]) => `${ns} ${list.length}`);
console.log(
  `theme.css: ${counts.join(", ")}; ${theme.utilities.length} utilities`
);
if (process.argv.includes("--ladder")) {
  await printLadder(theme, built.view);
}

const sd = new StyleDictionary({
  tokens: built.system.base,
  usesDtcg: true,
  // Check mode writes nothing, so it says no file it "built".
  log: { verbosity: CHECK ? "silent" : "verbose", warnings: "error" },
  hooks: {
    transforms: {
      "name/css-leaf": {
        type: "name",
        transform: (token: TransformedToken) => cssLeafName(token),
      },
    },
    formats: { "swift/cawco-tokens": swiftFormat(built.view) },
    actions: { "apple/cawco-colorsets": colourSetsAction(built.view) },
  },
  platforms: {
    apple: {
      transforms: ["name/css-leaf"],
      buildPath: APPLE_DIR,
      files: [
        { destination: "Generated/Tokens.swift", format: "swift/cawco-tokens" },
      ],
      actions: ["apple/cawco-colorsets"],
    },
  },
});

if (CHECK) {
  // The Apple module's files, made as buildAllPlatforms makes them, held to the committed ones.
  for (const { output, destination } of await sd.formatPlatform("apple")) {
    // A destination is under the platform's buildPath already.
    // biome-ignore lint/performance/noAwaitInLoops: one file at a time
    await emit(destination ?? "", String(output));
  }
  const catalog = join(APPLE_DIR, COLOUR_CATALOG);
  const sets = colourSetFiles(built.view, await sd.getPlatformTokens("apple"));
  for (const [path, content] of sets) {
    // biome-ignore lint/performance/noAwaitInLoops: one file at a time
    await emit(join(catalog, path), content);
  }
  const committed = readdirSync(catalog).filter((f) => f.endsWith(".colorset"));
  for (const set of committed) {
    if (!sets.has(join(set, "Contents.json"))) {
      drift.push(`${join(catalog, set)}: committed, and no token makes it`);
    }
  }
  // The roles' `font` shorthand sorts before every font longhand utility.
  for (const wrong of await roleOrderDrift(theme)) {
    drift.push(`${THEME_OUT}: ${wrong}`);
  }
  console.log(
    drift.length === 0
      ? `tokens: the token source conforms and every output matches the committed files (${held} files)`
      : `tokens: ${drift.length} output(s) unlike the committed files (run bun run tokens):\n  ${drift.join("\n  ")}`
  );
  process.exit(drift.length === 0 ? 0 : 1);
}
await sd.buildAllPlatforms();
