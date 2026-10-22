/**
 * Part of `bun run lint`: the probe kit finds the product by the product's
 * own words, never a copy of them. Every string a module under
 * packages/core/src/words exports is a word the product renders from there
 * (and the app, through Words.generated.swift); a probe-kit string literal,
 * template without holes or regular expression that spells one of them
 * instead of importing it fails here, naming the export to import. A copy
 * goes stale silently when the word changes: the locator then finds
 * nothing and the failure reads as a missing element after its timeout.
 *
 * Words shorter than MIN_LENGTH or of one word are left out: "Close",
 * "Done", "Share" are everyone's, not a sentence a probe could only have
 * copied. A regular expression counts when, its anchors and the escapes of
 * a literal taken off, it is the word whole.
 *
 * An imported word read inside a function Playwright runs in the page
 * (`evaluate`, `waitForFunction`, …; IN_PAGE) fails too: the page has none
 * of the probe's scope, so the read throws there, and a `.catch` that reads
 * a throw as "not found" turns it into a false failure.
 *
 *   bun scripts/probe-words-check.ts
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";

const ROOT = join(import.meta.dir, "..");
const WORDS = join(ROOT, "packages/core/src/words");
const KIT = join(ROOT, "scripts/probe-kit");
/** Folders of the kit that hold no probe code: pictures and fixtures. */
const SKIP = new Set(["baselines", "fixtures"]);
/** A word shorter than this is no sentence only a copy would spell. */
const MIN_LENGTH = 8;
/** A word of two or more words. */
const SENTENCE = /\p{L}\s+\p{L}/u;

/** Each word, by every export path that holds it ("accountsWords.key.sent"). */
const homes = new Map<string, string[]>();

function collect(value: unknown, path: string): void {
  if (typeof value === "string") {
    if (value.length >= MIN_LENGTH && SENTENCE.test(value)) {
      homes.set(value, [...(homes.get(value) ?? []), path]);
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      collect(item, `${path}[${index}]`);
    }
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      collect(item, `${path}.${key}`);
    }
  }
}

for (const file of readdirSync(WORDS).filter((name) => name.endsWith(".ts"))) {
  // biome-ignore lint/performance/noAwaitInLoops: each module once, in order
  const module = (await import(join(WORDS, file))) as Record<string, unknown>;
  for (const [name, value] of Object.entries(module)) {
    collect(value, `${name} (core words/${file})`);
  }
}

function kitFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return SKIP.has(entry.name) ? [] : kitFiles(path);
    }
    return entry.name.endsWith(".ts") ? [path] : [];
  });
}

/** A pattern's anchors, at its start and its end. */
const ANCHORS = /^\^|\$$/g;
/** An escaped character, which matches itself. */
const ESCAPED = /\\([.*+?^${}()|[\]\\/-])/g;
/** What makes a pattern more than words. */
const SPECIAL = /[.*+?^${}()|[\]\\]/;

/** A regular expression's source as the words it matches whole, if it is only words. */
function regexWords(source: string): string | null {
  const bare = source.replace(ANCHORS, "");
  // Anything still special once the escapes are gone is a pattern, not a copied word.
  return SPECIAL.test(bare.replace(ESCAPED, ""))
    ? null
    : bare.replace(ESCAPED, "$1");
}

/**
 * Playwright's calls whose function runs in the page, not in the probe:
 * nothing of the probe module's scope reaches it, so an imported word
 * read there is undefined in the page, and the read throws.
 */
const IN_PAGE = new Set([
  "$eval",
  "$$eval",
  "addInitScript",
  "evaluate",
  "evaluateAll",
  "evaluateHandle",
  "waitForFunction",
]);
/** The words modules, as a probe imports them. */
const WORDS_IMPORT = /packages\/core\/src\/words\//;

/** The names a file imports from a core words module. */
function wordImports(source: ts.SourceFile): Set<string> {
  const names = new Set<string>();
  for (const statement of source.statements) {
    if (
      ts.isImportDeclaration(statement) &&
      ts.isStringLiteral(statement.moduleSpecifier) &&
      WORDS_IMPORT.test(statement.moduleSpecifier.text) &&
      statement.importClause?.namedBindings &&
      ts.isNamedImports(statement.importClause.namedBindings)
    ) {
      for (const element of statement.importClause.namedBindings.elements) {
        names.add(element.name.text);
      }
    }
  }
  return names;
}

/** Each imported word `fn`, a function run in the page, reads: the probe's scope, which isn't there. */
function readInPage(fn: ts.Node, imported: Set<string>): ts.Identifier[] {
  const read: ts.Identifier[] = [];
  const look = (node: ts.Node): void => {
    if (ts.isIdentifier(node) && imported.has(node.text)) {
      read.push(node);
    }
    ts.forEachChild(node, look);
  };
  look(fn);
  return read;
}

const found: string[] = [];
for (const file of kitFiles(KIT)) {
  const text = readFileSync(file, "utf8");
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const imported = wordImports(source);
  const visit = (node: ts.Node): void => {
    if (
      imported.size > 0 &&
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      IN_PAGE.has(node.expression.name.text)
    ) {
      const [fn] = node.arguments;
      if (fn && (ts.isArrowFunction(fn) || ts.isFunctionExpression(fn))) {
        for (const word of readInPage(fn, imported)) {
          const { line } = source.getLineAndCharacterOfPosition(
            word.getStart()
          );
          found.push(
            `  ${relative(ROOT, file)}:${line + 1}: ${word.text} is read inside ${node.expression.name.text}(), which runs in the page where it is undefined: pass it in as the call's argument`
          );
        }
      }
    }
    let spelled: string | null = null;
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      spelled = node.text;
    } else if (ts.isRegularExpressionLiteral(node)) {
      const literal = node.text;
      spelled = regexWords(literal.slice(1, literal.lastIndexOf("/")));
    }
    // The shared words first: a feature's entry for one of them only
    // carries it under its own name (words/common.ts).
    const home =
      spelled === null
        ? undefined
        : homes
            .get(spelled)
            ?.toSorted(
              (a, b) =>
                Number(b.includes("common.ts")) -
                Number(a.includes("common.ts"))
            );
    if (home) {
      const { line } = source.getLineAndCharacterOfPosition(node.getStart());
      found.push(
        `  ${relative(ROOT, file)}:${line + 1}: “${spelled}” is ${home.join(", or ")}: import it`
      );
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}

if (found.length > 0) {
  console.error(
    `probe-words: ${found.length} finding(s): a probe-kit literal that copies a word the product renders from packages/core/src/words (import the word instead; scripts/probe-kit/words.ts has literal, startsWith, exactly), or an imported word read in the page:`
  );
  for (const line of found) {
    console.error(line);
  }
  process.exit(1);
}
console.log(
  `probe-words: ${homes.size} core words, none copied in scripts/probe-kit`
);
