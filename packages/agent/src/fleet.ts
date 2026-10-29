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
  lstat,
  mkdir,
  readdir,
  realpath,
  rm,
  rmdir,
  stat,
} from "node:fs/promises";
import { basename, delimiter, dirname, isAbsolute, join } from "node:path";
import type {
  CliInstall,
  ConfigInspection,
  DiscoveredMcp,
  DiscoveredSkill,
  FleetConfig,
  FleetFaultCause,
  FleetHarnessConfig,
  FleetHoldings,
  FleetHook,
  FleetItemState,
  FleetMcpConfig,
  FleetMemory,
  FleetMemoryDoc,
  FleetPlacedMemoryDoc,
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
  PlacedFleetConfig,
  SkillFile,
} from "@cawco/core";
import {
  hookMatchTest,
  hookProblem,
  hookWorkspaceNote,
  memoryDocProblem,
  SKILL_FOLDER_LIMIT_BYTES,
  SKILL_FOLDER_LIMIT_FILES,
  SKILL_SKIPPED_DIRS,
  skillDescription,
} from "@cawco/core";
import { type Bounded, readWithin } from "@cawco/core/bounded";
import { hashFiles } from "@cawco/core/file-hash";
import {
  accountIds,
  claudeHomeJson,
  claudeSkillsDir,
  fleetHarnessSetFile,
  fleetHooksDir,
  fleetPlacedDir,
  fleetPlacesDir,
  placedMemoryDir,
  placedSkillsDir,
  projectClaudeDir,
  treeStoreOf,
  userLayerPath,
  VENDOR_MARKETPLACES_DIR,
} from "@cawco/core/paths";
import { writeStateFile } from "@cawco/core/state-file";
import { unhandled } from "@cawco/core/unhandled";
import { accountClaudeJsons, linkUserLayer } from "./accounts";
import { resolveClaudeExecutable } from "./auth";
import { excludeFromCheckout } from "./checkout-exclude";
import { ClaudeRefused, claudeToStart } from "./claude-version";
import { readFleetDenials, sidecarTurn } from "./denied-tools";
import { readyHarnessRows, syncHarnessConfig } from "./fleet-harness-config";
import {
  type FleetHarnessSet,
  readFleetHarnessSet,
  type SetHarnessConfig,
  type SetHook,
  writeFleetHarnessSet,
} from "./fleet-harness-set";
import {
  guardedHandler,
  HOOK_GUARD_SOURCE,
  hookGuardFile,
} from "./fleet-hook-guard";
import { apartSignedOut, readFleetMcpSet } from "./fleet-mcp-set";
import { FLEET_PARTS, type FleetPart } from "./fleet-parts";
import {
  type FleetPlaceSet,
  keepPlaceSet,
  placedMcpKeys,
  placeSets,
  readPlaceSet,
} from "./fleet-place-set";
import { expandHome } from "./fs";
import { readMcpRuntime, readSettledOnce } from "./mcp-status";
import { markdownUnder } from "./placed-memory";
import { noRepositoryAt } from "./stand-ins";
import { claudeHomeEnv, toolEnv, toolPath } from "./tools";
import {
  CARRIED,
  carriedList,
  fleetFilesIn,
  heldHash,
  placeTree,
  removeTree,
} from "./tree-swap";
import { cloneHolding } from "./workspace-records";

/**
 * User-scope MCP servers live at the top level of this file — not in
 * `~/.claude/settings.json`, and not in anything under `~/.claude/`. Every
 * project loads them, and the SDK reads them whatever its `settingSources` say.
 */
const CLAUDE_JSON = claudeHomeJson();

/** What cawco manages here. Anything this does not name is never touched. */
const SIDECAR = userLayerPath("cawco-fleet.json");

/** Where a plain skill's files land — one directory per skill, all of it cawco's. */
const SKILLS_DIR = claudeSkillsDir();

/**
 * The fleet's OWN marketplaces, written from the bytes the hub resolved: one
 * per fleet marketplace, `<root>/<marketplace>/`, registered as
 * `cawco-<marketplace>`. All of it cawco's, like a skill's directory, and
 * never edited by anything else. One per source marketplace because a
 * plugin's identity is `plugin@marketplace`: its cache folder
 * (`cache/<marketplace>/<plugin>/<version>/`) and its data folder ("For a
 * plugin installed as `formatter@my-marketplace`, the directory is
 * `~/.claude/plugins/data/formatter-my-marketplace/`",
 * https://code.claude.com/docs/en/plugins-reference) both key on it, so two
 * plugins of one name from two marketplaces need two marketplaces here too.
 */
const VENDOR_ROOT = userLayerPath(VENDOR_MARKETPLACES_DIR);

/** What the vendored copy of fleet marketplace `marketplace` is registered as. */
const vendorName = (marketplace: string): string => `cawco-${marketplace}`;

/** Where it is written. */
const vendorDir = (marketplace: string): string =>
  join(VENDOR_ROOT, marketplace);

/** The user-scope memory every session on this machine reads (NEW.md §11). */
const MEMORY_PATH = userLayerPath("CLAUDE.md");

/**
 * The documents the main memory links, one file per path the set names. All of
 * it cawco's, like a skill's directory — nothing under here was ever written
 * by anything else, so a file the set stops carrying is a file that goes.
 */
const MEMORIES_DIR = userLayerPath("memories");

/** Where Claude Code reads a user's hooks; the same file the user's own are in. */
const SETTINGS_PATH = userLayerPath("settings.json");

/**
 * Where a fleet hook's own script lands, one file per hook id (core
 * `fleetHooksDir`, which every workspace reads: a workspace session's
 * harness runs a command hook inside its boundary). Named by id rather than
 * by name or hash, so renaming a hook in the editor moves its registration
 * but never orphans a script under an old name, and a hand edit survives a
 * hash bump to the same file it was made in.
 */
const HOOKS_DIR = fleetHooksDir();

/**
 * Where the scripts were written before they moved to {@link HOOKS_DIR}, in
 * the user layer no workspace reads. A record's script found there is
 * removed once the sync has registered the hook at its new path.
 */
const USER_LAYER_HOOKS_DIR = userLayerPath("cawco-hooks");

const PLUGINS_DIR = userLayerPath("plugins");
/** The CLI's own account of what is linked and what is installed. */
const KNOWN_MARKETPLACES = join(PLUGINS_DIR, "known_marketplaces.json");
const INSTALLED_PLUGINS = join(PLUGINS_DIR, "installed_plugins.json");

/** Where the local installer puts the CLI when it is not on any PATH. */
const LOCAL_CLAUDE = userLayerPath("local", "claude");

/** How long one `claude plugin …` gets: a first clone of a marketplace is slow. */
const CLI_TIMEOUT_MS = 120_000;

/** The end of a command's output: enough to name what happened, not a wall of it. */
const TAIL_LINES = 4;

const tail = (output: string): string =>
  output.trim().split("\n").slice(-TAIL_LINES).join("\n");

const said = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

interface Sidecar {
  /**
   * The fleet's denied-tools list, synced from `fleet_denied_tools`. None
   * before the machine's first sync: the machine has not heard the list,
   * and {@link readFleetDenials} says so.
   */
  deniedTools?: string[];
  /**
   * The harness config rows the last sync could not make ready, by their
   * report key (fleet-harness-config.ts `syncHarnessConfig`), each with its
   * words: a status read says them failed as the sync did, until a sync
   * makes them. The ready ones are the harness set's (fleet-harness-set.ts).
   */
  harnessConfigFailed: Record<string, FleetItemState>;
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
   * only ({@link PlacedFleetConfig.hubOnlyMarketplaces}). Nothing is linked for
   * them, so a status reads their rows off their plugins, as the sync did.
   */
  hubOnlyMarketplaces: string[];
  /**
   * The marketplaces cawco linked, by their one name: the `name` of their
   * own `marketplace.json`, which is the fleet row's (the hub links under it)
   * and the key Claude Code registers them under. Written only once the CLI
   * lists that name.
   */
  marketplaces: string[];
  /**
   * The fleet's servers CawCo wrote into `.claude.json` files, from before
   * sessions took them through the SDK (fleet-mcp-set.ts): what the one
   * cleanup ({@link dropWrittenMcp}) takes back out of the person's files.
   * Absent once it has.
   */
  mcp?: string[];
  /**
   * The names of the fleet's servers and the keys of the placed copies the
   * last sync handed sessions: what a later sync reports removed.
   */
  mcpServers: string[];
  /** The hash cawco last wrote to `~/.claude/CLAUDE.md`; absent = unmanaged. */
  memory?: string;
  /**
   * Set path → the hash cawco last wrote there, under `~/.claude/memories/`.
   * Per file, because drift is per file: one document edited on this machine
   * holds up itself and leaves the rest of the set converging.
   */
  memoryDocs: Record<string, string>;
  /**
   * A project's MCP servers CawCo placed into a folder's map in
   * `.claude.json`, by `<name>@<place id>`, from before sessions took them
   * through the SDK: taken back out by the same cleanup as `mcp`. Absent
   * once it has.
   */
  placedMcp?: Record<string, PlacedRecord>;
  /**
   * A project's memory documents cawco placed here, by `<path>@<place id>`
   * (`name` is the path), with the hash written to
   * `<cwd>/.claude/rules/cawco/<path>`.
   */
  placedMemory: Record<string, PlacedRecord & { hash: string }>;
  /**
   * A project's skills cawco placed here, by `<name>@<place id>`, with the
   * hash written into `<cwd>/.claude/skills/<name>/`.
   */
  placedSkills: Record<string, PlacedRecord & { hash: string }>;
  plugins: string[];
  /** Skill name → the hash of the files written, which is what makes a sync a no-op. */
  skills: Record<string, string>;
  /**
   * Fleet plugin id (`plugin@marketplace`) → the hash of the vendored files
   * written under {@link VENDOR_ROOT}. Same purpose as `skills`, and the
   * reason a sync that changes nothing rewrites nothing.
   */
  vendoredPlugins?: Record<string, string>;
}

/** Where one placed copy of a project's row went: its folder and its name. */
interface PlacedRecord {
  cwd: string;
  name: string;
}

/** What cawco registered for one hook, enough to find and remove it later. */
interface ManagedHook {
  command: string;
  /**
   * The folder of a project's copy. One with `placed` is in its place's
   * file (fleet-place-set.ts); one without was registered in that folder's
   * `.claude/settings.json` by an earlier build, and the sync takes it out
   * of there ({@link dropCheckoutHooks}).
   */
  cwd?: string;
  event: HookEvent;
  /** sha256 of the script cawco wrote, or of the hub's row when there is no script. */
  hash: string;
  /** What a workspace session makes of it, said with its applied state (core `hookWorkspaceNote`). */
  note?: string;
  /** A project's copy, handed to its sessions through the harness set. */
  placed?: true;
  scope: FleetScope;
  /** The script cawco wrote for it, in {@link HOOKS_DIR}. */
  script?: string;
}

/**
 * The script cawco wrote for a hook it registered: the record's own, or the
 * command a record from before the guard registered, when that is a script
 * in the hooks dir or the user layer's old one.
 */
const scriptPathOf = (record: ManagedHook): string | undefined =>
  record.script ??
  (record.command.startsWith(HOOKS_DIR) ||
  record.command.startsWith(USER_LAYER_HOOKS_DIR)
    ? record.command
    : undefined);

export const readJson = async <T>(path: string): Promise<T | undefined> => {
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
 * Written whole and moved into place, whatever the content is
 * ({@link writeStateFile}): never a half-written `path` that something else
 * reads mid-write. A hook's script is spawned with its execute bit, so a
 * half-written one is worse than a half-written JSON blob: it is a shell
 * prefix somebody's session is about to run.
 */
export const writeAtomic = (
  path: string,
  content: string | Buffer
): Promise<void> => writeStateFile(path, content);

/** `~/.claude.json` is read by every Claude Code on this machine, and a
 * half-written one is a machine with no MCP servers and no history. */
const writeJson = (path: string, value: unknown): Promise<void> =>
  writeAtomic(path, JSON.stringify(value, null, 2));

/**
 * What cawco put here last time; unreadable is the same as never written,
 * and a machine that never synced manages nothing.
 */
const readSidecar = async (): Promise<Sidecar> => {
  const stored = await readJson<Partial<Sidecar>>(SIDECAR);
  return {
    ...(stored?.mcp ? { mcp: stored.mcp } : {}),
    mcpServers: stored?.mcpServers ?? [],
    marketplaces: stored?.marketplaces ?? [],
    hubOnlyMarketplaces: stored?.hubOnlyMarketplaces ?? [],
    plugins: stored?.plugins ?? [],
    // Read back like every other record: without it each sync starts from an
    // empty one, so it reinstalls every vendored plugin and never uninstalls a
    // plugin the fleet dropped.
    vendoredPlugins: stored?.vendoredPlugins ?? {},
    skills: stored?.skills ?? {},
    ...(stored?.memory ? { memory: stored.memory } : {}),
    memoryDocs: stored?.memoryDocs ?? {},
    // None until the first sync: the machine has not heard the list.
    ...(stored?.deniedTools ? { deniedTools: stored.deniedTools } : {}),
    hooks: stored?.hooks ?? {},
    harnessConfigFailed: stored?.harnessConfigFailed ?? {},
    ...(stored?.placedMcp ? { placedMcp: stored.placedMcp } : {}),
    placedMemory: stored?.placedMemory ?? {},
    placedSkills: stored?.placedSkills ?? {},
  };
};

type ClaudeJson = Record<string, unknown>;

/** Why a write did not converge: its cause, named here, and its words. */
interface Problem {
  cause: FleetFaultCause;
  detail: string;
}

/** The file, or why it could not be read. Missing is a machine with nothing in it. */
const readClaudeJson = async (
  path = CLAUDE_JSON
): Promise<{ ok: true; root: ClaudeJson } | ({ ok: false } & Problem)> => {
  const file = Bun.file(path);
  if (!(await file.exists())) {
    return { ok: true, root: {} };
  }
  try {
    return { ok: true, root: (await file.json()) as ClaudeJson };
  } catch (error) {
    return {
      ok: false,
      cause: "unparsable",
      detail: `could not parse ${path}: ${tail(said(error))}`,
    };
  }
};

const mcpServersOf = (root: ClaudeJson): Record<string, unknown> => ({
  ...((root.mcpServers as Record<string, unknown> | undefined) ?? {}),
});

/** A placed copy's key in the sidecar and the report: `<name>@<place id>`. */
const placedKey = (row: { name: string; placeId?: string }): string =>
  `${row.name}@${row.placeId ?? ""}`;

/** The sidecar the agent kept before CawCo was named CawCo, which named the servers it wrote then. */
const LEGACY_SIDECAR = userLayerPath("cockpit-fleet.json");

/**
 * The fleet's servers taken back out of every `.claude.json` CawCo wrote
 * them into (`~/.claude.json` and each account's), once: sessions take them
 * through the SDK now (fleet-mcp-set.ts), and the person's own `claude`
 * loads only what he configured. Out go the names the sidecar says CawCo
 * wrote (`mcp`), the ones the agent's sidecar named before CawCo was
 * renamed ({@link LEGACY_SIDECAR}), which no later sidecar carried, and the
 * fleet's own names now, whose entries a merge overwrote with the fleet's
 * whatever was there; and each placed copy from its folder's map
 * (`placedMcp`). Every other key of each file comes back out as it went in.
 * Answers whether every file was cleaned: one that could not be read or
 * written is tried again at the next sync.
 */
const dropWrittenMcp = async (
  managed: Sidecar,
  fleetNames: readonly string[]
): Promise<boolean> => {
  const legacy = await readJson<{ mcp?: string[] }>(LEGACY_SIDECAR);
  if (!(managed.mcp || managed.placedMcp || legacy)) {
    return true;
  }
  const names = new Set([
    ...(managed.mcp ?? []),
    ...(legacy?.mcp ?? []),
    ...fleetNames,
  ]);
  const placed = Object.values(managed.placedMcp ?? {});
  const results = await Promise.all(
    [CLAUDE_JSON, ...accountClaudeJsons()].map((path) =>
      dropWrittenMcpFrom(path, names, placed)
    )
  );
  if (!results.every(Boolean)) {
    return false;
  }
  await rm(LEGACY_SIDECAR, { force: true });
  return true;
};

/** {@link dropWrittenMcp} for one file: `names` out of its user scope, each of `placed` out of its folder's map. */
const dropWrittenMcpFrom = async (
  path: string,
  names: ReadonlySet<string>,
  placed: readonly PlacedRecord[]
): Promise<boolean> => {
  const file = await readClaudeJson(path);
  if (!file.ok) {
    console.warn(
      `[fleet] the fleet's MCP servers stay in ${path} until it reads: ${file.detail}`
    );
    return false;
  }
  const servers = mcpServersOf(file.root);
  const projects = {
    ...((file.root.projects as
      Record<string, Record<string, unknown>> | undefined) ?? {}),
  };
  const gone = [...names].filter((name) => name in servers);
  for (const name of gone) {
    delete servers[name];
  }
  for (const { cwd, name } of placed) {
    const map = projects[cwd]?.mcpServers as
      Record<string, unknown> | undefined;
    if (map && name in map) {
      const { [name]: _gone, ...rest } = map;
      projects[cwd] = { ...projects[cwd], mcpServers: rest };
      gone.push(`${name} at ${cwd}`);
    }
  }
  if (gone.length === 0) {
    return true;
  }
  try {
    await writeJson(path, {
      ...file.root,
      ...(file.root.mcpServers === undefined ? {} : { mcpServers: servers }),
      ...(file.root.projects === undefined ? {} : { projects }),
    });
  } catch (error) {
    console.warn(
      `[fleet] the fleet's MCP servers stay in ${path} until it can be written: ${tail(said(error))}`
    );
    return false;
  }
  console.info(
    `[fleet] the fleet's MCP servers are out of ${path}: ${gone.join(", ")}`
  );
  return true;
};

/**
 * Each of the fleet's `servers` as Claude Code finds it ({@link readMcpRuntime}),
 * but one the hub holds no sign-in for (the set's `signedOut`), which needs
 * one and is not started to be told so.
 */
const readFleetMcpRuntime = async (
  servers: Record<string, FleetMcpConfig>
): Promise<FleetSyncReport["mcp"]> => {
  const { read, signedOut } = apartSignedOut(
    Object.keys(servers),
    await readFleetMcpSet()
  );
  return {
    ...signedOut,
    ...(await readSettledOnce(
      "claude",
      Object.fromEntries(
        read.map((name) => [name, servers[name] as FleetMcpConfig])
      ),
      readMcpRuntime
    )),
  };
};

/**
 * The fleet's MCP servers and placed copies, as every session takes them
 * (fleet-mcp-set.ts), read by Claude Code itself: each server's state is its
 * verdict on connecting ({@link readFleetMcpRuntime}), a placed copy is applied
 * once it is in the set, and what the last sync handed sessions and this one
 * does not is removed. Answers what this sync hands them.
 */
const reportMcp = async (
  config: PlacedFleetConfig,
  managed: Sidecar,
  report: FleetSyncReport["mcp"]
): Promise<string[]> => {
  const servers = Object.fromEntries(
    config.mcp.filter((row) => row.enabled).map((row) => [row.name, row.config])
  );
  const placed = config.placedMcp
    .filter((row) => row.enabled && row.cwd && row.placeId)
    .map(placedKey);
  Object.assign(report, await readFleetMcpRuntime(servers));
  for (const key of placed) {
    report[key] = { state: "applied" };
  }
  const handed = [...Object.keys(servers), ...placed];
  for (const name of managed.mcpServers) {
    if (!handed.includes(name)) {
      report[name] = { state: "removed" };
    }
  }
  return handed;
};

/**
 * Where a `claude` ends up when it is not the one PATH answers with. Every
 * entry is a real installer's destination: the CLI's own local installer,
 * bun's and npm's global bins and homebrew's two prefixes; a package
 * manager's lands in a dir of the OS's own PATH, which {@link claudeInstalls}
 * reads first. The list exists so a SECOND install can be reported — a
 * machine that has the version the operator just installed sitting behind a
 * stale symlink is the whole of the failure this reports.
 */
const CLAUDE_ELSEWHERE = [
  LOCAL_CLAUDE,
  expandHome("~/.bun/bin/claude"),
  expandHome("~/.local/bin/claude"),
  expandHome("~/.npm-global/bin/claude"),
  "/opt/homebrew/bin/claude",
  "/usr/local/bin/claude",
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
const VERSION_PATTERN = /\d+\.\d+\.\d+/u;

/** An install's version, or undefined when it is not known (it printed none, could not run, or did not answer in time, which is logged). */
const askVersion = async (path: string): Promise<string | undefined> => {
  let read: Bounded<string | undefined>;
  try {
    read = await readWithin(VERSION_TIMEOUT_MS, async (signal) => {
      const child = Bun.spawn([path, "--version"], {
        env: toolEnv(),
        stdout: "pipe",
        stderr: "pipe",
        signal,
      });
      const [out, err] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ]);
      await child.exited;
      return `${out}${err}`.match(VERSION_PATTERN)?.[0];
    });
  } catch {
    return undefined;
  }
  switch (read.kind) {
    case "answered":
      return read.value;
    case "unanswered":
      console.info(
        `[fleet] ${path} --version did not answer in ${VERSION_TIMEOUT_MS / 1000} s; its version is not known`
      );
      return undefined;
    default:
      unhandled("read", read);
  }
};

/**
 * Every `claude` on this machine, PATH order first, with the one this sync ran
 * marked. Deduplicated by what the path really points at, so a symlink and its
 * target are one install — but reported under the path that was FOUND, because
 * that is the one an operator has to move out of the way.
 */
const claudeInstalls = async (used?: string): Promise<CliInstall[]> => {
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
 * The toolchain, cached for this daemon's life and probed again on the
 * machine's health tick ({@link probeToolchain}). A status read is answered
 * from the cache because spawning a CLI per status would make a passive read
 * cost what an active one does; no converge probes, so a delta that moves
 * one item runs no CLI it does not need.
 */
let toolchainCache: FleetToolchain | undefined;

const machineToolchain = async (fresh: boolean): Promise<FleetToolchain> => {
  if (!fresh && toolchainCache) {
    return toolchainCache;
  }
  const claude = await claudeInstalls(resolveClaudeExecutable());
  toolchainCache = claude.length > 0 ? { claude } : {};
  return toolchainCache;
};

interface Ran {
  /** Its exit status; null when a signal ended it or it did not answer in time. */
  code: number | null;
  /** The tail of what it said, which is what a failure's `detail` carries. */
  output: string;
  /** It did not answer within {@link CLI_TIMEOUT_MS}, and was killed. */
  timedOut?: true;
}

/** A row a `claude plugin …` run did not converge: its cause by how the run ended, and its words. */
const ranFailed = (ran: Ran): FleetItemState => ({
  state: "failed",
  cause: ran.timedOut ? "timed-out" : "unknown",
  detail: ran.output,
});

/**
 * One `claude plugin …`, with the daemon's environment and the PATH it can
 * install into. Killed rather than left running if it hangs: a marketplace
 * behind a dead network would otherwise hold the whole sync open forever.
 */
const runClaude = async (bin: string, args: string[]): Promise<Ran> => {
  const ran = await readWithin(CLI_TIMEOUT_MS, async (signal) => {
    const child = Bun.spawn([bin, ...args], {
      // `$HOME/.claude`, the dir every path in this file names, whatever
      // config dir the daemon itself was started in.
      env: claudeHomeEnv(),
      stdout: "pipe",
      stderr: "pipe",
      signal,
    });
    const [stdout, stderr] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    const code = await child.exited;
    if (child.signalCode) {
      return { code: null, output: `was ended by ${child.signalCode}` };
    }
    return { code, output: tail(stderr) || tail(stdout) || `exited ${code}` };
  });
  switch (ran.kind) {
    case "answered":
      return ran.value;
    case "unanswered":
      return {
        code: null,
        output: `did not answer within ${CLI_TIMEOUT_MS / 1000}s`,
        timedOut: true,
      };
    default:
      unhandled("read", ran);
  }
};

/**
 * Whether the CLI has a marketplace registered under `name`, with the
 * directory its catalog is in: what a fleet row's per-machine state is.
 */
const isLinked = async (name: string): Promise<boolean> =>
  (await linkedEntry(name))?.installLocation !== undefined;

/**
 * One entry of the CLI's own account of what is linked: where it came from,
 * and the directory its catalog is in. Keyed by the marketplace's name, the
 * `name` of its `marketplace.json`, which is the only name Claude Code
 * addresses it by (https://code.claude.com/docs/en/plugin-marketplaces:
 * "This is the `name` from `marketplace.json`, not the source you passed to
 * `add`").
 */
interface KnownMarketplace {
  installLocation?: string;
  source?: { source?: string; repo?: string; url?: string; path?: string };
}

const linkedMarketplaces = async (): Promise<
  Record<string, KnownMarketplace>
> =>
  (await readJson<Record<string, KnownMarketplace>>(KNOWN_MARKETPLACES)) ?? {};

/** The registry's entry under `name`, if the CLI has one. */
const linkedEntry = async (
  name: string
): Promise<KnownMarketplace | undefined> => (await linkedMarketplaces())[name];

/**
 * `owner/repo`, an ssh remote, an https clone URL and a `marketplace.json` URL
 * can all name the same link. Compared on the part that identifies it, so the
 * spelling cawco stores still matches whatever the CLI wrote down.
 */
const GIT_PLUS_PREFIX = /^git\+/u;
const GIT_SSH_HOST = /^git@github\.com:/u;
const GIT_URL_HOST = /^(https?|ssh):\/\/([^@]*@)?(www\.)?github\.com\//u;
const GIT_SUFFIX = /\.git$/u;
const TRAILING_SLASHES = /\/+$/u;

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
 * The name the CLI registered `source` under, when it is not `name`: the
 * marketplace's manifest calls itself something else than the fleet row does.
 * Only for saying so after an add; nothing is linked or reported under it.
 */
const registeredAs = (
  linked: Record<string, KnownMarketplace>,
  source: string
): string | undefined =>
  Object.keys(linked).find((key) =>
    sourceKeysOf(linked[key]).includes(sourceKey(source))
  );

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

/** The fleet's id for a payload: `plugin@marketplace`, as the hub's config has it. */
const payloadId = (plugin: FleetPluginPayload): string =>
  `${plugin.name}@${plugin.marketplace}`;

/** The id a fleet plugin is installed under here, out of its vendored marketplace. */
const vendoredIdOf = (id: string): string =>
  `${pluginNameOf(id)}@${vendorName(marketplaceOf(id))}`;

/**
 * Why a plugin of a hub-only marketplace is not on this machine. The bytes the
 * hub carries are its only way here: the marketplace is a directory on the
 * hub's machine, which no command run here can link. Its row's cause is
 * `hub-only`.
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
            cause: "hub-only",
            detail: missing
              .map(([id, item]) => `${id}: ${item.detail ?? "not installed"}`)
              .join("; "),
          };
  }
};

/**
 * Which of the marketplaces cawco linked last time are cawco's to unlink now:
 * the ones config no longer asks this machine to link. A name config still
 * asks for is not a removal even when nothing is linked under it — the add
 * failed, which is its own report and not something to take away. Nor is a
 * name one of config's sources is `registered` under: a manifest renamed
 * upstream, still the link a row asks for until the hub takes the new name.
 */
const toUnlink = (
  managed: readonly string[],
  config: Pick<FleetConfig, "marketplaces">,
  registered: ReadonlySet<string>
): string[] => {
  const asked = new Set(config.marketplaces.map(({ name }) => name));
  return managed.filter((name) => !(asked.has(name) || registered.has(name)));
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
  config: PlacedFleetConfig,
  managed: Sidecar,
  report: FleetSyncReport
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: links every marketplace and installs every plugin the config wants, reporting each one's outcome
): Promise<PluginRecords> => {
  const wantedPlugins = config.plugins.filter((plugin) => plugin.enabled);
  const hubOnly = config.hubOnlyMarketplaces;
  // The Claude Code sessions run: its plugins are the ones they load, and its
  // `claude plugin …` commands start it, so through the version gate.
  let bin: string;
  try {
    bin = await claudeToStart();
  } catch (error) {
    if (!(error instanceof ClaudeRefused)) {
      throw error;
    }
    const refused = error.itemState;
    for (const { name } of config.marketplaces) {
      report.marketplaces[name] = refused;
    }
    for (const { id } of wantedPlugins) {
      report.plugins[id] = refused;
    }
    return {
      marketplaces: managed.marketplaces,
      hubOnlyMarketplaces: managed.hubOnlyMarketplaces,
      plugins: managed.plugins,
      vendoredPlugins: managed.vendoredPlugins,
    };
  }

  // One name for a marketplace everywhere: the fleet row's is its manifest's
  // (the hub links under it), and the CLI registers it under that same name.
  // So "linked here" is the CLI's own registry holding that name.
  const marketplaces: string[] = [];
  const registered = new Set<string>();
  // What this machine links: everything but a directory on the hub's machine,
  // whose path names nothing here. Its plugins come as bytes, and its row is
  // read off them once they are installed.
  const linkable = config.marketplaces.filter(
    ({ name }) => !hubOnly.includes(name)
  );

  for (const { name, source } of linkable) {
    if (await isLinked(name)) {
      marketplaces.push(name);
      report.marketplaces[name] = { state: "applied" };
      continue;
    }
    const ran = await runClaude(bin, ["plugin", "marketplace", "add", source]);
    const linked = await linkedMarketplaces();
    if (linked[name]) {
      marketplaces.push(name);
      report.marketplaces[name] = { state: "applied" };
      continue;
    }
    // Not linked under the fleet's name, so nothing for a later sync to take
    // away under it. A manifest renamed upstream since the hub read it links
    // under its new name, which the hub takes on its next start.
    const other = registeredAs(linked, source);
    if (other) {
      registered.add(other);
    }
    report.marketplaces[name] = other
      ? {
          state: "failed",
          cause: "unknown",
          detail: `${source} now calls itself ${other} in its marketplace.json, not ${name}`,
        }
      : ranFailed(ran);
  }

  // A hub-only marketplace cawco once linked here is unlinked like a removed
  // one: the link pointed at whatever this machine had at that path, which is
  // not the hub's directory, and its plugins now come from the hub's bytes.
  for (const name of toUnlink(
    managed.marketplaces,
    { marketplaces: linkable },
    registered
  )) {
    const ran = await runClaude(bin, ["plugin", "marketplace", "remove", name]);
    report.marketplaces[name] = (await isLinked(name))
      ? ranFailed(ran)
      : { state: "removed" };
  }

  // Whatever the hub resolved for itself is installed from the bytes it sent;
  // only what it could NOT resolve is left for the CLI to go and fetch, which
  // is the path that needs this machine to reach github on its own account.
  const payloads = config.pluginPayloads;
  const vendored = await syncVendoredPlugins(
    bin,
    payloads,
    wantedPlugins,
    managed.vendoredPlugins ?? {},
    report.plugins
  );
  const carried = new Set(payloads.map(payloadId));

  const linked = await linkedMarketplaces();
  for (const { id, error } of wantedPlugins) {
    if (carried.has(id)) {
      continue;
    }
    const marketplace = marketplaceOf(id);
    if (hubOnly.includes(marketplace)) {
      report.plugins[id] = {
        state: "failed",
        cause: "hub-only",
        detail: hubOnlyMiss(marketplace, error),
      };
      continue;
    }
    // The CLI's own account, not this run's report: a link made by hand
    // installs as well as one this sync made.
    if (!linked[marketplace]) {
      report.plugins[id] = {
        state: "failed",
        cause: "marketplace-unlinked",
        detail: `marketplace ${marketplace} is not linked`,
      };
      continue;
    }
    if (await isInstalled(id)) {
      report.plugins[id] = { state: "applied" };
      continue;
    }
    const ran = await runClaude(bin, [
      "plugin",
      "install",
      id,
      "--scope",
      "user",
    ]);
    report.plugins[id] = (await isInstalled(id))
      ? { state: "applied" }
      : ranFailed(ran);
  }

  const plugins = wantedPlugins.map(({ id }) => id);
  for (const id of managed.plugins) {
    if (plugins.includes(id)) {
      continue;
    }
    // A vendored plugin is uninstalled under the name it was installed with;
    // `syncVendoredPlugins` has already done that one.
    if (!carried.has(id)) {
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
    // A link kept for a row's renamed manifest stays cawco's to take away.
    marketplaces: [
      ...marketplaces,
      ...managed.marketplaces.filter(
        (name) => registered.has(name) && !marketplaces.includes(name)
      ),
    ],
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
 * The skill's directory, as the hub resolved it. Written whole: a file the
 * last version carried is not one this version carries, and leaving it there
 * is how a skill drifts. What the fleet never carried (a script's
 * `__pycache__`, a note someone added) goes into the new version as it is.
 * Swapped in with one rename ({@link placeTree}), because a running session
 * reads it.
 */
const writeSkill = async (
  skill: FleetSkillPayload,
  root = SKILLS_DIR
): Promise<void> => {
  await placeTree(
    join(root, skill.name),
    skill.files ?? [],
    carriedPaths(skill)
  );
};

/** A name that is one path segment: a fleet marketplace's or a plugin's, from a manifest off the internet. */
const isSafeSegment = (name: string): boolean =>
  isSafeSkillPath(name) && !name.includes("/");

/** The payloads by the fleet marketplace each came from. */
const byMarketplace = (
  plugins: readonly FleetPluginPayload[]
): Map<string, FleetPluginPayload[]> => {
  const groups = new Map<string, FleetPluginPayload[]>();
  for (const plugin of plugins) {
    groups.set(plugin.marketplace, [
      ...(groups.get(plugin.marketplace) ?? []),
      plugin,
    ]);
  }
  return groups;
};

/**
 * Writes one vendored marketplace from the bytes the hub resolved for one
 * fleet marketplace.
 *
 * Per plugin, not the whole directory at once. A plugin this disk already
 * holds at its hash comes without its bytes ({@link syncVendoredPlugins}), so
 * a rewrite of everything would erase it. Every plugin is
 * vendored as a relative `source`, which is a form the CLI already installs
 * from — the official marketplace vendors its own the same way — so the
 * install that follows reaches the network for nothing.
 *
 * Each plugin's tree is swapped in with one rename ({@link placeTree}):
 * Claude Code runs its hooks from `plugins/<name>` while this writes, and
 * the list of the files the fleet carried goes with it.
 */
const writeVendoredMarketplace = async (
  marketplace: string,
  plugins: readonly FleetPluginPayload[],
  into: string
): Promise<void> => {
  for (const plugin of plugins) {
    if (!plugin.files) {
      continue;
    }
    if (!isSafeSegment(plugin.name)) {
      throw new Error(`unsafe plugin name ${plugin.name}`);
    }
    // The same refusal a skill's files get: a path out of the directory is a
    // file the fleet would write somewhere nobody asked it to.
    const unsafe = plugin.files.find(({ path }) => !isSafeSkillPath(path));
    if (unsafe) {
      throw new Error(`unsafe path ${unsafe.path}`);
    }
    await placeTree(join(into, "plugins", plugin.name), plugin.files);
    console.log(
      `[fleet] ${plugin.name}@${marketplace} written (${plugin.files.length} files, ${plugin.hash.slice(0, 7)})`
    );
  }

  // What the fleet no longer carries goes, whether or not its bytes arrived.
  const wanted = new Set(plugins.map(({ name }) => name));
  const present = await readdir(join(into, "plugins")).catch(
    () => [] as string[]
  );
  // Each removal is its own folder: all at once.
  await Promise.all(
    present
      .filter((name) => !wanted.has(name))
      .map((name) => removeTree(join(into, "plugins", name)))
  );

  await writeStateFile(
    join(into, ".claude-plugin", "marketplace.json"),
    `${JSON.stringify(
      {
        name: vendorName(marketplace),
        owner: { name: "cawco" },
        plugins: plugins.map((plugin) => ({
          name: plugin.name,
          source: `./plugins/${plugin.name}`,
          description: `Carried by the cawco fleet (${marketplace}).`,
        })),
      },
      null,
      2
    )}\n`
  );
};

/**
 * Writes every vendored marketplace the payloads name, and takes away the
 * folder of each one the fleet no longer carries anything from.
 */
const writeVendoredMarketplaces = async (
  plugins: readonly FleetPluginPayload[]
): Promise<void> => {
  const groups = byMarketplace(plugins);
  for (const [marketplace, group] of groups) {
    if (!isSafeSegment(marketplace)) {
      throw new Error(`unsafe marketplace name ${marketplace}`);
    }
    await writeVendoredMarketplace(marketplace, group, vendorDir(marketplace));
  }
  // Each removal is its own folder: all at once.
  const present = await readdir(VENDOR_ROOT).catch(() => [] as string[]);
  await Promise.all(
    present
      .filter((name) => !groups.has(name))
      .map((name) => rm(vendorDir(name), { recursive: true, force: true }))
  );
};

/** The paths of the files the fleet carries for a skill now, when this sync has them. */
const carriedPaths = (skill: FleetSkillPayload): string[] | undefined =>
  skill.files?.map(({ path }) => path);

/**
 * Whether the skill at `dir`, whose carried files hash to `held`, is the
 * fleet's copy and needs no write. One written before skills kept their
 * carried list is written once more when this sync carries its files, so it
 * gets one and is read by it from then on.
 */
const holdsFleetCopy = async (
  dir: string,
  skill: FleetSkillPayload,
  held: string | undefined
): Promise<boolean> =>
  held === skill.hash &&
  !(skill.files && (await carriedList(dir)) === undefined);

/** A directory's files as they are on this disk, execute bits included. */
const treeFiles = async (dir: string): Promise<SkillFile[]> => {
  const files: SkillFile[] = [];
  for (const path of await filesUnder(dir)) {
    const file = join(dir, path);
    files.push({
      path,
      contentBase64: Buffer.from(await Bun.file(file).bytes()).toString(
        "base64"
      ),
      // biome-ignore lint/suspicious/noBitwiseOperators: the execute bits of a stat mode are a mask, and the mask is the question
      executable: ((await stat(file)).mode & 0o111) !== 0,
    });
  }
  return files;
};

/**
 * The hash a skill's record took before a1c94e85 put each file's execute bit
 * into {@link hashFiles}: sorted `path\0content` pairs, no mode.
 */
const hashFilesWithoutMode = (files: SkillFile[]): string => {
  const hasher = new Bun.CryptoHasher("sha256");
  for (const file of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
    hasher.update(`${file.path}\0`);
    hasher.update(file.contentBase64);
  }
  return hasher.digest("hex");
};

/**
 * The sidecar's skill records in the hash {@link heldSkills} takes of a disk,
 * which is the one {@link skillDrift} compares them in. A record cawco wrote
 * before a1c94e85 is the hash without execute bits, which no disk read
 * matches, so every untouched skill it covers read as edited. One that is
 * that hash of the directory on disk now is exactly what cawco wrote there,
 * and it becomes the disk's hash today. One that is that hash of the files a
 * sync carries (`desired`) was the fleet's copy as it still is, and it becomes
 * the fleet's hash, so an edit made since is told apart from a fleet change.
 * The sync that follows stores either. Any other record is left as it is: an
 * edit over an older copy, or a write that failed part-way.
 */
export const skillRecords = async (
  dir: string,
  managed: Record<string, string>,
  held: Record<string, string>,
  desired: readonly FleetSkillPayload[] = []
): Promise<Record<string, string>> => {
  const records = { ...managed };
  const carried = new Map(desired.map((skill) => [skill.name, skill]));
  for (const [name, recorded] of Object.entries(managed)) {
    const disk = held[name];
    if (disk === undefined || !recorded || disk === recorded) {
      continue;
    }
    if (hashFilesWithoutMode(await treeFiles(join(dir, name))) === recorded) {
      records[name] = disk;
      continue;
    }
    const fleet = carried.get(name);
    if (fleet?.files && hashFilesWithoutMode(fleet.files) === recorded) {
      records[name] = fleet.hash;
    }
  }
  return records;
};

/**
 * What a skills directory holds of the skills cawco wrote there: name → hash
 * of the files the fleet carried for that skill, as they are on disk now
 * ({@link heldHash}). Only the names the sidecar owns are read; a skill
 * nobody wrote is not one the fleet holds. `desired` is the sync's payload,
 * whose file list reads a skill written before skills kept their own.
 */
export const heldSkills = async (
  dir: string,
  names: readonly string[],
  desired: readonly FleetSkillPayload[] = []
): Promise<Record<string, string>> => {
  const known = new Map(desired.map((skill) => [skill.name, skill]));
  const held: Record<string, string> = {};
  for (const name of names) {
    const skill = known.get(name);
    const hash = await heldHash(
      join(dir, name),
      skill ? carriedPaths(skill) : undefined
    );
    if (hash) {
      held[name] = hash;
    }
  }
  return held;
};

/**
 * Whether a skill cawco owns was edited on this machine, and what it reports
 * if so — the rule a memory document follows ({@link memoryPlan}). Edited is
 * a directory whose carried files ({@link heldHash}) are neither what cawco
 * last wrote there (`recorded`, the sidecar's hash) nor already what the
 * fleet carries: a carried file someone changed or took away. A file the
 * fleet never carried (a `__pycache__`, a note) is no edit. It is not rewritten; the operator adopts it or overwrites
 * it. A missing directory is not an edit, and neither is one with no record
 * of what was written (a write that failed part-way), so both are written.
 * When the fleet's copy also moved since cawco wrote, both changes are named
 * and neither wins.
 */
export const skillDrift = (
  disk: string | undefined,
  recorded: string | undefined,
  fleet: string
): string | undefined => {
  if (disk === undefined || !recorded || disk === recorded || disk === fleet) {
    return undefined;
  }
  return recorded === fleet
    ? DRIFTED
    : `edited on this machine (now ${disk.slice(0, 7)}), and the fleet's copy changed since (now ${fleet.slice(0, 7)}) — adopt this machine's copy or overwrite it with the fleet's`;
};

/**
 * What the vendored marketplaces hold on this disk now, by fleet plugin id
 * (`plugin@marketplace`) → hash ({@link heldHash}): the key the hub leaves
 * bytes out by. Over the files the fleet carried alone, so what a plugin's
 * own code makes beside them (a hook's `__pycache__`) never has the hub send
 * the bytes again (on 2026-10-16 it did on every sync, and each rewrite raced
 * the plugin's hooks).
 */
const readVendoredPlugins = async (): Promise<Record<string, string>> => {
  const held: Record<string, string> = {};
  for (const marketplace of await readdir(VENDOR_ROOT).catch(
    () => [] as string[]
  )) {
    const root = join(vendorDir(marketplace), "plugins");
    for (const name of await readdir(root).catch(() => [] as string[])) {
      const hash = await heldHash(join(root, name));
      if (hash) {
        held[`${name}@${marketplace}`] = hash;
      }
    }
  }
  return held;
};

/**
 * What claude's copy of the fleet holds on this disk now: the skills cawco
 * wrote under `~/.claude/skills`, and the plugins in the vendored marketplace.
 * Read, never remembered, and reported with each converge (the report's
 * `have`), so the hub tells live sessions when their content moved.
 */
export const fleetHoldings = async (): Promise<FleetHoldings> => ({
  skills: await heldSkills(
    SKILLS_DIR,
    Object.keys((await readSidecar()).skills)
  ),
  plugins: await readVendoredPlugins(),
});

/**
 * Installs the vendored plugins, and answers with what each one came to.
 *
 * Keyed by the FLEET's id — `name@marketplace`, the id the hub's config used —
 * while the CLI installs `name@cawco-<marketplace>`, because the marketplace
 * it comes from on this machine is the one written above. The dashboard's
 * rows are the fleet's, not this machine's private arrangement for satisfying
 * them.
 */
const syncVendoredPlugins = async (
  bin: string,
  payloads: FleetPluginPayload[],
  wanted: readonly { id: string }[],
  managed: Record<string, string>,
  report: Record<string, FleetItemState>
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: writes, links and installs every vendored plugin and reports each one's outcome, missing bytes included
): Promise<Record<string, string>> => {
  const written: Record<string, string> = {};
  const byId = new Map(payloads.map((plugin) => [payloadId(plugin), plugin]));
  const groups = byMarketplace(payloads);
  const present = await readdir(VENDOR_ROOT).catch(() => [] as string[]);

  // Every payload the agent holds carries its bytes (fleet-desired.ts); only
  // a plugin this disk does not hold at that hash is written, so a converge
  // for some other item rewrites no plugin tree under its running hooks.
  const before = await readVendoredPlugins();
  const lacking = payloads.map((plugin) =>
    before[payloadId(plugin)] === plugin.hash
      ? { ...plugin, files: undefined }
      : plugin
  );
  const changed = new Set([
    ...lacking
      .filter((plugin) => plugin.files !== undefined)
      .map(({ marketplace }) => marketplace),
    ...Object.keys(managed)
      .filter((id) => !byId.has(id))
      .map(marketplaceOf),
    ...[...groups.keys()].filter(
      (marketplace) => !present.includes(marketplace)
    ),
  ]);
  const gone = present.filter((marketplace) => !groups.has(marketplace));

  if (changed.size > 0 || gone.length > 0) {
    await writeVendoredMarketplaces(lacking);
  }
  const held = await readVendoredPlugins();

  // Each linked once, then refreshed in place: `add` on an already-linked path
  // is an error, and `update` is what re-reads a directory whose contents
  // moved. One registered at any other directory is not this one (a daemon
  // run with another HOME wrote it), and adding this one replaces it: "adding
  // a second marketplace with the same name replaces the first"
  // (https://code.claude.com/docs/en/plugin-marketplaces).
  for (const marketplace of groups.keys()) {
    const name = vendorName(marketplace);
    if ((await linkedEntry(name))?.installLocation !== vendorDir(marketplace)) {
      await runClaude(bin, [
        "plugin",
        "marketplace",
        "add",
        vendorDir(marketplace),
      ]);
    } else if (changed.has(marketplace)) {
      await runClaude(bin, ["plugin", "marketplace", "update", name]);
    }
  }

  for (const { id } of wanted) {
    const plugin = byId.get(id);
    if (!plugin) {
      continue;
    }
    const vendoredId = vendoredIdOf(id);
    if (held[id] !== plugin.hash) {
      // Not on this disk after the write: its bytes did not land. The
      // report says so, and the item's Retry sends it again.
      report[id] = {
        state: "failed",
        cause: "missing-bytes",
        detail: "the hub sent no files for this hash",
      };
      continue;
    }

    const already =
      managed[id] === plugin.hash && (await isInstalled(vendoredId));
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
      report[id] = ran
        ? ranFailed(ran)
        : { state: "failed", cause: "absent", detail: "install did not land" };
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
    written[id] = plugin.hash;
    report[id] = { state: "applied" };
  }

  for (const id of Object.keys(managed)) {
    if (byId.has(id)) {
      continue;
    }
    await runClaude(bin, [
      "plugin",
      "uninstall",
      vendoredIdOf(id),
      "--scope",
      "user",
      "-y",
    ]);
  }
  // A vendored marketplace the fleet carries nothing from any more: its
  // plugins are uninstalled above and its folder is gone, so its link goes.
  for (const marketplace of gone) {
    if (await linkedEntry(vendorName(marketplace))) {
      await runClaude(bin, [
        "plugin",
        "marketplace",
        "remove",
        vendorName(marketplace),
      ]);
    }
  }
  return written;
};

/**
 * Writes the skills whose files this machine does not have yet, and takes away
 * the ones the fleet no longer carries. No CLI is run and no settings are
 * touched: a plain skill is files, and the hash is the whole economy — an
 * unchanged skill costs one comparison however many megabytes it arrived with.
 */
export const syncSkillFiles = async (
  dir: string,
  desired: FleetSkillPayload[],
  sidecar: Sidecar["skills"],
  report: Record<string, FleetItemState>
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: converge each skill while preserving ownership and reporting write and removal errors individually.
): Promise<Sidecar["skills"]> => {
  const written: Sidecar["skills"] = {};
  // What is on this disk now, not what the sidecar says was written: the
  // sidecar is who owns a directory, the disk is what is in it.
  const held = await heldSkills(dir, Object.keys(sidecar), desired);
  const managed = await skillRecords(dir, sidecar, held, desired);
  for (const skill of desired) {
    if (await holdsFleetCopy(join(dir, skill.name), skill, held[skill.name])) {
      written[skill.name] = skill.hash;
      report[skill.name] = { state: "applied" };
      continue;
    }

    // Edited on this machine: left exactly as it is until the operator adopts
    // it or overwrites it, and the record of what cawco wrote stays, so the
    // edit is still told apart from the fleet's next change.
    const drift = skillDrift(held[skill.name], managed[skill.name], skill.hash);
    if (drift && !skill.force) {
      written[skill.name] = managed[skill.name];
      report[skill.name] = { state: "failed", cause: "drifted", detail: drift };
      continue;
    }

    // A skill item always carries its bytes; one without them is written
    // nowhere and says so, and its Retry sends it again.
    if (!skill.files) {
      if (managed[skill.name] !== undefined) {
        written[skill.name] = managed[skill.name];
      }
      report[skill.name] = {
        state: "failed",
        cause: "missing-bytes",
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
        cause: "unsafe-path",
        detail: `unsafe path ${unsafe.path}`,
      };
      continue;
    }

    try {
      // A forced write over an edit: the hub took that edited copy into the
      // skill's history before it sent the force.
      await writeSkill(skill, dir);
      written[skill.name] = skill.hash;
      report[skill.name] = { state: "applied" };
    } catch (error) {
      // A failed write left the copy that was there before (placeTree swaps
      // whole trees), so the name stays managed — under a hash nothing
      // matches, which is what has the next sync write it again.
      written[skill.name] = "";
      report[skill.name] = {
        state: "failed",
        cause: "unwritable",
        detail: tail(said(error)),
      };
    }
  }

  const wanted = new Set(desired.map(({ name }) => name));
  for (const name of Object.keys(managed)) {
    if (wanted.has(name)) {
      continue;
    }
    // An edited copy outlives the fleet's row, unmanaged, as an edited memory
    // document does: only exactly what cawco wrote is ever taken away.
    if (
      held[name] !== undefined &&
      managed[name] &&
      held[name] !== managed[name]
    ) {
      report[name] = {
        state: "removed",
        detail: "kept: edited on this machine",
      };
      continue;
    }
    try {
      await removeTree(join(dir, name));
      report[name] = { state: "removed" };
    } catch (error) {
      written[name] = managed[name];
      report[name] = {
        state: "failed",
        cause: "unwritable",
        detail: said(error),
      };
    }
  }
  return written;
};

/**
 * Whether `cwd` is a delegate workspace's clone that is no git clone any
 * more (stand-ins.ts `noRepositoryAt`): one deleted by hand, whose
 * workspace's archive takes the folder away. A place is a
 * plain folder by design and no delegate's (`cloneHolding` passes over it).
 * A folder inside a workspace whose records are damaged is a workspace's too.
 */
const deletedClone = async (cwd: string): Promise<boolean> =>
  (await noRepositoryAt(cwd)) &&
  (await cloneHolding(cwd).then(
    (ref) => ref !== undefined,
    () => true
  ));

/** Why nothing is placed in the folder `cwd`: it is not on this machine, or it is a delegate workspace's deleted clone ({@link deletedClone}). */
const unplaceable = async (
  cwd: string
): Promise<FleetItemState | undefined> => {
  if (!(await dirExists(cwd))) {
    return {
      state: "failed",
      cause: "no-checkout",
      detail: `${cwd} is not on this machine`,
    };
  }
  if (await deletedClone(cwd)) {
    return {
      state: "failed",
      cause: "no-checkout",
      detail: `${cwd} is a delegate workspace whose clone was deleted, so nothing is placed there; archiving the workspace takes the folder away`,
    };
  }
};

/**
 * A placed copy cawco no longer places, taken away by `remove` unless it was
 * `edited` in the folder since. Answers whether its record is kept: only when
 * the removal failed, so the next sync tries again.
 */
const takeBackPlaced = async (
  key: string,
  edited: boolean,
  remove: () => Promise<void>,
  report: Record<string, FleetItemState>
): Promise<boolean> => {
  if (edited) {
    report[key] = { state: "removed", detail: "kept: edited in the folder" };
    return false;
  }
  try {
    await remove();
    report[key] = { state: "removed" };
    return false;
  } catch (error) {
    report[key] = { state: "failed", cause: "unwritable", detail: said(error) };
    return true;
  }
};

/**
 * One placed copy of a project's skill: written into its folder's
 * `.claude/skills/<name>/` and kept out of the checkout's status, unless the
 * folder holds a copy cawco did not write (the project's own, or one edited
 * there), which stays as it is and is reported. Nothing is written into a
 * delegate workspace's deleted clone ({@link deletedClone}): its record stays,
 * so the copy already there still reads as cawco's (stand-ins.ts `straysIn`).
 */
const placeSkill = async (
  skill: FleetSkillPayload,
  recorded: string | undefined,
  report: Record<string, FleetItemState>
): Promise<string | undefined> => {
  const key = placedKey(skill);
  const cwd = skill.cwd as string;
  const refused = await unplaceable(cwd);
  if (refused) {
    report[key] = refused;
    return recorded;
  }
  const root = placedSkillsDir(cwd);
  const dir = join(root, skill.name);
  const disk = await heldHash(dir, carriedPaths(skill));
  if (await holdsFleetCopy(dir, skill, disk)) {
    report[key] = { state: "applied" };
    return skill.hash;
  }
  if (disk !== undefined && !recorded) {
    report[key] = {
      state: "failed",
      cause: "unknown",
      detail: `${dir} is the folder's own skill; cawco leaves it as it is`,
    };
    return recorded;
  }
  const drift = skillDrift(disk, recorded, skill.hash);
  if (drift && !skill.force) {
    report[key] = {
      state: "failed",
      cause: "drifted",
      detail: `${dir}: ${drift}`,
    };
    return recorded;
  }
  const unsafe = (skill.files ?? []).find(({ path }) => !isSafeSkillPath(path));
  if (!skill.files || unsafe) {
    report[key] = unsafe
      ? {
          state: "failed",
          cause: "unsafe-path",
          detail: `unsafe path ${unsafe.path}`,
        }
      : {
          state: "failed",
          cause: "missing-bytes",
          detail: "the hub sent no files",
        };
    return recorded;
  }
  try {
    await writeSkill(skill, root);
    // The skill's link and the store of the trees behind it (tree-swap.ts).
    await excludeFromCheckout(dir);
    await excludeFromCheckout(dirname(treeStoreOf(root)));
    report[key] = { state: "applied" };
    return skill.hash;
  } catch (error) {
    report[key] = {
      state: "failed",
      cause: "unwritable",
      detail: tail(said(error)),
    };
    return recorded;
  }
};

/**
 * A project's skills, placed at each of its checkouts and workspace clones
 * on this machine (`PlacedFleetConfig.placedSkills`), and the copies cawco
 * placed before and no longer does taken away, unless edited since (an
 * archived clone's are gone with it). A record of a dir placed again under
 * another key (an earlier build's place id) is only forgotten. Reported
 * under `<name>@<place id>`; answers what cawco now manages.
 */
const syncPlacedSkills = async (
  desired: FleetSkillPayload[],
  managed: Sidecar["placedSkills"],
  report: Record<string, FleetItemState>
): Promise<Sidecar["placedSkills"]> => {
  const placed: Sidecar["placedSkills"] = {};
  for (const skill of desired.filter((each) => each.cwd && each.placeId)) {
    const key = placedKey(skill);
    const hash = await placeSkill(skill, managed[key]?.hash, report);
    if (hash !== undefined) {
      placed[key] = { cwd: skill.cwd as string, name: skill.name, hash };
    }
  }
  const placedDirs = new Set(
    Object.values(placed).map(({ cwd, name }) =>
      join(placedSkillsDir(cwd), name)
    )
  );
  for (const [key, record] of Object.entries(managed)) {
    if (placed[key]) {
      continue;
    }
    const dir = join(placedSkillsDir(record.cwd), record.name);
    if (placedDirs.has(dir)) {
      continue;
    }
    const disk = await heldHash(dir);
    const edited = disk !== undefined && !!record.hash && disk !== record.hash;
    if (await takeBackPlaced(key, edited, () => removeTree(dir), report)) {
      placed[key] = record;
    }
  }
  return placed;
};

/**
 * The copies of a project's rows in the folder `cwd` that are still exactly
 * what cawco placed there: each `<cwd>/.claude/skills/<name>/` the sidecar
 * records for that folder (`placedSkills`) whose tree has the hash recorded
 * for it, and each `<cwd>/.claude/rules/cawco/<path>` (`placedMemory`)
 * whose file has. A copy edited since is someone's. Answered at the
 * folder's real path, as `cwd` is given or as the record names it.
 */
export const placedAsMade = async (cwd: string): Promise<string[]> => {
  const real = (path: string): Promise<string> =>
    realpath(path).catch(() => path);
  const folder = await real(cwd);
  const { placedSkills, placedMemory } = await readSidecar();
  const made: string[] = [];
  for (const record of Object.values(placedSkills)) {
    if (!record.hash || (await real(record.cwd)) !== folder) {
      continue;
    }
    const dir = join(placedSkillsDir(folder), record.name);
    if ((await heldHash(dir)) === record.hash) {
      // The skill's link, and what of the fleet's is in the tree it links
      // to (tree-swap.ts `fleetFilesIn`). Anything else in that tree (a note
      // someone added there) is theirs, not CawCo's.
      made.push(dir, ...(await fleetFilesIn(dir)));
    }
  }
  for (const record of Object.values(placedMemory)) {
    if ((await real(record.cwd)) !== folder) {
      continue;
    }
    const file = join(placedMemoryDir(folder), record.name);
    if ((await fileHashAt(file)) === record.hash) {
      made.push(file);
    }
  }
  return made;
};

/** The same hash the hub took of the same document: sha256 of its UTF-8 bytes. */
export const hashText = (content: string): string =>
  new Bun.CryptoHasher("sha256").update(content).digest("hex");

/** What is really at a memory file; null is a machine that has none. */
const fileHashAt = async (path: string): Promise<string | null> => {
  const file = Bun.file(path);
  return (await file.exists()) ? hashText(await file.text()) : null;
};

type MemoryPlan = "write" | "skip" | "drift" | "remove" | "unmanage" | "none";

/**
 * What to do about the user CLAUDE.md, from hashes alone. Drift is a machine
 * edit cawco did not make: managed hash exists, the file no longer matches
 * it — never overwritten without `force`, reported instead.
 */
function memoryPlan(
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

/** A file CawCo wrote that a status read finds gone (`null` hash), or changed. */
/**
 * A ready harness config row as a status read finds it: applied while the
 * file it loads from is there (an OpenCode plugin's module, a pi
 * extension's file or package dir, fleet-harness-config.ts), failed as
 * absent once it is gone. Claude Code settings live in the set itself.
 */
const harnessConfigHeld = async (
  row: SetHarnessConfig
): Promise<FleetItemState> =>
  row.entry === undefined || (await stat(row.entry).catch(() => undefined))
    ? { state: "applied" }
    : {
        state: "failed",
        cause: "absent",
        detail: `${row.entry} is not on disk`,
      };

const absentOrDrifted = (
  fileHash: string | null,
  gone: string
): FleetItemState =>
  fileHash === null
    ? { state: "failed", cause: "absent", detail: gone }
    : { state: "failed", cause: "drifted", detail: DRIFTED };

/** A harness's memory file as a status read finds it: still the `managed` hash cawco wrote, gone, or edited. */
export const memoryState = async (
  path: string,
  managed: string
): Promise<FleetItemState> => {
  const fileHash = await fileHashAt(path);
  return fileHash === managed
    ? { state: "applied" }
    : absentOrDrifted(fileHash, "not on disk");
};

/**
 * Applies the plan to the harness's memory file at `path` (Claude Code's
 * `~/.claude/CLAUDE.md`, another harness's own) and answers with the hash
 * cawco now manages, or nothing when it manages none. The file is only ever
 * deleted when it is still exactly what cawco wrote — an edited one outlives
 * the fleet's row, unmanaged.
 */
export const syncMemory = async (
  path: string,
  desired: FleetMemory | null | undefined,
  managed: string | undefined,
  report: { memory?: FleetItemState }
): Promise<string | undefined> => {
  const plan = memoryPlan(desired, await fileHashAt(path), managed);

  if (!desired) {
    if (plan === "remove") {
      await rm(path, { force: true });
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
    report.memory = { state: "failed", cause: "drifted", detail: DRIFTED };
    return managed;
  }
  if (plan === "skip") {
    report.memory = { state: "applied" };
    return managed;
  }

  try {
    await writeAtomic(path, desired.content);
    report.memory = { state: "applied" };
    return desired.hash;
  } catch (error) {
    // The machine keeps the hash it had, so the next sync writes again rather
    // than believing this one landed.
    report.memory = {
      state: "failed",
      cause: "unwritable",
      detail: tail(said(error)),
    };
    return managed;
  }
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
 * A fleet that keeps no memory arrives here as an empty `desired`: every
 * managed document is then given back, as the main file is.
 */
function memorySetPlan(
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
    report[doc.path] = { state: "failed", cause: "unknown", detail: problem };
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
        await rm(join(MEMORIES_DIR, path), { force: true });
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
      report[path] = { state: "failed", cause: "drifted", detail: DRIFTED };
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
      await writeAtomic(join(MEMORIES_DIR, path), doc.content);
      written[path] = doc.hash;
      report[path] = { state: "applied" };
    } catch (error) {
      // The machine keeps the hash it had, so the next sync writes again rather
      // than believing this one landed.
      if (managed[path] !== undefined) {
        written[path] = managed[path];
      }
      report[path] = {
        state: "failed",
        cause: "unwritable",
        detail: tail(said(error)),
      };
    }
  }
  if (removed) {
    await pruneEmptyDirs();
  }

  return written;
};

/**
 * The folders a placed document's removal emptied, from its own up to, not
 * including, `.claude/rules/cawco/`: that dir is a deny path of a delegate's
 * clone (core clone-denies.ts `cloneDenies`), bound read-only into a
 * Linux sandbox, and removed on the host it would leave the sandbox free to
 * make it again with documents of its own.
 */
const pruneEmptyPlaced = async (cwd: string, path: string): Promise<void> => {
  const root = placedMemoryDir(cwd);
  for (
    let dir = dirname(join(root, path));
    dir !== root && dirname(dir) !== dir;
    dir = dirname(dir)
  ) {
    // biome-ignore lint/suspicious/noEmptyBlockStatements: a folder still holding something stays
    await rmdir(dir).catch(() => {});
  }
};

/**
 * One placed copy of a project's memory document, written to its folder's
 * `.claude/rules/cawco/<path>` and kept out of the checkout's status, by the
 * rules a placed skill keeps: a file there cawco did not write is the
 * folder's own and stays, one edited since cawco wrote it is reported and
 * left, and nothing is written into a delegate workspace's deleted clone.
 * Answers the hash cawco now manages there, or nothing.
 */
const placeMemoryDoc = async (
  doc: FleetPlacedMemoryDoc,
  recorded: string | undefined,
  report: Record<string, FleetItemState>
): Promise<string | undefined> => {
  const key = placedKey({ name: doc.path, placeId: doc.placeId });
  const cwd = doc.cwd as string;
  const problem = memoryDocProblem(doc.path);
  if (problem) {
    report[key] = { state: "failed", cause: "unknown", detail: problem };
    return recorded;
  }
  const refused = await unplaceable(cwd);
  if (refused) {
    report[key] = refused;
    return recorded;
  }
  const file = join(placedMemoryDir(cwd), doc.path);
  const disk = await fileHashAt(file);
  if (disk === doc.hash) {
    report[key] = { state: "applied" };
    return doc.hash;
  }
  if (disk !== null && !recorded) {
    report[key] = {
      state: "failed",
      cause: "unknown",
      detail: `${file} is the folder's own; cawco leaves it as it is`,
    };
    return recorded;
  }
  if (disk !== null && disk !== recorded) {
    report[key] = {
      state: "failed",
      cause: "drifted",
      detail: `${file}: ${DRIFTED}`,
    };
    return recorded;
  }
  try {
    await writeAtomic(file, doc.content);
    await excludeFromCheckout(placedMemoryDir(cwd));
    report[key] = { state: "applied" };
    return doc.hash;
  } catch (error) {
    report[key] = {
      state: "failed",
      cause: "unwritable",
      detail: tail(said(error)),
    };
    return recorded;
  }
};

/**
 * A project's memory documents, placed at each of its checkouts and
 * workspace clones on this machine (`PlacedFleetConfig.placedMemory`), and
 * the copies cawco placed before and no longer does taken away, unless
 * edited since; a record of a file placed again under another key is only
 * forgotten. Reported under `<path>@<place id>`; answers what cawco now
 * manages.
 */
const syncPlacedMemory = async (
  desired: FleetPlacedMemoryDoc[],
  managed: Sidecar["placedMemory"],
  report: Record<string, FleetItemState>
): Promise<Sidecar["placedMemory"]> => {
  const placed: Sidecar["placedMemory"] = {};
  for (const doc of desired.filter((each) => each.cwd && each.placeId)) {
    const key = placedKey({ name: doc.path, placeId: doc.placeId });
    const hash = await placeMemoryDoc(doc, managed[key]?.hash, report);
    if (hash !== undefined) {
      placed[key] = { cwd: doc.cwd as string, name: doc.path, hash };
    }
  }
  const placedFiles = new Set(
    Object.values(placed).map(({ cwd, name }) =>
      join(placedMemoryDir(cwd), name)
    )
  );
  for (const [key, record] of Object.entries(managed)) {
    if (placed[key]) {
      continue;
    }
    const file = join(placedMemoryDir(record.cwd), record.name);
    if (placedFiles.has(file)) {
      continue;
    }
    const disk = await fileHashAt(file);
    const remove = async () => {
      await rm(file, { force: true });
      await pruneEmptyPlaced(record.cwd, record.name);
    };
    if (
      await takeBackPlaced(
        key,
        disk !== null && disk !== record.hash,
        remove,
        report
      )
    ) {
      placed[key] = record;
    }
  }
  return placed;
};

/** One entry of a hook, as `~/.claude/settings.json` writes them — a command
 * handler carries `command`; the other four handler types do not, so an entry
 * without one is matched on its own JSON instead (see {@link withoutHooks}). */
interface HookCommand {
  args?: string[];
  command?: string;
  type?: string;
}

/**
 * What one registered handler is known by: a shell-form command's line, an
 * exec-form one's words (CawCo's guard runs every fleet HTTP hook as `perl
 * <guard> --http <url>`, so the program alone names none of them apart), and
 * any other handler's own JSON.
 */
const entryKey = (hook: HookCommand): string => {
  if (hook.command === undefined) {
    return JSON.stringify(hook);
  }
  return hook.args?.length
    ? JSON.stringify([hook.command, ...hook.args])
    : hook.command;
};

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
function withoutHooks(
  entries: HookMatcher[],
  commands: string[]
): HookMatcher[] {
  const gone = new Set(commands);
  const isOurs = (hook: HookCommand): boolean => gone.has(entryKey(hook));
  return entries.flatMap((entry) => {
    const hooks = entry.hooks ?? [];
    const kept = hooks.filter((hook) => !isOurs(hook));
    if (kept.length === hooks.length) {
      return [entry];
    }
    return kept.length > 0 ? [{ ...entry, hooks: kept }] : [];
  });
}

/** Where a hook's own script lands: `~/.claude/cawco-hooks/<id>.sh`. */
const hookScriptPath = (id: string): string => join(HOOKS_DIR, `${id}.sh`);

/** How long one `bash -n` gets. Our choice: a parse of a hook script is
 * milliseconds, and one that hangs is not a script worth registering. */
const PARSE_TIMEOUT_MS = 5000;

const WHITESPACE = /\s+/u;

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
  const parsed = await readWithin(PARSE_TIMEOUT_MS, async (signal) => {
    const child = Bun.spawn([shell, "-n"], {
      env: toolEnv(),
      stdin: new TextEncoder().encode(script),
      stdout: "ignore",
      stderr: "pipe",
      signal,
    });
    const stderr = await new Response(child.stderr).text();
    const code = await child.exited;
    if (child.signalCode) {
      return `${shell} -n was ended by ${child.signalCode}`;
    }
    if (code === 0) {
      return;
    }
    return (
      stderr
        .split("\n")
        .find((line) => line.trim() !== "")
        ?.trim() ?? `${shell} -n exited ${code}`
    );
  });
  switch (parsed.kind) {
    case "answered":
      return parsed.value;
    case "unanswered":
      // Not known to parse: never registered on a parse nobody finished.
      return `${shell} -n did not answer within ${PARSE_TIMEOUT_MS / 1000}s`;
    default:
      unhandled("read", parsed);
  }
};

/**
 * A project's copy of a hook, placed at one of its folders here: it goes to
 * the folder's sessions through its place's file (fleet-place-set.ts),
 * never into a file of the folder. The fleet's own are registered in
 * `~/.claude/settings.json`.
 */
const placedHook = (hook: Pick<FleetHook, "scope" | "cwd">): boolean =>
  !!hook.scope && hook.scope !== "user" && !!hook.cwd;

/**
 * What an earlier build registered in a project's folder, its
 * `<cwd>/.claude/settings.json`, taken back out: the records with a folder
 * and no `placed` mark. Each file is read and written once; one that cannot
 * be read or written is said on the log and left as it is.
 */
const dropCheckoutHooks = async (
  managed: Record<string, ManagedHook>
): Promise<void> => {
  const byFile = new Map<string, ManagedHook[]>();
  for (const record of Object.values(managed)) {
    if (record.cwd && !record.placed) {
      const file = projectClaudeDir(record.cwd, "settings.json");
      byFile.set(file, [...(byFile.get(file) ?? []), record]);
    }
  }
  for (const [file, records] of byFile) {
    const stored = await readJson<Record<string, unknown>>(file);
    if (!stored) {
      continue;
    }
    const commands = records.map((record) => record.command);
    const hooks = Object.fromEntries(
      Object.entries(
        (stored.hooks as Record<string, HookMatcher[]> | undefined) ?? {}
      )
        .map(([event, entries]) => [event, withoutHooks(entries, commands)])
        .filter(([, entries]) => (entries as HookMatcher[]).length > 0)
    );
    const { hooks: _hooks, ...rest } = stored;
    const next = Object.keys(hooks).length > 0 ? { ...rest, hooks } : rest;
    if (JSON.stringify(next) === JSON.stringify(stored)) {
      continue;
    }
    await writeJson(file, next).catch((error: unknown) =>
      console.warn(
        `[fleet] the hooks an earlier build registered in ${file} were not taken out: ${said(error)}`
      )
    );
  }
};

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
 * remembers registering it as ({@link entryKey}). */
const identityOf = (handler: HookHandler): string =>
  entryKey(handler as HookCommand);

/** What {@link syncHooks} answers: what cawco now manages, the fleet's hooks for the harness set, and each place's for its file, by its folder. */
interface SyncedHooks {
  placed: Record<string, Record<string, SetHook>>;
  records: Record<string, ManagedHook>;
  set: Pick<FleetHarnessSet, "hooks">;
}

/**
 * What {@link settleHooks} made of the hooks it was given: each that runs
 * (`settled`), with the script it runs from and the hash cawco keeps for it,
 * and the records it kept as they were for each that does not.
 */
interface SettledHooks {
  hashes: Map<string, string>;
  /** The records kept for a hook this pass could not settle: it stays as it was. */
  kept: Record<string, ManagedHook>;
  scriptPaths: Map<string, string>;
  settled: FleetHook[];
}

/**
 * Each enabled hook of `desired` checked and its script written, the one
 * step every hook takes before it is handed to sessions: one that fails a
 * check, or whose script does not parse, is reported and keeps the record
 * it had; one whose script was edited on this machine stays drifted, not
 * overwritten unless `force`. The hooks dir is made first: a workspace's
 * boundary binds it read only as it starts (core `fleetSyncedPaths`), and a
 * dir that comes later is not in a boundary already running.
 */
const settleHooks = async (
  desired: readonly FleetHook[],
  managed: Record<string, ManagedHook>,
  report: Record<string, FleetItemState>
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: checks every enabled hook, then writes each one's script by its drift plan and parse check
): Promise<SettledHooks> => {
  await mkdir(HOOKS_DIR, { recursive: true });
  // The guard every fleet hook Claude Code runs goes through
  // (fleet-hook-guard.ts), written before anything names it.
  if ((await fileHashAt(hookGuardFile())) !== hashText(HOOK_GUARD_SOURCE)) {
    await writeAtomic(hookGuardFile(), HOOK_GUARD_SOURCE);
  }
  const kept: Record<string, ManagedHook> = {};
  const keep = (id: string): void => {
    if (managed[id]) {
      kept[id] = managed[id];
    }
  };

  // A disabled hook is simply not written — that is the whole of per-hook
  // disable, since Claude Code has no way to turn off one hook and keep the
  // rest of its matcher entry. It falls straight through to the removal pass
  // of a sync, same as a hook the fleet has stopped carrying at all.
  const wanted: FleetHook[] = [];
  for (const hook of desired) {
    if (!hook.enabled) {
      continue;
    }
    const problems = Object.values(hookProblem(hook));
    if (problems.length > 0) {
      keep(hook.id);
      report[hook.id] = {
        state: "failed",
        cause: "unknown",
        detail: problems[0],
      };
      continue;
    }
    if (hook.scope && hook.scope !== "user" && !hook.cwd) {
      keep(hook.id);
      report[hook.id] = {
        state: "failed",
        cause: "no-checkout",
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
    const onDisk = await fileHashAt(path);
    // A script that is gone was edited by nobody: it is written again, as
    // the hooks dir is made again (a hand edit is drift, kept as it is).
    const plan =
      onDisk === null
        ? "write"
        : memoryPlan(
            { hash: scriptHash, force: hook.force },
            onDisk,
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
      report[hook.id] = {
        state: "failed",
        cause: "unknown",
        detail: parseError,
      };
      continue;
    }
    if (plan === "drift") {
      report[hook.id] = { state: "failed", cause: "drifted", detail: DRIFTED };
      hashes.set(hook.id, managed[hook.id]?.hash ?? scriptHash);
      scriptPaths.set(hook.id, path);
      settled.push(hook);
      continue;
    }
    hashes.set(hook.id, scriptHash);
    if (plan === "write") {
      try {
        await writeAtomic(path, hook.script);
        // Claude Code spawns it directly, so it has to carry its own execute bit.
        await chmod(path, 0o755);
      } catch (error) {
        keep(hook.id);
        report[hook.id] = {
          state: "failed",
          cause: "unwritable",
          detail: tail(said(error)),
        };
        continue;
      }
    }
    scriptPaths.set(hook.id, path);
    settled.push(hook);
  }
  return { hashes, kept, scriptPaths, settled };
};

/** What a settled hook runs as a session takes it (fleet-harness-set.ts). */
const setHookOf = (hook: FleetHook, handler: HookHandler): SetHook => ({
  id: hook.id,
  name: hook.name,
  event: hook.event,
  handler,
  ...(hook.matcher ? { matcher: hook.matcher } : {}),
  test: hookMatchTest(hook.matcher, hook.event),
});

/**
 * A project's settled copy of a hook at one of its folders: its entry in
 * that place's file, which its sessions take, and the record cawco
 * keeps of it. Applied once its script is written, with what a workspace
 * session makes of a hook that could rewrite input (core
 * `hookWorkspaceNote`).
 */
const placedHookOf = (
  hook: FleetHook,
  settled: Pick<SettledHooks, "hashes" | "scriptPaths">,
  report: Record<string, FleetItemState>
): { entry: SetHook; record: ManagedHook } => {
  const script = settled.scriptPaths.get(hook.id);
  const handler = handlerFor(hook, script);
  const note = hookWorkspaceNote(hook);
  report[hook.id] ??= note
    ? { state: "applied", detail: note }
    : { state: "applied" };
  return {
    entry: setHookOf(hook, handler),
    record: {
      hash: settled.hashes.get(hook.id) ?? hook.hash,
      command: identityOf(handler),
      event: hook.event,
      scope: hook.scope ?? "project",
      cwd: hook.cwd as string,
      placed: true,
      ...(script ? { script } : {}),
      ...(note ? { note } : {}),
    },
  };
};

/**
 * Writes every enabled hook's script ({@link settleHooks}), registers each
 * of the fleet's own in `~/.claude/settings.json`, and answers every one as
 * the harness set holds it (fleet-harness-set.ts): the fleet's for OpenCode
 * and pi, a project's copies for every harness. It takes back out whatever
 * a disabled or deleted hook, or one that no longer passes validation, used
 * to have registered. The one row here that is executable: a hook that
 * reaches this function runs on a shell, unprompted, on every machine that
 * gets it, which is why it is checked again rather than trusted on the wire
 * — the hub already refused an invalid one at the door, but that is the
 * hub's process, not this one's guarantee.
 */
const syncHooks = async (
  desired: FleetHook[],
  managed: Record<string, ManagedHook>,
  report: Record<string, FleetItemState>
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: registers the fleet's own in the user settings, then removes what a disabled/deleted/invalid hook used to have
): Promise<SyncedHooks> => {
  const settledHooks = await settleHooks(desired, managed, report);
  const { hashes, scriptPaths, settled } = settledHooks;
  const written: Record<string, ManagedHook> = { ...settledHooks.kept };
  const keep = (id: string): void => {
    if (managed[id]) {
      written[id] = managed[id];
    }
  };

  // The script cawco wrote for a hook, which a later sync's drift check and
  // removal read; and the applied state, with what a workspace session makes
  // of a hook that could rewrite input (core `hookWorkspaceNote`).
  const scriptOf = (id: string): { script?: string } => {
    const path = scriptPaths.get(id);
    return path ? { script: path } : {};
  };
  const applied = (note: string | undefined): FleetItemState =>
    note ? { state: "applied", detail: note } : { state: "applied" };

  // Every settled hook as a session runs it: a project's copy goes to its
  // folder's sessions through its place's file alone, and is applied once
  // its script is written; the fleet's own is in the set for OpenCode and
  // pi, and registered in the user settings below for Claude Code.
  const set: SyncedHooks["set"] = { hooks: {} };
  const placed: SyncedHooks["placed"] = {};
  const fleetWide: FleetHook[] = [];
  for (const hook of settled) {
    if (!placedHook(hook)) {
      set.hooks[hook.id] = setHookOf(
        hook,
        handlerFor(hook, scriptPaths.get(hook.id))
      );
      fleetWide.push(hook);
      continue;
    }
    const { entry, record } = placedHookOf(hook, settledHooks, report);
    placed[record.cwd as string] = {
      ...placed[record.cwd as string],
      [hook.id]: entry,
    };
    written[hook.id] = record;
  }

  // Registration in the user settings — a hook whose row was disabled or
  // deleted still gets its old entry taken out of it.
  const stored = await readJson<Record<string, unknown>>(SETTINGS_PATH);
  // Nothing is written over a file that cannot be read: the rest of it is the
  // user's own permissions and plugins, and a rewrite from an empty root
  // would take them with it.
  if (stored === undefined && (await Bun.file(SETTINGS_PATH).exists())) {
    const detail = `could not parse ${SETTINGS_PATH}`;
    for (const hook of fleetWide) {
      keep(hook.id);
      report[hook.id] = { state: "failed", cause: "unparsable", detail };
    }
  } else {
    const root = stored ?? {};
    const settingsHooks = {
      ...((root.hooks as Record<string, unknown> | undefined) ?? {}),
    };

    // Everything cawco registered out of this file last time, whatever event
    // it ran on — a hook that moved to a different event still needs its old
    // row gone, not just left orphaned under the event it used to fire on.
    const registeredHere = Object.values(managed)
      .filter((record) => !record.cwd)
      .map((record) => record.command);

    const byEvent = new Map<HookEvent, FleetHook[]>();
    for (const hook of fleetWide) {
      byEvent.set(hook.event, [...(byEvent.get(hook.event) ?? []), hook]);
    }

    const events = new Set<HookEvent>([
      ...byEvent.keys(),
      ...(Object.keys(settingsHooks) as HookEvent[]),
    ]);
    for (const event of events) {
      const current = (settingsHooks[event] as HookMatcher[] | undefined) ?? [];
      const additions = (byEvent.get(event) ?? []).map((hook): HookMatcher => {
        // Through the guard, which drops an input rewrite in a workspace
        // session (fleet-hook-guard.ts).
        const handler = guardedHandler(
          handlerFor(hook, scriptPaths.get(hook.id)),
          false
        );
        const note = hookWorkspaceNote(hook);
        written[hook.id] = {
          hash: hashes.get(hook.id) ?? hook.hash,
          command: identityOf(handler),
          event: hook.event,
          scope: "user",
          ...scriptOf(hook.id),
          ...(note ? { note } : {}),
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

    let unwritable: string | undefined;
    if (JSON.stringify(settings) !== JSON.stringify(root)) {
      try {
        await writeJson(SETTINGS_PATH, settings);
      } catch (error) {
        unwritable = tail(said(error));
      }
    }
    for (const hook of fleetWide) {
      if (unwritable) {
        delete written[hook.id];
        keep(hook.id);
        report[hook.id] = {
          state: "failed",
          cause: "unwritable",
          detail: unwritable,
        };
      } else {
        // One reported failed or drifted above keeps that word.
        report[hook.id] ??= applied(written[hook.id]?.note);
      }
    }
  }

  await dropCheckoutHooks(managed);

  // A hook that is disabled, deleted, or failed validation this round and had
  // nothing kept alive for it above is one whose registration and script (if
  // cawco wrote one) are cawco's to take away. A script still at the user
  // layer's old path goes once the hook is registered at its new one.
  const stillHere = new Set(settled.map((hook) => hook.id));
  const scripts = new Set(
    Object.values(written).flatMap((one) => (one.script ? [one.script] : []))
  );
  const gone: string[] = [];
  for (const [id, record] of Object.entries(managed)) {
    const script = scriptPathOf(record);
    const kept = stillHere.has(id) || Boolean(written[id]);
    if (script && !(kept && scripts.has(script))) {
      gone.push(script);
    }
    if (!kept) {
      report[id] = { state: "removed" };
    }
  }
  // Each script is its own file: all removed at once.
  await Promise.all(gone.map((script) => rm(script, { force: true })));

  return { records: written, set, placed };
};

/** The placed skills cawco manages, as each place's file names them (fleet-place-set.ts): each skill's dir by its name, by the place's folder. */
const placeSkillsOf = (
  placed: Sidecar["placedSkills"]
): Record<string, Record<string, string>> => {
  const byPlace: Record<string, Record<string, string>> = {};
  for (const { cwd, name } of Object.values(placed)) {
    byPlace[cwd] = {
      ...byPlace[cwd],
      [name]: join(placedSkillsDir(cwd), name),
    };
  }
  return byPlace;
};

/** The harness config rows `ready` made, the fleet's own apart from each place's, by its folder. */
const configApart = (
  ready: Record<string, SetHarnessConfig>
): {
  own: Record<string, SetHarnessConfig>;
  placed: Record<string, Record<string, SetHarnessConfig>>;
} => {
  const own: Record<string, SetHarnessConfig> = {};
  const placed: Record<string, Record<string, SetHarnessConfig>> = {};
  for (const [key, row] of Object.entries(ready)) {
    if (row.cwd === undefined) {
      own[key] = row;
    } else {
      placed[row.cwd] = { ...placed[row.cwd], [key]: row };
    }
  }
  return { own, placed };
};

/**
 * A project's rows placed at the one folder `cwd` (fleet-place.ts `place`),
 * as a workspace's clone is cut there, by the steps a converge places each
 * copy with: each skill written into `.claude/skills/`, each memory
 * document into `.claude/rules/cawco/` ({@link placeSkill},
 * {@link placeMemoryDoc}), each hook's script written ({@link settleHooks})
 * and each Claude Code setting, OpenCode plugin and pi extension made ready
 * (fleet-harness-config.ts `readyHarnessRows`). The place's own file takes
 * what its sessions read (fleet-place-set.ts), and the sidecar the records
 * of what was written, for a later converge to take back; no file every
 * session reads moves. `mcpKeys`: the folder's MCP copies its file took
 * (session.ts `placeClone`), recorded as handed. Answers what each copy came to, under
 * `<key>@<place id>`.
 */
export const placeFolder = (
  cwd: string,
  copies: {
    harnessConfig: readonly FleetHarnessConfig[];
    hooks: readonly FleetHook[];
    memory: readonly FleetPlacedMemoryDoc[];
    skills: readonly FleetSkillPayload[];
  },
  mcpKeys: readonly string[]
): Promise<FleetSyncReport> =>
  inFleetQueue(async () => {
    const managed = await readSidecar();
    const report: FleetSyncReport = {
      mcp: {},
      marketplaces: {},
      plugins: {},
      skills: {},
      memoryDocs: {},
      hooks: {},
      harnessConfig: {},
      at: Date.now(),
    };
    const skillStates = report.skills as Record<string, FleetItemState>;
    const docStates = report.memoryDocs as Record<string, FleetItemState>;
    const hookStates = report.hooks as Record<string, FleetItemState>;
    const placedSkills: Sidecar["placedSkills"] = {};
    for (const skill of copies.skills) {
      const key = placedKey(skill);
      const hash = await placeSkill(
        skill,
        managed.placedSkills[key]?.hash,
        skillStates
      );
      if (hash !== undefined) {
        placedSkills[key] = { cwd, name: skill.name, hash };
      }
    }
    const placedMemory: Sidecar["placedMemory"] = {};
    for (const doc of copies.memory) {
      const key = placedKey({ name: doc.path, placeId: doc.placeId });
      const hash = await placeMemoryDoc(
        doc,
        managed.placedMemory[key]?.hash,
        docStates
      );
      if (hash !== undefined) {
        placedMemory[key] = { cwd, name: doc.path, hash };
      }
    }
    const settled = await settleHooks(copies.hooks, managed.hooks, hookStates);
    const placedHooks: Record<string, SetHook> = {};
    const records: Record<string, ManagedHook> = { ...settled.kept };
    for (const hook of settled.settled) {
      const { entry, record } = placedHookOf(hook, settled, hookStates);
      placedHooks[hook.id] = entry;
      records[hook.id] = record;
    }
    const harnessStates = report.harnessConfig as Record<
      string,
      FleetItemState
    >;
    const ready = await readyHarnessRows(copies.harnessConfig, harnessStates);
    await keepPlaceSet(cwd, {
      hooks: placedHooks,
      config: configApart(ready.set).placed[cwd] ?? {},
      skills: placeSkillsOf(placedSkills)[cwd] ?? {},
    });
    // Read again in the sidecar's turn: every record this did not place
    // (the denials, the fleet's own rows, other folders') stays as it is.
    await sidecarTurn(async () => {
      const now = await readSidecar();
      await writeJson(SIDECAR, {
        ...now,
        mcpServers: [...new Set([...now.mcpServers, ...mcpKeys])],
        hooks: { ...now.hooks, ...records },
        harnessConfigFailed: {
          ...now.harnessConfigFailed,
          ...Object.fromEntries(
            Object.entries(harnessStates).filter(
              ([, state]) => state.state === "failed"
            )
          ),
        },
        placedMemory: { ...now.placedMemory, ...placedMemory },
        placedSkills: { ...now.placedSkills, ...placedSkills },
      } satisfies Sidecar);
    });
    return { ...report, at: Date.now() };
  });

/** What one part's converge leaves in the sidecar: its fields, a field it no longer keeps as `undefined`. */
type SidecarFields = { [K in keyof Sidecar]?: Sidecar[K] | undefined };

/** What one part's converge wrote, for the sidecar and the harness set. */
interface PartWrote {
  /** Its field of each place's file, by the place's folder: a place it names nothing at takes it empty. */
  placed?: {
    field: "config" | "hooks" | "skills";
    byPlace: Record<string, Record<string, unknown>>;
  };
  set?: Partial<FleetHarnessSet>;
  sidecar: SidecarFields;
}

/**
 * One part of Claude Code's converge (fleet-parts.ts): what it writes,
 * which no other part does, and its converge, which reports each row it
 * reached into `report` and answers its fields of the sidecar and the
 * harness set.
 */
interface ConvergePart {
  run: (
    config: PlacedFleetConfig,
    managed: Sidecar,
    report: Required<
      Pick<
        FleetSyncReport,
        "mcp" | "skills" | "memoryDocs" | "hooks" | "harnessConfig"
      >
    > &
      FleetSyncReport
  ) => Promise<PartWrote>;
  writes: () => readonly string[];
}

/** Each part's converge, by the part (fleet-parts.ts `FleetPart`). */
const PARTS: Record<FleetPart, ConvergePart> = {
  mcp: {
    writes: () => [CLAUDE_JSON, ...accountClaudeJsons()],
    run: async (config, managed, report) => {
      const cleaned = await dropWrittenMcp(
        managed,
        config.mcp.map((row) => row.name)
      );
      return {
        sidecar: {
          mcpServers: await reportMcp(config, managed, report.mcp),
          // Kept until every file the fleet's servers were written into is clean.
          ...(cleaned ? { mcp: undefined, placedMcp: undefined } : {}),
        },
      };
    },
  },
  plugins: {
    writes: () => [PLUGINS_DIR, VENDOR_ROOT, SETTINGS_PATH],
    run: async (config, managed, report) => ({
      sidecar: await syncPlugins(config, managed, report),
    }),
  },
  skills: {
    writes: () => [SKILLS_DIR],
    run: async (config, managed, report) => ({
      sidecar: {
        skills: await syncSkillFiles(
          SKILLS_DIR,
          config.skills,
          managed.skills,
          report.skills
        ),
      },
    }),
  },
  placedSkills: {
    writes: () => [placedSkillsDir("<place>"), fleetPlacesDir()],
    run: async (config, managed, report) => {
      const placedSkills = await syncPlacedSkills(
        config.placedSkills,
        managed.placedSkills,
        report.skills
      );
      return {
        sidecar: { placedSkills },
        placed: { field: "skills", byPlace: placeSkillsOf(placedSkills) },
      };
    },
  },
  memory: {
    writes: () => [MEMORY_PATH],
    run: async (config, managed, report) => ({
      sidecar: {
        memory: await syncMemory(
          MEMORY_PATH,
          config.memory,
          managed.memory,
          report
        ),
      },
    }),
  },
  memoryDocs: {
    writes: () => [MEMORIES_DIR],
    // A fleet that keeps no memory links no documents either: the machine
    // gives back the ones cawco wrote it.
    run: async (config, managed, report) => ({
      sidecar: {
        memoryDocs: await syncMemoryDocs(
          config.memory?.docs ?? [],
          managed.memoryDocs,
          report.memoryDocs
        ),
      },
    }),
  },
  placedMemory: {
    writes: () => [placedMemoryDir("<place>")],
    run: async (config, managed, report) => ({
      sidecar: {
        placedMemory: await syncPlacedMemory(
          config.placedMemory,
          managed.placedMemory,
          report.memoryDocs
        ),
      },
    }),
  },
  hooks: {
    writes: () => [
      HOOKS_DIR,
      SETTINGS_PATH,
      fleetHarnessSetFile(),
      fleetPlacesDir(),
    ],
    run: async (config, managed, report) => {
      const hooks = await syncHooks(config.hooks, managed.hooks, report.hooks);
      return {
        sidecar: { hooks: hooks.records },
        set: hooks.set,
        placed: { field: "hooks", byPlace: hooks.placed },
      };
    },
  },
  harnessConfig: {
    writes: () => [fleetPlacedDir(), fleetHarnessSetFile(), fleetPlacesDir()],
    run: async (config, _managed, report) => {
      const ready = await syncHarnessConfig(
        config.harnessConfig,
        report.harnessConfig
      );
      return {
        sidecar: {
          harnessConfigFailed: Object.fromEntries(
            Object.entries(report.harnessConfig).filter(
              ([, state]) => state.state === "failed"
            )
          ),
        },
        set: { config: configApart(ready).own },
        placed: { field: "config", byPlace: configApart(ready).placed },
      };
    },
  },
};

/** The parts whose writes put a new entry in `~/.claude`, which each account's dir links to. */
const USER_LAYER_PARTS: readonly FleetPart[] = [
  "plugins",
  "skills",
  "memory",
  "memoryDocs",
  "hooks",
];

/**
 * The parts `parts` of the fleet's config converged onto Claude Code's
 * files, each by its own converge ({@link PARTS}), in the order
 * {@link FLEET_PARTS} names them; every other part is left as the last
 * converge of it wrote it. The sidecar and the harness set take each part's
 * fields, every other field as it stands. Answers the report of those parts
 * alone: a section of a part that did not run is empty, and the caller lays
 * the parts that ran over its last report.
 */
const converge = async (
  config: PlacedFleetConfig,
  parts: ReadonlySet<FleetPart>
): Promise<FleetSyncReport> => {
  const managed = await readSidecar();
  const report = {
    mcp: {},
    marketplaces: {},
    plugins: {},
    skills: {},
    memoryDocs: {},
    hooks: {},
    harnessConfig: {},
    at: Date.now(),
  } satisfies FleetSyncReport;
  const sidecar: SidecarFields = {};
  const set: Partial<FleetHarnessSet> = {};
  const placeFields = new Map<string, Partial<Omit<FleetPlaceSet, "cwd">>>();
  const ran = FLEET_PARTS.filter((one) => parts.has(one));
  for (const part of ran) {
    const wrote = await PARTS[part].run(config, managed, report);
    Object.assign(sidecar, wrote.sidecar);
    Object.assign(set, wrote.set);
    if (wrote.placed) {
      const { field, byPlace } = wrote.placed;
      for (const cwd of config.places) {
        placeFields.set(cwd, {
          ...placeFields.get(cwd),
          [field]: byPlace[cwd] ?? {},
        });
      }
    }
  }
  console.info(
    `[fleet] Claude Code: ${ran.join(", ")} converged, into ${[...new Set(ran.flatMap((part) => PARTS[part].writes()))].join(", ")}`
  );
  // What every CawCo session on this machine takes as it starts, written
  // after the files it names (fleet-harness-set.ts): each part's entries,
  // the rest as the set holds them.
  if (Object.keys(set).length > 0) {
    await writeFleetHarnessSet({ ...(await readFleetHarnessSet()), ...set });
  }
  // Each place's own entries into its own file, every other field of it as
  // it stands (fleet-place-set.ts).
  await Promise.all(
    [...placeFields].map(([cwd, fields]) => keepPlaceSet(cwd, fields))
  );
  // The denials are the sync's own write, made as it arrived (denied-tools.ts
  // `applyFleetDenials`): kept as the sidecar holds them now, in the same
  // turn of its writes, so a newer sync's list is never written back over;
  // so is every field of a part that did not run.
  if (Object.keys(sidecar).length > 0) {
    await sidecarTurn(async () => {
      const [now, denials] = await Promise.all([
        readSidecar(),
        readFleetDenials(),
      ]);
      await writeJson(SIDECAR, {
        ...now,
        ...sidecar,
        ...(denials.kind === "known"
          ? { deniedTools: [...denials.denials.deniedTools] }
          : {}),
      } satisfies SidecarFields);
    });
  }
  // Every account's Claude Code reads its user layer from its own dir: the
  // entries `~/.claude` gained this sync are linked in there too.
  if (USER_LAYER_PARTS.some((part) => parts.has(part))) {
    await Promise.all(
      accountIds().map((account) =>
        linkUserLayer(account).catch((error: unknown) =>
          console.warn(`[fleet] account ${account}: ${said(error)}`)
        )
      )
    );
  }
  return { ...report, at: Date.now() };
};

/**
 * One sync at a time on a machine: two of them would race over `~/.claude.json`
 * and run the same `claude plugin install` twice. A second call waits for the
 * one in flight rather than being refused — the hub sends one on register and
 * one on every change, and those arrive together often enough.
 */
let queue: Promise<unknown> = Promise.resolve();

/**
 * Runs `work` in that queue: nothing else of cawco's writes a `.claude.json`
 * while it runs (the login move rewrites two of them).
 */
export const inFleetQueue = <T>(work: () => Promise<T>): Promise<T> => {
  const next = queue.then(work, work);
  // biome-ignore lint/suspicious/noEmptyBlockStatements: the caller already gets this rejection from `next`; the queue only needs to know the work finished, not how
  queue = next.catch(() => {});
  return next;
};

/**
 * Applies the parts `parts` of the fleet's desired state to this machine
 * ({@link converge}) and answers with what every entry of them came to.
 * Idempotent: a second sync with the same config writes the same file and
 * runs no CLI at all.
 */
export const syncFleetConfig = (
  config: PlacedFleetConfig,
  parts: ReadonlySet<FleetPart>
): Promise<FleetSyncReport> => inFleetQueue(() => converge(config, parts));

/**
 * Every `claude` on this machine with its version, read now: a probe, run on
 * the machine's health tick (session.ts `#healthTick`), never by a converge.
 */
export const probeToolchain = (): Promise<FleetToolchain> =>
  machineToolchain(true);

/**
 * One fleet hook as a status reads it: its script where cawco wrote one,
 * then its registration where sessions take it.
 */
const hookState = async (
  id: string,
  record: ManagedHook,
  settings: () => Promise<Record<string, unknown> | undefined>
): Promise<FleetItemState> => {
  const scriptPath = scriptPathOf(record);
  if (scriptPath?.startsWith(HOOKS_DIR)) {
    const scriptFile = Bun.file(scriptPath);
    if (!(await scriptFile.exists())) {
      return { state: "failed", cause: "absent", detail: "not on disk" };
    }
    const script = await scriptFile.text();
    const parseError = await scriptParseError(script);
    if (parseError) {
      return { state: "failed", cause: "unknown", detail: parseError };
    }
    if (hashText(script) !== record.hash) {
      return { state: "failed", cause: "drifted", detail: DRIFTED };
    }
  }
  // The last question for every hook: whether the entry cawco registered
  // is still where sessions take it — a project's copy in its place's
  // file, the fleet's own in the user settings. A script that was refused
  // registration is kept on disk, so a matching file is not enough.
  const applied: FleetItemState = record.note
    ? { state: "applied", detail: record.note }
    : { state: "applied" };
  if (record.placed && record.cwd) {
    const one = (await readPlaceSet(record.cwd))?.hooks[id];
    return one && identityOf(one.handler) === record.command
      ? applied
      : {
          state: "failed",
          cause: "absent",
          detail: `not in ${record.cwd}'s place file`,
        };
  }
  const stored = await settings();
  const entries =
    (stored?.hooks as Record<string, HookMatcher[]> | undefined)?.[
      record.event
    ] ?? [];
  const present = entries.some((entry) =>
    (entry.hooks ?? []).some((one) => entryKey(one) === record.command)
  );
  return present
    ? applied
    : { state: "failed", cause: "absent", detail: `not in ${SETTINGS_PATH}` };
};

/**
 * What the machine has of what cawco last put on it, without changing any of
 * it. The sidecar is the question — a server or a plugin nobody here manages is
 * not this report's business.
 */
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
    at: Date.now(),
  };

  // The set every session takes (fleet-mcp-set.ts), read by Claude Code;
  // a placed copy in a place's file is one each session there takes.
  const set = await readFleetMcpSet();
  const places = await placeSets();
  report.mcp = await readFleetMcpRuntime(set.servers);
  for (const key of placedMcpKeys(places)) {
    report.mcp[key] = { state: "applied" };
  }
  for (const name of managed.marketplaces) {
    report.marketplaces[name] = (await isLinked(name))
      ? { state: "applied" }
      : {
          state: "failed",
          cause: "absent",
          detail: `${name} is not in known_marketplaces.json`,
        };
  }
  for (const id of managed.plugins) {
    // A vendored plugin is installed out of cawco's own copy of its
    // marketplace, under that copy's name, and the upstream id is uninstalled.
    const installedAs =
      managed.vendoredPlugins?.[id] === undefined ? id : vendoredIdOf(id);
    report.plugins[id] = (await isInstalled(installedAs))
      ? { state: "applied" }
      : {
          state: "failed",
          cause: "absent",
          detail: "not in installed_plugins.json",
        };
  }
  hubOnlyStates(
    managed.hubOnlyMarketplaces,
    report.plugins,
    report.marketplaces
  );
  const heldNow = await heldSkills(SKILLS_DIR, Object.keys(managed.skills));
  const records = await skillRecords(SKILLS_DIR, managed.skills, heldNow);
  for (const [name, recorded] of Object.entries(records)) {
    // A status knows what cawco wrote, not what the fleet carries now, so an
    // edit is told apart from the record alone.
    const drift = skillDrift(heldNow[name], recorded, recorded);
    if (heldNow[name] === undefined) {
      skills[name] = {
        state: "failed",
        cause: "absent",
        detail: "not on disk",
      };
    } else if (drift) {
      skills[name] = { state: "failed", cause: "drifted", detail: drift };
    } else {
      skills[name] = { state: "applied" };
    }
  }
  // Each record is read on its own, all at once; the results land in the
  // records' order.
  const placedSkills = await Promise.all(
    Object.entries(managed.placedSkills).map(
      async ([key, record]): Promise<[string, FleetItemState]> => {
        const dir = join(placedSkillsDir(record.cwd), record.name);
        const disk = await heldHash(dir);
        if (disk === undefined) {
          return [
            key,
            {
              state: "failed",
              cause: "absent",
              detail: `${dir} is not on disk`,
            },
          ];
        }
        return [
          key,
          disk === record.hash
            ? { state: "applied" }
            : {
                state: "failed",
                cause: "drifted",
                detail: `${dir}: ${DRIFTED}`,
              },
        ];
      }
    )
  );
  for (const [key, state] of placedSkills) {
    skills[key] = state;
  }
  if (managed.memory !== undefined) {
    report.memory = await memoryState(MEMORY_PATH, managed.memory);
  }
  const docStates = await Promise.all([
    ...Object.entries(managed.memoryDocs).map(
      async ([path, hash]): Promise<[string, FleetItemState]> => {
        const fileHash = await fileHashAt(join(MEMORIES_DIR, path));
        return [
          path,
          fileHash === hash
            ? { state: "applied" }
            : absentOrDrifted(fileHash, "not on disk"),
        ];
      }
    ),
    ...Object.entries(managed.placedMemory).map(
      async ([key, record]): Promise<[string, FleetItemState]> => {
        const file = join(placedMemoryDir(record.cwd), record.name);
        const fileHash = await fileHashAt(file);
        return [
          key,
          fileHash === record.hash
            ? { state: "applied" }
            : absentOrDrifted(fileHash, `${file} is not on disk`),
        ];
      }
    ),
  ]);
  for (const [key, state] of docStates) {
    memoryDocs[key] = state;
  }
  // The fleet's settings, plugins and extensions: each row the last sync
  // made ready, which sessions load, applied while its file is on disk; each
  // it could not, failed in the sync's words.
  report.harnessConfig = {
    ...managed.harnessConfigFailed,
    ...Object.fromEntries(
      await Promise.all(
        [
          ...Object.entries((await readFleetHarnessSet()).config),
          ...places.flatMap((place) => Object.entries(place.config)),
        ].map(
          async ([key, row]) => [key, await harnessConfigHeld(row)] as const
        )
      )
    ),
  };
  // Read once, at the first fleet hook that asks.
  let readSettings: Promise<Record<string, unknown> | undefined> | undefined;
  const settings = (): Promise<Record<string, unknown> | undefined> => {
    readSettings ??= readJson<Record<string, unknown>>(SETTINGS_PATH);
    return readSettings;
  };
  const hookStates = await Promise.all(
    Object.entries(managed.hooks).map(
      async ([id, record]) =>
        [id, await hookState(id, record, settings)] as const
    )
  );
  for (const [id, state] of hookStates) {
    hooks[id] = state;
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
  // Each document is read on its own, all at once, kept in the listing's order.
  const docs: MachineMemoryDoc[] = await Promise.all(
    (await markdownUnder(MEMORIES_DIR)).map(async (path) => {
      const content = await Bun.file(join(MEMORIES_DIR, path)).text();
      return { path, content, hash: hashText(content) };
    })
  );
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
function mergeMcp(
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
        // CawCo wrote only the user scope, and only before sessions took the
        // fleet's servers through the SDK: what its cleanup has yet to take out.
        managed: scope === "user" && managed.includes(name),
        ...(nearer ? { shadowedBy: nearer.scope } : {}),
      });
    }
  }
  return found;
}

/** Where an installed plugin's skills live, by the name a session calls them. */
function pluginSkillRoots(
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
async function skillsIn(
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
    ? await skillsIn(projectClaudeDir(cwd, "skills"), "project")
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
      Record<string, { mcpServers?: Record<string, unknown> }> | undefined) ??
    {};
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

  const memoryHash = await fileHashAt(MEMORY_PATH);
  const memoryFile = Bun.file(MEMORY_PATH);
  // Each document is read on its own, all at once, kept in the listing's order.
  const docs: NonNullable<ConfigInspection["memory"]>["docs"] =
    await Promise.all(
      (await markdownUnder(MEMORIES_DIR)).map(async (path) => {
        const doc = Bun.file(join(MEMORIES_DIR, path));
        const hash = hashText(await doc.text());
        return {
          path,
          hash,
          bytes: doc.size,
          managed: managed.memoryDocs[path] === hash,
        };
      })
    );

  return {
    ...(cwd ? { cwd } : {}),
    mcp: mergeMcp(
      [
        { scope: "local", servers: local },
        { scope: "project", servers: project },
        { scope: "user", servers: mcpServersOf(root) },
      ],
      managed.mcp ?? []
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

/** Every file under a directory, relative to it. Symlinks are not followed. */
const filesUnder = async (root: string, prefix = ""): Promise<string[]> => {
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const paths: string[] = [];
  for (const entry of entries) {
    const relative = `${prefix}${entry.name}`;
    if (entry.isDirectory()) {
      paths.push(...(await filesUnder(join(root, entry.name), `${relative}/`)));
    } else if (entry.isFile()) {
      paths.push(relative);
    }
  }
  return paths;
};

/** A skill's file as its read found it on disk. */
interface SkillFileOnDisk {
  path: string;
  size: number;
}

/**
 * The files of a skill directory, read whole: every regular file under it
 * but CawCo's own list of what the fleet carried ({@link CARRIED}) and the
 * directories no skill keeps files in (core `SKILL_SKIPPED_DIRS`). A symlink
 * is never followed, so nothing outside the directory is read. A read past
 * core's `SKILL_FOLDER_LIMIT_FILES` or `SKILL_FOLDER_LIMIT_BYTES` is refused,
 * said in megabytes and files, before any file is read.
 */
const skillFilesAt = async (dir: string): Promise<SkillFile[]> => {
  const found: SkillFileOnDisk[] = [];
  let bytes = 0;
  const walk = async (at: string, prefix: string): Promise<void> => {
    for (const entry of await readdir(at, { withFileTypes: true })) {
      const relative = `${prefix}${entry.name}`;
      if (entry.isDirectory()) {
        if (!SKILL_SKIPPED_DIRS.includes(entry.name)) {
          await walk(join(at, entry.name), `${relative}/`);
        }
        continue;
      }
      if (!entry.isFile() || relative === CARRIED) {
        continue;
      }
      const { size } = await stat(join(at, entry.name));
      bytes += size;
      found.push({ path: relative, size });
      if (found.length > SKILL_FOLDER_LIMIT_FILES) {
        throw new Error(
          `${dir} holds more than ${SKILL_FOLDER_LIMIT_FILES} files; a skill folder carries at most that many`
        );
      }
      if (bytes > SKILL_FOLDER_LIMIT_BYTES) {
        throw new Error(
          `${dir} holds more than ${SKILL_FOLDER_LIMIT_BYTES / (1024 * 1024)} MB; a skill folder carries at most that`
        );
      }
    }
  };
  await walk(dir, "");
  return await Promise.all(
    found.map(async ({ path }) => {
      const at = join(dir, path);
      return {
        path,
        contentBase64: Buffer.from(await Bun.file(at).arrayBuffer()).toString(
          "base64"
        ),
        // biome-ignore lint/suspicious/noBitwiseOperators: the execute bits of a stat mode are a mask, and the mask is the question
        executable: ((await stat(at)).mode & 0o111) !== 0,
      };
    })
  );
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
  return await skillFilesAt(skill.path);
};

/**
 * The files of a skill folder anywhere on this machine, named by its
 * absolute path (`~/` is this machine's home), for an install from it (core
 * `READ_SKILL_FOLDER`). The folder must hold a SKILL.md of its own.
 */
export const readSkillFolder = async (path: string): Promise<SkillFile[]> => {
  const expanded = expandHome(path);
  if (!isAbsolute(expanded)) {
    throw new Error(`${path} is not an absolute path`);
  }
  const dir = await realpath(expanded).catch(() => {
    throw new Error(`${path} does not exist on this machine`);
  });
  if (!(await stat(dir)).isDirectory()) {
    throw new Error(`${path} is a file, not a skill folder`);
  }
  const skillMd = await lstat(join(dir, "SKILL.md")).catch(() => undefined);
  if (!skillMd?.isFile()) {
    throw new Error(`${path} holds no SKILL.md`);
  }
  return await skillFilesAt(dir);
};
