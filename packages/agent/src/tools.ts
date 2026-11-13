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
import type { PolicySettingsOrigin } from "@anthropic-ai/claude-agent-sdk";
import type {
  ToolFootprint,
  ToolInstallMethod,
  ToolPlatform,
  ToolSignin,
  ToolSpec,
  ToolStatus,
  ToolUpdateSwitches,
} from "@cawco/core";
import {
  needProbe,
  olderThan,
  switchOn,
  TOOL_CATALOG,
  toolRuns,
  toolSpec,
} from "@cawco/core";
import { type Bounded, readWithin } from "@cawco/core/bounded";
import { type Ran, runCaptured } from "@cawco/core/run-captured";
import { hostEnvironment } from "@cawco/core/session-env";
import { spawnRead, spawnTethered, untether } from "@cawco/core/tether";
import { toolWords } from "@cawco/core/words/tools";
import { cawcoCommand } from "./cawco-command";
import { type SettingsRead, SettingsReadSchema } from "./claude-settings";
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
 * that failed on it, in the installer's words, not as one nobody tried. An
 * update that left a copy that runs older than the release it was after
 * (core `ToolStatus.detail` on `installed`) is kept too, so its words stay
 * on the row while the copy is where it left it ({@link probeReported}). Per
 * boot on purpose — restarting the daemon is a deliberate second try, and so
 * is a click.
 */
const failures = new Map<string, ToolStatus>();

const remember = (status: ToolStatus): ToolStatus => {
  if (status.state === "installed" && status.detail === undefined) {
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

/** How long a package manager is given to say whether it holds a file. */
const HOLDS_WAIT_MS = 5000;

/**
 * Asks a program: `argv` run in the tools' environment (core
 * `runCaptured`), given `ms` to finish and killed when they run out. None
 * when it couldn't start or didn't finish in time.
 */
const askProgram = async (
  argv: string[],
  ms: number
): Promise<Ran | undefined> => {
  const read = await readWithin(ms, (signal) =>
    runCaptured(argv, { env: toolEnv(), signal })
  ).catch(() => undefined);
  return read?.kind === "answered" ? read.value : undefined;
};

/**
 * Whether the package manager a method runs (`needs`) says it holds `file`:
 * `<needs> <holds…> <file>` exits 0 and names the package, within
 * {@link HOLDS_WAIT_MS} (core `ToolInstallMethod.holds`). As Claude Code asks
 * apk: `execFileNoThrow(n,[...a,this.sources.execPath()],{timeout:5000`, then
 * `if(r.code===0&&r.stdout)` (2.1.311's `ownsExecutable`). A machine without
 * the manager holds nothing of its.
 */
const asksHold = async (
  method: ToolInstallMethod,
  file: string
): Promise<boolean> => {
  const manager = method.needs ? resolveBin(method.needs) : undefined;
  if (!(manager && method.holds)) {
    return false;
  }
  const ran = await askProgram([manager, ...method.holds, file], HOLDS_WAIT_MS);
  return ran?.code === 0 && ran.stdout.trim() !== "";
};

/**
 * How long a method's need is given to answer its probe (core `needProbe`)
 * before it is taken as running: brew starts Ruby for it, and a host under
 * load answers late. A need that can't run says so at once (a shebang that
 * finds no interpreter exits 127 within milliseconds).
 */
const NEED_WAIT_MS = 15_000;

/** A need's binary as it stands: its real path, mtime and size. A binary replaced or updated is a new one. */
const binStamp = async (bin: string): Promise<string | undefined> => {
  try {
    const real = await realpath(bin);
    const info = await stat(real);
    return `${real}:${info.mtimeMs}:${info.size}`;
  } catch {
    return undefined;
  }
};

/**
 * Each need's last answer, by the binary it was asked of: its
 * {@link binStamp}, and why it can't run (`unmet`), none when it runs.
 */
const needAnswers = new Map<string, { stamp: string; unmet?: string }>();

/** The probes running now, by binary: one at a time each. */
const needAsking = new Map<string, Promise<string | undefined>>();

const needListeners = new Set<() => void>();

/**
 * `listener` hears each time a need's answer moved what {@link installAdvice}
 * says: a probe {@link methodFor} did not wait for answered otherwise than
 * what was known. Answers the unsubscribe.
 */
export const onNeedsAnswered = (listener: () => void): (() => void) => {
  needListeners.add(listener);
  return () => needListeners.delete(listener);
};

/**
 * Asks `bin` its probe (core `needProbe`): why it can't run, none when it
 * runs. It can't run when it does not start (`runCaptured` throws: no
 * interpreter the kernel can load) or exits other than 0 (an `npm` whose
 * `#!/usr/bin/env node` finds no `node`: niftybot.art, "/usr/bin/env: 'node':
 * No such file or directory"). One that started and has not answered within
 * {@link NEED_WAIT_MS} runs: the probe asks whether it can run, and a slow
 * host answers late, not never.
 */
const askNeed = async (
  need: string,
  bin: string
): Promise<string | undefined> => {
  let ran: Bounded<Ran>;
  try {
    // Tethered (core tether.ts `spawnRead`): ended at the bound, and with
    // the agent however it ends, never left running past it.
    ran = await readWithin(NEED_WAIT_MS, async (signal) => {
      const child = spawnRead([bin, ...needProbe(need)], {
        env: toolEnv(),
        stderr: "pipe",
        signal,
      });
      const [code, stdout, stderr] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ]).finally(() => untether(child.stdin));
      return { code, signalCode: child.signalCode, stdout, stderr };
    });
  } catch (error) {
    return toolWords.needBroken(
      bin,
      error instanceof Error ? error.message : String(error)
    );
  }
  if (ran.kind !== "answered" || ran.value.code === 0) {
    return undefined;
  }
  return toolWords.needBroken(
    bin,
    oneLine(tail(Bun.stripANSI(ran.value.stderr.trim() || ran.value.stdout)))
  );
};

/** {@link askNeed}, one at a time per binary, its answer kept by the binary's stamp. */
const askNeedOnce = (
  need: string,
  bin: string,
  stamp: string | undefined
): Promise<string | undefined> => {
  const running = needAsking.get(bin);
  if (running) {
    return running;
  }
  const asked = askNeed(need, bin)
    .then((unmet) => {
      const before = needAnswers.get(bin);
      if (stamp) {
        needAnswers.set(bin, { stamp, ...(unmet ? { unmet } : {}) });
      }
      // Advice given from what was known (taken as running) moves when it can't.
      const moved =
        before !== undefined && before.stamp === stamp
          ? before.unmet !== unmet
          : unmet !== undefined;
      if (moved) {
        for (const listener of needListeners) {
          listener();
        }
      }
      return unmet;
    })
    .finally(() => needAsking.delete(bin));
  needAsking.set(bin, asked);
  return asked;
};

/**
 * Why a method's need (core `ToolInstallMethod.needs`) can't serve an
 * install here, or none when it runs: on the PATH ({@link resolveBin}) and
 * not refused by its probe ({@link askNeed}). Present is not enough: an
 * `npm` that can't start Node is on the PATH and runs nothing.
 *
 * `fresh` (an install about to run): the binary is asked now, whatever was
 * known, since its runtime can come or go with the binary unchanged (a
 * `node` installed beside an `npm`). Otherwise (what the machine's
 * capabilities and a probe's words say, which never wait on a tool): the
 * last answer for the binary as it stands, and a binary never asked, or
 * changed since, is taken as running while it is asked in the background;
 * an answer that moves the advice tells {@link onNeedsAnswered}.
 */
const needUnmet = async (
  need: string,
  fresh: boolean
): Promise<string | undefined> => {
  const bin = resolveBin(need);
  if (!bin) {
    return toolWords.needMissing(need);
  }
  const stamp = await binStamp(bin);
  if (fresh) {
    return await askNeedOnce(need, bin, stamp);
  }
  const known = needAnswers.get(bin);
  if (stamp && known?.stamp === stamp) {
    return known.unmet;
  }
  askNeedOnce(need, bin, stamp).catch(() => undefined);
  return undefined;
};

/** Whether a method is for the copies it holds: a footprint, or a question for its package manager. */
const holdsCopies = (method: ToolInstallMethod): boolean =>
  method.footprint !== undefined || method.holds !== undefined;

const bears = async (
  footprint: ToolFootprint,
  { path, file }: Found
): Promise<boolean> => {
  if (footprint.kind === "brew") {
    // Every prefix keeps a formula's files in `Cellar/<formula>/<version>`
    // and a cask's in `Caskroom/<cask>/<version>`; its `bin` and `opt` links
    // resolve there.
    return ["Cellar", "Caskroom"].some((room) =>
      file.includes(`${sep}${room}${sep}${footprint.formula}${sep}`)
    );
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
    if (
      (method.footprint && (await bears(method.footprint, at))) ||
      (method.holds && (await asksHold(method, at.file)))
    ) {
      return { ...at, method };
    }
  }
  return at;
};

/**
 * Whether the catalog can tell how a present copy of this tool got here (its
 * methods carry footprints, or ask their manager, {@link holdsCopies}): only
 * then is the copy held to its own method. A tool without them installs with
 * its first eligible method, as it always has.
 */
const tracked = (spec: ToolSpec): boolean => spec.install.some(holdsCopies);

/**
 * Why a present tool will not be installed again here: it came some way the
 * catalog has no method for, or its method cannot run on this machine now.
 * Never a first-eligible method instead: that is a second copy.
 */
const refusal = async (
  spec: ToolSpec,
  at: Found,
  version: string | undefined,
  fresh: boolean
): Promise<string | undefined> => {
  if (!tracked(spec)) {
    return undefined;
  }
  if (!at.method) {
    // A tool with methods that hold no copies (its own updater, its
    // installer) takes any copy no package manager holds with one of those.
    if (!spec.install.every(holdsCopies)) {
      return undefined;
    }
    const ways = spec.install.map((method) => method.label).join(", ");
    return `${at.path} came from none of the ways CawCo installs ${spec.name} (${ways}), and CawCo puts no second copy beside it: install ${spec.name}${version ? ` ${version}` : ""} there the way it got there`;
  }
  if (!at.method.platforms.includes(platform() as ToolPlatform)) {
    return `${at.path} was installed with ${at.method.label}, which CawCo does not run on ${platform()}`;
  }
  const unmet = at.method.needs
    ? await needUnmet(at.method.needs, fresh)
    : undefined;
  return unmet
    ? `${at.path} was installed with ${at.method.label}, and ${unmet}`
    : undefined;
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
  const choice = await methodFor(spec, await findCopy(spec), want, false);
  if ("refused" in choice) {
    return { refusal: choice.refused };
  }
  return "method" in choice
    ? { command: commandOf(choice.method, want) }
    : { refusal: `${spec.name}: ${noMethod(spec, choice).detail}` };
};

/** Whether `version` is a policy pin: asked, and not the one version CawCo's build runs. */
const isPin = (
  spec: ToolSpec,
  version: string | undefined
): version is string => version !== undefined && version !== spec.exactVersion;

/** What an install of a tool here runs, or why none. */
type MethodChoice =
  | { method: ToolInstallMethod }
  | { method?: ToolInstallMethod; refused: string }
  | Unmet;

/**
 * Why no method runs an install here: each weighed method that can't run
 * and why (`unmet`, `<label>: <why>`), and for a pin, the version and the
 * methods of this platform that install no chosen version (`unpinnable`).
 */
interface Unmet {
  pin?: { unpinnable: string[]; version: string };
  unmet: string[];
}

/**
 * THE ONE CHOICE of what an install of `spec` at `version` runs here, for
 * {@link install} and {@link installAdvice} alike (core
 * `ToolInstallMethod`): a copy a method holds (its footprint, or its
 * manager's answer, {@link holdsCopies}) takes that method, or why it can't
 * run here (`refusal`); any other install takes the first method this
 * machine can run ({@link needUnmet}: its need runs, not just stands on
 * the PATH; asked now when `fresh`, an install about to run, else as last
 * known) among those that hold no copies, when the tool has any (a
 * package manager's method is for the copy it holds), else among all. A pin takes only a method that installs a given version: a
 * copy's own method that can't says so ({@link toolWords.cannotPin}), and
 * nothing runs.
 */
const methodFor = async (
  spec: ToolSpec,
  at: Found | undefined,
  version: string | undefined,
  fresh: boolean
): Promise<MethodChoice> => {
  const pinned = isPin(spec, version);
  if (at) {
    const refused = await refusal(spec, at, version, fresh);
    if (refused) {
      return { refused, ...(at.method ? { method: at.method } : {}) };
    }
    if (at.method) {
      return pinned && at.method.pinnedCommand === undefined
        ? {
            refused: toolWords.cannotPin(at.method.label, spec.name, version),
            method: at.method,
          }
        : { method: at.method };
    }
  }
  const unheld = spec.install.filter((one) => !holdsCopies(one));
  const onPlatform = (unheld.length > 0 ? unheld : spec.install).filter((one) =>
    one.platforms.includes(platform() as ToolPlatform)
  );
  const here = onPlatform.filter(
    (one) => !(pinned && one.pinnedCommand === undefined)
  );
  const unpinnable = onPlatform
    .filter((one) => !here.includes(one))
    .map((one) => one.label);
  // In catalog order, each asked only once the ones before it can't run.
  const unmet: string[] = [];
  for (const one of here) {
    const why = one.needs ? await needUnmet(one.needs, fresh) : undefined;
    if (!why) {
      return { method: one };
    }
    unmet.push(`${one.label}: ${why}`);
  }
  return pinned && unpinnable.length > 0
    ? { unmet, pin: { version, unpinnable } }
    : { unmet };
};

/** How long one read of a tool's settings is given, its own process's start included. */
const SETTINGS_READ_MS = 30_000;

/** A read of a tool's settings that gave none to decide on: the last line it said, when it said one. */
interface SettingsUnread {
  unread: string | undefined;
}

/**
 * A settings read's process as its answer (agent claude-settings.ts): the
 * settings when it printed them; none read when it didn't finish, failed
 * (with the last line it said), or printed anything else.
 */
const settingsAnswer = (
  ran: Ran | undefined
): SettingsRead | SettingsUnread => {
  if (ran?.code !== 0) {
    return { unread: ran?.stderr.trim().split("\n").at(-1) || undefined };
  }
  let answer: unknown;
  try {
    answer = JSON.parse(ran.stdout);
  } catch {
    return { unread: undefined };
  }
  const parsed = SettingsReadSchema.safeParse(answer);
  return parsed.success ? parsed.data : { unread: undefined };
};

/**
 * Each engine a tool's switches name (core `ToolUpdateSwitches.engine`), as
 * it reads the settings that hold them, given the variables to read:
 * - `claude-code`: `cawco claude-settings <variable>...` (agent
 *   claude-settings.ts), the Agent SDK's `resolveSettings` in a process of
 *   its own for each read, so the machine's policy is read as it stands
 *   at each update, not as it stood when the agent started.
 * Each read is given {@link SETTINGS_READ_MS}.
 */
const SETTINGS_ENGINES: Record<
  ToolUpdateSwitches["engine"],
  (variables: string[]) => Promise<SettingsRead | SettingsUnread>
> = {
  "claude-code": async (variables) =>
    settingsAnswer(
      await askProgram(
        [...cawcoCommand("claude-settings"), ...variables],
        SETTINGS_READ_MS
      )
    ),
};

/**
 * Where a switch is set, in the words a row says it with (core words
 * `toolWords.updatesOff`'s and `toolWords.autoUpdatesOff`'s `where`), and
 * what an unset there takes to reach CawCo: `next`, for a switch of every
 * update, how its next read sees it unset (`updatesOff`'s `then`); `keep`,
 * for one of the automatic updates, which a Retry runs past already, what
 * has CawCo keep it current (`autoUpdatesOff`'s `keep`).
 */
interface SwitchPlace {
  keep: string;
  next: string;
  where: string;
}

/**
 * A place CawCo's next read of the settings reads as it stands: that read
 * is a process of its own (`SETTINGS_ENGINES`), so an unset there counts at
 * the Retry after it, and at CawCo's next update of its own.
 */
const retried = (where: string): SwitchPlace => ({
  keep: toolWords.keepUnset,
  next: toolWords.thenRetry,
  where,
});

/**
 * Where one source of a tool's settings is (core `ToolUpdateSwitches.places`),
 * and how an unset there reaches CawCo's next read: a file by its path; a
 * managed policy by the place the engine says it came from, the managed
 * settings when it names none of these, or the files are kept nowhere on
 * this platform. Each is read as it stands, but the server-managed settings:
 * the engine reads the copy Claude Code last fetched, and "Claude Code
 * fetches settings from Anthropic's servers at startup and polls for updates
 * hourly during active sessions", or for "A client signed in through a
 * Claude apps gateway fetches its settings from the gateway and waits for
 * that fetch before the session starts"
 * (code.claude.com/docs/en/server-managed-settings, read 2026-11-04), so a
 * session's fetch comes first.
 */
const sourcePlace = (
  places: ToolUpdateSwitches["places"],
  source: SettingsRead["sources"][number]
): SwitchPlace => {
  if (source.path) {
    return retried(shownPath(source.path));
  }
  const { files, registry } = places;
  const dir = files.dirs[platform() as ToolPlatform];
  const named: Record<string, SwitchPlace> = {
    ...(dir
      ? {
          file: retried(
            toolWords.inManagedFiles(
              join(dir, files.file),
              join(dir, files.folder)
            )
          ),
        }
      : {}),
    hkcu: retried(toolWords.inRegistry(registry.value, registry.hkcu)),
    hklm: retried(toolWords.inRegistry(registry.value, registry.hklm)),
    plist: retried(toolWords.inProfile(places.profile)),
    remote: {
      keep: toolWords.keepFetched,
      next: toolWords.thenFetched,
      where: toolWords.inServerManaged,
    },
  } satisfies Partial<Record<PolicySettingsOrigin, SwitchPlace>>;
  const { policyOrigin } = source;
  return (
    (policyOrigin ? named[policyOrigin] : undefined) ??
    retried(toolWords.inManaged)
  );
};

/**
 * Whether a switch's value turns it on, as the tool reads that switch (core
 * `ToolUpdateSwitches`): set to anything at all for one of `anyValue`, else
 * by {@link switchOn}.
 */
const turnsOff = (
  switches: ToolUpdateSwitches,
  variable: string,
  value: unknown
): boolean =>
  switches.anyValue?.includes(variable)
    ? value !== undefined && value !== null && String(value) !== ""
    : switchOn(value);

/** Which of a tool's lists of switches one is in: every update's, or the automatic ones' (core `ToolUpdateSwitches`). */
type SwitchList = Extract<keyof ToolUpdateSwitches, "automatic" | "every">;

/**
 * The switch that turned a tool's updates off, the list it is in, where it
 * is set, and what an unset there takes to reach CawCo.
 */
type SwitchedOff = SwitchPlace & { list: SwitchList; variable: string };

/**
 * The switch with which a machine's owner turned the tool's own updates off,
 * where it is set, and how an unset there reaches CawCo's next read (core
 * `ToolUpdateSwitches`), from the environment the tool runs with (`env`) and
 * its settings as its engine resolved them: a variable's value is the
 * settings' `env`'s where they set it, which the tool applies over its
 * environment, else the environment's; it is set in the highest source whose
 * `env` sets it ({@link sourcePlace}), or in the environment, which is this
 * daemon's own, held from its start (`toolEnv`), so only a restart reads it
 * unset. One of `every` turns off any update; one of `automatic`, an
 * automatic one (CawCo's own) too, and the answer says which list it is in.
 * None set: undefined.
 */
const switchedOffIn = (
  switches: ToolUpdateSwitches,
  automatic: boolean,
  env: Readonly<Record<string, string | undefined>>,
  settings: SettingsRead
): SwitchedOff | undefined => {
  const resolved = settings.effective.env ?? {};
  const asked = [
    ...switches.every.map((variable) => ({ list: "every" as const, variable })),
    ...(automatic
      ? switches.automatic.map((variable) => ({
          list: "automatic" as const,
          variable,
        }))
      : []),
  ];
  for (const { list, variable } of asked) {
    const inSettings = Object.hasOwn(resolved, variable);
    const value = inSettings ? resolved[variable] : env[variable];
    if (!turnsOff(switches, variable, value)) {
      continue;
    }
    if (!inSettings) {
      return {
        list,
        variable,
        keep: toolWords.keepRestarted,
        next: toolWords.thenRestarted,
        where: toolWords.inEnvironment,
      };
    }
    const source = settings.sources.findLast(
      (one) =>
        one.settings.env !== undefined &&
        Object.hasOwn(one.settings.env, variable)
    );
    return {
      list,
      variable,
      ...(source
        ? sourcePlace(switches.places, source)
        : retried(toolWords.inManaged)),
    };
  }
};

/**
 * What a row says of the switch that turned the tool's updates off, or of
 * the read that couldn't tell (core words): a switch of every update says
 * how an unset reaches CawCo; one of the automatic updates says that Retry
 * updates it now, and what keeps it current.
 */
const offWords = (name: string, off: SwitchedOff | SettingsUnread): string => {
  if ("unread" in off) {
    return toolWords.settingsUnread(name, off.unread);
  }
  return off.list === "every"
    ? toolWords.updatesOff(name, off.variable, off.where, off.next)
    : toolWords.autoUpdatesOff(name, off.variable, off.where, off.keep);
};

/**
 * {@link switchedOffIn} on this machine: its tools' environment, and the
 * tool's settings as its engine reads them now; unread when the engine
 * gave none, which no update goes ahead on.
 */
const switchedOff = async (
  switches: ToolUpdateSwitches,
  automatic: boolean
): Promise<SwitchedOff | SettingsUnread | undefined> => {
  const read = await SETTINGS_ENGINES[switches.engine]([
    ...switches.every,
    ...switches.automatic,
  ]);
  return "unread" in read
    ? read
    : switchedOffIn(switches, automatic, toolEnv(), read);
};

/**
 * The tool as it stands after an install that ran nothing, with why: the
 * copy's own status with the words, `installed` while CawCo runs it, else
 * `failed` keeping its version (a tool CawCo keeps current keeps its copy's
 * version on a failure, core `ToolStatus.version`).
 */
const standing = async (
  spec: ToolSpec,
  words: (version: string | undefined) => string,
  method: ToolInstallMethod | undefined
): Promise<ToolStatus> => {
  const probed = await probeTool(spec);
  const label = method ? { method: method.label } : {};
  if (probed.state === "installed") {
    return { ...probed, ...label, detail: words(probed.version) };
  }
  return {
    id: spec.id,
    state: "failed",
    detail: words(probed.version),
    ...(probed.version ? { version: probed.version } : {}),
    ...label,
    at: Date.now(),
  };
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
 * What comes next for a copy older than its tool's floor: one CawCo keeps at
 * its newest release is updated with no press (hub tool-releases.ts) when it
 * says a version to compare; any other is updated by a press, or by hand.
 */
const belowFloorNext = (spec: ToolSpec, version: string | undefined): string =>
  spec.release && version
    ? toolWords.updatingItself
    : "Update it to put a newer one on.";

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
  // A tool CawCo updates with its own updater runs at its floor or newer.
  if (spec.minVersion && !(version && !olderThan(version, spec.minVersion))) {
    return {
      id: spec.id,
      state: "failed",
      detail: `${spec.bin} ${version ?? "of no version it will say"} is installed ${where.at}${at.method ? ` with ${at.method.label}` : ""}; CawCo runs ${spec.name} ${spec.minVersion} or newer. ${belowFloorNext(spec, version)}${where.others}`,
      ...(version ? { version } : {}),
      ...method,
      at: Date.now(),
    };
  }
  // A tool CawCo is built against is installed only at its one version.
  if (want && version !== want) {
    const refused = await refusal(spec, at, want, false);
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
  return await Promise.all(TOOL_CATALOG.map((spec) => probeToolStatus(spec)));
};

/**
 * One catalog tool as {@link probeTools} reports it: for a tool with its own
 * sign-in that is installed here, with whether it is signed in
 * ({@link toolSignin}).
 */
export const probeToolStatus = async (
  spec: ToolSpec,
  { fresh = false }: { fresh?: boolean } = {}
): Promise<ToolStatus> => {
  const status = await probeReported(spec);
  return spec.signin && status.state === "installed"
    ? {
        ...status,
        signin: await toolSignin(spec, { fresh, version: status.version }),
      }
    : status;
};

/** How long a tool's sign-in read stands before a probe reads it again. */
const SIGNIN_FRESH_MS = 10 * 60_000;

/** How long a tool's sign-in read may run: it starts the tool, which may start its own server. */
const SIGNIN_READ_MS = 60_000;

/** Each tool's last sign-in read, and the version of the copy it read. */
const signins = new Map<string, { signin: ToolSignin; version?: string }>();

/**
 * Whether `spec`'s copy here is signed in, by its own read
 * ({@link ToolSigninSpec.status}): signed in when it exits 0 saying none of
 * its signed-out words; signed out when it says one; else unknown, in its
 * own words. A read stands {@link SIGNIN_FRESH_MS} for the same copy
 * (`version`); `fresh` reads again. Spends nothing of the person's: the
 * read is the tool's own, run as it is.
 */
const toolSignin = async (
  spec: ToolSpec,
  { fresh = false, version }: { fresh?: boolean; version?: string } = {}
): Promise<ToolSignin> => {
  const kept = signins.get(spec.id);
  if (
    !fresh &&
    kept &&
    kept.version === version &&
    Date.now() - kept.signin.at < SIGNIN_FRESH_MS
  ) {
    return kept.signin;
  }
  const signin = await readSignin(spec);
  signins.set(spec.id, { signin, ...(version ? { version } : {}) });
  return signin;
};

/**
 * The first line a run of a tool said (`heard`, its stdout then its stderr)
 * that holds one of the tool's signed-out words; none while it has said none.
 */
const signedOutLine = (
  signedOut: readonly string[],
  heard: ToolHeard
): string | undefined =>
  Bun.stripANSI(`${heard.out}\n${heard.err}`)
    .split("\n")
    .map((line) => line.trim())
    .find((line) => {
      const lower = line.toLowerCase();
      return signedOut.some((word) => lower.includes(word.toLowerCase()));
    });

/** What a run of a tool said so far, on its stdout and its stderr. */
interface ToolHeard {
  err: string;
  out: string;
}

/**
 * How a run of a tool with a sign-in of its own ended, as
 * {@link heardUntilSignedOut} heard it: its exit, or the first line it said
 * that holds a signed-out word, said before or as it ended.
 */
export type ToolRunEnd = ToolHeard & ({ code: number } | { line: string });

/**
 * THE ONE READER of every run of a tool with a sign-in of its own (core
 * `ToolSigninSpec.signedOut`): its stdout and stderr read as they come, and
 * its end the first of its exit and its first line holding a signed-out
 * word. A run that says it is signed out is not waited on: agy 1.5.2 says
 * "Authentication required. Please visit the URL to log in:" on any print
 * run and then waits 60 s for a login no one is at (measured 2026-11-07, a
 * HOME with no sign-in), which held the machine's whole tools read, Claude
 * Code's cell with it, for that minute, and an image run as long. A run
 * still going when this answers is the caller's to end, its own way (the
 * tether's pipe, its process group).
 */
export const heardUntilSignedOut = async (
  child: {
    exited: Promise<number>;
    stderr: ReadableStream<Uint8Array>;
    stdout: ReadableStream<Uint8Array>;
  },
  signedOut: readonly string[]
): Promise<ToolRunEnd> => {
  const heard: ToolHeard = { out: "", err: "" };
  const { promise: saidOut, resolve: sayOut } = Promise.withResolvers<string>();
  const listen = async (
    stream: ReadableStream<Uint8Array>,
    into: keyof ToolHeard
  ): Promise<void> => {
    const decoder = new TextDecoder();
    try {
      for await (const chunk of stream) {
        heard[into] += decoder.decode(chunk, { stream: true });
        const line = signedOutLine(signedOut, heard);
        if (line !== undefined) {
          sayOut(line);
        }
      }
    } catch {
      // A pipe that fails has nothing more to say: what it said stands.
    }
  };
  const exited = async (): Promise<{ code: number }> => {
    const [code] = await Promise.all([
      child.exited,
      listen(child.stdout, "out"),
      listen(child.stderr, "err"),
    ]);
    return { code };
  };
  const signedOutFirst = async (): Promise<{ line: string }> => ({
    line: await saidOut,
  });
  const ended = await Promise.race([exited(), signedOutFirst()]);
  if ("line" in ended) {
    return { ...heard, ...ended };
  }
  // Said as it ended, in the last chunk read.
  const line = signedOutLine(signedOut, heard);
  return line === undefined ? { ...heard, ...ended } : { ...heard, line };
};

/** {@link toolSignin}'s read itself. */
const readSignin = async (spec: ToolSpec): Promise<ToolSignin> => {
  const words = spec.signin;
  const bin = await toolBinary(spec);
  if (!(words && bin)) {
    return {
      state: "unknown",
      detail: toolWords.signinNoCopy(spec.name),
      at: Date.now(),
    };
  }
  // Tethered (core tether.ts): the read starts the tool, which may run on
  // past an agent stopped mid-read, as `agy -p /usage` did past a scratch
  // fleet's agent (2026-11-04); the tether ends it with the agent.
  const read = await readWithin(SIGNIN_READ_MS, async (signal) => {
    // stdin is the agent's end of the pipe whose close ends the read.
    const child = spawnTethered([bin, ...words.status], {
      env: toolEnv(),
      stdout: "pipe",
      stderr: "pipe",
      signal,
    });
    const ended = await heardUntilSignedOut(child, words.signedOut);
    untether(child.stdin);
    return ended;
  }).catch(() => undefined);
  const asked = read?.kind === "answered" ? read.value : undefined;
  if (!asked) {
    return {
      state: "unknown",
      detail: toolWords.signinSilent(spec.name, SIGNIN_READ_MS / 1000),
      at: Date.now(),
    };
  }
  if ("line" in asked) {
    return { state: "signed-out", detail: asked.line, at: Date.now() };
  }
  const said = Bun.stripANSI(`${asked.out}\n${asked.err}`).trim();
  return asked.code === 0
    ? { state: "signed-in", at: Date.now() }
    : {
        state: "unknown",
        detail: toolWords.signinUnread(spec.name, asked.code, tail(said)),
        at: Date.now(),
      };
};

/** A tool's sign-in may have moved (its own sign-in ended here): its next read is fresh, and the hub hears. */
export const signinMoved = (id: string): void => {
  signins.delete(id);
  toolsMoved();
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

/**
 * One catalog tool, as {@link probeTools} reports it. An attempt's failure
 * ({@link failures}) stands while the copy is where the attempt left it: one
 * that kept the copy's version is gone once the copy says another (updated
 * by hand, or by its own updater), and any is gone once the tool runs,
 * except an update that left a copy that runs older than the release it was
 * after, which stands until that copy moves.
 */
const probeReported = async (spec: ToolSpec): Promise<ToolStatus> => {
  const started = Date.now();
  let status = await probeTool(spec);
  if (installing.has(spec.id)) {
    // The copy an update replaces keeps its version on the row while it runs.
    return {
      id: spec.id,
      state: "installing",
      ...(status.version ? { version: status.version } : {}),
      at: Date.now(),
    };
  }
  if ((installEnded.get(spec.id) ?? 0) >= started) {
    status = await probeTool(spec);
  }
  const kept = failures.get(spec.id);
  const moved = kept?.version !== undefined && kept.version !== status.version;
  if (moved || (kept?.state === "installed" && status.state !== "installed")) {
    failures.delete(spec.id);
    return status;
  }
  if (status.state === "installed") {
    if (kept?.state === "installed") {
      return kept;
    }
    // Put right by hand since: the attempt's failure no longer stands.
    failures.delete(spec.id);
    return status;
  }
  return kept ?? status;
};

/**
 * Why nothing can be run here, named exactly enough for the user to fix it:
 * each method {@link methodFor} weighed and why it can't run, and for a pin
 * the methods that install no chosen version ({@link Unmet}).
 */
const noMethod = (spec: ToolSpec, { unmet, pin }: Unmet): ToolStatus => {
  let detail = `${spec.name} has no installer for ${platform()}`;
  if (pin) {
    detail = toolWords.noPinInstaller(
      spec.name,
      pin.version,
      pin.unpinnable,
      unmet
    );
  } else if (unmet.length > 0) {
    detail = toolWords.noInstaller(unmet);
  }
  return { id: spec.id, state: "unsupported", detail, at: Date.now() };
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
 * Puts `version` of a tool on, with the method {@link methodFor} chooses, or
 * says why not. What a method `needs` is never installed here: a machine
 * without it is told so ({@link noMethod}). A copy whose owner turned its
 * updates off ({@link switchedOff}) is left as it is, with why.
 *
 * `ask.newest`: for a tool CawCo keeps at its newest release (core
 * `ToolSpec.release`), the release the hub sent this install to reach. A
 * copy that runs and is still older than it after the method answers
 * `installed` with why, in the method's words (`toolWords.behind`), kept
 * until that copy moves; a copy CawCo doesn't run keeps its version on the
 * failure, so its row still says which copy is there.
 */
const install = async (
  spec: ToolSpec,
  version: string | undefined,
  ask: InstallAsk
): Promise<ToolStatus> => {
  const at = tracked(spec) ? await findCopy(spec) : undefined;
  const choice = await methodFor(spec, at, version, true);
  if ("refused" in choice) {
    // A tool CawCo keeps current keeps its copy's standing (the words on a
    // copy that still runs); any other fails, as it always has.
    return remember(
      spec.release && at
        ? await standing(spec, () => choice.refused, choice.method)
        : {
            id: spec.id,
            state: "failed",
            detail: choice.refused,
            ...(choice.method ? { method: choice.method.label } : {}),
            at: Date.now(),
          }
    );
  }
  if (!("method" in choice)) {
    return remember(noMethod(spec, choice));
  }
  const { method } = choice;
  // A copy's owner may have turned its updates off: CawCo's own (automatic)
  // with either switch, a press with the one that turns off every update.
  // Settings that couldn't be read decide nothing, and nothing runs.
  const off =
    at && spec.updatesOff
      ? await switchedOff(spec.updatesOff, ask.automatic === true)
      : undefined;
  if (off) {
    return remember(
      await standing(spec, () => offWords(spec.name, off), undefined)
    );
  }

  const ran = await runMethod(spec, method, version);
  const probed = await probeTool(spec, version ?? spec.exactVersion);
  const { newest } = ask;
  if (probed.state === "installed") {
    if (
      spec.release &&
      newest &&
      probed.version &&
      olderThan(probed.version, newest)
    ) {
      return remember({
        ...probed,
        method: method.label,
        detail: toolWords.behind(
          method.label,
          probed.version,
          newest,
          oneLine(ran.said)
        ),
      });
    }
    return remember({ ...probed, method: method.label });
  }
  return remember({
    id: spec.id,
    state: "failed",
    detail: failedWords(spec, method, ran, probed, version),
    method: method.label,
    ...(spec.release && probed.version ? { version: probed.version } : {}),
    at: Date.now(),
  });
};

/**
 * What an install is asked for besides the version: `newest`, for a tool
 * CawCo keeps current, the release the hub sent it to reach; `automatic`,
 * sent by the hub itself to keep it current rather than pressed, which a
 * machine whose owner turned the tool's automatic updates off declines.
 */
export interface InstallAsk {
  automatic?: boolean;
  newest?: string;
}

/**
 * Puts a catalog tool on this machine: with the method its present copy came
 * from, or with the first method its platform and prerequisites allow
 * ({@link methodFor}), and answers with what the machine looks like
 * afterwards. Every tool is probed again for the hub then
 * ({@link toolsMoved}). Never throws: a failure is a {@link ToolStatus}
 * carrying what the installer said, which is what the dashboard shows and
 * what the hub records. `version` is the policy's pin; `ask`, what else the
 * hub asked ({@link InstallAsk}).
 */
export const installTool = async (
  id: string,
  version?: string,
  ask: InstallAsk = {}
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
  const work = install(spec, spec.exactVersion ?? version, ask).finally(() => {
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
    const after = await install(spec, version, {});
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
