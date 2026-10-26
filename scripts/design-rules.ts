/**
 * Writes design/RULES.md: every named rule of DESIGN.md ("**The … Rule.**"
 * opening a paragraph or a list item), in DESIGN.md's order, its text copied
 * verbatim, with the heading it sits under and its line. `--check` writes
 * nothing and fails when the file differs from what DESIGN.md makes now.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const SOURCE = join(ROOT, "DESIGN.md");
const TARGET = join(ROOT, "design", "RULES.md");

const RULE = /^(- )?\*\*(The [^*]+? Rule)\.\*\*/u;
const HEADING = /^#{1,6} /u;
const LIST_ITEM = /^\s*- /u;

/** A paragraph from `start`: its lines, then the list it introduces with a colon. */
const paragraph = (lines: string[], start: number): string[] => {
  const text: string[] = [];
  let at = start;
  while (at < lines.length && lines[at].trim() !== "") {
    text.push(lines[at]);
    at += 1;
  }
  if (!text.at(-1)?.trimEnd().endsWith(":")) {
    return text;
  }
  while (at < lines.length && lines[at].trim() === "") {
    at += 1;
  }
  while (at < lines.length && LIST_ITEM.test(lines[at])) {
    text.push(lines[at]);
    at += 1;
  }
  return text;
};

const build = (source: string): string => {
  const lines = source.split("\n");
  const out = [
    "# CawCo named design rules",
    "",
    "Generated from DESIGN.md by `bun run design:rules`; do not edit. DESIGN.md wins where they differ.",
    "",
  ];
  let heading = "";
  let headingLine = 0;
  let inFence = false;
  for (const [index, line] of lines.entries()) {
    if (line.startsWith("```")) {
      inFence = !inFence;
    }
    if (inFence) {
      continue;
    }
    if (HEADING.test(line)) {
      heading = line.replace(HEADING, "").trim();
      headingLine = index + 1;
      continue;
    }
    const match = RULE.exec(line);
    if (!match) {
      continue;
    }
    const text = match[1] ? [line] : paragraph(lines, index);
    out.push(
      `## ${match[2]}`,
      "",
      `Under "${heading}" (DESIGN.md line ${headingLine}); rule at line ${index + 1}.`,
      "",
      ...text,
      ""
    );
  }
  return out.join("\n");
};

const wanted = build(readFileSync(SOURCE, "utf8"));

if (process.argv.includes("--check")) {
  let current = "";
  try {
    current = readFileSync(TARGET, "utf8");
  } catch {
    // Missing counts as stale.
  }
  if (current !== wanted) {
    console.error(
      "design/RULES.md is stale against DESIGN.md: run `bun run design:rules`"
    );
    process.exit(1);
  }
  console.log("design/RULES.md matches DESIGN.md");
} else {
  writeFileSync(TARGET, wanted);
  console.log(`wrote ${TARGET}`);
}
