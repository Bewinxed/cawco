/**
 * `bun scripts/memory-cutover-check.ts` (part of `bun run check`): the rules
 * the project's memory stands on, each read off the source.
 *
 * C2, who may say `human`. The project's nightly memory run reads a send of
 * origin `human` as the person's own words (hub db/sends.ts
 * `personSaidIn`), so a message is given that origin only where his words
 * come in, each place named in {@link SPEAKS} with who the person is there.
 * A literal `{ kind: "human" }` anywhere else under packages/hub/src fails,
 * unless it is the argument of one of the reads in {@link READS}, which
 * write no message. A new place joins {@link SPEAKS} with its reason.
 *
 * Exits 1 naming each place that breaks a rule.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { ROOT, repoFiles } from "./lib/repo-files";

// Read at run time beyond its imports; check.ts keys the check on them.
export const checkReads = ["packages/hub/src/"];

const HUB_SOURCE = "packages/hub/src";

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

const found = [...c2().map((each) => ({ rule: "C2", ...each }))];
if (found.length > 0) {
  for (const each of found) {
    console.error(`${each.rule} ${each.at}: ${each.why}`);
  }
  process.exit(1);
}
console.log(
  `memory-cutover-check: C2 holds: the person's origin is given in ${SPEAKS.length} places, read in ${READS.length}`
);
