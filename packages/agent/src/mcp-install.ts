/**
 * The fleet's MCP servers that a row runs with npx, installed once on this
 * machine and launched from there: no session runs npx.
 *
 * npx reads its install under `<npm cache>/_npx/<hash>/concurrency.lock` on
 * every start (npm 11.19.1 libnpmexec index.js: `withLock(lockPath, () =>
 * npxArb.loadActual())`), waits on it with no end (with-lock.js `forever:
 * true`), and removes a lock only from its own exit handler (`onExit(
 * cleanupLocks)`), which a SIGKILL never runs. The next npx of that package
 * then waits until the lock is `staleThreshold = 60_000` ms old, and says
 * nothing: the MCP SDK's own 60 s for `initialize`. npm/cli#8733, which set
 * that threshold, accepts it ("lock takeover is already a very exceptional
 * case (i.e. it would typically only happen if another process was SIGKILLed
 * while holding the same lock)"), and npm 12.2.0's with-lock.js keeps it. A
 * boundary ends its sandbox with SIGKILL, and every workspace shares one npm
 * cache (core paths.ts `workspaceCacheEnv`), so one killed session held
 * every other session's browser tool for a minute.
 *
 * So the fleet sync installs each such package once, at its exact version,
 * with npm into a dir of its own ({@link installed}), and every harness
 * launches the package's bin from there with node (mcp-launcher.ts). A row's
 * version that is not exact (`latest`, a range) is read from the registry at
 * the sync, never at a session's start. Every npm call is bounded
 * ({@link NPM_VIEW_MS}, {@link NPM_INSTALL_MS}): a registry that does not
 * answer fails its row in words, and the sync goes on. A dir no row names any more retires
 * once no session that could launch from it is left ({@link retireInstalls}).
 */
import { mkdir, readdir, readlink, rename, rm, stat } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { readWithin } from "@cawco/core/bounded";
import { fleetMcpInstallsDir } from "@cawco/core/paths";
import { runCaptured } from "@cawco/core/run-captured";
import { isAlive, listedPid } from "@cawco/core/signal";
import { readRecord, writeStateFile } from "@cawco/core/state-file";
import { toolEnv } from "./tools";
import { z } from "zod";

/** What a row's npx command line asks for: one package, the bin it runs, and that bin's arguments. */
export interface NpxRun {
  /** The arguments the bin takes, as the row wrote them. */
  args: string[];
  /** The bin `--package` names it by; none: the one npx infers ({@link binOf}). */
  command?: string;
  name: string;
  /** What follows `@` in the row's package, `latest` when nothing does (npx's own default). */
  spec: string;
}

/** A registry package as npx takes one, `@scope/name@spec` with an optional spec. */
const PACKAGE = /^((?:@[^/@\s]+\/)?[^/@\s:]+)(?:@([^/\s:]+))?$/u;

/** A version npm installs as written, with no registry read: `x.y.z`, a prerelease or build after it. */
const EXACT = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u;

/** The options npx takes that CawCo can install from: its yes, and the package it names. */
const YES = new Set(["-y", "--yes"]);
const PACKAGE_OPTIONS = new Set(["-p", "--package"]);

const NPX_FORM = "Name it as `npx -y <package>@<version> [arguments]`.";

const PACKAGE_EQUALS = "--package=";

/** The package one npx option names, and how many arguments it took; none when the option names no package. */
const packageOption = (
  args: readonly string[],
  at: number
): { taken: number; value: string | undefined } | undefined => {
  const arg = args[at] as string;
  if (arg.startsWith(PACKAGE_EQUALS)) {
    return { value: arg.slice(PACKAGE_EQUALS.length), taken: 1 };
  }
  return PACKAGE_OPTIONS.has(arg)
    ? { value: args[at + 1], taken: 2 }
    : undefined;
};

/** npx's options, before its first positional: the `--package` they name, and where the positionals start. */
const readOptions = (
  args: readonly string[]
): { at: number; named?: string } | { refused: string } => {
  let named: string | undefined;
  let at = 0;
  while (at < args.length && args[at]?.startsWith("-")) {
    const arg = args[at] as string;
    if (arg === "--") {
      return { at: at + 1, named };
    }
    const option = packageOption(args, at);
    if (option) {
      if (named !== undefined || !option.value) {
        const why =
          named === undefined
            ? "no package after"
            : "more than one package with";
        return { refused: `npx here names ${why} ${arg}. ${NPX_FORM}` };
      }
      named = option.value;
      at += option.taken;
    } else if (YES.has(arg)) {
      at += 1;
    } else {
      return {
        refused: `npx's option ${arg} is not one CawCo installs a server from. ${NPX_FORM}`,
      };
    }
  }
  return { at, named };
};

/**
 * A row's npx arguments read as npx reads them (docs.npmjs.com/cli/v11/
 * commands/npx: "all flags and options must be set prior to any positional
 * arguments"): with no `--package`, the first positional is the package and
 * the rest its bin's; with one, the first positional is the bin. Anything
 * npx would run that is not one registry package (`-c`, a second
 * `--package`, a git or file spec) is refused in words that say why.
 */
export const readNpx = (
  args: readonly string[]
): NpxRun | { refused: string } => {
  const options = readOptions(args);
  if ("refused" in options) {
    return options;
  }
  const { named } = options;
  const [first, ...rest] = args.slice(options.at);
  const target = named ?? first;
  if (!target) {
    return { refused: `npx here names no package. ${NPX_FORM}` };
  }
  const [, name, spec = "latest"] = PACKAGE.exec(target) ?? [];
  if (!name) {
    return {
      refused: `${target} is not a package from the npm registry, which is what CawCo installs a server from. ${NPX_FORM}`,
    };
  }
  if (named === undefined) {
    return { name, spec, args: rest };
  }
  return first
    ? { name, spec, command: first, args: rest }
    : {
        refused: `npx here names ${named} and no command to run from it. ${NPX_FORM}`,
      };
};

/** What npm says went wrong: its first `npm error` line that is a sentence, not a field (`code E404`) or where its log is. */
const NPM_FIELD = /^(?:code|errno|syscall|path|dest|signal|command|cwd)\s/u;
const NPM_ERROR = /^npm (?:error|ERR!)\s*/u;
const npmSaid = (stderr: string, exitCode: number): string =>
  stderr
    .split("\n")
    .filter((line) => NPM_ERROR.test(line))
    .map((line) => line.replace(NPM_ERROR, "").trim())
    .find(
      (line) =>
        line !== "" &&
        !NPM_FIELD.test(line) &&
        !line.startsWith("A complete log of this run")
    ) ?? `npm exited ${exitCode} and said nothing`;

/**
 * How long a registry read may take: npm retries a refused or dropped
 * connection twice, 10 s and then 60 s apart (its `fetch-retries`,
 * `fetch-retry-mintimeout`, `fetch-retry-maxtimeout` defaults), so a machine
 * with no route to its registry would hold the sync, and every row after it,
 * for minutes.
 */
const NPM_VIEW_MS = 30_000;
/** How long one package's install may take, a large one over a slow link among them. */
const NPM_INSTALL_MS = 180_000;

/** What one npm run said, or that it was stopped at its bound. */
type NpmRan =
  { exitCode: number; stderr: string; stdout: string } | { timedOut: number };

/** `npm …args` with `ms` to finish: stopped at the bound, and said so, rather than waited on. */
const npmWithin = async (
  ms: number,
  command: string[],
  options: { cwd?: string; env: Record<string, string | undefined> }
): Promise<NpmRan> => {
  const read = await readWithin(ms, async (signal) => {
    const { code, stdout, stderr } = await runCaptured(command, {
      ...options,
      signal,
    });
    return { exitCode: code, stdout, stderr };
  });
  switch (read.kind) {
    case "answered":
      return read.value;
    case "unanswered":
      return { timedOut: ms };
    default: {
      const unhandled: never = read;
      throw new Error(`unhandled read: ${JSON.stringify(unhandled)}`);
    }
  }
};

/** The exact version `spec` of `name` is now: as written when it is one, else the registry's answer, the highest when it names several. */
const exactVersion = async (
  npm: string,
  run: NpxRun,
  env: Record<string, string | undefined>
): Promise<string | { failed: string }> => {
  if (EXACT.test(run.spec)) {
    return run.spec;
  }
  const asked = await npmWithin(
    NPM_VIEW_MS,
    [npm, "view", `${run.name}@${run.spec}`, "version", "--json"],
    { env }
  );
  if ("timedOut" in asked) {
    return {
      failed: `npm view ${run.name}@${run.spec} timed out after ${asked.timedOut / 1000} s: the registry did not answer`,
    };
  }
  if (asked.exitCode !== 0) {
    return { failed: npmSaid(asked.stderr, asked.exitCode) };
  }
  const said = JSON.parse(asked.stdout.trim() || "null") as
    string | string[] | null;
  const version = Array.isArray(said) ? said.at(-1) : said;
  return typeof version === "string"
    ? version
    : { failed: `npm names no version of ${run.name}@${run.spec}` };
};

/** The dir `name`@`version` is installed in: one per package and version, a scope's slash a `+`. */
const installDir = (name: string, version: string): string =>
  join(fleetMcpInstallsDir(), `${name.replace("/", "+")}@${version}`);

/** Where an install is made before it takes its name: whole there, or not there at all. */
const STAGING = ".installing-";

const PackageJsonSchema = z.object({
  bin: z.union([z.string(), z.record(z.string(), z.string())]).optional(),
  version: z.string().optional(),
});

/** Whether `path` is there. */
const exists = async (path: string): Promise<boolean> => {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
};

/** The JSON record at `file`; none when it is missing or does not parse. */
const readOrNone = async <S extends z.ZodType>(
  file: string,
  schema: S
): Promise<z.output<S> | undefined> => {
  try {
    return await readRecord(file, schema);
  } catch {
    return undefined;
  }
};

const SCOPE = /^@[^/]+\//u;

/** The bin file npx runs of `bins`: `command`'s when named; else the one file they all are, else the one named as the package's unscoped name. */
const pickBin = (
  bins: Record<string, string>,
  unscoped: string,
  command: string | undefined
): string | undefined => {
  if (command) {
    return bins[command];
  }
  const files = [...new Set(Object.values(bins))];
  return files.length === 1 ? files[0] : bins[unscoped];
};

/**
 * The file `run`'s bin is in `dir`'s install, as npx picks it (docs.npmjs.com
 * npx: one `bin` entry, or all of them one file; else the entry named as the
 * package's unscoped name): `--package`'s command names its own.
 */
const binOf = async (
  dir: string,
  run: NpxRun,
  version: string
): Promise<string | undefined> => {
  const root = join(dir, "node_modules", run.name);
  const pkg = await readOrNone(join(root, "package.json"), PackageJsonSchema);
  if (pkg?.version !== version) {
    return;
  }
  const unscoped = run.name.replace(SCOPE, "");
  const bins =
    typeof pkg.bin === "string" ? { [unscoped]: pkg.bin } : (pkg.bin ?? {});
  const file = pickBin(bins, unscoped, run.command);
  return file ? resolve(root, file) : undefined;
};

/** Installs in flight in this process, by dir: a second row of one package waits on the first. */
const inFlight = new Map<string, Promise<string | undefined>>();

/** `name`@`version` put into `dir` by npm, through a staging dir that takes `dir`'s name only once whole. Answers npm's sentence when it fails. */
const install = async (
  npm: string,
  run: NpxRun,
  version: string,
  dir: string,
  env: Record<string, string | undefined>
): Promise<string | undefined> => {
  const root = fleetMcpInstallsDir();
  const staging = join(
    root,
    `${STAGING}${process.pid}-${Date.now()}-${run.name.replace("/", "+")}`
  );
  await mkdir(staging, { recursive: true });
  const startedAt = Date.now();
  const ran = await npmWithin(
    NPM_INSTALL_MS,
    [
      npm,
      "install",
      "--prefix",
      staging,
      "--no-audit",
      "--no-fund",
      "--save-exact",
      `${run.name}@${version}`,
    ],
    { cwd: root, env }
  );
  if ("timedOut" in ran) {
    await rm(staging, { recursive: true, force: true });
    return `npm install ${run.name}@${version} timed out after ${ran.timedOut / 1000} s`;
  }
  if (ran.exitCode !== 0) {
    await rm(staging, { recursive: true, force: true });
    return npmSaid(ran.stderr, ran.exitCode);
  }
  try {
    await rename(staging, dir);
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    // Another process put the same install in place first: it is the one.
    if (!(await exists(dir))) {
      throw error;
    }
  }
  console.info(
    `[fleet-mcp] installed ${run.name}@${version} in ${((Date.now() - startedAt) / 1000).toFixed(1)} s: ${dir}`
  );
};

/** A row's npx command, installed: the bin to launch with node, from `dir`. */
export type Installed =
  { bin: string; dir: string; version: string } | { failed: string };

/**
 * `run`'s package installed at its exact version, once: a dir that holds it
 * already is used as it is; else npm installs it there now. `npm` is npm's
 * own (tools.ts `resolveBin`); `env` the row's own over the agent's, so a
 * row's npm settings (its registry) reach npm as they reached npx.
 */
export const installed = async (
  npm: string,
  run: NpxRun,
  rowEnv: Record<string, string> | undefined
): Promise<Installed> => {
  const env = { ...toolEnv(), ...rowEnv };
  const version = await exactVersion(npm, run, env);
  if (typeof version !== "string") {
    return version;
  }
  const dir = installDir(run.name, version);
  const found = await binOf(dir, run, version);
  if (found) {
    await ensureHeld(dir);
    return { bin: found, dir, version };
  }
  await mkdir(fleetMcpInstallsDir(), { recursive: true });
  const pending =
    inFlight.get(dir) ??
    install(npm, run, version, dir, env).finally(() => inFlight.delete(dir));
  inFlight.set(dir, pending);
  const failed = await pending;
  if (failed) {
    return { failed };
  }
  const bin = await binOf(dir, run, version);
  if (bin) {
    await ensureHeld(dir);
  }
  return bin
    ? { bin, dir, version }
    : {
        failed: `${run.name}@${version} has no bin ${run.command ? `named ${run.command}` : "npx would run"}. ${NPX_FORM}`,
      };
};

/** What a dir no row names any more waits on: the sessions live when it stopped being named. */
const RetiringSchema = z.object({
  sessions: z.array(z.string()),
  since: z.number(),
});
type Retiring = z.infer<typeof RetiringSchema>;

const RETIRING = ".cawco-retiring.json";

/** How soon a dir still in use is looked at again: a process using it ends with no event this agent hears. */
const RETIRE_AGAIN_MS = 60_000;

/**
 * The file in each install that every server launched from it holds open
 * for its whole life: node preloads it (`--require`, {@link launchArgs}) and
 * it opens itself and never closes. An open file is what says a process uses
 * the install. Its command line does not: a server may rename its process,
 * which overwrites the command line `ps` reads (chrome-devtools-mcp 1.11.0
 * build/src/bin/chrome-devtools-mcp.js: `process.title =
 * 'chrome-devtools-mcp';`, which a retirement here missed). Nor does its
 * environment on macOS: XNU leaves a code-restricted process's environment
 * out of what `ps -E` reads (bsd/kern/kern_sysctl.c `sysctl_procargsx`:
 * `omit_env_vars` unless `!cs_restricted(p)`).
 */
const HELD = ".cawco-held.cjs";
const HELD_SOURCE = `// Preloaded into every fleet MCP server CawCo launches from this install, and held open while it runs, so CawCo retires the install only once none does (agent mcp-install.ts).\nrequire("node:fs").openSync(__filename, "r");\n`;
/** A process's dir under `/proc`. */
const PID = /^\d+$/u;

/** node's arguments for a server launched from install `dir`: its held file preloaded, then the bin and the row's arguments. */
export const launchArgs = (
  dir: string,
  bin: string,
  args: readonly string[]
): string[] => ["--require", join(dir, HELD), bin, ...args];

/** The held file in install `dir`, written once ({@link HELD}). */
const ensureHeld = async (dir: string): Promise<void> => {
  const held = join(dir, HELD);
  if (!(await exists(held))) {
    await writeStateFile(held, HELD_SOURCE);
  }
};

/** The installs one Linux process holds a held file of open; none when it ended or is not this user's to read. */
const procHeld = async (pid: string): Promise<string[]> => {
  const fds = join("/proc", pid, "fd");
  const targets = await Promise.all(
    (await entriesOf(fds)).map(async (fd) => {
      try {
        return await readlink(join(fds, fd));
      } catch {
        return "";
      }
    })
  );
  return targets
    .filter((target) => basename(target) === HELD)
    .map((target) => basename(dirname(target)));
};

/**
 * The installs among `dirs` that a running process on this machine holds
 * open: on Linux each process's `/proc/<pid>/fd` (readable for this user's
 * own processes, a boundary's among them: the kernel's ptrace read check
 * passes on a matching uid), elsewhere `lsof` on the held files, which
 * names each process holding one and the file.
 */
const installsInUse = async (dirs: readonly string[]): Promise<Set<string>> => {
  if (dirs.length === 0) {
    return new Set();
  }
  if (process.platform === "linux") {
    const pids = (await entriesOf("/proc")).filter((one) => PID.test(one));
    return new Set((await Promise.all(pids.map(procHeld))).flat());
  }
  const held = dirs.map((dir) => join(dir, HELD));
  const ran = await Bun.$`lsof -F n -- ${held}`.quiet().nothrow();
  return new Set(
    ran.stdout
      .toString()
      .split("\n")
      .filter((line) => line.startsWith("n"))
      .map((line) => basename(dirname(line.slice(1))))
  );
};

/** Whether the process that made staging dir `name` still runs: its pid is in the name. */
const stagingAlive = (name: string): boolean => {
  const pid = Number(name.slice(STAGING.length).split("-")[0]);
  return Number.isInteger(pid) && pid > 1 && isAlive(listedPid(pid));
};

/** The dirs the last sync launched from; none before a sync this process ran. */
let named: Set<string> | undefined;
/** The one queue every install pass and retirement runs on, one at a time. */
let queue: Promise<void> = Promise.resolve();
let again: ReturnType<typeof setTimeout> | undefined;

/** `work` after everything before it on the queue, and before everything after. */
const inTurn = (work: () => Promise<void>): Promise<void> => {
  const next = queue.then(work);
  queue = next.then(
    () => undefined,
    () => undefined
  );
  return next;
};

/** The names in `dir`; none when it is not there. */
const entriesOf = async (dir: string): Promise<string[]> => {
  try {
    return await readdir(dir);
  } catch {
    return [];
  }
};

/**
 * What became of one entry of the installs dir: a staging dir whose process
 * ended goes; a dir a row names keeps no marker; any other is marked with
 * the sessions live when first found so (`sessions`), and goes once none of
 * those is live and no running process was launched from it (`inUse`).
 */
const retireOne = async (
  entry: string,
  inUse: ReadonlySet<string>,
  sessions: readonly string[],
  fleet: ReadonlySet<string>
): Promise<"kept" | "waiting"> => {
  const dir = join(fleetMcpInstallsDir(), entry);
  if (entry.startsWith(STAGING)) {
    if (!stagingAlive(entry)) {
      await rm(dir, { recursive: true, force: true });
    }
    return "kept";
  }
  const marker = join(dir, RETIRING);
  if (fleet.has(dir)) {
    await rm(marker, { force: true });
    return "kept";
  }
  const held = await readOrNone(marker, RetiringSchema);
  const waitsOn = held?.sessions ?? [...sessions];
  if (!held) {
    await writeStateFile(
      marker,
      JSON.stringify({
        since: Date.now(),
        sessions: waitsOn,
      } satisfies Retiring)
    );
  }
  if (waitsOn.some((id) => sessions.includes(id)) || inUse.has(entry)) {
    return "waiting";
  }
  await rm(dir, { recursive: true, force: true });
  console.info(
    `[fleet-mcp] retired ${entry}: no row names it and no session uses it`
  );
  return "kept";
};

/** One retirement pass; another in {@link RETIRE_AGAIN_MS} while a dir still waits. */
const sweep = async (live: () => readonly string[]): Promise<void> => {
  const fleet = named;
  if (!fleet) {
    return;
  }
  clearTimeout(again);
  const root = fleetMcpInstallsDir();
  const entries = await entriesOf(root);
  const inUse = await installsInUse(
    entries
      .map((entry) => join(root, entry))
      .filter((dir) => !(dir.startsWith(join(root, STAGING)) || fleet.has(dir)))
  );
  const sessions = live();
  const outcomes = await Promise.all(
    entries.map((entry) => retireOne(entry, inUse, sessions, fleet))
  );
  if (outcomes.includes("waiting")) {
    again = setTimeout(() => {
      retireInstalls(live).catch((error: unknown) =>
        console.warn(
          `[fleet-mcp] retiring old installs failed: ${String(error)}`
        )
      );
    }, RETIRE_AGAIN_MS);
    again.unref();
  }
};

/**
 * Each install dir no row names any more, retired once no session uses it:
 * first marked with the sessions live then (`live`, read now); removed once
 * none of those is live and no running process's command line names the dir
 * (a session's server, an OpenCode generation's, the shared host's). One
 * still in use is looked at again in {@link RETIRE_AGAIN_MS}. Before this
 * process has run a sync, nothing is retired: it does not yet know what the
 * fleet names.
 */
export const retireInstalls = (live: () => readonly string[]): Promise<void> =>
  inTurn(() => sweep(live));

/**
 * Runs `work`, a sync's install of every row it launches, in turn with
 * every retirement, then names the dirs it answers as the fleet's and retires
 * the rest: no retirement ever reads the dirs while an install is moving
 * one into place.
 */
export const syncInstalls = async <T>(
  work: () => Promise<{ dirs: string[]; result: T }>,
  live: () => readonly string[]
): Promise<T> => {
  let done: { dirs: string[]; result: T } | undefined;
  await inTurn(async () => {
    done = await work();
    named = new Set(done.dirs);
  });
  await retireInstalls(live);
  return (done as { dirs: string[]; result: T }).result;
};

/**
 * Runs `work`, the install of the rows one folder takes as its workspace
 * is cut (session.ts `placeClone`), in turn with every retirement, and
 * names the dirs it answers as the fleet's beside the last sync's: a dir
 * only that folder launches from is not retired before the next sync names
 * it. Nothing is retired here.
 */
export const placeInstalls = async <T>(
  work: () => Promise<{ dirs: string[]; result: T }>
): Promise<T> => {
  let done: { dirs: string[]; result: T } | undefined;
  await inTurn(async () => {
    done = await work();
    for (const dir of done.dirs) {
      named?.add(dir);
    }
  });
  return (done as { dirs: string[]; result: T }).result;
};
