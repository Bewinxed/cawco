/**
 * `boundary/` (packages/agent/src/boundary/) stays readable one file at a time:
 *
 * - a file's module-level state is its own: nothing exports a `let`, a `Map`
 *   or a `Set`, and what another file needs goes through a function the
 *   owning file exports;
 * - its files' imports run one way: the calls that must go up are passed
 *   down as a value (`UnaskedCalls`, `boundary/state.ts`).
 *
 * Run by `bun run check`.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const BOUNDARY = new URL("../packages/agent/src/boundary/", import.meta.url)
  .pathname;
const EXPORTED_STATE =
  /^export (?:let\s+\w+|const\s+\w+(?:\s*:\s*[^=\n]+)?\s*=\s*new\s+(?:Map|Set|WeakMap|WeakSet)\b)/gmu;
const IMPORT = /^(?:import|export|\}) .*?from "\.\/([\w-]+)";$/gmu;

const files = readdirSync(BOUNDARY)
  .filter((file) => file.endsWith(".ts"))
  .map((file) => file.slice(0, -".ts".length));

const textOf = (file: string): string =>
  readFileSync(join(BOUNDARY, `${file}.ts`), "utf8");

const exportedState = files.flatMap((file) =>
  (textOf(file).match(EXPORTED_STATE) ?? []).map(
    (line) => `${file}.ts exports its state: ${line}`
  )
);

const imports = new Map(
  files.map((file) => [
    file,
    [...textOf(file).matchAll(IMPORT)].flatMap((found) => found[1] ?? []),
  ])
);

const cycles: string[] = [];
const done = new Set<string>();
const visit = (file: string, path: readonly string[]): void => {
  const at = path.indexOf(file);
  if (at >= 0) {
    cycles.push(
      `an import cycle: ${[...path.slice(at), file].map((one) => `${one}.ts`).join(" -> ")}`
    );
    return;
  }
  if (done.has(file)) {
    return;
  }
  done.add(file);
  for (const next of imports.get(file) ?? []) {
    visit(next, [...path, file]);
  }
};
for (const file of files) {
  visit(file, []);
}

const problems = [...exportedState, ...cycles];
if (problems.length > 0) {
  console.error(problems.join("\n"));
  console.error(
    "boundary: its files keep their own state and import one way (scripts/boundary-check.ts)"
  );
  process.exit(1);
}
console.log(
  `boundary: ${files.length} files export no state and import one way`
);
