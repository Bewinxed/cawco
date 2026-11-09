/**
 * `bun scripts/escape-hatch-ratchet.ts` (part of `bun run check`): the
 * shapes that swallow a failure, step around the type checker or silence a
 * check, counted off each file's syntax (lib/parse-source.ts), strings never
 * read as code. A count may fall or move with its file, never rise
 * (lib/ratchet.ts).
 *
 * - **catch-drops-reason**: a `.catch(…)` handler, or a `.then(…, …)`
 *   rejection handler, that runs something or nothing and never reads the
 *   reason it is handed: one written in place, or `noop` passed by name. A
 *   handler that only yields a value (`() => undefined`, `() => []`,
 *   `() => dir`) says what the failure becomes, and is not counted.
 * - **empty-catch**: a `catch` block with no statement in it (a comment
 *   alone is none).
 * - **as-unknown-as**: a value asserted through `unknown` to another type
 *   (`x as unknown as T`), which TypeScript accepts whatever the two types.
 *   Found by the Grit plugin scripts/lint/as-unknown-as.grit; only the count
 *   per file is this ratchet's.
 * - **suppression**: a comment that silences a check where it stands
 *   (`biome-ignore`, `@ts-expect-error`, `@ts-ignore`, `@ts-nocheck`,
 *   `eslint-disable`, `oxlint-disable`, `svelte-ignore`), in code, a
 *   component's markup or a stylesheet.
 *
 * Biome's noExplicitAny holds `any` itself, at every site, and has no per-file
 * count for what is left; here is what a file may hold of the rest.
 *
 * Generated modules are left out: what they hold is their generator's.
 *
 *   bun scripts/escape-hatch-ratchet.ts                   exits 1 on a rise
 *   bun scripts/escape-hatch-ratchet.ts --write-baseline  starts a kind the baseline does not hold
 *   bun scripts/escape-hatch-ratchet.ts --list <kind>     each place of one kind
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ts from "typescript";
import { biomeLint, type Diagnostic } from "./lib/biome-run";
import { commentsOf, parsed } from "./lib/parse-source";
import { type Found, holdRatchet } from "./lib/ratchet";
import { ROOT, repoFiles } from "./lib/repo-files";

const KINDS = {
  "catch-drops-reason":
    "a rejection handler reads its reason: handle it, or let it fail",
  "empty-catch": "a catch block does something with what it caught",
  "as-unknown-as":
    "no assertion through unknown: parse the value (a schema) or type it",
  suppression:
    "no new silenced check: meet the rule, or take its exception to the owner",
};
type Kind = keyof typeof KINDS;

const CODE = /\.(?:[cm]?[jt]sx?|svelte)$/u;
const READ = /\.(?:[cm]?[jt]sx?|svelte|css)$/u;
/** A directive's tool and its rule (`biome-ignore lint/style/noRestrictedImports`), never its reason. */
const DIRECTIVE_NAME =
  /(?:biome-ignore|eslint-disable|oxlint-disable|svelte-ignore)[^\s:]*(?:\s+[\w/@-]+)?|@ts-[\w-]+/u;
/** A directive that silences a check, at the start of a comment's words. */
const DIRECTIVE =
  /^(?:\/\/|\/\*+|<!--)?[\s*]*(?:biome-ignore(?!-end)|@ts-expect-error|@ts-ignore|@ts-nocheck|eslint-disable|oxlint-disable|svelte-ignore)\b/u;
const SCOPE = /^(?:apps\/(?:dashboard|cawrier)|packages|scripts|site)\//u;
/** Planted mistakes, pages copied as they were, and generated modules. */
const SKIPPED =
  /\/fixtures\/|\.gen\.ts$|\/stored-shapes(?:\.proof)?\.ts$|\/tokens\/tokens\.ts$/u;

/** Whether `name` is read anywhere in `body`. */
const reads = (body: ts.Node, name: string): boolean => {
  let found = false;
  const visit = (node: ts.Node): void => {
    if (found) {
      return;
    }
    if (ts.isIdentifier(node) && node.text === name) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(body);
  return found;
};

type Handler = ts.ArrowFunction | ts.FunctionExpression;

/** An expression that computes nothing but a value: no call, no `await`, no assignment. */
const isValue = (node: ts.Expression): boolean => {
  if (
    ts.isIdentifier(node) ||
    ts.isLiteralExpression(node) ||
    ts.isNoSubstitutionTemplateLiteral(node) ||
    [
      ts.SyntaxKind.TrueKeyword,
      ts.SyntaxKind.FalseKeyword,
      ts.SyntaxKind.NullKeyword,
    ].includes(node.kind)
  ) {
    return true;
  }
  if (
    ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isSatisfiesExpression(node) ||
    ts.isNonNullExpression(node) ||
    ts.isPropertyAccessExpression(node) ||
    ts.isPrefixUnaryExpression(node)
  ) {
    return isValue(
      ts.isPrefixUnaryExpression(node) ? node.operand : node.expression
    );
  }
  if (ts.isArrayLiteralExpression(node)) {
    return node.elements.every(isValue);
  }
  if (ts.isObjectLiteralExpression(node)) {
    return node.properties.every(
      (property) =>
        ts.isShorthandPropertyAssignment(property) ||
        (ts.isPropertyAssignment(property) && isValue(property.initializer))
    );
  }
  if (ts.isTemplateExpression(node)) {
    return node.templateSpans.every((span) => isValue(span.expression));
  }
  if (ts.isBinaryExpression(node)) {
    return (
      node.operatorToken.kind !== ts.SyntaxKind.EqualsToken &&
      isValue(node.left) &&
      isValue(node.right)
    );
  }
  return ts.isNewExpression(node) && (node.arguments?.length ?? 0) === 0;
};

/** The value a handler's body is, when all it does is yield one. */
const yieldedValue = (handler: Handler): ts.Expression | undefined => {
  if (!ts.isBlock(handler.body)) {
    return handler.body;
  }
  const [only] = handler.body.statements;
  return handler.body.statements.length === 1 &&
    only !== undefined &&
    ts.isReturnStatement(only)
    ? (only.expression ?? undefined)
    : undefined;
};

/** Whether a handler drops the reason it is handed, without saying what the failure becomes. */
const dropsReason = (handler: ts.Expression | undefined): boolean => {
  if (handler && ts.isIdentifier(handler)) {
    return handler.text === "noop";
  }
  if (!(
    handler &&
    (ts.isArrowFunction(handler) || ts.isFunctionExpression(handler))
  )) {
    return false;
  }
  const [reason] = handler.parameters;
  if (
    reason &&
    !(ts.isIdentifier(reason.name) && !reads(handler.body, reason.name.text))
  ) {
    return false;
  }
  const value = yieldedValue(handler);
  return !(value && isValue(value));
};

/** What the handler's body is: its statement kind, never a name it reads. */
const handlerShape = (handler: ts.Expression): string => {
  if (ts.isIdentifier(handler)) {
    return handler.text;
  }
  const { body } = handler as Handler;
  if (ts.isBlock(body)) {
    return body.statements.length === 0 ? "empty" : "block";
  }
  return ts.SyntaxKind[body.kind] ?? "";
};

/** The rejection handler a call passes, when it is a `.catch` or a two-argument `.then`. */
const rejectionHandler = (
  node: ts.CallExpression
): ts.Expression | undefined => {
  const callee = node.expression;
  if (!ts.isPropertyAccessExpression(callee)) {
    return;
  }
  const method = callee.name.text;
  if (method === "catch") {
    return node.arguments[0];
  }
  return method === "then" ? node.arguments[1] : undefined;
};

/**
 * The kind `node` is, when it is one, with what the ratchet counts of it:
 * read off the occurrence alone, so a rename around it changes nothing.
 */
const kindOf = (node: ts.Node): { kind: Kind; shape: string } | undefined => {
  if (ts.isCallExpression(node)) {
    const handler = rejectionHandler(node);
    return dropsReason(handler)
      ? {
          kind: "catch-drops-reason",
          shape: handlerShape(handler as ts.Expression),
        }
      : undefined;
  }
  if (ts.isCatchClause(node) && node.block.statements.length === 0) {
    return { kind: "empty-catch", shape: "" };
  }
};

const found: Found[] = [];

const read = repoFiles().filter(
  (path) => READ.test(path) && SCOPE.test(path) && !SKIPPED.test(path)
);
for (const file of read) {
  const text = readFileSync(join(ROOT, file), "utf8");
  for (const comment of commentsOf(file, text)) {
    if (DIRECTIVE.test(comment.text)) {
      found.push({
        rule: "suppression",
        file,
        line: text.slice(0, comment.at).split("\n").length,
        shape: DIRECTIVE_NAME.exec(comment.text)?.[0] ?? "",
      });
    }
  }
  if (!CODE.test(file)) {
    continue;
  }
  const source = parsed(file, text);
  const visit = (node: ts.Node): void => {
    const counted = kindOf(node);
    if (counted) {
      // A call's place is its `.catch` or `.then`, not the chain's start.
      const at =
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression)
          ? node.expression.name
          : node;
      found.push({
        rule: counted.kind,
        file,
        line:
          source.getLineAndCharacterOfPosition(at.getStart(source)).line + 1,
        shape: counted.shape,
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}

/** The text of a diagnostic's span. */
const spanText = (text: string, d: Diagnostic): string => {
  const lines = text.split("\n");
  const { start, end } = d.location;
  const taken = lines.slice(start.line - 1, end.line);
  taken[taken.length - 1] = taken.at(-1)?.slice(0, end.column - 1) ?? "";
  taken[0] = taken[0]?.slice(start.column - 1) ?? "";
  return taken.join("\n");
};

/** Each `as unknown as` in the code the ratchet reads, off the Grit plugin that finds it. */
const castsThroughUnknown = async (paths: string[]): Promise<void> => {
  const scratch = join(
    process.env.TMPDIR ?? tmpdir(),
    `as-unknown-as-${process.pid}`
  );
  mkdirSync(scratch, { recursive: true });
  const config = Bun.JSONC.parse(
    await Bun.file(join(ROOT, "biome.jsonc")).text()
  ) as Record<string, unknown>;
  writeFileSync(
    join(scratch, "biome.json"),
    JSON.stringify({
      root: true,
      vcs: { enabled: false },
      files: { ignoreUnknown: true, includes: ["**"], maxSize: 2_097_152 },
      plugins: [join(ROOT, "scripts/lint/as-unknown-as.grit")],
      linter: { rules: { preset: "none" } },
      assist: { enabled: false },
      css: config.css,
      html: config.html,
      javascript: config.javascript,
    })
  );
  const result = await biomeLint([`--config-path=${scratch}`, ...paths], ROOT);
  rmSync(scratch, { recursive: true, force: true });
  if ("failed" in result) {
    throw new Error(
      `escape-hatch-ratchet: as-unknown-as.grit did not run:\n${result.failed}`
    );
  }
  for (const d of result.diagnostics.filter(
    (one) => one.category === "plugin"
  )) {
    found.push({
      rule: "as-unknown-as",
      file: d.location.path,
      line: d.location.start.line,
      shape: spanText(readFileSync(join(ROOT, d.location.path), "utf8"), d),
    });
  }
};

await castsThroughUnknown(read.filter((path) => CODE.test(path)));

const listed = process.argv.indexOf("--list");
if (listed >= 0) {
  const kind = process.argv[listed + 1] as Kind;
  for (const one of found.filter((place) => place.rule === kind)) {
    process.stdout.write(`${one.file}:${one.line}\n`);
  }
} else {
  holdRatchet(found, {
    name: "escape-hatch-ratchet",
    baseline: join(ROOT, "scripts/escape-hatch-ratchet.baseline.tsv"),
    rules: KINDS,
  });
}
