/**
 * Writes the document's two edge colours (src/lib/tokens/screen-edges.css,
 * which app.css imports in the components layer): html's background, the
 * screen's top, and body's, its foot, for every state the root's words say
 * (ScreenEdges says which colour each edge is and why). Each is a literal,
 * resolved from theme.css's tokens: `light-dark(<day>, <night>)` of the
 * colours the tokens name, a scrim's share mixed in as `color-mix()` of
 * literals.
 *
 * Literals, because in Chromium a word flipped on html restyled every
 * element in the document when html's own style read a `var()` (its
 * background, `var(--edge-top-background)` and then the tokens), and when a
 * registered custom property changed on html or body, whatever it held:
 * 2,010 elements a scrim flip on a page of 2,000 rows, against 6 with these
 * backgrounds (work item 01a3cc2e; root-flip-check.ts holds both). The
 * strips (`data-screen-edge`) keep their registered `--edge-*` (app.css):
 * nothing descends from them.
 *
 * The states, in the cascade's order, each rule at the weight of the one
 * before so the later stands: the top is the bar (surface-raised), or the
 * shelf where the bar floats or hosts the tabs (a narrow or portrait screen
 * hosting keeps the bar's); a scrim lays the page's background over each
 * edge at its share (scrim-mix); a bottom sheet is the foot; a side sheet
 * is both edges (surface-raised), the phone's sidebar both (sidebar).
 *
 *   bun run screen-edges
 *   bun scripts/screen-edges.ts --check   (part of `bun run check`: writes
 *     nothing, and fails when the committed file, formatted alike on this
 *     machine's bun (fmt.ts `formattedAlike`), is not what theme.css makes)
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { formatText } from "../../../scripts/fmt";
import { writeOrCheck } from "./lib/generated";

// Read at run time beyond its imports; check.ts keys the check on them.
export const checkReads = ["apps/dashboard/src/lib/tokens/theme.css"];

const DASHBOARD = join(import.meta.dir, "..");
const OUT = "src/lib/tokens/screen-edges.css";
const THEME = "src/lib/tokens/theme.css";
const COMMENT = /\/\*[\s\S]*?\*\//gu;
const DECLARATION = /(--[\w-]+)\s*:\s*([^;]+);/gu;
const VAR = /var\(\s*(--[\w-]+)\s*\)/u;
const LIGHT_DARK = "light-dark(";
const WHITE_SPACE = /\s+/gu;

/** Every token theme.css declares, by name, as written. */
const tokens = new Map<string, string>();
for (const [, name = "", value = ""] of readFileSync(
  join(DASHBOARD, THEME),
  "utf8"
)
  .replace(COMMENT, "")
  .matchAll(DECLARATION)) {
  if (!tokens.has(name)) {
    tokens.set(name, value.replace(WHITE_SPACE, " ").trim());
  }
}

/** A value with every `var()` replaced by its token's value, all the way down. */
function resolved(value: string, seen: string[] = []): string {
  const match = VAR.exec(value);
  if (!match) {
    return value;
  }
  const [whole, name = ""] = match;
  const token = tokens.get(name);
  if (token === undefined || seen.includes(name)) {
    throw new Error(`${THEME}: ${name} is not a token it declares`);
  }
  return resolved(value.replace(whole, resolved(token, [...seen, name])), seen);
}

/** Where the parenthesis opened at `open` closes. */
function closing(text: string, open: number): number {
  let depth = 0;
  for (let at = open; at < text.length; at += 1) {
    if (text[at] === "(") {
      depth += 1;
    } else if (text[at] === ")") {
      depth -= 1;
      if (depth === 0) {
        return at;
      }
    }
  }
  throw new Error(`unbalanced parentheses in ${text}`);
}

/** The arguments of a call's parenthesised list, split at its own commas. */
function argumentsOf(list: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of list) {
    if (ch === "(") {
      depth += 1;
    } else if (ch === ")") {
      depth -= 1;
    }
    if (ch === "," && depth === 0) {
      out.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  out.push(current.trim());
  return out;
}

/** A value as one scheme draws it: each `light-dark(a, b)` as its day's or night's colour. */
function inScheme(value: string, night: boolean): string {
  const at = value.indexOf(LIGHT_DARK);
  if (at === -1) {
    return value;
  }
  const open = at + LIGHT_DARK.length - 1;
  const end = closing(value, open);
  const [day = "", dark = ""] = argumentsOf(value.slice(open + 1, end));
  const drawn = night ? dark : day;
  return inScheme(value.slice(0, at) + drawn + value.slice(end + 1), night);
}

/** A colour as a literal both schemes read: `light-dark(<day>, <night>)`. */
function literal(value: string): string {
  const full = resolved(value);
  const day = inScheme(full, false);
  const night = inScheme(full, true);
  return day === night ? day : `light-dark(${day}, ${night})`;
}

/**
 * An edge under a scrim: the page's background over it at the scrim's
 * share, each colour a literal of its own as the tokens' `color-mix()`
 * reads them. The share stands in a `calc()`: of literals alone, the
 * build's minifier (Lightning CSS) mixed the two at build time into 8-bit
 * hex, where the browser, mixing the tokens, keeps full precision.
 */
const scrimmed = (under: string): string =>
  `color-mix(in srgb, ${literal("var(--color-surface-page)")} calc(${literal("var(--scrim-mix)")}), ${literal(`var(${under})`)})`;

const RAISED = "--color-surface-raised";
const RECESS = "--color-surface-recess";
const SHELF = "--color-surface-shelf";
const SIDEBAR = "--color-surface-page";
const BAR_UNDER = ':where([data-bar~="floating"], [data-bar~="hosting"])';
const SCRIM = ['[data-scrim~="open"]', '[data-scrim~="lightbox"]'];
const NARROW =
  "@media (width < --theme(--breakpoint-desk)), (pointer: coarse) and (orientation: portrait)";

/** A rule: its selectors and the background they take. */
const rule = (selectors: string[], value: string): string =>
  `${selectors.join(",\n")} {\n  background: ${value};\n}`;

const top = (words: string[]): string[] => words.map((word) => `:root${word}`);
const foot = (words: string[]): string[] =>
  words.map((word) => `:root${word} body`);

const rules = [
  // The top: the bar, or the shelf the tabs stand on.
  rule([":root"], literal(`var(${RAISED})`)),
  rule(
    top(['[data-bar~="floating"]', '[data-bar~="hosting"]']),
    literal(`var(${SHELF})`)
  ),
  `${NARROW} {\n${rule(top(['[data-bar~="hosting"]']), literal(`var(${RAISED})`))}\n}`,
  rule(top(SCRIM), scrimmed(RAISED)),
  rule(top(SCRIM.map((word) => `${BAR_UNDER}${word}`)), scrimmed(SHELF)),
  `${NARROW} {\n${rule(
    top(SCRIM.map((word) => `:where([data-bar~="hosting"])${word}`)),
    scrimmed(RAISED)
  )}\n}`,
  rule(top(['[data-kit-sheet~="side"]']), literal(`var(${RAISED})`)),
  rule(top(['[data-kit-sheet~="rail"]']), literal(`var(${SIDEBAR})`)),
  // The foot: the page's ground.
  rule(["body"], literal(`var(${RECESS})`)),
  rule(foot(SCRIM), scrimmed(RECESS)),
  rule(
    foot(['[data-kit-sheet~="bottom"]', '[data-kit-sheet~="side"]']),
    literal(`var(${RAISED})`)
  ),
  rule(foot(['[data-kit-sheet~="rail"]']), literal(`var(${SIDEBAR})`)),
];

const made = await formatText(
  OUT,
  [
    "/* Generated by `bun run screen-edges` (scripts/screen-edges.ts) from",
    "   theme.css. Do not edit: change the script, or the tokens, and rebuild. */",
    "",
    "@layer components {",
    ...rules,
    "}",
    "",
  ].join("\n")
);

await writeOrCheck({
  made,
  name: "screen-edges",
  out: OUT,
  standing: `html's and body's backgrounds in ${rules.length} rules, as theme.css makes them`,
  stale: "is unlike what theme.css makes",
});
