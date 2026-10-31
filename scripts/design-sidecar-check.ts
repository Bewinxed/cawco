/**
 * `bun scripts/design-sidecar-check.ts`: `.impeccable/design.json`, the
 * sidecar Impeccable's detector checks every edit against (its ramps,
 * shadows, motion tokens, component snippets and named rules), was written
 * after the last change to what it is drawn from: DESIGN.md and the token
 * source under design/tokens/.
 *
 * Read from git, never from file times. `impeccable doctor --json` reports
 * `design-sidecar-stale` off modification times, which a clone or a checkout
 * sets in whatever order it writes the files (measured 2026-10-31: the same
 * two files read stale or fresh by `touch` alone), and it exits 0 on its
 * findings, so neither its verdict nor its exit code can gate a merge. The
 * sidecar is current when the newest commit to a source is an ancestor of
 * (or is) the newest commit to the sidecar, which a rebase keeps; with
 * uncommitted changes, a changed sidecar is current and a changed source
 * beside an unchanged sidecar is stale.
 *
 * Run by `bun run check` (scripts/check.ts); it fails on a stale sidecar,
 * naming the change that outran it and the fix.
 */
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const SIDECAR = ".impeccable/design.json";
const SOURCES = ["DESIGN.md", "design/tokens/"];
const FIX =
  "Run impeccable document (the design pipeline's System step: DESIGN.md held as it stands, the sidecar reconciled to it and the tokens) and commit .impeccable/design.json with the change.";

const git = async (...argv: string[]): Promise<string> => {
  const result = await Bun.$`git -C ${ROOT} ${argv}`.quiet().nothrow();
  if (result.exitCode !== 0) {
    console.error(
      `design-sidecar-check: git ${argv.join(" ")} failed: ${result.stderr.toString().trim()}`
    );
    process.exit(1);
  }
  return result.stdout.toString().trim();
};
const changed = async (paths: string[]): Promise<boolean> =>
  (await git("status", "--porcelain", "--", ...paths)) !== "";
const lastCommit = (paths: string[]): Promise<string> =>
  git("log", "-1", "--format=%H", "--", ...paths);
const named = (commit: string): Promise<string> =>
  git("log", "-1", "--format=%h (%s)", commit);
const stale = (why: string): never => {
  console.error(`design-sidecar-check: ${SIDECAR} is stale: ${why}\n${FIX}`);
  process.exit(1);
};

if (!(await Bun.file(join(ROOT, SIDECAR)).exists())) {
  stale("it is missing.");
}
if (!(await changed([SIDECAR]))) {
  if (await changed(SOURCES)) {
    stale(
      `${SOURCES.join(" or ")} has uncommitted changes and the sidecar has none.`
    );
  }
  const source = await lastCommit(SOURCES);
  const sidecar = await lastCommit([SIDECAR]);
  if (sidecar === "") {
    stale("no commit has written it.");
  }
  // `--is-ancestor` answers 0 for yes and 1 for no; anything else is an error.
  const ancestor =
    source === ""
      ? 0
      : (
          await Bun.$`git -C ${ROOT} merge-base --is-ancestor ${source} ${sidecar}`
            .quiet()
            .nothrow()
        ).exitCode;
  if (ancestor > 1) {
    console.error(
      `design-sidecar-check: git merge-base --is-ancestor ${source} ${sidecar} failed (${ancestor}).`
    );
    process.exit(1);
  }
  if (ancestor === 1) {
    stale(
      `${await named(source)} changed ${SOURCES.join(" or ")} after ${await named(sidecar)} last wrote it.`
    );
  }
}
console.log(`design-sidecar-check: ${SIDECAR} is current.`);
