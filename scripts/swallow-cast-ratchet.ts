/**
 * `bun scripts/swallow-cast-ratchet.ts` (part of `bun run check`): the
 * shapes that swallow a failure or step around the type checker, counted
 * per file off each file's syntax (lib/parse-source.ts), comments and
 * strings never read as code. Each file's count of each may fall, never
 * rise (lib/ratchet.ts).
 *
 * - **catch-drops-reason**: a `.catch(…)` handler, or a `.then(…, …)`
 *   rejection handler, written in place that takes no rejection reason or
 *   never reads the one it takes.
 * - **empty-catch**: a `catch` block with no statement in it (a comment
 *   alone is none).
 * - **as-any**: a value asserted to `any` (`x as any`, `<any>x`).
 * - **as-unknown-as**: a value asserted through `unknown` to another type
 *   (`x as unknown as T`), which TypeScript accepts whatever the two types.
 *
 * Generated modules are left out: what they hold is their generator's.
 *
 *   bun scripts/swallow-cast-ratchet.ts                   exits 1 on a rise or a fall
 *   bun scripts/swallow-cast-ratchet.ts --write-baseline  after a fix lowers a count
 *   bun scripts/swallow-cast-ratchet.ts --list <kind>     each place of one kind
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { parsed } from "./lib/parse-source";
import { holdRatchet } from "./lib/ratchet";
import { ROOT, repoFiles } from "./lib/repo-files";

const KINDS = {
  "catch-drops-reason":
    "a rejection handler reads its reason: handle it, or let it fail",
  "empty-catch": "a catch block does something with what it caught",
  "as-any": "no assertion to any: type the value",
  "as-unknown-as":
    "no assertion through unknown: parse the value (a schema) or type it",
};
type Kind = keyof typeof KINDS;

const CODE = /\.(?:[cm]?[jt]sx?|svelte)$/u;
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

/** The kind `node` is, when it is one. */
const kindOf = (node: ts.Node): Kind | undefined => {
  if (ts.isCallExpression(node) && dropsReason(rejectionHandler(node))) {
    return "catch-drops-reason";
  }
  if (ts.isCatchClause(node) && node.block.statements.length === 0) {
    return "empty-catch";
  }
  if (isAssertion(node)) {
    if (node.type.kind === ts.SyntaxKind.AnyKeyword) {
      return "as-any";
    }
    const inner = unwrap(node.expression);
    if (
      isAssertion(inner) &&
      inner.type.kind === ts.SyntaxKind.UnknownKeyword
    ) {
      return "as-unknown-as";
    }
  }
};

const counts: Record<Kind, Record<string, number>> = {
  "catch-drops-reason": {},
  "empty-catch": {},
  "as-any": {},
  "as-unknown-as": {},
};
const places = new Map<string, string[]>();

for (const file of repoFiles().filter(
  (path) => CODE.test(path) && SCOPE.test(path) && !SKIPPED.test(path)
)) {
  const source = parsed(file, readFileSync(join(ROOT, file), "utf8"));
  const visit = (node: ts.Node): void => {
    const kind = kindOf(node);
    if (kind) {
      counts[kind][file] = (counts[kind][file] ?? 0) + 1;
      // A call's place is its `.catch` or `.then`, not the chain's start.
      const at =
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression)
          ? node.expression.name
          : node;
      const line =
        source.getLineAndCharacterOfPosition(at.getStart(source)).line + 1;
      const key = `${kind}\0${file}`;
      places.set(key, [...(places.get(key) ?? []), `${file}:${line}`]);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}

const listed = process.argv.indexOf("--list");
if (listed >= 0) {
  const kind = process.argv[listed + 1] as Kind;
  for (const file of Object.keys(counts[kind] ?? {})) {
    for (const place of places.get(`${kind}\0${file}`) ?? []) {
      process.stdout.write(`${place}\n`);
    }
  }
} else {
  holdRatchet(counts, {
    name: "swallow-cast-ratchet",
    baseline: join(ROOT, "scripts/swallow-cast-ratchet.baseline.json"),
    rules: KINDS,
    places: (kind, file) => places.get(`${kind}\0${file}`) ?? [],
  });
}
