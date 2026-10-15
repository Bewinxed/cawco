/**
 * `bun run machine-paths:check`: nothing makes a `MachinePath` but its one
 * constructor, core's `machinePath` (packages/core/src/machine-path.ts). A
 * cast to the brand (`as MachinePath`, `<MachinePath>value`) or a type guard
 * that answers it (`value is MachinePath`) anywhere else fails the check
 * with its file and line: the brand means the path went through the rules
 * (absolute, `~` resolved against its machine's home, normalised), and a
 * cast would let a raw string past them.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(import.meta.dir, "..");

/** Where the sources are. */
const SOURCES = [
  "apps/dashboard/src",
  "packages/agent/src",
  "packages/auth/src",
  "packages/cli/src",
  "packages/core/src",
  "packages/hub/src",
  "packages/hub/scripts",
  "packages/sessiond/src",
  "scripts",
];

/** The brand's own module, the one place that may make it, and this check. */
const ALLOWED = new Set([
  "packages/core/src/machine-path.ts",
  "scripts/machine-paths-check.ts",
]);

const EXTENSIONS = /\.(?:ts|tsx|mts|cts|svelte)$/;
const SKIP_DIRS = new Set(["node_modules", ".svelte-kit", "dist", "build"]);

/**
 * A cast to the brand (`as MachinePath`, an old-style `<MachinePath>value`,
 * which no word or `$` precedes, unlike a generic such as Drizzle's
 * `$type<MachinePath>()`), or a guard that answers it.
 */
const MINTS =
  /\bas\s+MachinePath\b|(?<![\w$])<MachinePath>|\bis\s+MachinePath\b/;

const walk = (dir: string, out: string[]): void => {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of names) {
    const path = join(dir, name);
    if (SKIP_DIRS.has(name)) {
      continue;
    }
    if (statSync(path).isDirectory()) {
      walk(path, out);
    } else if (EXTENSIONS.test(name)) {
      out.push(path);
    }
  }
};

const files: string[] = [];
for (const source of SOURCES) {
  walk(join(ROOT, source), files);
}

const hits: string[] = [];
for (const file of files) {
  const rel = relative(ROOT, file);
  if (ALLOWED.has(rel)) {
    continue;
  }
  const lines = readFileSync(file, "utf8").split("\n");
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
