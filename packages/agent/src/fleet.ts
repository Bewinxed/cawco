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

import { lstat, readdir, realpath, rm, rmdir, stat } from "node:fs/promises";
import { delimiter, dirname, isAbsolute, join } from "node:path";
import { type Bounded, readWithin } from "@cawco/core/bounded";
import { TREE_STORE_DIR } from "@cawco/core/claude-dirs";
import {
  installedPluginsOf,
  knownMarketplacesOf,
  projectMcpOf,
} from "@cawco/core/claude-plugin-files";
import { hashFiles } from "@cawco/core/file-hash";
import type {
  CliInstall,
  ConfigInspection,
  DiscoveredMcp,
  DiscoveredSkill,
  FleetFaultCause,
  FleetHoldings,
  FleetItemState,
  FleetMcpConfig,
  FleetMemory,
  FleetMemoryDoc,
  FleetPlacedMemoryDoc,
  FleetPluginPayload,
  FleetSkillPayload,
  FleetSyncReport,
  FleetToolchain,
  MachineHookScript,
  MachineMemoryDoc,
  MachineMemorySet,
  PlacedFleetConfig,
  SkillFile,
} from "@cawco/core/fleet";
import {
  memoryDocProblem,
  NO_SKILL,
  SKILL_FOLDER_LIMIT_BYTES,
  SKILL_SKIPPED_DIRS,
  skillDescription,
} from "@cawco/core/fleet";
import type { FleetScope } from "@cawco/core/fleet-placement";
import { makeFolder } from "@cawco/core/folders";
import type { FleetHarnessConfig } from "@cawco/core/harness-config";
import { scriptParseError } from "@cawco/core/hook-script";
import type { FleetHook, HookEvent, HookHandler } from "@cawco/core/hooks";
import {
  hookMatchTest,
  hookProblem,
  hookWorkspaceNote,
} from "@cawco/core/hooks";
import {
  claudeHomeJson,
  claudeSkillsDir,
  fleetPluginsDir,
  placedMemoryDir,
  placedSkillsDir,
  projectClaudeDir,
  treeStoreOf,
  userLayerPath,
  userLayerSkillsDir,
  VENDOR_MARKETPLACES_DIR,
} from "@cawco/core/paths/claude";
import {
  claudeFleetSidecarFile,
  fleetHarnessSetFile,
  fleetHooksDir,
  fleetMemoriesDir,
  fleetMemoryFile,
  fleetPlacedDir,
  fleetPlacesDir,
} from "@cawco/core/paths/fleet";
import { writeStateFile } from "@cawco/core/state-file";
import { FleetMcpConfigSchema } from "@cawco/core/stored-shapes";
import { unhandled } from "@cawco/core/unhandled";
import { versionSaid } from "@cawco/core/version-said";
import { lastLines } from "@cawco/core/words/helpers";
import { hookDriftUnparsed, hookUpdateKept } from "@cawco/core/words/hooks";
import { toolWords } from "@cawco/core/words/tools";
import { z } from "zod";
import { accountClaudeJsons, dropDanglingUserLayerLinks } from "./accounts";
import { claudeExecutable } from "./auth";
import { excludeFromCheckout } from "./checkout-exclude";
import {
  readSettingsFile,
  settingsOf,
  type WritableSettings,
  writeSettingsFile,
} from "./claude-settings-file";
import { ClaudeRefused, claudeToStart } from "./claude-version";
import { readFleetDenials, sidecarTurn } from "./denied-tools";
import { readyHarnessRows, syncHarnessConfig } from "./fleet-harness-config";
import {
  type FleetHarnessSet,
  readFleetHarnessSet,
  writeFleetHarnessSet,
} from "./fleet-harness-set";
import { HOOK_GUARD_SOURCE, hookGuardFile } from "./fleet-hook-guard";
import { apartSignedOut, readFleetMcpSet } from "./fleet-mcp-set";
import { FLEET_PARTS, type FleetPart } from "./fleet-parts";
import {
  type FleetPlaceSet,
  keepPlaceSet,
  placedMcpKeys,
  placeSets,
  readPlaceSet,
} from "./fleet-place-set";
import type { SetHarnessConfig, SetHook } from "./fleet-set-rows";
import { expandHome } from "./fs";
import { readJson, readOwnJson, UnreadJson, writeJson } from "./json-file";
import { readMcpRuntime, readSettledOnce } from "./mcp-status";
import { markdownUnder } from "./placed-memory";
import { noRepositoryAt } from "./stand-ins";
import { ClaudeFleetSidecarSchema } from "./stored-shapes";
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
const SIDECAR = claudeFleetSidecarFile();

/**
 * Where a plain skill's files land — one directory per skill, all of it
 * cawco's: the `.claude/skills` of the root every CawCo session takes as an
 * added directory (core `fleetClaudeRoot`).
 */
const SKILLS_DIR = claudeSkillsDir();

/** Where earlier versions wrote them: the person's own skills dir, cleaned once ({@link dropUserLayerWrites}). */
const USER_LAYER_SKILLS_DIR = userLayerSkillsDir();

/**
 * The fleet's plugins, written from the bytes the hub resolved: one dir per
 * fleet marketplace, `<root>/<marketplace>/plugins/<plugin>/`, each plugin
 * loaded into every CawCo session as a local plugin (claude.ts
 * `launchFleet`), installed and registered nowhere. All of it cawco's, like
 * a skill's directory, and never edited by anything else. One dir per
 * source marketplace because two plugins of one name may come from two.
 */
const VENDOR_ROOT = fleetPluginsDir();

/** Where it is written. */
const vendorDir = (marketplace: string): string =>
  join(VENDOR_ROOT, marketplace);

/**
 * Where earlier versions wrote the fleet's marketplaces, in the person's
 * user layer, each registered with Claude Code as `cawco-<marketplace>` and
 * its plugins installed at user scope from there: taken back out once
 * ({@link dropUserLayerWrites}).
 */
const USER_LAYER_VENDOR_ROOT = userLayerPath(VENDOR_MARKETPLACES_DIR);

/** What an earlier version registered the vendored copy of fleet marketplace `marketplace` as. */
const vendorName = (marketplace: string): string => `cawco-${marketplace}`;

/**
 * The fleet's main memory, which every CawCo session takes at its launch
 * (claude.ts `withInstructions`, opencode-session.ts `instructionEntries`,
 * pi-runtime.ts `loaderSources`): a file of CawCo's own (core
 * `fleetMemoryFile`), read by no harness of its own accord.
 */
const MEMORY_PATH = fleetMemoryFile();

/** Where earlier versions wrote it: the person's own `CLAUDE.md` in the user layer. */
const USER_LAYER_MEMORY_PATH = userLayerPath("CLAUDE.md");

/**
 * The documents the main memory links, one file per path the set names. All of
 * it cawco's, like a skill's directory — nothing under here was ever written
 * by anything else, so a file the set stops carrying is a file that goes.
 */
const MEMORIES_DIR = fleetMemoriesDir();

/** Where earlier versions wrote them: the person's own `memories` dir in the user layer. */
const USER_LAYER_MEMORIES_DIR = userLayerPath("memories");

/**
 * The person's own Claude Code settings, where earlier versions registered
 * the fleet's hooks: read only to take those entries back out
 * ({@link dropUserLayerWrites}).
 */
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

/**
 * The folders earlier versions made in the user layer for their own
 * writes, by path under it, each before the folder it is in: the
 * memory's linked documents (`memories`, which account linking made too,
 * accounts.ts `linkUserLayer`, before core `USER_LAYER_LEFT_DIRS`), the
 * hooks' scripts ({@link USER_LAYER_HOOKS_DIR}) and the tree store the
 * skills there linked into (`.cawco-trees/skills`). Each is taken away once its
 * contents are out ({@link dropUserLayerFolders}); one still holding
 * something holds what the person keeps, and stays.
 */
const USER_LAYER_FOLDERS = [
  "memories",
  "cawco-hooks",
  join(TREE_STORE_DIR, "skills"),
  TREE_STORE_DIR,
] as const;

const PLUGINS_DIR = userLayerPath("plugins");
/** The CLI's own account of what is linked and what is installed: the person's, read and never written. */
const KNOWN_MARKETPLACES = join(PLUGINS_DIR, "known_marketplaces.json");
const INSTALLED_PLUGINS = join(PLUGINS_DIR, "installed_plugins.json");

/** Where the local installer puts the CLI when it is not on any PATH. */
const LOCAL_CLAUDE = userLayerPath("local", "claude");

/** How long one `claude plugin …` gets: a first clone of a marketplace is slow. */
const CLI_TIMEOUT_MS = 120_000;

/** The end of a command's output: enough to name what happened, not a wall of it. */
const TAIL_LINES = 4;

const tail = (output: string): string =>
  lastLines(output.trim().split("\n"), TAIL_LINES, "\n");

const said = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export interface ClaudeFleetSidecar {
  /**
   * The fleet marketplaces linked and plugins installed through the claude
   * CLI under their own names that an earlier version recorded
   * ({@link ClaudeFleetSidecar.marketplaces}, {@link ClaudeFleetSidecar.plugins}),
   * as Claude Code's own registries still hold them. Left in place: that
   * version recorded a link the person had made himself as well as its own
   * (`isLinked`, then the record), and the registries say nothing of who
   * made one, so none is provably CawCo's. A row of one says so
   * ({@link leftLinkWords}); each goes from here once the registry no
   * longer holds it.
   */
  cliLinksLeft?: CliLinks;
  /**
   * The fleet's denied-tools list, synced from `fleet_denied_tools`. None
   * before the machine's first sync: the machine has not heard the list,
   * and {@link readFleetDenials} says so.
   */
  deniedTools?: string[];
  /**
   * The names earlier versions wrote into the person's Claude Code settings
   * (`permissions.deny`) that are still to come out (denied-tools.ts
   * `dropWrittenDenials`), and only those; empty once they are out. Absent
   * on a sidecar an earlier version left, which kept no such record.
   */
  deniedWritten?: string[];
  /**
   * The harness config rows the last sync could not make ready, by their
   * report key (fleet-harness-config.ts `syncHarnessConfig`), each with its
   * words: a status read says them failed as the sync did, until a sync
   * makes them. The ready ones are the harness set's (fleet-harness-set.ts).
   */
  harnessConfigFailed: Record<string, FleetItemState>;
  /**
   * Hook id → what cawco last handed sessions for it. `command` is the
   * identity of its handler ({@link entryKey}), which a status compares
   * with the harness set's or the place's entry.
   */
  hooks: Record<string, ManagedHook>;
  /**
   * What versions before the fleet's plugins loaded at launch recorded
   * linking through the claude CLI, by fleet marketplace name: read only by
   * the fold ({@link foldUserLayer}), which moves it into
   * {@link cliLinksLeft}.
   */
  marketplaces?: string[];
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
  /** The hash cawco last wrote to the fleet's memory file ({@link MEMORY_PATH}); absent = unmanaged. */
  memory?: string;
  /**
   * Set path → the hash cawco last wrote there, under {@link MEMORIES_DIR}.
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
  /**
   * What those versions recorded installing at user scope through the
   * claude CLI, by fleet plugin id (`plugin@marketplace`): read only by the
   * fold, as {@link marketplaces} is.
   */
  plugins?: string[];
  /** Skill name → the hash of the files written, which is what makes a sync a no-op. */
  skills: Record<string, string>;
  /**
   * What earlier versions wrote into the person's own Claude Code config,
   * still to come out ({@link dropUserLayerWrites}); each field gone once it
   * has. Folded out of the records once ({@link foldUserLayer}).
   */
  userLayer?: UserLayerWritten;
  /**
   * Set once the folders earlier versions made in the user layer were put
   * on {@link userLayer}'s list ({@link UserLayerWritten.folders}): by the
   * fold itself, or on a sidecar a build folded before the list was kept.
   */
  userLayerFolders?: true;
  /**
   * Set once the records of what earlier versions wrote into the user layer
   * were folded into {@link userLayer}: from then on every record names
   * CawCo's own dirs.
   */
  userLayerMoved?: true;
  /**
   * Fleet plugin id (`plugin@marketplace`) → the hash of the files written
   * under {@link VENDOR_ROOT}, which sessions load: what makes a sync that
   * changes nothing rewrite nothing.
   */
  vendoredPlugins?: Record<string, string>;
}

/**
 * What earlier versions wrote into the person's own Claude Code config (the
 * user layer: its `CLAUDE.md`, `memories`, `skills`, `settings.json` and
 * plugin registries), by CawCo's own records of the writes, so that only
 * those are taken back out.
 */
interface UserLayerWritten {
  /**
   * Each folder earlier versions made in it ({@link USER_LAYER_FOLDERS}), by
   * its path under the user layer: taken away once nothing is in it.
   */
  folders?: string[];
  /** Each hook entry registered in its `settings.json`, by its identity ({@link entryKey}). */
  hooks?: string[];
  /** Each vendored marketplace registered with Claude Code, as `cawco-<marketplace>`. */
  marketplaces?: string[];
  /** The hash written to its `CLAUDE.md`. */
  memory?: string;
  /** Each document's hash written under its `memories`, by path. */
  memoryDocs?: Record<string, string>;
  /** Each plugin installed at user scope out of a vendored marketplace, by its installed id (`<plugin>@cawco-<marketplace>`). */
  plugins?: string[];
  /** Each skill's hash written under its `skills`, by name. */
  skills?: Record<string, string>;
}

/** Marketplace links and plugin installs in Claude Code's own registries, by marketplace name and plugin id. */
interface CliLinks {
  marketplaces: string[];
  plugins: string[];
}

/** What a row of a link or install an earlier version recorded says ({@link ClaudeFleetSidecar.cliLinksLeft}). */
const leftLinkWords = (what: string): string =>
  `an earlier CawCo linked or found ${what} through the claude CLI; it stays, since you may have made it yourself, and claude plugin can remove it`;

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
  /**
   * The failed state of the newer version this machine refused, while this
   * one keeps running ({@link SettledHooks.kept}): what a status reports for
   * it until a version installs.
   */
  refused?: FleetItemState;
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

/**
 * What cawco put here last time; unreadable is the same as never written,
 * and a machine that never synced manages nothing.
 */
const readSidecar = async (): Promise<ClaudeFleetSidecar> => {
  const stored = await readOwnJson(
    SIDECAR,
    (value) => ClaudeFleetSidecarSchema.partial().safeParse(value).data
  );
  const read: ClaudeFleetSidecar = {
    ...(stored?.mcp ? { mcp: stored.mcp } : {}),
    mcpServers: stored?.mcpServers ?? [],
    // Read back like every other record: without it each sync starts from an
    // empty one, so it rewrites every plugin and never removes one the fleet
    // dropped.
    vendoredPlugins: stored?.vendoredPlugins ?? {},
    skills: stored?.skills ?? {},
    ...(stored?.memory ? { memory: stored.memory } : {}),
    memoryDocs: stored?.memoryDocs ?? {},
    // None until the first sync: the machine has not heard the list.
    ...(stored?.deniedTools ? { deniedTools: stored.deniedTools } : {}),
    // Kept through every write of the sidecar: without it the next converge
    // reads the machine as an earlier version's again.
    ...(stored?.deniedWritten ? { deniedWritten: stored.deniedWritten } : {}),
    hooks: stored?.hooks ?? {},
    harnessConfigFailed: stored?.harnessConfigFailed ?? {},
    ...(stored?.placedMcp ? { placedMcp: stored.placedMcp } : {}),
    placedMemory: stored?.placedMemory ?? {},
    placedSkills: stored?.placedSkills ?? {},
    ...(stored?.userLayer ? { userLayer: stored.userLayer } : {}),
    ...(stored?.userLayerMoved ? { userLayerMoved: true as const } : {}),
    ...(stored?.userLayerFolders ? { userLayerFolders: true as const } : {}),
    ...(stored?.cliLinksLeft ? { cliLinksLeft: stored.cliLinksLeft } : {}),
  };
  if (!read.userLayerMoved) {
    return foldUserLayer(
      {
        ...read,
        // An earlier version's records of its CLI links, read before the
        // fold drops them: without them the links it made stay unnamed.
        marketplaces: stored?.marketplaces ?? [],
        plugins: stored?.plugins ?? [],
      },
      stored !== undefined
    );
  }
  return withFoldersListed(read);
};

/**
 * A sidecar folded by a build that kept no list of the folders earlier
 * versions made in the user layer, with them on it now, once: the next
 * converge takes away each that is empty.
 */
const withFoldersListed = (read: ClaudeFleetSidecar): ClaudeFleetSidecar =>
  read.userLayerFolders
    ? read
    : {
        ...read,
        userLayer: { ...read.userLayer, folders: [...USER_LAYER_FOLDERS] },
        userLayerFolders: true,
      };

/**
 * The sidecar as an earlier version left it, its records of what it wrote
 * into the user layer moved into {@link ClaudeFleetSidecar.userLayer}, and
 * every record after it naming CawCo's own dirs, empty: the converge of
 * every part a new build runs as the hub welcomes it (fleet-converged.ts
 * `basisMoved`) writes each item there afresh. A fleet-wide hook keeps its
 * record, marked as handed through the harness set, so its script is not
 * read as an edit; only its entry in the settings is to come out. The
 * plugins it installed and the marketplaces it registered out of its
 * vendored copies (`<plugin>@cawco-<marketplace>`, `cawco-<marketplace>`)
 * are CawCo's by their names and come out; the links and installs it
 * recorded under the fleet's own names are kept as
 * {@link ClaudeFleetSidecar.cliLinksLeft}, since it recorded the person's
 * own among them. When an earlier version left a sidecar (`earlierRan`),
 * the folders it made there go on the list too ({@link USER_LAYER_FOLDERS}).
 */
const foldUserLayer = (
  earlier: ClaudeFleetSidecar,
  earlierRan: boolean
): ClaudeFleetSidecar => {
  const plugins = Object.keys(earlier.vendoredPlugins ?? {});
  const registered = Object.entries(earlier.hooks).filter(
    ([, record]) => !(record.cwd || record.placed)
  );
  const userLayer: UserLayerWritten = {
    ...earlier.userLayer,
    ...(earlier.memory ? { memory: earlier.memory } : {}),
    memoryDocs: earlier.memoryDocs,
    skills: earlier.skills,
    hooks: registered.map(([, record]) => record.command),
    plugins: plugins.map(vendoredIdOf),
    marketplaces: [
      ...new Set(plugins.map((id) => vendorName(marketplaceOf(id)))),
    ],
    ...(earlierRan ? { folders: [...USER_LAYER_FOLDERS] } : {}),
  };
  const { marketplaces: _marketplaces, plugins: _plugins, ...kept } = earlier;
  const cliLinksLeft: CliLinks = {
    marketplaces: earlier.marketplaces ?? [],
    plugins: earlier.plugins ?? [],
  };
  return {
    ...kept,
    ...(cliLinksLeft.marketplaces.length + cliLinksLeft.plugins.length > 0
      ? { cliLinksLeft }
      : {}),
    memory: undefined,
    memoryDocs: {},
    skills: {},
    vendoredPlugins: {},
    hooks: {
      ...earlier.hooks,
      ...Object.fromEntries(
        registered.map(([id, record]) => [id, { ...record, placed: true }])
      ),
    },
    userLayer,
    userLayerMoved: true,
    userLayerFolders: true,
  };
};

/** `~/.claude.json`, as far as the fleet reads it: the user scope's servers and each folder's; every other key stays as it is. */
const ClaudeJsonSchema = z.looseObject({
  mcpServers: z.record(z.string(), z.unknown()).optional(),
  projects: z
    .record(
      z.string(),
      z.looseObject({
        mcpServers: z.record(z.string(), z.unknown()).optional(),
      })
    )
    .optional(),
});
type ClaudeJson = z.infer<typeof ClaudeJsonSchema>;

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
    return { ok: true, root: ClaudeJsonSchema.parse(await file.json()) };
  } catch (error) {
    return {
      ok: false,
      cause: "unparsable",
      detail: `could not parse ${path}: ${tail(said(error))}`,
    };
  }
};

const mcpServersOf = (root: ClaudeJson): Record<string, unknown> => ({
  ...root.mcpServers,
});

/** A placed copy's key in the sidecar and the report: `<name>@<place id>`. */
const placedKey = (row: { name: string; placeId?: string }): string =>
  `${row.name}@${row.placeId ?? ""}`;

/**
 * The fleet's servers taken back out of every `.claude.json` CawCo wrote
 * them into (`~/.claude.json` and each account's), once: sessions take them
 * through the SDK now (fleet-mcp-set.ts), and the person's own `claude`
 * loads only what he configured. Out go the names the sidecar says CawCo
 * wrote (`mcp`, the ones the agent's sidecar named before CawCo was renamed
 * among them: fleet-sidecar-move.ts folds them in as the agent starts), and
 * the fleet's own names now, whose entries a merge overwrote with the fleet's
 * whatever was there; and each placed copy from its folder's map
 * (`placedMcp`). Every other key of each file comes back out as it went in.
 * Answers whether every file was cleaned: one that could not be read or
 * written is tried again at the next sync.
 */
const dropWrittenMcp = async (
  managed: ClaudeFleetSidecar,
  fleetNames: readonly string[]
): Promise<boolean> => {
  if (!(managed.mcp || managed.placedMcp)) {
    return true;
  }
  const names = new Set([...(managed.mcp ?? []), ...fleetNames]);
  const placed = Object.values(managed.placedMcp ?? {});
  const results = await Promise.all(
    [CLAUDE_JSON, ...accountClaudeJsons()].map((path) =>
      dropWrittenMcpFrom(path, names, placed)
    )
  );
  return results.every(Boolean);
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
  const projects = { ...file.root.projects };
  const gone = [...names].filter((name) => name in servers);
  for (const name of gone) {
    delete servers[name];
  }
  for (const { cwd, name } of placed) {
    const map = projects[cwd]?.mcpServers;
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
        read.flatMap((name) => {
          const config = servers[name];
          return config ? [[name, config]] : [];
        })
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
  managed: ClaudeFleetSidecar,
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
      return versionSaid(`${out}${err}`);
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
  const claude = await claudeInstalls(await claudeExecutable());
  toolchainCache = claude.length > 0 ? { claude } : {};
  return toolchainCache;
};

interface Ran {
  /** Its exit status; null when a signal ended it or it did not answer in time. */
  code: number | null;
  /** The tail of what it said, which is what a failure's `detail` carries. */
  output: string;
  /** Everything it printed on stdout, for a command whose answer is its output. */
  stdout: string;
  /** It did not answer within {@link CLI_TIMEOUT_MS}, and was killed. */
  timedOut?: true;
}

/**
 * One `claude plugin …`, with the daemon's environment and the PATH it can
 * install into. Killed rather than left running if it hangs: a marketplace
 * behind a dead network would otherwise hold the whole sync open forever.
 */
const runClaude = async (
  bin: string,
  args: string[],
  cwd?: string
): Promise<Ran> => {
  const ran = await readWithin(CLI_TIMEOUT_MS, async (signal) => {
    const child = Bun.spawn([bin, ...args], {
      // A project or local scope is the project the command runs in.
      ...(cwd ? { cwd } : {}),
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
      return { code: null, output: `was ended by ${child.signalCode}`, stdout };
    }
    return {
      code,
      output: tail(stderr) || tail(stdout) || `exited ${code}`,
      stdout,
    };
  });
  switch (ran.kind) {
    case "answered":
      return ran.value;
    case "unanswered":
      return {
        code: null,
        output: `did not answer within ${CLI_TIMEOUT_MS / 1000}s`,
        stdout: "",
        timedOut: true,
      };
    default:
      unhandled("read", ran);
  }
};

/**
 * One install as `claude plugin list --json` reports it
 * (https://code.claude.com/docs/en/plugins/cli-reference#json-output).
 * `version` is "the version Claude Code computed at install". For a plugin
 * sessions load in place from its marketplace's folder (every vendored one: a
 * relative path in a marketplace added from a directory), `readFromFolder` is
 * that folder and `folderVersion` "the plugin's `version` as Claude Code
 * loaded it from that folder". On 2.1.311 that is the plugin.json's, or the
 * marketplace entry's when the plugin has no plugin.json, and absent when a
 * plugin.json declares none, whatever its entry says.
 * `installPath` is the cached copy, which a copied plugin loads from.
 */
const ListedPlugin = z.object({
  folderVersion: z.string().optional(),
  id: z.string(),
  installPath: z.string().optional(),
  projectPath: z.string().optional(),
  readFromFolder: z.string().optional(),
  scope: z.string(),
  version: z.string(),
});
type ListedPlugin = z.infer<typeof ListedPlugin>;

/**
 * Claude Code's own account of its installs, every scope, or the run that
 * would not give it: one `claude plugin list --json`.
 */
const listPlugins = async (
  bin: string
): Promise<
  { ok: true; plugins: ListedPlugin[] } | { ok: false; ran: Ran; why: string }
> => {
  const ran = await runClaude(bin, ["plugin", "list", "--json"]);
  if (ran.code !== 0) {
    return { ok: false, ran, why: ran.output };
  }
  try {
    return {
      ok: true,
      plugins: z.array(ListedPlugin).parse(JSON.parse(ran.stdout)),
    };
  } catch (error) {
    return {
      ok: false,
      ran,
      why: `its output is not the list: ${said(error)}`,
    };
  }
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

/** Why a plugin row has no files on this machine: the hub carried none for it. */
const uncarried = (hubError: string | undefined): string =>
  hubError
    ? `the hub could not carry it (${hubError})`
    : "the hub has not carried it to this machine yet";

/**
 * Each fleet marketplace's row on this machine. Nothing is linked for one:
 * the hub resolves its plugins and carries their files, so it is what its
 * plugins came to: working when none of them failed, failed naming each one
 * that did.
 */
const marketplaceStates = (
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
            cause: "missing-bytes",
            detail: missing
              .map(([id, item]) => `${id}: ${item.detail ?? "not carried"}`)
              .join("; "),
          };
  }
};

/** An install of a plugin the person made himself, as Claude Code's own registry records it: its scope, and the project a project or local one is for. */
interface OwnInstall {
  projectPath?: string;
  scope: string;
}

/**
 * The plugins the person installed himself, by plugin name, read from
 * Claude Code's own registry (`installed_plugins.json`) and never written:
 * a fleet plugin of one of these names is his to load, and a session
 * takes no second copy of it ({@link fleetPluginsAt}). What an earlier
 * version installed out of its vendored marketplaces (`legacy`, until its
 * cleanup has taken them out) is none of his. A registry there and unread
 * names none: sessions load the fleet's copy.
 */
const ownPluginInstalls = async (
  legacy: readonly string[]
): Promise<Map<string, OwnInstall[]>> => {
  const stored = await readJson(INSTALLED_PLUGINS, installedPluginsOf).catch(
    (error: unknown) => {
      if (!(error instanceof UnreadJson)) {
        throw error;
      }
      console.warn(`[fleet] ${error.message}; no own plugin install is read`);
    }
  );
  const own = new Map<string, OwnInstall[]>();
  for (const [id, entries] of Object.entries(stored?.plugins ?? {})) {
    if (legacy.includes(id)) {
      continue;
    }
    const name = pluginNameOf(id);
    own.set(name, [
      ...(own.get(name) ?? []),
      ...entries.map((entry) => ({
        scope: entry.scope ?? "user",
        ...(entry.projectPath ? { projectPath: entry.projectPath } : {}),
      })),
    ]);
  }
  return own;
};

/** Whether one of `installs` loads in a session in `cwd`: one at user scope, or one for a project `cwd` is in. */
const loadsIn = (installs: readonly OwnInstall[], cwd?: string): boolean =>
  installs.some(
    (install) =>
      install.scope === "user" ||
      (cwd !== undefined &&
        install.projectPath !== undefined &&
        (cwd === install.projectPath ||
          cwd.startsWith(`${install.projectPath}/`)))
  );

/**
 * The fleet's plugins a CawCo session in `cwd` loads, each as a local
 * plugin (claude.ts `launchFleet`): every one the last sync wrote and holds
 * ({@link ClaudeFleetSidecar.vendoredPlugins}), but one the person installed
 * himself under the same name where the session runs, which loads as his.
 * "Load plugins by providing their local file system paths in your options
 * configuration" (code.claude.com/docs/en/agent-sdk/plugins).
 */
export const fleetPluginsAt = async (cwd: string): Promise<string[]> => {
  const managed = await readSidecar();
  const own = await ownPluginInstalls(managed.userLayer?.plugins ?? []);
  return Object.keys(managed.vendoredPlugins ?? {}).flatMap((id) =>
    loadsIn(own.get(pluginNameOf(id)) ?? [], cwd)
      ? []
      : [join(vendorDir(marketplaceOf(id)), "plugins", pluginNameOf(id))]
  );
};

/**
 * The fleet's plugins on this machine: each enabled row the hub resolved,
 * its files written under {@link VENDOR_ROOT} (one this disk already holds
 * at its hash is not written again, so a converge for some other item
 * rewrites no plugin tree under its running hooks), which every CawCo
 * session loads as a local plugin ({@link fleetPluginsAt}); the tree of
 * every other plugin taken away. Nothing is installed, linked or registered
 * with Claude Code. A row the hub could not resolve to files has no way
 * here, and says so. A plugin the person installed himself at user scope is
 * his: sessions load his, and the row says so.
 */
const syncPlugins = async (
  config: PlacedFleetConfig,
  managed: ClaudeFleetSidecar,
  report: FleetSyncReport
): Promise<Pick<ClaudeFleetSidecar, "vendoredPlugins" | "cliLinksLeft">> => {
  const wanted = config.plugins.filter((plugin) => plugin.enabled);
  const left = await cliLinksStanding(managed.cliLinksLeft);
  const payloads = new Map(
    config.pluginPayloads.map((plugin) => [payloadId(plugin), plugin])
  );
  const carried = wanted.flatMap(({ id }) => {
    const plugin = payloads.get(id);
    return plugin ? [plugin] : [];
  });
  const before = await readVendoredPlugins();
  let unwritable: string | undefined;
  try {
    await writeVendoredMarketplaces(
      carried.map((plugin) =>
        before[payloadId(plugin)] === plugin.hash
          ? { ...plugin, files: undefined }
          : plugin
      )
    );
  } catch (error) {
    unwritable = tail(said(error));
  }
  const held = await readVendoredPlugins();
  const own = await ownPluginInstalls(managed.userLayer?.plugins ?? []);
  const written: Record<string, string> = {};
  for (const { id, error } of wanted) {
    const plugin = payloads.get(id);
    if (!plugin) {
      report.plugins[id] = {
        state: "failed",
        cause: "missing-bytes",
        detail: uncarried(error),
      };
    } else if (held[id] === plugin.hash) {
      written[id] = plugin.hash;
      report.plugins[id] = loadsIn(own.get(plugin.name) ?? [])
        ? {
            state: "applied",
            detail: `this machine's own install of ${plugin.name} is the one sessions load; CawCo loads no second copy`,
          }
        : { state: "applied" };
    } else {
      // Not on this disk after the write: its bytes did not land. The
      // report says so, and the item's Retry sends it again.
      report.plugins[id] = unwritable
        ? { state: "failed", cause: "unwritable", detail: unwritable }
        : {
            state: "failed",
            cause: "missing-bytes",
            detail: "the hub sent no files for this hash",
          };
    }
  }
  for (const id of Object.keys(managed.vendoredPlugins ?? {})) {
    if (!wanted.some((plugin) => plugin.id === id)) {
      report.plugins[id] = { state: "removed" };
    }
  }
  marketplaceStates(
    config.marketplaces.map(({ name }) => name),
    report.plugins,
    report.marketplaces
  );
  sayLeftLinks(left, report);
  return {
    vendoredPlugins: written,
    cliLinksLeft: left,
  };
};

/**
 * The links and installs an earlier version recorded
 * ({@link ClaudeFleetSidecar.cliLinksLeft}) that Claude Code's own
 * registries still hold. A registry there and unread keeps them all, to be
 * read again at the next sync. None when none stands.
 */
const cliLinksStanding = async (
  left: CliLinks | undefined
): Promise<CliLinks | undefined> => {
  if (!left) {
    return;
  }
  try {
    const installed = (await readJson(INSTALLED_PLUGINS, installedPluginsOf))
      ?.plugins;
    const linked = await readJson(KNOWN_MARKETPLACES, knownMarketplacesOf);
    const standing: CliLinks = {
      marketplaces: left.marketplaces.filter((name) =>
        Object.hasOwn(linked ?? {}, name)
      ),
      plugins: left.plugins.filter((id) => Object.hasOwn(installed ?? {}, id)),
    };
    return standing.marketplaces.length + standing.plugins.length > 0
      ? standing
      : undefined;
  } catch (error) {
    if (!(error instanceof UnreadJson)) {
      throw error;
    }
    console.warn(
      `[fleet] ${error.message}; the links an earlier version recorded are read again next sync`
    );
    return left;
  }
};

/** Each fleet row of a link or install an earlier version recorded, still applied, says it was left and why ({@link leftLinkWords}). */
const sayLeftLinks = (
  left: CliLinks | undefined,
  report: Pick<FleetSyncReport, "marketplaces" | "plugins">
): void => {
  for (const name of left?.marketplaces ?? []) {
    if (report.marketplaces[name]?.state === "applied") {
      report.marketplaces[name] = {
        state: "applied",
        detail: leftLinkWords(`the marketplace ${name}`),
      };
    }
  }
  for (const id of left?.plugins ?? []) {
    if (report.plugins[id]?.state === "applied") {
      report.plugins[id] = {
        state: "applied",
        detail: `${leftLinkWords(`the install of ${id}`)}. Sessions load that install, and no second copy`,
      };
    }
  }
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
 * holds at its hash comes without its bytes ({@link syncPlugins}), so a
 * rewrite of everything would erase it.
 *
 * Each plugin's tree is swapped in with one rename ({@link placeTree}):
 * sessions run its hooks from `plugins/<name>` while this writes, and the
 * list of the files the fleet carried goes with it.
 */
const writeVendoredMarketplace = async (
  marketplace: string,
  plugins: readonly FleetPluginPayload[]
): Promise<void> => {
  const into = vendorDir(marketplace);
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
    (): string[] => []
  );
  // Each removal is its own folder: all at once.
  await Promise.all(
    present
      .filter((name) => !wanted.has(name))
      .map((name) => removeTree(join(into, "plugins", name)))
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
    await writeVendoredMarketplace(marketplace, group);
  }
  // Each removal is its own folder: all at once.
  const present = await readdir(VENDOR_ROOT).catch((): string[] => []);
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
    (): string[] => []
  )) {
    const root = join(vendorDir(marketplace), "plugins");
    for (const name of await readdir(root).catch((): string[] => [])) {
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
 * wrote under {@link SKILLS_DIR}, and the plugins under {@link VENDOR_ROOT}.
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
 * Writes the skills whose files this machine does not have yet, and takes away
 * the ones the fleet no longer carries. No CLI is run and no settings are
 * touched: a plain skill is files, and the hash is the whole economy — an
 * unchanged skill costs one comparison however many megabytes it arrived with.
 */
export const syncSkillFiles = async (
  dir: string,
  desired: FleetSkillPayload[],
  sidecar: ClaudeFleetSidecar["skills"],
  report: Record<string, FleetItemState>
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: converge each skill while preserving ownership and reporting write and removal errors individually.
): Promise<ClaudeFleetSidecar["skills"]> => {
  const written: ClaudeFleetSidecar["skills"] = {};
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
  cwd: string,
  recorded: string | undefined,
  report: Record<string, FleetItemState>
): Promise<string | undefined> => {
  const key = placedKey(skill);
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
  managed: ClaudeFleetSidecar["placedSkills"],
  report: Record<string, FleetItemState>
): Promise<ClaudeFleetSidecar["placedSkills"]> => {
  const placed: ClaudeFleetSidecar["placedSkills"] = {};
  for (const skill of desired) {
    const { cwd } = skill;
    if (!(cwd && skill.placeId)) {
      continue;
    }
    const key = placedKey(skill);
    const hash = await placeSkill(skill, cwd, managed[key]?.hash, report);
    if (hash !== undefined) {
      placed[key] = { cwd, name: skill.name, hash };
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
 * Applies the plan to the memory file at `path` (the fleet's own,
 * {@link MEMORY_PATH}, or one an earlier version wrote into a harness's own
 * config, given back) and answers with the hash
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
    await writeStateFile(path, desired.content);
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
 * The directories under `root` a removal emptied, taken away bottom-up, and
 * `root` itself when it is CawCo's own (`root` is {@link MEMORIES_DIR}).
 * `rmdir` refuses a directory with anything in it, which is exactly the
 * check wanted: a folder still holding a document of somebody's own stays
 * where it is.
 */
const pruneEmptyDirs = async (root: string): Promise<void> => {
  const dirs = new Set<string>();
  const walk = async (dir: string, prefix: string): Promise<void> => {
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    // Sibling directories are independent reads; `dirs` is an unordered set.
    await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map(async (entry) => {
          dirs.add(`${prefix}${entry.name}`);
          await walk(join(dir, entry.name), `${prefix}${entry.name}/`);
        })
    );
  };
  await walk(root, "");

  // Deepest first, so a parent is only tried once its children are gone —
  // sequential on purpose: rmdir-ing a child before its now-empty parent is
  // attempted is the ordering this loop exists to guarantee.
  for (const relative of [...dirs].sort(
    (a, b) => b.split("/").length - a.split("/").length
  )) {
    // biome-ignore lint/suspicious/noEmptyBlockStatements: best effort — a directory that still holds something of the user's, or is already gone, is left alone
    await rmdir(join(root, relative)).catch(() => {});
  }
  if (root === MEMORIES_DIR) {
    // biome-ignore lint/suspicious/noEmptyBlockStatements: best effort — the root may be already gone
    await rmdir(root).catch(() => {});
  }
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
  report: Record<string, FleetItemState>,
  dir = MEMORIES_DIR
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
        onDisk[path] = await fileHashAt(join(dir, path));
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
        await rm(join(dir, path), { force: true });
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
      await writeStateFile(join(dir, path), doc.content);
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
    await pruneEmptyDirs(dir);
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
  cwd: string,
  recorded: string | undefined,
  report: Record<string, FleetItemState>
): Promise<string | undefined> => {
  const key = placedKey({ name: doc.path, placeId: doc.placeId });
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
    await writeStateFile(file, doc.content);
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
  managed: ClaudeFleetSidecar["placedMemory"],
  report: Record<string, FleetItemState>
): Promise<ClaudeFleetSidecar["placedMemory"]> => {
  const placed: ClaudeFleetSidecar["placedMemory"] = {};
  for (const doc of desired) {
    const { cwd } = doc;
    if (!(cwd && doc.placeId)) {
      continue;
    }
    const key = placedKey({ name: doc.path, placeId: doc.placeId });
    const hash = await placeMemoryDoc(doc, cwd, managed[key]?.hash, report);
    if (hash !== undefined) {
      placed[key] = { cwd, name: doc.path, hash };
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
const HookCommandSchema = z.looseObject({
  args: z.array(z.string()).optional(),
  command: z.string().optional(),
  type: z.string().optional(),
});
type HookCommand = z.infer<typeof HookCommandSchema>;

/**
 * What one registered handler is known by: a shell-form command's line, an
 * exec-form one's words (CawCo's guard runs every fleet HTTP hook as `perl
 * <guard> --http <url>`, so the program alone names none of them apart), and
 * any other handler's own JSON.
 */
const entryKey = (hook: {
  args?: string[];
  command?: string;
  type?: string;
}): string => {
  if (hook.command === undefined) {
    return JSON.stringify(hook);
  }
  return hook.args?.length
    ? JSON.stringify([hook.command, ...hook.args])
    : hook.command;
};

/** One matcher's worth of hooks; an absent `matcher` is every session start. */
const HookMatcherSchema = z.looseObject({
  hooks: z.array(HookCommandSchema).optional(),
  matcher: z.string().optional(),
});
type HookMatcher = z.infer<typeof HookMatcherSchema>;

/** `settings.json`, as far as the fleet reads it: the hooks it registered; every other key stays as it is. */
const SettingsJsonSchema = z.looseObject({
  hooks: z.record(z.string(), z.array(HookMatcherSchema)).optional(),
});
type SettingsJson = z.infer<typeof SettingsJsonSchema>;

/**
 * Whether `settings` is in the shape {@link SettingsJsonSchema} reads,
 * checked as it stands: the object itself is kept, so its keys keep the
 * order they were written in, which the compare before a write reads
 * (claude-settings-file.ts `writeSettingsFile`).
 */
const isSettingsJson = (
  settings: Record<string, unknown>
): settings is SettingsJson => SettingsJsonSchema.safeParse(settings).success;

/**
 * A Claude Code settings file as the fleet reads it: read
 * (claude-settings-file.ts; `{}` when nothing is there), its object as it
 * stands (so an unchanged one compares equal and is not written), or there
 * and unread with why, which is never written over. One whose hooks are not
 * the shape Claude Code writes is unread too: the fleet would rewrite them.
 */
type FleetSettings =
  | { state: "unread"; why: string }
  | { file: WritableSettings; settings: SettingsJson; state: "read" };

const readSettingsJson = async (path: string): Promise<FleetSettings> => {
  const file = await readSettingsFile(path);
  if (file.state === "unread") {
    return file;
  }
  const settings = settingsOf(file);
  if (isSettingsJson(settings)) {
    return { state: "read", file, settings };
  }
  const parsed = SettingsJsonSchema.safeParse(settings);
  return {
    state: "unread",
    why: `its hooks aren't the shape Claude Code writes (${parsed.error?.issues[0]?.message ?? "no reason given"})`,
  };
};

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

/**
 * A project's copy of a hook, placed at one of its folders here: it goes to
 * the folder's sessions through its place's file (fleet-place-set.ts),
 * never into a file of the folder. The fleet's own go to every session
 * through the harness set.
 */
const placedHook = (hook: Pick<FleetHook, "scope" | "cwd">): boolean =>
  !!hook.scope && hook.scope !== "user" && !!hook.cwd;

/**
 * What an earlier build registered in a project's folder, its
 * `<cwd>/.claude/settings.json`, taken back out: the records with a folder
 * and no `placed` mark. One file that cannot be read or written is said on
 * the log and left as it is.
 */
const dropCheckoutHooks = async (
  managed: Record<string, ManagedHook>
): Promise<void> => {
  const byFile = new Map<string, string[]>();
  for (const record of Object.values(managed)) {
    if (record.cwd && !record.placed) {
      const file = projectClaudeDir(record.cwd, "settings.json");
      byFile.set(file, [...(byFile.get(file) ?? []), record.command]);
    }
  }
  for (const [file, commands] of byFile) {
    const left = await dropHookEntries(file, commands);
    if (left) {
      console.warn(
        `[fleet] the hooks an earlier build registered in ${file} were not taken out: ${left}`
      );
    }
  }
};

/**
 * The hook entries `commands` names ({@link entryKey}) taken out of the
 * settings file `file`, every other key and entry as it stands: what cawco
 * registered there, and only that. Answers why nothing was taken out (a
 * file there that cannot be read, or written), or nothing when it was.
 */
const dropHookEntries = async (
  file: string,
  commands: readonly string[]
): Promise<string | undefined> => {
  const read = await readSettingsJson(file);
  if (read.state === "unread") {
    return toolWords.settingsLeft(
      toolWords.settingsSourceUnread(file, read.why)
    );
  }
  const stored = read.settings;
  const hooks = Object.fromEntries(
    Object.entries(stored.hooks ?? {})
      .map(([event, entries]) => [event, withoutHooks(entries, [...commands])])
      .filter(([, entries]) => entries.length > 0)
  );
  const { hooks: _hooks, ...rest } = stored;
  const next = Object.keys(hooks).length > 0 ? { ...rest, hooks } : rest;
  try {
    await writeSettingsFile(file, read.file, next);
  } catch (error) {
    return said(error);
  }
};

/**
 * What earlier versions wrote into the person's own Claude Code config,
 * taken back out by CawCo's own records of the writes
 * ({@link UserLayerWritten}), and nothing else: its `CLAUDE.md` and each
 * memory document and skill while it is still exactly what was written (one
 * he edited since is his, and stays), the hook entries registered in its
 * `settings.json`, and each plugin installed and marketplace registered out
 * of the vendored copies, through the CLI that installed them, with the
 * folder they were vendored into. Answers what is still to come out, for
 * the next converge to try again: a settings file that could not be read
 * or written, a CLI that could not run or left a record. Nothing when all
 * of it is out.
 */
const dropUserLayerWrites = async (
  written: UserLayerWritten
): Promise<UserLayerWritten | undefined> => {
  const left: UserLayerWritten = {};
  const unreported: Record<string, FleetItemState> = {};
  if (written.memory) {
    await syncMemory(USER_LAYER_MEMORY_PATH, null, written.memory, {}).catch(
      (error: unknown) => {
        console.warn(`[fleet] ${USER_LAYER_MEMORY_PATH}: ${said(error)}`);
        left.memory = written.memory;
      }
    );
  }
  if (written.memoryDocs && Object.keys(written.memoryDocs).length > 0) {
    await syncMemoryDocs(
      [],
      written.memoryDocs,
      unreported,
      USER_LAYER_MEMORIES_DIR
    );
  }
  if (written.skills && Object.keys(written.skills).length > 0) {
    const skills = await syncSkillFiles(
      USER_LAYER_SKILLS_DIR,
      [],
      written.skills,
      unreported
    );
    if (Object.keys(skills).length > 0) {
      left.skills = skills;
    }
  }
  if (written.hooks && written.hooks.length > 0) {
    const why = await dropHookEntries(SETTINGS_PATH, written.hooks);
    if (why) {
      console.warn(
        `[fleet] the fleet's hooks an earlier version registered in ${SETTINGS_PATH} stay for now: ${why}`
      );
      left.hooks = written.hooks;
    }
  }
  Object.assign(left, await dropVendoredInstalls(written));
  return Object.keys(left).length > 0 ? left : undefined;
};

/**
 * What is still to come out of the user layer (`rest`) once `folders` are
 * dropped ({@link dropUserLayerFolders}): the folders still to go on it,
 * and nothing when nothing is left.
 */
const withFoldersDropped = async (
  folders: readonly string[],
  rest: UserLayerWritten | undefined
): Promise<UserLayerWritten | undefined> => {
  const left = await dropUserLayerFolders(folders);
  const next = { ...rest, ...(left.length > 0 ? { folders: left } : {}) };
  return Object.keys(next).length > 0 ? next : undefined;
};

/**
 * Each of `folders` (paths under the user layer, {@link USER_LAYER_FOLDERS})
 * taken away while nothing is in it, in their order (each account dir's
 * link to one goes after, {@link dropDanglingUserLayerLinks}). `rmdir` refuses a folder with anything in it, which
 * is the check wanted: one that holds a document or a skill the person
 * kept is his, and stays, said once in the log. Answers each one an error
 * other than that left, for the next converge to try again.
 */
const dropUserLayerFolders = async (
  folders: readonly string[]
): Promise<string[]> => {
  const left: string[] = [];
  for (const folder of folders) {
    const path = userLayerPath(folder);
    const code = await rmdir(path).then(
      () => undefined,
      (error: NodeJS.ErrnoException) => error.code ?? said(error)
    );
    if (code === "ENOTEMPTY" || code === "EEXIST") {
      console.info(
        `[fleet] ${path} stays: an earlier version made it, and something it did not write is in it`
      );
    } else if (code !== undefined && code !== "ENOENT") {
      console.warn(`[fleet] ${path} stays for now: ${code}`);
      left.push(folder);
    }
  }
  return left;
};

/** The ids Claude Code's registry holds installed; unreadable is none. */
const installedIds = async (): Promise<Set<string>> =>
  new Set(
    Object.keys(
      (
        await readJson(INSTALLED_PLUGINS, installedPluginsOf).catch(
          () => undefined
        )
      )?.plugins ?? {}
    )
  );

/** The marketplace names Claude Code's registry holds; unreadable is none. */
const linkedNames = async (): Promise<Set<string>> =>
  new Set(
    Object.keys(
      (await readJson(KNOWN_MARKETPLACES, knownMarketplacesOf).catch(
        () => undefined
      )) ?? {}
    )
  );

/**
 * `claude <command(name)>` for each of `names` that `held` still holds,
 * one at a time, and what the CLI said for each it still holds after.
 */
const runWhileHeld = async (
  bin: string,
  names: readonly string[],
  held: () => Promise<Set<string>>,
  command: (name: string) => string[]
): Promise<void> => {
  for (const name of names) {
    if (!(await held()).has(name)) {
      continue;
    }
    const ran = await runClaude(bin, command(name));
    if ((await held()).has(name)) {
      console.warn(
        `[fleet] ${name} is still there after claude ${command(name).join(" ")}: ${ran.output}`
      );
    }
  }
};

/**
 * The plugins an earlier version installed at user scope out of its
 * vendored marketplaces, and those marketplaces' registrations, taken back
 * out through the CLI that made them (`claude plugin uninstall <id> --scope
 * user`, `claude plugin marketplace remove <name>`), then the folder they
 * were vendored into, which was all CawCo's. Answers each one still there,
 * the folder kept until none is.
 */
const dropVendoredInstalls = async (
  written: Pick<UserLayerWritten, "marketplaces" | "plugins">
): Promise<Pick<UserLayerWritten, "marketplaces" | "plugins">> => {
  const plugins = written.plugins ?? [];
  const marketplaces = written.marketplaces ?? [];
  if (plugins.length === 0 && marketplaces.length === 0) {
    await rm(USER_LAYER_VENDOR_ROOT, { recursive: true, force: true });
    return {};
  }
  let bin: string;
  try {
    bin = await claudeToStart();
  } catch (error) {
    if (!(error instanceof ClaudeRefused)) {
      throw error;
    }
    console.warn(
      `[fleet] the plugins an earlier version installed stay for now: ${error.message}`
    );
    return { plugins, marketplaces };
  }
  await runWhileHeld(bin, plugins, installedIds, (id) => [
    "plugin",
    "uninstall",
    id,
    "--scope",
    "user",
  ]);
  await runWhileHeld(bin, marketplaces, linkedNames, (name) => [
    "plugin",
    "marketplace",
    "remove",
    name,
  ]);
  // Read once every command has run: `marketplace remove` uninstalls each
  // plugin installed from the marketplace, so a plugin its own uninstall
  // left is out once its marketplace is removed.
  const [installedNow, linkedNow] = await Promise.all([
    installedIds(),
    linkedNames(),
  ]);
  const pluginsLeft = plugins.filter((id) => installedNow.has(id));
  const marketplacesLeft = marketplaces.filter((name) => linkedNow.has(name));
  if (pluginsLeft.length === 0 && marketplacesLeft.length === 0) {
    await rm(USER_LAYER_VENDOR_ROOT, { recursive: true, force: true });
    return {};
  }
  console.warn(
    `[fleet] what an earlier version installed stays for now: ${[...pluginsLeft, ...marketplacesLeft].join(", ")}`
  );
  return {
    ...(pluginsLeft.length > 0 ? { plugins: pluginsLeft } : {}),
    ...(marketplacesLeft.length > 0 ? { marketplaces: marketplacesLeft } : {}),
  };
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
const identityOf = (handler: HookHandler): string => entryKey(handler);

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
  /**
   * The records of the hooks this pass could not settle that had a version
   * installed before, by id. That version keeps running: its record, its
   * script on disk and its entry in the harness set or its place's file
   * all stay as they were, and its
   * report says the new version failed and why. A hook with no earlier
   * version is not here: nothing is installed for it.
   */
  kept: Record<string, ManagedHook>;
  scriptPaths: Map<string, string>;
  settled: FleetHook[];
  /**
   * The records of the hooks whose copy edited on this machine does not
   * parse, by id: the copy stays on disk to compare or adopt, its record
   * with it, and it is not registered, since a hook that cannot parse fails
   * every call it matches.
   */
  unregistered: Record<string, ManagedHook>;
}

/** A failed item state. */
type FailedState = Extract<FleetItemState, { state: "failed" }>;

/**
 * A hook update this machine could not install, against the record of the
 * version installed before it: that record kept, marked with the update's
 * failure ({@link ManagedHook.refused}), and the report that says the
 * update failed and the version before runs on. Without a version before,
 * the failure as it is, and nothing kept.
 */
const refusedUpdate = (
  before: ManagedHook | undefined,
  failed: FailedState
): { kept?: ManagedHook; state: FailedState } => {
  if (!before) {
    return { state: failed };
  }
  const state: FailedState = {
    ...failed,
    detail: hookUpdateKept(failed.detail ?? failed.cause),
  };
  return { kept: { ...before, refused: state }, state };
};

/**
 * Each enabled hook of `desired` checked and its script written, the one
 * step every hook takes before it is handed to sessions: one that fails a
 * check, or whose script does not parse, is reported and keeps the record
 * it had; one whose script was edited on this machine stays drifted, not
 * overwritten unless `force`. The hooks dir is made first: a workspace's boundary binds it read only as it starts
 * (core `fleetSyncedPaths`), and a dir that comes later is not in a
 * boundary already running.
 */
const settleHooks = async (
  desired: readonly FleetHook[],
  managed: Record<string, ManagedHook>,
  report: Record<string, FleetItemState>
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: checks every enabled hook, then writes each one's script by its drift plan and parse check
): Promise<SettledHooks> => {
  await makeFolder(HOOKS_DIR);
  // The guard every fleet hook Claude Code runs goes through
  // (fleet-hook-guard.ts), written before anything names it.
  if ((await fileHashAt(hookGuardFile())) !== hashText(HOOK_GUARD_SOURCE)) {
    await writeStateFile(hookGuardFile(), HOOK_GUARD_SOURCE);
  }
  // A hook this pass cannot settle: reported failed, and the version
  // installed before it, if any, kept running ({@link SettledHooks.kept}).
  const kept: Record<string, ManagedHook> = {};
  const unregistered: Record<string, ManagedHook> = {};
  const refuse = (id: string, failed: FailedState): void => {
    const refused = refusedUpdate(managed[id], failed);
    if (refused.kept) {
      kept[id] = refused.kept;
    }
    report[id] = refused.state;
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
      refuse(hook.id, {
        state: "failed",
        cause: "unknown",
        detail: problems[0],
      });
      continue;
    }
    if (hook.scope && hook.scope !== "user" && !hook.cwd) {
      refuse(hook.id, {
        state: "failed",
        cause: "no-checkout",
        detail: "bound to a project this machine has no checkout for",
      });
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
    // the fleet's script otherwise. One that does not parse is neither
    // written nor registered: the version installed before it, if any, keeps
    // its script, its record and its registration, so it keeps running
    // ({@link SettledHooks.kept}). A drifted copy that does not parse stays
    // on disk to be compared and adopted, unregistered
    // ({@link SettledHooks.unregistered}).
    const parseError = await scriptParseError(
      plan === "drift" ? await Bun.file(path).text() : hook.script,
      toolEnv()
    );
    if (parseError && plan === "drift") {
      const before = managed[hook.id];
      if (before) {
        unregistered[hook.id] = before;
      }
      report[hook.id] = {
        state: "failed",
        cause: "drifted",
        detail: hookDriftUnparsed(parseError.said),
      };
      continue;
    }
    if (parseError) {
      refuse(hook.id, {
        state: "failed",
        cause: "unknown",
        detail: parseError.said,
      });
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
        // Claude Code spawns it directly, so it has to carry its own execute
        // bit; set before the file takes the path, so a write that fails
        // leaves the version before it whole.
        await writeStateFile(path, hook.script, { mode: 0o755 });
      } catch (error) {
        refuse(hook.id, {
          state: "failed",
          cause: "unwritable",
          detail: tail(said(error)),
        });
        continue;
      }
    }
    scriptPaths.set(hook.id, path);
    settled.push(hook);
  }
  return { hashes, kept, scriptPaths, settled, unregistered };
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
 * A settled hook as sessions take it, and the record cawco keeps of it: the
 * fleet's own (no `cwd`), its entry in the harness set every session takes;
 * a project's copy at its folder `cwd`, its entry in that place's file,
 * which the folder's sessions take. Applied once its script is written,
 * with what a workspace session makes of a hook that could rewrite input
 * (core `hookWorkspaceNote`).
 */
const handedHookOf = (
  hook: FleetHook,
  cwd: string | undefined,
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
      ...(cwd ? { scope: hook.scope ?? "project", cwd } : { scope: "user" }),
      placed: true,
      ...(script ? { script } : {}),
      ...(note ? { note } : {}),
    },
  };
};

/**
 * The entries of the hooks whose new version failed, each keeping the
 * version handed out before it ({@link SettledHooks.kept}): its entry in the
 * harness set or its place's file, carried over as the last sync wrote it,
 * marked with the refusal.
 */
const keptEntries = async (
  kept: SettledHooks["kept"]
): Promise<Pick<SyncedHooks, "placed" | "set">> => {
  const set: SyncedHooks["set"] = { hooks: {} };
  const placed: SyncedHooks["placed"] = {};
  const previousSet = await readFleetHarnessSet();
  for (const [id, record] of Object.entries(kept)) {
    const entry = record.cwd
      ? (await readPlaceSet(record.cwd))?.hooks[id]
      : previousSet.hooks[id];
    if (!entry) {
      continue;
    }
    if (record.cwd) {
      placed[record.cwd] = {
        ...placed[record.cwd],
        [id]: { ...entry, refused: record.refused },
      };
    } else {
      set.hooks[id] = { ...entry, refused: record.refused };
    }
  }
  return { set, placed };
};

/**
 * Writes every enabled hook's script ({@link settleHooks}) and answers every
 * one as sessions take it: the fleet's own in the harness set
 * (fleet-harness-set.ts), a project's copies in each place's file, which
 * every harness's sessions read as they start (claude.ts `launchFleet`,
 * opencode-plugin.ts, pi-runtime.ts). No settings file the person's own
 * `claude` reads holds one. A hook whose new version fails a check keeps the
 * version handed out before it ({@link SettledHooks.kept}). The one row
 * here that is executable: a hook that reaches this function runs on a
 * shell, unprompted, on every machine that gets it, which is why it is
 * checked again rather than trusted on the wire — the hub already refused
 * an invalid one at the door, but that is the hub's process, not this one's
 * guarantee.
 */
const syncHooks = async (
  desired: FleetHook[],
  managed: Record<string, ManagedHook>,
  report: Record<string, FleetItemState>
): Promise<SyncedHooks> => {
  const settledHooks = await settleHooks(desired, managed, report);
  const { settled } = settledHooks;
  const written: Record<string, ManagedHook> = {
    ...settledHooks.unregistered,
    ...settledHooks.kept,
  };

  const { set, placed } = await keptEntries(settledHooks.kept);
  for (const hook of settled) {
    const { cwd } = hook;
    const at = placedHook(hook) ? cwd : undefined;
    const { entry, record } = handedHookOf(hook, at, settledHooks, report);
    written[hook.id] = record;
    if (at) {
      placed[at] = { ...placed[at], [hook.id]: entry };
    } else {
      set.hooks[hook.id] = entry;
    }
  }

  await dropCheckoutHooks(managed);

  // A hook that is disabled or deleted, or failed this round with no version
  // handed out before it, has nothing kept alive for it above: its script
  // (if cawco wrote one) is cawco's to take away. A script still at the user
  // layer's old path goes once the hook runs from its new one.
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
  placed: ClaudeFleetSidecar["placedSkills"]
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
 * (fleet-converger.ts `placeClone`), recorded as handed. Answers what each copy came to, under
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
    const skillStates: Record<string, FleetItemState> = {};
    const docStates: Record<string, FleetItemState> = {};
    const hookStates: Record<string, FleetItemState> = {};
    const harnessStates: Record<string, FleetItemState> = {};
    const report: FleetSyncReport = {
      mcp: {},
      marketplaces: {},
      plugins: {},
      skills: skillStates,
      memoryDocs: docStates,
      hooks: hookStates,
      harnessConfig: harnessStates,
      at: Date.now(),
    };
    const placedSkills: ClaudeFleetSidecar["placedSkills"] = {};
    for (const skill of copies.skills) {
      const key = placedKey(skill);
      const hash = await placeSkill(
        skill,
        cwd,
        managed.placedSkills[key]?.hash,
        skillStates
      );
      if (hash !== undefined) {
        placedSkills[key] = { cwd, name: skill.name, hash };
      }
    }
    const placedMemory: ClaudeFleetSidecar["placedMemory"] = {};
    for (const doc of copies.memory) {
      const key = placedKey({ name: doc.path, placeId: doc.placeId });
      const hash = await placeMemoryDoc(
        doc,
        cwd,
        managed.placedMemory[key]?.hash,
        docStates
      );
      if (hash !== undefined) {
        placedMemory[key] = { cwd, name: doc.path, hash };
      }
    }
    const settled = await settleHooks(copies.hooks, managed.hooks, hookStates);
    const placedHooks: Record<string, SetHook> = {};
    const records: Record<string, ManagedHook> = {
      ...settled.unregistered,
      ...settled.kept,
    };
    // A hook whose new version failed keeps its entry as the place's file
    // holds it ({@link SettledHooks.kept}).
    const before = (await readPlaceSet(cwd))?.hooks ?? {};
    for (const [id, record] of Object.entries(settled.kept)) {
      const entry = before[id];
      if (entry) {
        placedHooks[id] = { ...entry, refused: record.refused };
      }
    }
    for (const hook of settled.settled) {
      const { entry, record } = handedHookOf(hook, cwd, settled, hookStates);
      placedHooks[hook.id] = entry;
      records[hook.id] = record;
    }
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
      } satisfies ClaudeFleetSidecar);
    });
    return { ...report, at: Date.now() };
  });

/** What one part's converge leaves in the sidecar: its fields, a field it no longer keeps as `undefined`. */
type SidecarFields = {
  [K in keyof ClaudeFleetSidecar]?: ClaudeFleetSidecar[K] | undefined;
};

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
    managed: ClaudeFleetSidecar,
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
    writes: () => [VENDOR_ROOT],
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
    writes: () => [HOOKS_DIR, fleetHarnessSetFile(), fleetPlacesDir()],
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

/**
 * Each item of `report` that failed, as a log line names it: its section,
 * its key and why. An MCP server's is said by its cause alone: what its
 * runtime said can carry the values of its secrets, which are cut out only
 * where the machine's report is made (fleet-converger.ts).
 */
const failedItems = (report: FleetSyncReport): string[] => {
  const sections: Record<string, Record<string, FleetItemState>> = {
    mcp: report.mcp,
    marketplace: report.marketplaces,
    plugin: report.plugins,
    skill: report.skills ?? {},
    "memory document": report.memoryDocs ?? {},
    hook: report.hooks ?? {},
    "harness config": report.harnessConfig ?? {},
    memory: report.memory ? { "user layer": report.memory } : {},
  };
  return Object.entries(sections).flatMap(([section, items]) =>
    Object.entries(items).flatMap(([key, item]) => {
      if (item.state !== "failed") {
        return [];
      }
      const why = section === "mcp" ? item.cause : (item.detail ?? item.cause);
      return [`${section} ${key}: ${why}`];
    })
  );
};

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
  // What an earlier version wrote into the person's own config comes out
  // first, until it has (and only then is the record of it gone).
  if (managed.userLayer) {
    sidecar.userLayer = await dropUserLayerWrites(managed.userLayer);
  }
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
  // Then the folders those writes were in, once the parts have run too: a
  // hook's script leaves the user layer's old dir as the hooks part hands
  // it out from its new one.
  if (managed.userLayer?.folders) {
    sidecar.userLayer = await withFoldersDropped(
      managed.userLayer.folders,
      sidecar.userLayer
    );
  }
  // No account dir keeps a link CawCo made to what is no longer there: the
  // user layer's CLAUDE.md the cleanup took back, a folder above.
  for (const link of await dropDanglingUserLayerLinks()) {
    console.info(`[fleet] ${link} named nothing any more; taken away`);
  }
  const into = [...new Set(ran.flatMap((part) => PARTS[part].writes()))].join(
    ", "
  );
  const failed = failedItems(report);
  if (failed.length === 0) {
    console.info(
      `[fleet] Claude Code: ${ran.join(", ")} converged, into ${into}`
    );
  } else {
    console.warn(
      `[fleet] Claude Code: ${ran.join(", ")} ran, into ${into}; ${failed.length} failed: ${failed.join("; ")}`
    );
  }
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
  return { ...report, at: Date.now() };
};

/**
 * One sync at a time on a machine: two of them would race over the files
 * they write and the cleanups' CLI runs. A second call waits for the
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
 * changes nothing through the CLI; its plugins part reads one `claude plugin
 * list --json` when the fleet carries plugins.
 */
export const syncFleetConfig = (
  config: PlacedFleetConfig,
  parts: ReadonlySet<FleetPart>
): Promise<FleetSyncReport> => inFleetQueue(() => converge(config, parts));

/**
 * Every `claude` on this machine with its version, read now: a probe, run on
 * the machine's health tick (fleet-converger.ts `#healthTick`), never by a converge.
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
  set: FleetHarnessSet
): Promise<FleetItemState> => {
  const scriptPath = scriptPathOf(record);
  if (scriptPath?.startsWith(HOOKS_DIR)) {
    const scriptFile = Bun.file(scriptPath);
    if (!(await scriptFile.exists())) {
      return { state: "failed", cause: "absent", detail: "not on disk" };
    }
    const script = await scriptFile.text();
    const parseError = await scriptParseError(script, toolEnv());
    if (parseError) {
      return { state: "failed", cause: "unknown", detail: parseError.said };
    }
    if (hashText(script) !== record.hash) {
      return { state: "failed", cause: "drifted", detail: DRIFTED };
    }
  }
  // The last question for every hook: whether the entry cawco handed out
  // is still where sessions take it — a project's copy in its place's
  // file, the fleet's own in the harness set. A script that was refused
  // is kept on disk, so a matching file is not enough. A version kept
  // running past a refused update reports that update failed
  // ({@link ManagedHook.refused}).
  let applied: FleetItemState = record.note
    ? { state: "applied", detail: record.note }
    : { state: "applied" };
  if (record.refused) {
    applied = record.refused;
  }
  if (!record.placed) {
    return {
      state: "failed",
      cause: "absent",
      detail: "not handed to sessions yet; the next sync does",
    };
  }
  const one = record.cwd
    ? (await readPlaceSet(record.cwd))?.hooks[id]
    : set.hooks[id];
  return one && identityOf(one.handler) === record.command
    ? applied
    : {
        state: "failed",
        cause: "absent",
        detail: record.cwd
          ? `not in ${record.cwd}'s place file`
          : `not in ${fleetHarnessSetFile()}`,
      };
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
  // Each plugin as sessions load it: from where the last sync wrote it.
  const heldPlugins = await readVendoredPlugins();
  for (const [id, hash] of Object.entries(managed.vendoredPlugins ?? {})) {
    if (heldPlugins[id] === undefined) {
      report.plugins[id] = {
        state: "failed",
        cause: "absent",
        detail: "not on disk",
      };
    } else {
      report.plugins[id] =
        heldPlugins[id] === hash
          ? { state: "applied" }
          : { state: "failed", cause: "drifted", detail: DRIFTED };
    }
  }
  marketplaceStates(
    [...new Set(Object.keys(report.plugins).map(marketplaceOf))],
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
  const harnessSet = await readFleetHarnessSet();
  // The fleet's settings, plugins and extensions: each row the last sync
  // made ready, which sessions load, applied while its file is on disk; each
  // it could not, failed in the sync's words.
  report.harnessConfig = {
    ...managed.harnessConfigFailed,
    ...Object.fromEntries(
      await Promise.all(
        [
          ...Object.entries(harnessSet.config),
          ...places.flatMap((place) => Object.entries(place.config)),
        ].map(
          async ([key, row]) => [key, await harnessConfigHeld(row)] as const
        )
      )
    ),
  };
  const hookStates = await Promise.all(
    Object.entries(managed.hooks).map(
      async ([id, record]) =>
        [id, await hookState(id, record, harnessSet)] as const
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
 * This machine's own memory set, whoever wrote it: the fleet's copy CawCo
 * keeps here ({@link MEMORY_PATH} and every document beside it), what a
 * compare and an adoption of an edit read; and on a machine that holds
 * none yet, the person's own user-layer `CLAUDE.md` and its `memories`,
 * read and never written. A memory a machine has been collecting for a year
 * is where the fleet's first document comes from, and a machine somebody
 * split into a set by hand is where the rest of it does.
 */
export const readMemoryFile = async (): Promise<MachineMemorySet | null> =>
  (await memorySetAt(MEMORY_PATH, MEMORIES_DIR)) ??
  (await memorySetAt(USER_LAYER_MEMORY_PATH, USER_LAYER_MEMORIES_DIR));

/** The memory set at `main` and the documents under `docsDir`, or null when there is neither. */
const memorySetAt = async (
  main: string,
  docsDir: string
): Promise<MachineMemorySet | null> => {
  const file = Bun.file(main);
  // Each document is read on its own, all at once, kept in the listing's order.
  const docs: MachineMemoryDoc[] = await Promise.all(
    (await markdownUnder(docsDir)).map(async (path) => {
      const content = await Bun.file(join(docsDir, path)).text();
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
      const parsed = FleetMcpConfigSchema.safeParse(config);
      if (!parsed.success) {
        continue;
      }
      found.push({
        name,
        scope,
        config: parsed.data,
        // CawCo wrote only the user scope, and only before sessions took the
        // fleet's servers through the SDK: what its cleanup has yet to take out.
        managed: scope === "user" && managed.includes(name),
        ...(nearer ? { shadowedBy: nearer.scope } : {}),
      });
    }
  }
  return found;
}

/**
 * Where each installed plugin's skills live, by the name a session calls them:
 * the folder sessions load it from. That is `readFromFolder` for a plugin
 * loaded in place, whose cached copy (`installPath`) stays at the version it
 * was installed at, and `installPath` for a copied one. A plugin's skills
 * are a `skills/` directory inside it, which is what `/` lists as
 * `<plugin>:<skill>`. A skills-directory or session-only plugin's skills are
 * read where they are ({@link discoverSkills}), not here.
 */
function pluginSkillRoots(
  listed: readonly ListedPlugin[]
): { plugin: string; root: string }[] {
  const roots = new Map<string, string>();
  for (const plugin of listed) {
    const [name, source] = plugin.id.split("@");
    const loadsFrom = plugin.readFromFolder ?? plugin.installPath;
    if (source === "skills-dir" || source === "inline" || !loadsFrom) {
      continue;
    }
    roots.set(join(loadsFrom, "skills"), name);
  }
  return [...roots].map(([root, plugin]) => ({ plugin, root }));
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

/**
 * The installs Claude Code lists here, read once for an inspection. None when
 * it cannot be started or will not say, with the reason in the agent's log.
 */
const installedPlugins = async (): Promise<ListedPlugin[]> => {
  let bin: string;
  try {
    bin = await claudeToStart();
  } catch (error) {
    if (!(error instanceof ClaudeRefused)) {
      throw error;
    }
    console.warn(`[fleet] plugin skills not read: ${error.message}`);
    return [];
  }
  const listed = await listPlugins(bin);
  if (!listed.ok) {
    console.warn(`[fleet] claude plugin list --json: ${listed.why}`);
    return [];
  }
  return listed.plugins;
};

/** Every skill on this machine, in the order Claude Code would resolve them. */
const discoverSkills = async (
  cwd: string | undefined,
  managed: ClaudeFleetSidecar
): Promise<DiscoveredSkill[]> => {
  const plugins = await Promise.all([
    ...pluginSkillRoots(await installedPlugins()).map(({ plugin, root }) =>
      skillsIn(root, "plugin", `${plugin}:`)
    ),
    // The fleet's own, which sessions load from where the sync wrote them.
    ...Object.keys(managed.vendoredPlugins ?? {}).map((id) =>
      skillsIn(
        join(
          vendorDir(marketplaceOf(id)),
          "plugins",
          pluginNameOf(id),
          "skills"
        ),
        "plugin",
        `${pluginNameOf(id)}:`
      )
    ),
  ]);
  const project = cwd
    ? await skillsIn(projectClaudeDir(cwd, "skills"), "project")
    : [];
  const user = await skillsIn(USER_LAYER_SKILLS_DIR, "user");
  const fleet = await skillsIn(SKILLS_DIR, "user");
  return [
    ...project,
    ...user,
    ...fleet.map((skill) => ({
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

  const projects = root.projects ?? {};
  const local = cwd ? (projects[cwd]?.mcpServers ?? {}) : {};
  const project = cwd
    ? ((await readJson(join(cwd, ".mcp.json"), projectMcpOf))?.mcpServers ?? {})
    : {};

  const installed =
    (await readJson(INSTALLED_PLUGINS, installedPluginsOf)) ?? {};
  const linked =
    (await readJson(KNOWN_MARKETPLACES, knownMarketplacesOf)) ?? {};

  // The fleet's copy a session takes, or on a machine that holds none yet
  // the person's own in the user layer, as {@link readMemoryFile} reads.
  const fleetCopy = (await fileHashAt(MEMORY_PATH)) !== null;
  const memoryPath = fleetCopy ? MEMORY_PATH : USER_LAYER_MEMORY_PATH;
  const docsDir = fleetCopy ? MEMORIES_DIR : USER_LAYER_MEMORIES_DIR;
  const memoryHash = await fileHashAt(memoryPath);
  const memoryFile = Bun.file(memoryPath);
  // Each document is read on its own, all at once, kept in the listing's order.
  const docs: NonNullable<ConfigInspection["memory"]>["docs"] =
    await Promise.all(
      (await markdownUnder(docsDir)).map(async (path) => {
        const doc = Bun.file(join(docsDir, path));
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
    plugins: [
      ...Object.entries(installed.plugins ?? {})
        .filter(([, entries]) =>
          entries.some((entry) => entry.scope === "user")
        )
        .map(([id]) => id),
      ...Object.keys(managed.vendoredPlugins ?? {}),
    ],
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
 * core's `SKILL_FOLDER_LIMIT_BYTES` is refused,
 * said in megabytes, before any file is read.
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
    throw new Error(`${NO_SKILL}${name} on this machine`);
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
