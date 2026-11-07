/**
 * `bun scripts/narration-check.ts` (part of `bun run check`): DESIGN.md's
 * Screen Is Not The Record Rule, the part of it a check can read. Its named
 * symptom is narration: a screen that describes a thing under labelled
 * sections instead of showing it ("What it does", "How it shows", "Where it
 * applies", "Knows", "Decides", "Runs on", "About", "Purpose").
 *
 * It reads every string the product spells: each words module under
 * packages/core/src/words, and each script and Svelte page under
 * apps/dashboard/src (states files, tests and fixtures left out). A string
 * is a narrating label when it stands as a label (an upper-case first
 * letter, at most {@link MAX_WORDS} words, no closing `.`, `?`, `!` or `…`)
 * and either:
 *
 * - is one of the section labels in {@link SECTIONS}; or
 * - asks what a thing is or does, in its own words: What, How, Where or Why
 *   over the thing (it, he, she, they, the …) and one of the verbs a
 *   description runs on ({@link VERBS}: does, knows, decides, runs, applies,
 *   shows, reaches, can, is, `'s`, …).
 *
 * A label with a colon is read up to it too ("What it does: Reads …"). What
 * stands no section on the screen is not read: an `aria-*` attribute and a
 * words entry whose doc says it is for a screen reader or VoiceOver (said,
 * not shown), and a placeholder (it asks for what to type).
 *
 * What it can't read: a sentence explaining how the screen or the thing
 * behaves (a hint, a note, a lede) reads like any other sentence; a screen
 * laid out as its record (every field a label and a control, in the
 * model's order, all at once) is a layout, not a string. Those are judged
 * by the design run and its review against DESIGN.md.
 *
 * The labels standing when the rule came in (2026-11-07) are counted per
 * file and label in scripts/narration.baseline.json: each is a screen for
 * a design run, so their number may fall, never rise. A count that fell is
 * said, not failed; `--write-baseline` takes it out.
 *
 *   bun scripts/narration-check.ts                   fails on a new narrating label
 *   bun scripts/narration-check.ts --write-baseline  after a screen stops narrating
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import { ROOT, repoFiles } from "./lib/repo-files";

const BASELINE = join(ROOT, "scripts/narration.baseline.json");
const WORDS = "packages/core/src/words/";
const DASHBOARD = "apps/dashboard";
/** States files draw a component for review, and tests and fixtures feed it: none is the product's own text. */
const NOT_PRODUCT =
  /\.(stories|test|spec|fixtures)\.[cm]?[jt]sx?$|\/fixtures\//u;
/** A label is short; past this it is a sentence. */
const MAX_WORDS = 7;
/** A sentence's end, which a label never has. */
const SENTENCE_END = /[.?!…]$/u;
/** Section labels that describe the thing they head. */
const SECTIONS =
  /^(?:About|Purpose|Overview|Knows|Decides|Does|Runs on|How it works)$/u;
/** The verbs a description of a thing runs on. */
const VERBS = [
  "does",
  "do",
  "knows",
  "decides",
  "is",
  "are",
  "runs",
  "works",
  "applies",
  "shows",
  "reaches",
  "can",
  "means",
  "covers",
  "handles",
  "opens",
  "uses",
  "needs",
  "holds",
  "keeps",
  "watches",
  "leads",
].join("|");
const THING = "(?:it|he|she|they|the [a-z-]+(?: [a-z-]+)?)";
const ASKS = new RegExp(
  `^(?:What|How|Where|Why) ${THING}(?:['’]s\\b| (?:${VERBS})\\b)`,
  "u"
);
/** A words entry a screen reader says, by its doc. */
const SAID_ONLY = /screen reader|VoiceOver/iu;
/** A words entry that asks for what to type, by its name. */
const PLACEHOLDER = /placeholder$/iu;
const SPACES = /\s+/gu;
const SPACE = /\s+/u;
/** The hole a template's text ends on, which leaves nothing to read. */
const LAST_HOLE = /…$/u;
const SOURCE = /\.(ts|svelte)$/u;

/** A template's text, its holes read as `…`. */
const withHoles = (parts: string[]): string =>
  parts.join("…").replace(LAST_HOLE, "");

const narrates = (label: string): boolean =>
  !SENTENCE_END.test(label) &&
  label.split(SPACE).length <= MAX_WORDS &&
  (SECTIONS.test(label) || ASKS.test(label));

/** Each file's narrating labels, counted. */
const found = new Map<string, Map<string, number>>();
const keep = (file: string, raw: string): void => {
  const text = raw.replace(SPACES, " ").trim();
  const label = [text, text.split(":")[0].trim()].find(narrates);
  if (label === undefined) {
    return;
  }
  const counts = found.get(file) ?? new Map<string, number>();
  counts.set(label, (counts.get(label) ?? 0) + 1);
  found.set(file, counts);
};

/** The text one node of a script spells, if it spells any. */
const scriptText = (node: ts.Node): string | null => {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }
  if (ts.isTemplateExpression(node)) {
    return withHoles([
      node.head.text,
      ...node.templateSpans.map((span) => span.literal.text),
    ]);
  }
  return null;
};

/** A script's strings, a template's text between its holes read as `…`. */
function readScript(text: string, file: string): void {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const saidOnly = (node: ts.Node): boolean => {
    for (let at: ts.Node | undefined = node; at; at = at.parent) {
      if (ts.isPropertyAssignment(at)) {
        if (PLACEHOLDER.test(at.name.getText(source))) {
          return true;
        }
        const docs = ts.getJSDocCommentsAndTags(at).map((doc) => doc.getText());
        return docs.some((doc) => SAID_ONLY.test(doc));
      }
    }
    return false;
  };
  const visit = (node: ts.Node): void => {
    if (
      ts.isImportDeclaration(node) ||
      ts.isExportDeclaration(node) ||
      ts.isLiteralTypeNode(node)
    ) {
      return;
    }
    const spelled = scriptText(node);
    if (spelled !== null) {
      if (!saidOnly(node)) {
        keep(file, spelled);
      }
      if (!ts.isTemplateExpression(node)) {
        return;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}

// Typed here, not as `typeof import("svelte/compiler")`, for the reason
// probe-words-check.ts gives.
const { parse } = (await import(
  Bun.resolveSync("svelte/compiler", join(ROOT, DASHBOARD))
)) as {
  parse: (
    source: string,
    options: { filename: string; modern: true }
  ) => unknown;
};

/** An attribute only a screen reader says, or one that asks for what to type. */
const unshown = (record: Record<string, unknown>): boolean =>
  record.type === "Attribute" &&
  typeof record.name === "string" &&
  (record.name.startsWith("aria-") || record.name === "placeholder");

/** The text one node of a Svelte page's tree spells, if it spells any. */
const svelteText = (record: Record<string, unknown>): string | null => {
  if (record.type === "Text" && typeof record.data === "string") {
    return record.data;
  }
  if (record.type === "Literal" && typeof record.value === "string") {
    return record.value;
  }
  if (record.type === "TemplateLiteral") {
    const quasis = record.quasis as {
      value: { cooked?: string; raw: string };
    }[];
    return withHoles(quasis.map((q) => q.value.cooked ?? q.value.raw));
  }
  return null;
};

/** A Svelte page's text, its attributes' text but `aria-*` and `placeholder`, and its scripts' and expressions' strings. */
function readSvelte(text: string, file: string): void {
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (node === null || typeof node !== "object") {
      return;
    }
    const record = node as Record<string, unknown>;
    if (unshown(record)) {
      return;
    }
    const spelled = svelteText(record);
    if (spelled !== null) {
      keep(file, spelled);
    }
    if (record.type === "TemplateLiteral") {
      walk(record.expressions);
      return;
    }
    for (const [key, value] of Object.entries(record)) {
      // The style sheet is no words; a node's parent link would walk back up.
      if (key !== "css" && key !== "parent" && key !== "metadata") {
        walk(value);
      }
    }
  };
  walk(parse(text, { filename: file, modern: true }));
}

const files = repoFiles([WORDS, `${DASHBOARD}/src/`]).filter(
  (file) => SOURCE.test(file) && !NOT_PRODUCT.test(file)
);
for (const file of files) {
  const text = readFileSync(join(ROOT, file), "utf8");
  if (file.endsWith(".svelte")) {
    readSvelte(text, file);
  } else {
    readScript(text, file);
  }
}

type Counts = Record<string, Record<string, number>>;
const now: Counts = Object.fromEntries(
  [...found.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([file, counts]) => [
      file,
      Object.fromEntries(
        [...counts.entries()].sort(([a], [b]) => a.localeCompare(b))
      ),
    ])
);

if (process.argv.includes("--write-baseline")) {
  writeFileSync(BASELINE, `${JSON.stringify(now, null, 2)}\n`);
  const total = Object.values(now).reduce(
    (sum, counts) => sum + Object.values(counts).reduce((a, b) => a + b, 0),
    0
  );
  console.log(
    `narration: ${total} narrating labels written to ${relative(ROOT, BASELINE)}`
  );
  process.exit(0);
}

const baseline = JSON.parse(readFileSync(BASELINE, "utf8")) as Counts;
const faults: string[] = [];
const fell: string[] = [];
for (const [file, counts] of Object.entries(now)) {
  for (const [label, count] of Object.entries(counts)) {
    const allowed = baseline[file]?.[label] ?? 0;
    if (count > allowed) {
      faults.push(
        `  ${file}: "${label}"${count > 1 ? ` (${count}, ${allowed} allowed)` : ""}`
      );
    }
  }
}
for (const [file, counts] of Object.entries(baseline)) {
  for (const [label, count] of Object.entries(counts)) {
    if ((now[file]?.[label] ?? 0) < count) {
      fell.push(`  ${file}: "${label}"`);
    }
  }
}
if (fell.length > 0) {
  console.log(
    `narration: these stopped narrating; take them out of the baseline with \`bun scripts/narration-check.ts --write-baseline\`:\n${fell.join("\n")}`
  );
}
if (faults.length > 0) {
  console.error(
    `narration: a label that describes the thing it heads (DESIGN.md, The Screen Is Not The Record Rule). Show the thing itself, in the house's components, so the part needs no section saying what it is or does:\n${faults.join("\n")}`
  );
  process.exit(1);
}
console.log(
  `narration: no new narrating label (${files.length} files read, ${Object.values(baseline).reduce((sum, c) => sum + Object.keys(c).length, 0)} standing in the baseline)`
);
