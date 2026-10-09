/**
 * The workflow-tool executor (NEW.md §10): what the catalog's CLIs look like on
 * this machine, and putting the ones it is asked for on it. Generic on purpose
 * — every fact about a particular tool lives in {@link TOOL_CATALOG}, and
 * nothing here names one.
 */

import { arch, platform, tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import type {
  ToolInstallMethod,
  ToolPlatform,
  ToolSpec,
  ToolStatus,
} from "@cawco/core";
import { TOOL_CATALOG, toolSpec } from "@cawco/core";
import { hostEnvironment } from "@cawco/core/session-env";
import { expandHome } from "./fs";

/** Where {@link NATIVE_ROUTINES} put what they install. */
const LOCAL_BIN = expandHome("~/.local/bin");
const NODE_DIR = expandHome("~/.local/node");

/**
 * The PATH every probe and installer runs with. A daemon that unpacked Node a
 * second ago still has the PATH it started with, so the `needs: 'npm'` method
 * that was waiting for it would find nothing — and asking the user to restart
 * the daemon between two halves of one install is not an install.
 */
export const toolPath = (): string =>
  [process.env.PATH, LOCAL_BIN, join(NODE_DIR, "bin")]
    .filter(Boolean)
    .join(delimiter);

/** A host tool's environment: this daemon's as a host tool gets it (core `hostEnvironment`), on {@link toolPath}. */
export const toolEnv = (): Record<string, string | undefined> => ({
  ...hostEnvironment(),
  PATH: toolPath(),
});

/** A binary's absolute path, searched wherever this daemon can install one. */
export const resolveBin = (name: string): string | undefined =>
  Bun.which(name, { PATH: toolPath() }) ?? undefined;

/** The first `x.y.z` a version command says is the version. */
const VERSION_PATTERN = /\d+\.\d+\.\d+/;

/** The end of an installer's output: enough to name what happened, not a wall of it. */
const TAIL_LINES = 4;

const tail = (output: string): string =>
  output.trim().split("\n").slice(-TAIL_LINES).join("\n");

/**
 * Installs that did not land since this daemon started. Reported in place of
 * the `missing` a re-probe would say, because `missing` is exactly what the hub
 * auto-installs: without this, every reconnect sends the same doomed install
 * out again. Per boot on purpose — restarting the daemon is a deliberate
 * second try, and so is a click.
 */
const failures = new Map<string, ToolStatus>();

const remember = (status: ToolStatus): ToolStatus => {
  if (status.state === "installed") {
    failures.delete(status.id);
  } else {
    failures.set(status.id, status);
  }
  return status;
};

/**
 * Where `npm install -g` puts binaries, asked of npm rather than guessed: nvm,
 * volta and a hand-set prefix all put them somewhere this daemon's PATH may
 * never have heard of.
 */
const npmGlobalBin = async (bin: string): Promise<string | undefined> => {
  const npm = resolveBin("npm");
  if (!npm) {
    return undefined;
  }
  const prefix = await Bun.$`${npm} prefix -g`.quiet().nothrow().env(toolEnv());
  if (prefix.exitCode !== 0) {
    return undefined;
  }

  const root = prefix.text().trim();
  const candidates =
    platform() === "win32"
      ? [join(root, `${bin}.cmd`), join(root, `${bin}.exe`)]
      : [join(root, "bin", bin)];
  for (const candidate of candidates) {
    // biome-ignore lint/performance/noAwaitInLoops: candidates are tried in priority order and the loop returns on the first that exists
    if (await Bun.file(candidate).exists()) {
      return candidate;
    }
  }
  return undefined;
};

/** PATH, then npm's global bin, then wherever the tool's installers are known to land. */
const locate = async (spec: ToolSpec): Promise<string | undefined> => {
  const onPath = resolveBin(spec.bin);
  if (onPath) {
    return onPath;
  }

  const global = await npmGlobalBin(spec.bin);
  if (global) {
    return global;
  }

  for (const wellKnown of spec.wellKnownPaths ?? []) {
    const path = expandHome(wellKnown);
    // biome-ignore lint/performance/noAwaitInLoops: well-known paths are tried in priority order and the loop returns on the first that exists
    if (await Bun.file(path).exists()) {
      return path;
    }
  }
  return undefined;
};

/**
 * Asked through the absolute path the probe found rather than the bare command
 * the catalog writes: an installer that edits shell rc files fixed the *user's*
 * PATH, and a daemon that has been running since before that still answers with
 * "command not found".
 */
const probeVersion = async (
  spec: ToolSpec,
  path: string
): Promise<string | undefined> => {
  const args = spec.versionCommand.slice(spec.bin.length).trim();
  const ran = await Bun.$`${path} ${{ raw: args }}`
    .quiet()
    .nothrow()
    .env(toolEnv());
  const said = `${ran.stdout.toString()}${ran.stderr.toString()}`;
  return said.match(VERSION_PATTERN)?.[0];
};

/**
 * What this machine has of one tool. A binary that will not say its version is
 * still installed — presence is the question, and the version is what we can
 * add about it.
 */
export const probeTool = async (spec: ToolSpec): Promise<ToolStatus> => {
  const path = await locate(spec);
  if (!path) {
    return { id: spec.id, state: "missing", at: Date.now() };
  }
  return {
    id: spec.id,
    state: "installed",
    version: await probeVersion(spec, path),
    at: Date.now(),
  };
};

/**
 * Every catalog tool, in catalog order — what `register` reports and what the
 * `listTools` control answers with.
 */
export const probeTools = async (): Promise<ToolStatus[]> =>
  await Promise.all(
    TOOL_CATALOG.map(async (spec) => {
      const status = await probeTool(spec);
      const failure = failures.get(spec.id);
      return status.state === "missing" && failure ? failure : status;
    })
  );

/** Numeric segment by segment: `1.10.0` is above `1.9.9`, which strings get wrong. */
const below = (found: string, floor: string): boolean => {
  const parts = (version: string): number[] =>
    version.split(".").map((segment) => Number.parseInt(segment, 10) || 0);
  const here = parts(found);
  const wanted = parts(floor);
  for (const [index, need] of wanted.entries()) {
    const has = here[index] ?? 0;
    if (has !== need) {
      return has < need;
    }
  }
  return false;
};

const eligible = (method: ToolInstallMethod): boolean =>
  method.platforms.includes(platform() as ToolPlatform) &&
  (!method.needs || resolveBin(method.needs) !== undefined);

/** Why nothing can be run here, named exactly enough for the user to fix it. */
const noMethod = (spec: ToolSpec): ToolStatus => {
  const here = platform();
  const needs = [
    ...new Set(
      spec.install
        .filter((method) => method.platforms.includes(here as ToolPlatform))
        .map((method) => method.needs)
        .filter((need): need is string => need !== undefined)
    ),
  ];
  return {
    id: spec.id,
    state: "unsupported",
    detail: needs.length
      ? `no eligible installer: needs one of ${needs.join(", ")}`
      : `${spec.name} has no installer for ${here}`,
    at: Date.now(),
  };
};

interface NodeRelease {
  lts: string | false;
  version: string;
}

const NODE_INDEX = "https://nodejs.org/dist/index.json";

/**
 * The installs no portable one-liner expresses honestly. Each throws with what
 * went wrong; {@link runMethod} turns that into the failure's `detail`.
 */
const NATIVE_ROUTINES: Record<string, (spec: ToolSpec) => Promise<void>> = {
  /**
   * Node from nodejs.org, for the common Linux daemon with neither brew nor
   * sudo: the latest LTS for this arch, unpacked into `~/.local/node` and
   * linked into `~/.local/bin`. It deliberately edits no shell rc file — the
   * PATH of a terminal the user opens tomorrow is not this routine's business,
   * and {@link resolveBin} is what makes the new npm reachable here and now.
   */
  "node-tarball": async () => {
    const releases = (await (await fetch(NODE_INDEX)).json()) as NodeRelease[];
    const lts = releases.find((release) => release.lts);
    if (!lts) {
      throw new Error("nodejs.org lists no LTS release");
    }

    const name = `node-${lts.version}-linux-${arch() === "arm64" ? "arm64" : "x64"}`;
    const url = `https://nodejs.org/dist/${lts.version}/${name}.tar.xz`;
    const downloaded = await fetch(url);
    if (!downloaded.ok) {
      throw new Error(`${url} answered ${downloaded.status}`);
    }

    const tarball = join(tmpdir(), `${name}.tar.xz`);
    await Bun.write(tarball, downloaded);
    await Bun.$`mkdir -p ${NODE_DIR} ${LOCAL_BIN}`.quiet();
    // The tarball carries its own top-level directory; stripping it is what
    // makes a second install land on top of the first rather than beside it.
    const unpacked =
      await Bun.$`tar -xJf ${tarball} -C ${NODE_DIR} --strip-components=1`
        .quiet()
        .nothrow();
    await Bun.$`rm -f ${tarball}`.quiet().nothrow();
    if (unpacked.exitCode !== 0) {
      throw new Error(tail(unpacked.stderr.toString()));
    }

    await Promise.all(
      ["node", "npm", "npx"].map((bin) =>
        Bun.$`ln -sf ${join(NODE_DIR, "bin", bin)} ${join(LOCAL_BIN, bin)}`
          .quiet()
          .nothrow()
      )
    );
  },
};

/** What the method said when it did not work — the tail of it, anyway. */
const runMethod = async (
  spec: ToolSpec,
  method: ToolInstallMethod,
  version?: string
): Promise<string | undefined> => {
  if (method.native) {
    const routine = NATIVE_ROUTINES[method.native];
    if (!routine) {
      return `no native routine named ${method.native}`;
    }
    try {
      await routine(spec);
      return undefined;
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  }

  const command =
    version && method.pinnedCommand
      ? method.pinnedCommand.replaceAll("{version}", version)
      : (method.command ?? "");
  const ran = await Bun.$`${{ raw: command }}`.quiet().nothrow().env(toolEnv());
  if (ran.exitCode === 0) {
    return undefined;
  }
  return (
    tail(ran.stderr.toString()) ||
    tail(ran.stdout.toString()) ||
    `exited ${ran.exitCode}`
  );
};

const install = async (
  spec: ToolSpec,
  version: string | undefined,
  requirements: boolean
): Promise<ToolStatus> => {
  if (requirements) {
    const blocked = await satisfy(spec);
    if (blocked) {
      return remember(blocked);
    }
  }

  const method = spec.install.find(eligible);
  if (!method) {
    return remember(noMethod(spec));
  }

  const said = await runMethod(spec, method, version);
  const probed = await probeTool(spec);
  if (probed.state === "installed") {
    return remember({ ...probed, method: method.label });
  }
  return remember({
    id: spec.id,
    state: "failed",
    detail:
      said ?? `${method.label} finished without leaving ${spec.bin} anywhere`,
    method: method.label,
    at: Date.now(),
  });
};

/**
 * What `spec` needs first. A missing requirement is installed here — depth 1, so
 * a requirement's own `requires` is not followed — and one that is present but
 * below its floor is reported rather than replaced: silently swapping a
 * machine's Node is ruder than naming the version that is in the way.
 */
const satisfy = async (spec: ToolSpec): Promise<ToolStatus | undefined> => {
  for (const requirement of spec.requires ?? []) {
    const needed = toolSpec(requirement.id);
    if (!needed) {
      continue;
    }

    // biome-ignore lint/performance/noAwaitInLoops: requirements are checked in order and the loop returns on the first unmet one
    let status = await probeTool(needed);
    if (status.state === "missing") {
      status = await install(needed, undefined, false);
    }
    if (status.state !== "installed") {
      return {
        id: spec.id,
        state: status.state === "unsupported" ? "unsupported" : "failed",
        detail: `${needed.name} is needed first: ${status.detail ?? status.state}`,
        at: Date.now(),
      };
    }
    // A binary that would not say its version is taken at its word rather than
    // condemned — the same call presence makes everywhere else in here.
    if (
      requirement.min &&
      status.version &&
      below(status.version, requirement.min)
    ) {
      return {
        id: spec.id,
        state: "unsupported",
        detail: `needs ${needed.id} >= ${requirement.min} (found ${status.version})`,
        at: Date.now(),
      };
    }
  }
  return undefined;
};

/**
 * Puts a catalog tool on this machine with the first method its platform and
 * prerequisites allow, and answers with what the machine looks like afterwards.
 * Never throws: a failure is a {@link ToolStatus} carrying what the installer
 * said, which is what the dashboard shows and what the hub records.
 */
export const installTool = async (
  id: string,
  version?: string
): Promise<ToolStatus> => {
  const spec = toolSpec(id);
  if (!spec) {
    return {
      id,
      state: "failed",
      detail: `${id} is not in the tool catalog`,
      at: Date.now(),
    };
  }
  return await install(spec, version, true);
};
