/**
 * Part of `bun run check`: every decision page a probe writes is one the hub
 * builds. A probe's program met the hub's own check (hub decision-program.ts
 * `buildProgram`, with the built-in kinds core `KIND_SEED` seeds) only on a
 * host run, so a program the hub refuses failed there, hours later, as a
 * leg that never opened its page.
 *
 * Over scripts/probe-kit/ and scripts/scratch-fleet.ts, a program is:
 *
 * 1. a string or template literal that starts `root = Decisions(`; or
 * 2. an array of such literals, its first `root = Decisions(`, joined
 *    (`[...].join("\n")`).
 *
 * A template's substitution inside one of the program's strings (an
 * artifact's id, a picture's file, a title's words) is read as a word of its
 * own, and every Canvas and Preview id resolves. One outside them is the
 * program's own code (a list of cards, a flag), which no reading of the
 * file can fill in: such a program is built by code, and its file exports
 * `probePrograms` (`() => string[]`), its programs as it builds them, which
 * this imports and builds; a file that builds one and exports none is
 * named. Every `program:` a probe sends as a literal must be one of these,
 * so none goes unread. A revision (statements merged into a page,
 * no `root`) is the hub's merge's, read when the page it changes is.
 *
 * Prints `file:line: why` for each, and exits 1 on any.
 *
 *   bun scripts/probe-programs-check.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { KIND_SEED } from "../packages/core/src/decides";
import { buildProgram } from "../packages/hub/src/decision-program";

// Read at run time beyond its imports; check.ts keys the check on them.
export const checkReads = ["scripts/probe-kit/", "scripts/scratch-fleet.ts"];

const ROOT = join(import.meta.dir, "..");
const PROGRAM = /^\s*root\s*=\s*Decisions\(/u;
/** What a quoted substitution reads as: one word, a valid id and file name. */
const WORD = "probe-word";
/** A program's quote, not one escaped. */
const QUOTE = /(?<!\\)"/gu;

const listed =
  await Bun.$`git ls-files --cached --others --exclude-standard -- scripts/probe-kit scripts/scratch-fleet.ts`
    .cwd(ROOT)
    .quiet();
const files = listed.stdout
  .toString()
  .split("\n")
  .filter(
    (path) =>
      path.endsWith(".ts") &&
      !path.includes("node_modules/") &&
      !path.includes("/fixtures/")
  );

interface Found {
  at: string;
  program: string;
}

const found: Found[] = [];
const faults: string[] = [];
/** Each file with a program built by code, and the first literal of one. */
const built = new Map<string, string>();

/** `node`'s text as a program, its quoted substitutions as words; null with why when one stands outside quotes. */
const textOf = (
  node:
    ts.TemplateExpression | ts.NoSubstitutionTemplateLiteral | ts.StringLiteral
): { text: string } | { why: string } => {
  if (!ts.isTemplateExpression(node)) {
    return { text: node.text };
  }
  let { text } = node.head;
  for (const span of node.templateSpans) {
    // Inside a string of the program: an odd count of quotes before it.
    const quotes = text.match(QUOTE)?.length ?? 0;
    if (quotes % 2 === 0) {
      return {
        why: `\${${span.expression.getText()}} stands outside quotes: this check reads a program's substitutions only as quoted words`,
      };
    }
    text += WORD + span.literal.text;
  }
  return { text };
};

const isLiteral = (
  node: ts.Node
): node is
  ts.TemplateExpression | ts.NoSubstitutionTemplateLiteral | ts.StringLiteral =>
  ts.isTemplateExpression(node) ||
  ts.isNoSubstitutionTemplateLiteral(node) ||
  ts.isStringLiteral(node);

/** The literal's text as it starts, for telling a program from other words. */
const headOf = (node: ts.Node): string | null => {
  if (ts.isTemplateExpression(node)) {
    return node.head.text;
  }
  if (ts.isNoSubstitutionTemplateLiteral(node) || ts.isStringLiteral(node)) {
    return node.text;
  }
  return null;
};

for (const file of files) {
  const source = ts.createSourceFile(
    file,
    readFileSync(join(ROOT, file), "utf8"),
    ts.ScriptTarget.Latest,
    true
  );
  const at = (node: ts.Node) =>
    `${file}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1}`;
  /** Literals already read as part of a joined array. */
  const taken = new Set<ts.Node>();
  const take = (node: ts.Node, text: { text: string } | { why: string }) => {
    if ("why" in text) {
      if (!built.has(file)) {
        built.set(file, `${at(node)}: ${text.why}`);
      }
    } else {
      found.push({ at: at(node), program: text.text });
    }
  };
  const visit = (node: ts.Node): void => {
    // 2. `[ "root = Decisions(…", "…" ].join("\n")`
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === "join" &&
      ts.isArrayLiteralExpression(node.expression.expression)
    ) {
      const parts = node.expression.expression.elements;
      const [first] = parts;
      if (first && PROGRAM.test(headOf(first) ?? "")) {
        const [separator] = node.arguments;
        const texts = parts.map((part) =>
          isLiteral(part)
            ? textOf(part)
            : {
                why: `${part.getText()} is no literal: this check reads a joined program's parts only as literals`,
              }
        );
        for (const part of parts) {
          taken.add(part);
        }
        const unread = texts.find((one) => "why" in one);
        take(
          node,
          unread ??
            (separator &&
            isLiteral(separator) &&
            !ts.isTemplateExpression(separator)
              ? {
                  text: texts
                    .map((one) => (one as { text: string }).text)
                    .join(separator.text),
                }
              : { why: "its parts are joined by no literal" })
        );
      }
    }
    // 1. One literal.
    if (
      isLiteral(node) &&
      !taken.has(node) &&
      PROGRAM.test(headOf(node) ?? "")
    ) {
      take(node, textOf(node));
    }
    // Every literal a probe sends as a program is one this reads.
    if (
      ts.isPropertyAssignment(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === "program" &&
      isLiteral(node.initializer) &&
      !PROGRAM.test(headOf(node.initializer) ?? "")
    ) {
      faults.push(
        `${at(node)}: a program sent as a literal starts \`root = Decisions(\`, or this check can't read it`
      );
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}

// A program built by code, as its file builds it.
for (const [file, why] of built) {
  const module = (await import(join(ROOT, file))) as {
    probePrograms?: () => string[];
  };
  if (typeof module.probePrograms !== "function") {
    faults.push(
      `${why}, and ${file} exports no probePrograms (() => string[]) to build its programs with`
    );
    continue;
  }
  for (const [at, program] of module.probePrograms().entries()) {
    found.push({ at: `${file} probePrograms()[${at}]`, program });
  }
}

/** A picture's bytes: one PNG pixel's worth stands in for any file. */
const PIXEL = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
for (const { at, program } of found) {
  try {
    await buildProgram(
      program,
      () => Promise.resolve({ bytes: PIXEL }),
      (id) => id,
      KIND_SEED
    );
  } catch (error) {
    faults.push(
      `${at}: the hub refuses it: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

for (const fault of faults) {
  console.error(fault);
}
if (faults.length > 0) {
  console.error(
    `probe-programs: ${faults.length} of ${found.length + faults.length} probe programs fail the hub's build`
  );
  process.exit(1);
}
console.log(
  `probe-programs: every probe's decision page (${found.length}) builds as the hub builds it, with the built-in kinds`
);
