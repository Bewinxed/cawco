/**
 * `bun run typecheck`: the repository's type and generated-artifact gate,
 * over what the change affects, at once (lib/checks.ts: each check in its own
 * process, each with a time limit, what each printed whole when it ends).
 *
 *   bun run typecheck                 what changed since the branch left
 *                                     origin/main (committed, staged,
 *                                     unstaged and untracked), and every
 *                                     project that depends on it
 *   bun run typecheck --base <ref>    the same against another base
 *   bun run typecheck --all           every project
 *   bun run typecheck --dry           name what it would check, and stop
 *
 * The projects are the repository's TypeScript projects (every tracked
 * `tsconfig*.json` but the shared settings) and the dashboard's Svelte
 * project (its `src/`, and the files at its top). A file belongs to the
 * project whose folder holds it most closely. What a change affects is read
 * off the imports as they stand, on every run: each changed file, every
 * file that imports it (a relative path, `$lib/`, or `@cawco/<name>` through
 * that package's `exports`), every file that imports one of those, and so
 * on; the projects those files belong to are checked, declared dependencies
 * or not. A change to any tsconfig, the lockfile, the root manifest, a
 * patch or this runner affects every project.
 *
 * The TypeScript projects go to one `tsc -b`. The libraries (core, auth,
 * jsonl-parser, agent and its browser overlay and canvas host, hub,
 * sessiond, cli) are `composite`: each is checked once and writes its
 * declarations to `.tsbuild/`, and a project that references it reads those
 * instead of re-checking its source ("Importing modules from a referenced
 * project will instead load its output declaration file (.d.ts)",
 * typescriptlang.org/docs/handbook/project-references). Build mode also
 * skips a project whose inputs are unchanged since its last check, and one
 * whose dependency changed without changing its declarations: a body edit
 * in hub re-checks hub alone.
 *
 * The dashboard's .svelte files stay on svelte-check
 * (apps/dashboard/scripts/svelte-check.ts), run only when the dashboard or
 * something it imports is affected. The generated-artifact checks (openapi,
 * hub migrations, role budgets, openui views, the Swift tool presentation,
 * Claude Code paths, machine paths, Apple operations, the Swift words, every
 * signal through core's signalling module) and the machine handover
 * protocol's sweep read across the repository: they run whenever anything
 * changed. Typecheck coverage runs when a TypeScript file or a tsconfig
 * changed, after `svelte-kit sync` (the dashboard's project extends the
 * config it writes).
 *
 * It starts at once, with room on the disk (lib/disk-room.ts).
 */
import { basename, dirname, join, normalize } from "node:path";
import { type Check, runChecks } from "./lib/checks";
import { diskRoomOrExit } from "./lib/disk-room";

diskRoomOrExit("bun run typecheck");

const ROOT = join(import.meta.dir, "..");
const BUN = process.execPath;
const TSC = join(ROOT, "node_modules/.bin/tsc");
/**
 * Every project the graph lets build at once, two checkers each. Measured
 * cold over all 18 on 48 cores (three runs each, wall / CPU): the default
 * 12.5 s / 41 CPU-s, `--builders 16` 10.6 s / 41, `--builders 16
 * --checkers 2` 12.2 s / 36, `--singleThreaded` 20–28 s / 25–30. The
 * dashboard's svelte-check and the openapi check run beside it for longer,
 * so the fewer CPU-seconds cost no wall time.
 */
const TSC_FLAGS = ["--builders", "16", "--checkers", "2"];
const DASHBOARD = "apps/dashboard";
/** The dashboard's Svelte project, which svelte-check reads. */
const SVELTE_PROJECT = `${DASHBOARD}/tsconfig.json`;
/** Settings other projects extend, which check nothing themselves. */
const SHARED = new Set([
  "tsconfig.base.json",
  "tsconfig.paths.json",
  "packages/agent/tsconfig.browser.json",
]);
/** A change here can change any project's verdict. */
const EVERYTHING = [
  /(^|\/)tsconfig[^/]*\.json$/,
  /^package\.json$/,
  /^bun\.lock$/,
  /^bunfig\.toml$/,
  /^patches\//,
  /^scripts\/typecheck\.ts$/,
];
const CODE = /\.(?:[cm]?[jt]sx?|svelte)$/;
const STEM = /(?:\.d)?\.[cm]?[jt]sx?$/;
const TYPESCRIPT = /\.(?:[cm]?tsx?)$|(^|\/)tsconfig[^/]*\.json$/;
/** An import of a file TypeScript reads: code, JSON, or a path with no extension. */
const TYPED_TARGET = /\.(?:[cm]?[jt]sx?|svelte|json)$/;
const WORKSPACE_IMPORT = /^(@cawco\/[^/]+)(?:\/(.+))?$/;
const SPECIFIER =
  /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*|<reference\s+path=)["']([^"'\n]+)["']/g;

const args = process.argv.slice(2);
const ALL = args.includes("--all");
const baseArg = args.includes("--base")
  ? args[args.indexOf("--base") + 1]
  : undefined;

const git = async (...argv: string[]): Promise<string | undefined> => {
  const result = await Bun.$`git -C ${ROOT} ${argv}`.quiet().nothrow();
  return result.exitCode === 0 ? result.stdout.toString() : undefined;
};
const lines = (text: string | undefined): string[] =>
  (text ?? "").split("\n").filter(Boolean);

interface Project {
  config: string;
  dir: string;
  svelte: boolean;
}

/** The dashboard's top-level files (its manifest, Vite config), which svelte-check reads too. */
const DASHBOARD_TOP = /^apps\/dashboard\/[^/]+$/;

const projects: Project[] = lines(
  await git(
    "ls-files",
    "--cached",
    "--others",
    "--exclude-standard",
    "--",
    "tsconfig*.json",
    "**/tsconfig*.json"
  )
)
  .filter((config) => !SHARED.has(config))
  .map((config) => ({
    config,
    dir: config === SVELTE_PROJECT ? `${DASHBOARD}/src` : dirname(config),
    svelte: config === SVELTE_PROJECT,
  }));
const svelteProject = projects.find((project) => project.svelte);

const depth = (dir: string): number =>
  dir === "." ? 0 : dir.split("/").length;
const holds = (dir: string, path: string): boolean =>
  dir === "." || path === dir || path.startsWith(`${dir}/`);
/** The project whose folder holds `path` most closely (and the dashboard's Svelte project for its top-level files). */
const ownersOf = (path: string): Project[] => {
  let closest = -1;
  let owners: Project[] =
    svelteProject && DASHBOARD_TOP.test(path) ? [svelteProject] : [];
  const fixed = owners.length;
  for (const project of projects) {
    if (!holds(project.dir, path)) {
      continue;
    }
    const at = depth(project.dir);
    if (at > closest) {
      closest = at;
      owners = [...owners.slice(0, fixed), project];
    } else if (at === closest) {
      owners.push(project);
    }
  }
  return owners;
};

/** Each workspace package by name: its folder and `exports`, for `@cawco/*`. */
const rootManifest = (await Bun.file(join(ROOT, "package.json")).json()) as {
  workspaces: string[];
};
type Entry = string | { types?: string; default?: string };
const packages = new Map<
  string,
  { dir: string; exports?: Record<string, Entry>; main?: string }
>(
  await Promise.all(
    rootManifest.workspaces
      .flatMap((pattern) => [
        ...new Bun.Glob(`${pattern}/package.json`).scanSync({ cwd: ROOT }),
      ])
      .map(async (path) => {
        const pkg = (await Bun.file(join(ROOT, path)).json()) as {
          name: string;
          exports?: Record<string, Entry>;
          main?: string;
        };
        return [
          pkg.name,
          { dir: dirname(path), exports: pkg.exports, main: pkg.main },
        ] as const;
      })
  )
);

/** The repository path `specifier` in `file` names, when TypeScript reads it. */
const targetOf = (file: string, specifier: string): string | undefined => {
  if (specifier.startsWith("$lib/")) {
    return join(DASHBOARD, "src/lib", specifier.slice("$lib/".length));
  }
  if (specifier.startsWith(".")) {
    const path = normalize(join(dirname(file), specifier));
    const hasExtension = basename(path).includes(".");
    return !hasExtension || TYPED_TARGET.test(path) ? path : undefined;
  }
  const named = WORKSPACE_IMPORT.exec(specifier);
  const pkg = named ? packages.get(named[1]) : undefined;
  if (!(named && pkg)) {
    return;
  }
  const sub = named[2] ? `./${named[2]}` : ".";
  const entry = pkg.exports?.[sub];
  const path =
    typeof entry === "string"
      ? entry
      : (entry?.types ??
        entry?.default ??
        (sub === "." ? pkg.main : undefined));
  return path ? normalize(join(pkg.dir, path)) : pkg.dir;
};

/**
 * A path as its importers name it: without the extension TypeScript lets an
 * import leave off or write as `.js`, so an import and the file it reads
 * meet (and a deleted file still meets the imports that named it).
 */
const stemOf = (path: string): string => path.replace(STEM, "");
/** Each file stem, and the files that import it. */
const importers = new Map<string, Set<string>>();
const files = lines(
  await git("ls-files", "--cached", "--others", "--exclude-standard")
);
await Promise.all(
  files
    .filter((path) => CODE.test(path))
    .map(async (file) => {
      const text = await Bun.file(join(ROOT, file))
        .text()
        .catch(() => "");
      for (const [, specifier] of text.matchAll(SPECIFIER)) {
        const target = targetOf(file, specifier);
        if (target) {
          const stem = stemOf(target);
          const named = importers.get(stem) ?? new Set();
          named.add(file);
          importers.set(stem, named);
        }
      }
    })
);
/** The files that import `path`, by its stem and, for an index file, its folder's. */
const importersOf = (path: string): string[] => {
  const stem = stemOf(path);
  return [
    ...(importers.get(stem) ?? []),
    ...(basename(stem) === "index" ? (importers.get(dirname(stem)) ?? []) : []),
  ];
};

const base =
  baseArg ??
  (await git("merge-base", "HEAD", "origin/main"))?.trim() ??
  (await git("merge-base", "HEAD", "main"))?.trim();
const changed = ALL
  ? []
  : [
      ...lines(
        base
          ? await git("diff", "--name-only", "--no-renames", base)
          : undefined
      ),
      ...lines(await git("ls-files", "--others", "--exclude-standard")),
    ];
const everything =
  ALL ||
  !base ||
  changed.some((path) => EVERYTHING.some((rule) => rule.test(path)));

/** Every changed file and every file that imports one, however far up. */
const reached = new Set<string>(everything ? [] : changed);
for (const path of reached) {
  for (const importer of importersOf(path)) {
    reached.add(importer);
  }
}
const affected = new Set<Project>(
  everything ? projects : [...reached].flatMap(ownersOf)
);

let scope = `${changed.length} changed file(s) since ${base?.slice(0, 9)}`;
if (ALL) {
  scope = "every project (--all)";
} else if (everything) {
  scope = `every project: ${base ? "a change reaches all of them" : "no base to compare with"}`;
}
console.log(
  `typecheck: ${scope}; ${affected.size} of ${projects.length} projects affected${
    affected.size > 0 && affected.size < projects.length
      ? `: ${[...affected].map((project) => project.config).join(", ")}`
      : ""
  }`
);

if (args.includes("--dry")) {
  process.exit(0);
}

const script = (dir: string, name: string): Check => ({
  name: `${dir === "." ? "" : `${dir} `}${name}`,
  dir: join(ROOT, dir),
  argv: [BUN, "run", name],
});
const SYNC = "svelte-kit sync";
const SVELTE_CHECK = "svelte-check apps/dashboard";
const builds = [...affected].filter((project) => !project.svelte);
const svelte = [...affected].some((project) => project.svelte);
const coverage =
  ALL || changed.some((path) => TYPESCRIPT.test(path)) || everything;
const anything = ALL || everything || changed.length > 0;

const checks: Check[] = [
  ...(svelte || coverage
    ? [
        {
          name: SYNC,
          dir: join(ROOT, DASHBOARD),
          argv: [join(ROOT, DASHBOARD, "node_modules/.bin/svelte-kit"), "sync"],
        },
      ]
    : []),
  ...(svelte
    ? [
        {
          name: SVELTE_CHECK,
          dir: join(ROOT, DASHBOARD),
          argv: [BUN, "scripts/svelte-check.ts"],
          after: SYNC,
        },
      ]
    : []),
  ...(builds.length > 0
    ? [
        {
          name: `tsc -b (${builds.length} projects)`,
          dir: ROOT,
          argv: [
            TSC,
            "-b",
            ...TSC_FLAGS,
            ...builds.map((project) => project.config),
          ],
        },
      ]
    : []),
  ...(anything
    ? [
        script("packages/hub", "openapi:check"),
        script("packages/hub", "migrations:check"),
        script(".", "claude-paths:check"),
        script(".", "machine-paths:check"),
        script(".", "signal:check"),
        script("packages/hub", "roles:check"),
        script("packages/core", "openui:check"),
        script("packages/core", "tools:check"),
        script(".", "apple-ops:check"),
        script(".", "words:check"),
        script(".", "protocol:sweep"),
      ]
    : []),
  ...(coverage ? [{ ...script(".", "typecheck:coverage"), after: SYNC }] : []),
];

if (checks.length === 0) {
  console.log("typecheck: nothing to check");
  process.exit(0);
}
await runChecks("typecheck", checks);
