/**
 * `bun run check`: the one check of the repository, over what a change
 * reaches, each file checked once.
 *
 *   bun run check                 what changed since the branch left
 *                                 origin/main (committed, staged, unstaged
 *                                 and untracked), and every file that
 *                                 imports it
 *   bun run check --base <ref>    the same against another base
 *   bun run check --all           the whole tree
 *   bun run check --dry           name what it would run, and stop
 *
 * In order (lib/checks.ts runs what can run at once):
 *
 * 1. The house faces, then one `svelte-kit sync` (the dashboard's generated
 *    tsconfig and each route's `$types`, which everything after reads).
 * 2. The affected set: each changed file, every file that imports it (a
 *    relative path, `#name` through its package's `imports`, or
 *    `@cawco/<name>` through that package's `exports`), every file that
 *    imports one of those, and so on, read off the imports as they stand. A
 *    change to any tsconfig, the lockfile, a manifest, a patch, Golar's
 *    config, a lint rule, Biome's config or this runner reaches everything.
 * 3. Type errors: one `golar tsc -b` over the TypeScript projects the set
 *    reaches. The libraries are `composite` and write their declarations to
 *    `.tsbuild/`, which their dependents read instead of re-checking them
 *    ("Importing modules from a referenced project will instead load its
 *    output declaration file (.d.ts)",
 *    typescriptlang.org/docs/handbook/project-references); `--noEmit` is
 *    refused over such references (TS6310), so the leaves write nothing and
 *    the libraries only `.d.ts`. Each project's `.tsbuildinfo` skips it
 *    while its inputs are unchanged. What Golar's codegen makes of a
 *    `.svelte` file is none of its inputs, so a change to Golar's packages,
 *    their patches or golar.config.ts rebuilds everything once (`--force`).
 * 4. Lint: Golar's rules (switch exhaustiveness, the design rules) and
 *    Biome, over the affected files, each skipped when the files it would
 *    read are byte for byte those of its last pass.
 * 5. The house and artifact checks, each run when the files it reads
 *    (its declared inputs) differ from those of its last pass.
 * 6. Formatting: `bun fmt --check`.
 *
 * Every pass a step skips by is written by that step's own pass, under
 * node_modules/.cache/cawco/, keyed by the content it read.
 *
 * A run holds one of the machine's heavy-work slots (core heavy-slots.ts)
 * from before it reads the tree until it ends, taken in line behind every
 * other heavy run on the machine (merge checks, other checks, probe runs);
 * one run under a merge check's slot (its environment says so) takes none
 * of its own. Either way it and every check it starts run at nice 10, in
 * the idle I/O class on Linux and never in macOS's darwin background (core
 * `runInBackground`). Its own parallelism is its share of the machine's
 * cores as it starts: the cores over the runs holding a slot then
 * ({@link SHARE}).
 */
import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { availableParallelism } from "node:os";
import { basename, dirname, join, normalize } from "node:path";
import {
  coresPerRun,
  heldAbove,
  machinePlace,
  runInBackground,
  takeSlot,
} from "../packages/core/src/heavy-slots";
import { type Check, runChecks } from "./lib/checks";
import { diskRoomOrExit } from "./lib/disk-room";
import { repoFiles } from "./lib/repo-files";

diskRoomOrExit("bun run check");

const ROOT = join(import.meta.dir, "..");
const BUN = process.execPath;
const STAMPS = join(ROOT, "node_modules/.cache/cawco");
mkdirSync(STAMPS, { recursive: true });
const DASHBOARD = "apps/dashboard";

const args = process.argv.slice(2);
const ALL = args.includes("--all");
const DRY = args.includes("--dry");
const baseArg = args.includes("--base")
  ? args[args.indexOf("--base") + 1]
  : undefined;

/* ---------------------------------------------------------- the slot */

const PLACE = machinePlace();
if (!DRY) {
  const above = heldAbove(PLACE);
  if (above) {
    console.log(`check: runs under its caller's heavy-work ${above}`);
  } else {
    // The queue marker (core harness.ts QUEUE_MARKER): a CawCo command's
    // clock stands from the wait line to the held line.
    let waited = false;
    await takeSlot(PLACE, "bun run check", {
      waiting: (holders) => {
        waited = true;
        console.log(`CAWCO-QUEUE wait heavy: ${holders}`);
      },
    });
    if (waited) {
      console.log("CAWCO-QUEUE held heavy");
    }
  }
  runInBackground();
}
/** This run's share of the machine's cores: the cores over the heavy runs holding a slot as it starts. */
const SHARE = coresPerRun(PLACE);
/**
 * `golar tsc -b`'s threads: 8, or the run's {@link SHARE} when the machine
 * is shared past that. Measured 2026-10-23 by this workspace's cgroup CPU,
 * every project rebuilt (`--force`), on 48 cores at load 50–66: the default
 * 44.9, 44.8, 49.0, 53.2 CPU-s (5.4–8.7 s); `--builders 8 --checkers 1`
 * 36.3, 45.8, 42.3, 39.6 (8.0–19.3 s); `--builders 16 --checkers 2` 45.4,
 * 43.2; `--singleThreaded` 33.3, 33.5 but 25.9–28.4 s, longer than the
 * check's longest step (openapi:check, ~20 s). Nothing changed: 1.7–1.8
 * CPU-s for each.
 */
const TSC_FLAGS = ["--builders", String(Math.min(8, SHARE)), "--checkers", "1"];
/**
 * Checks run at once: half the cores this process may run on, 4 at least,
 * and never past the run's {@link SHARE} (6 with obelisk's eight slots
 * held, where it was 24 before 2026-10-25).
 */
const AT_ONCE = Math.min(
  Math.max(4, Math.floor(availableParallelism() / 2)),
  SHARE
);

const git = async (...argv: string[]): Promise<string | undefined> => {
  const result = await Bun.$`git -C ${ROOT} ${argv}`.quiet().nothrow();
  return result.exitCode === 0 ? result.stdout.toString() : undefined;
};
const lines = (text: string | undefined): string[] =>
  (text ?? "").split("\n").filter(Boolean);

/** Settings other projects extend, which check nothing themselves. */
const SHARED = new Set([
  "tsconfig.base.json",
  "tsconfig.paths.json",
  "packages/agent/tsconfig.browser.json",
]);
/** A change here can change any verdict. */
const EVERYTHING = [
  /(^|\/)tsconfig[^/]*\.json$/u,
  /(^|\/)package\.json$/u,
  /^bun\.lock$/u,
  /^bunfig\.toml$/u,
  /^patches\//u,
  /^golar\.config\.ts$/u,
  /^biome\.jsonc$/u,
  /^scripts\/check\.ts$/u,
  /^scripts\/lib\/checks\.ts$/u,
  /^scripts\/lib\/repo-files\.ts$/u,
  /^scripts\/lint\//u,
];
const CODE = /\.(?:[cm]?[jt]sx?|svelte)$/u;
const TSCONFIG = /(^|\/)tsconfig[^/]*\.json$/u;
const MANIFEST = /(^|\/)package\.json$/u;
const DASHBOARD_CSS = /^apps\/dashboard\/src\/.*\.css$/u;
const TYPESCRIPT_FILE = /\.[cm]?tsx?$/u;
const STEM = /(?:\.d)?\.[cm]?[jt]sx?$/u;
/** An import of a file TypeScript reads: code, JSON, or a path with no extension. */
const TYPED_TARGET = /\.(?:[cm]?[jt]sx?|svelte|json)$/u;
const WORKSPACE_IMPORT = /^(@cawco\/[^/]+)(?:\/(.+))?$/u;
const SPECIFIER =
  /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*|<reference\s+path=)["']([^"'\n]+)["']/gu;

/* ---------------------------------------------------------- the tree */

const files = repoFiles();
const present = new Set(files);

interface Project {
  config: string;
  dir: string;
}
/** The dashboard's top-level files (its manifest, Vite config), which its Svelte project's checks read too. */
const DASHBOARD_TOP = /^apps\/dashboard\/[^/]+$/u;
const SVELTE_PROJECT = `${DASHBOARD}/tsconfig.json`;
const projects: Project[] = files
  .filter((path) => TSCONFIG.test(path) && !SHARED.has(path))
  .map((config) => ({
    config,
    dir: config === SVELTE_PROJECT ? `${DASHBOARD}/src` : dirname(config),
  }));
const svelteProject = projects.find((p) => p.config === SVELTE_PROJECT);

const depth = (dir: string): number =>
  dir === "." ? 0 : dir.split("/").length;
const holds = (dir: string, path: string): boolean =>
  dir === "." || path === dir || path.startsWith(`${dir}/`);
/** The project whose folder holds `path` most closely. */
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

/** Each workspace package by name: its folder, `exports` and `imports`. */
const rootManifest = (await Bun.file(join(ROOT, "package.json")).json()) as {
  workspaces: string[];
};
type Entry = string | { types?: string; default?: string };
interface Manifest {
  dir: string;
  exports?: Record<string, Entry>;
  imports?: Record<string, string>;
  main?: string;
}
const packages = new Map<string, Manifest>(
  await Promise.all(
    rootManifest.workspaces
      .flatMap((pattern) => [
        ...new Bun.Glob(`${pattern}/package.json`).scanSync({ cwd: ROOT }),
      ])
      .map(async (path) => {
        const pkg = (await Bun.file(join(ROOT, path)).json()) as Omit<
          Manifest,
          "dir"
        > & { name: string };
        return [pkg.name, { ...pkg, dir: dirname(path) }] as const;
      })
  )
);

/** The path a `#name` import in `file` names, through its package's `imports`. */
const subpathImport = (file: string, specifier: string): string | undefined => {
  const [holder] = [...packages.values()]
    .filter((pkg) => holds(pkg.dir, file))
    .sort((a, b) => depth(b.dir) - depth(a.dir));
  for (const [key, path] of Object.entries(holder?.imports ?? {})) {
    if (key === specifier) {
      return normalize(join(holder.dir, path));
    }
    const star = key.indexOf("*");
    if (
      star >= 0 &&
      specifier.startsWith(key.slice(0, star)) &&
      specifier.endsWith(key.slice(star + 1))
    ) {
      const matched = specifier.slice(
        star,
        specifier.length - (key.length - star - 1)
      );
      return normalize(join(holder.dir, path.replace("*", matched)));
    }
  }
};

/** The repository path `specifier` in `file` names, when TypeScript reads it. */
const targetOf = (file: string, specifier: string): string | undefined => {
  if (specifier.startsWith("#")) {
    return subpathImport(file, specifier);
  }
  if (specifier.startsWith(".")) {
    const path = normalize(join(dirname(file), specifier));
    const hasExtension = basename(path).includes(".");
    return !hasExtension || TYPED_TARGET.test(path) ? path : undefined;
  }
  const named = WORKSPACE_IMPORT.exec(specifier);
  const pkg = named ? packages.get(named[1] as string) : undefined;
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

/** A path as its importers name it: without the extension an import may leave off. */
const stemOf = (path: string): string => path.replace(STEM, "");
/** Each file stem, and the files that import it; each file's specifiers. */
const importers = new Map<string, Set<string>>();
const specifiers = new Map<string, string[]>();
await Promise.all(
  files
    .filter((path) => CODE.test(path))
    .map(async (file) => {
      const text = await Bun.file(join(ROOT, file))
        .text()
        .catch(() => "");
      const named: string[] = [];
      for (const [, specifier] of text.matchAll(SPECIFIER)) {
        named.push(specifier as string);
        const target = targetOf(file, specifier as string);
        if (target) {
          const stem = stemOf(target);
          const set = importers.get(stem) ?? new Set();
          set.add(file);
          importers.set(stem, set);
        }
      }
      specifiers.set(file, named);
    })
);
const importersOf = (path: string): string[] => {
  const stem = stemOf(path);
  return [
    ...(importers.get(stem) ?? []),
    ...(basename(stem) === "index" ? (importers.get(dirname(stem)) ?? []) : []),
  ];
};

/* ---------------------------------------------------------- the change */

const base =
  baseArg ??
  (await git("merge-base", "HEAD", "origin/main"))?.trim() ??
  (await git("merge-base", "HEAD", "main"))?.trim();
const changed = ALL
  ? []
  : [
      ...new Set([
        ...lines(
          base
            ? await git("diff", "--name-only", "--no-renames", base)
            : undefined
        ),
        ...lines(await git("ls-files", "--others", "--exclude-standard")),
      ]),
    ];
const everything =
  ALL ||
  !base ||
  changed.some((path) => EVERYTHING.some((rule) => rule.test(path)));

/** Every changed file and every file that imports one, however far up. */
const reached = new Set<string>(everything ? files : changed);
if (!everything) {
  for (const path of reached) {
    for (const importer of importersOf(path)) {
      reached.add(importer);
    }
  }
}
const affected = everything
  ? projects
  : [...new Set([...reached].flatMap(ownersOf))];

/* ---------------------------------------------------------- stamps */

/** A key over these files' paths and contents (a missing file counts as gone). */
const keyOf = async (paths: string[], ...more: string[]): Promise<string> => {
  const hash = createHash("sha256");
  for (const extra of more) {
    hash.update(extra).update("\0");
  }
  for (const path of [...paths].sort()) {
    hash.update(path).update("\0");
    const file = Bun.file(join(ROOT, path));
    hash.update(
      (await file.exists()) ? new Uint8Array(await file.arrayBuffer()) : "gone"
    );
    hash.update("\0");
  }
  return hash.digest("hex");
};
const stampFile = (name: string): string =>
  join(STAMPS, `${name.replace(/[^\w.-]+/gu, "_")}.stamp`);
const passed = async (name: string, key: string): Promise<boolean> => {
  const file = Bun.file(stampFile(name));
  return (await file.exists()) && (await file.text()).split("\n").includes(key);
};

/** The tree's files under these folders or named exactly. */
const under = (...prefixes: string[]): string[] =>
  files.filter((path) =>
    prefixes.some((prefix) =>
      prefix.endsWith("/") ? path.startsWith(prefix) : path === prefix
    )
  );

/* ---------------------------------------------------------- the plan */

const SYNC = "svelte-kit sync";
const FACES = "house faces";
const checks: Check[] = [
  {
    name: FACES,
    dir: ROOT,
    argv: [BUN, "apps/dashboard/scripts/house-faces.ts"],
  },
  {
    name: SYNC,
    dir: join(ROOT, DASHBOARD),
    argv: [join(ROOT, DASHBOARD, "node_modules/.bin/svelte-kit"), "sync"],
    after: FACES,
  },
];
const skipped: string[] = [];

/* Type errors. */
const codegen = await keyOf([
  "bun.lock",
  "golar.config.ts",
  ...under("patches/").filter((p) => p.includes("golar")),
]);
const fresh = !(await passed("golar-tsc-codegen", codegen));
const tscProjects = (fresh ? projects : affected).map((p) => p.config);
if (tscProjects.length > 0) {
  checks.push({
    name: `golar tsc -b (${tscProjects.length} projects${fresh ? ", every one rebuilt: Golar's codegen changed" : ""})`,
    dir: ROOT,
    argv: [
      join(ROOT, "node_modules/.bin/golar"),
      "tsc",
      "-b",
      ...TSC_FLAGS,
      ...(fresh ? ["--force"] : []),
      ...tscProjects,
    ],
    after: SYNC,
    stamp: { file: stampFile("golar-tsc-codegen"), key: codegen },
  });
}

/* Lint: Golar's rules, then Biome, over the affected files. */
const RULES_READ = [
  "golar.config.ts",
  "bun.lock",
  ...under("scripts/lint/", "patches/", "apps/dashboard/src/app.css"),
  ...files.filter((p) => DASHBOARD_CSS.test(p)),
];
// The files golar.config.ts lints: its globs, as one pattern.
const LINTED =
  /^(?:apps\/dashboard\/src\/.*\.(?:ts|svelte)|apps\/dashboard\/scripts\/.*\.ts|apps\/cawrier\/src\/.*\.ts|packages\/[^/]+\/src\/.*\.(?:ts|tsx|svelte)|packages\/[^/]+\/scripts\/.*\.ts|scripts\/.*\.ts|site\/src\/.*\.ts)$/u;
const linted = [...reached].filter((p) => LINTED.test(p) && present.has(p));
{
  const key = await keyOf([...linted, ...RULES_READ], everything ? "all" : "");
  if (linted.length === 0 && !everything) {
    skipped.push("golar lint (no file it reads changed)");
  } else if (await passed("golar-lint", key)) {
    skipped.push(`golar lint (${linted.length} files, as they passed)`);
  } else {
    checks.push({
      name: `golar lint (${linted.length} files)`,
      dir: ROOT,
      argv: [BUN, "scripts/lint/golar-lint.ts"],
      env: everything ? {} : { CAWCO_CHECK_FILES: linted.join("\n") },
      after: SYNC,
      stamp: { file: stampFile("golar-lint"), key },
    });
  }
}
const BIOME_READS =
  /\.(?:[cm]?[jt]sx?|svelte|json|jsonc|css|html|grit|vue|astro|graphql|md)$/u;
const biomed = [...reached].filter(
  (p) => BIOME_READS.test(p) && present.has(p)
);
{
  const key = await keyOf(
    [...biomed, "biome.jsonc", "bun.lock", "apps/dashboard/src/app.css"],
    everything ? "all" : ""
  );
  if (biomed.length === 0 && !everything) {
    skipped.push("biome check (no file it reads changed)");
  } else if (await passed("biome", key)) {
    skipped.push(`biome check (${biomed.length} files, as they passed)`);
  } else {
    checks.push({
      name: everything
        ? "biome check (every file)"
        : `biome check (${biomed.length} files)`,
      dir: ROOT,
      argv: [
        join(ROOT, "node_modules/.bin/biome"),
        "check",
        "--no-errors-on-unmatched",
        "--files-ignore-unknown=true",
        ...(everything ? [] : biomed),
      ],
      after: SYNC,
      stamp: { file: stampFile("biome"), key },
    });
  }
}

/* The house and artifact checks, by the files each reads. */
interface Gated {
  argv: string[];
  dir?: string;
  /** Folders (ending `/`) and files it reads, beside its own script. */
  inputs: string[];
  /** A key of its own, in place of the inputs' contents. */
  key?: () => Promise<string>;
  name: string;
}
const DASH = ["apps/dashboard/", "design/", "DESIGN.md"];
const PKG = ["packages/"];
const ALL_FILES = ["./"];
const bun = (script: string, inputs: string[], ...rest: string[]): Gated => ({
  name: [script, ...rest].join(" "),
  argv: [BUN, script, ...rest],
  inputs: [script, "scripts/lib/", ...inputs],
});
/** A dashboard script, run from the dashboard. */
const inDashboard = (script: string, ...rest: string[]): Gated => ({
  name: [`${DASHBOARD}/${script}`, ...rest].join(" "),
  dir: DASHBOARD,
  argv: [BUN, script, ...rest],
  inputs: [...DASH, "scripts/lib/"],
});
const run = (dir: string, name: string, inputs: string[]): Gated => ({
  name: `${dir} ${name}`,
  dir,
  argv: [BUN, "run", name],
  inputs: [`${dir}/`, "scripts/lib/", ...inputs],
});
const tsconfigs = files.filter((p) => TSCONFIG.test(p));
const manifests = files.filter((p) => MANIFEST.test(p));
const gated: Gated[] = [
  {
    ...bun("scripts/case-clash-check.ts", []),
    // Its input is the list of paths alone.
    key: () => keyOf(["scripts/case-clash-check.ts"], files.join("\n")),
  },
  bun("scripts/css-scope-check.ts", DASH),
  bun("scripts/runtime-bundles-check.ts", [
    ...DASH,
    "packages/agent/src/",
    "packages/core/src/",
  ]),
  bun("apps/dashboard/scripts/mark-line-check.ts", DASH),
  bun("apps/dashboard/scripts/specificity-trap.ts", DASH),
  bun("apps/dashboard/scripts/lib-import-check.ts", DASH),
  bun("apps/dashboard/scripts/svelte-unused-css.ts", DASH),
  bun("apps/dashboard/scripts/spacing-ratchet.ts", DASH),
  inDashboard("scripts/build-tokens.ts", "--check"),
  inDashboard("scripts/build-variants.ts", "--check"),
  bun("packages/hub/scripts/skills-check.ts", ["packages/hub/"]),
  run("packages/core", "faces:check", [
    "assets/",
    "apps/dashboard/src/house-faces/",
  ]),
  bun("scripts/style-residual-check.ts", DASH),
  bun("scripts/relics-check.ts", DASH),
  bun("scripts/style-greps.ts", DASH),
  bun("scripts/tool-answer-check.ts", [...DASH, ...PKG, "scripts/"]),
  bun("scripts/icon-imports-check.ts", ALL_FILES),
  bun("scripts/docker-client-check.ts", PKG),
  bun("scripts/fixed-ports-check.ts", PKG),
  bun("scripts/border-width-check.ts", [
    ...DASH,
    "packages/agent/src/canvas-host/",
    "packages/hub/skills/decision-page/kit/",
  ]),
  bun("scripts/token-contrast-check.ts", [
    ...DASH,
    "packages/hub/src/design-tokens.ts",
    "packages/hub/src/design-css.ts",
    "packages/hub/src/dtcg-values.ts",
    "packages/hub/src/dtcg-resolver.ts",
    "packages/core/src/",
  ]),
  bun("scripts/page-imports-check.ts", DASH),
  bun("scripts/preview-switcher-check.ts", [
    "design-previews/",
    "apps/dashboard/src/lib/cawco/address/flow/",
  ]),
  bun("scripts/probe-words-check.ts", [
    "apps/",
    ...PKG,
    "scripts/probe-kit/",
    "scripts/probe-words.baseline.json",
  ]),
  bun("scripts/probe-waits-check.ts", [
    ...PKG,
    "scripts/probe-kit/",
    "scripts/scratch-fleet.ts",
  ]),
  bun("scripts/probe-groups-check.ts", ["scripts/probe-kit/"]),
  bun("scripts/design-rules.ts", DASH, "--check"),
  run("packages/hub", "openapi:check", [
    ...PKG,
    "apps/apple/Packages/CawCoKit/Sources/CawCoAPI/",
    "bun.lock",
    "tsconfig.base.json",
    "package.json",
  ]),
  run("packages/hub", "migrations:check", []),
  run("packages/hub", "stored-shapes:check", [...PKG, "apps/dashboard/src/"]),
  run("packages/hub", "roles:check", PKG),
  run("packages/core", "openui:check", []),
  run("packages/core", "tools:check", ["apps/apple/"]),
  bun("scripts/claude-paths-check.ts", [...DASH, ...PKG]),
  bun("scripts/machine-paths-check.ts", [...DASH, ...PKG]),
  bun("scripts/signal-check.ts", ALL_FILES),
  bun("scripts/duplicate-lists-check.ts", [
    "packages/",
    "apps/dashboard/",
    "apps/cawrier/",
    "scripts/",
  ]),
  bun("scripts/apple-ops-check.ts", ["apps/apple/", ...PKG]),
  bun(
    "scripts/words-swift.ts",
    [
      "apps/apple/Packages/CawCoKit/Sources/",
      "apps/dashboard/src/",
      "packages/core/src/",
    ],
    "--check"
  ),
  bun("scripts/protocol-sweep.ts", ["packages/core/src/"]),
  {
    ...bun("scripts/typecheck-coverage.ts", []),
    // Which files there are, and the projects that hold them.
    key: () =>
      keyOf(tsconfigs, files.filter((p) => TYPESCRIPT_FILE.test(p)).join("\n")),
  },
  {
    ...bun("scripts/resolution-check.ts", []),
    // What resolves: the lockfile, every tsconfig and manifest, and every
    // file's import specifiers.
    key: () =>
      keyOf(
        ["bun.lock", ...tsconfigs, ...manifests],
        [...specifiers]
          .map(([file, named]) => `${file}:${named.join(",")}`)
          .sort()
          .join("\n")
      ),
  },
  {
    // Dead files, exports, types and dependencies (knip.ts), over every
    // workspace at once; after the sync, for the dashboard's `$app/tsconfig`.
    name: "knip",
    argv: [join(ROOT, "node_modules/.bin/knip")],
    inputs: [],
    // What it reads: the code, every manifest and tsconfig, the lockfile and its config.
    key: () =>
      keyOf([
        ...files.filter((p) => CODE.test(p) || p.endsWith(".css")),
        ...tsconfigs,
        ...manifests,
        "bun.lock",
        "knip.ts",
      ]),
  },
  {
    // Duplicated code (.jscpd.json: threshold 0).
    name: "jscpd",
    argv: [join(ROOT, "node_modules/.bin/jscpd")],
    inputs: ["packages/", "apps/dashboard/", ".jscpd.json"],
  },
  // Its own oxlint: Biome leaves the package out (biome.jsonc).
  run("packages/jsonl-parser", "lint", []),
  // And its own oxfmt, check-only (`bun run format` there writes).
  run("packages/jsonl-parser", "format:check", []),
];
for (const check of gated) {
  const inputs = check.inputs.includes("./")
    ? files
    : under(...check.inputs.filter(Boolean));
  const key = check.key ? await check.key() : await keyOf(inputs);
  if (await passed(check.name, key)) {
    skipped.push(check.name);
    continue;
  }
  checks.push({
    name: check.name,
    dir: join(ROOT, check.dir ?? "."),
    argv: check.argv,
    after: SYNC,
    stamp: { file: stampFile(check.name), key },
  });
}

/* Formatting, every run. */
checks.push({
  name: "bun fmt --check",
  dir: ROOT,
  argv: [BUN, "scripts/fmt.ts", "--check"],
});

/* ---------------------------------------------------------- the run */

let scope = `${changed.length} changed file(s) since ${base?.slice(0, 9)}, ${reached.size} reached`;
if (ALL) {
  scope = "the whole tree (--all)";
} else if (everything) {
  scope = `the whole tree: ${base ? "a change reaches all of it" : "no base to compare with"}`;
}
console.log(
  `check: ${scope}; ${affected.length} of ${projects.length} TypeScript projects${
    affected.length > 0 && affected.length < projects.length
      ? ` (${affected.map((p) => p.config).join(", ")})`
      : ""
  }`
);
if (skipped.length > 0) {
  console.log(
    `check: ${skipped.length} unchanged since their last pass: ${skipped.join(", ")}`
  );
}
if (DRY) {
  for (const check of checks) {
    console.log(`  would run: ${check.name}`);
  }
  process.exit(0);
}
console.log(
  `check: ${AT_ONCE} checks at once, golar tsc --builders ${TSC_FLAGS[1]}: ${SHARE} core(s) its share of the machine's`
);
await runChecks(
  "check",
  checks,
  AT_ONCE,
  skipped.length > 0
    ? ` (${skipped.length} more unchanged since their last pass)`
    : ""
);
