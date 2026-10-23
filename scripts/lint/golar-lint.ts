/**
 * `golar lint` as `bun run check` runs it (scripts/check.ts): Golar's rules
 * (golar.config.ts: the switch check and the design rules) over the files
 * `CAWCO_CHECK_FILES` names, or every file when it is unset, and over the
 * fixtures, held to their list (lint/fixtures/expected.txt).
 *
 * The rules must report each planted finding at its place and nothing else
 * there: a rule that quietly reads nothing finds nothing, and fails here
 * instead of passing in silence. A finding outside the fixtures fails the
 * run.
 *
 * Golar runs under Node, which must be on PATH: it does not run under Bun
 * (auvred/golar#31). Its `lint` exits 1 when a rule reported (the Golar
 * fork, Bewinxed/golar 0.1.11-cawco.1), which a run always does, for the
 * fixtures.
 */
import { realpathSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "../..");
const GOLAR = join(ROOT, "node_modules/golar/dist/bin.js");
const FIXTURES = "scripts/lint/fixtures/";
/** A report as Golar prints it: `path:line:column: rule: message`. */
const SPACES = /\s+/;
const FINDING = /^(\S[^:]*):(\d+):(\d+): ([\w/-]+): /;

const fail = (why: string, said = ""): never => {
  if (said) {
    console.error(said);
  }
  console.error(`golar lint: ${why}`);
  process.exit(1);
};

const node = Bun.which("node");
if (!node) {
  fail("needs Node on PATH: Golar does not run under Bun");
}
// `bun run` puts a `node` of its own on PATH when the machine has none.
if (realpathSync(node as string) === realpathSync(process.execPath)) {
  fail(`\`node\` on PATH is Bun (${node}); Golar needs Node itself`);
}

interface Expected {
  column: number;
  file: string;
  line: number;
  rule: string;
}
const expected: Expected[] = (
  await Bun.file(join(ROOT, FIXTURES, "expected.txt")).text()
)
  .split("\n")
  .filter((line) => line.trim() && !line.startsWith("#"))
  .map((line) => {
    const [place = "", rule = ""] = line.trim().split(SPACES);
    const [file = "", at = "0", column = "0"] = place.split(":");
    return {
      file,
      line: Number(at),
      column: Number(column),
      rule,
    };
  });

const golar = Bun.spawnSync([node as string, GOLAR, "lint"], {
  cwd: ROOT,
  env: process.env,
  stdout: "pipe",
  stderr: "pipe",
});
const output = `${golar.stdout}${golar.stderr}`.trim();
const findings = output.split("\n").flatMap((line) => {
  const m = FINDING.exec(line);
  return m
    ? [
        {
          file: m[1] as string,
          line: Number(m[2]),
          column: Number(m[3]),
          rule: m[4] as string,
          text: line,
        },
      ]
    : [];
});

if (golar.exitCode !== 1) {
  fail(
    golar.exitCode === 0
      ? "Golar exited 0, which it does only with no finding at all, so its rules found nothing they must find"
      : `Golar ended with exit ${golar.exitCode ?? `signal ${golar.signalCode}`}`,
    output
  );
}

const proof = findings.filter((f) => f.file.startsWith(FIXTURES));
const found = findings.filter((f) => !f.file.startsWith(FIXTURES));
const matches = (e: Expected, f: (typeof findings)[number]): boolean =>
  e.file === f.file &&
  e.rule === f.rule &&
  e.line === f.line &&
  e.column === f.column;
const missing = expected.filter((e) => !proof.some((f) => matches(e, f)));
const extra = proof.filter((f) => !expected.some((e) => matches(e, f)));
if (missing.length > 0 || extra.length > 0) {
  fail(
    `the fixtures' findings are not their list (${FIXTURES}expected.txt):\n${[
      ...missing.map(
        (e) => `  missing ${e.file}:${e.line}:${e.column} ${e.rule}`
      ),
      ...extra.map((f) => `  extra   ${f.text}`),
    ].join("\n")}`,
    output
  );
}
if (found.length > 0) {
  fail(`${found.length} finding(s)`, found.map((f) => f.text).join("\n"));
}
console.log(
  `golar lint: every rule found its planted mistakes (${proof.length}) and nothing else`
);
