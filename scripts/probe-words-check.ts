/**
 * Part of `bun run check`: the probe kit finds the product by the product's
 * own words, never a copy of them. A copy goes stale silently when the word
 * changes: the locator then finds nothing, and the failure reads as a
 * missing element after its timeout. Three rules:
 *
 * 1. A core word, spelled. Every string a module under
 *    packages/core/src/words exports is a word the product renders from
 *    there (and the app, through Words.generated.swift). A probe-kit string
 *    literal, template without holes or regular expression that spells one
 *    whole fails, naming the export to import.
 *
 * 2. A product string, matched. A probe matches the product's words in a
 *    few places only: the argument of a matcher (`includes`, `startsWith`,
 *    `getByText`, `toContain`, …: MATCH_CALLS), a locator's option
 *    (`{ name }`, `{ hasText }` given to `getByRole`, `filter`, …), an
 *    operand of `===`/`!==`, and any regular expression. A literal there
 *    (or a template's text between its holes) is the product's when the
 *    product's own source spells it: a string, a template's text or a
 *    Svelte page's text or attribute anywhere under PRODUCT, outside core's
 *    words, contains it. It fails: the phrase belongs in a core words
 *    module, rendered from there and imported here. A spec's own text (a
 *    check's name, its detail, a fixture's value) sits in none of those
 *    places, or spells nothing the product does, so it passes.
 *    The copies the kit held when this rule came in stand in
 *    scripts/probe-words.baseline.json, counted per file and phrase: their
 *    number may fall, never rise. A count that fell is said, not failed:
 *    a commit elsewhere that changes the product's text or a spec must not
 *    break every other branch's lint. `--write-baseline` takes it out, so
 *    the phrase can't come back unseen.
 *
 * 3. An imported word read inside a function Playwright runs in the page
 *    (`evaluate`, `waitForFunction`, …; IN_PAGE): the page has none of the
 *    probe's scope, so the read throws there, and a `.catch` that reads a
 *    throw as "not found" turns it into a false failure.
 *
 * Words shorter than MIN_LENGTH or of one word are left out: "Close",
 * "Done", "Share" are everyone's, not a sentence a probe could only have
 * copied. A regular expression counts when, its anchors and the escapes of
 * a literal taken off, it is only words.
 *
 *   bun scripts/probe-words-check.ts                   fails on a new copy
 *   bun scripts/probe-words-check.ts --write-baseline  after copies are moved to core
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";

const ROOT = join(import.meta.dir, "..");
const WORDS = join(ROOT, "packages/core/src/words");
const KIT = join(ROOT, "scripts/probe-kit");
const DASHBOARD = join(ROOT, "apps/dashboard");
/** Where the product's own words are spelled: what renders, logs or answers. */
const PRODUCT = [
  "apps/dashboard/src",
  "apps/cawrier/src",
  "packages/agent/src",
  "packages/auth/src",
  "packages/cli/src",
  "packages/core/src",
  "packages/hub/src",
  "packages/sessiond/src",
].map((dir) => join(ROOT, dir));
/** Folders that hold no probe or product code: pictures, fixtures, and core's words (rule 1's). */
const SKIP = new Set(["baselines", "fixtures", "node_modules", WORDS]);
/** States files draw a component for review; the product never renders their text. */
const NOT_PRODUCT = /\.(stories|test|spec)\.[cm]?[jt]sx?$/;
/** A word shorter than this is no sentence only a copy would spell. */
const MIN_LENGTH = 8;
/** A word of two or more words, a sign or a dash between them too ("Configure → Updates"). */
const SENTENCE = /\p{L}[^\p{L}]*\s[^\p{L}]*\p{L}/u;
/** Runs of white space, as a page lays them out: one space. */
const SPACE = /\s+/g;

const isPhrase = (text: string): boolean =>
  text.length >= MIN_LENGTH && SENTENCE.test(text);

/** Each word, by every export path that holds it ("accountsWords.key.sent"). */
const homes = new Map<string, string[]>();

function collect(value: unknown, path: string): void {
  if (typeof value === "string") {
    if (isPhrase(value)) {
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

function filesUnder(dir: string, ends: readonly string[]): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return SKIP.has(entry.name) || SKIP.has(path)
        ? []
        : filesUnder(path, ends);
    }
    return ends.some((end) => entry.name.endsWith(end)) &&
      !NOT_PRODUCT.test(entry.name)
      ? [path]
      : [];
  });
}

/** The product's spelled text, each piece once, with the first file that spells it. */
const spelled = new Map<string, string>();

function keep(text: string, file: string): void {
  const flat = text.replace(SPACE, " ").trim();
  if (isPhrase(flat) && !spelled.has(flat)) {
    spelled.set(flat, relative(ROOT, file));
  }
}

/** A TypeScript module's strings and its templates' text between holes. */
function spelledInScript(text: string, file: string): void {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const visit = (node: ts.Node): void => {
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node)
    ) {
      keep(node.text, file);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}

// Typed here, not as `typeof import("svelte/compiler")`: scripts/ declares no
// svelte, so tsc resolves that import up past the checkout, and a svelte 4
// there (`~/node_modules`) declares `svelte/compiler` ambiently for the whole
// program, over core's svelte 5 (decision-host.ts `generate: "client"`).
const { parse } = (await import(
  Bun.resolveSync("svelte/compiler", DASHBOARD)
)) as {
  parse: (
    source: string,
    options: { filename: string; modern: true }
  ) => unknown;
};

/** The text one node of a Svelte page's tree spells, if it spells any. */
function svelteText(record: Record<string, unknown>): string | null {
  if (record.type === "Text" && typeof record.data === "string") {
    return record.data;
  }
  if (record.type === "Literal" && typeof record.value === "string") {
    return record.value;
  }
  if (record.type === "TemplateElement") {
    const value = record.value as { cooked?: string; raw: string };
    return value.cooked ?? value.raw;
  }
  return null;
}

/** A Svelte page's text, its attributes' text, and its scripts' and expressions' strings. */
function spelledInSvelte(text: string, file: string): void {
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const item of node) {
        walk(item);
      }
      return;
    }
    if (node === null || typeof node !== "object") {
      return;
    }
    const record = node as Record<string, unknown>;
    const said = svelteText(record);
    if (said !== null) {
      keep(said, file);
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

for (const root of PRODUCT) {
  for (const file of filesUnder(root, [".ts", ".svelte"])) {
    const text = readFileSync(file, "utf8");
    if (file.endsWith(".svelte")) {
      spelledInSvelte(text, file);
    } else {
      spelledInScript(text, file);
    }
  }
}
const productText = [...spelled.keys()];

/** The first piece of the product's text that holds `phrase`, and where it is spelled. */
function spelledBy(phrase: string): { file: string; text: string } | null {
  const flat = phrase.replace(SPACE, " ").trim();
  if (!isPhrase(flat)) {
    return null;
  }
  const text = productText.find((piece) => piece.includes(flat));
  return text ? { text, file: spelled.get(text) ?? "" } : null;
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
 * Calls whose arguments a probe matches the product's text with: the
 * string's own, Playwright's locators and assertions, and the kit's
 * pattern helpers (probe-kit/words.ts).
 */
const MATCH_CALLS = new Set([
  "endsWith",
  "exactly",
  "getByAltText",
  "getByLabel",
  "getByPlaceholder",
  "getByText",
  "getByTitle",
  "includes",
  "indexOf",
  "literal",
  "startsWith",
  "toContain",
  "toContainText",
  "toHaveText",
  "RegExp",
]);
/** Calls whose options object carries a locator's text (`{ name }`, `{ hasText }`). */
const LOCATE_CALLS = new Set([
  "filter",
  "getByLabel",
  "getByRole",
  "getByText",
  "locator",
]);
/** A locator option that names the text it finds by. */
const LOCATE_OPTIONS = new Set(["hasNotText", "hasText", "name"]);
const EQUALITY = new Set([
  ts.SyntaxKind.EqualsEqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsEqualsToken,
  ts.SyntaxKind.EqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsToken,
]);

function calleeName(call: ts.CallExpression | ts.NewExpression): string {
  const callee = call.expression;
  if (ts.isPropertyAccessExpression(callee)) {
    return callee.name.text;
  }
  return ts.isIdentifier(callee) ? callee.text : "";
}

/** Whether `node` (a literal, or a template) is text a probe matches the product with. */
function matched(node: ts.Node): boolean {
  let at = node;
  // A literal handed through `?:`, `??`, parentheses or `as` is matched where its result is.
  while (
    ts.isParenthesizedExpression(at.parent) ||
    ts.isAsExpression(at.parent) ||
    (ts.isConditionalExpression(at.parent) && at !== at.parent.condition) ||
    (ts.isBinaryExpression(at.parent) &&
      at.parent.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken)
  ) {
    at = at.parent;
  }
  const { parent } = at;
  if (
    (ts.isCallExpression(parent) || ts.isNewExpression(parent)) &&
    parent.arguments?.includes(at as ts.Expression)
  ) {
    return MATCH_CALLS.has(calleeName(parent));
  }
  if (ts.isBinaryExpression(parent)) {
    return EQUALITY.has(parent.operatorToken.kind);
  }
  if (
    ts.isPropertyAssignment(parent) &&
    ts.isIdentifier(parent.name) &&
    LOCATE_OPTIONS.has(parent.name.text) &&
    ts.isObjectLiteralExpression(parent.parent)
  ) {
    const call = parent.parent.parent;
    return ts.isCallExpression(call) && LOCATE_CALLS.has(calleeName(call));
  }
  return false;
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

/** The text a literal spells, a template's pieces between its holes, or a pattern's words. */
function textsOf(node: ts.Node): string[] {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return [node.text];
  }
  if (ts.isTemplateExpression(node)) {
    return [
      node.head.text,
      ...node.templateSpans.map((span) => span.literal.text),
    ];
  }
  if (ts.isRegularExpressionLiteral(node)) {
    const words = regexWords(node.text.slice(1, node.text.lastIndexOf("/")));
    return words === null ? [] : [words];
  }
  return [];
}

/** A finding: hard ones fail at once, a product copy only past the ratchet's baseline. */
interface Finding {
  /** The product phrase a copy matched; unset for rules 1 and 3, which never ratchet. */
  copied?: string;
  file: string;
  line: string;
}

const found: Finding[] = [];

/** Rule 3: each imported word a function run in the page reads. */
function inPage(
  node: ts.Node,
  imported: Set<string>,
  report: (at: ts.Node, line: string) => void
): void {
  if (
    imported.size === 0 ||
    !ts.isCallExpression(node) ||
    !ts.isPropertyAccessExpression(node.expression) ||
    !IN_PAGE.has(node.expression.name.text)
  ) {
    return;
  }
  const [fn] = node.arguments;
  if (fn && (ts.isArrowFunction(fn) || ts.isFunctionExpression(fn))) {
    for (const word of readInPage(fn, imported)) {
      report(
        word,
        `${word.text} is read inside ${node.expression.name.text}(), which runs in the page where it is undefined: pass it in as the call's argument`
      );
    }
  }
}

/** Rule 1: the core words that hold `whole`, the shared words first (a feature's entry for one only carries it under its own name, words/common.ts). */
const homeOf = (whole: string | undefined): string[] | undefined =>
  whole === undefined
    ? undefined
    : homes
        .get(whole)
        ?.toSorted(
          (a, b) =>
            Number(b.includes("common.ts")) - Number(a.includes("common.ts"))
        );

/** Rule 2: the first of a matched literal's pieces the product spells. */
function productCopy(
  node: ts.Node,
  texts: string[]
): { piece: string; file: string; text: string } | null {
  if (!(ts.isRegularExpressionLiteral(node) || matched(node))) {
    return null;
  }
  for (const piece of texts) {
    const product = spelledBy(piece);
    if (product) {
      return { piece: piece.replace(SPACE, " ").trim(), ...product };
    }
  }
  return null;
}

for (const file of filesUnder(KIT, [".ts"])) {
  const text = readFileSync(file, "utf8");
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const imported = wordImports(source);
  const where = relative(ROOT, file);
  const at = (node: ts.Node): number =>
    source.getLineAndCharacterOfPosition(node.getStart()).line + 1;
  const report = (node: ts.Node, line: string, copied?: string): void => {
    found.push({
      file: where,
      line: `  ${where}:${at(node)}: ${line}`,
      copied,
    });
  };
  const visit = (node: ts.Node): void => {
    inPage(node, imported, report);
    const texts = textsOf(node);
    const whole = ts.isTemplateExpression(node) ? undefined : texts[0];
    const home = homeOf(whole);
    const copy = home || texts.length === 0 ? null : productCopy(node, texts);
    if (home) {
      report(node, `“${whole}” is ${home.join(", or ")}: import it`);
    } else if (copy) {
      report(
        node,
        `matches “${copy.piece}”, which the product spells in ${copy.file} (“${copy.text.slice(0, 90)}${copy.text.length > 90 ? "…" : ""}”): move it into a core words module, render it from there, and import it here`,
        copy.piece
      );
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}

/**
 * The ratchet: rule 2's copies the kit held when the rule came in, each
 * file's phrases with how many times it matches each. Their number may
 * fall, never rise; a phrase moved to core leaves the baseline by
 * `--write-baseline`, so it can't come back unseen (a fallen count is said,
 * not failed).
 */
const BASELINE = join(ROOT, "scripts/probe-words.baseline.json");
type Baseline = Record<string, Record<string, number>>;

const counted: Baseline = {};
for (const finding of found) {
  if (finding.copied !== undefined) {
    const phrases = counted[finding.file] ?? {};
    counted[finding.file] = phrases;
    phrases[finding.copied] = (phrases[finding.copied] ?? 0) + 1;
  }
}
const total = (held: Baseline): number =>
  Object.values(held)
    .flatMap((phrases) => Object.values(phrases))
    .reduce((a, b) => a + b, 0);

if (process.argv.includes("--write-baseline")) {
  const sorted = Object.fromEntries(
    Object.entries(counted)
      .toSorted(([a], [b]) => a.localeCompare(b))
      .map(([file, phrases]) => [
        file,
        Object.fromEntries(
          Object.entries(phrases).toSorted(([a], [b]) => a.localeCompare(b))
        ),
      ])
  );
  await Bun.write(BASELINE, `${JSON.stringify(sorted, null, 2)}\n`);
  console.log(
    `probe-words: baseline written, ${total(counted)} copies of the product's text in scripts/probe-kit`
  );
}

const baseline = (await Bun.file(BASELINE).json()) as Baseline;
const failing = found.filter(
  (finding) =>
    finding.copied === undefined ||
    (counted[finding.file]?.[finding.copied] ?? 0) >
      (baseline[finding.file]?.[finding.copied] ?? 0)
);
const stale = Object.entries(baseline).flatMap(([file, phrases]) =>
  Object.entries(phrases)
    .filter(([phrase, n]) => (counted[file]?.[phrase] ?? 0) < n)
    .map(([phrase]) => `  ${file}: “${phrase}”`)
);

if (failing.length > 0) {
  console.error(
    `probe-words: ${failing.length} finding(s): a probe-kit literal that copies the product's words instead of importing them from packages/core/src/words (scripts/probe-kit/words.ts has literal, startsWith, exactly), or an imported word read in the page:`
  );
  for (const finding of failing) {
    console.error(finding.line);
  }
}
if (stale.length > 0) {
  console.log(
    `probe-words: ${stale.length} copie(s) in scripts/probe-words.baseline.json are gone from the kit; \`bun scripts/probe-words-check.ts --write-baseline\` takes them out so they can't come back unseen:`
  );
  for (const line of stale) {
    console.log(line);
  }
}
if (failing.length > 0) {
  process.exit(1);
}
console.log(
  `probe-words: ${homes.size} core words and ${spelled.size} pieces of the product's own text; no new probe-kit copy (${total(counted)} older copies held by the baseline, which may only fall)`
);
