/**
 * The fleet's Claude Code settings, OpenCode plugins and pi extensions (core
 * harness-config.ts) made ready on this machine, as each fleet sync carries
 * them: a settings row as it is, a plugin's or extension's `module` written
 * into a file of CawCo's own and its `package` installed by npm, both under
 * {@link fleetPlacedDir}, outside every checkout. What each row came to goes
 * into the harness set (fleet-harness-set.ts) that sessions load as they
 * start: Claude Code's flag settings (claude.ts), CawCo's OpenCode plugin
 * (opencode-plugin.ts), pi's `additionalExtensionPaths` (pi-runtime.ts).
 * Whatever no row names any more is taken away.
 */
import { createHash } from "node:crypto";
import { readdir, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import {
  type FleetHarnessConfig,
  type FleetItemState,
  harnessConfigProblem,
  npmPackageOf,
} from "@cawco/core";
import { readWithin } from "@cawco/core/bounded";
import { harnessConfigKey } from "@cawco/core/fleet-items";
import { fleetPlacedDir } from "@cawco/core/paths";
import { readRecord, writeStateFile } from "@cawco/core/state-file";
import type { SetHarnessConfig } from "./fleet-harness-set";
import { resolveBin, toolEnv } from "./tools";
import { z } from "zod";

/** How long one package's `npm install` gets: a first install of a package with its dependencies, as an MCP server's (mcp-install.ts). */
const NPM_INSTALL_MS = 180_000;

/** What a path component may hold. */
const UNSAFE = /[^A-Za-z0-9._-]/gu;

/** The dirs under {@link fleetPlacedDir} that hold modules, by kind, and the one that holds packages. */
const MODULE_KINDS = ["opencodePlugins", "piExtensions"] as const;
const PACKAGES = "npm";

/**
 * A module's dir: its kind's, by its row's key and its content's hash, so a
 * changed module is a new file and a server that imported the old one keeps
 * it, as a new one imports the new.
 */
const moduleDir = (row: FleetHarnessConfig, source: string): string =>
  join(
    fleetPlacedDir(),
    row.kind,
    `${harnessConfigKey(row).replace(UNSAFE, "_")}-${createHash("sha256").update(source).digest("hex").slice(0, 12)}`
  );

/** A package's install dir, one per package and version, shared by every row that names it. */
const packageDir = (name: string, version: string): string =>
  join(fleetPlacedDir(), PACKAGES, `${name}@${version}`.replace(UNSAFE, "_"));

const failed = (detail: string): FleetItemState => ({
  state: "failed",
  cause: "unknown",
  detail,
});

/** `name@version` installed by npm into `dir`, through a staging dir; npm's words when it does not. */
const install = async (
  name: string,
  version: string,
  dir: string
): Promise<string | undefined> => {
  const npm = resolveBin("npm");
  if (!npm) {
    return "npm is not installed on this machine, so the package was not installed.";
  }
  const staging = `${dir}.staging-${process.pid}-${Date.now()}`;
  const ran = await readWithin(NPM_INSTALL_MS, async (signal) => {
    const child = Bun.spawn(
      [
        npm,
        "install",
        "--prefix",
        staging,
        "--no-audit",
        "--no-fund",
        "--omit=dev",
        "--save-exact",
        `${name}@${version}`,
      ],
      { env: toolEnv(), stdout: "pipe", stderr: "pipe", signal }
    );
    const [stderr, exitCode] = await Promise.all([
      new Response(child.stderr).text(),
      child.exited,
    ]);
    return { exitCode, stderr };
  });
  if (ran.kind === "unanswered" || ran.value.exitCode !== 0) {
    await rm(staging, { recursive: true, force: true });
    return ran.kind === "unanswered"
      ? `npm install ${name}@${version} did not finish within ${NPM_INSTALL_MS / 1000} s.`
      : `npm install ${name}@${version} failed: ${ran.value.stderr.trim().split("\n").slice(-4).join("\n")}`;
  }
  await rm(dir, { recursive: true, force: true });
  await rename(staging, dir);
  return undefined;
};

/** A package's `package.json`, as far as its entry needs it. */
const PackageJsonSchema = z.object({
  exports: z.unknown(),
  main: z.string().optional(),
  module: z.string().optional(),
  version: z.string().optional(),
});
type PackageJson = z.infer<typeof PackageJsonSchema>;

/** The file an ES module import of the package at `root` loads: its `exports["."]` (`import`, else `default`), `module`, `main`, else `index.js`. */
const packageEntry = async (root: string): Promise<string> => {
  const pkg: PackageJson =
    (await readRecord(join(root, "package.json"), PackageJsonSchema)) ?? {
      exports: undefined,
    };
  const dot =
    typeof pkg.exports === "string"
      ? pkg.exports
      : ((pkg.exports as Record<string, unknown> | undefined)?.["."] ??
        pkg.exports);
  const conditional =
    dot && typeof dot === "object"
      ? ((dot as Record<string, unknown>).import ??
        (dot as Record<string, unknown>).default)
      : dot;
  const file =
    (typeof conditional === "string" ? conditional : undefined) ??
    pkg.module ??
    pkg.main ??
    "index.js";
  return join(root, file);
};

/** A row's package, installed when its dir does not hold that version yet: its root, or why not. */
const installedPackage = async (
  spec: string,
  kept: Set<string>
): Promise<{ root: string } | { failed: string }> => {
  const pkg = npmPackageOf(spec);
  if (!pkg) {
    return { failed: `${spec} is no npm package with its version.` };
  }
  const dir = packageDir(pkg.name, pkg.version);
  kept.add(dir);
  const root = join(dir, "node_modules", pkg.name);
  const held = await readRecord(join(root, "package.json"), PackageJsonSchema).catch(
    () => undefined
  );
  if (held?.version !== pkg.version) {
    const said = await install(pkg.name, pkg.version, dir);
    if (said) {
      return { failed: said };
    }
  }
  return { root };
};

/** One row made ready: what sessions load of it, or why it could not be. */
const readyRow = async (
  row: FleetHarnessConfig,
  kept: { modules: Set<string>; packages: Set<string> }
): Promise<SetHarnessConfig | { failed: string }> => {
  const base = {
    kind: row.kind,
    name: row.name,
    ...(row.cwd ? { cwd: row.cwd } : {}),
  };
  if (row.kind === "claudeSettings") {
    return { ...base, settings: row.settings ?? {} };
  }
  if (row.module !== undefined) {
    const dir = moduleDir(row, row.module);
    kept.modules.add(dir);
    const file = join(dir, "index.ts");
    if (!(await Bun.file(file).exists())) {
      await writeStateFile(file, row.module);
    }
    return { ...base, entry: file };
  }
  const got = await installedPackage(row.package ?? "", kept.packages);
  if ("failed" in got) {
    return got;
  }
  // pi loads a package's dir as a pi package; OpenCode's plugin imports a module.
  return {
    ...base,
    entry:
      row.kind === "piExtensions" ? got.root : await packageEntry(got.root),
  };
};

/** Every dir under `root` that `kept` does not name, removed. */
const pruneUnder = async (
  root: string,
  kept: ReadonlySet<string>
): Promise<void> => {
  const names = await readdir(root).catch(() => [] as string[]);
  await Promise.all(
    names
      .map((name) => join(root, name))
      .filter((dir) => !kept.has(dir))
      .map((dir) => rm(dir, { recursive: true, force: true }))
  );
};

/** What {@link readyHarnessRows} made ready, and the module and package dirs those name. */
interface ReadyRows {
  kept: { modules: Set<string>; packages: Set<string> };
  set: Record<string, SetHarnessConfig>;
}

/**
 * Each of `rows` made ready, by `<kind>:<name>` (a placed copy's
 * `@<place id>` after it), each reported applied or failed in words under
 * that key: one folder's rows as its workspace is cut (fleet.ts
 * `placeFolder`), every row as a sync converges ({@link syncHarnessConfig}).
 * Nothing is removed.
 */
export const readyHarnessRows = async (
  rows: readonly FleetHarnessConfig[],
  report: Record<string, FleetItemState>
): Promise<ReadyRows> => {
  const set: Record<string, SetHarnessConfig> = {};
  const kept = { modules: new Set<string>(), packages: new Set<string>() };
  for (const row of rows) {
    const key = harnessConfigKey(row);
    const problem =
      harnessConfigProblem(row) ??
      (row.scope && row.scope !== "user" && !row.cwd
        ? "bound to a project this machine has no folder of"
        : undefined);
    if (problem) {
      report[key] = failed(problem);
      continue;
    }
    try {
      const ready = await readyRow(row, kept);
      if ("failed" in ready) {
        report[key] = failed(ready.failed);
        continue;
      }
      set[key] = ready;
      report[key] = { state: "applied" };
    } catch (error) {
      report[key] = {
        state: "failed",
        cause: "unwritable",
        detail: error instanceof Error ? error.message : String(error),
      };
    }
  }
  return { kept, set };
};

/**
 * Every row of the sync made ready ({@link readyHarnessRows}); the files no
 * row names any more removed.
 */
export const syncHarnessConfig = async (
  rows: readonly FleetHarnessConfig[],
  report: Record<string, FleetItemState>
): Promise<Record<string, SetHarnessConfig>> => {
  const { kept, set } = await readyHarnessRows(rows, report);
  await Promise.all([
    ...MODULE_KINDS.map((kind) =>
      pruneUnder(join(fleetPlacedDir(), kind), kept.modules)
    ),
    pruneUnder(join(fleetPlacedDir(), PACKAGES), kept.packages),
  ]);
  return set;
};
