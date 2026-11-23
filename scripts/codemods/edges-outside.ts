/**
 * Moves every box's edge outside it (owner's pick, 2026-11-23, from Josh
 * Puckett's "default to outside borders"): an all-sides border becomes a
 * ring, a 1px box-shadow drawn outside the box, in the same colour and
 * under the same variants. A divider (a border on one side) stays a border,
 * as does a dashed or dotted edge, which a ring cannot draw, and a string
 * that clears a border (`border-none`, a bare button's reset).
 *
 * It works on each class string by itself: a string that sets an all-sides
 * width and no side width has its width and colours moved to rings. In a
 * file where that happened and no side border is written anywhere, a string
 * that only sets an edge colour (a variant's) moves with it.
 *
 *   bun scripts/codemods/edges-outside.ts          (writes)
 *   bun scripts/codemods/edges-outside.ts --dry    (counts only)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { Glob } from "bun";

const ROOTS = ["apps/dashboard/src", "packages"];
const SKIP = /node_modules|\/dist\/|\.generated\./u;
const dry = process.argv.includes("--dry");

/** A class string: the text between one pair of quotes or backticks. */
const STRING = /(["'`])((?:(?!\1)[^\\\n]|\\.)*)\1/gu;
/** A variant prefix and its colon, or nothing. */
const PREFIX = String.raw`((?:[^\s"'\x60]*:)?)`;
const EDGE = String.raw`(?<=^|\s)`;
const END = String.raw`(?=$|\s)`;

const WIDTH = new RegExp(`${EDGE}${PREFIX}border(-2)?${END}`, "gu");
const COLOUR = new RegExp(
  `${EDGE}${PREFIX}border-((?:ui|ui-2|ui-3|tx|tx-2|tx-3|bg|bg-2|accent|on-accent|transparent|current|red|orange|yellow|green|cyan|blue|purple|magenta)(?:/\\d+)?|\\(--[\\w-]+\\))${END}`,
  "gu"
);
const SIDE = /(?<=^|[\s:])border-(?:[tblrxyse]|block|inline)(?:-\d+)?(?=$|\s)/u;
const STYLED = /(?<=^|[\s:])border-(?:dashed|dotted|double)(?=$|\s)/u;
/** A string that clears a border (a bare button's reset) draws no edge. */
const CLEARS = /(?<=^|[\s:])border-(?:0|none)(?=$|\s)/u;

const toRings = (classes: string) =>
  classes
    .replace(WIDTH, (_, prefix: string, two = "") => `${prefix}ring${two}`)
    .replace(
      COLOUR,
      (_, prefix: string, colour: string) => `${prefix}ring-${colour}`
    );

let files = 0;
let strings = 0;
for (const root of ROOTS) {
  for (const path of new Glob(`${root}/**/*.{svelte,ts}`).scanSync(".")) {
    if (SKIP.test(path)) {
      continue;
    }
    const before = readFileSync(path, "utf8");
    let moved = false;
    let text = before.replace(STRING, (whole, quote: string, body: string) => {
      WIDTH.lastIndex = 0;
      if (
        !WIDTH.test(body) ||
        SIDE.test(body) ||
        STYLED.test(body) ||
        CLEARS.test(body)
      ) {
        return whole;
      }
      moved = true;
      strings += 1;
      return `${quote}${toRings(body)}${quote}`;
    });
    if (moved && !SIDE.test(text)) {
      text = text.replace(STRING, (whole, quote: string, body: string) => {
        COLOUR.lastIndex = 0;
        if (!COLOUR.test(body) || STYLED.test(body) || CLEARS.test(body)) {
          return whole;
        }
        strings += 1;
        return `${quote}${toRings(body)}${quote}`;
      });
    }
    if (text !== before) {
      files += 1;
      if (!dry) {
        writeFileSync(path, text);
      }
    }
  }
}
console.log(
  `edges-outside: ${strings} class strings in ${files} files${dry ? " (dry)" : ""}`
);
