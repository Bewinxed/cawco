/**
 * `bun run typecheck:coverage`: every tracked TypeScript file belongs to
 * exactly one project that `bun run typecheck` checks. A file no project
 * includes is never type-checked; a file two projects include is checked
 * under two sets of settings, and passing one says nothing of the other.
 *
 * The projects are the repository's tracked `tsconfig*.json` files, each
 * read as `tsc` reads it (its `include`, `exclude` and `files`, through
 * `extends`). `tsconfig.base.json` is the shared settings every project
 * extends and includes nothing of its own. The dashboard's project extends
 * SvelteKit's generated config, so `svelte-kit sync` runs before this (the
 * dashboard's own `typecheck` does, earlier in the chain).
 */
import { dirname, join, relative } from "node:path";
import ts from "typescript";

const ROOT = join(import.meta.dir, "..");
const BASE = "tsconfig.base.json";

const tracked = async (...patterns: string[]): Promise<string[]> =>
  (await Bun.$`git -C ${ROOT} ls-files -- ${patterns}`.text())
    .split("\n")
    .filter(Boolean);

const projects = (await tracked("tsconfig*.json", "**/tsconfig*.json")).filter(
  (path) => !path.endsWith(BASE)
);

const owners = new Map<string, string[]>();
for (const project of projects) {
  const parsed = ts.getParsedCommandLineOfConfigFile(
    join(ROOT, project),
    {},
    {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
        throw new Error(
          `${project}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")}`
        );
      },
    }
  );
  if (!parsed) {
    throw new Error(`${project} did not parse`);
  }
  for (const file of parsed.fileNames) {
    const path = relative(ROOT, file);
    owners.set(path, [...(owners.get(path) ?? []), project]);
  }
}

const sources = await tracked("*.ts", "*.tsx", "*.mts", "*.cts");
const unowned = sources.filter((path) => !owners.has(path));
const shared = sources.filter((path) => (owners.get(path)?.length ?? 0) > 1);

for (const path of unowned) {
  console.error(`${path}: in no project (nearest: ${dirname(path)})`);
}
for (const path of shared) {
  console.error(`${path}: in ${owners.get(path)?.join(" and ")}`);
}
if (unowned.length > 0 || shared.length > 0) {
  process.exit(1);
}
console.log(
  `typecheck coverage: ${sources.length} TypeScript files, each in one of ${projects.length} projects`
);
