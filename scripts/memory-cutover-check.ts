/**
 * `bun scripts/memory-cutover-check.ts` (part of `bun run check`): the rules
 * the project's memory stands on, each read off the source. A project's
 * memory is its rules file, AGENTS.md, changed through `memory_rule` at the
 * person's word (hub memory.ts, the cut of 2026-11-26).
 *
 * C1, no way back. No line of code under a package's or an app's src/
 * names a part the memory left behind, as a whole word (a comment may, as
 * history): the inbox and its tools
 * (`memory_note`, `memory_withdraw`, `inboxNotes`), the nightly run and its
 * curator (`memory_read`, `memory_apply`, `createMemoryRun`,
 * `curatorPrompt`, the role and routine target `"curator"`), the brief's
 * selection of knowledge lines and the run's read of the person's words
 * (`briefShortlist`, `personSaidIn`), the approval path before the run
 * (`tainted:`, `memory_propose`, `memory_classify`, `MEMORY_PROPOSAL_TOOL`,
 * `waitsForPerson`, the old `memory_note` answer's last sentence), the parts
 * the cut of 2026-11-24 deleted (the ledger's `MemoryLedger` and
 * `parseLedger`, the note labels' `sessionTaints` and `countsTogether`, the
 * reverts' `revertCorrected`, the recovery's `recoveryBrief`, the CawCo
 * tasks' `productTask`, the re-test's `retestIfNew`, and the rebase layer's
 * `againOnConflict` and `readAtHead`), and the limits and gates the owner
 * took off the same day (`changeAuthority`, `nightAdds`, `unusedArchived`,
 * `MEMORY_ARCHIVE_DAYS`, `outsideUrls`).
 *
 * C2, who may say `human`. The hub reads a send of origin `human` as the
 * person's own words (hub db/sends.ts: what he last said, whether his
 * message waits on a reply, the message an answer names), so a message is
 * given that origin only where his words come in, each place named in
 * {@link SPEAKS} with who the person is there. A literal `{ kind: "human" }`
 * anywhere else under packages/hub/src fails, unless it is the argument of
 * one of the reads in {@link READS}, which write no message. A new place
 * joins {@link SPEAKS} with its reason.
 *
 * C3, one way to write. A rules file (AGENTS.md, `lessons/`, `knowledge/`)
 * is read, changed and committed in one turn of the folder's commit queue
 * (project-folder.ts `changeFolderInTurn`), so no writer writes over
 * another: `changeFolderInTurn` is called only from the places in
 * {@link C3_WRITERS} (memory.ts `ruleAsked`, `memory_rule`; memory-cut.ts
 * `cutIn`, the once-only cut), and
 * `writeFolderFile`, `writeFolderFiles` and `changeFolderFiles` are never
 * called with a path under those names (a call's path arguments are read
 * for them).
 *
 * C6, one checked change. `applyLineChange` (memory-lessons.ts), the one
 * change to the rules' lines, is called only in memory.ts, where every rule
 * of a change is checked first.
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

/** The names of the parts the memory left behind (C1), each matched as a whole word. */
const C1_GONE: readonly string[] = [
  "memory_note",
  "memory_withdraw",
  "inboxNotes",
  "memory_read",
  "memory_apply",
  "createMemoryRun",
  "curatorPrompt",
  '"curator"',
  "briefShortlist",
  "personSaidIn",
  "tainted:",
  "memory_propose",
  "memory_classify",
  "MEMORY_PROPOSAL_TOOL",
  "waitsForPerson",
  "The person decides what is kept.",
  "MemoryLedger",
  "parseLedger",
  "sessionTaints",
  "countsTogether",
  "revertCorrected",
  "recoveryBrief",
  "productTask",
  "retestIfNew",
  "againOnConflict",
  "readAtHead",
  "changeAuthority",
  "nightAdds",
  "unusedArchived",
  "MEMORY_ARCHIVE_DAYS",
  "outsideUrls",
];

const WORD = /\w/u;
const REGEX_SPECIAL = /[.*+?^${}()|[\]\\]/gu;
/** A name as C1 finds it: not inside a longer word (`admin_memory_read` names no `memory_read`). */
const c1Pattern = (name: string): RegExp =>
  new RegExp(
    `${WORD.test(name.at(0) ?? "") ? "(?<![\\w])" : ""}${name.replace(REGEX_SPECIAL, "\\$&")}${WORD.test(name.at(-1) ?? "") ? "(?![\\w])" : ""}`,
    "u"
  );
/** A line of a comment: history and the reasons behind a change may name what left (role-budgets.ts's log). */
const COMMENT_LINE = /^\s*(?:\/\/|\/\*|\*)/u;
const C1_PATTERNS = C1_GONE.map((name) => ({
  name,
  pattern: c1Pattern(name),
}));

/** The writes C3 reads, and the places that may write the memory files. */
const C3_WRITES = new Set([
  "writeFolderFile",
  "writeFolderFiles",
  "changeFolderFiles",
]);
/** The one write path of the rules files (C3). */
const C3_TURN = "changeFolderInTurn";
const C3_WRITERS: readonly { file: string; fn: string; who: string }[] = [
  {
    file: "packages/hub/src/memory.ts",
    fn: "ruleAsked",
    who: "memory_rule: a rule added, reworded or removed at the person's word",
  },
  {
    file: "packages/hub/src/memory-cut.ts",
    fn: "cutIn",
    who: "the cut of 2026-11-26, once per project: AGENTS.md's old intro said as it is now, read in the same turn",
  },
];
/** A path argument that names a memory file: by its words, or by the names the code gives them. */
const C3_PATH =
  /AGENTS\.md|\bINDEX_FILE\b|\bAGENTS_FILE\b|["'`]lessons\/|["'`]knowledge\/|\bKNOWLEDGE_DIR\b|\bKNOWLEDGE_ARCHIVE\b|\bLESSONS_DIR\b/u;

/** Where the one change to the memory's lines may be made (C6). */
const C6_MAKER = "packages/hub/src/memory.ts";
const C6_CHANGE = "applyLineChange";

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
      if (COMMENT_LINE.test(line)) {
        return;
      }
      const gone = C1_PATTERNS.find(({ pattern }) => pattern.test(line));
      if (gone) {
        found.push({
          at: `${file}:${at + 1}`,
          why: `names ${gone.name}, a part the memory left behind (scripts/memory-cutover-check.ts C1)`,
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
      continue;
    }
    if (name === C6_CHANGE && file !== C6_MAKER) {
      c6.push({
        at,
        why: "changes the rules' lines outside memory.ts: applyLineChange is called only where every rule of a change is checked first",
      });
    }
    if (C3_WRITES.has(name) && namesMemory(call, source)) {
      c3.push({
        at: `${at}${fn ? ` (${fn})` : ""}`,
        why: "writes a rules file around the one write path: a rule change is read, worked out and committed in one turn of the folder's queue (project-folder.ts changeFolderInTurn), from memory.ts ruleAsked",
      });
    }
    if (name === C3_TURN && !mayWrite(file, fn)) {
      c3.push({
        at: `${at}${fn ? ` (${fn})` : ""}`,
        why: "commits through changeFolderInTurn outside memory.ts ruleAsked: a new writer of the folder in one turn joins C3_WRITERS in scripts/memory-cutover-check.ts with what it writes",
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
  `memory-cutover-check: C1, C2, C3 and C6 hold: none of the ${C1_GONE.length} parts the memory left behind is named; the person's origin is given in ${SPEAKS.length} places, read in ${READS.length}; the rules files are written through changeFolderInTurn, from memory.ts ruleAsked and the once-only cut alone; the rules' lines change through applyLineChange in memory.ts alone`
);
