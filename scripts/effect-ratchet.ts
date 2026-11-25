/**
 * `bun scripts/effect-ratchet.ts` (part of `bun run check`): the hub's and
 * the agent's internals are written in Effect v4 (CLAUDE.md, "Backend
 * internals"), so a hand-written version of what Effect provides may fall or
 * move with its file, never rise (lib/ratchet.ts). Counted off each file's
 * syntax (lib/parse-source.ts) under packages/hub/src and packages/agent/src:
 *
 * - **per-key-chain**: a value a map holds per key, set to a `.then`,
 *   `.catch` or `.finally` chained off what the same map held for that key
 *   (`m.set(k, (m.get(k) ?? Promise.resolve()).then(run))`, through the
 *   locals between them): a per-key lock by hand. Counted by the map. A map
 *   of promises that only shares one in flight (`m.get(k) ?? start()`, the
 *   started promise set fresh) chains nothing and is not counted.
 * - **promise-chain**: a variable or field set to a `.then`, `.catch` or
 *   `.finally` chained off its own value (`writing = writing.then(run)`):
 *   one lock by hand, at module level or in a closure alike. Counted by
 *   the target.
 * - **timed-loop**: a timed wait (`Bun.sleep`, the hub lifetime's `sleep`,
 *   `node:timers/promises`, a `new Promise` resolved by `setTimeout`, or a
 *   helper of the file's own that is one of those) run in a loop's body, in
 *   the same function: a retry, a backoff or a poll by hand. Counted by the
 *   wait. `Effect.sleep` is Effect's, and a bare `sleep()` is whatever its
 *   file means by it (the stage's puts a preview to sleep). A timer whose
 *   run calls its own function again after a retry's delay is the same loop
 *   by timer, counted as `setTimeout → name`.
 *
 * Code a page runs (a directory under src whose tsconfig extends
 * tsconfig.browser.json: the stage's canvas, the file viewer, in-page) is
 * no part of the daemon's internals and is left out.
 * - **async-lock**: an import of `async-lock`.
 *
 *   bun scripts/effect-ratchet.ts                   exits 1 on a rise
 *   bun scripts/effect-ratchet.ts --write-baseline  starts a kind the baseline does not hold
 *   bun scripts/effect-ratchet.ts --list <kind>     each place of one kind
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { parsed } from "./lib/parse-source";
import { type Found, holdRatchet } from "./lib/ratchet";
import { ROOT, repoFiles } from "./lib/repo-files";

// Read at run time beyond its imports; check.ts keys the check on them.
export const checkReads = [
  "packages/hub/src/",
  "packages/agent/src/",
  "scripts/effect-ratchet.baseline.tsv",
];

const KINDS = {
  "per-key-chain":
    "one key's work at a time is a Semaphore per key, held in an RcMap (PartitionedSemaphore is a shared pool, not a per-key lock)",
  "promise-chain":
    "work one at a time is a Semaphore (Semaphore.make(1), Semaphore.withPermit)",
  "timed-loop":
    "a retry, a backoff or a poll is Effect.retry or Effect.repeat with a Schedule",
  "async-lock":
    "a lock is a Semaphore (per key, in an RcMap); a gate is a Latch",
};
type Kind = keyof typeof KINDS;

const SCOPE = /^packages\/(?:hub|agent)\/src\/.*\.[cm]?tsx?$/u;
/** Planted mistakes and generated modules. */
const SKIPPED = /\/fixtures\/|\.gen\.ts$|\.d\.ts$/u;
const CHAIN_METHODS = new Set(["then", "catch", "finally"]);
/** What a timed `sleep` is called on: Bun, or the hub's lifetime (`lifetime`, `ctx.lifetime`, `this.#lifetime`). */
const SLEEPER = /^(?:Bun|(?:.*\.)?#?lifetime)$/u;
const LIFETIME = /^(?:.*\.)?#?lifetime$/u;
const TIMERS_PROMISES = /^(?:node:)?timers\/promises$/u;

/** `node` with what only wraps it taken off: parentheses, assertions, `await`. */
const bare = (node: ts.Expression): ts.Expression => {
  let at = node;
  while (
    ts.isParenthesizedExpression(at) ||
    ts.isAsExpression(at) ||
    ts.isSatisfiesExpression(at) ||
    ts.isNonNullExpression(at) ||
    ts.isAwaitExpression(at) ||
    ts.isTypeAssertionExpression(at)
  ) {
    at = at.expression;
  }
  return at;
};

const isFunction = (node: ts.Node): node is ts.FunctionLikeDeclaration =>
  ts.isFunctionDeclaration(node) ||
  ts.isFunctionExpression(node) ||
  ts.isArrowFunction(node) ||
  ts.isMethodDeclaration(node) ||
  ts.isConstructorDeclaration(node) ||
  ts.isGetAccessorDeclaration(node) ||
  ts.isSetAccessorDeclaration(node);

/** The initializer of the nearest declaration of `name` in a block around `at`. */
const initializerOf = (
  at: ts.Node,
  name: string
): ts.Expression | undefined => {
  for (let scope = at.parent; scope; scope = scope.parent) {
    const statements =
      ts.isBlock(scope) || ts.isSourceFile(scope) ? scope.statements : [];
    for (const statement of statements) {
      if (ts.isVariableStatement(statement)) {
        for (const declaration of statement.declarationList.declarations) {
          if (
            ts.isIdentifier(declaration.name) &&
            declaration.name.text === name
          ) {
            return declaration.initializer;
          }
        }
      }
    }
  }
};

interface Traced {
  /** A `.then`, `.catch` or `.finally` stands on the way. */
  chained: boolean;
  /** The way ends at the expression asked about. */
  rooted: boolean;
}

/**
 * Follows a promise's receivers down to where it starts (through `??`, `||`,
 * a conditional and the locals it was built in), and says whether it starts
 * at `isRoot` and was chained on the way. Callbacks are never followed: what
 * a `.finally` reads is not what the promise was built on.
 */
const trace = (
  node: ts.Expression,
  isRoot: (node: ts.Expression) => boolean,
  seen: Set<string> = new Set()
): Traced => {
  const at = bare(node);
  if (isRoot(at)) {
    return { rooted: true, chained: false };
  }
  const either = (a: Traced, b: Traced): Traced => ({
    rooted: a.rooted || b.rooted,
    chained: (a.rooted && a.chained) || (b.rooted && b.chained),
  });
  if (
    ts.isBinaryExpression(at) &&
    [ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.BarBarToken].includes(
      at.operatorToken.kind
    )
  ) {
    return either(trace(at.left, isRoot, seen), trace(at.right, isRoot, seen));
  }
  if (ts.isConditionalExpression(at)) {
    return either(
      trace(at.whenTrue, isRoot, seen),
      trace(at.whenFalse, isRoot, seen)
    );
  }
  if (
    ts.isCallExpression(at) &&
    ts.isPropertyAccessExpression(at.expression) &&
    CHAIN_METHODS.has(at.expression.name.text)
  ) {
    const inner = trace(at.expression.expression, isRoot, seen);
    return { rooted: inner.rooted, chained: inner.rooted };
  }
  if (ts.isIdentifier(at) && !seen.has(at.text)) {
    seen.add(at.text);
    const initializer = initializerOf(at, at.text);
    return initializer
      ? trace(initializer, isRoot, seen)
      : { rooted: false, chained: false };
  }
  return { rooted: false, chained: false };
};

/** Whether `node` is `Promise.resolve()`, the nothing a chain starts after. */
const isNothing = (node: ts.Expression): boolean => {
  const at = bare(node);
  return (
    ts.isCallExpression(at) &&
    at.arguments.length === 0 &&
    at.expression.getText() === "Promise.resolve"
  );
};

/** The map `node` was read from (`m.get(k)`), through a field and the locals it was read into. */
const heldMap = (
  node: ts.Expression,
  seen: Set<string>
): string | undefined => {
  const at = bare(node);
  if (ts.isPropertyAccessExpression(at)) {
    return heldMap(at.expression, seen);
  }
  if (ts.isIdentifier(at) && !seen.has(at.text)) {
    seen.add(at.text);
    const initializer = initializerOf(at, at.text);
    return initializer ? heldMap(initializer, seen) : undefined;
  }
  return ts.isCallExpression(at) &&
    ts.isPropertyAccessExpression(at.expression) &&
    at.expression.name.text === "get"
    ? at.expression.expression.getText()
    : undefined;
};

/**
 * The map a promise starts at, when it starts at what a map held for a key
 * or nothing (`m.get(k) ?? Promise.resolve()`), followed down through a
 * field, a conditional and the locals it was built in, never through a call.
 */
const keyedStart = (
  node: ts.Expression,
  seen: Set<string> = new Set()
): string | undefined => {
  const at = bare(node);
  if (
    ts.isBinaryExpression(at) &&
    [ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.BarBarToken].includes(
      at.operatorToken.kind
    ) &&
    isNothing(at.right)
  ) {
    return heldMap(at.left, seen);
  }
  if (ts.isConditionalExpression(at)) {
    return keyedStart(at.whenTrue, seen) ?? keyedStart(at.whenFalse, seen);
  }
  if (ts.isIdentifier(at) && !seen.has(at.text)) {
    seen.add(at.text);
    const initializer = initializerOf(at, at.text);
    return initializer ? keyedStart(initializer, seen) : undefined;
  }
};

/**
 * A `.then`, `.catch` or `.finally` that starts on what a map held for a key
 * or nothing: the map's text. Counted where the chain starts, once per
 * chain. A map that only shares a promise in flight (`m.get(k) ?? start()`,
 * a read of `m.get(k)?.then(…)`) starts no chain after nothing.
 */
const perKeyChain = (node: ts.CallExpression): string | undefined => {
  const callee = node.expression;
  return ts.isPropertyAccessExpression(callee) &&
    CHAIN_METHODS.has(callee.name.text)
    ? keyedStart(callee.expression)
    : undefined;
};

/** `x = x.then(…)`: the target's text. */
const promiseChain = (node: ts.BinaryExpression): string | undefined => {
  if (node.operatorToken.kind !== ts.SyntaxKind.EqualsToken) {
    return;
  }
  const target = bare(node.left);
  if (!(ts.isIdentifier(target) || ts.isPropertyAccessExpression(target))) {
    return;
  }
  const text = target.getText();
  const isSelf = (at: ts.Expression): boolean =>
    (ts.isIdentifier(at) || ts.isPropertyAccessExpression(at)) &&
    at.getText() === text;
  const right = bare(node.right);
  // The target itself is the root, not its initializer: start one step in.
  if (isSelf(right)) {
    return;
  }
  const traced = trace(right, isSelf, new Set([text]));
  return traced.rooted && traced.chained ? text : undefined;
};

/** Whether `node` makes a promise `setTimeout` resolves: `new Promise((r) => setTimeout(r, ms))`. */
const isTimerPromise = (node: ts.Expression): boolean => {
  const at = bare(node);
  if (!(
    ts.isNewExpression(at) &&
    ts.isIdentifier(at.expression) &&
    at.expression.text === "Promise"
  )) {
    return false;
  }
  let found = false;
  const visit = (child: ts.Node): void => {
    if (
      ts.isCallExpression(child) &&
      ts.isIdentifier(child.expression) &&
      child.expression.text === "setTimeout"
    ) {
      found = true;
    }
    if (!found) {
      ts.forEachChild(child, visit);
    }
  };
  for (const argument of at.arguments ?? []) {
    visit(argument);
  }
  return found;
};

/**
 * Whether a call waits a time: `Bun.sleep()`, the hub lifetime's
 * `lifetime.sleep()`, or a name in `names` (what the file imports from
 * node:timers/promises, its own helpers that only wait). `Effect.sleep` is
 * Effect's own; a bare `sleep()` is whatever the file means by it.
 */
const isWaitCall = (
  node: ts.CallExpression,
  names: ReadonlySet<string>
): boolean => {
  const callee = bare(node.expression);
  if (ts.isIdentifier(callee)) {
    return names.has(callee.text);
  }
  return (
    ts.isPropertyAccessExpression(callee) &&
    callee.name.text === "sleep" &&
    SLEEPER.test(callee.expression.getText())
  );
};

/** What a block does when all it does is return a value. */
const returned = (body: ts.Block): ts.Expression | undefined => {
  const [only] = body.statements;
  return body.statements.length === 1 && only && ts.isReturnStatement(only)
    ? only.expression
    : undefined;
};

/** The names this file waits by: what it imports from node:timers/promises, its own helpers that only wait. */
const waitNames = (source: ts.SourceFile): Set<string> => {
  const names = new Set<string>();
  const isWait = (body: ts.ConciseBody): boolean => {
    const expression = ts.isBlock(body) ? returned(body) : body;
    if (!expression) {
      return false;
    }
    const at = bare(expression);
    if (isTimerPromise(at)) {
      return true;
    }
    return ts.isCallExpression(at) && isWaitCall(at, names);
  };
  const visit = (node: ts.Node): void => {
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      TIMERS_PROMISES.test(node.moduleSpecifier.text)
    ) {
      const bindings = node.importClause?.namedBindings;
      if (bindings && ts.isNamedImports(bindings)) {
        for (const element of bindings.elements) {
          names.add(element.name.text);
        }
      }
    }
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      (ts.isArrowFunction(node.initializer) ||
        ts.isFunctionExpression(node.initializer)) &&
      isWait(node.initializer.body)
    ) {
      names.add(node.name.text);
    }
    if (
      ts.isFunctionDeclaration(node) &&
      node.name &&
      node.body &&
      isWait(node.body)
    ) {
      names.add(node.name.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return names;
};

/** Whether `node` is a loop's body or under one, in the same function. */
const inLoop = (node: ts.Node): boolean => {
  let child = node;
  for (let at = node.parent; at && !isFunction(at); at = at.parent) {
    if (
      (ts.isWhileStatement(at) ||
        ts.isDoStatement(at) ||
        ts.isForStatement(at) ||
        ts.isForOfStatement(at) ||
        ts.isForInStatement(at)) &&
      at.statement === child
    ) {
      return true;
    }
    child = at;
  }
  return false;
};

/** A timed wait run in a loop: the wait's text. */
const timedLoop = (
  node: ts.Expression,
  names: ReadonlySet<string>
): string | undefined => {
  if (!inLoop(node)) {
    return;
  }
  if (ts.isNewExpression(node) && isTimerPromise(node)) {
    return "new Promise(setTimeout)";
  }
  if (!ts.isCallExpression(node)) {
    return;
  }
  return isWaitCall(node, names) ? node.expression.getText() : undefined;
};

/** The name of the function `node` stands in: a declaration's, a method's, or the variable an arrow or function is held in. */
const enclosingName = (node: ts.Node): string | undefined => {
  for (let at = node.parent; at; at = at.parent) {
    if (
      (ts.isFunctionDeclaration(at) || ts.isMethodDeclaration(at)) &&
      at.name
    ) {
      return at.name.getText();
    }
    if (
      (ts.isArrowFunction(at) || ts.isFunctionExpression(at)) &&
      ts.isVariableDeclaration(at.parent)
    ) {
      return at.parent.name.getText();
    }
  }
};

/** A delay a retry's backoff gives: its words or a `Backoff` step's `ms`. */
const RETRY_DELAY = /backoff|retr(?:y|ies)|\bstep\.ms\b/iu;

/**
 * A timer (`setTimeout`, or a lifetime's `after(name, ms, run)`) whose run
 * calls the function it stands in, after a retry's wait: the delay names a
 * backoff or a retry, itself or through the local it was read into. A timer
 * that calls its own function after a fixed or computed quiet (a debounce,
 * a publish's pace) is not counted: its syntax cannot tell it from a retry.
 */
const timerRetry = (node: ts.CallExpression): string | undefined => {
  const callee = bare(node.expression);
  const isSetTimeout = ts.isIdentifier(callee) && callee.text === "setTimeout";
  const isAfter =
    ts.isPropertyAccessExpression(callee) &&
    callee.name.text === "after" &&
    LIFETIME.test(callee.expression.getText()) &&
    node.arguments.length === 3;
  if (!(isSetTimeout || isAfter)) {
    return;
  }
  const [run, delay] = isSetTimeout
    ? [node.arguments[0], node.arguments[1]]
    : [node.arguments[2], node.arguments[1]];
  const name = enclosingName(node);
  if (!(run && delay && name)) {
    return;
  }
  const delayText = [delay.getText()];
  const delayAt = bare(delay);
  if (ts.isIdentifier(delayAt)) {
    delayText.push(initializerOf(delayAt, delayAt.text)?.getText() ?? "");
  }
  if (!RETRY_DELAY.test(delayText.join(" "))) {
    return;
  }
  let calls = false;
  const visit = (child: ts.Node): void => {
    if (
      ts.isCallExpression(child) &&
      [name, `this.${name}`].includes(child.expression.getText())
    ) {
      calls = true;
    }
    if (!calls) {
      ts.forEachChild(child, visit);
    }
  };
  visit(run);
  return calls ? `${callee.getText()} → ${name}` : undefined;
};

const asyncLock = (node: ts.Node): string | undefined =>
  ts.isImportDeclaration(node) &&
  ts.isStringLiteral(node.moduleSpecifier) &&
  node.moduleSpecifier.text === "async-lock"
    ? "async-lock"
    : undefined;

const kindsOf = (
  node: ts.Node,
  names: ReadonlySet<string>
): { kind: Kind; shape: string } | undefined => {
  if (ts.isCallExpression(node)) {
    const map = perKeyChain(node);
    if (map) {
      return { kind: "per-key-chain", shape: map };
    }
  }
  if (ts.isBinaryExpression(node)) {
    const target = promiseChain(node);
    if (target) {
      return { kind: "promise-chain", shape: target };
    }
  }
  if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
    const wait =
      timedLoop(node, names) ??
      (ts.isCallExpression(node) ? timerRetry(node) : undefined);
    if (wait) {
      return { kind: "timed-loop", shape: wait };
    }
  }
  const lock = asyncLock(node);
  return lock ? { kind: "async-lock", shape: lock } : undefined;
};

const found: Found[] = [];
/** Whether `dir` holds a TypeScript project of its own that extends the browser's (tsconfig.browser.json): code a page runs, not the daemon's. */
const browserDirs = new Map<string, boolean>();
const isBrowserDir = (dir: string): boolean => {
  const known = browserDirs.get(dir);
  if (known !== undefined) {
    return known;
  }
  const config = join(ROOT, dir, "tsconfig.json");
  const browser =
    existsSync(config) &&
    readFileSync(config, "utf8").includes("tsconfig.browser.json");
  browserDirs.set(dir, browser);
  return browser;
};
/** Whether `file` is built for a page: a directory under its package's src, or src itself, is a browser project. */
const inPage = (file: string): boolean => {
  const parts = file.split("/");
  for (let end = 3; end < parts.length; end += 1) {
    if (isBrowserDir(parts.slice(0, end).join("/"))) {
      return true;
    }
  }
  return false;
};

for (const file of repoFiles(["packages/hub/src", "packages/agent/src"])) {
  if (!SCOPE.test(file) || SKIPPED.test(file) || inPage(file)) {
    continue;
  }
  const source = parsed(file, readFileSync(join(ROOT, file), "utf8"));
  const names = waitNames(source);
  const visit = (node: ts.Node): void => {
    const hit = kindsOf(node, names);
    if (hit) {
      found.push({
        file,
        line: source.getLineAndCharacterOfPosition(node.getStart()).line + 1,
        rule: hit.kind,
        shape: hit.shape,
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}

const listAt = process.argv.indexOf("--list");
if (listAt === -1) {
  holdRatchet(found, {
    name: "effect-ratchet",
    baseline: join(ROOT, "scripts/effect-ratchet.baseline.tsv"),
    rules: KINDS,
  });
} else {
  const kind = process.argv[listAt + 1];
  for (const one of found.filter((each) => each.rule === kind)) {
    process.stdout.write(`${one.file}:${one.line}\t${one.shape}\n`);
  }
}
