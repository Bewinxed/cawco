/**
 * `bun scripts/setup-draft-check.ts` (part of `bun run check`): a project's
 * setup draft has one editor, the board's (decision page
 * `onboarding-first-minutes`, card `draft-where`).
 *
 * - The board's draft (project/SetupDraft.svelte) and the setup page's
 *   Setup (decisions/host/Setup.svelte) each draw it with DraftStages, so
 *   both read and write the same picks with the same parts.
 * - The decision host keeps no stage rows of its own: nothing stands under
 *   decisions/host/setup/, where the Reminders rows (StageRow, SetupStages,
 *   RemovedLine: a minus, then Remove) stood until the person rejected
 *   them on a design page.
 *
 * Exits 1 naming each file that breaks either.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Read at run time beyond its imports; check.ts keys the check on them.
export const checkReads = ["apps/dashboard/src/lib/cawco/"];

const ROOT = join(import.meta.dir, "..");
const CAWCO = "apps/dashboard/src/lib/cawco";
/** The host's old folder of stage rows: nothing may stand there again. */
const OLD_ROWS = `${CAWCO}/decisions/host/setup/`;
/** The draft's two surfaces, each drawing it with DraftStages. */
const DRAWERS = [
  `${CAWCO}/project/SetupDraft.svelte`,
  `${CAWCO}/decisions/host/Setup.svelte`,
];
const DRAWS = /import DraftStages from "[^"]*\/DraftStages\.svelte";/u;

const faults: string[] = [];
const files = Bun.spawnSync(
  [
    "git",
    "ls-files",
    "--cached",
    "--others",
    "--exclude-standard",
    "--",
    OLD_ROWS,
  ],
  {
    cwd: ROOT,
    env: process.env,
  }
)
  .stdout.toString()
  .split("\n")
  .filter(Boolean);
for (const file of files) {
  faults.push(
    `${file}: the decision host draws the setup draft with the board's DraftStages; no stage rows of its own stand under ${OLD_ROWS}`
  );
}
for (const file of DRAWERS) {
  let text = "";
  try {
    text = readFileSync(join(ROOT, file), "utf8");
  } catch {
    faults.push(`${file}: missing, so it can't draw the setup draft`);
    continue;
  }
  if (!DRAWS.test(text)) {
    faults.push(
      `${file}: draws the setup draft without DraftStages, the one editor of it`
    );
  }
}
if (faults.length > 0) {
  console.error(faults.join("\n"));
  process.exit(1);
}
console.log(
  `setup draft: one editor (DraftStages) in ${DRAWERS.length} surfaces, nothing under ${OLD_ROWS}`
);
