/**
 * The workflow-tool executor (NEW.md §10): what the catalog's CLIs look like on
 * this machine, and putting the ones it is asked for on it. Generic on purpose
 * — every fact about a particular tool lives in {@link TOOL_CATALOG}, and
 * nothing here names one.
 */

import { existsSync } from "node:fs";
import { realpath } from "node:fs/promises";
import { arch, platform, tmpdir } from "node:os";
import { delimiter, dirname, join, sep } from "node:path";
import type {
  ToolFootprint,
  ToolInstallMethod,
  ToolPlatform,
  ToolSpec,
  ToolStatus,
} from "@cawco/core";
import { TOOL_CATALOG, toolSpec } from "@cawco/core";
import { hostEnvironment } from "@cawco/core/session-env";
import { writeStateFile } from "@cawco/core/state-file";
import { expandHome } from "./fs";

/** Where {@link NATIVE_ROUTINES} put what they install. */
const LOCAL_BIN = expandHome("~/.local/bin");
const NODE_DIR = expandHome("~/.local/node");

/**
 * bun's global bin dir as bun places it: `BUN_INSTALL_BIN`, else
 * `$BUN_INSTALL/bin`, else `~/.bun/bin`. bun's own installer puts bun there
 * too, and a service manager's PATH has never heard of it.
 */
const bunGlobalBin = (): string =>
  process.env.BUN_INSTALL_BIN ??
  join(process.env.BUN_INSTALL ?? expandHome("~/.bun"), "bin");

/**
 * The PATH every probe and installer runs with. A daemon that unpacked Node a
 * second ago still has the PATH it started with, so the `needs: 'npm'` method
 * that was waiting for it would find nothing — and asking the user to restart
 * the daemon between two halves of one install is not an install. bun's
 * global bin goes on it for the same reason: a copy bun installed is put on
 * again with bun, which a daemon under systemd would otherwise not find.
 */
export const toolPath = (): string =>
  [process.env.PATH, LOCAL_BIN, join(NODE_DIR, "bin"), bunGlobalBin()]
    .filter(Boolean)
    .join(delimiter);

/** A host tool's environment: this daemon's as a host tool gets it (core `hostEnvironment`), on {@link toolPath}. */
export const toolEnv = (): Record<string, string | undefined> => ({
  ...hostEnvironment(),
  PATH: toolPath(),
});

/**
 * {@link toolEnv} for a Claude Code that acts on the user layer, `~/.claude`
 * (core paths.ts `claudeHome`): the fleet's `claude plugin …` and its MCP
 * status read. Without either config-dir variable Claude Code reads, so it
 * runs in `$HOME/.claude`, the dir this daemon's own paths name. A daemon
 * started from inside a session inherits that session's `CLAUDE_CONFIG_DIR`;
 * passed on, it had a scratch daemon (its own HOME) register its
 * `$HOME/.claude/cawco-marketplace` in the operator's real registry.
 */
export const claudeHomeEnv = (): Record<string, string | undefined> => {
  const {
    CLAUDE_CONFIG_DIR: _dir,
    CLAUDE_SECURESTORAGE_CONFIG_DIR: _store,
    ...rest
  } = toolEnv();
  return rest;
};

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

const movedListeners = new Set<() => void>();

/**
 * `listener` hears each time this machine's tools may have moved: an install
 * this agent ran, or a harness finding its binary at another version than it
 * last did (a hand upgrade). The connection re-probes and tells the hub, so a
 * tool's state never sits stale until a restart. Answers the unsubscribe.
 */
export const onToolsMoved = (listener: () => void): (() => void) => {
  movedListeners.add(listener);
  return () => movedListeners.delete(listener);
};

/** Tells every {@link onToolsMoved} listener. */
export const toolsMoved = (): void => {
  for (const listener of movedListeners) {
    listener();
  }
};

/** What each tool was last found at, by any probe of it: its version, `missing`, or `unsaid`. */
const seen = new Map<string, string>();

/**
 * A probe found tool `id` at `found` (its version, `missing`, or `unsaid`).
 * Every probe of a tool says so here, the tool probe's and a harness's own
 * version check alike, so a change any of them sees (a hand upgrade, a
 * removal) is news to every listener ({@link toolsMoved}) whichever saw it.
 */
export const sawTool = (id: string, found: string): void => {
  const before = seen.get(id);
  seen.set(id, found);
  if (before !== undefined && before !== found) {
    toolsMoved();
  }
};

/**
 * `npm prefix -g` as each npm binary answered it. Asked once per npm: every
 * harness read checks its binary is there ({@link toolBinary}), and a spawn of
 * npm on each would be the cost of a machine without that tool on its PATH.
 */
const npmPrefixes = new Map<string, string>();

const npmPrefix = async (npm: string): Promise<string | undefined> => {
  const known = npmPrefixes.get(npm);
  if (known !== undefined) {
    return known;
  }
  const said = await Bun.$`${npm} prefix -g`.quiet().nothrow().env(toolEnv());
  const prefix = said.text().trim();
  if (said.exitCode !== 0 || !prefix) {
    return undefined;
  }
  npmPrefixes.set(npm, prefix);
  return prefix;
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
  const root = await npmPrefix(npm);
  if (!root) {
    return undefined;
  }

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

/**
 * A catalog tool's binary, found now: its bin on {@link toolPath}, then the
 * first of its well-known paths that is there, then npm's global bin. The one
 * lookup the tool probe and every harness adapter make, so an adapter runs
 * the copy the tool row reports on and never says "not found" beside it.
 */
export const toolBinary = async (spec: ToolSpec): Promise<string | undefined> =>
  resolveBin(spec.bin) ??
  spec.wellKnownPaths
    ?.map((path) => expandHome(path))
    .find((path) => existsSync(path)) ??
  (await npmGlobalBin(spec.bin));

/** `npm root -g`, resolved: where npm's global packages are, asked of npm. */
const npmGlobalRoot = async (): Promise<string | undefined> => {
  const npm = resolveBin("npm");
  if (!npm) {
    return undefined;
  }
  const root = await Bun.$`${npm} root -g`.quiet().nothrow().env(toolEnv());
  const said = root.text().trim();
  if (root.exitCode !== 0 || !said) {
    return undefined;
  }
  return await realpath(said).catch(() => said);
};

const isUnder = (path: string, dir: string): boolean =>
  path === dir || path.startsWith(dir.endsWith(sep) ? dir : `${dir}${sep}`);

/**
 * The dir a package manager installed `file`'s package into: what comes
 * before its first `node_modules` (`~/.bun/install/global` on obelisk, `~`
 * on a Mac whose bun global dir is its home).
 */
const installedInto = (file: string): string | undefined => {
  const at = file.indexOf(`${sep}node_modules${sep}`);
  return at === -1 ? undefined : file.slice(0, at);
};

/** A tool binary the PATH (or a well-known path) finds, and the file it resolves to. */
interface Found {
  file: string;
  /** The catalog method whose footprint it bears; none: it came some other way. */
  method?: ToolInstallMethod;
  path: string;
}

const bears = async (
  footprint: ToolFootprint,
  { path, file }: Found
): Promise<boolean> => {
  if (footprint.kind === "brew") {
    // Every prefix keeps a formula's files in `Cellar/<formula>/<version>`;
    // its `bin` and `opt` links resolve there.
    return file.includes(`${sep}Cellar${sep}${footprint.formula}${sep}`);
  }
  if (footprint.kind === "dir") {
    const dir = expandHome(footprint.path);
    return isUnder(path, dir) || isUnder(file, dir);
  }
  if (footprint.kind === "npm-global") {
    const root = await npmGlobalRoot();
    return root !== undefined && isUnder(file, root);
  }
  const into = installedInto(file);
  if (!into) {
    return false;
  }
  if (dirname(path) === bunGlobalBin()) {
    return true;
  }
  // A bun global dir holds bun's lockfile beside its node_modules; npm's
  // global root (`<prefix>/lib`) holds none.
  const locks = await Promise.all(
    ["bun.lock", "bun.lockb"].map((name) => Bun.file(join(into, name)).exists())
  );
  return locks.some(Boolean);
};

/** Where this machine's copy of a tool is, and the catalog method that put it there. */
const findCopy = async (spec: ToolSpec): Promise<Found | undefined> => {
  const path = await toolBinary(spec);
  if (!path) {
    return undefined;
  }
  const at: Found = {
    path,
    file: await realpath(path).catch(() => path),
  };
  for (const method of spec.install) {
    // biome-ignore lint/performance/noAwaitInLoops: methods are tried in catalog order and the loop returns on the first whose footprint matches
    if (method.footprint && (await bears(method.footprint, at))) {
      return { ...at, method };
    }
  }
  return at;
};

/**
 * Whether the catalog can tell how a present copy of this tool got here (its
 * methods carry footprints): only then is the copy held to its own method. A
 * tool without them installs with its first eligible method, as it always has.
 */
const tracked = (spec: ToolSpec): boolean =>
  spec.install.some((method) => method.footprint !== undefined);

/**
 * Why a present tool will not be installed again here: it came some way the
 * catalog has no method for, or its method cannot run on this machine now.
 * Never a first-eligible method instead: that is a second copy.
 */
const refusal = (
  spec: ToolSpec,
  at: Found,
  version: string | undefined
): string | undefined => {
  if (!tracked(spec)) {
    return undefined;
  }
  if (!at.method) {
    const ways = spec.install.map((method) => method.label).join(", ");
    return `${at.path} came from none of the ways CawCo installs ${spec.name} (${ways}), and CawCo puts no second copy beside it: install ${spec.name}${version ? ` ${version}` : ""} there the way it got there`;
  }
  if (!at.method.platforms.includes(platform() as ToolPlatform)) {
    return `${at.path} was installed with ${at.method.label}, which CawCo does not run on ${platform()}`;
  }
  if (at.method.needs && !resolveBin(at.method.needs)) {
    return `${at.path} was installed with ${at.method.label}, and ${at.method.needs} is not on this machine's PATH`;
  }
  return undefined;
};

/** The command a method runs for `version`; none for a native routine. */
const commandOf = (
  method: ToolInstallMethod,
  version: string | undefined
): string | undefined =>
  version && method.pinnedCommand
    ? method.pinnedCommand.replaceAll("{version}", version)
    : method.command;

/**
 * What putting a catalog tool on this machine runs, at the version CawCo runs
 * it at: the command of the method its present copy came from, or of the
 * first method this platform has when there is none. A present copy no method
 * may install again answers why instead (`refusal`). What the agent's error
 * texts and the machine's capabilities name, so the words and the install
 * action never disagree.
 */
export const installAdvice = async (
  id: string,
  version?: string
): Promise<{ command: string } | { refusal: string }> => {
  const spec = toolSpec(id);
  if (!spec) {
    return { refusal: `${id} is not in the tool catalog` };
  }
  const want = spec.exactVersion ?? version;
  const at = await findCopy(spec);
  if (at) {
    const refused = refusal(spec, at, want);
    if (refused) {
      return { refusal: refused };
    }
  }
  const method =
    at?.method ??
    spec.install.find((one) =>
      one.platforms.includes(platform() as ToolPlatform)
    );
  const command = method ? commandOf(method, want) : undefined;
  return command
    ? { command }
    : { refusal: `${spec.name} has no install command for ${platform()}` };
};

/** {@link installAdvice} as words to put in a sentence: the command, or why there is none. */
export const installAdviceText = async (id: string): Promise<string> => {
  const advice = await installAdvice(id);
  return "command" in advice ? advice.command : advice.refusal;
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
export const probeTool = async (
  spec: ToolSpec,
  /** The one version that counts as installed: the build's pin, or the one an install is putting on. */
  want = spec.exactVersion
): Promise<ToolStatus> => {
  const at = await findCopy(spec);
  if (!at) {
    sawTool(spec.id, "missing");
    return { id: spec.id, state: "missing", at: Date.now() };
  }
  const version = await probeVersion(spec, at.path);
  sawTool(spec.id, version ?? "unsaid");
  const method = at.method ? { method: at.method.label } : {};
  // A tool CawCo is built against is installed only at its one version.
  if (want && version !== want) {
    const refused = refusal(spec, at, want);
    return {
      id: spec.id,
      state: "failed",
      detail: `${spec.bin} ${version ?? "of no version it will say"} is installed${at.method ? ` with ${at.method.label}` : ""}; CawCo runs ${spec.name} ${want}. ${refused ? `${refused}.` : "Install it again to put that one on."}`,
      ...(version ? { version } : {}),
      ...method,
      at: Date.now(),
    };
  }
  return {
    id: spec.id,
    state: "installed",
    version,
    ...method,
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
    await writeStateFile(
      tarball,
      new Uint8Array(await downloaded.arrayBuffer())
    );
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

  const command = commandOf(method, version) ?? "";
  console.info(`[tools] ${spec.name}: ${method.label}: ${command}`);
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

/**
 * Puts `version` of a tool on: a copy already here goes on again with the
 * method that put it there, or not at all (`refusal`); with none here, its
 * requirements first (when asked), then the first method this machine can run.
 */
const install = async (
  spec: ToolSpec,
  version: string | undefined,
  requirements: boolean
): Promise<ToolStatus> => {
  const at = tracked(spec) ? await findCopy(spec) : undefined;
  let method = at?.method;
  if (at) {
    const refused = refusal(spec, at, version);
    if (refused) {
      return remember({
        id: spec.id,
        state: "failed",
        detail: refused,
        ...(at.method ? { method: at.method.label } : {}),
        at: Date.now(),
      });
    }
  } else {
    if (requirements) {
      const blocked = await satisfy(spec);
      if (blocked) {
        return remember(blocked);
      }
    }
    method = spec.install.find(eligible);
  }
  if (!method) {
    return remember(noMethod(spec));
  }

  const said = await runMethod(spec, method, version);
  const probed = await probeTool(spec, version ?? spec.exactVersion);
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
 * Puts a catalog tool on this machine: with the method its present copy came
 * from, or with the first method its platform and prerequisites allow, and
 * answers with what the machine looks like afterwards. Every tool is probed
 * again for the hub then ({@link toolsMoved}). Never throws: a failure is a
 * {@link ToolStatus} carrying what the installer said, which is what the
 * dashboard shows and what the hub records.
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
  try {
    // A tool CawCo is built against goes on at its one version, whatever is pinned.
    return await install(spec, spec.exactVersion ?? version, true);
  } finally {
    toolsMoved();
  }
};

/** An installer's tail, as one line for a sentence. */
const oneLine = (said: string | undefined): string =>
  (said ?? "").trim().replaceAll(/\s*\n\s*/g, "; ");

/** A tool {@link putOnPins} moved: from the version it said (when it said one) to `to`, with `method`. */
export interface PinMove {
  from?: string;
  id: string;
  method?: string;
  to: string;
}

/** A move, as a line says it. */
export const pinMoveWords = (move: PinMove): string =>
  `${toolSpec(move.id)?.name ?? move.id} ${move.from ?? "(no version said)"} -> ${move.to}${move.method ? ` with ${move.method}` : ""}`;

/**
 * THE PINS GO ON BEFORE THE BUILD THAT RUNS THEM. `pins`, by tool id, are
 * what `build` runs and no other: each one this machine has at another
 * version is put on now, with the method its copy came from, so the build
 * never starts beside a harness it refuses. A tool this machine does not have
 * is left alone: nothing here runs it. `moved` hears each move as it lands,
 * before the next is tried, so what went on is known even when a later one
 * fails. Throws one sentence at the first that does not go on.
 *
 * It runs in the staged build's own process (`cawco binary-pins`), so the
 * agent of the build before hears of a move only when a probe of its own
 * looks again; the build that pins these probes when it connects.
 */
export const putOnPins = async (
  pins: Record<string, string>,
  build: string,
  moved: (move: PinMove) => Promise<void>
): Promise<PinMove[]> => {
  const done: PinMove[] = [];
  for (const [id, version] of Object.entries(pins)) {
    const spec = toolSpec(id);
    if (!spec) {
      throw new Error(`${build} pins ${id}, which is not in its tool catalog`);
    }
    // biome-ignore lint/performance/noAwaitInLoops: one install at a time, and the first that fails ends it
    const before = await probeTool(spec, version);
    if (before.state === "missing" || before.state === "installed") {
      continue;
    }
    const after = await install(spec, version, false);
    if (after.state !== "installed") {
      throw new Error(
        `${spec.name} ${version}, which ${build} runs, did not go on${after.method ? ` with ${after.method}` : ""}: ${oneLine(after.detail)}`
      );
    }
    const move: PinMove = {
      id,
      to: version,
      ...(before.version ? { from: before.version } : {}),
      ...(after.method ? { method: after.method } : {}),
    };
    await moved(move);
    done.push(move);
  }
  return done;
};
