/**
 * `bun run typecheck`: every check the repository's type and generated-artifact
 * gate is made of, run at once (lib/checks.ts: each in its own process, each
 * with a time limit, what each printed whole when it ends).
 *
 * The checks: every workspace package's own `typecheck` script; the
 * generated-artifact checks (openapi, hub migrations, role budgets, openui views, the Swift
 * tool presentation, Claude Code paths, Apple operations, the Swift words,
 * every signal through core's signalling module);
 * the machine handover protocol's sweep (protocol-sweep.ts: its laws over
 * every short schedule of the reducer, and each named mutant caught); the
 * root, scripts and probe-kit TypeScript projects; and typecheck coverage,
 * after the dashboard's (its project extends the config `svelte-kit sync`
 * writes there).
 *
 * Run one after another these took 27–66 s, mostly waiting on the dashboard's
 * svelte-check and the openapi check in turn; together they take as long as
 * the longest (tooling-speed.md).
 *
 * A heavy run (lib/heavy-run.ts): svelte-check and tsc together take most of
 * the machine's cores and several GiB, so it starts only while one of the
 * machine's slots is free and the machine has room, and holds the slot until
 * every check has ended. Under a run that holds one already (`cawco
 * heavy-run`), it counts once.
 */
import { join } from "node:path";
import { type Check, runChecks } from "./lib/checks";
import { heavySlot } from "./lib/heavy-run";

await heavySlot();

const ROOT = join(import.meta.dir, "..");
const BUN = process.execPath;
const TSC = join(ROOT, "node_modules/.bin/tsc");

const manifest = (await Bun.file(join(ROOT, "package.json")).json()) as {
  workspaces: string[];
};
const manifests = manifest.workspaces.flatMap((pattern) => [
  ...new Bun.Glob(`${pattern}/package.json`).scanSync({ cwd: ROOT }),
]);
const packages: Check[] = (
  await Promise.all(
    manifests.map(async (path) => ({
      path,
      pkg: (await Bun.file(join(ROOT, path)).json()) as {
        name: string;
        scripts?: Record<string, string>;
      },
    }))
  )
)
  .filter(({ pkg }) => pkg.scripts?.typecheck)
  .map(({ path, pkg }) => ({
    name: `${pkg.name} typecheck`,
    dir: join(ROOT, path, ".."),
    argv: [BUN, "run", "typecheck"],
  }));
const DASHBOARD = "@cawco/dashboard typecheck";
const script = (dir: string, name: string): Check => ({
  name: `${dir === "." ? "" : `${dir} `}${name}`,
  dir: join(ROOT, dir),
  argv: [BUN, "run", name],
});
const project = (tsconfig: string): Check => ({
  name: `tsc ${tsconfig}`,
  dir: ROOT,
  argv: [TSC, "--project", tsconfig],
});

// The longest first, so they never wait for a free slot.
const checks: Check[] = [
  ...packages.filter((check) => check.name === DASHBOARD),
  script("packages/hub", "openapi:check"),
  script("packages/hub", "migrations:check"),
  ...packages.filter((check) => check.name !== DASHBOARD),
  project("scripts/tsconfig.json"),
  project("scripts/probe-kit/tsconfig.json"),
  project("tsconfig.json"),
  script(".", "claude-paths:check"),
  script(".", "machine-paths:check"),
  script(".", "signal:check"),
  script("packages/hub", "roles:check"),
  script("packages/core", "openui:check"),
  script("packages/core", "tools:check"),
  script(".", "apple-ops:check"),
  script(".", "words:check"),
  script(".", "protocol:sweep"),
  { ...script(".", "typecheck:coverage"), after: DASHBOARD },
];

await runChecks("typecheck", checks);
