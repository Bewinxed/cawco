/**
 * Writes the house's Preflight (src/lib/tokens/preflight.css, which app.css
 * and the decision host's host.css import in the base layer in place of
 * Tailwind's): Tailwind's own preflight.css, with its box reset asked of
 * the pseudo-elements the house's CSS makes rather than of every one.
 *
 * Tailwind's first rule resets the box of `*, ::after, ::before, ::backdrop,
 * ::file-selector-button`. `::before`, `::after` and `::backdrop` alone name
 * nothing Blink files a rule under, so it tested all three on every element
 * it restyled (universal-key-check.ts); in work item dab9f694's row bench,
 * taking the bare pseudo-elements out took an element's restyle from 8.05 to
 * 6.35 µs. A `::before` or `::after` box exists only while a rule gives it
 * `content`, and a `::backdrop` box only matters where a rule styles it; so
 * the reset is asked of each of those rules' elements, as Tailwind v3's
 * `optimizeUniversalDefaults` asked its defaults only of the selectors that
 * used them (tailwindlabs/tailwindcss#4850): `:where(X)::before` for every
 * rule `X::before { content: … }` in the CSS the house ships
 * (lib/house-css.ts: every utility under every variant, the house's sheets,
 * its components' styles, the libraries' sheets they import) and in the
 * libraries' sheets their own components load (vendor-sheets.ts), each at the
 * weight and place of Tailwind's `::before`. A selector that asks for more
 * elements than make a box changes nothing: the reset only ever stood on
 * every pseudo-element. `*` and `::file-selector-button` keep the rule, which
 * Blink files under its universal bucket matched without its selector
 * checker, and under the UA part's own bucket.
 *
 * Generated: Tailwind's sheet as installed, so an upgrade that changes it
 * shows here.
 *
 *   bun run preflight
 *   bun scripts/preflight.ts --check   (part of `bun run check`: writes
 *     nothing, and fails when the committed file, formatted alike on this
 *     machine's bun (fmt.ts `formattedAlike`), is not what the build makes)
 */
import { readdirSync, readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import postcss, { AtRule, type Rule } from "postcss";
import selectorParser, { type Selector } from "postcss-selector-parser";
import { compile as compileSvelte } from "svelte/compiler";
import { formatText, formattedAlike } from "../../../scripts/fmt";
import {
  VENDOR_COMPONENT_SHEETS,
  VENDOR_IMPORTED_SHEETS,
} from "../vendor-sheets";
import { fullSelector, readHouseCss } from "./lib/house-css";

// Read at run time beyond its imports (lib/house-css.ts); check.ts keys the
// check on them.
export const checkReads = ["apps/dashboard/", "node_modules/"];

const OUT = "src/lib/tokens/preflight.css";
const DASHBOARD = join(import.meta.dir, "..");
const TAILWIND_PREFLIGHT = createRequire(
  join(DASHBOARD, "package.json")
).resolve("tailwindcss/preflight.css");
/** Tailwind's box reset, as its preflight.css writes it. */
const RESET =
  /^\*,\n::after,\n::before,\n::backdrop,\n::file-selector-button \{\n(?<body>[^}]*)\}/mu;
const BACKDROP = "::backdrop";
/** Each pseudo-element whose box the reset reaches, by the ways it is written; `::before` and `::after` exist only while a rule gives them `content`. */
const PSEUDO_ELEMENTS = new Map([
  ["::before", "::before"],
  [":before", "::before"],
  ["::after", "::after"],
  [":after", "::after"],
  [BACKDROP, BACKDROP],
]);

const tailwind = readFileSync(TAILWIND_PREFLIGHT, "utf8");
const reset = RESET.exec(tailwind);
if (!reset?.groups?.body) {
  throw new Error(
    `${TAILWIND_PREFLIGHT}: its box reset is no longer \`*, ::after, ::before, ::backdrop, ::file-selector-button\`: read Tailwind's preflight again and update scripts/preflight.ts`
  );
}

/** Each pseudo-element's originating selectors, as `:where()` takes them. */
const asked = new Map<string, Set<string>>([
  ["::before", new Set()],
  ["::after", new Set()],
  [BACKDROP, new Set()],
]);

/** The pseudo-element a selector's key ends on and what it is asked of, or null. */
function originOf(
  selector: Selector
): { element: string; origin: string } | null {
  const last = selector.nodes.at(-1);
  if (last?.type !== "pseudo") {
    return null;
  }
  const element = PSEUDO_ELEMENTS.get(last.value.toLowerCase());
  if (element === undefined) {
    return null;
  }
  const origin = selector.clone();
  origin.nodes.at(-1)?.remove();
  const text = origin.toString().trim();
  return { element, origin: text };
}

/** Every file under a folder whose name passes. */
const filesUnder = (dir: string, wanted: (name: string) => boolean): string[] =>
  readdirSync(dir, { recursive: true, encoding: "utf8" })
    .filter(wanted)
    .map((file) => join(dir, file));

/**
 * The libraries' sheets that reach the page with what draws them, not
 * through a house sheet (vendor-sheets.ts): their components' `<style>`s,
 * as Svelte compiles them, and the sheets their components import.
 */
const libraryRoots = (): postcss.Root[] => {
  const roots: postcss.Root[] = [];
  for (const library of VENDOR_COMPONENT_SHEETS) {
    const dir = realpathSync(join(DASHBOARD, "node_modules", library, "dist"));
    for (const file of filesUnder(dir, (name) => name.endsWith(".svelte"))) {
      const source = readFileSync(file, "utf8");
      if (!source.includes("<style")) {
        continue;
      }
      const { css } = compileSvelte(source, {
        filename: file,
        generate: "client",
        css: "external",
        dev: false,
      });
      if (css) {
        roots.push(postcss.parse(css.code));
      }
    }
  }
  for (const folder of VENDOR_IMPORTED_SHEETS) {
    const [scope = "", name = "", ...rest] = folder.split("/");
    const [pkg, path] = scope.startsWith("@")
      ? [`${scope}/${name}`, rest]
      : [scope, [name, ...rest]];
    const dir = join(
      realpathSync(join(DASHBOARD, "node_modules", pkg)),
      ...path
    );
    for (const file of filesUnder(dir, (n) => n.endsWith(".css"))) {
      roots.push(postcss.parse(readFileSync(file, "utf8")));
    }
  }
  return roots;
};

const house = await readHouseCss();
const sheets = [
  ...house.sheets,
  ...libraryRoots().map((root) => ({ root, places: () => [] })),
];
for (const sheet of sheets) {
  sheet.root.walkRules((rule: Rule) => {
    if (
      rule.parent instanceof AtRule &&
      rule.parent.name.endsWith("keyframes")
    ) {
      return;
    }
    // This file's own rules: its `::backdrop` reset would ask of itself.
    if (
      rule.selector.includes(BACKDROP) &&
      sheet.places(rule, rule.selector).some((p) => p.file.endsWith(OUT))
    ) {
      return;
    }
    const declares = (prop: string) =>
      rule.nodes.some((node) => node.type === "decl" && node.prop === prop);
    const styles = rule.nodes.some((node) => node.type === "decl");
    selectorParser((root) => {
      for (const selector of root.nodes) {
        const found = originOf(selector);
        if (found === null) {
          continue;
        }
        const wanted =
          found.element === BACKDROP ? styles : declares("content");
        // The reset itself (Tailwind's, and its `@layer properties`
        // fallback) asks of every pseudo-element and makes none.
        if (!wanted || found.origin === "" || found.origin === "*") {
          continue;
        }
        asked.get(found.element)?.add(found.origin);
      }
    }).processSync(fullSelector(rule));
  });
}

const askedOf = [...asked].flatMap(([element, origins]) =>
  [...origins]
    .sort((a, b) => a.localeCompare(b))
    .map((origin) => `:where(${origin})${element}`)
);
const { body } = reset.groups;
const ours = [
  "*,",
  "::file-selector-button {",
  body,
  "}",
  "",
  "/* The same reset, asked of each pseudo-element a rule makes (scripts/preflight.ts). */",
  `${askedOf.join(",\n")} {`,
  body,
  "}",
].join("\n");

const made = await formatText(
  OUT,
  [
    "/* Generated by `bun run preflight` (scripts/preflight.ts) from Tailwind's",
    "   preflight.css. Do not edit: change the script, or the rules that make",
    "   the pseudo-elements, and rebuild. */",
    "",
    tailwind.replace(RESET, ours),
  ].join("\n")
);

if (process.argv.includes("--check")) {
  const committed = await Bun.file(join(DASHBOARD, OUT)).text();
  if (await formattedAlike(OUT, committed, made)) {
    console.log(
      `preflight: Tailwind's, its box reset asked of ${askedOf.length} pseudo-element selectors, as the committed file says them`
    );
    process.exit(0);
  }
  console.error(
    `preflight: ${OUT} is unlike what the build makes, which asks the reset of ${askedOf.length} pseudo-element selectors (run bun run preflight)`
  );
  process.exit(1);
}
await Bun.write(join(DASHBOARD, OUT), made);
console.log(
  `preflight: wrote ${OUT}, its box reset asked of ${askedOf.length} pseudo-element selectors`
);
