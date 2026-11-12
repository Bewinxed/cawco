/**
 * `bun scripts/design-budget-check.ts` (part of `bun run check`): DESIGN.md
 * holds the design judgements that span screens and no check can hold, short
 * enough that every UI session reads it whole. Its body (everything after the
 * frontmatter's closing `---`) stays at or under {@link MAX_WORDS} words,
 * counted as `wc -w` counts them, and no paragraph runs past
 * {@link MAX_PARAGRAPH} characters. A paragraph is a run of non-blank lines;
 * each list item is a paragraph of its own; a fenced code block is skipped.
 * A decision about one screen goes in that screen's surface brief
 * (apps/dashboard/.impeccable/surfaces/, `impeccable surface-brief write`).
 * Exits 1 naming each paragraph over and the body's count.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const MAX_WORDS = 1100;
const MAX_PARAGRAPH = 800;
const LIST_ITEM = /^\s*(?:[-*+]|\d+\.)\s/u;
const WHERE =
  "DESIGN.md holds only design judgements that span screens: a rule a tool can check becomes a check, a token's meaning stays in its name, and a decision about one screen goes in that screen's surface brief (apps/dashboard/.impeccable/surfaces/, `impeccable surface-brief write <file> <body>`).";

const lines = readFileSync(join(ROOT, "DESIGN.md"), "utf8").split("\n");

/** The body's first line: past the frontmatter when the file opens with one. */
const bodyStart = (): number => {
  if (lines[0]?.trim() !== "---") {
    return 0;
  }
  const close = lines.findIndex((line, at) => at > 0 && line.trim() === "---");
  if (close === -1) {
    console.error("design-budget-check: DESIGN.md's frontmatter never closes.");
    process.exit(2);
  }
  return close + 1;
};

const start = bodyStart();
const body = lines.slice(start);
const words = body.join("\n").split(/\s+/u).filter(Boolean).length;

interface Paragraph {
  line: number;
  text: string;
}
const paragraphs: Paragraph[] = [];
let open: Paragraph | null = null;
let fenced = false;
for (const [index, line] of body.entries()) {
  const at = start + index + 1;
  if (line.trimStart().startsWith("```")) {
    fenced = !fenced;
    open = null;
    continue;
  }
  if (fenced || line.trim() === "") {
    open = null;
    continue;
  }
  if (open === null || LIST_ITEM.test(line)) {
    open = { line: at, text: line.trim() };
    paragraphs.push(open);
  } else {
    open.text += ` ${line.trim()}`;
  }
}
const long = paragraphs.filter((p) => p.text.length > MAX_PARAGRAPH);

const faults: string[] = [];
if (words > MAX_WORDS) {
  faults.push(
    `DESIGN.md's body is ${words} words, over its ${MAX_WORDS}-word budget.`
  );
}
for (const p of long) {
  faults.push(
    `DESIGN.md:${p.line}: a paragraph of ${p.text.length} characters, over ${MAX_PARAGRAPH}: "${p.text.slice(0, 60)}…"`
  );
}
if (faults.length > 0) {
  console.error(`${faults.join("\n")}\n${WHERE}`);
  process.exit(1);
}
console.log(
  `design budget: DESIGN.md's body is ${words} of ${MAX_WORDS} words, its longest paragraph ${Math.max(0, ...paragraphs.map((p) => p.text.length))} of ${MAX_PARAGRAPH} characters`
);
