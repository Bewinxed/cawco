/**
 * Holds the number of numeric spacing and sizing utilities in the
 * dashboard's class strings (`gap-2`, `p-1.5`, `-mt-0.5`, `phone:h-9`) from
 * rising. The owner kept Tailwind's numeric step (`--spacing`, theme.css) so
 * a value no token carries keeps its utility through the cutover to the
 * token theme; each such class is a value waiting for a token, so their
 * number may fall, never rise. A zero (`m-0`, `inset-0`, which a `margin: 0`
 * becomes), a fraction (`w-1/2`) and a keyword (`w-full`, `h-px`) are not
 * counted. The class strings are the ones scripts/class-strings.ts reads.
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

const BASELINE = join(DASHBOARD, "scripts/spacing-ratchet.baseline.json");

interface Baseline {
  count: number;
  files: Record<string, number>;
}

/** Each file's numeric spacing and sizing utilities. */
async function counted(): Promise<Record<string, number>> {
  const files: Record<string, number> = {};
  for (const { path, source } of await dashboardSources()) {
    const n = classTokens(path, source).filter((t) => {
      const step = SPACING_UTILITY.exec(t.parsed.base)?.[3];
      return step !== undefined && Number(step) !== 0;
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
  say(`spacing-ratchet: baseline written, ${count} numeric spacing utilities`);
} else {
  const baseline = (await Bun.file(BASELINE).json()) as Baseline;
  if (count > baseline.count) {
    say(
      `spacing-ratchet: ${count} numeric spacing utilities, up from ${baseline.count}. Use a token's utility (theme.css), or a token, instead:`
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
      `spacing-ratchet: ${count} numeric spacing utilities (baseline ${baseline.count})`
    );
  }
}
