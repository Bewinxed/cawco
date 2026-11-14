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
 *    `.svelte` file is none of its inputs, so a change to golar.config.ts,
 *    the lockfile or a patch rebuilds everything once (`--force`).
 * 4. Lint: Golar's rules (switch exhaustiveness, the design rules) and
 *    Biome, over the affected files, each skipped when the files it would
 *    read are byte for byte those of its last pass.
 * 5. The house and artifact checks, each run when the files it reads
 *    (its declared inputs) differ from those of its last pass.
 * 6. Formatting: `bun fmt --check`.
 *
 * Every pass a step skips by is written by that step's own pass, under
 * node_modules/.cache/cawco/, keyed by the content it read. A step that
 * loads or runs an installed package is keyed by what the install read too
 * (the lockfile and the patches, lib/check-inputs.ts), which says what is
 * installed only while `node_modules` came from them: so before anything
 * else the run stops, naming `bun install`, when the install's own record
 * says it came from other ones (lib/installed.ts).
 *
 * A run holds one of the machine's heavy-work slots (core heavy-slots.ts)
 * from before it reads the tree until it ends, taken in line behind every
 * other heavy run on the machine (merge checks, other checks);
 * one run under a merge check's slot (its environment says so) takes none
 * of its own. Either way it and every check it starts run at nice 10, in
 * the idle I/O class on Linux and never in macOS's darwin background (core
 * `runInBackground`). Its own parallelism is its share of the machine's
 * cores as it starts: the cores over the runs holding a slot then
 * ({@link SHARE}).
 *
 * Whatever started it (a shell, the pre-push hook, a `git rebase --exec`
 * step), it and every check it starts read the checkout this file is in:
 * git's own variables for another repository leave this process as it loads
 * (core git-repository-env.ts), before the checks that `git init` a scratch
 * repository run.
 */
import "../packages/core/src/git-repository-env";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { basename, dirname, join } from "node:path";
import {
  coresPerRun,
  heldAbove,
  machinePlace,
  runInBackground,
  takeSlot,
} from "../packages/core/src/heavy-slots";
import { wireBaselines } from "../packages/hub/scripts/openapi-inputs";
import { filesOf, inputsOf } from "./lib/check-inputs";
import { type Check, runChecks } from "./lib/checks";
import { diskRoomOrExit } from "./lib/disk-room";
import { INSTALL_READS, installedOrExit } from "./lib/installed";
import { repoFiles } from "./lib/repo-files";
import { depth, holds, targetOf } from "./lib/workspace-imports";

diskRoomOrExit("bun run check");
installedOrExit("bun run check");

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
  /^scripts\/lib\/workspace-imports\.ts$/u,
  /^scripts\/(?:lib\/)?real-modules\.ts$/u,
  /^scripts\/lint\//u,
];
const CODE = /\.(?:[cm]?[jt]sx?|svelte)$/u;
const TSCONFIG = /(^|\/)tsconfig[^/]*\.json$/u;
const MANIFEST = /(^|\/)package\.json$/u;
const TYPESCRIPT_FILE = /\.[cm]?tsx?$/u;
const STEM = /(?:\.d)?\.[cm]?[jt]sx?$/u;
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

/**
 * What the scripts `entries` read: their import closure, the files their
 * `checkReads` exports name, and what the install read when they load or
 * run an installed package (lib/check-inputs.ts). `more` names reads beside
 * them, for a check with no script of its own (`node_modules/` for one that
 * is an installed tool).
 */
const inputsFor = (
  entries: readonly string[],
  more: readonly string[] = []
): { declared: string[]; files: string[] } => {
  const inputs = inputsOf(entries, present);
  inputs.declared.push(...more);
  return { declared: inputs.declared, files: filesOf(inputs, files) };
};

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

/*
 * Type errors. A project's `.tsbuildinfo` judges it by its own files and its
 * references' declarations: what Golar's codegen makes of a `.svelte` file
 * (its config, its packages as installed) is none of them, and the run does
 * not rest a pass on whether it reads the installed packages' declarations.
 * So a change to golar.config.ts or to what the install read rebuilds every
 * project once.
 */
const unseen = await keyOf(["golar.config.ts", ...under(...INSTALL_READS)]);
const fresh = !(await passed("golar-tsc-unseen", unseen));
const tscProjects = (fresh ? projects : affected).map((p) => p.config);
/**
 * The type check, when this run has one: it writes every project's
 * declarations under `.tsbuild/`, which a check reading those projects'
 * references reads ({@link Gated.after}). None in a run that builds none.
 */
const TSC =
  tscProjects.length > 0
    ? `golar tsc -b (${tscProjects.length} projects${fresh ? ", every one rebuilt: the installed packages or Golar's config changed" : ""})`
    : undefined;
if (TSC) {
  checks.push({
    name: TSC,
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
    stamp: { file: stampFile("golar-tsc-unseen"), key: unseen },
  });
}

/* Lint: Golar's rules, then Biome, over the affected files. */
/** Golar's lint run: the script and what it reads (its config, rules, patches and stylesheets declare theirs). */
const GOLAR_LINT = "scripts/lint/golar-lint.ts";
// The files golar.config.ts lints: its globs, as one pattern.
const LINTED =
  /^(?:apps\/dashboard\/src\/.*\.(?:ts|svelte)|apps\/dashboard\/scripts\/.*\.ts|apps\/cawrier\/src\/.*\.ts|packages\/[^/]+\/src\/.*\.(?:ts|tsx|svelte)|packages\/[^/]+\/scripts\/.*\.ts|scripts\/.*\.ts|site\/src\/.*\.ts)$/u;
/** The files the design rules read (golar.config.ts `designed`). */
const DESIGNED = /^apps\/dashboard\/src\/.*\.(?:ts|svelte)$/u;
/** The dashboard's stylesheets, whose classes and tokens the design rules judge by. */
const DASHBOARD_CSS = /^apps\/dashboard\/src\/.*\.css$/u;
// The design rules judge a class by the dashboard's stylesheets (its theme,
// its `@utility`s, its class selectors): a change to one re-judges every
// file they read, or a token taken away leaves its classes drawing nothing
// unseen.
const restyled = changed.some((p) => DASHBOARD_CSS.test(p));
const linted = files.filter(
  (p) =>
    LINTED.test(p) &&
    present.has(p) &&
    (reached.has(p) || (restyled && DESIGNED.test(p)))
);
{
  const key = await keyOf(
    [...linted, ...inputsFor([GOLAR_LINT]).files],
    everything ? "all" : ""
  );
  if (linted.length === 0 && !everything) {
    skipped.push("golar lint (no file it reads changed)");
  } else if (await passed("golar-lint", key)) {
    skipped.push(`golar lint (${linted.length} files, as they passed)`);
  } else {
    checks.push({
      name: `golar lint (${linted.length} files)`,
      dir: ROOT,
      argv: [BUN, GOLAR_LINT],
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
/** What gives Biome a `node_modules` it reads a package's types through (lib/real-modules.ts), and declares what Biome reads. */
const REAL_MODULES_RUN = "scripts/real-modules.ts";
{
  // "package types": a pass from before Biome read them in a workspace is
  // none of this one's.
  const key = await keyOf(
    [...biomed, ...inputsFor([REAL_MODULES_RUN]).files],
    everything ? "all" : "",
    "package types"
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
      // Through a real node_modules, where Biome reads a package's types.
      argv: [
        BUN,
        REAL_MODULES_RUN,
        join(ROOT, "node_modules/.bin/biome"),
        "check",
        "--no-errors-on-unmatched",
        "--files-ignore-unknown=true",
        ...(everything ? [] : biomed),
      ],
      alone: true,
      stamp: { file: stampFile("biome"), key },
    });
  }
}

/* The house and artifact checks, each keyed by what its script reads. */
interface Gated {
  /**
   * The check it starts after, when not the sync: one whose output it reads
   * must have ended first, or it reads a file half written (resolution-check
   * read `.tsbuild/packages/core/src/asks.d.ts` while `golar tsc -b` rewrote
   * it, and failed a merge check on TS1434).
   */
  after?: string;
  argv: string[];
  dir?: string;
  /** The scripts it runs: its inputs are their import closure and what they declare with `export const checkReads = [...]` (lib/check-inputs.ts). */
  entries: string[];
  /** A state beside its files that its verdict depends on, as text. */
  extra?: (declared: string[]) => Promise<string[]>;
  /** Reads beside its scripts', for a check that is a tool with no script of its own (`node_modules/` for an installed one) or that reads the tree's shape. */
  files?: () => string[];
  name: string;
}
const bun = (script: string, ...rest: string[]): Gated => ({
  name: [script, ...rest].join(" "),
  argv: [BUN, script, ...rest],
  entries: [script],
});
/** A dashboard script, run from the dashboard. */
const inDashboard = (script: string, ...rest: string[]): Gated => ({
  name: [`${DASHBOARD}/${script}`, ...rest].join(" "),
  dir: DASHBOARD,
  argv: [BUN, script, ...rest],
  entries: [`${DASHBOARD}/${script}`],
});
/** A package script (`bun run <name>`): the scripts its manifest's command runs, and the manifest. */
const run = (dir: string, name: string): Gated => {
  const manifest = `${dir}/package.json`;
  const command = (
    JSON.parse(readFileSync(join(ROOT, manifest), "utf8")) as {
      scripts: Record<string, string>;
    }
  ).scripts[name] as string;
  return {
    name: `${dir} ${name}`,
    dir,
    argv: [BUN, "run", name],
    entries: [
      manifest,
      ...(command.match(/[\w./-]+\.ts\b/gu) ?? []).map((script) =>
        join(dir, script)
      ),
    ],
  };
};
const tsconfigs = files.filter((p) => TSCONFIG.test(p));
const manifests = files.filter((p) => MANIFEST.test(p));
const gated: Gated[] = [
  {
    ...bun("scripts/case-clash-check.ts"),
    // Its input is the list of paths alone.
    extra: async () => [files.join("\n")],
  },
  // Imports run one way: no cycle, and the kit reaches no module that
  // itself reaches the kit (what a specifier alone says is Biome's).
  bun("scripts/import-rules-check.ts"),
  // Each file's swallowed failures, casts around the type checker and
  // silenced checks may fall, never rise.
  bun("scripts/escape-hatch-ratchet.ts"),
  // A comment names files and symbols that are there. It reads every code
  // file's identifiers and the platform's types, which bun.lock pins.
  bun("scripts/stale-references-check.ts"),
  bun("scripts/css-scope-check.ts"),
  bun("scripts/browser-core-check.ts"),
  bun("scripts/runtime-bundles-check.ts"),
  bun("apps/dashboard/scripts/mark-line-check.ts"),
  bun("apps/dashboard/scripts/outro-reads-check.ts"),
  bun("apps/dashboard/scripts/specificity-trap.ts"),
  bun("apps/dashboard/scripts/lib-import-check.ts"),
  bun("apps/dashboard/scripts/svelte-unused-css.ts"),
  // The release build's layers guard, over the house's sheets unbundled.
  bun("apps/dashboard/scripts/css-layers-check.ts"),
  bun("apps/dashboard/scripts/spacing-ratchet.ts"),
  // A class stock Tailwind draws and the house theme draws nothing for;
  // bun.lock pins the Tailwind that judges it.
  bun("scripts/tailwind-draws-check.ts"),
  inDashboard("scripts/role-order.ts"),
  inDashboard("scripts/build-variants.ts", "--check"),
  bun("packages/hub/scripts/skills-check.ts"),
  bun("scripts/house-faces.ts", "--check"),
  bun("scripts/style-residual-check.ts"),
  bun("scripts/relics-check.ts"),
  bun("scripts/style-greps.ts"),
  bun("scripts/tool-answer-check.ts"),
  bun("scripts/route-families-check.ts"),
  // Every hub route answers a value Eden can type: a Response or unknown
  // only from a protocol endpoint whose client is not ours.
  bun("scripts/route-answers-check.ts"),
  bun("scripts/icon-imports-check.ts"),
  bun("scripts/docker-client-check.ts"),
  bun("scripts/browser-image-check.ts"),
  bun("scripts/fixed-ports-check.ts"),
  bun("scripts/border-width-check.ts"),
  bun("scripts/patched-dependencies-check.ts"),
  // Each Biome plugin reports its planted mistakes and nothing else.
  bun("scripts/lint/biome-plugins.ts"),
  bun("scripts/token-contrast-check.ts"),
  bun("scripts/page-imports-check.ts"),
  bun("scripts/preview-switcher-check.ts"),
  bun("scripts/surface-briefs-check.ts"),
  bun("scripts/setup-draft-check.ts"),
  {
    ...run("packages/hub", "openapi:check"),
    // It holds the wire to the commits readers were built at (the base and
    // what is shipped, read off origin's tags), so a pass holds only for
    // those. Origin out of reach: what is shipped is unknown, and no pass
    // is reused (the check then says why it cannot run).
    extra: () => {
      try {
        return Promise.resolve(wireBaselines([]));
      } catch (error) {
        return Promise.resolve([`${String(error)} ${crypto.randomUUID()}`]);
      }
    },
  },
  // What every hub route takes, for core's request door (hub-request.ts):
  // read off the same in-process hub, so the same inputs.
  run("packages/hub", "route-types:check"),
  run("packages/hub", "migrations:check"),
  // The types it reads come through packages/hub/tsconfig.json, which
  // extends tsconfig.base.json, which extends tsconfig.paths.json, and from
  // the installed packages (TypeScript, @types/node, the MCP SDK, zod),
  // which bun.lock pins.
  run("packages/hub", "stored-shapes:check"),
  run("packages/hub", "roles:check"),
  run("packages/core", "openui:check"),
  bun("scripts/claude-paths-check.ts"),
  bun("scripts/machine-paths-check.ts"),
  bun("scripts/signal-check.ts"),
  bun("scripts/duplicate-lists-check.ts"),
  bun("scripts/apple-ops-check.ts"),
  bun("scripts/protocol-sweep.ts"),
  bun("scripts/git-door-words-check.ts"),
  // Every body a shell script sends the hub, against the hub's own routes.
  bun("scripts/shell-bodies-check.ts"),
  {
    ...bun("scripts/typecheck-coverage.ts"),
    // Which files there are, and the projects that hold them.
    files: () => tsconfigs,
    extra: async () => [
      files.filter((p) => TYPESCRIPT_FILE.test(p)).join("\n"),
    ],
  },
  {
    ...bun("scripts/resolution-check.ts"),
    // `golar tsc --listFilesOnly` resolves a project's references to the
    // declarations the type check writes under `.tsbuild/` (the only two
    // checks of a run that open anything there, read under strace).
    after: TSC,
    // What resolves: the installed packages, every tsconfig and manifest,
    // and every file's import specifiers.
    files: () => ["node_modules/", ...tsconfigs, ...manifests],
    extra: async () => [
      [...specifiers]
        .map(([file, named]) => `${file}:${named.join(",")}`)
        .sort()
        .join("\n"),
    ],
  },
  {
    // Dead files, exports, types and dependencies (knip.ts), over every
    // workspace at once; after the sync, for the dashboard's `$app/tsconfig`.
    name: "knip",
    argv: [join(ROOT, "node_modules/.bin/knip")],
    entries: [],
    // What it reads: the code, every manifest and tsconfig, its config, and
    // the installed packages (itself among them).
    files: () => [
      ...files.filter((p) => CODE.test(p) || p.endsWith(".css")),
      ...tsconfigs,
      ...manifests,
      "knip.ts",
      "node_modules/",
    ],
  },
  {
    // Duplicated code (.jscpd.json: threshold 0).
    name: "jscpd",
    argv: [join(ROOT, "node_modules/.bin/jscpd")],
    entries: [],
    files: () => [
      ...under("packages/", "apps/dashboard/", ".jscpd.json"),
      "node_modules/",
    ],
  },
  // Its own oxlint: Biome leaves the package out (biome.jsonc).
  {
    ...run("packages/jsonl-parser", "lint"),
    files: () => [...under("packages/jsonl-parser/"), "node_modules/"],
  },
  // And its own oxfmt, check-only (`bun run format` there writes).
  {
    ...run("packages/jsonl-parser", "format:check"),
    files: () => [...under("packages/jsonl-parser/"), "node_modules/"],
  },
];
for (const check of gated) {
  const inputs = inputsFor(check.entries, check.files?.() ?? []);
  const key = await keyOf(
    inputs.files,
    ...(await (check.extra?.(inputs.declared) ?? []))
  );
  if (await passed(check.name, key)) {
    skipped.push(check.name);
    continue;
  }
  checks.push({
    name: check.name,
    dir: join(ROOT, check.dir ?? "."),
    argv: check.argv,
    after: check.after ?? SYNC,
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
