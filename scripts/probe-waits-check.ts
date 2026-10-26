/**
 * Part of `bun run check`: no probe-kit spec sits out a real timer. A spec
 * that sleeps through a product's interval proves only that interval's
 * constant; the path it fires runs the same however soon it fires. A spec
 * calls that path, or waits for the event it is waiting on.
 *
 * Over scripts/probe-kit/ and scripts/scratch-fleet.ts, two refusals:
 *
 * 1. A sleep of {@link LIMIT_MS} or more: `Bun.sleep`, `sleep`, `pause`,
 *    `delay`, or `setTimeout`'s delay, however its length is spelled
 *    (`65_000`, `MINUTE + 15_000`, `5 * 60_000`, a constant of the file, a
 *    deadline `Math.max(0, at + WAIT_MS - Date.now())`). A `setTimeout`
 *    whose handle the file clears is a watchdog over something else, a
 *    bound and not a wait, and passes.
 * 2. A product timer (an `*_MS` imported from packages/ or apps/, of
 *    {@link LIMIT_MS} or more as its module declares it) in a sleep's length or an `until` deadline, itself or through a constant
 *    made from it: such a deadline is the product's interval waited out.
 *    Imported to assert against ("answered within LATE_MS") it passes.
 *
 * An `until(…, 120_000)` of the spec's own is an upper bound that returns
 * as soon as its condition holds, and passes.
 *
 * Why not a Biome GritQL plugin beside scripts/lint/no-raw-deadline.grit:
 * Biome 2.6's GritQL compiles no numeric comparison (`$n > 30000` fails
 * "Failed to compile the Grit plugin"), and it evaluates nothing: a regex
 * on a literal's text catches `65_000` but never `MINUTE + 15_000` or a
 * constant declared elsewhere in the file.
 *
 * The waits that stood when it came in are counted per file in
 * scripts/probe-waits.baseline.json, and may only fall.
 *
 *   bun scripts/probe-waits-check.ts
 *   bun scripts/probe-waits-check.ts --write-baseline  after a spec's waits go
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import ts from "typescript";

const ROOT = join(import.meta.dir, "..");
/** The longest a spec may sleep: a few seconds of the product's own work, never an interval of it. */
export const LIMIT_MS = 30_000;
const SLEEPS = new Set(["sleep", "pause", "delay"]);
const PRODUCT = /(?:^|\/)(?:packages|apps)\/|^@cawco\//u;
const TIMER_NAME = /_MS$/u;

const filesUnder = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      return name === "node_modules" || name === "fixtures"
        ? []
        : filesUnder(path);
    }
    return path.endsWith(".ts") ? [path] : [];
  });

/** A file's own numbers: each `const NAME = <arithmetic>` it can work out, and each product timer it imports. */
interface Scope {
  numbers: Map<string, number>;
  /** Local names that are a product timer or made from one, each to the timer it comes from. */
  timers: Map<string, string>;
}

type Length = number | undefined;

const both = (
  left: Length,
  right: Length,
  op: (a: number, b: number) => number
): Length =>
  left !== undefined && right !== undefined ? op(left, right) : undefined;

/** `left <op> right`'s longest: `at + WAIT_MS - Date.now()` waits up to WAIT_MS, so an unknown term adds nothing and takes nothing off. */
const binaryLength = (
  kind: ts.SyntaxKind,
  left: Length,
  right: Length
): Length => {
  switch (kind) {
    case ts.SyntaxKind.AsteriskToken:
      return both(left, right, (a, b) => a * b);
    case ts.SyntaxKind.SlashToken:
      return right === 0 ? undefined : both(left, right, (a, b) => a / b);
    case ts.SyntaxKind.PlusToken:
      return left === undefined ? right : left + (right ?? 0);
    case ts.SyntaxKind.MinusToken:
      return both(left, right, (a, b) => a - b) ?? left;
    default:
      return;
  }
};

const MATH: Partial<Record<string, (known: number[]) => number>> = {
  max: (known) => Math.max(...known),
  min: (known) => Math.min(...known),
  round: (known) => known[0] as number,
  ceil: (known) => known[0] as number,
  floor: (known) => known[0] as number,
};

/** The longest length `node` can stand for, or none when nothing in it is a number. */
const lengthOf = (node: ts.Node, scope: Scope): Length => {
  if (ts.isNumericLiteral(node)) {
    return Number(node.text);
  }
  if (ts.isIdentifier(node)) {
    return scope.numbers.get(node.text);
  }
  if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node)) {
    return lengthOf(node.expression, scope);
  }
  if (ts.isBinaryExpression(node)) {
    return binaryLength(
      node.operatorToken.kind,
      lengthOf(node.left, scope),
      lengthOf(node.right, scope)
    );
  }
  if (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    node.expression.expression.getText() === "Math"
  ) {
    const known = node.arguments
      .map((arg) => lengthOf(arg, scope))
      .filter((n): n is number => n !== undefined);
    const math = MATH[node.expression.name.text];
    return math && known.length > 0 ? math(known) : undefined;
  }
};

/** The product timer `node` names, itself or through a constant made from one. */
const namesTimer = (node: ts.Node, scope: Scope): string | undefined => {
  if (ts.isIdentifier(node) && scope.timers.has(node.text)) {
    return scope.timers.get(node.text);
  }
  let found: string | undefined;
  node.forEachChild((child) => {
    found ??= namesTimer(child, scope);
  });
  return found;
};

/** The module file an import names, `.ts` or its folder's index. */
const moduleFile = (from: string, specifier: string): string | undefined => {
  const base = resolve(dirname(from), specifier);
  return [base, `${base}.ts`, join(base, "index.ts")].find(
    (path) => existsSync(path) && statSync(path).isFile()
  );
};

const parse = (file: string, text = readFileSync(file, "utf8")) =>
  ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);

const exported = new Map<string, Length>();

/** The name `statement` re-exports `name` as, and the module it is from. */
const reExport = (
  file: string,
  statement: ts.Statement,
  name: string
): { from: string; name: string } | undefined => {
  if (!(
    ts.isExportDeclaration(statement) &&
    statement.moduleSpecifier &&
    ts.isStringLiteral(statement.moduleSpecifier)
  )) {
    return;
  }
  const from = moduleFile(file, statement.moduleSpecifier.text);
  const clause = statement.exportClause;
  if (!from) {
    return;
  }
  if (!(clause && ts.isNamedExports(clause))) {
    return { from, name };
  }
  const hit = clause.elements.find((one) => one.name.text === name);
  return hit ? { from, name: (hit.propertyName ?? hit.name).text } : undefined;
};

/** The value module `file` exports as `name`, followed through its re-exports. */
const exportedValue = (file: string, name: string, depth = 0): Length => {
  const key = `${file}#${name}`;
  if (exported.has(key) || depth > 4) {
    return exported.get(key);
  }
  exported.set(key, undefined);
  const source = parse(file);
  let value = scopeOf(source, file).numbers.get(name);
  for (const statement of source.statements) {
    const next = value === undefined && reExport(file, statement, name);
    if (next) {
      value = exportedValue(next.from, next.name, depth + 1);
    }
  }
  exported.set(key, value);
  return value;
};

/** Each `*_MS` `statement` imports from the product, into `scope`: its value, and whether it is an interval. */
const takeImports = (
  statement: ts.Statement,
  file: string,
  scope: Scope
): void => {
  if (!(
    ts.isImportDeclaration(statement) &&
    ts.isStringLiteral(statement.moduleSpecifier) &&
    PRODUCT.test(statement.moduleSpecifier.text.replaceAll("../", "")) &&
    statement.importClause?.namedBindings &&
    ts.isNamedImports(statement.importClause.namedBindings)
  )) {
    return;
  }
  const target = moduleFile(file, statement.moduleSpecifier.text);
  for (const element of statement.importClause.namedBindings.elements) {
    const imported = (element.propertyName ?? element.name).text;
    if (!TIMER_NAME.test(imported)) {
      continue;
    }
    const value = target ? exportedValue(target, imported) : undefined;
    if (value !== undefined) {
      scope.numbers.set(element.name.text, value);
    }
    // A product timer of a few seconds is the product's own work, waited
    // for; one of LIMIT_MS or more (or one this cannot read) is its interval.
    if (value === undefined || value >= LIMIT_MS) {
      scope.timers.set(element.name.text, imported);
    }
  }
};

/** Whether `node` is declared `const` (its list's first token). */
const isConst = (node: ts.VariableDeclaration): boolean =>
  ts.isVariableDeclarationList(node.parent) &&
  node.parent.getFirstToken()?.kind === ts.SyntaxKind.ConstKeyword;

function scopeOf(source: ts.SourceFile, file: string): Scope {
  const scope: Scope = { numbers: new Map(), timers: new Map() };
  for (const statement of source.statements) {
    takeImports(statement, file, scope);
  }
  // Constants in order, at every depth: a later one may be made of an earlier one.
  const visit = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      isConst(node)
    ) {
      const value = lengthOf(node.initializer, scope);
      if (value !== undefined && !scope.numbers.has(node.name.text)) {
        scope.numbers.set(node.name.text, value);
      }
      const timer = namesTimer(node.initializer, scope);
      if (timer) {
        scope.timers.set(node.name.text, timer);
      }
    }
    node.forEachChild(visit);
  };
  visit(source);
  return scope;
}

/** The handles a file clears: `clearTimeout(x)`. */
const clearedIn = (source: ts.SourceFile): Set<string> => {
  const cleared = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      node.expression.getText() === "clearTimeout" &&
      node.arguments[0]
    ) {
      cleared.add(node.arguments[0].getText());
    }
    node.forEachChild(visit);
  };
  visit(source);
  return cleared;
};

/** The name a call is made by: `Bun.sleep`, `sleep`, `until`, `setTimeout`. */
const calleeOf = (call: ts.CallExpression): string => {
  const callee = call.expression;
  if (ts.isIdentifier(callee)) {
    return callee.text;
  }
  if (ts.isPropertyAccessExpression(callee)) {
    return `${callee.expression.getText()}.${callee.name.text}`;
  }
  return "";
};

/** A sleep's length: `setTimeout`'s second argument, every other sleep's first; none for a call that is no sleep. */
const sleepLength = (
  call: ts.CallExpression,
  name: string
): ts.Expression | undefined => {
  if (name === "setTimeout") {
    return call.arguments[1];
  }
  return name === "Bun.sleep" || SLEEPS.has(name)
    ? call.arguments[0]
    : undefined;
};

/** What a call refuses, each as words. */
const callRefusals = (
  call: ts.CallExpression,
  scope: Scope,
  cleared: Set<string>
): string[] => {
  const name = calleeOf(call);
  const found: string[] = [];
  const length = sleepLength(call, name);
  if (length) {
    const handle = ts.isVariableDeclaration(call.parent)
      ? call.parent.name.getText()
      : undefined;
    const ms = lengthOf(length, scope);
    const watchdog = name === "setTimeout" && handle && cleared.has(handle);
    if (ms !== undefined && ms >= LIMIT_MS && !watchdog) {
      found.push(
        `${name}(${length.getText()}) sleeps ${Math.round(ms / 1000)} s. Wait for the event it is waiting on, or call the path the timer fires, never the interval itself.`
      );
    }
    const timer = namesTimer(length, scope);
    if (timer) {
      found.push(
        `${name}(${length.getText()}) waits out the product's ${timer}. Call the path the timer fires, or wait for its event.`
      );
    }
  }
  const deadline = name === "until" ? call.arguments[3] : undefined;
  const timer = deadline && namesTimer(deadline, scope);
  if (deadline && timer) {
    found.push(
      `until(…, ${deadline.getText()}) is sized by the product's ${timer}: that is its interval waited out. Call the path the timer fires, or wait for its event.`
    );
  }
  return found;
};

/** Each refusal in `text`, as `line: words`. */
export const refusalsIn = (file: string, text: string): string[] => {
  const source = parse(file, text);
  const scope = scopeOf(source, file);
  const cleared = clearedIn(source);
  const found: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const line =
        source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
      for (const words of callRefusals(node, scope, cleared)) {
        found.push(`${line}: ${words}`);
      }
    }
    node.forEachChild(visit);
  };
  visit(source);
  return found;
};

/**
 * The waits that stood when this check came in, counted per file: their
 * number may fall, never rise. A file past its count fails; a count that
 * fell is said, and `--write-baseline` takes it out so it can't come back.
 */
const BASELINE = join(ROOT, "scripts/probe-waits.baseline.json");

if (import.meta.main) {
  const files = [
    ...filesUnder(join(ROOT, "scripts/probe-kit")),
    join(ROOT, "scripts/scratch-fleet.ts"),
  ];
  const found = new Map(
    files.map((file) => [
      relative(ROOT, file),
      refusalsIn(file, readFileSync(file, "utf8")),
    ])
  );
  const counted = Object.fromEntries(
    [...found]
      .filter(([, refusals]) => refusals.length > 0)
      .map(([file, refusals]) => [file, refusals.length])
  );
  if (process.argv.includes("--write-baseline")) {
    await Bun.write(BASELINE, `${JSON.stringify(counted, null, 2)}\n`);
    console.log(
      `probe-waits-check: baseline written, ${Object.values(counted).reduce((a, b) => a + b, 0)} waits in ${Object.keys(counted).length} files`
    );
    process.exit(0);
  }
  const baseline = (await Bun.file(BASELINE).json()) as Record<string, number>;
  const over = [...found].filter(
    ([file, refusals]) => refusals.length > (baseline[file] ?? 0)
  );
  const fell = Object.entries(baseline).filter(
    ([file, count]) => (counted[file] ?? 0) < count
  );
  if (fell.length > 0) {
    console.log(
      `probe-waits-check: ${fell.length} file(s) wait less than scripts/probe-waits.baseline.json holds; \`bun scripts/probe-waits-check.ts --write-baseline\` takes them out so they can't come back: ${fell.map(([file]) => file).join(", ")}`
    );
  }
  if (over.length > 0) {
    console.error(
      `probe-waits-check: a probe spec waits on a real timer:\n${over
        .flatMap(([file, refusals]) =>
          refusals.map((words) => `${file}:${words}`)
        )
        .join("\n")}`
    );
    process.exit(1);
  }
  console.log(
    `probe-waits-check: ${files.length} files, no new wait on a real timer (${Object.values(counted).reduce((a, b) => a + b, 0)} older ones held by the baseline, which may only fall)`
  );
}
