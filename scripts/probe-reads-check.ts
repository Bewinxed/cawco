/**
 * Part of `bun run check`: a probe that waits for a page's responses
 * notice (`[cawco:artifact-responses …]`, core `artifactResponsesNotice`)
 * never reads the session's read route itself
 * (`GET /api/instances/:id/artifacts/:artifact`). That route is
 * `artifact_read`: a read through it counts as the session having read the
 * person's answers (it stamps `readSeq`), and answers the session has read
 * settle with nothing sent to it (hub artifacts/needs.ts `answersUnheard`),
 * so the notice the probe waits for never comes. The artifacts spec's leg 5
 * failed on the host so (de28a8786); artifact-responses had before
 * (4c0ef3aa8).
 *
 * Such a probe reads his answers through his view
 * (`GET /api/instances/:id/artifacts/:artifact/view`), and what a session
 * reads through that session's own `artifact_read` tool call. The route
 * answers that session alone (hub hub-auth.ts `sessionReadOf`), so any other
 * probe reads it as the session too (`fleet.sessionApi`), and so moves its
 * read the same way.
 *
 *   bun scripts/probe-reads-check.ts
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";

const ROOT = join(import.meta.dir, "..");
/** A wait for the notice: its tag's name, however the probe matches it. */
const WAITS = /artifact-responses/u;

/** Whether `node` is a call of `.<name>(…)`. */
const callOf = (node: ts.Node, name: string): node is ts.CallExpression =>
  ts.isCallExpression(node) &&
  ts.isPropertyAccessExpression(node.expression) &&
  node.expression.name.text === name;

/** Whether `node` is the session's read of an artifact through Eden (`.instances(…).artifacts(…).get(…)`); its `/view` is the person's. */
const isSessionRead = (node: ts.CallExpression): boolean => {
  const callee = node.expression;
  return (
    ts.isPropertyAccessExpression(callee) &&
    callee.name.text === "get" &&
    callOf(callee.expression, "artifacts") &&
    ts.isPropertyAccessExpression(callee.expression.expression) &&
    callOf(callee.expression.expression.expression, "instances")
  );
};

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

/** Each line of `text` (from `file`) that reads the session's read route. */
const readsIn = (file: string, text: string): string[] => {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const lines: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && isSessionRead(node)) {
      const { line } = source.getLineAndCharacterOfPosition(node.getStart());
      lines.push(`${relative(ROOT, file)}:${line + 1}`);
    }
    node.forEachChild(visit);
  };
  visit(source);
  return lines;
};

/** Each line of `text` (from `file`) that reads the session's read route, when `text` waits for a responses notice. */
export const sessionReads = (file: string, text: string): string[] =>
  WAITS.test(text) ? readsIn(file, text) : [];

/** Planted: a probe waiting for the notice that polls the session's read (line 3) and reads his view (line 4); one that waits for nothing may read it. */
const PLANTED_WAITS = `const told = (one: Seen) => one.last.includes("[cawco:artifact-responses id=");
const read = () =>
  fleet.api((hub) => hub.api.instances({ id }).artifacts({ artifact }).get());
const view = () => fleet.api((hub) => hub.api.instances({ id }).artifacts({ artifact }).view.get());`;
const PLANTED_QUIET = `const read = () =>
  fleet.api((hub) => hub.api.instances({ id }).artifacts({ artifact }).get());`;

if (import.meta.main) {
  const planted = [
    ...sessionReads(join(ROOT, "waits.ts"), PLANTED_WAITS),
    ...sessionReads(join(ROOT, "quiet.ts"), PLANTED_QUIET),
  ];
  if (planted.join() !== "waits.ts:3") {
    console.error(
      `probe-reads: the planted reads read as ${planted.join(", ") || "none"}, not waits.ts:3 alone`
    );
    process.exit(1);
  }
  const refused = filesUnder(join(ROOT, "scripts/probe-kit")).flatMap((file) =>
    sessionReads(file, readFileSync(file, "utf8"))
  );
  if (refused.length > 0) {
    console.error(
      "probe-reads: a probe that waits for a responses notice reads the session's read route, which counts as the session reading his answers, so they settle with no notice. Read his view (…/artifacts/:artifact/view), or read through the session's own artifact_read:"
    );
    for (const at of refused) {
      console.error(`  ${at}`);
    }
    process.exit(1);
  }
  console.log(
    "probe-reads: no probe that waits for a responses notice reads the session's read route"
  );
}
