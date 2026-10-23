/**
 * `bun scripts/border-width-check.ts` (part of `bun run check`): a border or
 * an outline is drawn at a whole CSS pixel. Chromium snaps a border's width
 * (and an outline's, "snapped as a border width") to whole device pixels: a
 * 1.5px border draws 1px on a 1× screen and on a 3× one (specs/concentric).
 * A fractional stroke is an inset ring, whose spread is never snapped
 * (`inset-ring-(length:--x) inset-ring-<colour>`, as CanvasGrip.svelte draws
 * the canvas's corner grip and DecisionNode.svelte its ring), or an SVG
 * stroke.
 *
 * Refused:
 *  - a token (tokens.css, from design/tokens) that is a border's width (its
 *    name ends `border-width`, `border-w`, `outline-width`) or a border
 *    shorthand (`1.5px solid …`) at a fractional px;
 *  - a class that sets a border's or an outline's width fractional: a
 *    literal (`border-[1.5px]`, `border-t-[length:0.5px]`, `border-1.5`) or a
 *    token that resolves fractional (`border-s-(length:--c-corner-grip-stroke)`,
 *    `outline-[length:var(--x)]`);
 *  - a CSS declaration of the same (`border-width: 1.5px`, `border-top:
 *    var(--x) solid …`, `outline: 0.5px solid`), in a stylesheet, a `<style>`
 *    block or a style string.
 * Prints `file:line: text` under the rule each match breaks; exits 1 on any.
 */
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const TOKENS = "apps/dashboard/src/lib/tokens/tokens.css";
/** Where the house draws: the dashboard, the canvas page, the decision-page kit. */
const PLACES = [
  "apps/dashboard/src",
  "packages/agent/src/canvas-host",
  "packages/hub/skills/decision-page/kit",
];
/** Generated from the tokens, which are read once, as tokens. A vendored library's own sheet is not the house's: where it draws a fractional border on our page, the house's own sheet redraws it (decision-page kit page.css over DialKit's easing handle). */
const GENERATED = new Set([
  TOKENS,
  "apps/dashboard/src/lib/tokens/theme.css",
  "packages/hub/skills/decision-page/kit/tokens.css",
]);
const SOURCE = /\.(svelte|ts|tsx|css|html|js)$/;

const DECLARATION = /--([\w-]+)\s*:\s*([^;]*);/g;
const PX = /(-?\d*\.?\d+)px/g;
const ALIAS = /^var\(--([\w-]+)\)$/;
const LENGTH = /^(-?\d*\.?\d+)px$/;
const SPACES = /\s+/g;
const WIDTH_NAME = /(border|outline)(-[\w]+)*-(width|w)$/;
const SHORTHAND = /(\d*\.\d+)px\s+(solid|dashed|dotted|double)/;
const VAR = /var\(--([\w-]+)\)/g;
/** A class setting a border's or an outline's width: its value, bracketed, parenthesised or a bare number. */
const CLASS =
  /(?<![\w-])(?:[\w-]+:)*(border(?:-[xytrblse])?|outline)-(?:\[(?:length:)?([^\]\s]+)\]|\(length:(--[\w-]+)\)|(\d+\.\d+)(?![\w.-]))/g;
/** A CSS declaration of a border's or an outline's width, or its shorthand. */
const CSS_DECLARATION =
  /(?<![\w-])(border(?:-(?:top|right|bottom|left|block|inline)(?:-(?:start|end))?)?|outline)(-width)?\s*:\s*([^;}"'`\n]+)/g;

const fractional = (px: number) => !Number.isInteger(px);

/** Every token's value, by name, from tokens.css (each scheme's block alike). */
const tokenText = await Bun.file(resolve(ROOT, TOKENS)).text();
const values = new Map<string, string>();
for (const [, name, value] of tokenText.matchAll(DECLARATION)) {
  values.set(name, value.replace(SPACES, " ").trim());
}

/** A token's px, through `var()` aliases; null when it is no plain px length. */
const pxOf = (name: string, seen = new Set<string>()): number | null => {
  const value = values.get(name);
  if (!value || seen.has(name)) {
    return null;
  }
  seen.add(name);
  const alias = value.match(ALIAS);
  if (alias) {
    return pxOf(alias[1], seen);
  }
  const px = value.match(LENGTH);
  return px ? Number(px[1]) : null;
};

/** Whether a width written as `text` is fractional: a px literal, or a token that resolves to one. */
const fractionalWidth = (text: string): boolean => {
  for (const [, px] of text.matchAll(PX)) {
    if (fractional(Number(px))) {
      return true;
    }
  }
  for (const [, name] of text.matchAll(VAR)) {
    const px = pxOf(name);
    if (px !== null && fractional(px)) {
      return true;
    }
  }
  return false;
};

const found: { rule: string; hits: string[] }[] = [
  {
    rule: "a token that is a border's or an outline's width is a whole px",
    hits: [],
  },
  {
    rule: "a class sets a border's or an outline's width at a whole px",
    hits: [],
  },
  {
    rule: "a CSS declaration sets a border's or an outline's width at a whole px",
    hits: [],
  },
];
const [tokenRule, classRule, cssRule] = found as [
  (typeof found)[number],
  (typeof found)[number],
  (typeof found)[number],
];

for (const [line, text] of tokenText.split("\n").entries()) {
  for (const [, name, value] of text.matchAll(DECLARATION)) {
    const px = pxOf(name);
    if (
      (WIDTH_NAME.test(name) && px !== null && fractional(px)) ||
      SHORTHAND.test(value)
    ) {
      tokenRule.hits.push(`${TOKENS}:${line + 1}: ${text.trim()}`);
    }
  }
}

const listed =
  await Bun.$`git ls-files --cached --others --exclude-standard -- ${PLACES}`
    .cwd(ROOT)
    .quiet();
const files = listed.stdout
  .toString()
  .split("\n")
  .filter(
    (file) =>
      SOURCE.test(file) && !GENERATED.has(file) && !file.includes("/vendor/")
  );

const texts = await Promise.all(
  files.map(async (file) => [file, await Bun.file(resolve(ROOT, file)).text()])
);
for (const [file, text] of texts) {
  for (const [line, row] of text.split("\n").entries()) {
    const at = `${file}:${line + 1}: ${row.trim()}`;
    for (const [, , bracket, token, bare] of row.matchAll(CLASS)) {
      const bad =
        (bracket !== undefined && fractionalWidth(bracket)) ||
        (token !== undefined && fractionalWidth(`var(${token})`)) ||
        (bare !== undefined && fractional(Number(bare)));
      if (bad) {
        classRule.hits.push(at);
        break;
      }
    }
    for (const [, , , value] of row.matchAll(CSS_DECLARATION)) {
      if (fractionalWidth(value)) {
        cssRule.hits.push(at);
        break;
      }
    }
  }
}

let count = 0;
for (const { rule, hits } of found) {
  if (hits.length > 0) {
    count += hits.length;
    console.log(`${rule}:\n${hits.map((hit) => `  ${hit}`).join("\n")}`);
  }
}
if (count > 0) {
  console.log(
    `\n${count} fractional border width(s). A browser snaps a border's width to whole device pixels (1.5px draws 1px on a 1× and a 3× screen): draw a fractional stroke as an inset ring, \`inset-ring-(length:--x) inset-ring-<colour>\` (CanvasGrip.svelte, DecisionNode.svelte), or an SVG stroke.`
  );
  process.exit(1);
}
console.log(
  `border-width: ${files.length} file(s) and ${values.size} token(s), every border and outline at a whole px`
);
