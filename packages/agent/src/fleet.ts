/**
 * The fleet's MCP servers and skill plugins on this machine (NEW.md §11). The
 * hub owns the desired state; nothing in here decides what belongs on a
 * machine, only what the machine came to when it was asked to converge.
 *
 * Everything cawco writes is named in a sidecar, and only what the sidecar
 * names is ever taken away again: `~/.claude.json` is the user's own file, and
 * an MCP server they added by hand — or a plugin they installed themselves —
 * outlives every sync this daemon runs.
 */

import {
  chmod,
  readdir,
  realpath,
  rename,
  rm,
  rmdir,
  stat,
} from "node:fs/promises";
import { basename, delimiter, isAbsolute, join } from "node:path";
import type {
  CliInstall,
  ConfigInspection,
  DiscoveredMcp,
  DiscoveredSkill,
  FleetConfig,
  FleetHook,
  FleetItemState,
  FleetMcpConfig,
  FleetMcpServer,
  FleetMemory,
  FleetMemoryDoc,
  FleetPluginPayload,
  FleetScope,
  FleetSkillPayload,
  FleetSyncReport,
  FleetToolchain,
  HookEvent,
  HookHandler,
  MachineHookScript,
  MachineMemoryDoc,
  MachineMemorySet,
  MarketplacePluginInfo,
  SkillFile,
} from "@cawco/core";
import { hookProblem, memoryDocProblem } from "@cawco/core";
import { accountIds } from "@cawco/core/paths";
import { accountClaudeJsons, linkUserLayer } from "./accounts";
import { excludeFromCheckout } from "./checkout-exclude";
import {
  convergeDeniedTools,
  machineDenyList,
  resolvedFleetDenials,
} from "./denied-tools";
import { expandHome } from "./fs";
import { readMcpRuntime } from "./mcp-status";
import { promptWrite } from "./prompt-writes";
import { resolveBin, toolEnv, toolPath } from "./tools";
import {
  guardWorkflowSkillRemoval,
  workflowSkillCollision,
} from "./workflow-skills";

/**
 * User-scope MCP servers live at the top level of this file — not in
 * `~/.claude/settings.json`, and not in anything under `~/.claude/`. Every
 * project loads them, and the SDK reads them whatever its `settingSources` say.
 */
const CLAUDE_JSON = expandHome("~/.claude.json");

/** What cawco manages here. Anything this does not name is never touched. */
const SIDECAR = expandHome("~/.claude/cawco-fleet.json");

/** Where a plain skill's files land — one directory per skill, all of it cawco's. */
const SKILLS_DIR = expandHome("~/.claude/skills");

/**
 * The fleet's OWN marketplace, written from the bytes the hub resolved. All of
 * it cawco's, like a skill's directory — rewritten whole whenever the set
 * changes, and never edited by anything else.
 */
export const VENDOR_DIR = expandHome("~/.claude/cawco-marketplace");

/** What that marketplace is called once linked, and the half after every `@`. */
const VENDOR_NAME = "cawco";

/** The user-scope memory every session on this machine reads (NEW.md §11). */
const MEMORY_PATH = expandHome("~/.claude/CLAUDE.md");

/**
 * The documents the main memory links, one file per path the set names. All of
 * it cawco's, like a skill's directory — nothing under here was ever written
 * by anything else, so a file the set stops carrying is a file that goes.
 */
const MEMORIES_DIR = expandHome("~/.claude/memories");

/**
 * The hook that puts a model's own document in front of the session running
 * that model. CawCo's own machinery rather than a document of the user's, so
 * it lives beside the sidecar and is written whenever it is not what this
 * version of cawco generates.
 */
const MEMORY_HOOK_PATH = expandHome("~/.claude/cawco-model-memory.sh");

/** Where Claude Code reads a user's hooks; the same file the user's own are in. */
const SETTINGS_PATH = expandHome("~/.claude/settings.json");

/**
 * Where a fleet hook's own script lands, one file per hook id. Named by id
 * rather than by name or hash, so renaming a hook in the editor moves its
 * registration but never orphans a script under an old name, and a hand edit
 * survives a hash bump to the same file it was made in.
 */
const HOOKS_DIR = expandHome("~/.claude/cawco-hooks");

const PLUGINS_DIR = expandHome("~/.claude/plugins");
/** The CLI's own account of what is linked and what is installed. */
const KNOWN_MARKETPLACES = join(PLUGINS_DIR, "known_marketplaces.json");
const INSTALLED_PLUGINS = join(PLUGINS_DIR, "installed_plugins.json");
/** Where a linked marketplace's clone lands. */
const MARKETPLACES_DIR = join(PLUGINS_DIR, "marketplaces");

/** Where the local installer puts the CLI when it is not on any PATH. */
const LOCAL_CLAUDE = expandHome("~/.claude/local/claude");

/** How long one `claude plugin …` gets: a first clone of a marketplace is slow. */
const CLI_TIMEOUT_MS = 120_000;
const MANUAL_ONLY_SKILL = /^disable-model-invocation:\s*true\s*$/m;

/** The end of a command's output: enough to name what happened, not a wall of it. */
const TAIL_LINES = 4;

const tail = (output: string): string =>
  output.trim().split("\n").slice(-TAIL_LINES).join("\n");

const said = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * One marketplace cawco linked, under both of the names it answers to.
 * `name` is the hub config's; `linkedAs` is the one the CLI chose, out of the
 * marketplace's own manifest. They are routinely different — cawco adds
 * `ryanthedev/rtd-claude-inn` and the CLI links it as `rtd` — so a sidecar that
 * kept one bare string left every later sync guessing which of the two it had.
 * Written only once something really is linked, which is what lets `linkedAs`
 * be a name the CLI is known to answer to rather than a hopeful one.
 */
interface ManagedMarketplace {
  linkedAs: string;
  name: string;
}

interface Sidecar {
  /** The fleet's "CawCo's to-dos" choice, synced from `supervisor_config.cawco_todos`. */
  cawcoTodos?: boolean;
  /**
   * The fleet's denied-tools list, synced from `supervisor_config.denied_tools`.
   * Absent from a sidecar written before this field existed, which is what has
   * {@link resolvedFleetDenials} fall back to compiled constants.
   */
  deniedTools?: string[];
  /**
   * Hook id → what cawco last registered for it. `command` is the identity
   * {@link withoutHooks} removes by — a command handler's `command` verbatim,
   * or the exact entry cawco wrote otherwise — so a hook renamed or moved to
   * a different event or settings file is still collectable by what it used to
   * be, not by whatever this version of cawco would write today.
   */
  hooks: Record<string, ManagedHook>;
  /**
   * The fleet marketplaces this machine was told live on the hub's machine
   * only ({@link FleetConfig.hubOnlyMarketplaces}). Nothing is linked for
   * them, so a status reads their rows off their plugins, as the sync did.
   */
  hubOnlyMarketplaces?: string[];
  marketplaces: ManagedMarketplace[];
  mcp: string[];
  /** The hash cawco last wrote to `~/.claude/CLAUDE.md`; absent = unmanaged. */
  memory?: string;
  /**
   * Set path → the hash cawco last wrote there, under `~/.claude/memories/`.
   * Per file, because drift is per file: one document edited on this machine
   * holds up itself and leaves the rest of the set converging.
   */
  memoryDocs: Record<string, string>;
  /** The SessionStart command cawco registered; only this one is ever removed. */
  memoryHook?: string;
  plugins: string[];
  /** Skill name → the hash of the files written, which is what makes a sync a no-op. */
  skills: Record<string, string>;
  /**
   * Plugin name → the hash of the vendored files written under
   * {@link VENDOR_DIR}. Same purpose as `skills`, and the reason a sync that
   * changes nothing rewrites nothing.
   */
  vendoredPlugins?: Record<string, string>;
}

/** What cawco registered for one hook, enough to find and remove it later. */
interface ManagedHook {
  command: string;
  cwd?: string;
  event: HookEvent;
  /** sha256 of the script cawco wrote, or of the hub's row when there is no script. */
  hash: string;
  scope: FleetScope;
}

const readJson = async <T>(path: string): Promise<T | undefined> => {
  const file = Bun.file(path);
  if (!(await file.exists())) {
    return undefined;
  }
  try {
    return (await file.json()) as T;
  } catch {
    return undefined;
  }
};

/**
 * Written whole and moved into place, whatever the content is. A crash between
 * the write and the rename leaves only the temp file behind — never a
 * half-written `path` that something else reads mid-write. A hook's script is
 * spawned with its execute bit, so a half-written one is worse than a
 * half-written JSON blob: it is a shell prefix somebody's session is about to run.
 */
export const writeAtomic = async (
  path: string,
  content: string | Buffer,
  reason?: string
): Promise<void> => {
  const write = async () => {
    const temp = `${path}.cawco-${process.pid}`;
    await Bun.write(temp, content);
    await rename(temp, path);
  };
  if (reason) {
    await promptWrite(reason, write);
  } else {
    await write();
  }
};

/** `~/.claude.json` is read by every Claude Code on this machine, and a
 * half-written one is a machine with no MCP servers and no history. */
const writeJson = (
  path: string,
  value: unknown,
  reason?: string
): Promise<void> => writeAtomic(path, JSON.stringify(value, null, 2), reason);

/**
 * A sidecar written before a marketplace carried both its names has one bare
 * string and no way to tell whose name it is. Kept only when the CLI still
 * lists something under it, because that is the only reading under which it
 * names something on this machine — a leftover cawco name owns nothing, and
 * treating it as a link is what would have a later sync remove a name that was
 * never linked. Config puts the entry back, in full, on the same sync.
 */
export const upgradeMarketplaces = (
  stored: (string | ManagedMarketplace)[] | undefined,
  linked: Record<string, KnownMarketplace>
): ManagedMarketplace[] =>
  (stored ?? []).flatMap((one) => {
    if (typeof one !== "string") {
      return [one];
    }
    return linked[one] ? [{ name: one, linkedAs: one }] : [];
  });

/** What cawco put here last time; unreadable is the same as never written. */
const readSidecar = async (): Promise<Sidecar> => {
  // Typed to admit the older shape too, so the upgrade is a fact of the type
  // rather than a cast: what is on disk may predate a marketplace's two names.
  const stored = await readJson<
    Partial<Omit<Sidecar, "marketplaces">> & {
      marketplaces?: (string | ManagedMarketplace)[];
    }
  >(SIDECAR);
  return {
    mcp: stored?.mcp ?? [],
    marketplaces: upgradeMarketplaces(
      stored?.marketplaces,
      await linkedMarketplaces()
    ),
    hubOnlyMarketplaces: stored?.hubOnlyMarketplaces ?? [],
    plugins: stored?.plugins ?? [],
    // Read back like every other record: without it each sync starts from an
    // empty one, so it reinstalls every vendored plugin and never uninstalls a
    // plugin the fleet dropped.
    vendoredPlugins: stored?.vendoredPlugins ?? {},
    // A sidecar written before skills existed names none, which is the truth.
    skills: stored?.skills ?? {},
    ...(stored?.memory ? { memory: stored.memory } : {}),
    // Likewise one written before the memory was a set: no linked document on
    // this machine is cawco's, so none of them is cawco's to take away.
    memoryDocs: stored?.memoryDocs ?? {},
    ...(stored?.memoryHook ? { memoryHook: stored.memoryHook } : {}),
    // A sidecar written before denied-tools syncing names none, which is what
    // has resolvedFleetDenials fall back to the compiled constants.
    ...(stored?.deniedTools ? { deniedTools: stored.deniedTools } : {}),
    ...(stored?.cawcoTodos ? { cawcoTodos: true } : {}),
    // A sidecar written before hooks existed manages none, which is the truth.
    hooks: stored?.hooks ?? {},
  };
};

type ClaudeJson = Record<string, unknown>;

/** The file, or why it could not be read. Missing is a machine with nothing in it. */
const readClaudeJson = async (
  path = CLAUDE_JSON
): Promise<{ ok: true; root: ClaudeJson } | { ok: false; detail: string }> => {
  const file = Bun.file(path);
  if (!(await file.exists())) {
    return { ok: true, root: {} };
  }
  try {
    return { ok: true, root: (await file.json()) as ClaudeJson };
  } catch (error) {
    return {
      ok: false,
      detail: `could not parse ${path}: ${tail(said(error))}`,
    };
  }
};

const mcpServersOf = (root: ClaudeJson): Record<string, unknown> => ({
  ...((root.mcpServers as Record<string, unknown> | undefined) ?? {}),
});

/**
 * Merges the fleet's servers into one `.claude.json`: what cawco now manages
 * goes in, what it managed and no longer does comes out. Every other key in
 * the file, and every server the sidecar does not name, comes back out
 * exactly as it went in. Answers why it could not, or nothing.
 */
const mergeFleetMcp = async (
  path: string,
  wanted: FleetMcpServer[],
  managed: string[]
): Promise<string | undefined> => {
  const file = await readClaudeJson(path);
  // Nothing is written over a file that cannot be read: the rest of it is the
  // user's own, and a rewrite from an empty root would take it with them.
  if (!file.ok) {
    return file.detail;
  }
  const servers = mcpServersOf(file.root);
  for (const server of wanted) {
    // The shared launcher preparation admits only runnable machine configs.
    servers[server.name] = server.config;
  }
  const names = wanted.map((server) => server.name);
  for (const name of managed.filter((one) => !names.includes(one))) {
    delete servers[name];
  }
  try {
    if (JSON.stringify(mcpServersOf(file.root)) !== JSON.stringify(servers)) {
      await writeJson(
        path,
        { ...file.root, mcpServers: servers },
        "MCP servers"
      );
    }
  } catch (error) {
    return `could not write ${path}: ${tail(said(error))}`;
  }
  return undefined;
};

/**
 * Merges the fleet's servers into `~/.claude.json` and every account dir's
 * own `.claude.json` (where an account's Claude Code reads them), and answers
 * with the names cawco now manages. The report is the machine's own file's.
 */
const syncMcp = async (
  desired: FleetMcpServer[],
  managed: string[],
  report: FleetSyncReport["mcp"]
): Promise<string[]> => {
  const wanted = desired.filter((server) => server.enabled);
  const problem = await mergeFleetMcp(CLAUDE_JSON, wanted, managed);
  if (problem) {
    for (const server of wanted) {
      report[server.name] = { state: "failed", detail: problem };
    }
    return managed;
  }
  for (const path of accountClaudeJsons()) {
    // biome-ignore lint/performance/noAwaitInLoops: one account's file at a time, each written whole
    const failed = await mergeFleetMcp(path, wanted, managed);
    if (failed) {
      console.warn(`[fleet] ${failed}`);
    }
  }

  const names = wanted.map((server) => server.name);
  const gone = managed.filter((name) => !names.includes(name));
  Object.assign(report, await readMcpRuntime(names));
  for (const name of gone) {
    report[name] = { state: "removed" };
  }
  return names;
};

/** The CLI the skill half drives — on PATH, or where the local installer puts it. */
const claudeBin = async (): Promise<string | undefined> => {
  const onPath = resolveBin("claude");
  if (onPath) {
    return onPath;
  }
  return (await Bun.file(LOCAL_CLAUDE).exists()) ? LOCAL_CLAUDE : undefined;
};

/**
 * Where a `claude` ends up when it is not the one PATH answers with. Every
 * entry is a real installer's destination: the CLI's own local installer, bun's
 * and npm's global bins, homebrew's two prefixes, and the FHS one a package
 * manager uses. The list exists so a SECOND install can be reported — a machine
 * that has the version the operator just installed sitting behind a stale
 * symlink is the whole of the failure this reports.
 */
const CLAUDE_ELSEWHERE = [
  LOCAL_CLAUDE,
  expandHome("~/.bun/bin/claude"),
  expandHome("~/.local/bin/claude"),
  expandHome("~/.npm-global/bin/claude"),
  "/opt/homebrew/bin/claude",
  "/usr/local/bin/claude",
  "/usr/bin/claude",
];

/**
 * How long one `claude --version` gets. Our choice, because: this is a probe
 * run for diagnostics beside a sync that already takes minutes, and a CLI that
 * will not print a version string in five seconds is one whose version is not
 * worth holding the report open for. A probe that times out reports the path
 * with no version, which is still the fact that matters.
 */
const VERSION_TIMEOUT_MS = 5000;

/** The first `x.y.z` a version command prints, the same rule tools.ts uses. */
const VERSION_PATTERN = /\d+\.\d+\.\d+/;

const askVersion = async (path: string): Promise<string | undefined> => {
  try {
    const child = Bun.spawn([path, "--version"], {
      env: toolEnv(),
      stdout: "pipe",
      stderr: "pipe",
      timeout: VERSION_TIMEOUT_MS,
    });
    const [out, err] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    await child.exited;
    return `${out}${err}`.match(VERSION_PATTERN)?.[0];
  } catch {
    return undefined;
  }
};

/**
 * Every `claude` on this machine, PATH order first, with the one this sync ran
 * marked. Deduplicated by what the path really points at, so a symlink and its
 * target are one install — but reported under the path that was FOUND, because
 * that is the one an operator has to move out of the way.
 */
export const claudeInstalls = async (used?: string): Promise<CliInstall[]> => {
  const candidates = [
    ...toolPath()
      .split(delimiter)
      .filter(Boolean)
      .map((dir) => join(dir, "claude")),
    ...CLAUDE_ELSEWHERE,
  ];

  const seen = new Set<string>();
  const found: string[] = [];
  for (const path of candidates) {
    // biome-ignore lint/performance/noAwaitInLoops: candidates are in PATH order; found must keep that order so the first real install on PATH is reported first
    if (!(await Bun.file(path).exists())) {
      continue;
    }
    // A path that cannot be resolved is still a path: fall back to itself
    // rather than dropping an install because one readlink failed.
    const real = await realpath(path).catch(() => path);
    if (seen.has(real)) {
      continue;
    }
    seen.add(real);
    found.push(path);
  }

  const usedReal = used ? await realpath(used).catch(() => used) : undefined;
  return await Promise.all(
    found.map(async (path) => {
      const real = await realpath(path).catch(() => path);
      const version = await askVersion(path);
      return {
        path,
        ...(version ? { version } : {}),
        ...(usedReal !== undefined && real === usedReal
          ? { used: true as const }
          : {}),
      };
    })
  );
};

/**
 * The toolchain, cached for this daemon's life and re-probed on every real
 * sync. A status read is answered from the cache because spawning a CLI per
 * status would make a passive read cost what an active one does; a sync
 * re-probes because that is the moment an operator has just changed something
 * and clicked to see whether it took.
 */
let toolchainCache: FleetToolchain | undefined;

export const machineToolchain = async (
  fresh: boolean
): Promise<FleetToolchain> => {
  if (!fresh && toolchainCache) {
    return toolchainCache;
  }
  const claude = await claudeInstalls(await claudeBin());
  toolchainCache = claude.length > 0 ? { claude } : {};
  return toolchainCache;
};

interface Ran {
  /** The tail of what it said, which is what a failure's `detail` carries. */
  output: string;
}

/**
 * One `claude plugin …`, with the daemon's environment and the PATH it can
 * install into. Killed rather than left running if it hangs: a marketplace
 * behind a dead network would otherwise hold the whole sync open forever.
 */
const runClaude = async (
  bin: string,
  args: string[],
  extraEnv?: Record<string, string>
): Promise<Ran> =>
  await promptWrite(`plugins ${args[1] ?? "update"}`, async () => {
    const child = Bun.spawn([bin, ...args], {
      env: { ...toolEnv(), ...extraEnv },
      stdout: "pipe",
      stderr: "pipe",
      timeout: CLI_TIMEOUT_MS,
    });
    const [stdout, stderr] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    const code = await child.exited;
    if (child.signalCode) {
      return { output: `timed out after ${CLI_TIMEOUT_MS / 1000}s` };
    }
    return { output: tail(stderr) || tail(stdout) || `exited ${code}` };
  });

/**
 * A clone that fell back to ssh and had nothing to authenticate with.
 *
 * The marketplaces and plugins a fleet carries are public repositories, and a
 * public repository needs no account to clone. But a plugin manifest names its
 * source as `{ "source": "github", "repo": "owner/name" }`, and the CLI turns
 * that into an ssh remote on a machine whose `gh` is not logged in — so a
 * machine with an expired token cannot install a plugin that anyone on the
 * internet can `git clone`. That is the whole failure, and it is not the
 * operator's to fix with a login.
 */
const SSH_REFUSED =
  /Permission denied \(publickey\)|Could not read from remote repository|Host key verification failed/i;

/**
 * Git config, passed to the child alone, that sends github over anonymous
 * https. `GIT_CONFIG_COUNT` is git's own environment form (git ≥ 2.31), so it
 * reaches every git the CLI shells out to and NOTHING else: not the machine's
 * `~/.gitconfig`, not this daemon, not the operator's own clones.
 */
const HTTPS_GITHUB: Record<string, string> = {
  GIT_CONFIG_COUNT: "2",
  GIT_CONFIG_KEY_0: "url.https://github.com/.insteadOf",
  GIT_CONFIG_VALUE_0: "git@github.com:",
  GIT_CONFIG_KEY_1: "url.https://github.com/.insteadOf",
  GIT_CONFIG_VALUE_1: "ssh://git@github.com/",
};

/**
 * A `claude plugin …` that clones, retried over https if ssh refused it.
 *
 * The retry is second, not first, on purpose: a fleet MAY legitimately carry a
 * private marketplace, and on a machine that reaches it with an ssh key the
 * first attempt is the one that works. Rewriting up front would break exactly
 * that machine. So the normal path is unchanged, and the rewrite is reached
 * only by the failure it answers — a public repo refused for want of an
 * account.
 */
const runClaudeCloning = async (bin: string, args: string[]): Promise<Ran> => {
  const first = await runClaude(bin, args);
  if (!SSH_REFUSED.test(first.output)) {
    return first;
  }
  return await runClaude(bin, args, HTTPS_GITHUB);
};

const isLinked = async (name: string): Promise<boolean> =>
  (await readJson<Record<string, unknown>>(KNOWN_MARKETPLACES))?.[name] !==
  undefined;

/** One entry of the CLI's own account of what is linked, and where it came from. */
export interface KnownMarketplace {
  source?: { source?: string; repo?: string; url?: string; path?: string };
}

const linkedMarketplaces = async (): Promise<
  Record<string, KnownMarketplace>
> =>
  (await readJson<Record<string, KnownMarketplace>>(KNOWN_MARKETPLACES)) ?? {};

/**
 * `owner/repo`, an ssh remote, an https clone URL and a `marketplace.json` URL
 * can all name the same link. Compared on the part that identifies it, so the
 * spelling cawco stores still matches whatever the CLI wrote down.
 */
const GIT_PLUS_PREFIX = /^git\+/;
const GIT_SSH_HOST = /^git@github\.com:/;
const GIT_URL_HOST = /^(https?|ssh):\/\/([^@]*@)?(www\.)?github\.com\//;
const GIT_SUFFIX = /\.git$/;
const TRAILING_SLASHES = /\/+$/;

const sourceKey = (source: string): string =>
  source
    .trim()
    .toLowerCase()
    .replace(GIT_PLUS_PREFIX, "")
    .replace(GIT_SSH_HOST, "")
    .replace(GIT_URL_HOST, "")
    .replace(GIT_SUFFIX, "")
    .replace(TRAILING_SLASHES, "");

const sourceKeysOf = (entry: KnownMarketplace): string[] =>
  [entry.source?.repo, entry.source?.url, entry.source?.path]
    .filter((one): one is string => typeof one === "string")
    .map(sourceKey);

/**
 * The name the CLI linked a marketplace under, which comes from the
 * marketplace's own `marketplace.json` and is not necessarily the name cawco
 * calls it: `ryanthedev/rtd-claude-inn` is added and comes back as `rtd`.
 * Everything downstream — the clone's directory, a `plugin@marketplace` id,
 * `marketplace remove` — speaks the CLI's name, so a sync that kept cawco's
 * would report a successful add as a failure and never install a plugin from
 * it. Matched on the source when the name does not hit, because the source is
 * the one thing both sides agree on.
 */
export const linkedNameIn = (
  linked: Record<string, KnownMarketplace>,
  name: string,
  source: string
): string | undefined => {
  if (linked[name]) {
    return name;
  }
  const wanted = sourceKey(source);
  return Object.keys(linked).find((key) =>
    sourceKeysOf(linked[key]).includes(wanted)
  );
};

const linkedNameFor = async (
  name: string,
  source: string
): Promise<string | undefined> =>
  linkedNameIn(await linkedMarketplaces(), name, source);

interface InstalledPlugins {
  /** Plugin id → one entry per scope it is installed at, with its unpacked copy. */
  plugins?: Record<string, { scope?: string; installPath?: string }[]>;
}

/** Whether the CLI lists the plugin at the scope this daemon installs at. */
const isInstalled = async (id: string): Promise<boolean> => {
  const stored = await readJson<InstalledPlugins>(INSTALLED_PLUGINS);
  return (stored?.plugins?.[id] ?? []).some((entry) => entry.scope === "user");
};

/** `plugin@marketplace` is the CLI's own form, and the half after the `@` is the link. */
const marketplaceOf = (id: string): string => id.split("@").pop() ?? "";

/** And the half before it, which is what a vendored plugin is called. */
const pluginNameOf = (id: string): string => id.split("@")[0] ?? id;

/**
 * Why a plugin of a hub-only marketplace is not on this machine. The bytes the
 * hub carries are its only way here: the marketplace is a directory on the
 * hub's machine, which no command run here can link. The dashboard names the
 * fault by this sentence's last clause (fleet-faults.ts `HUB_ONLY`).
 */
const hubOnlyMiss = (marketplace: string, hubError: string | undefined) =>
  `${hubError ? `the hub could not carry it (${hubError})` : "the hub has not resolved it yet"}, and its marketplace ${marketplace} is a directory on the hub's machine`;

/**
 * A hub-only marketplace's row on this machine. Nothing is linked for it, so
 * it is what its plugins came to: working when every one of them is
 * installed, failed naming each one that is not.
 */
const hubOnlyStates = (
  names: readonly string[],
  plugins: Record<string, FleetItemState>,
  into: Record<string, FleetItemState>
): void => {
  for (const name of names) {
    const missing = Object.entries(plugins).filter(
      ([id, item]) => marketplaceOf(id) === name && item.state === "failed"
    );
    into[name] =
      missing.length === 0
        ? { state: "applied" }
        : {
            state: "failed",
            detail: missing
              .map(([id, item]) => `${id}: ${item.detail ?? "not installed"}`)
              .join("; "),
          };
  }
};

/**
 * Which of the marketplaces cawco linked last time are cawco's to unlink
 * now. What goes is a link, so what is compared is the link: renaming a
 * marketplace in the hub's config changes cawco's name for it and nothing on
 * the machine, and comparing the names instead would unlink the marketplace
 * this same sync just linked. A name config still asks for is not a removal
 * either — nothing linked under it means the add failed, which is its own
 * report and not something to take away.
 */
export const toUnlink = (
  managed: ManagedMarketplace[],
  kept: ManagedMarketplace[],
  config: Pick<FleetConfig, "marketplaces">
): ManagedMarketplace[] => {
  const keeping = new Set(kept.map(({ linkedAs }) => linkedAs));
  const asked = new Set(config.marketplaces.map(({ name }) => name));
  return managed.filter(
    ({ name, linkedAs }) => !(keeping.has(linkedAs) || asked.has(name))
  );
};

/** What a plugin sync leaves in the sidecar. */
type PluginRecords = Pick<
  Sidecar,
  "marketplaces" | "hubOnlyMarketplaces" | "plugins" | "vendoredPlugins"
>;

/**
 * Links the marketplaces and installs the plugins, in that order — a plugin
 * whose marketplace is not linked has nowhere to come from. Both commands are
 * idempotent, but neither is free, so what the CLI already lists is left alone.
 */
const syncPlugins = async (
  config: FleetConfig,
  managed: Sidecar,
  report: FleetSyncReport
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: links every marketplace and installs every plugin the config wants, reporting each one's outcome
): Promise<PluginRecords> => {
  const wantedPlugins = config.plugins.filter((plugin) => plugin.enabled);
  // No list is no decision (the hub does not know yet whether this is its own
  // machine): the last one stands, for the marketplaces the fleet still has.
  const hubOnly = (
    config.hubOnlyMarketplaces ??
    managed.hubOnlyMarketplaces ??
    []
  ).filter((name) => config.marketplaces.some((one) => one.name === name));
  const bin = await claudeBin();
  if (!bin) {
    for (const { name } of config.marketplaces) {
      report.marketplaces[name] = {
        state: "failed",
        detail: "claude CLI not found",
      };
    }
    for (const { id } of wantedPlugins) {
      report.plugins[id] = { state: "failed", detail: "claude CLI not found" };
    }
    return {
      marketplaces: managed.marketplaces,
      hubOnlyMarketplaces: managed.hubOnlyMarketplaces,
      plugins: managed.plugins,
      vendoredPlugins: managed.vendoredPlugins,
    };
  }

  /**
   * The report stays keyed by cawco's name, because that is the row the
   * dashboard has; everything that acts on the machine uses the CLI's.
   */
  const marketplaces: ManagedMarketplace[] = [];
  // What this machine links: everything but a directory on the hub's machine,
  // whose path names nothing here. Its plugins come as bytes, and its row is
  // read off them once they are installed.
  const linkable = config.marketplaces.filter(
    ({ name }) => !hubOnly.includes(name)
  );

  for (const { name, source } of linkable) {
    // biome-ignore lint/performance/noAwaitInLoops: each `claude plugin marketplace add` mutates the CLI's shared known_marketplaces.json; concurrent runs would race
    const already = await linkedNameFor(name, source);
    if (already) {
      marketplaces.push({ name, linkedAs: already });
      report.marketplaces[name] = { state: "applied" };
      continue;
    }
    const ran = await runClaudeCloning(bin, [
      "plugin",
      "marketplace",
      "add",
      source,
    ]);
    const linkedAs = await linkedNameFor(name, source);
    if (!linkedAs) {
      // Nothing was linked, so there is nothing for a later sync to take away.
      report.marketplaces[name] = { state: "failed", detail: ran.output };
      continue;
    }
    marketplaces.push({ name, linkedAs });
    report.marketplaces[name] = { state: "applied" };
  }

  // A hub-only marketplace cawco once linked here is unlinked like a removed
  // one: the link pointed at whatever this machine had at that path, which is
  // not the hub's directory, and its plugins now come from the hub's bytes.
  for (const { name, linkedAs } of toUnlink(
    managed.marketplaces,
    marketplaces,
    { marketplaces: linkable }
  )) {
    // biome-ignore lint/performance/noAwaitInLoops: `claude plugin marketplace remove` mutates the CLI's shared known_marketplaces.json; concurrent runs would race
    const ran = await runClaude(bin, [
      "plugin",
      "marketplace",
      "remove",
      linkedAs,
    ]);
    report.marketplaces[name] = (await isLinked(linkedAs))
      ? { state: "failed", detail: ran.output }
      : { state: "removed" };
  }

  // Whatever the hub resolved for itself is installed from the bytes it sent;
  // only what it could NOT resolve is left for the CLI to go and fetch, which
  // is the path that needs this machine to reach github on its own account.
  const payloads = config.pluginPayloads ?? [];
  const vendored = await syncVendoredPlugins(
    bin,
    payloads,
    wantedPlugins,
    managed.vendoredPlugins ?? {},
    report.plugins
  );
  const carried = new Set(payloads.map(({ name }) => name));

  const linked = await linkedMarketplaces();
  for (const { id, error } of wantedPlugins) {
    if (carried.has(pluginNameOf(id))) {
      continue;
    }
    const marketplace = marketplaceOf(id);
    if (hubOnly.includes(marketplace)) {
      report.plugins[id] = {
        state: "failed",
        detail: hubOnlyMiss(marketplace, error),
      };
      continue;
    }
    // The CLI's own account, not this run's report: a plugin id names the
    // marketplace the CLI's way, which is not the key the report is under.
    if (!linked[marketplace]) {
      report.plugins[id] = {
        state: "failed",
        detail: `marketplace ${marketplace} is not linked`,
      };
      continue;
    }
    // biome-ignore lint/performance/noAwaitInLoops: `claude plugin install` mutates the CLI's shared installed_plugins.json; concurrent runs would race
    if (await isInstalled(id)) {
      report.plugins[id] = { state: "applied" };
      continue;
    }
    const ran = await runClaudeCloning(bin, [
      "plugin",
      "install",
      id,
      "--scope",
      "user",
    ]);
    report.plugins[id] = (await isInstalled(id))
      ? { state: "applied" }
      : { state: "failed", detail: ran.output };
  }

  const plugins = wantedPlugins.map(({ id }) => id);
  for (const id of managed.plugins) {
    if (plugins.includes(id)) {
      continue;
    }
    // A vendored plugin is uninstalled under the name it was installed with;
    // `syncVendoredPlugins` has already done that one.
    if (!carried.has(pluginNameOf(id))) {
      // biome-ignore lint/performance/noAwaitInLoops: `claude plugin uninstall` mutates the CLI's shared installed_plugins.json; concurrent runs would race
      await runClaude(bin, [
        "plugin",
        "uninstall",
        id,
        "--scope",
        "user",
        "-y",
      ]);
    }
    report.plugins[id] = { state: "removed" };
  }

  hubOnlyStates(hubOnly, report.plugins, report.marketplaces);

  return {
    marketplaces,
    hubOnlyMarketplaces: hubOnly,
    plugins,
    vendoredPlugins: vendored,
  };
};

/**
 * A path a skill's file may take under its own directory. The files come out of
 * a repo the hub downloaded, which is not something to trust with a write
 * anywhere else on this machine.
 */
const isSafeSkillPath = (path: string): boolean =>
  path !== "" && !isAbsolute(path) && !path.split("/").includes("..");

const dirExists = async (path: string): Promise<boolean> => {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
};

/**
 * One resolved file onto disk under `dir`, executable when its source was. The
 * callers remove the directory first, so every write is a fresh file and a bit
 * that flipped off in the source lands off here too.
 */
export const writeSkillFile = async (
  dir: string,
  file: SkillFile
): Promise<void> => {
  const path = join(dir, file.path);
  await Bun.write(path, Buffer.from(file.contentBase64, "base64"));
  if (file.executable) {
    await chmod(path, 0o755);
  }
};

/**
 * The skill's directory, as the hub resolved it. Written whole, because the
 * directory is cawco's own: a file the last version carried is not one this
 * version carries, and leaving it there is how a skill drifts.
 */
export const writeSkill = async (
  skill: FleetSkillPayload,
  root = SKILLS_DIR
): Promise<void> => {
  const dir = join(root, skill.name);
  const write = async () => {
    await rm(dir, { recursive: true, force: true });
    for (const file of skill.files ?? []) {
      // biome-ignore lint/performance/noAwaitInLoops: files land after this skill's directory removal
      await writeSkillFile(dir, file);
    }
  };
  // Workflow stubs since d15e919d are manual-only and absent from the model's
  // skill catalog. Hiding a pre-cutover visible stub is still a prompt change.
  const previous = Bun.file(join(dir, "SKILL.md"));
  const hiddenWorkflow =
    skill.workflowId &&
    (!(await previous.exists()) ||
      MANUAL_ONLY_SKILL.test(await previous.text()));
  if (hiddenWorkflow) {
    await write();
  } else {
    await promptWrite(`skill ${skill.name}`, write);
  }
};

/**
 * Writes the fleet's own marketplace from the bytes the hub resolved.
 *
 * The whole directory is rewritten rather than patched, because it has exactly
 * one author and the manifest has to agree with what is beside it. Every plugin
 * is vendored as a relative `source`, which is a form the CLI already installs
 * from — the official marketplace vendors its own the same way — so the install
 * that follows reaches the network for nothing.
 */
export const writeVendoredMarketplace = async (
  plugins: FleetPluginPayload[],
  // Named rather than assumed so a test can write somewhere that is not the
  // operator's own `~/.claude`, which this machine is running sessions out of.
  into: string = VENDOR_DIR
): Promise<void> => {
  await promptWrite("plugins marketplace files", async () => {
    // Per plugin, not the whole directory at once. The hub leaves out the bytes
    // of anything this machine already holds, so a rewrite of everything would
    // erase the plugins whose content it deliberately did not resend — and it
    // would rewrite megabytes to change one of them in any case.
    for (const plugin of plugins) {
      if (!plugin.files) {
        continue;
      }
      const dir = join(into, "plugins", plugin.name);
      // biome-ignore lint/performance/noAwaitInLoops: each plugin's directory is torn down before its own files are written; parallel plugins could interleave a rm with another plugin's write to a stale dir handle
      await rm(dir, { recursive: true, force: true });
      for (const file of plugin.files) {
        // The same refusal a skill's files get: a path out of the directory is a
        // file the fleet would write somewhere nobody asked it to.
        if (!isSafeSkillPath(file.path)) {
          throw new Error(`unsafe path ${file.path}`);
        }
        // biome-ignore lint/performance/noAwaitInLoops: must run after this plugin's own rm above completes
        await writeSkillFile(dir, file);
      }
    }

    // What the fleet no longer carries goes, whether or not its bytes arrived.
    const wanted = new Set(plugins.map(({ name }) => name));
    const present = await readdir(join(into, "plugins")).catch(
      () => [] as string[]
    );
    for (const name of present) {
      if (!wanted.has(name)) {
        // biome-ignore lint/performance/noAwaitInLoops: removals are independent, but this pass mirrors the write loop above rather than adding a second concurrency strategy for the same directory
        await rm(join(into, "plugins", name), { recursive: true, force: true });
      }
    }

    await Bun.write(
      join(into, ".claude-plugin", "marketplace.json"),
      `${JSON.stringify(
        {
          name: VENDOR_NAME,
          owner: { name: "cawco" },
          plugins: plugins.map((plugin) => ({
            name: plugin.name,
            source: `./plugins/${plugin.name}`,
            description: `Carried by the cawco fleet (${plugin.marketplace}).`,
          })),
        },
        null,
        2
      )}\n`
    );
  });
};

/**
 * Installs the vendored plugins, and answers with what each one came to.
 *
 * Keyed by the FLEET's id — `name@marketplace`, the id the hub's config used —
 * while the CLI installs `name@cawco`, because the marketplace it comes from
 * on this machine is the one written above. The dashboard's rows are the
 * fleet's, not this machine's private arrangement for satisfying them.
 */
const syncVendoredPlugins = async (
  bin: string,
  payloads: FleetPluginPayload[],
  wanted: readonly { id: string }[],
  managed: Record<string, string>,
  report: Record<string, FleetItemState>
): Promise<Record<string, string>> => {
  const written: Record<string, string> = {};
  const byName = new Map(payloads.map((plugin) => [plugin.name, plugin]));

  const changed =
    payloads.some((plugin) => managed[plugin.name] !== plugin.hash) ||
    Object.keys(managed).some((name) => !byName.has(name)) ||
    !(await dirExists(VENDOR_DIR));

  if (changed) {
    await writeVendoredMarketplace(payloads);
  }

  // Linked once, then refreshed in place: `add` on an already-linked path is an
  // error, and `update` is what re-reads a directory whose contents moved.
  const linked = await linkedMarketplaces();
  if (!linked[VENDOR_NAME]) {
    await runClaude(bin, ["plugin", "marketplace", "add", VENDOR_DIR]);
  } else if (changed) {
    await runClaude(bin, ["plugin", "marketplace", "update", VENDOR_NAME]);
  }

  for (const { id } of wanted) {
    const name = pluginNameOf(id);
    const plugin = byName.get(name);
    if (!plugin) {
      continue;
    }
    const vendoredId = `${name}@${VENDOR_NAME}`;

    const already =
      // biome-ignore lint/performance/noAwaitInLoops: the install this loop runs mutates the CLI's shared installed_plugins.json; concurrent plugins would race
      managed[name] === plugin.hash && (await isInstalled(vendoredId));
    const ran = already
      ? undefined
      : await runClaude(bin, [
          "plugin",
          "install",
          vendoredId,
          "--scope",
          "user",
        ]);

    if (!(already || (await isInstalled(vendoredId)))) {
      // Left unmanaged so the next sync writes and installs it again.
      report[id] = {
        state: "failed",
        detail: ran?.output ?? "install did not land",
      };
      continue;
    }

    // The copy this one replaces. A machine that installed the plugin the old
    // way — from its upstream marketplace — is still carrying it, and leaving
    // both would load the same skills and subagents twice. Checked on every
    // sync rather than only on the install, because the machine that most needs
    // it is the one already holding both: it takes the fast path from here on,
    // and a hand-over that only ran once would never reach it.
    if (id !== vendoredId && (await isInstalled(id))) {
      await runClaude(bin, [
        "plugin",
        "uninstall",
        id,
        "--scope",
        "user",
        "-y",
      ]);
    }
    written[name] = plugin.hash;
    report[id] = { state: "applied" };
  }

  for (const name of Object.keys(managed)) {
    if (byName.has(name)) {
      continue;
    }
    // biome-ignore lint/performance/noAwaitInLoops: `claude plugin uninstall` mutates the CLI's shared installed_plugins.json; concurrent runs would race
    await runClaude(bin, [
      "plugin",
      "uninstall",
      `${name}@${VENDOR_NAME}`,
      "--scope",
      "user",
      "-y",
    ]);
  }
  return written;
};

/**
 * Writes the skills whose files this machine does not have yet, and takes away
 * the ones the fleet no longer carries. No CLI is run and no settings are
 * touched: a plain skill is files, and the hash is the whole economy — an
 * unchanged skill costs one comparison however many megabytes it arrived with.
 */
const syncSkillFiles = async (
  desired: FleetSkillPayload[],
  managed: Sidecar["skills"],
  report: Record<string, FleetItemState>
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: converge each skill while preserving ownership and reporting write and removal errors individually.
): Promise<Sidecar["skills"]> => {
  const written: Sidecar["skills"] = {};
  for (const skill of desired) {
    try {
      // biome-ignore lint/performance/noAwaitInLoops: ownership is checked before this skill is written or claimed.
      const collision = await workflowSkillCollision(SKILLS_DIR, skill);
      if (collision) {
        report[skill.name] = { state: "failed", detail: collision };
        continue;
      }
    } catch (error) {
      report[skill.name] = { state: "failed", detail: said(error) };
      continue;
    }
    if (
      managed[skill.name] === skill.hash &&
      (!skill.workflowId ||
        (await Bun.file(join(SKILLS_DIR, skill.name, "SKILL.md")).exists()))
    ) {
      written[skill.name] = skill.hash;
      report[skill.name] = { state: "applied" };
      continue;
    }

    // The hub leaves out the bytes of anything this machine's last report said
    // it already held. Reaching here means it did not hold this hash after all —
    // a sidecar that was cleared, or a report that never landed. Nothing is
    // written, and the next sync carries the content, because the claim that
    // suppressed it is exactly what this failure retracts.
    if (!skill.files) {
      if (managed[skill.name] !== undefined) {
        written[skill.name] = skill.workflowId ? "" : managed[skill.name];
      }
      report[skill.name] = {
        state: "failed",
        detail: "the hub sent no files for this hash",
      };
      continue;
    }

    const unsafe = skill.files.find(({ path }) => !isSafeSkillPath(path));
    if (unsafe) {
      // Nothing is written, so the machine keeps whatever it already had.
      if (managed[skill.name] !== undefined) {
        written[skill.name] = managed[skill.name];
      }
      report[skill.name] = {
        state: "failed",
        detail: `unsafe path ${unsafe.path}`,
      };
      continue;
    }

    try {
      await writeSkill(skill);
      written[skill.name] = skill.hash;
      report[skill.name] = { state: "applied" };
    } catch (error) {
      // A write that got part of the way through still left cawco's files
      // behind, so the name stays managed — under a hash nothing matches, which
      // is what has the next sync write it again.
      written[skill.name] = "";
      report[skill.name] = { state: "failed", detail: tail(said(error)) };
    }
  }

  const wanted = new Set(desired.map(({ name }) => name));
  for (const name of Object.keys(managed)) {
    if (wanted.has(name)) {
      continue;
    }
    try {
      // biome-ignore lint/performance/noAwaitInLoops: record each removal before advancing to the next managed skill.
      await guardWorkflowSkillRemoval(SKILLS_DIR, name);
      const dir = join(SKILLS_DIR, name);
      const manualOnly =
        (await Bun.file(join(dir, ".cawco-workflow")).exists()) &&
        MANUAL_ONLY_SKILL.test(await Bun.file(join(dir, "SKILL.md")).text());
      if (manualOnly) {
        await rm(dir, { recursive: true, force: true });
      } else {
        await promptWrite(`skill ${name} removed`, () =>
          rm(dir, { recursive: true, force: true })
        );
      }
      report[name] = { state: "removed" };
    } catch (error) {
      written[name] = managed[name];
      report[name] = { state: "failed", detail: said(error) };
    }
  }
  return written;
};

/** The same hash the hub took of the same document: sha256 of its UTF-8 bytes. */
const hashText = (content: string): string =>
  new Bun.CryptoHasher("sha256").update(content).digest("hex");

/** What is really at a memory file; null is a machine that has none. */
const fileHashAt = async (path: string): Promise<string | null> => {
  const file = Bun.file(path);
  return (await file.exists()) ? hashText(await file.text()) : null;
};

/** What is really at `~/.claude/CLAUDE.md`; null is a machine that has none. */
const memoryFileHash = (): Promise<string | null> => fileHashAt(MEMORY_PATH);

export type MemoryPlan =
  | "write"
  | "skip"
  | "drift"
  | "remove"
  | "unmanage"
  | "none";

/**
 * What to do about the user CLAUDE.md, from hashes alone. Drift is a machine
 * edit cawco did not make: managed hash exists, the file no longer matches
 * it — never overwritten without `force`, reported instead.
 */
export function memoryPlan(
  desired: { hash: string; force?: boolean } | null | undefined,
  fileHash: string | null,
  managedHash: string | undefined
): MemoryPlan {
  if (!desired) {
    if (managedHash === undefined) {
      return "none";
    }
    return fileHash === managedHash ? "remove" : "unmanage";
  }
  // A file cawco has never written is somebody's own: it is taken over only
  // when it already says the same thing, or when the reader said to.
  if (managedHash === undefined) {
    return fileHash === null || fileHash === desired.hash || desired.force
      ? "write"
      : "drift";
  }
  // A file that already says what the fleet now says is settled, not drifted:
  // that is how an adoption lands back on the machine it was adopted from.
  if (fileHash !== managedHash) {
    return desired.force || fileHash === desired.hash ? "write" : "drift";
  }
  return desired.hash === managedHash ? "skip" : "write";
}

/** What a drifted machine reports, and what the dashboard offers to settle. */
const DRIFTED = "edited on this machine — adopt it or overwrite";

/**
 * Applies the plan and answers with the hash cawco now manages, or nothing
 * when it manages none. The file is only ever deleted when it is still exactly
 * what cawco wrote — an edited one outlives the fleet's row, unmanaged.
 */
const syncMemory = async (
  desired: FleetMemory | null | undefined,
  managed: string | undefined,
  report: FleetSyncReport
): Promise<string | undefined> => {
  const plan = memoryPlan(desired, await memoryFileHash(), managed);

  if (!desired) {
    if (plan === "remove") {
      await promptWrite("user CLAUDE.md removed", () =>
        rm(MEMORY_PATH, { force: true })
      );
      report.memory = { state: "removed" };
    } else if (plan === "unmanage") {
      report.memory = {
        state: "removed",
        detail: "kept: edited on this machine",
      };
    }
    return undefined;
  }

  if (plan === "drift") {
    report.memory = { state: "failed", detail: DRIFTED };
    return managed;
  }
  if (plan === "skip") {
    report.memory = { state: "applied" };
    return managed;
  }

  try {
    await writeAtomic(MEMORY_PATH, desired.content, "user CLAUDE.md");
    report.memory = { state: "applied" };
    return desired.hash;
  } catch (error) {
    // The machine keeps the hash it had, so the next sync writes again rather
    // than believing this one landed.
    report.memory = { state: "failed", detail: tail(said(error)) };
    return managed;
  }
};

/**
 * Every document really under `~/.claude/memories/`, by the path the set keys
 * it under. Markdown only, and depth is whatever the set uses — `models/` is
 * the one this version writes, and a reader should still see the rest.
 */
const memoryDocPaths = async (
  root: string = MEMORIES_DIR,
  prefix = ""
): Promise<string[]> => {
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  // Sibling directories are independent reads, and the result is sorted below
  // regardless of what order they land in.
  const nested = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map((entry) =>
        memoryDocPaths(join(root, entry.name), `${prefix}${entry.name}/`)
      )
  );
  const paths = [
    ...nested.flat(),
    ...entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
      .map((entry) => `${prefix}${entry.name}`),
  ];
  return paths.sort();
};

/**
 * The directories a removal emptied, taken away bottom-up. `rmdir` refuses a
 * directory with anything in it, which is exactly the check wanted: a folder
 * still holding a document of somebody's own stays where it is.
 */
const pruneEmptyDirs = async (): Promise<void> => {
  const dirs = new Set<string>();
  const walk = async (root: string, prefix: string): Promise<void> => {
    const entries = await readdir(root, { withFileTypes: true }).catch(
      () => []
    );
    // Sibling directories are independent reads; `dirs` is an unordered set.
    await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map(async (entry) => {
          dirs.add(`${prefix}${entry.name}`);
          await walk(join(root, entry.name), `${prefix}${entry.name}/`);
        })
    );
  };
  await walk(MEMORIES_DIR, "");

  // Deepest first, so a parent is only tried once its children are gone —
  // sequential on purpose: rmdir-ing a child before its now-empty parent is
  // attempted is the ordering this loop exists to guarantee.
  for (const relative of [...dirs].sort(
    (a, b) => b.split("/").length - a.split("/").length
  )) {
    // biome-ignore lint/performance/noAwaitInLoops: deepest-first order matters — a parent must not be tried until its children are gone
    // biome-ignore lint/suspicious/noEmptyBlockStatements: best effort — a directory that still holds something of the user's, or is already gone, is left alone
    await rmdir(join(MEMORIES_DIR, relative)).catch(() => {});
  }
  // biome-ignore lint/suspicious/noEmptyBlockStatements: best effort — the root may still hold something of the user's, or be already gone
  await rmdir(MEMORIES_DIR).catch(() => {});
};

/**
 * What to do about every document of the set, from hashes alone: one
 * {@link memoryPlan} per path the fleet carries, and one per path only the
 * sidecar still names — which is a document the fleet has stopped carrying.
 *
 * Pure, and separate from the writing for the same reason `memoryPlan` is: this
 * is where "cawco overwrote what I wrote" is caught, and a decision that only
 * exists inside a filesystem walk is a decision nothing can ask about.
 *
 * A hub that predates the set sends no documents at all, which arrives here as
 * an empty `desired` — every managed document is then given back, exactly as
 * the fleet keeping no memory gives back the main file.
 */
export function memorySetPlan(
  desired: readonly { path: string; hash: string; force?: boolean }[],
  onDisk: Readonly<Record<string, string | null>>,
  managed: Readonly<Record<string, string>>
): Record<string, MemoryPlan> {
  const plans: Record<string, MemoryPlan> = {};
  for (const doc of desired) {
    plans[doc.path] = memoryPlan(
      doc,
      onDisk[doc.path] ?? null,
      managed[doc.path]
    );
  }
  for (const [path, hash] of Object.entries(managed)) {
    if (plans[path] !== undefined) {
      continue;
    }
    plans[path] = memoryPlan(undefined, onDisk[path] ?? null, hash);
  }
  return plans;
}

/**
 * The linked documents, {@link memorySetPlan} applied. Every rule the single
 * document has, held per file: one edited on this machine is reported and left
 * alone, the rest of the set converges around it, and a document the fleet
 * stops carrying is only deleted while it is still exactly what cawco wrote.
 */
const syncMemoryDocs = async (
  desired: FleetMemoryDoc[],
  managed: Record<string, string>,
  report: Record<string, FleetItemState>
): Promise<Record<string, string>> => {
  const written: Record<string, string> = {};

  // The hub refuses these at the door; a set that reached here with one anyway
  // is not something to trust with a write, so it is turned away here too.
  const safe: FleetMemoryDoc[] = [];
  for (const doc of desired) {
    const problem = memoryDocProblem(doc.path);
    if (!problem) {
      safe.push(doc);
      continue;
    }
    // Nothing is written, so the machine keeps whatever it already had.
    if (managed[doc.path] !== undefined) {
      written[doc.path] = managed[doc.path];
    }
    report[doc.path] = { state: "failed", detail: problem };
  }

  const onDisk: Record<string, string | null> = {};
  // Each path's hash is an independent read; nothing here shares state or
  // depends on another path's result.
  await Promise.all(
    [...new Set([...safe.map((doc) => doc.path), ...Object.keys(managed)])].map(
      async (path) => {
        onDisk[path] = await fileHashAt(join(MEMORIES_DIR, path));
      }
    )
  );

  const plans = memorySetPlan(safe, onDisk, managed);
  const wanted = new Map(safe.map((doc) => [doc.path, doc]));
  let removed = false;

  for (const [path, plan] of Object.entries(plans)) {
    const doc = wanted.get(path);
    if (!doc) {
      if (plan === "remove") {
        // biome-ignore lint/performance/noAwaitInLoops: `removed` gates a single pruneEmptyDirs() after the loop; concurrent removes would still need that to run after every one lands, which sequential awaiting already guarantees
        await promptWrite(`memory doc ${path} removed`, () =>
          rm(join(MEMORIES_DIR, path), { force: true })
        );
        report[path] = { state: "removed" };
        removed = true;
      } else {
        // An edited one outlives the fleet's row, unmanaged and where it is.
        report[path] = {
          state: "removed",
          detail: "kept: edited on this machine",
        };
      }
      continue;
    }

    if (plan === "drift") {
      report[path] = { state: "failed", detail: DRIFTED };
      if (managed[path] !== undefined) {
        written[path] = managed[path];
      }
      continue;
    }
    if (plan === "skip") {
      written[path] = managed[path];
      report[path] = { state: "applied" };
      continue;
    }

    try {
      await writeAtomic(
        join(MEMORIES_DIR, path),
        doc.content,
        `memory doc ${path}`
      );
      written[path] = doc.hash;
      report[path] = { state: "applied" };
    } catch (error) {
      // The machine keeps the hash it had, so the next sync writes again rather
      // than believing this one landed.
      if (managed[path] !== undefined) {
        written[path] = managed[path];
      }
      report[path] = { state: "failed", detail: tail(said(error)) };
    }
  }
  if (removed) {
    await pruneEmptyDirs();
  }

  return written;
};

/**
 * The SessionStart hook, verbatim. Claude Code's SessionStart input carries no
 * model (measured on 2.1.280 and 2.1.284: only session_id, transcript_path,
 * cwd, hook_event_name and source), and CLAUDE.md itself is loaded flat. The
 * Claude harness therefore passes the session's model to the hook as the
 * `CAWCO_MODEL` environment variable, and the script prints the document
 * whose name is the longest prefix of that id — the whole of how a document
 * reaches only the sessions it is for.
 *
 * POSIX sh and nothing else: it runs on every machine the fleet has, including
 * the ones where the daemon's own Bun is the only Bun there is.
 */
export const MEMORY_HOOK = `#!/bin/sh
# Written by cawco. Edits are overwritten — the fleet's documents are in
# ~/.claude/memories/, and this only decides which one a session is shown.
set -u

dir="\${HOME}/.claude/memories/models"
[ -d "$dir" ] || exit 0

# Claude Code's SessionStart input carries no model, so the harness that
# started this session names it in CAWCO_MODEL. A session started
# without one is shown nothing.
cat >/dev/null
model="\${CAWCO_MODEL:-}"
[ -n "$model" ] || exit 0

# Longest prefix wins, so \`claude-opus-5-20260315\` takes claude-opus-5.md over
# a claude.md beside it, and an id nothing is named for takes nothing.
best=''
for file in "$dir"/*.md; do
  [ -f "$file" ] || continue
  name=\${file##*/}
  name=\${name%.md}
  case "$model" in
    "$name"*)
      if [ \${#name} -gt \${#best} ]; then best=$name; fi
      ;;
  esac
done

[ -n "$best" ] || exit 0

# Stdout from a SessionStart hook is added to the session's context.
cat "$dir/$best.md"
exit 0
`;

/** One entry of a hook, as `~/.claude/settings.json` writes them — a command
 * handler carries `command`; the other four handler types do not, so an entry
 * without one is matched on its own JSON instead (see {@link withoutHooks}). */
interface HookCommand {
  command?: string;
  type?: string;
}

/** One matcher's worth of hooks; an absent `matcher` is every session start. */
interface HookMatcher {
  hooks?: HookCommand[];
  matcher?: string;
}

/**
 * The same list without cawco's own entries. A matcher entry that held
 * anything else comes back holding it, and one that is left with nothing goes —
 * but only when it was ours that emptied it. `commands` names what cawco
 * registered last time, not what it would register today, so a hook that was
 * renamed, moved to a different script path, or changed handler type entirely
 * is still found and taken out — a set keyed off today's constants would leave
 * the old one behind forever.
 */
export function withoutHooks(
  entries: HookMatcher[],
  commands: string[]
): HookMatcher[] {
  const gone = new Set(commands);
  const isOurs = (hook: HookCommand): boolean =>
    gone.has(hook.command === undefined ? JSON.stringify(hook) : hook.command);
  return entries.flatMap((entry) => {
    const hooks = entry.hooks ?? [];
    const kept = hooks.filter((hook) => !isOurs(hook));
    if (kept.length === hooks.length) {
      return [entry];
    }
    return kept.length > 0 ? [{ ...entry, hooks: kept }] : [];
  });
}

/**
 * Registers the hook while the set carries a `models/` document, and takes it
 * back out when it stops. `~/.claude/settings.json` is the user's own file, so
 * only the one command the sidecar names is ever removed and the file is only
 * written when this actually changes something.
 */
const syncMemoryHook = async (
  desired: FleetMemoryDoc[],
  managed: string | undefined,
  report: FleetSyncReport
): Promise<string | undefined> => {
  const wanted = desired.some(
    (doc) =>
      doc.path.startsWith("models/") && memoryDocProblem(doc.path) === undefined
  );
  if (!wanted && managed === undefined) {
    return undefined;
  }

  const stored = await readJson<Record<string, unknown>>(SETTINGS_PATH);
  // Nothing is written over a file that cannot be read: the rest of it is the
  // user's permissions and plugins, and a rewrite would take them with it.
  if (stored === undefined && (await Bun.file(SETTINGS_PATH).exists())) {
    report.memoryHook = {
      state: "failed",
      detail: "could not parse ~/.claude/settings.json",
    };
    return managed;
  }

  const root = stored ?? {};
  const hooks = {
    ...((root.hooks as Record<string, unknown> | undefined) ?? {}),
  };
  const starts = (hooks.SessionStart as HookMatcher[] | undefined) ?? [];
  const command = MEMORY_HOOK_PATH;
  const next = wanted
    ? [
        ...withoutHooks(starts, [command]),
        { hooks: [{ type: "command", command }] },
      ]
    : withoutHooks(starts, [managed ?? command]);

  if (next.length > 0) {
    hooks.SessionStart = next;
  } else {
    // biome-ignore lint/performance/noDelete: an undefined-valued key would still count in the Object.keys(hooks) check just below
    delete hooks.SessionStart;
  }
  const settings = { ...root };
  if (Object.keys(hooks).length > 0) {
    settings.hooks = hooks;
  } else {
    settings.hooks = undefined;
  }

  try {
    if (
      wanted &&
      (await Bun.file(MEMORY_HOOK_PATH)
        .text()
        .catch(() => "")) !== MEMORY_HOOK
    ) {
      await writeAtomic(MEMORY_HOOK_PATH, MEMORY_HOOK, "model memory hook");
      // Claude Code spawns the command itself, so it has to be executable.
      await chmod(MEMORY_HOOK_PATH, 0o755);
    }
    if (JSON.stringify(settings) !== JSON.stringify(root)) {
      await writeJson(
        SETTINGS_PATH,
        settings,
        "model memory hook registration"
      );
    }
    if (!wanted) {
      await promptWrite("model memory hook removed", () =>
        rm(MEMORY_HOOK_PATH, { force: true })
      );
    }
  } catch (error) {
    report.memoryHook = { state: "failed", detail: tail(said(error)) };
    return managed;
  }

  report.memoryHook = wanted ? { state: "applied" } : { state: "removed" };
  return wanted ? command : undefined;
};

/** Where a hook's own script lands: `~/.claude/cawco-hooks/<id>.sh`. */
const hookScriptPath = (id: string): string => join(HOOKS_DIR, `${id}.sh`);

/** How long one `bash -n` gets. Our choice: a parse of a hook script is
 * milliseconds, and one that hangs is not a script worth registering. */
const PARSE_TIMEOUT_MS = 5000;

const WHITESPACE = /\s+/;

/**
 * The shell a script's shebang runs it with, when that shell is one `-n` can
 * check. No shebang is `sh`: Claude Code spawns the command through a shell,
 * and a file with no `#!` that the kernel refuses (ENOEXEC) is run by that
 * shell as an `sh` script. Any other interpreter is not checked.
 */
const shellOf = (script: string): "bash" | "sh" | undefined => {
  const first = script.split("\n", 1)[0] ?? "";
  if (!first.startsWith("#!")) {
    return "sh";
  }
  const words = first.slice(2).trim().split(WHITESPACE);
  const program =
    basename(words[0] ?? "") === "env"
      ? words.slice(1).find((word) => !word.startsWith("-"))
      : words[0];
  const name = basename(program ?? "");
  return name === "bash" || name === "sh" ? name : undefined;
};

/**
 * The parser's error line when a shell script does not parse, undefined when
 * it does or is not a shell script. A hook runs before every matching tool
 * call on the machine, so one that cannot parse locks every session out; it is
 * never registered.
 */
const scriptParseError = async (
  script: string
): Promise<string | undefined> => {
  const shell = shellOf(script);
  if (!shell) {
    return undefined;
  }
  const child = Bun.spawn([shell, "-n"], {
    env: toolEnv(),
    stdin: new TextEncoder().encode(script),
    stdout: "ignore",
    stderr: "pipe",
    timeout: PARSE_TIMEOUT_MS,
  });
  const stderr = await new Response(child.stderr).text();
  const code = await child.exited;
  if (child.signalCode) {
    return `${shell} -n timed out after ${PARSE_TIMEOUT_MS / 1000}s`;
  }
  if (code === 0) {
    return undefined;
  }
  return (
    stderr
      .split("\n")
      .find((line) => line.trim() !== "")
      ?.trim() ?? `${shell} -n exited ${code}`
  );
};

/** `~/.claude/settings.json` for a fleet-wide hook, `<cwd>/.claude/settings.json`
 * for one bound to a project — the same file a project MCP server's counterpart
 * would use if MCP had one, and the only settings file a session in that
 * checkout actually reads for its hooks. */
const settingsPathFor = (hook: Pick<FleetHook, "scope" | "cwd">): string =>
  hook.scope && hook.scope !== "user" && hook.cwd
    ? join(hook.cwd, ".claude", "settings.json")
    : SETTINGS_PATH;

/**
 * The handler as it goes into `settings.json`. A command handler carrying a
 * script is pointed at the path cawco wrote it to on *this* machine — the
 * fleet row itself never names a path, because a path is machine-local and the
 * row has to mean the same thing on every box it reaches. Every other handler,
 * and a command handler with no script, is written exactly as the hub sent it.
 */
const handlerFor = (
  hook: FleetHook,
  scriptPath: string | undefined
): HookHandler =>
  hook.handler.type === "command" && scriptPath
    ? { ...hook.handler, command: scriptPath }
    : hook.handler;

/** What {@link withoutHooks} removes this handler by, and what the sidecar
 * remembers registering it as. */
const identityOf = (handler: HookHandler): string =>
  handler.type === "command" && handler.command
    ? handler.command
    : JSON.stringify(handler);

/**
 * Writes every enabled hook's script and registers it in the settings.json its
 * scope points at, and takes back out whatever a disabled or deleted hook, or
 * one that no longer passes validation, used to have registered. The one row
 * here that is executable: a hook that reaches this function runs on a shell,
 * unprompted, on every machine that gets it, which is why it is checked again
 * below rather than trusted on the wire — the hub already refused an invalid
 * one at the door, but that is the hub's process, not this one's guarantee.
 */
const syncHooks = async (
  desired: FleetHook[],
  managed: Record<string, ManagedHook>,
  report: Record<string, FleetItemState>
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: writes every enabled hook's script and registers it per settings.json scope, then removes what a disabled/deleted/invalid hook used to have
): Promise<Record<string, ManagedHook>> => {
  const written: Record<string, ManagedHook> = {};
  const keep = (id: string): void => {
    if (managed[id]) {
      written[id] = managed[id];
    }
  };

  // A disabled hook is simply not written — that is the whole of per-hook
  // disable, since Claude Code has no way to turn off one hook and keep the
  // rest of its matcher entry. It falls straight through to the removal pass
  // at the bottom, same as a hook the fleet has stopped carrying at all.
  const wanted: FleetHook[] = [];
  for (const hook of desired) {
    if (!hook.enabled) {
      continue;
    }
    const problems = Object.values(hookProblem(hook));
    if (problems.length > 0) {
      keep(hook.id);
      report[hook.id] = { state: "failed", detail: problems[0] };
      continue;
    }
    if (hook.scope && hook.scope !== "user" && !hook.cwd) {
      keep(hook.id);
      report[hook.id] = {
        state: "failed",
        detail: "bound to a project this machine has no checkout for",
      };
      continue;
    }
    wanted.push(hook);
  }

  // One script write per hook that carries one, drift left alone unless
  // `force` — a hand-edited script stays registered exactly where it is, just
  // never overwritten out from under whoever edited it.
  const scriptPaths = new Map<string, string>();
  const hashes = new Map<string, string>();
  const settled: FleetHook[] = [];
  for (const hook of wanted) {
    if (hook.handler.type !== "command" || !hook.script) {
      settled.push(hook);
      continue;
    }
    const path = hookScriptPath(hook.id);
    // The hub's `hook.hash` covers the event, matcher and handler too, so it
    // never equals a hash of the file alone; drift is read off the script's
    // own bytes, the same thing {@link fleetStatus} hashes on disk.
    const scriptHash = hashText(hook.script);
    const plan = memoryPlan(
      { hash: scriptHash, force: hook.force },
      // biome-ignore lint/performance/noAwaitInLoops: the write two branches below depends on this hook's own drift check; scripts are written one hook at a time
      await fileHashAt(path),
      managed[hook.id]?.hash
    );
    // What would run once registered: the machine's own edit when it drifted,
    // the fleet's script otherwise. One that does not parse is neither written
    // nor registered, and whatever this file registered for it before comes
    // out below; the file on disk stays, so a drifted copy can still be
    // compared and adopted.
    const parseError = await scriptParseError(
      plan === "drift" ? await Bun.file(path).text() : hook.script
    );
    if (parseError) {
      keep(hook.id);
      report[hook.id] = { state: "failed", detail: parseError };
      continue;
    }
    if (plan === "drift") {
      report[hook.id] = { state: "failed", detail: DRIFTED };
      hashes.set(hook.id, managed[hook.id]?.hash ?? scriptHash);
      scriptPaths.set(hook.id, path);
      settled.push(hook);
      continue;
    }
    hashes.set(hook.id, scriptHash);
    if (plan === "write") {
      try {
        await writeAtomic(path, hook.script, `hook ${hook.name}`);
        // Claude Code spawns it directly, so it has to carry its own execute bit.
        await chmod(path, 0o755);
      } catch (error) {
        keep(hook.id);
        report[hook.id] = { state: "failed", detail: tail(said(error)) };
        continue;
      }
    }
    scriptPaths.set(hook.id, path);
    settled.push(hook);
  }

  // Registration, one settings.json per place a hook is bound to — including a
  // file nothing here still wants, so a hook whose row was disabled or deleted
  // still gets its old entry taken out of the file it used to be in.
  const bySettings = new Map<string, FleetHook[]>();
  for (const hook of settled) {
    const path = settingsPathFor(hook);
    bySettings.set(path, [...(bySettings.get(path) ?? []), hook]);
  }
  for (const record of Object.values(managed)) {
    const path = settingsPathFor(record);
    if (!bySettings.has(path)) {
      bySettings.set(path, []);
    }
  }

  for (const [path, hooks] of bySettings) {
    // biome-ignore lint/performance/noAwaitInLoops: each iteration is a read-modify-write of its own settings.json; kept one file at a time like the rest of this sync rather than fanning writes out across every settings.json on the machine at once
    const stored = await readJson<Record<string, unknown>>(path);
    // Nothing is written over a file that cannot be read: the rest of it is the
    // user's own permissions and plugins, and a rewrite from an empty root
    // would take them with it.
    if (stored === undefined && (await Bun.file(path).exists())) {
      const detail = `could not parse ${path}`;
      for (const hook of hooks) {
        keep(hook.id);
        report[hook.id] = { state: "failed", detail };
      }
      continue;
    }

    const root = stored ?? {};
    const settingsHooks = {
      ...((root.hooks as Record<string, unknown> | undefined) ?? {}),
    };

    // Everything cawco registered out of this file last time, whatever event
    // it ran on — a hook that moved to a different event still needs its old
    // row gone, not just left orphaned under the event it used to fire on.
    const registeredHere = Object.values(managed)
      .filter((record) => settingsPathFor(record) === path)
      .map((record) => record.command);

    const byEvent = new Map<HookEvent, FleetHook[]>();
    for (const hook of hooks) {
      byEvent.set(hook.event, [...(byEvent.get(hook.event) ?? []), hook]);
    }

    const events = new Set<HookEvent>([
      ...byEvent.keys(),
      ...(Object.keys(settingsHooks) as HookEvent[]),
    ]);
    for (const event of events) {
      const current = (settingsHooks[event] as HookMatcher[] | undefined) ?? [];
      const additions = (byEvent.get(event) ?? []).map((hook): HookMatcher => {
        const handler = handlerFor(hook, scriptPaths.get(hook.id));
        written[hook.id] = {
          hash: hashes.get(hook.id) ?? hook.hash,
          command: identityOf(handler),
          event: hook.event,
          scope: hook.scope ?? "user",
          ...(hook.cwd ? { cwd: hook.cwd } : {}),
        };
        return hook.matcher
          ? { matcher: hook.matcher, hooks: [handler] }
          : { hooks: [handler] };
      });
      const next = [...withoutHooks(current, registeredHere), ...additions];
      if (next.length > 0) {
        settingsHooks[event] = next;
      } else {
        delete settingsHooks[event];
      }
    }

    const settings = { ...root };
    if (Object.keys(settingsHooks).length > 0) {
      settings.hooks = settingsHooks;
    } else {
      settings.hooks = undefined;
    }

    if (JSON.stringify(settings) !== JSON.stringify(root)) {
      try {
        await writeJson(path, settings, "hooks registration");
      } catch (error) {
        const detail = tail(said(error));
        for (const hook of hooks) {
          keep(hook.id);
          report[hook.id] = { state: "failed", detail };
        }
        continue;
      }
    }

    if (path !== SETTINGS_PATH && hooks.length > 0) {
      await excludeFromCheckout(path);
    }

    for (const hook of hooks) {
      if (report[hook.id]) {
        continue; // already reported failed/drift above
      }
      report[hook.id] = { state: "applied" };
    }
  }

  // A hook that is disabled, deleted, or failed validation this round and had
  // nothing kept alive for it above is one whose registration and script (if
  // cawco wrote one) are cawco's to take away.
  const stillHere = new Set(settled.map((hook) => hook.id));
  for (const [id, record] of Object.entries(managed)) {
    if (stillHere.has(id) || written[id]) {
      continue;
    }
    if (record.command.startsWith(HOOKS_DIR)) {
      // biome-ignore lint/performance/noAwaitInLoops: removals are independent, but this mirrors the sequential style of the rest of this sync rather than fanning out filesystem writes
      await promptWrite(`hook ${id} removed`, () =>
        rm(record.command, { force: true })
      );
    }
    report[id] = { state: "removed" };
  }

  return written;
};

/** What to write into the sidecar's `deniedTools`: the hub's value if it sent one, else what was cached. */
const deniedToolsForSidecar = (
  fromHub: string[] | undefined,
  fromCache: string[] | undefined
): { deniedTools: string[] } | Record<string, never> => {
  const list = fromHub ?? fromCache;
  return list ? { deniedTools: list } : {};
};

const converge = async (config: FleetConfig): Promise<FleetSyncReport> => {
  const managed = await readSidecar();
  const skillStates: Record<string, FleetItemState> = {};
  const docStates: Record<string, FleetItemState> = {};
  const hookStates: Record<string, FleetItemState> = {};
  const report: FleetSyncReport = {
    mcp: {},
    marketplaces: {},
    plugins: {},
    skills: skillStates,
    memoryDocs: docStates,
    hooks: hookStates,
    at: Date.now(),
  };

  const mcp = await syncMcp(config.mcp, managed.mcp, report.mcp);
  const installed = await syncPlugins(config, managed, report);
  const skills = await syncSkillFiles(
    config.skills ?? [],
    managed.skills,
    skillStates
  );
  const memory = await syncMemory(config.memory, managed.memory, report);
  // A hub that predates the set sends no `docs`, which reads as a fleet that
  // links none — and the machine gives back the ones cawco wrote it.
  const docs = config.memory?.docs ?? [];
  const memoryDocs = await syncMemoryDocs(docs, managed.memoryDocs, docStates);
  const memoryHook = await syncMemoryHook(docs, managed.memoryHook, report);
  // A hub that predates hooks sends no `hooks`, which reads the same way: a
  // fleet that keeps none, and the machine gives back whatever cawco
  // registered before this daemon knew what that field meant.
  const hooks = await syncHooks(config.hooks ?? [], managed.hooks, hookStates);
  // What the machine's own `claude` was denied for the fleet before this sync.
  const deniedBefore = machineDenyList(await resolvedFleetDenials());
  await writeJson(SIDECAR, {
    mcp,
    ...installed,
    skills,
    // A hub that sends `deniedTools` has the column; one that does not predates
    // the migration, and the sidecar keeps whatever it already had (or nothing,
    // which is what has resolvedFleetDenials fall back to compiled constants).
    ...deniedToolsForSidecar(config.deniedTools, managed.deniedTools),
    // A hub that predates the flag sends none: the choice is off.
    ...(config.cawcoTodos ? { cawcoTodos: true } : {}),
    ...(memory ? { memory } : {}),
    memoryDocs,
    ...(memoryHook ? { memoryHook } : {}),
    hooks,
  } satisfies Sidecar);
  // The machine's own `claude` follows the fleet at once, not at the next
  // daemon start: what the fleet no longer denies comes out of
  // `permissions.deny`, what it now denies goes in.
  const settings = await convergeDeniedTools(deniedBefore);
  if (settings.state === "failed") {
    console.warn(`[fleet] ~/.claude/settings.json: ${settings.detail}`);
  }
  // Every account's Claude Code reads its user layer from its own dir: the
  // entries `~/.claude` gained this sync are linked in there too.
  await Promise.all(
    accountIds().map((account) =>
      linkUserLayer(account).catch((error: unknown) =>
        console.warn(`[fleet] account ${account}: ${said(error)}`)
      )
    )
  );

  // What this machine now holds, so the next config can leave those bytes out.
  // Read from what was just written rather than from the desired set: a row
  // that failed is a row this machine does NOT have, and claiming it would
  // suppress the very content the next sync needs to send.
  const toolchain = await machineToolchain(true);
  return {
    ...report,
    have: { skills, plugins: installed.vendoredPlugins ?? {} },
    ...(toolchain.claude ? { toolchain } : {}),
    at: Date.now(),
  };
};

/**
 * One sync at a time on a machine: two of them would race over `~/.claude.json`
 * and run the same `claude plugin install` twice. A second call waits for the
 * one in flight rather than being refused — the hub sends one on register and
 * one on every change, and those arrive together often enough.
 */
let queue: Promise<unknown> = Promise.resolve();

/**
 * Applies the fleet's desired state to this machine and answers with what every
 * entry in it came to. Idempotent: a second sync with the same config writes the
 * same file and runs no CLI at all.
 */
export const syncFleetConfig = (
  config: FleetConfig
): Promise<FleetSyncReport> => {
  const next = queue.then(
    () => converge(config),
    () => converge(config)
  );
  // biome-ignore lint/suspicious/noEmptyBlockStatements: the caller of syncFleetConfig already gets this rejection from `next`; the queue only needs to know a sync finished, not how
  queue = next.catch(() => {});
  return next;
};

/**
 * What the machine has of what cawco last put on it, without changing any of
 * it. The sidecar is the question — a server or a plugin nobody here manages is
 * not this report's business.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: checks every category the sidecar manages against what is really on disk, one report row per item
export const fleetStatus = async (): Promise<FleetSyncReport> => {
  const managed = await readSidecar();
  const skills: Record<string, FleetItemState> = {};
  const memoryDocs: Record<string, FleetItemState> = {};
  const hooks: Record<string, FleetItemState> = {};
  const report: FleetSyncReport = {
    mcp: {},
    marketplaces: {},
    plugins: {},
    skills,
    memoryDocs,
    hooks,
    // The same claim the sync makes, and it has to be made here too: a status
    // overwrites the stored report, so a status without it would retract what
    // the machine holds and have the hub resend every byte on the next change.
    have: { skills: managed.skills, plugins: managed.vendoredPlugins ?? {} },
    at: Date.now(),
  };

  report.mcp = await readMcpRuntime(managed.mcp);
  for (const { name, linkedAs } of managed.marketplaces) {
    // biome-ignore lint/performance/noAwaitInLoops: a read-only status check; kept sequential like the rest of this report rather than fanning out parallel file reads
    report.marketplaces[name] = (await isLinked(linkedAs))
      ? { state: "applied" }
      : {
          state: "failed",
          detail: `${linkedAs} is not in known_marketplaces.json`,
        };
  }
  for (const id of managed.plugins) {
    // A vendored plugin is installed out of cawco's own marketplace, under
    // that marketplace's name, and the upstream id is uninstalled for it.
    const name = pluginNameOf(id);
    const installedAs =
      managed.vendoredPlugins?.[name] === undefined
        ? id
        : `${name}@${VENDOR_NAME}`;
    // biome-ignore lint/performance/noAwaitInLoops: a read-only status check; kept sequential like the rest of this report rather than fanning out parallel file reads
    report.plugins[id] = (await isInstalled(installedAs))
      ? { state: "applied" }
      : { state: "failed", detail: "not in installed_plugins.json" };
  }
  hubOnlyStates(
    managed.hubOnlyMarketplaces ?? [],
    report.plugins,
    report.marketplaces
  );
  for (const name of Object.keys(managed.skills)) {
    // biome-ignore lint/performance/noAwaitInLoops: a read-only status check; kept sequential like the rest of this report rather than fanning out parallel file reads
    skills[name] = (await dirExists(join(SKILLS_DIR, name)))
      ? { state: "applied" }
      : { state: "failed", detail: "not on disk" };
  }
  if (managed.memory !== undefined) {
    const fileHash = await memoryFileHash();
    report.memory =
      fileHash === managed.memory
        ? { state: "applied" }
        : {
            state: "failed",
            detail: fileHash === null ? "not on disk" : DRIFTED,
          };
  }
  for (const [path, hash] of Object.entries(managed.memoryDocs)) {
    // biome-ignore lint/performance/noAwaitInLoops: a read-only status check; kept sequential like the rest of this report rather than fanning out parallel file reads
    const fileHash = await fileHashAt(join(MEMORIES_DIR, path));
    memoryDocs[path] =
      fileHash === hash
        ? { state: "applied" }
        : {
            state: "failed",
            detail: fileHash === null ? "not on disk" : DRIFTED,
          };
  }
  if (managed.memoryHook !== undefined) {
    report.memoryHook = (await Bun.file(managed.memoryHook).exists())
      ? { state: "applied" }
      : { state: "failed", detail: "not on disk" };
  }
  for (const [id, record] of Object.entries(managed.hooks)) {
    if (record.command.startsWith(HOOKS_DIR)) {
      const scriptFile = Bun.file(record.command);
      // biome-ignore lint/performance/noAwaitInLoops: a read-only status check; kept sequential like the rest of this report rather than fanning out parallel file reads
      if (!(await scriptFile.exists())) {
        hooks[id] = { state: "failed", detail: "not on disk" };
        continue;
      }
      const script = await scriptFile.text();
      const parseError = await scriptParseError(script);
      if (parseError) {
        hooks[id] = { state: "failed", detail: parseError };
        continue;
      }
      if (hashText(script) !== record.hash) {
        hooks[id] = { state: "failed", detail: DRIFTED };
        continue;
      }
    }
    // The last question for every hook: whether the entry cawco registered
    // is still in the settings.json it registered it in — a script that was
    // refused registration is kept on disk, so a matching file is not enough.
    const settingsPath = settingsPathFor(record);
    const stored = await readJson<Record<string, unknown>>(settingsPath);
    const entries =
      (stored?.hooks as Record<string, HookMatcher[]> | undefined)?.[
        record.event
      ] ?? [];
    const present = entries.some((entry) =>
      (entry.hooks ?? []).some((one) =>
        one.command === undefined
          ? JSON.stringify(one) === record.command
          : one.command === record.command
      )
    );
    hooks[id] = present
      ? { state: "applied" }
      : { state: "failed", detail: `not in ${settingsPath}` };
  }
  // Claimed here too, and for the reason `have` above is: a status overwrites
  // the stored report, so a status that left the toolchain out would retract
  // the attribution the last sync established.
  const toolchain = await machineToolchain(false);
  if (toolchain.claude) {
    report.toolchain = toolchain;
  }
  return report;
};

/**
 * This machine's own memory set, whoever wrote it: the user CLAUDE.md and every
 * document beside it. What adoption reads — a memory a machine has been
 * collecting for a year is where the fleet's first document comes from, and a
 * machine somebody split into a set by hand is where the rest of it does.
 */
export const readMemoryFile = async (): Promise<MachineMemorySet | null> => {
  const file = Bun.file(MEMORY_PATH);
  const docs: MachineMemoryDoc[] = [];
  // Each document is an independent read, but the reads are few and this is
  // a plain discovery call, not a hot path worth a concurrency strategy.
  for (const path of await memoryDocPaths()) {
    // biome-ignore lint/performance/noAwaitInLoops: independent reads, kept sequential for a call this infrequent
    const content = await Bun.file(join(MEMORIES_DIR, path)).text();
    docs.push({ path, content, hash: hashText(content) });
  }
  // A machine with documents but no main file still has a set worth adopting,
  // and an empty main file is what the fleet's own row would have been anyway.
  if (!(await file.exists())) {
    return docs.length > 0 ? { content: "", hash: hashText(""), docs } : null;
  }

  const content = await file.text();
  return { content, hash: hashText(content), docs };
};

/**
 * One fleet hook's script as this machine has it on disk, whoever last wrote
 * it. What a compare reads, and what adopting an edited script takes as the
 * fleet's.
 */
export const readHookScript = async (
  id: string
): Promise<MachineHookScript | null> => {
  const file = Bun.file(hookScriptPath(id));
  if (!(await file.exists())) {
    return null;
  }
  const content = await file.text();
  return { content, hash: hashText(content) };
};

/**
 * Discovery (NEW.md §11). Everything above answers "what did cawco do here";
 * everything below answers the question that was missing — what this machine
 * really has, whoever put it there. Read-only, all of it: an unmanaged server or
 * a skill somebody wrote by hand is exactly what a reader wants to see, and
 * exactly what nothing here may touch.
 */

/** MCP server names by scope, nearest first: what a session in `cwd` resolves. */
interface McpScope {
  scope: FleetScope;
  servers: Record<string, unknown>;
}

/**
 * The three scopes into one list. Claude Code's own precedence is
 * local > project > user, so a name defined twice is reported twice — the
 * nearer one plainly, the further one saying which scope took it.
 */
export function mergeMcp(
  scopes: McpScope[],
  managed: readonly string[]
): DiscoveredMcp[] {
  const found: DiscoveredMcp[] = [];
  for (const [index, { scope, servers }] of scopes.entries()) {
    for (const [name, config] of Object.entries(servers)) {
      const nearer = scopes
        .slice(0, index)
        .find((other) => other.servers[name] !== undefined);
      found.push({
        name,
        scope,
        config: config as FleetMcpConfig,
        // CawCo only ever writes the user scope, so only that one can be ours.
        managed: scope === "user" && managed.includes(name),
        ...(nearer ? { shadowedBy: nearer.scope } : {}),
      });
    }
  }
  return found;
}

/**
 * A skill's own description, out of the SKILL.md front matter Claude Code
 * reads. Long ones are written as YAML block scalars (`description: >-` and the
 * text indented under it), which a read of the key's own line answers with the
 * marker instead of a sentence.
 */
/** A YAML block-scalar marker (`>`, `|`, with an optional `-`/`+` chomp indicator). */
const YAML_BLOCK_SCALAR = /^[|>][-+]?$/;

/** A line that continues a YAML block scalar: indented, or blank. */
const YAML_CONTINUATION = /^\s/;

export function skillDescription(source: string): string | undefined {
  if (!source.startsWith("---")) {
    return undefined;
  }
  const end = source.indexOf("\n---", 3);
  const front = (end === -1 ? source : source.slice(0, end)).split("\n");
  const at = front.findIndex((row) => row.startsWith("description:"));
  if (at === -1) {
    return undefined;
  }

  const value = front[at].slice("description:".length).trim();
  if (!YAML_BLOCK_SCALAR.test(value)) {
    return value.replace(/^["']|["']$/g, "") || undefined;
  }

  const block: string[] = [];
  for (const row of front.slice(at + 1)) {
    if (row.trim() !== "" && !YAML_CONTINUATION.test(row)) {
      break;
    }
    block.push(row.trim());
  }
  return block.join(" ").trim() || undefined;
}

/** Where an installed plugin's skills live, by the name a session calls them. */
export function pluginSkillRoots(
  installed: InstalledPlugins
): { plugin: string; root: string }[] {
  const roots: { plugin: string; root: string }[] = [];
  for (const [id, entries] of Object.entries(installed.plugins ?? {})) {
    for (const entry of entries) {
      // The CLI keeps the unpacked copy's path per install; a plugin's skills
      // are a `skills/` directory inside it, which is what `/` lists as
      // `<plugin>:<skill>`.
      if (!entry.installPath) {
        continue;
      }
      roots.push({
        plugin: id.split("@")[0],
        root: join(entry.installPath, "skills"),
      });
    }
  }
  return roots;
}

/**
 * Every directory under `root` that is a skill, named as a session names it —
 * the directory holding the SKILL.md, whatever it is filed under.
 *
 * Two layouts this met on real machines, both of which the naive read missed:
 * `~/.claude/skills/<name>` is usually a *symlink* into `~/.agents/skills`,
 * which a dirent calls a link rather than a directory; and a plugin may file
 * its skills under categories (`skills/engineering/<name>/SKILL.md`), which is
 * a layout detail — `/` still lists the skill by its own directory's name.
 */
export async function skillsIn(
  root: string,
  scope: DiscoveredSkill["scope"],
  prefix = "",
  depth = 2
): Promise<DiscoveredSkill[]> {
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const found: DiscoveredSkill[] = [];
  for (const entry of entries) {
    if (!(entry.isDirectory() || entry.isSymbolicLink())) {
      continue;
    }
    const path = join(root, entry.name);
    const file = Bun.file(join(path, "SKILL.md"));
    // biome-ignore lint/performance/noAwaitInLoops: `found` is built in directory-listing order, which the dashboard's skill list preserves
    if (await file.exists()) {
      const description = skillDescription(await file.text());
      found.push({
        name: `${prefix}${entry.name}`,
        scope,
        path,
        managed: false,
        ...(description ? { description } : {}),
      });
      continue;
    }
    if (depth > 1) {
      found.push(...(await skillsIn(path, scope, prefix, depth - 1)));
    }
  }
  return found;
}

/** Every skill on this machine, in the order Claude Code would resolve them. */
const discoverSkills = async (
  cwd: string | undefined,
  managed: Sidecar
): Promise<DiscoveredSkill[]> => {
  const installed = (await readJson<InstalledPlugins>(INSTALLED_PLUGINS)) ?? {};
  const plugins = await Promise.all(
    pluginSkillRoots(installed).map(({ plugin, root }) =>
      skillsIn(root, "plugin", `${plugin}:`)
    )
  );
  const project = cwd
    ? await skillsIn(join(cwd, ".claude", "skills"), "project")
    : [];
  const user = await skillsIn(SKILLS_DIR, "user");
  return [
    ...project,
    ...user.map((skill) => ({
      ...skill,
      managed: managed.skills[skill.name] !== undefined,
    })),
    ...plugins.flat(),
  ];
};

/**
 * What this machine really has, and what a session started in `cwd` would see.
 * Nothing is written and nothing is compared against the fleet: the hub reads
 * its own rows, and this is the other half — the machine's own word.
 */
export const inspectConfig = async (
  cwd?: string
): Promise<ConfigInspection> => {
  const managed = await readSidecar();
  const file = await readClaudeJson();
  const root = file.ok ? file.root : {};

  const projects =
    (root.projects as
      | Record<string, { mcpServers?: Record<string, unknown> }>
      | undefined) ?? {};
  const local = cwd ? (projects[cwd]?.mcpServers ?? {}) : {};
  const project = cwd
    ? ((
        await readJson<{ mcpServers?: Record<string, unknown> }>(
          join(cwd, ".mcp.json")
        )
      )?.mcpServers ?? {})
    : {};

  const installed = (await readJson<InstalledPlugins>(INSTALLED_PLUGINS)) ?? {};
  const linked =
    (await readJson<Record<string, unknown>>(KNOWN_MARKETPLACES)) ?? {};

  const memoryHash = await memoryFileHash();
  const memoryFile = Bun.file(MEMORY_PATH);
  const docs: NonNullable<ConfigInspection["memory"]>["docs"] = [];
  for (const path of await memoryDocPaths()) {
    const doc = Bun.file(join(MEMORIES_DIR, path));
    // biome-ignore lint/performance/noAwaitInLoops: independent reads, kept sequential for a call this infrequent
    const hash = hashText(await doc.text());
    docs.push({
      path,
      hash,
      bytes: doc.size,
      managed: managed.memoryDocs[path] === hash,
    });
  }

  return {
    ...(cwd ? { cwd } : {}),
    mcp: mergeMcp(
      [
        { scope: "local", servers: local },
        { scope: "project", servers: project },
        { scope: "user", servers: mcpServersOf(root) },
      ],
      managed.mcp
    ),
    skills: await discoverSkills(cwd, managed),
    plugins: Object.entries(installed.plugins ?? {})
      .filter(([, entries]) => entries.some((entry) => entry.scope === "user"))
      .map(([id]) => id),
    marketplaces: Object.keys(linked),
    memory: memoryHash
      ? {
          hash: memoryHash,
          bytes: memoryFile.size,
          managed: managed.memory === memoryHash,
          docs,
        }
      : null,
    at: Date.now(),
  };
};

/** Past this a skill is not a skill any more, and adoption says so rather than trying. */
const SKILL_BYTES_CAP = 2 * 1024 * 1024;

/** Every file under a directory, relative to it. Symlinks are not followed. */
const filesUnder = async (root: string, prefix = ""): Promise<string[]> => {
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const paths: string[] = [];
  for (const entry of entries) {
    const relative = `${prefix}${entry.name}`;
    if (entry.isDirectory()) {
      // biome-ignore lint/performance/noAwaitInLoops: `paths` is built in directory-listing order, which readSkillFiles relies on for a stable file order
      paths.push(...(await filesUnder(join(root, entry.name), `${relative}/`)));
    } else if (entry.isFile()) {
      paths.push(relative);
    }
  }
  return paths;
};

/**
 * The files of a skill that is already on this machine, so the hub can adopt it
 * into the fleet and hand it to every other machine. Named as
 * {@link inspectConfig} named it, plugin skills included.
 */
export const readSkillFiles = async (
  name: string,
  cwd?: string
): Promise<SkillFile[]> => {
  const skill = (await discoverSkills(cwd, await readSidecar())).find(
    (one) => one.name === name
  );
  if (!skill) {
    throw new Error(`no skill ${name} on this machine`);
  }

  const files: SkillFile[] = [];
  let bytes = 0;
  for (const path of await filesUnder(skill.path)) {
    const content = new Uint8Array(
      // biome-ignore lint/performance/noAwaitInLoops: `bytes` must hit the cap in file order so the error names the file that pushed it over, not whichever read happened to land last
      await Bun.file(join(skill.path, path)).arrayBuffer()
    );
    bytes += content.byteLength;
    if (bytes > SKILL_BYTES_CAP) {
      throw new Error(
        `${name} is over ${SKILL_BYTES_CAP / 1024 / 1024} MB — too big to carry to every machine`
      );
    }
    files.push({
      path,
      contentBase64: Buffer.from(content).toString("base64"),
      // biome-ignore lint/suspicious/noBitwiseOperators: the execute bits of a stat mode are a mask, and the mask is the question
      executable: ((await stat(join(skill.path, path))).mode & 0o111) !== 0,
    });
  }
  return files;
};

/** What a linked marketplace's own manifest lists. */
interface MarketplaceManifest {
  plugins?: MarketplacePluginInfo[];
}

/**
 * What a marketplace linked on this machine offers, read from its clone — the
 * dashboard browses installable plugins with it, so a name must come back with
 * whatever the marketplace says about itself.
 */
export const marketplaceCatalog = async (
  name: string
): Promise<MarketplacePluginInfo[]> => {
  const manifest = await readJson<MarketplaceManifest>(
    join(MARKETPLACES_DIR, name, ".claude-plugin", "marketplace.json")
  );
  if (!manifest) {
    throw new Error(`no marketplace ${name} is linked on this machine`);
  }
  return (manifest.plugins ?? []).map(
    ({ name: plugin, description, version, category }) => ({
      name: plugin,
      description,
      version,
      category,
    })
  );
};
