/**
 * Holds the number of rhythm utilities in the dashboard's class strings from
 * rising. Rhythm is padding, margin, `gap` and `space-x`/`space-y` with a
 * numeric step (`p-1.5`, `-mt-0.5`, `gap-2`, `phone:px-3`): it stays on the
 * house steps (`p-space-2`, `gap-space-4`), so the count may fall, never rise.
 * A zero (`m-0`), a fraction and a keyword are not counted.
 *
 * Sizes are not counted: width, height, `size`, min and max sizes, `inset`
 * and the side offsets, `basis`, `translate`. The theme holds what several
 * places share; a size only one place needs is a number on Tailwind's scale
 * (`w-104`) and mints no token. The class strings are the ones
 * scripts/class-strings.ts reads.
 *
 *   bun scripts/spacing-ratchet.ts                   exits 1 when the count rose
 *   bun scripts/spacing-ratchet.ts --write-baseline  after a rebase or a cleanup
 */
import { join } from "node:path";
import {
  classTokens,
  DASHBOARD,
  dashboardSources,
  SPACING_UTILITY,
} from "./class-strings";

/** The utilities that are rhythm: padding, margin, gap, space. */
const RHYTHM = /^(?:[pm][xystblrse]?|gap(?:-[xy])?|space-[xy])$/u;

// Read at run time beyond its imports; check.ts keys the check on them.
export const checkReads = [
  "apps/dashboard/src/",
  "apps/dashboard/scripts/spacing-ratchet.baseline.json",
];

const BASELINE = join(DASHBOARD, "scripts/spacing-ratchet.baseline.json");

interface Baseline {
  count: number;
  files: Record<string, number>;
}

/** Each file's numeric rhythm utilities. */
async function counted(): Promise<Record<string, number>> {
  const files: Record<string, number> = {};
  for (const { path, source } of await dashboardSources()) {
    const n = classTokens(path, source).filter((t) => {
      const m = SPACING_UTILITY.exec(t.parsed.base);
      return m !== null && RHYTHM.test(m[2] ?? "") && Number(m[3]) !== 0;
    }).length;
    if (n > 0) {
      files[path] = n;
    }
  }
  return files;
}

const files = await counted();
const count = Object.values(files).reduce((a, b) => a + b, 0);
const say = (s: string) => process.stdout.write(`${s}\n`);

if (process.argv.includes("--write-baseline")) {
  const baseline: Baseline = { count, files };
  await Bun.write(BASELINE, `${JSON.stringify(baseline, null, 2)}\n`);
  say(`spacing-ratchet: baseline written, ${count} rhythm utilities`);
} else {
  const baseline = (await Bun.file(BASELINE).json()) as Baseline;
  if (count > baseline.count) {
    say(
      `spacing-ratchet: ${count} rhythm utilities, up from ${baseline.count}. Use a token's utility (theme.css), or a token, instead:`
    );
    for (const [path, n] of Object.entries(files)) {
      const before = baseline.files[path] ?? 0;
      if (n > before) {
        say(`  ${path}: ${before} → ${n}`);
      }
    }
    process.exitCode = 1;
  } else {
    say(
      `spacing-ratchet: ${count} rhythm utilities (baseline ${baseline.count})`
    );
  }
}
