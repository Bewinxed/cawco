/**
 * `bun scripts/memory-cutover-check.ts` (part of `bun run check`): the rules
 * the project's memory stands on, each read off the source.
 *
 * C1, no way back. No source under a package's or an app's src/ names
 * the approval path the nightly run replaced: `tainted:` (a note archived
 * unread for its session's web read), `memory_propose`, `memory_classify`,
 * `waitsForPerson`, or the old `memory_note` answer's last sentence. The
 * one line in {@link C1_KEPT} stays while a shipped build draws the asks
 * parked under it before the cutover.
 *
 * C2, who may say `human`. The project's nightly memory run reads a send of
 * origin `human` as the person's own words (hub db/sends.ts
 * `personSaidIn`), so a message is given that origin only where his words
 * come in, each place named in {@link SPEAKS} with who the person is there.
 * A literal `{ kind: "human" }` anywhere else under packages/hub/src fails,
 * unless it is the argument of one of the reads in {@link READS}, which
 * write no message. A new place joins {@link SPEAKS} with its reason.
 *
 * C3, one writer. `writeFolderFile`, `writeFolderFiles` and
 * `changeFolderFiles` are called with a path under AGENTS.md, `lessons/` or
 * `knowledge/` only from memory-run.ts, and from memory.ts's `makeNote` (the
 * person's own note). A call's path arguments are read for those names.
 *
 * C6, one checked change. `new CheckedOp(` (memory-lessons.ts), the only
 * change `applyOp` takes, is made only in memory-run.ts, where every rule of
 * an operation is checked first.
 *
 * Exits 1 naming each place that breaks a rule.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { ROOT, repoFiles } from "./lib/repo-files";

// Read at run time beyond its imports; check.ts keys the check on them.
export const checkReads = ["packages/", "apps/"];

const HUB_SOURCE = "packages/hub/src";

/** The names of the path the nightly run replaced (C1). */
const C1_GONE: readonly string[] = [
  "tainted:",
  "memory_propose",
  "memory_classify",
  "waitsForPerson",
  "The person decides what is kept.",
];

/** Lines that keep one of {@link C1_GONE}, each with why. */
const C1_KEPT: readonly { file: string; line: string; why: string }[] = [
  {
    file: "packages/core/src/permission-presentation.ts",
    line: 'export const MEMORY_PROPOSAL_TOOL = "mcp__cawco__memory_propose";',
    why: "the name the asks parked before the cutover carry, which a shipped build still draws",
  },
];

/** The writes C3 reads, and the places that may write the memory files. */
const C3_WRITES = new Set([
  "writeFolderFile",
  "writeFolderFiles",
  "changeFolderFiles",
]);
const C3_WRITERS: readonly { file: string; fn: string }[] = [
  { file: "packages/hub/src/memory-run.ts", fn: "" },
  { file: "packages/hub/src/memory.ts", fn: "makeNote" },
];
/** A path argument that names a memory file: by its words, or by the names the code gives them. */
const C3_PATH =
  /AGENTS\.md|\bINDEX_FILE\b|\bAGENTS_FILE\b|["'`]lessons\/|["'`]knowledge\/|\bKNOWLEDGE_DIR\b|\bKNOWLEDGE_ARCHIVE\b|\bLESSONS_DIR\b/u;

/** Where a checked change may be made (C6). */
const C6_MAKER = "packages/hub/src/memory-run.ts";

/** Where a message is given the person's origin: the file, the function that does it ("" for any in the file), and who he is there. */
const SPEAKS: readonly { file: string; fn: string; who: string }[] = [
  {
    file: "packages/hub/src/stream.ts",
    fn: "",
    who: "the dashboard's socket: a send typed by the person in a browser he signed in",
  },
  {
    file: "packages/hub/src/caw.ts",
    fn: "",
    who: "his words to a project's conversation and his task comments",
  },
  {
    file: "packages/hub/src/moves.ts",
    fn: "",
    who: "the first prompt he typed into New session",
  },
  {
    file: "packages/hub/src/sends.ts",
    fn: "personsMessage",
    who: 'his words as a project event carries them to a session (caw.ts PersonsSend `by: "you"`)',
  },
];

/** Calls that read whether the person may act, passing his origin and writing no message: by file and the called name. */
const READS: readonly { callee: string; file: string }[] = [
  { file: "packages/hub/src/server.ts", callee: "inputRefusal" },
  { file: "packages/hub/src/server.ts", callee: "refusal" },
  { file: "packages/hub/src/artifact-events.ts", callee: "refusal" },
];

interface Found {
  at: string;
  why: string;
}

/** Whether `node` is the object literal `{ kind: "human" }` (with any `as const`). */
const isHumanOrigin = (node: ts.Node): node is ts.ObjectLiteralExpression => {
  if (!ts.isObjectLiteralExpression(node)) {
    return false;
  }
  return node.properties.some((property) => {
    if (!(
      ts.isPropertyAssignment(property) &&
      (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)) &&
      property.name.text === "kind"
    )) {
      return false;
    }
    let value: ts.Expression = property.initializer;
    while (ts.isAsExpression(value) || ts.isSatisfiesExpression(value)) {
      value = value.expression;
    }
    return ts.isStringLiteralLike(value) && value.text === "human";
  });
};

/** The name of the nearest function `node` stands in: a declared function, or the variable or property a function is assigned to. */
const enclosingName = (node: ts.Node): string => {
  for (let at = node.parent; at; at = at.parent) {
    if (ts.isFunctionDeclaration(at) && at.name) {
      return at.name.text;
    }
    if (
      (ts.isArrowFunction(at) || ts.isFunctionExpression(at)) &&
      at.parent &&
      (ts.isVariableDeclaration(at.parent) ||
        ts.isPropertyAssignment(at.parent)) &&
      ts.isIdentifier(at.parent.name)
    ) {
      return at.parent.name.text;
    }
    if (ts.isMethodDeclaration(at) && ts.isIdentifier(at.name)) {
      return at.name.text;
    }
  }
  return "";
};

/** The name a call's callee ends in: `refusal` for `ctx.workItems.refusal(…)`. */
const calleeName = (call: ts.CallExpression): string => {
  const callee = call.expression;
  if (ts.isIdentifier(callee)) {
    return callee.text;
  }
  return ts.isPropertyAccessExpression(callee) ? callee.name.text : "";
};

const c2 = (): Found[] => {
  const found: Found[] = [];
  for (const file of repoFiles([HUB_SOURCE]).filter((path) =>
    path.endsWith(".ts")
  )) {
    const text = readFileSync(join(ROOT, file), "utf8");
    if (!text.includes("human")) {
      continue;
    }
    const source = ts.createSourceFile(
      file,
      text,
      ts.ScriptTarget.Latest,
      true
    );
    const visit = (node: ts.Node): void => {
      if (isHumanOrigin(node)) {
        const fn = enclosingName(node);
        const spoken = SPEAKS.some(
          (place) => place.file === file && (place.fn === "" || place.fn === fn)
        );
        const { parent } = node;
        const read =
          ts.isCallExpression(parent) &&
          READS.some(
            (each) => each.file === file && each.callee === calleeName(parent)
          );
        if (!(spoken || read)) {
          const { line } = source.getLineAndCharacterOfPosition(
            node.getStart(source)
          );
          found.push({
            at: `${file}:${line + 1}${fn ? ` (${fn})` : ""}`,
            why: "gives a message the person's origin outside the places his words come in; a session's send speaks as itself (sends.ts SessionSend), and a new place of his joins SPEAKS in scripts/memory-cutover-check.ts with who he is there",
          });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return found;
};

const SOURCE_DIR = /^(packages|apps)\/[^/]+\/src\//u;
const SOURCE_FILE = /\.(ts|svelte|swift)$/u;

const sources = (): string[] =>
  repoFiles(["packages", "apps"]).filter(
    (path) => SOURCE_DIR.test(path) && SOURCE_FILE.test(path)
  );

const c1 = (): Found[] => {
  const found: Found[] = [];
  for (const file of sources()) {
    const lines = readFileSync(join(ROOT, file), "utf8").split("\n");
    lines.forEach((line, at) => {
      const gone = C1_GONE.find((name) => line.includes(name));
      if (
        gone &&
        !C1_KEPT.some((kept) => kept.file === file && line.trim() === kept.line)
      ) {
        found.push({
          at: `${file}:${at + 1}`,
          why: `names ${gone}, of the memory approval path the nightly run replaced (memory-run.ts)`,
        });
      }
    });
  }
  return found;
};

/** Each call in the hub's source, with the file it is in, the function it stands in, and its argument's text. */
const hubCalls = function* () {
  for (const file of repoFiles([HUB_SOURCE]).filter((path) =>
    path.endsWith(".ts")
  )) {
    const text = readFileSync(join(ROOT, file), "utf8");
    const source = ts.createSourceFile(
      file,
      text,
      ts.ScriptTarget.Latest,
      true
    );
    const calls: { call: ts.CallExpression | ts.NewExpression; fn: string }[] =
      [];
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
        calls.push({ call: node, fn: enclosingName(node) });
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    for (const { call, fn } of calls) {
      yield { file, fn, call, source };
    }
  }
};

/** The name a call's or a `new`'s callee ends in. */
const calledName = (callee: ts.Expression): string => {
  if (ts.isIdentifier(callee)) {
    return callee.text;
  }
  return ts.isPropertyAccessExpression(callee) ? callee.name.text : "";
};

/** Whether a write's path arguments name a memory file (C3). */
const namesMemory = (call: ts.CallExpression, source: ts.SourceFile): boolean =>
  call.arguments.slice(1, 3).some((arg) => C3_PATH.test(arg.getText(source)));

/** Whether function `fn` of `file` is one of the memory files' writers (C3). */
const mayWrite = (file: string, fn: string): boolean =>
  C3_WRITERS.some(
    (place) => place.file === file && (place.fn === "" || place.fn === fn)
  );

const c3c6 = (): { c3: Found[]; c6: Found[] } => {
  const c3: Found[] = [];
  const c6: Found[] = [];
  for (const { file, fn, call, source } of hubCalls()) {
    const name = calledName(call.expression);
    const at = `${file}:${source.getLineAndCharacterOfPosition(call.getStart(source)).line + 1}`;
    if (ts.isNewExpression(call)) {
      if (name === "CheckedOp" && file !== C6_MAKER) {
        c6.push({
          at,
          why: "makes a CheckedOp outside memory-run.ts: a change reaches applyOp only through memory-run.ts `checked`",
        });
      }
      continue;
    }
    if (
      C3_WRITES.has(name) &&
      namesMemory(call, source) &&
      !mayWrite(file, fn)
    ) {
      c3.push({
        at: `${at}${fn ? ` (${fn})` : ""}`,
        why: "writes a memory file outside memory-run.ts and makeNote: the nightly run is its one writer, and its checks stand between any source and the file",
      });
    }
  }
  return { c3, c6 };
};

const written = c3c6();
const found = [
  ...c1().map((each) => ({ rule: "C1", ...each })),
  ...c2().map((each) => ({ rule: "C2", ...each })),
  ...written.c3.map((each) => ({ rule: "C3", ...each })),
  ...written.c6.map((each) => ({ rule: "C6", ...each })),
];
if (found.length > 0) {
  for (const each of found) {
    console.error(`${each.rule} ${each.at}: ${each.why}`);
  }
  process.exit(1);
}
console.log(
  `memory-cutover-check: C1, C2, C3 and C6 hold: the approval path is named nowhere (${C1_KEPT.length} line kept for shipped builds); the person's origin is given in ${SPEAKS.length} places, read in ${READS.length}; the memory files are written by memory-run.ts and makeNote alone; a checked change is made in memory-run.ts alone`
);
