/**
 * `bun scripts/grid-scope-check.ts` (part of `bun run check`): the 4px base
 * a screen wears alone (theme.css `[data-grid="4px"]`, the project's
 * Settings view) re-declares every token the house builds from the bases it
 * overrides. A custom property is substituted where it is declared, so a
 * token theme.css or design.css computes at `:root` from `--spacing-space-*`
 * or a `--leading-*` would keep today's numbers inside the screen unless the
 * block declares it again: each such token, followed through every token
 * built on it, must stand in the block, in each context (`:root` and its
 * media queries) where `:root` declares it.
 *
 * Prints each token missing from the block, with where `:root` builds it;
 * exits 1 on any.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Read at run time beyond its imports; check.ts keys the check on them.
export const checkReads = [
  "apps/dashboard/src/lib/tokens/theme.css",
  "apps/dashboard/src/design.css",
];

const ROOT = resolve(import.meta.dir, "..");
const SHEETS = checkReads;
const SCOPE = '[data-grid="4px"]';
const COMMENT = /\/\*[\s\S]*?\*\//gu;
const PART = /([^{};]+)\{|\}|(--[\w-]+)\s*:\s*([^;]*);/gu;
const VAR = /var\((--[\w-]+)/gu;

interface Declared {
  /** The rules and at-rules it stands in, outermost first. */
  context: string[];
  name: string;
  value: string;
}

const declarations = (sheet: string): Declared[] => {
  const css = readFileSync(resolve(ROOT, sheet), "utf8").replace(COMMENT, "");
  const context: string[] = [];
  const found: Declared[] = [];
  for (const part of css.matchAll(PART)) {
    if (part[1] !== undefined) {
      context.push(part[1].trim().replace(/\s+/gu, " "));
    } else if (part[0] === "}") {
      context.pop();
    } else if (part[2] && part[3] !== undefined) {
      found.push({ name: part[2], value: part[3], context: [...context] });
    }
  }
  return found;
};

const all = SHEETS.flatMap(declarations);
/** The media query a declaration stands under, "" for none. */
const mediaOf = (one: Declared): string =>
  one.context.filter((at) => at.startsWith("@media")).join(" ");
const atRoot = (one: Declared): boolean =>
  one.context.some((at) => at.startsWith("@theme") || at.endsWith(":root"));
const inScope = (one: Declared): boolean => one.context.includes(SCOPE);

const scoped = all.filter(inScope);
/** The bases the block overrides: every token it declares that no rule at :root builds from another it declares. */
const declaredInScope = new Set(scoped.map((one) => one.name));
const rootOnes = all.filter((one) => atRoot(one) && !inScope(one));

// Each token at :root built, through any chain, on one the block declares.
const derived = new Set<string>();
for (let grew = true; grew;) {
  grew = false;
  for (const one of rootOnes) {
    if (derived.has(`${one.name} ${mediaOf(one)}`)) {
      continue;
    }
    const reads = [...one.value.matchAll(VAR)].map((match) => match[1]);
    if (
      reads.some(
        (name) =>
          name !== undefined &&
          (declaredInScope.has(name) ||
            [...derived].some((key) => key.startsWith(`${name} `)))
      )
    ) {
      derived.add(`${one.name} ${mediaOf(one)}`);
      grew = true;
    }
  }
}

const missing = [...derived].filter((key) => {
  const [name = "", ...media] = key.split(" ");
  const at = media.join(" ");
  return !scoped.some((one) => one.name === name && mediaOf(one) === at);
});

if (missing.length > 0) {
  console.error(
    `grid-scope: ${missing.length} token(s) built at :root from the 4px base's own tokens are not declared again in ${SCOPE} (theme.css), so the screen wearing it reads today's values:`
  );
  for (const key of missing) {
    console.error(`  ${key.trim()}`);
  }
  process.exit(1);
}
console.log(
  `grid-scope: every one of ${derived.size} token(s) built from the 4px base's own is declared again in ${SCOPE}`
);
