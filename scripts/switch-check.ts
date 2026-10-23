/**
 * `bun scripts/switch-check.ts` (part of `bun run lint`): every state is
 * handled. Golar runs the switch check (lint/switch-exhaustiveness.ts) over
 * the dashboard's and every package's `.ts`, `.svelte.ts` and `.svelte`
 * files (golar.config.ts) with typescript-go and svelte2tsx, the compilers
 * `bun run typecheck` uses, so the check reads the types the typecheck does.
 *
 * The check must also report the one unhandled switch in its fixture
 * (lint/fixtures/unhandled-state.ts), at its place, and nothing else there.
 * A check that reads no file, or reads files without their types, finds
 * nothing, and fails here instead of passing in silence.
 *
 * Golar runs under Node, which must be on PATH: it does not run under Bun
 * (auvred/golar#31). Its `lint` exits 1 when a rule reported
 * (patches/golar@0.1.11.patch). Exits 1 on any finding outside the fixture,
 * on a fixture finding missing or different, and when Golar ends any other
 * way.
 */
import { realpathSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const GOLAR = join(ROOT, "node_modules/golar/dist/bin.js");
const FIXTURES = "scripts/lint/fixtures/";
/** The one finding the fixture holds, as Golar prints it. */
const MUST = `${FIXTURES}unhandled-state.ts:11:11: switch-exhaustiveness-check: Switch is not exhaustive. Cases not matched: "landed"`;
/** A report as Golar prints it: `path:line:column: rule: message`. */
const FINDING = /^\S.*:\d+:\d+: switch-exhaustiveness-check: /;

const fail = (why: string, said = ""): never => {
  if (said) {
    console.error(said);
  }
  console.error(`switch check: ${why}`);
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

const golar = Bun.spawnSync([node as string, GOLAR, "lint"], {
  cwd: ROOT,
  stdout: "pipe",
  stderr: "pipe",
});
const output = `${golar.stdout}${golar.stderr}`.trim();
const findings = output.split("\n").filter((line) => FINDING.test(line));
const proof = findings.filter((line) => line.startsWith(FIXTURES));
const found = findings.filter((line) => !line.startsWith(FIXTURES));

if (golar.exitCode !== 1) {
  fail(
    golar.exitCode === 0
      ? "Golar exited 0, which it does only with no finding at all, so the switch check found nothing it must find"
      : `Golar ended with exit ${golar.exitCode ?? `signal ${golar.signalCode}`}`,
    output
  );
}
if (proof.length !== 1 || proof[0] !== MUST) {
  fail(
    `the switch check found nothing it must find: its fixture's report is\n  ${MUST}\nand it reported\n  ${proof.join("\n  ") || "nothing there"}`,
    output
  );
}
if (found.length > 0) {
  fail(
    `${found.length} switch(es) leave a member unhandled or switch over a value with no type`,
    found.join("\n")
  );
}
console.log(
  "switch check: every switch over a union names each member, and its fixture's unhandled one was found"
);
