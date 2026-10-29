/**
 * The runner the dashboard's `.svelte` checks share: the files named on the
 * command line, else every `.svelte` under src/, each read and checked;
 * every hit printed as `file:line  what`, and the run failing once with the
 * check's own words when there is one.
 */
import { readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { repoFiles } from "../../../scripts/lib/repo-files";

const ROOT = join(import.meta.dir, "..");
const SVELTE_FILE = /\.svelte$/u;

export interface SvelteHit {
  file: string;
  line: number;
}

export function runSvelteCheck<H extends SvelteHit>(check: {
  /** The hits in one file, by its path from here and its source. */
  find: (file: string, source: string) => H[];
  /** What a hit says after its `file:line`. */
  said: (hit: H) => string;
  /** The run's last line when it fails, by how many hits. */
  failed: (count: number) => string;
  /** The run's line when it passes, by how many files it read. */
  passed: (files: number) => string;
}): void {
  const named = process.argv.slice(2);
  const files = (
    named.length > 0
      ? named.map((one) => join(process.cwd(), one))
      : repoFiles(["src"], ROOT).map((file) => join(ROOT, file))
  ).filter((file) => SVELTE_FILE.test(file));
  const hits = files.flatMap((file) =>
    check.find(relative(process.cwd(), file), readFileSync(file, "utf8"))
  );
  if (hits.length > 0) {
    for (const one of hits) {
      console.error(`${one.file}:${one.line}  ${check.said(one)}`);
    }
    console.error(check.failed(hits.length));
    process.exit(1);
  }
  console.log(check.passed(files.length));
}
