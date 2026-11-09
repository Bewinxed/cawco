/**
 * `bun scripts/escape-hatch-ratchet.ts` (part of `bun run check`): the
 * shapes that swallow a failure, step around the type checker or silence a
 * check, counted off each file's syntax (lib/parse-source.ts), strings never
 * read as code. A count may fall or move with its file, never rise
 * (lib/ratchet.ts).
 *
 * - **catch-drops-reason**: a `.catch(…)` handler, or a `.then(…, …)`
 *   rejection handler, written in place that takes no rejection reason or
 *   never reads the one it takes.
 * - **empty-catch**: a `catch` block with no statement in it (a comment
 *   alone is none).
 * - **as-any**: a value asserted to `any` (`x as any`, `<any>x`).
 * - **as-unknown-as**: a value asserted through `unknown` to another type
 *   (`x as unknown as T`), which TypeScript accepts whatever the two types.
 * - **suppression**: a comment that silences a check where it stands
 *   (`biome-ignore`, `@ts-expect-error`, `@ts-ignore`, `@ts-nocheck`,
 *   `eslint-disable`, `oxlint-disable`, `svelte-ignore`), in code, a
 *   component's markup or a stylesheet.
 *
 * Generated modules are left out: what they hold is their generator's.
 *
 *   bun scripts/escape-hatch-ratchet.ts                   exits 1 on a rise
 *   bun scripts/escape-hatch-ratchet.ts --write-baseline  starts a kind the baseline does not hold
 *   bun scripts/escape-hatch-ratchet.ts --list <kind>     each place of one kind
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { commentsOf, parsed } from "./lib/parse-source";
import { type Found, holdRatchet } from "./lib/ratchet";
import { ROOT, repoFiles } from "./lib/repo-files";

const KINDS = {
  "catch-drops-reason":
    "a rejection handler reads its reason: handle it, or let it fail",
  "empty-catch": "a catch block does something with what it caught",
  "as-any": "no assertion to any: type the value",
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

const unwrap = (node: ts.Expression): ts.Expression =>
  ts.isParenthesizedExpression(node) ? unwrap(node.expression) : node;

const isAssertion = (
  node: ts.Node
): node is ts.AsExpression | ts.TypeAssertion =>
  ts.isAsExpression(node) || ts.isTypeAssertionExpression(node);

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

/** Whether a handler written in place drops the reason it is handed. */
const dropsReason = (handler: ts.Expression | undefined): boolean => {
  if (!(
    handler &&
    (ts.isArrowFunction(handler) || ts.isFunctionExpression(handler))
  )) {
    return false;
  }
  const [reason] = handler.parameters;
  if (!reason) {
    return true;
  }
  return ts.isIdentifier(reason.name) && !reads(handler.body, reason.name.text);
};

type Handler = ts.ArrowFunction | ts.FunctionExpression;

/** What the handler's body is: its statement kind, never a name it reads. */
const handlerShape = (handler: Handler): string =>
  ts.isBlock(handler.body)
    ? `${handler.body.statements.length === 0 ? "empty" : "block"}`
    : ts.SyntaxKind[handler.body.kind];

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
const kindOf = (
  node: ts.Node,
  source: ts.SourceFile
): { kind: Kind; shape: string } | undefined => {
  if (ts.isCallExpression(node)) {
    const handler = rejectionHandler(node);
    return dropsReason(handler)
      ? { kind: "catch-drops-reason", shape: handlerShape(handler as Handler) }
      : undefined;
  }
  if (ts.isCatchClause(node) && node.block.statements.length === 0) {
    return { kind: "empty-catch", shape: "" };
  }
  if (isAssertion(node)) {
    if (node.type.kind === ts.SyntaxKind.AnyKeyword) {
      return { kind: "as-any", shape: "" };
    }
    const inner = unwrap(node.expression);
    if (
      isAssertion(inner) &&
      inner.type.kind === ts.SyntaxKind.UnknownKeyword
    ) {
      return { kind: "as-unknown-as", shape: node.type.getText(source) };
    }
  }
};

const found: Found[] = [];

for (const file of repoFiles().filter(
  (path) => READ.test(path) && SCOPE.test(path) && !SKIPPED.test(path)
)) {
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
    const counted = kindOf(node, source);
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
