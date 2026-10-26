/**
 * The tool executor (NEW.md §10): what the catalog's CLIs look like on
 * this machine, and putting the ones it is asked for on it. Generic on purpose
 * — every fact about a particular tool lives in {@link TOOL_CATALOG}, and
 * nothing here names one.
 */

import { existsSync, realpathSync } from "node:fs";
import { mkdtemp, realpath, rm, stat } from "node:fs/promises";
import { homedir, platform, tmpdir } from "node:os";
import { basename, delimiter, dirname, join, sep } from "node:path";
import type {
  ToolFootprint,
  ToolInstallMethod,
  ToolPlatform,
  ToolSpec,
  ToolStatus,
} from "@cawco/core";
import { olderThan, TOOL_CATALOG, toolRuns, toolSpec } from "@cawco/core";
import { hostEnvironment } from "@cawco/core/session-env";
import { expandHome } from "./fs";
import { probeStarted } from "./probe-count";

/** Where the curl-script installers put their binaries (Claude Code's, Antigravity's). */
const LOCAL_BIN = expandHome("~/.local/bin");

/**
 * bun's global bin dir as bun places it: `BUN_INSTALL_BIN`, else
 * `$BUN_INSTALL/bin`, else `~/.bun/bin`. bun's own installer puts bun there
 * too, and a service manager's PATH has never heard of it.
 */
const bunGlobalBin = (): string =>
  process.env.BUN_INSTALL_BIN ??
  join(process.env.BUN_INSTALL ?? expandHome("~/.bun"), "bin");

/**
 * The PATH every probe and installer runs with: the daemon's own, then the
 * dirs installers put binaries in that a service manager's PATH has never
 * heard of. A tool a curl script put in `~/.local/bin` a second ago is found
 * without restarting the daemon, and a copy bun installed is put on again with
 * bun, which a daemon under systemd would otherwise not find.
 */
export const toolPath = (): string =>
  [process.env.PATH, LOCAL_BIN, bunGlobalBin()].filter(Boolean).join(delimiter);

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

/** npm, which installs the packages a fleet MCP's command names (mcp-install.ts) and the catalog's npm tools. */
const NPM = "npm";

/** What Bun's own binary is called, under whatever name a link gives it. */
const BUN_BINARIES = new Set(["bun", "bun.exe"]);

/** Every `name` on {@link toolPath}, in its order. */
const everyBin = (name: string): string[] =>
  toolPath()
    .split(delimiter)
    .filter(Boolean)
    .flatMap((dir) => Bun.which(name, { PATH: dir }) ?? []);

/**
 * Whether `path` is Bun's binary under another name, its real path's
 * basename `bun`: on the Mac `~/.bun/bin/npx` → `bunx` → `bun` came first on
 * the agent's launchd PATH and ran Bun's own CLI, which refuses npm's options
 * (`error: Invalid Argument '-y'`).
 */
const isBunBinary = (path: string): boolean => {
  try {
    return BUN_BINARIES.has(basename(realpathSync(path)));
  } catch {
    return false;
  }
};

/**
 * A binary's absolute path, searched wherever this daemon can install one.
 * `npm` is npm's alone: the first on the PATH that isn't Bun's binary, so a
 * Bun alias ahead of npm's never runs an install it can't take.
 */
export const resolveBin = (name: string): string | undefined =>
  name === NPM
    ? everyBin(NPM).find((path) => !isBunBinary(path))
    : (Bun.which(name, { PATH: toolPath() }) ?? undefined);

/** The `npm` on the PATH that is Bun's binary, when that is the only kind there is ({@link resolveBin} finds none). */
export const bunOnlyNpm = (): string | undefined => {
  const found = everyBin(NPM);
  return found.every(isBunBinary) ? found[0] : undefined;
};

/** The first `x.y.z` a version command says is the version. */
const VERSION_PATTERN = /\d+\.\d+\.\d+/u;

/** The end of an installer's output: enough to name what happened, not a wall of it. */
const TAIL_LINES = 4;

const tail = (output: string): string =>
  output.trim().split("\n").slice(-TAIL_LINES).join("\n");

/** An installer's tail, as one line for a sentence. */
const oneLine = (said: string | undefined): string =>
  (said ?? "").trim().replaceAll(/\s*\n\s*/gu, "; ");

/**
 * Installs that did not land since this daemon started. Reported in place of
 * whatever short of `installed` a re-probe would say: `missing` is exactly
 * what the hub auto-installs, so without this every reconnect sends the same
 * doomed install out again; and a copy still too old reads as the attempt
 * that failed on it, in the installer's words, not as one nobody tried. Per
 * boot on purpose — restarting the daemon is a deliberate second try, and so
 * is a click.
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
const toolsMoved = (): void => {
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

/** The bin dirs Homebrew links into, which a service manager's PATH may not hold while the person's shell does. */
const BREW_BINS = [
  "/opt/homebrew/bin",
  "/usr/local/bin",
  "/home/linuxbrew/.linuxbrew/bin",
];

/** `path` as a person reads it: under the home as `~/…`. */
const shownPath = (path: string): string => {
  const home = homedir();
  return isUnder(path, home) ? `~${path.slice(home.length)}` : path;
};

const realOf = (path: string): string => {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
};

/**
 * Where the copy of `spec` CawCo runs is ({@link toolBinary}: the one every
 * probe, gate and spawn takes), and the other copies on the machine it
 * passes over, as a sentence's tail: "at ~/.bun/bin/pi", then "CawCo runs
 * that one and passes over the one at /opt/homebrew/bin/pi." The Mac's pi
 * read 1.2.0 off a stray `~/.bun/bin/pi` while the shell ran Homebrew's
 * 1.3.0, and the row named neither (2026-10-23).
 */
const copyWords = (
  spec: ToolSpec,
  path: string
): { at: string; others: string } => {
  const runs = realOf(path);
  const copies = new Set([runs]);
  const others: string[] = [];
  const candidates = [
    ...everyBin(spec.bin),
    ...(spec.wellKnownPaths ?? []).map((each) => expandHome(each)),
    ...BREW_BINS.map((dir) => join(dir, spec.bin)),
  ];
  for (const candidate of candidates) {
    if (!existsSync(candidate)) {
      continue;
    }
    const real = realOf(candidate);
    if (!copies.has(real)) {
      copies.add(real);
      others.push(shownPath(candidate));
    }
  }
  const [first, ...rest] = others;
  let passed = "";
  if (first) {
    passed =
      rest.length === 0
        ? ` CawCo runs that one and passes over the one at ${first}.`
        : ` CawCo runs that one and passes over the ones at ${new Intl.ListFormat("en", { type: "conjunction" }).format(others)}.`;
  }
  return { at: `at ${shownPath(path)}`, others: passed };
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

/** The command a method runs for `version`. */
const commandOf = (
  method: ToolInstallMethod,
  version: string | undefined
): string =>
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
  // The method an install here would run: the copy's own, else the first
  // this machine can run (its `needs` present), as `install` picks.
  const method = at?.method ?? spec.install.find(eligible);
  return method
    ? { command: commandOf(method, want) }
    : { refusal: `${spec.name}: ${noMethod(spec).detail}` };
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
 * Whether a harness CLI the catalog holds may start here: the version gate
 * OpenCode's and pi's sessions go through (Claude Code's is its own,
 * claude-version.ts). Its binary as {@link toolBinary} finds it, and the
 * version that binary says, read once per file (its real path, mtime and
 * size: an update moves or rewrites it) so a start does not wait on a
 * `--version` each time. `refused` and its sentence when it is missing or
 * not a version the catalog runs (its floor, or its one version), in the
 * error formula with its fix: the press that installs it (dashboard
 * HarnessBlock).
 */
export interface ToolGate {
  path?: string;
  refused?: "not-installed" | "version";
  version?: string;
  /** The refusal's sentence; set with `refused`. */
  words?: string;
}

/** The version each binary said, by `<real path>:<mtime>:<size>`. */
const gateReads = new Map<string, Promise<string | undefined>>();

/** What `spec` runs, in words: "2.0.29", "1.3.0 or newer". */
const wanted = (spec: ToolSpec): string =>
  spec.exactVersion ??
  (spec.minVersion
    ? `${spec.minVersion} or newer`
    : "a version that says itself");

export const toolGate = async (spec: ToolSpec): Promise<ToolGate> => {
  const path = await toolBinary(spec);
  if (!path) {
    sawTool(spec.id, "missing");
    return {
      refused: "not-installed",
      words: `${spec.name} isn't installed on this machine, so CawCo can't start ${spec.name} sessions there. Install ${spec.name}, and CawCo runs it as soon as it's on.`,
    };
  }
  const file = await realpath(path).catch(() => path);
  const { mtimeMs, size } = await stat(file).catch(() => ({
    mtimeMs: 0,
    size: 0,
  }));
  const key = `${file}:${mtimeMs}:${size}`;
  let read = gateReads.get(key);
  if (!read) {
    read = probeVersion(spec, path);
    gateReads.set(key, read);
  }
  const version = await read;
  if (!version) {
    // Not kept: the next start asks again.
    gateReads.delete(key);
  }
  sawTool(spec.id, version ?? "unsaid");
  if (toolRuns(spec, version)) {
    return { path, ...(version ? { version } : {}) };
  }
  const update = spec.exactVersion
    ? `Install ${spec.name} ${spec.exactVersion}`
    : `Update ${spec.name}`;
  const where = copyWords(spec, path);
  return {
    path,
    ...(version ? { version } : {}),
    refused: "version",
    words: `${spec.name} ${version ?? "(it said no version)"} ${where.at} on this machine isn't one CawCo runs (${wanted(spec)}), so no ${spec.name} session starts there. ${update} on this machine, and CawCo runs it again: nothing was started.${where.others}`,
  };
};

/**
 * What this machine has of one tool. A binary that will not say its version is
 * still installed — presence is the question, and the version is what we can
 * add about it.
 */
const probeTool = async (
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
  const where = copyWords(spec, at.path);
  // A tool whose own updates CawCo rides runs at its floor or newer.
  if (spec.minVersion && !(version && !olderThan(version, spec.minVersion))) {
    return {
      id: spec.id,
      state: "failed",
      detail: `${spec.bin} ${version ?? "of no version it will say"} is installed ${where.at}${at.method ? ` with ${at.method.label}` : ""}; CawCo runs ${spec.name} ${spec.minVersion} or newer. Update it to put a newer one on.${where.others}`,
      ...(version ? { version } : {}),
      ...method,
      at: Date.now(),
    };
  }
  // A tool CawCo is built against is installed only at its one version.
  if (want && version !== want) {
    const refused = refusal(spec, at, want);
    return {
      id: spec.id,
      state: "failed",
      detail: `${spec.bin} ${version ?? "of no version it will say"} is installed ${where.at}${at.method ? ` with ${at.method.label}` : ""}; CawCo runs ${spec.name} ${want}. ${refused ? `${refused}.` : "Install it again to put that one on."}${where.others}`,
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
export const probeTools = async (): Promise<ToolStatus[]> => {
  probeStarted();
  return await Promise.all(TOOL_CATALOG.map(probeReported));
};

/**
 * The installs this agent runs now, by tool id, and when each last ended.
 * A probe reads a binary an install may be replacing under it: one that
 * read it mid-install was a read of the old copy, sent after the install's
 * own answer, and the hub kept it as the newer word (a cell's last write
 * stands), so the dashboard put an update that had landed back in front of
 * the person. While one runs the tool is reported as `installing`; one that
 * ended while the probe read is read again.
 */
const installing = new Map<string, Promise<ToolStatus>>();
const installEnded = new Map<string, number>();

/** One catalog tool, as {@link probeTools} reports it. */
const probeReported = async (spec: ToolSpec): Promise<ToolStatus> => {
  const started = Date.now();
  let status = await probeTool(spec);
  if (installing.has(spec.id)) {
    return { id: spec.id, state: "installing", at: Date.now() };
  }
  if ((installEnded.get(spec.id) ?? 0) >= started) {
    status = await probeTool(spec);
  }
  if (status.state === "installed") {
    // Put right by hand since: the attempt's failure no longer stands.
    failures.delete(spec.id);
    return status;
  }
  return failures.get(spec.id) ?? status;
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

/**
 * Runs a method: whether it exited 0, and the tail of what it said (its
 * errors first when it failed). An updater can exit 0 and change nothing
 * (Claude Code's `claude update` on a Homebrew install says "Claude is up to
 * date!"), so its words are kept either way.
 */
const runMethod = async (
  spec: ToolSpec,
  method: ToolInstallMethod,
  version?: string
): Promise<{ ok: boolean; said: string }> => {
  const command = commandOf(method, version);
  console.info(`[tools] ${spec.name}: ${method.label}: ${command}`);
  // A folder of its own, for the installer script a method downloads before
  // it runs it (core ToolInstallMethod `command`), gone with the run.
  const dir = await mkdtemp(join(tmpdir(), "cawco-install-"));
  const ran = await Bun.$`${{ raw: command }}`
    .cwd(dir)
    .quiet()
    .nothrow()
    .env(toolEnv())
    .finally(() => rm(dir, { recursive: true, force: true }));
  const out = tail(Bun.stripANSI(ran.stdout.toString()));
  const err = tail(Bun.stripANSI(ran.stderr.toString()));
  if (ran.exitCode === 0) {
    return { ok: true, said: out || err };
  }
  return { ok: false, said: err || out || `exited ${ran.exitCode}` };
};

/**
 * Why an install that ran left no copy CawCo runs, in the method's own
 * words: one that ran clean and left a copy CawCo doesn't run (what the
 * probe found, what the method said, and how to go on); one that ran clean
 * and left none (what it said, if anything); or one that failed (what it
 * said).
 */
const failedWords = (
  spec: ToolSpec,
  method: ToolInstallMethod,
  ran: { ok: boolean; said: string },
  probed: ToolStatus,
  version: string | undefined
): string => {
  if (!ran.ok) {
    return ran.said;
  }
  const said = ran.said ? oneLine(ran.said) : "";
  if (probed.version) {
    const wants = spec.minVersion
      ? `${spec.minVersion} or newer`
      : (version ?? spec.exactVersion);
    return `${method.label} finished, and ${spec.bin} still says ${probed.version}; CawCo runs ${spec.name} ${wants}.${said ? ` ${method.label} said: ${said}.` : ""} Update it on the machine the way it was installed, then Retry.`;
  }
  return `${method.label} finished without leaving ${spec.bin} anywhere${said ? `. It said: ${said}` : ""}`;
};

/**
 * Puts `version` of a tool on: a copy already here goes on again with the
 * method that put it there, or not at all (`refusal`); with none here, the
 * first method this machine can run. What a method `needs` is never installed
 * here: a machine without it is told so ({@link noMethod}).
 */
const install = async (
  spec: ToolSpec,
  version: string | undefined
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
    method = spec.install.find(eligible);
  }
  if (!method) {
    return remember(noMethod(spec));
  }

  const ran = await runMethod(spec, method, version);
  const probed = await probeTool(spec, version ?? spec.exactVersion);
  if (probed.state === "installed") {
    return remember({ ...probed, method: method.label });
  }
  return remember({
    id: spec.id,
    state: "failed",
    detail: failedWords(spec, method, ran, probed, version),
    method: method.label,
    at: Date.now(),
  });
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
  // One install of a tool at a time: a second ask while one runs (a press
  // in the dashboard while an add brings the machine up) answers with it.
  const running = installing.get(spec.id);
  if (running) {
    return await running;
  }
  // A tool CawCo is built against goes on at its one version, whatever is pinned.
  const work = install(spec, spec.exactVersion ?? version).finally(() => {
    installing.delete(spec.id);
    installEnded.set(spec.id, Date.now());
    toolsMoved();
  });
  installing.set(spec.id, work);
  return await work;
};

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
    const before = await probeTool(spec, version);
    if (before.state === "missing" || before.state === "installed") {
      continue;
    }
    const after = await install(spec, version);
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
