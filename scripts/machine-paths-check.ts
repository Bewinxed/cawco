/**
 * `bun run machine-paths:check`: nothing makes a `MachinePath` but its one
 * constructor, core's `machinePath` (packages/core/src/machine-path.ts). A
 * cast to the brand (`as MachinePath`, `<MachinePath>value`) or a type guard
 * that answers it (`value is MachinePath`) anywhere else fails the check
 * with its file and line: the brand means the path went through the rules
 * (absolute, `~` resolved against its machine's home, normalised), and a
 * cast would let a raw string past them.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CODE_ROOTS, ROOT, repoFiles } from "./lib/repo-files";

/** The brand's own module, the one place that may make it, and this check. */
const ALLOWED = new Set([
  "packages/core/src/machine-path.ts",
  "scripts/machine-paths-check.ts",
]);

const EXTENSIONS = /\.(?:ts|tsx|mts|cts|svelte)$/u;

/**
 * A cast to the brand (`as MachinePath`, an old-style `<MachinePath>value`,
 * which no word or `$` precedes, unlike a generic such as Drizzle's
 * `$type<MachinePath>()`), or a guard that answers it.
 */
const MINTS =
  /\bas\s+MachinePath\b|(?<![\w$])<MachinePath>|\bis\s+MachinePath\b/u;

const files = repoFiles(CODE_ROOTS).filter((file) => EXTENSIONS.test(file));

const hits: string[] = [];
for (const rel of files) {
  if (ALLOWED.has(rel)) {
    continue;
  }
  const lines = readFileSync(join(ROOT, rel), "utf8").split("\n");
  for (const [index, line] of lines.entries()) {
    if (MINTS.test(line)) {
      hits.push(`${rel}:${index + 1}: ${line.trim()}`);
    }
  }
}

if (hits.length > 0) {
  console.error(
    `A MachinePath is made by core's machinePath alone; these make one another way:\n${hits.join("\n")}`
  );
  process.exit(1);
}
console.log(
  `machine paths: ${files.length} files, every MachinePath made by core's machinePath`
);
