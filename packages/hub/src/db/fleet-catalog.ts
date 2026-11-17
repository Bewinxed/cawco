/** The fleet's catalog: skills, plugins, marketplaces, agents, hooks, harness config and memory, and each one's history. */

import { hashFiles } from "@cawco/core/file-hash";
import {
  type FleetAgent,
  type FleetConfig,
  type FleetMarketplace,
  type FleetMcpServer,
  type FleetPlugin,
  type FleetRefresh,
  type FleetSkillMeta,
  type FleetVersioned,
  type MemoryScope,
  type MemoryVersion,
  placedOnly,
  type SkillFile,
  scoped,
} from "@cawco/core/fleet";
import type { FleetScope } from "@cawco/core/fleet-placement";
import type {
  FleetHarnessConfig,
  HarnessConfigKind,
} from "@cawco/core/harness-config";
import {
  type FleetHook,
  type HookEvent,
  type HookHandler,
  type HookVersion,
  hookEventNamed,
} from "@cawco/core/hooks";
import { fleetFilesWords } from "@cawco/core/words/fleet-files";
import { and, asc, desc, eq, isNull, notInArray, type SQL } from "drizzle-orm";
import type { AnySQLiteColumn, AnySQLiteTable } from "drizzle-orm/sqlite-core";
import { bundledSkills, starterSkills } from "../bundled-skills";
import { pluginVersion, skillName, skillVersion } from "../fleet-versions";
import type { DbCore } from "./core";
import { bindingOf, placementOf } from "./fleet-bindings";
import { listedPlatforms, runsOnOf } from "./mcp-servers";
import { SKILL_PLUGIN_VERSIONS } from "./migration-names";
import {
  dataMigrations,
  fleetAgents,
  fleetHarnessConfig,
  fleetHookHistory,
  fleetHooks,
  fleetMcpOauth,
  fleetMemory,
  fleetMemoryDocAreas,
  fleetMemoryDocProjects,
  fleetMemoryDocs,
  fleetMemoryDocTypes,
  fleetMemoryHistory,
  fleetSkillHistory,
  MEMORY_ID,
  marketplaces,
  mcpServers,
  memoryBriefings,
  pluginFiles,
  plugins,
  projects,
  skillFiles,
  skills,
  skillVersionFiles,
} from "./schema";
import type { Tx } from "./tx";

/** A line its machine said about a session, kept on its row ({@link DbShape.noteMachineLine}). */
/**
 * What a fetch of a skill or plugin came to (`lastRefresh`, null to clear
 * it) and what a read of its source found (`checked`): the content hash and
 * version it holds, or why it could not be read.
 */
export interface SourceNote {
  /** Null: the source is not read for updates (a loopback one): nothing read stands. */
  checked?: {
    at: number;
    hash?: string;
    version?: string;
    error?: string;
  } | null;
  lastRefresh?: FleetRefresh | null;
}

/**
 * One document the main memory links, as the dashboard reads it. Like a
 * subagent's file and unlike a skill's, the content rides the listing: a
 * document is a page of markdown, and an editor that has to fetch each one
 * again is a round trip for nothing.
 */
export interface MemoryDocRow {
  content: string;
  hash: string;
  path: string;
  /** The sessions it is loaded into; absent is a linked document under `~/.claude/memories/`. */
  scope?: MemoryScope;
  /** When it was last stored, ISO, as the answer carries it. */
  updatedAt: string;
}

/** A stored row as the hub answers it, its projects and types read off their link tables. */
const memoryDocRow = (
  row: typeof fleetMemoryDocs.$inferSelect,
  links: {
    areaIds: readonly string[];
    projectIds: readonly string[];
    typeNames: readonly string[];
  }
): MemoryDocRow => {
  const scope: MemoryScope = {
    ...(row.briefer ? { briefer: true as const } : {}),
    ...(row.role ? { role: row.role } : {}),
    ...(links.typeNames.length > 0
      ? { delegateTypes: [...links.typeNames].sort() }
      : {}),
    ...(row.model ? { model: row.model } : {}),
    ...(links.projectIds.length > 0
      ? { projectIds: [...links.projectIds].sort() }
      : {}),
    ...(links.areaIds.length > 0 ? { areaIds: [...links.areaIds].sort() } : {}),
  };
  return {
    path: row.path,
    content: row.content,
    hash: row.hash,
    ...(scoped(scope) ? { scope } : {}),
    updatedAt: row.updatedAt.toISOString(),
  };
};

/** One superseded version of one skill, as a listing reads it — without its files. */
export interface SkillVersion {
  bytes: number;
  /** When it was kept, ISO, as the answer carries it. */
  createdAt: string;
  hash: string;
  id: number;
  name: string;
  /** `fleet` for the hub's own row; `machine:<machineId>` for an edited copy an overwrite took off it. */
  source: string;
}

/** A superseded version in full: what restoring it would actually write back. */
export interface HookVersionMaterial {
  enabled: boolean;
  event: HookEvent;
  handler: HookHandler;
  matcher?: string;
  projectId?: string;
  scope?: FleetScope;
  script?: string;
}

/** A skill row as everything outside the hub reads it: its files are rows of their own. */
const skillMeta = (
  row: Omit<typeof skills.$inferSelect, "createdAt">
): FleetSkillMeta => ({
  name: row.name,
  source: row.source,
  ...bindingOf(row, "project"),
  ...fetched(row),
});

/** The columns a skill and a plugin row keep their last fetch in (core `FleetRefresh`). */
type RefreshColumns = Pick<
  typeof skills.$inferSelect,
  | "refreshAt"
  | "refreshOutcome"
  | "refreshError"
  | "refreshFromHash"
  | "refreshFromVersion"
  | "refreshToHash"
  | "refreshToVersion"
  | "refreshUnread"
>;

/** The columns a skill and a plugin row keep their {@link FleetVersioned} in. */
type VersionColumns = Pick<
  typeof skills.$inferSelect,
  | "hash"
  | "version"
  | "latestHash"
  | "latestVersion"
  | "checkedAt"
  | "checkError"
> &
  RefreshColumns;

/** A row's last fetch; none while it never had one, or while the one it kept does not read (`refresh_unread`). */
const lastRefreshOf = (row: RefreshColumns): FleetRefresh | undefined =>
  row.refreshAt && row.refreshOutcome
    ? {
        at: row.refreshAt.getTime(),
        outcome: row.refreshOutcome,
        ...(row.refreshError === null ? {} : { error: row.refreshError }),
        ...(row.refreshFromHash === null
          ? {}
          : { fromHash: row.refreshFromHash }),
        ...(row.refreshFromVersion === null
          ? {}
          : { fromVersion: row.refreshFromVersion }),
        ...(row.refreshToHash === null ? {} : { toHash: row.refreshToHash }),
        ...(row.refreshToVersion === null
          ? {}
          : { toVersion: row.refreshToVersion }),
      }
    : undefined;

/** The columns a last fetch is written to: none for null, which clears it and any kept as not read. */
const refreshColumns = (refresh: FleetRefresh | null): RefreshColumns => ({
  refreshAt: refresh ? new Date(refresh.at) : null,
  refreshOutcome: refresh?.outcome ?? null,
  refreshError: refresh?.error ?? null,
  refreshFromHash: refresh?.fromHash ?? null,
  refreshFromVersion: refresh?.fromVersion ?? null,
  refreshToHash: refresh?.toHash ?? null,
  refreshToVersion: refresh?.toVersion ?? null,
  refreshUnread: null,
});

/** A row's version, what its source held when last read, and its last fetch. */
const versioned = (row: VersionColumns): FleetVersioned => {
  const lastRefresh = lastRefreshOf(row);
  return {
    ...(row.version ? { version: row.version } : {}),
    ...(lastRefresh ? { lastRefresh } : {}),
    ...(row.latestHash ? { latestHash: row.latestHash } : {}),
    ...(row.latestVersion ? { latestVersion: row.latestVersion } : {}),
    ...(row.checkedAt ? { checkedAt: row.checkedAt.getTime() } : {}),
    ...(row.checkError ? { checkError: row.checkError } : {}),
    ...(row.hash && row.latestHash && row.latestHash !== row.hash
      ? { updateAvailable: true }
      : {}),
  };
};

/**
 * Why a row's fetch stands as it does: the last resolve's failure, else,
 * while the files it kept do not read (`files_unread`, hub migration 0423),
 * that no machine is sent them.
 */
const errorOf = (
  row: Pick<typeof skills.$inferSelect, "error" | "filesUnread">
): string | undefined =>
  row.error || (row.filesUnread === null ? undefined : fleetFilesWords.unread);

/** A skill's or a plugin's row as both read: whether it is on, its last fetch, and its versions. */
const fetched = (
  row: VersionColumns &
    Pick<
      typeof skills.$inferSelect,
      "enabled" | "bytes" | "error" | "filesUnread"
    >
): Pick<FleetPlugin, "enabled" | "hash" | "bytes" | "error"> &
  FleetVersioned => {
  const error = errorOf(row);
  return {
    enabled: row.enabled,
    ...(row.hash ? { hash: row.hash } : {}),
    ...(row.bytes === null ? {} : { bytes: row.bytes }),
    ...(error ? { error } : {}),
    ...versioned(row),
  };
};

/** A row nothing has fetched or checked yet. */
const noVersionColumns = {
  version: null,
  ...refreshColumns(null),
  latestHash: null,
  latestVersion: null,
  checkedAt: null,
  checkError: null,
} satisfies Omit<VersionColumns, "hash">;

/**
 * What a skill row keeps about its source (its last fetch, what the source
 * held when last read) when a write gives it `source`: what it had, when
 * that is the source it had; else nothing yet.
 */
const sourceColumnsOf = (
  stored: typeof skills.$inferSelect | undefined,
  source: string
): Omit<VersionColumns, "hash"> =>
  stored?.source === source
    ? {
        version: stored.version,
        refreshAt: stored.refreshAt,
        refreshOutcome: stored.refreshOutcome,
        refreshError: stored.refreshError,
        refreshFromHash: stored.refreshFromHash,
        refreshFromVersion: stored.refreshFromVersion,
        refreshToHash: stored.refreshToHash,
        refreshToVersion: stored.refreshToVersion,
        refreshUnread: stored.refreshUnread,
        latestHash: stored.latestHash,
        latestVersion: stored.latestVersion,
        checkedAt: stored.checkedAt,
        checkError: stored.checkError,
      }
    : noVersionColumns;

/** The columns a {@link SourceNote} writes. */
const noteColumns = ({ lastRefresh, checked }: SourceNote) => ({
  ...(lastRefresh === undefined ? {} : refreshColumns(lastRefresh)),
  ...(checked === null
    ? {
        checkedAt: null,
        checkError: null,
        latestHash: null,
        latestVersion: null,
      }
    : {}),
  ...(checked
    ? {
        checkedAt: new Date(checked.at),
        checkError: checked.error ?? null,
        latestHash: checked.error ? null : (checked.hash ?? null),
        latestVersion: checked.error ? null : (checked.version ?? null),
      }
    : {}),
});

/** A subagent row as everything outside the hub reads it. */
const agentFile = (row: typeof fleetAgents.$inferSelect): FleetAgent => ({
  name: row.name,
  content: row.content,
  hash: row.hash,
  bytes: row.bytes,
  at: row.updatedAt.getTime(),
});

/**
 * A stored hook row back into the shape both ends of the fleet share. Takes
 * the loose shape rather than `typeof fleetHooks.$inferSelect` so the same
 * function reads a row just selected out of the table and the row a write is
 * about to put into it — a hook has no server-side timestamp in its wire
 * shape, so there is nothing else the two would disagree about.
 */
const hookOf = (row: {
  id: string;
  name: string;
  enabled: boolean;
  event: HookEvent;
  matcher: string | null;
  handler: HookHandler;
  script: string | null;
  hash: string;
  scope: FleetScope | null;
  projectId: string | null;
  areaId: string | null;
}): FleetHook => ({
  id: row.id,
  name: row.name,
  enabled: row.enabled,
  event: row.event,
  ...(row.matcher ? { matcher: row.matcher } : {}),
  handler: row.handler,
  ...(row.script ? { script: row.script } : {}),
  hash: row.hash,
  ...(row.scope ? { scope: row.scope } : {}),
  ...(row.projectId ? { projectId: row.projectId } : {}),
  ...(row.areaId ? { areaId: row.areaId } : {}),
});

/**
 * A stored hook row as this build reads it: its event is kept as text, the
 * harness's own name for it (a newer Claude Code's event a newer build
 * stored included), and read as one of the events this build knows. A row
 * of any other event is none this build can show, check or place: it is
 * left out, and stays stored for a build that knows its event.
 */
const storedHookOf = (
  row: Omit<Parameters<typeof hookOf>[0], "event"> & { event: string }
): FleetHook | undefined => {
  const event = hookEventNamed(row.event);
  return event ? hookOf({ ...row, event }) : undefined;
};

/** A harness config row in the shape both ends of the fleet share. */
const harnessConfigFrom = (
  row: typeof fleetHarnessConfig.$inferSelect
): FleetHarnessConfig => ({
  kind: row.kind,
  name: row.name,
  enabled: row.enabled,
  ...(row.settings ? { settings: row.settings } : {}),
  ...(row.module ? { module: row.module } : {}),
  ...(row.package ? { package: row.package } : {}),
  ...bindingOf(row, "project"),
});

/** A stored harness config row in the shape both ends of the fleet share; none for settings the hub's key does not open. */
const harnessConfigOf = (
  row: typeof fleetHarnessConfig.$inferSelect
): FleetHarnessConfig[] =>
  row.kind === "claudeSettings" && !row.settings
    ? []
    : [harnessConfigFrom(row)];

/**
 * How far back a memory document, a hook or a skill can be taken, each within
 * its own history. Deep enough to undo a bad day, not a log.
 */
const HISTORY_LIMIT = 20;

/** What a machine compares its own copy against — sha256 of the text's own bytes. */
const hashText = (content: string): string =>
  new Bun.CryptoHasher("sha256").update(content).digest("hex");

/**
 * What a hook's own hash covers: everything a machine actually writes — not
 * `name`, which is how the fleet talks about the hook, and not `enabled`,
 * which decides whether it is written at all rather than what gets written.
 */
export const hashHookMaterial = (hook: {
  event: HookEvent;
  matcher?: string;
  handler: HookHandler;
  script?: string;
}): string =>
  hashText(
    JSON.stringify([
      hook.event,
      hook.matcher ?? null,
      hook.handler,
      hook.script ?? null,
    ])
  );

/** One file as its files table keeps it: its path, its place in its list, its execute bit and its bytes. */
interface FileRow {
  content: Buffer;
  executable: boolean;
  path: string;
  position: number;
}

/** Files as their rows keep them: each one's bytes read off its base64, in the order given. */
const fileRows = (files: readonly SkillFile[]): FileRow[] =>
  files.map((file, position) => ({
    path: file.path,
    position,
    executable: file.executable,
    content: Buffer.from(file.contentBase64, "base64"),
  }));

/** Files as the wire carries them (core `SkillFile`), from their rows, in their list's order. */
const wireFiles = (rows: readonly FileRow[]): SkillFile[] =>
  rows
    .toSorted((a, b) => a.position - b.position)
    .map((row) => ({
      contentBase64: row.content.toString("base64"),
      executable: row.executable,
      path: row.path,
    }));

/** What `files` hash to (core `hashFiles`) as their rows give them back. */
const heldHash = (files: readonly SkillFile[]): string =>
  hashFiles(wireFiles(fileRows(files)));

/**
 * The hash a row of files is stored under: always its files' own
 * (hashFiles), as their rows give them back, whatever its writer passed,
 * so a stored hash changes exactly when its files do and no write leaves
 * the two disagreeing.
 */
export const storedHash = (
  files: readonly SkillFile[] | null | undefined,
  given: string | null | undefined
): string | null => (files ? heldHash(files) : (given ?? null));

/** Each file's row under `owner`, for its files table. */
const fileValues = <Owner extends object>(
  files: readonly SkillFile[],
  owner: Owner
): (FileRow & Owner)[] => fileRows(files).map((row) => ({ ...row, ...owner }));

/** The columns every files table reads a file's row with. */
const FILE_COLUMNS = {
  skill: {
    path: skillFiles.path,
    position: skillFiles.position,
    executable: skillFiles.executable,
    content: skillFiles.content,
  },
  plugin: {
    path: pluginFiles.path,
    position: pluginFiles.position,
    executable: pluginFiles.executable,
    content: pluginFiles.content,
  },
  version: {
    path: skillVersionFiles.path,
    position: skillVersionFiles.position,
    executable: skillVersionFiles.executable,
    content: skillVersionFiles.content,
  },
} as const;

/** A skill's files, as the wire carries them. */
export const skillFilesOf = (
  tx: Pick<Tx, "select">,
  name: string
): SkillFile[] =>
  wireFiles(
    tx
      .select(FILE_COLUMNS.skill)
      .from(skillFiles)
      .where(eq(skillFiles.skillName, name))
      .orderBy(asc(skillFiles.position))
      .all()
  );

/** A plugin's files, as the wire carries them. */
export const pluginFilesOf = (
  tx: Pick<Tx, "select">,
  id: string
): SkillFile[] =>
  wireFiles(
    tx
      .select(FILE_COLUMNS.plugin)
      .from(pluginFiles)
      .where(eq(pluginFiles.pluginId, id))
      .orderBy(asc(pluginFiles.position))
      .all()
  );

/** A kept skill version's files, as the wire carries them. */
export const versionFilesOf = (
  tx: Pick<Tx, "select">,
  id: number
): SkillFile[] =>
  wireFiles(
    tx
      .select(FILE_COLUMNS.version)
      .from(skillVersionFiles)
      .where(eq(skillVersionFiles.versionId, id))
      .orderBy(asc(skillVersionFiles.position))
      .all()
  );

/** A skill's files replaced by `files`; none when null. */
const putSkillFiles = (
  tx: Pick<Tx, "delete" | "insert">,
  name: string,
  files: readonly SkillFile[] | null
): void => {
  tx.delete(skillFiles).where(eq(skillFiles.skillName, name)).run();
  if (files && files.length > 0) {
    tx.insert(skillFiles)
      .values(fileValues(files, { skillName: name }))
      .run();
  }
};

/** A plugin's files replaced by `files`; none when null. */
const putPluginFiles = (
  tx: Pick<Tx, "delete" | "insert">,
  id: string,
  files: readonly SkillFile[] | null
): void => {
  tx.delete(pluginFiles).where(eq(pluginFiles.pluginId, id)).run();
  if (files && files.length > 0) {
    tx.insert(pluginFiles)
      .values(fileValues(files, { pluginId: id }))
      .run();
  }
};

export interface FleetCatalogDb {
  /** The briefer documents a session has been handed, path → the hash it read (briefings.ts). */
  readonly briefingsHanded: (instanceId: string) => Map<string, string>;
  readonly deleteFleetMemoryDoc: (path: string) => void;
  /** The whole desired fleet state (NEW.md §11) — what a machine is sent to converge on. */
  /**
   * The fleet's desired state, every content-carrying row with its files.
   * What a given machine already holds is left out at the push, from a read
   * of that machine's disk (server.ts pushFleetConfig).
   */
  readonly fleetConfig: () => FleetConfig;
  readonly fleetHookVersion: (
    id: number
  ) => (HookVersion & HookVersionMaterial) | undefined;
  readonly fleetMemoryVersion: (
    id: number
  ) => (MemoryVersion & { content: string }) | undefined;
  /**
   * A skill's superseded version in full: what restoring it writes back.
   * Its files are null while the ones it kept do not read (hub migration
   * 0423): it is not restored.
   */
  readonly fleetSkillVersion: (
    id: number
  ) =>
    | (SkillVersion & { skillSource: string; files: SkillFile[] | null })
    | undefined;
  /** Forgets every briefer document a session was handed: its context no longer holds them. */
  readonly forgetBriefings: (instanceId: string) => void;
  readonly getFleetHook: (id: string) => FleetHook | undefined;
  /** The fleet's user-scope CLAUDE.md, or undefined while the fleet keeps none. */
  readonly getFleetMemory: () =>
    { content: string; hash: string; updatedAt: string } | undefined;
  readonly getFleetMemoryDoc: (path: string) => MemoryDocRow | undefined;
  /** One row, by its kind and name. */
  readonly getHarnessConfig: (
    kind: HarnessConfigKind,
    name: string
  ) => FleetHarnessConfig | undefined;
  /** Records briefer documents as handed to a session, each at its hash. */
  readonly handBriefings: (
    instanceId: string,
    docs: readonly { path: string; hash: string }[]
  ) => void;
  /**
   * What names the skill a row is: the row's own name, and the name its
   * stored SKILL.md declares (skills.ts `resolveSkill`'s `held`).
   */
  readonly heldSkillNames: (name: string) => string[];
  /** A skill about to be deleted: its files kept in its history first, as a hook's are. */
  readonly keepSkillVersion: (name: string) => void;
  /**
   * Every subagent the fleet keeps, file and all: a definition is a page of
   * markdown, so the listing is what the editor is seeded from.
   */
  readonly listFleetAgents: () => FleetAgent[];
  /**
   * Newest first, without the material: one hook's history, or — with no id —
   * every hook's, for a fleet-wide undo panel.
   */
  readonly listFleetHookHistory: (hookId?: string) => HookVersion[];
  /** Every hook the fleet keeps, by name — what the editor lists and seeds from. */
  readonly listFleetHooks: () => FleetHook[];
  /** Every document the main memory links, by path — the set, in one read. */
  readonly listFleetMemoryDocs: () => MemoryDocRow[];
  /**
   * Newest first, without the content: a list should not weigh what it lists.
   * One document's history, or the main file's when no path is named — the two
   * are never mixed, because the panel asks about one document at a time.
   */
  readonly listFleetMemoryHistory: (path?: string) => MemoryVersion[];
  /** Newest first, without the files: one skill's history. */
  readonly listFleetSkillHistory: (name: string) => SkillVersion[];
  /**
   * The fleet's Claude Code settings, OpenCode plugins and pi extensions
   * (core harness-config.ts), of one kind or every kind, by name. A
   * settings row the hub's key does not open is none, as an MCP server's is.
   */
  readonly listHarnessConfig: (
    kind?: HarnessConfigKind
  ) => FleetHarnessConfig[];
  /**
   * Every plugin row without its files, `error` and all. What the DASHBOARD
   * reads: {@link fleetConfig} answers the machines and deliberately carries
   * neither the bookkeeping nor the failure, so a plugin the hub could not
   * fetch was until now a row nothing on the page could tell apart from one
   * that resolved.
   */
  readonly listPlugins: () => FleetPlugin[];
  /** Every skill row without its files — a catalog read should not weigh megabytes. */
  readonly listSkills: () => FleetSkillMeta[];
  /** Where the fleet's marketplace `name` comes from; undefined for none. */
  readonly marketplaceSource: (name: string) => string | undefined;
  /**
   * What a fetch of a skill or plugin came to, and what its source holds now
   * (FleetVersioned). `lastRefresh` null clears it; `checked` with an `error`
   * clears what an earlier read found, so a read that failed marks no update.
   */
  readonly noteSource: (
    row: { skill: string } | { plugin: string },
    note: SourceNote
  ) => void;
  /** Upsert of one definition's file; the hash and the size are read off it. */
  readonly putFleetAgent: (agent: {
    name: string;
    content: string;
  }) => FleetAgent;
  /**
   * Upsert by id. The caller mints the id, like a rule's; the hash is not
   * taken from the caller but recomputed here, over the material a machine
   * actually compares before writing — so a hash can never be sent stale.
   */
  readonly putFleetHook: (hook: Omit<FleetHook, "hash">) => FleetHook;
  /**
   * Upsert of one document; the hash is read off the content, as everywhere.
   * `scope` given replaces the stored one whole (`{}` makes it a linked
   * document again); left out, the stored scope stays.
   */
  readonly putFleetMemoryDoc: (doc: {
    path: string;
    content: string;
    scope?: MemoryScope;
  }) => MemoryDocRow;
  /** A row stored whole, as `harnessConfigProblem` passed it; answers it as stored. */
  readonly putHarnessConfig: (row: FleetHarnessConfig) => FleetHarnessConfig;
  readonly putMarketplace: (marketplace: FleetMarketplace) => FleetMarketplace;
  readonly putPlugin: (plugin: {
    id: string;
    enabled?: boolean;
  }) => FleetPlugin;
  /**
   * What one plugin's resolve came to: the files the hub fetched, or the
   * sentence it failed with. The mirror of {@link putSkill}, and the write that
   * turns a plugin from a name every machine must fetch for itself into bytes
   * the fleet carries. A resolve that failed keeps the last files that
   * worked, as a skill's does: the machines are serving them, and a source
   * unreachable for a minute is no reason to take a working plugin off them.
   */
  readonly putPluginPayload: (payload: {
    id: string;
    hash?: string;
    bytes?: number;
    error?: string;
    files?: SkillFile[];
    /** What the files declare (fleet-versions.ts `pluginVersion`). */
    version?: string;
  }) => void;
  /** Upsert of a resolve's outcome: the files it read, or the sentence it failed with. */
  readonly putSkill: (skill: {
    name: string;
    source: string;
    enabled?: boolean;
    /** As {@link putMcpServer}'s: bound to a project, null for every machine, left out kept. */
    projectId?: string | null;
    /** As {@link putMcpServer}'s: bound to every project in that area instead. */
    areaId?: string | null;
    hash?: string;
    bytes?: number;
    error?: string;
    files?: SkillFile[];
  }) => FleetSkillMeta;
  /**
   * Keeps a version that is about to be replaced or destroyed — a save, an
   * edit, or a delete, the same three moments a memory document is kept at.
   */
  readonly recordFleetHook: (version: {
    hookId: string;
    name: string;
    enabled: boolean;
    event: HookEvent;
    matcher?: string;
    handler: HookHandler;
    script?: string;
    hash: string;
    scope?: FleetScope;
    projectId?: string;
    source: string;
  }) => void;
  /**
   * Keeps a version that is about to be replaced or destroyed. `source` is
   * `fleet` for the hub's own row and `machine:<machineId>` for a copy an
   * overwrite is taking off a machine; `path` names the document of the set it
   * belonged to, and its absence is the main CLAUDE.md.
   */
  readonly recordFleetMemory: (version: {
    content: string;
    hash: string;
    source: string;
    path?: string;
  }) => void;
  /**
   * Keeps a skill's version that is about to be replaced or destroyed: the
   * fleet's own row on a change or a delete (which `putSkill` and
   * `keepSkillVersion` do themselves), or a machine's edited copy an
   * overwrite is taking off it (`source` `machine:<machineId>`).
   */
  readonly recordFleetSkill: (version: {
    name: string;
    skillSource: string;
    hash: string;
    files: readonly SkillFile[];
    source: string;
  }) => void;
  /**
   * A marketplace row moved to the name its manifest gives, with every plugin
   * id after its `@`. Where the new name or id is already a row, that row
   * stays and the old one goes. Answers the plugin ids that moved, old → new.
   */
  readonly renameMarketplace: (from: string, to: string) => [string, string][];
  /** Stores the document and the hash the machines compare against. */
  readonly setFleetMemory: (content: string) => {
    content: string;
    hash: string;
    /** ISO, as the answer carries it. */
    updatedAt: string;
  };
  /**
   * Switches a stored skill on or off, its source and files as they are: no
   * fetch. Undefined when there is no such skill.
   */
  readonly setSkillEnabled: (
    name: string,
    enabled: boolean
  ) => FleetSkillMeta | undefined;
  /** Where the fleet's skill `name` comes from; undefined for none. */
  readonly skillSource: (name: string) => string | undefined;
  /**
   * The row a fetch is about to resolve: a new one is stored with no files
   * yet; an existing one takes `enabled` and its placement now and keeps its
   * source and files until the fetch's {@link putSkill}.
   */
  readonly stageSkill: (skill: {
    name: string;
    source: string;
    enabled?: boolean;
    projectId?: string | null;
    areaId?: string | null;
  }) => FleetSkillMeta;
  /**
   * Enabled plugins with no resolved files or whose last resolve failed
   * (keeping the files before it) — what a resolve at boot is for. A failed
   * one is tried again so its sentence is this hub's, and a source that came
   * back heals without a refresh.
   */
  readonly unresolvedPlugins: () => string[];
  /**
   * Once per database (`data_migrations`): each stored skill's and plugin's
   * declared version, read off the files it already holds. How many of each
   * it read a version off, of how many; null when it had run already.
   */
  readonly versionStoredOnce: () => {
    plugins: { of: number; versioned: number };
    skills: { of: number; versioned: number };
  } | null;
}

export const fleetCatalogDb = (core: DbCore): FleetCatalogDb => {
  const { db, areasStore, deniedToolNames } = core;

  /** The fleet's tool denials, in the order they were added. */
  const listHarnessConfig = (kind?: HarnessConfigKind): FleetHarnessConfig[] =>
    db
      .select()
      .from(fleetHarnessConfig)
      .where(kind ? eq(fleetHarnessConfig.kind, kind) : undefined)
      .orderBy(fleetHarnessConfig.kind, fleetHarnessConfig.name)
      .all()
      .flatMap(harnessConfigOf);

  /**
   * One history's retention, the same for memory, hooks and skills: the
   * newest {@link HISTORY_LIMIT} rows of the one thing `of` names are kept.
   * Pruned within that thing's own history, so a fleet of fifty hooks or
   * skills does not have every save of one of them evict another's past.
   */
  const pruneHistory = (
    table: AnySQLiteTable,
    id: AnySQLiteColumn<{ data: number; notNull: true }>,
    of: SQL
  ): void => {
    const keep = db
      .select({ id })
      .from(table)
      .where(of)
      .orderBy(desc(id))
      .limit(HISTORY_LIMIT)
      .all()
      .map((row) => row.id);
    db.delete(table)
      .where(and(of, notInArray(id, keep)))
      .run();
  };

  /** A skill's version, kept before it is replaced or destroyed: under its files' own hash. */
  const recordFleetSkill = ({
    name,
    skillSource,
    files,
    source,
  }: {
    name: string;
    skillSource: string;
    files: readonly SkillFile[];
    source: string;
  }): void => {
    db.transaction((tx) => {
      const { id } = tx
        .insert(fleetSkillHistory)
        .values({
          name,
          skillSource,
          hash: heldHash(files),
          bytes: files.reduce(
            (total, file) =>
              total + Buffer.byteLength(file.contentBase64, "base64"),
            0
          ),
          source,
        })
        .returning({ id: fleetSkillHistory.id })
        .get();
      if (files.length > 0) {
        tx.insert(skillVersionFiles)
          .values(fileValues(files, { versionId: id }))
          .run();
      }
    });
    pruneHistory(
      fleetSkillHistory,
      fleetSkillHistory.id,
      eq(fleetSkillHistory.name, name)
    );
  };

  /** The skill's row `stored`, its files or the ones it kept as not read, as a version in its history. */
  const keepVersion = (
    stored: typeof skills.$inferSelect,
    hash: string,
    files: readonly SkillFile[] | null
  ): void => {
    if (files) {
      recordFleetSkill({
        name: stored.name,
        skillSource: stored.source,
        files,
        source: "fleet",
      });
    } else if (stored.filesUnread !== null) {
      db.insert(fleetSkillHistory)
        .values({
          name: stored.name,
          skillSource: stored.source,
          hash,
          bytes: stored.bytes ?? 0,
          filesUnread: stored.filesUnread,
          source: "fleet",
        })
        .run();
      pruneHistory(
        fleetSkillHistory,
        fleetSkillHistory.id,
        eq(fleetSkillHistory.name, stored.name)
      );
    }
  };

  /**
   * What a write of files hashing to `fileHash` replaces, kept first, as a
   * hook's or a memory document's is: every refresh, adopt, new source or
   * restore that moves the fleet's copy leaves the old one (`stored`, its
   * `files`) in the skill's history. Files the row kept as not read (hub
   * migration 0423) are kept there as they were, as a version that is not
   * restored.
   */
  const keepReplaced = (
    stored: typeof skills.$inferSelect | undefined,
    files: readonly SkillFile[] | null,
    fileHash: string | null | undefined
  ): void => {
    if (stored?.hash && fileHash !== undefined && fileHash !== stored.hash) {
      keepVersion(stored, stored.hash, files);
    }
  };

  const getFleetMemory = () => {
    const row = db
      .select()
      .from(fleetMemory)
      .where(eq(fleetMemory.id, MEMORY_ID))
      .get();
    return row
      ? {
          content: row.content,
          hash: row.hash,
          updatedAt: row.updatedAt.toISOString(),
        }
      : undefined;
  };

  /** Each document's projects, by its path. */
  const memoryDocProjects = (docPath?: string): Map<string, string[]> => {
    const byPath = new Map<string, string[]>();
    for (const link of db
      .select()
      .from(fleetMemoryDocProjects)
      .where(
        docPath === undefined
          ? undefined
          : eq(fleetMemoryDocProjects.path, docPath)
      )
      .all()) {
      byPath.set(link.path, [...(byPath.get(link.path) ?? []), link.projectId]);
    }
    return byPath;
  };

  /** Each document's areas, by its path. */
  const memoryDocAreas = (docPath?: string): Map<string, string[]> => {
    const byPath = new Map<string, string[]>();
    for (const link of db
      .select()
      .from(fleetMemoryDocAreas)
      .where(
        docPath === undefined
          ? undefined
          : eq(fleetMemoryDocAreas.path, docPath)
      )
      .all()) {
      byPath.set(link.path, [...(byPath.get(link.path) ?? []), link.areaId]);
    }
    return byPath;
  };

  /** Each document's delegate types, by its path. */
  const memoryDocTypes = (docPath?: string): Map<string, string[]> => {
    const byPath = new Map<string, string[]>();
    for (const link of db
      .select()
      .from(fleetMemoryDocTypes)
      .where(
        docPath === undefined
          ? undefined
          : eq(fleetMemoryDocTypes.path, docPath)
      )
      .all()) {
      byPath.set(link.path, [...(byPath.get(link.path) ?? []), link.typeName]);
    }
    return byPath;
  };

  const listFleetMemoryDocs = (): MemoryDocRow[] => {
    const projectsOf = memoryDocProjects();
    const areasOf = memoryDocAreas();
    const typesOf = memoryDocTypes();
    return db
      .select()
      .from(fleetMemoryDocs)
      .orderBy(fleetMemoryDocs.path)
      .all()
      .map((row) =>
        memoryDocRow(row, {
          projectIds: projectsOf.get(row.path) ?? [],
          areaIds: areasOf.get(row.path) ?? [],
          typeNames: typesOf.get(row.path) ?? [],
        })
      );
  };

  const getFleetMemoryDoc = (docPath: string): MemoryDocRow | undefined => {
    const row = db
      .select()
      .from(fleetMemoryDocs)
      .where(eq(fleetMemoryDocs.path, docPath))
      .get();
    return row
      ? memoryDocRow(row, {
          projectIds: memoryDocProjects(docPath).get(docPath) ?? [],
          areaIds: memoryDocAreas(docPath).get(docPath) ?? [],
          typeNames: memoryDocTypes(docPath).get(docPath) ?? [],
        })
      : undefined;
  };

  /**
   * Writes the catalog's own word on when each stored conversation last
   * changed onto the rows that are not live, after the settle above so it
   * overwrites it.
   *
   * Everything in `settleInstances` writes `updatedAt` from the hub's clock,
   * because settling a row is the only moment the hub has an opinion about it —
   * which is how a machine coming back stamped three hundred rows with the same
   * instant and made every age in the rail read `1m` alike. The daemon's
   * catalog knows better: a conversation's mtime is when the session itself last
   * said something. Only rows that disagree are written, so a register that
   * changes nothing costs one select. A catalog read from a harness's server
   * (OpenCode's) arrives on a beat after the register and is written the same
   * way.
   */
  /**
   * Each enabled skill's and plugin's files, by the hash its row names: read
   * from its files table only when that hash is new. The fleet's config is built for
   * every machine's welcome and delta, and it read and parsed every skill's
   * and plugin's files each time, 78 MB on the live hub, 267 ms a build
   * (measured on a copy of the live database, 2026-10-23). A row's hash is its files' (fleet
   * `hashSkillFiles`), so a kept copy under the same hash is those files.
   */
  const filesKept = new Map<string, { files: SkillFile[]; hash: string }>();

  const keptFiles = (
    key: string,
    hash: string,
    read: () => SkillFile[]
  ): SkillFile[] => {
    const held = filesKept.get(key);
    if (held?.hash === hash) {
      return held.files;
    }
    const files = read();
    filesKept.set(key, { files, hash });
    return files;
  };

  return {
    fleetConfig: () => {
      /**
       * A server's sign-in as the fleet reads it: signed in, waiting on one,
       * or failed, and a sign-in that ended without the person (Needs you's
       * item) with when and why.
       */
      const mcpAuthOf = (
        name: string,
        mode: "direct" | "oauth",
        error: string | null
      ): NonNullable<FleetMcpServer["auth"]> => {
        const oauth =
          mode === "oauth"
            ? db
                .select({
                  tokens: fleetMcpOauth.tokens,
                  endedAt: fleetMcpOauth.endedAt,
                  endedWhy: fleetMcpOauth.endedWhy,
                  identity: fleetMcpOauth.identity,
                })
                .from(fleetMcpOauth)
                .where(eq(fleetMcpOauth.name, name))
                .get()
            : undefined;
        if (error) {
          return { mode, state: "failed", detail: error };
        }
        if (mode === "direct" || oauth?.tokens) {
          return {
            mode,
            state: "signed-in",
            ...(oauth?.identity ? { as: oauth.identity } : {}),
          };
        }
        return {
          mode,
          state: "needs-auth",
          ...(oauth?.endedAt
            ? {
                ended: {
                  at: oauth.endedAt.getTime(),
                  why: oauth.endedWhy ?? "",
                },
              }
            : {}),
        };
      };
      const listed = listedPlatforms(db);
      return {
        mcp: db
          .select()
          .from(mcpServers)
          .all()
          // A config the hub's key does not open is no server until it is saved again.
          .flatMap((row) =>
            row.config ? [{ ...row, config: row.config }] : []
          )
          .map(
            ({
              name,
              config,
              enabled,
              authMode,
              authError,
              projectId,
              areaId,
              scope,
              everyPlatform,
              platformsUnread,
              shared,
            }) => ({
              name,
              config,
              enabled,
              ...bindingOf({ projectId, areaId, scope }, "local"),
              ...runsOnOf(
                { everyPlatform, platformsUnread },
                listed.get(name) ?? []
              ),
              ...(shared ? { shared } : {}),
              auth: mcpAuthOf(name, authMode, authError),
            })
          ),
        marketplaces: db
          .select()
          .from(marketplaces)
          .all()
          .map(({ name, source, createdAt }) => ({
            name,
            source,
            createdAt: createdAt.getTime(),
          })),
        plugins: db
          .select({ id: plugins.id, enabled: plugins.enabled })
          .from(plugins)
          .all(),
        // Only the rows that resolved: a skill with no files is nothing a machine
        // could converge on, and one whose row says nothing is not sent at all.
        skills: [
          ...db
            .select({
              name: skills.name,
              hash: skills.hash,
              filesHeld: skills.filesHeld,
              filesUnread: skills.filesUnread,
              projectId: skills.projectId,
              areaId: skills.areaId,
              scope: skills.scope,
            })
            .from(skills)
            .where(eq(skills.enabled, true))
            .all()
            .flatMap(
              ({
                name,
                hash,
                filesHeld,
                filesUnread,
                projectId,
                areaId,
                scope,
              }) => {
                const files =
                  hash && filesHeld
                    ? keptFiles(`skill:${name}`, hash, () =>
                        skillFilesOf(db, name)
                      )
                    : undefined;
                // Files kept that do not read are sent as the hash alone: a
                // machine that holds that copy keeps it, and one that does
                // not installs nothing and says the bytes are missing.
                return hash && (files || filesUnread !== null)
                  ? [
                      {
                        name,
                        hash,
                        ...(files ? { files } : {}),
                        ...bindingOf({ projectId, areaId, scope }, "project"),
                      },
                    ]
                  : [];
              }
            ),
          // CawCo's own; a fleet skill of the same name, on or off, is the operator's word on it.
          ...(() => {
            const named = new Set(
              db
                .select({ name: skills.name })
                .from(skills)
                .all()
                .map(({ name }) => name)
            );
            return [
              ...bundledSkills(),
              // Each template's starter skills, bound to the projects made from it.
              ...starterSkills(
                db
                  .select({ id: projects.id, template: projects.template })
                  .from(projects)
                  .all()
              ),
            ].filter((skill) => !named.has(skill.name));
          })(),
        ],
        // Only the rows a resolve filled in. A plugin the hub could not fetch is
        // simply absent here, and the daemon installs it the old way — which is
        // the one path left that needs the machine to reach the source itself.
        pluginPayloads: db
          .select({
            id: plugins.id,
            hash: plugins.hash,
            bytes: plugins.bytes,
            filesHeld: plugins.filesHeld,
            filesUnread: plugins.filesUnread,
            version: plugins.version,
          })
          .from(plugins)
          .where(eq(plugins.enabled, true))
          .all()
          .flatMap(({ id, hash, bytes, filesHeld, filesUnread, version }) => {
            const files =
              hash && filesHeld
                ? keptFiles(`plugin:${id}`, hash, () => pluginFilesOf(db, id))
                : undefined;
            // As a skill's: files kept that do not read go as the hash alone.
            if (!(hash && (files || filesUnread !== null))) {
              return [];
            }
            const name = id.split("@")[0] ?? id;
            return [
              {
                name,
                marketplace: id.split("@")[1] ?? "",
                hash,
                bytes: bytes ?? 0,
                ...(files ? { files } : {}),
                ...(version ? { version } : {}),
              },
            ];
          }),
        // Null rather than absent: a fleet that keeps no memory is what has a
        // machine give back the copy cawco wrote it — the linked documents
        // included, since a set with no main file is not a set.
        memory: (() => {
          const stored = getFleetMemory();
          if (!stored) {
            return null;
          }
          return {
            hash: stored.hash,
            content: stored.content,
            // The linked documents alone: a scoped one is loaded into its
            // sessions, never written under `~/.claude/memories/`.
            docs: listFleetMemoryDocs().flatMap(
              ({ path: docPath, hash, content, scope }) =>
                scope ? [] : [{ path: docPath, hash, content }]
            ),
          };
        })(),
        // A project's documents for all its sessions, sent with its rows to
        // each machine that holds it, which places them at each of its
        // places there (project-placements.ts, agent fleet-place.ts).
        // One with a role, type or model goes to its sessions as they launch
        // instead, and a briefer's to the sessions that delegate.
        // A document of several projects is one row per project; one of
        // an area, one row per project in it now.
        placedMemory: listFleetMemoryDocs().flatMap(
          ({ path: docPath, hash, content, scope }) =>
            placedOnly(scope)
              ? [
                  ...new Set([
                    ...(scope?.projectIds ?? []),
                    ...(scope?.areaIds ?? []).flatMap((areaId) =>
                      areasStore.projectsIn(areaId)
                    ),
                  ]),
                ].map((projectId) => ({
                  path: docPath,
                  hash,
                  content,
                  projectId,
                  scope: "project" as const,
                }))
              : []
        ),
        // A disabled row is not one of them — the same rule a disabled MCP
        // server or skill follows.
        hooks: db
          .select()
          .from(fleetHooks)
          .where(eq(fleetHooks.enabled, true))
          .all()
          .flatMap((row) => storedHookOf(row) ?? []),
        // A disabled row is placed nowhere, as a disabled hook is not.
        harnessConfig: listHarnessConfig().filter((row) => row.enabled),
        // Always sent: a machine spawns nothing until it has heard it.
        deniedTools: deniedToolNames(),
      };
    },
    putMarketplace: ({ name, source }) => {
      db.insert(marketplaces)
        .values({ name, source })
        .onConflictDoUpdate({ target: marketplaces.name, set: { source } })
        .run();
      return { name, source };
    },
    renameMarketplace: (from, to) =>
      db.transaction((tx) => {
        const taken = tx
          .select({ name: marketplaces.name })
          .from(marketplaces)
          .where(eq(marketplaces.name, to))
          .get();
        if (taken) {
          tx.delete(marketplaces).where(eq(marketplaces.name, from)).run();
        } else {
          tx.update(marketplaces)
            .set({ name: to })
            .where(eq(marketplaces.name, from))
            .run();
        }
        const ids = new Set(
          tx
            .select({ id: plugins.id })
            .from(plugins)
            .all()
            .map(({ id }) => id)
        );
        const moved: [string, string][] = [];
        for (const id of ids) {
          const [name, marketplace] = id.split("@");
          if (marketplace !== from) {
            continue;
          }
          const next = `${name}@${to}`;
          if (ids.has(next)) {
            tx.delete(plugins).where(eq(plugins.id, id)).run();
          } else {
            tx.update(plugins)
              .set({ id: next })
              .where(eq(plugins.id, id))
              .run();
          }
          moved.push([id, next]);
        }
        return moved;
      }),
    putPluginPayload: ({ id, hash, bytes, error, files, version }) => {
      if (error !== undefined) {
        db.update(plugins).set({ error }).where(eq(plugins.id, id)).run();
        return;
      }
      db.transaction((tx) => {
        tx.update(plugins)
          .set({
            hash: storedHash(files, hash),
            bytes: bytes ?? null,
            error: null,
            filesHeld: files !== undefined,
            filesUnread: null,
            version: version ?? null,
          })
          .where(eq(plugins.id, id))
          .run();
        putPluginFiles(tx, id, files ?? null);
      });
    },
    noteSource: (row, note) => {
      const set = noteColumns(note);
      if (Object.keys(set).length === 0) {
        return;
      }
      if ("skill" in row) {
        db.update(skills).set(set).where(eq(skills.name, row.skill)).run();
      } else {
        db.update(plugins).set(set).where(eq(plugins.id, row.plugin)).run();
      }
    },
    versionStoredOnce: () =>
      db.transaction((tx) => {
        const name = SKILL_PLUGIN_VERSIONS;
        if (
          tx
            .select()
            .from(dataMigrations)
            .where(eq(dataMigrations.name, name))
            .get()
        ) {
          return null;
        }
        const skillRows = tx
          .select({ key: skills.name, held: skills.filesHeld })
          .from(skills)
          .all()
          .map((row) => ({
            key: row.key,
            version: row.held
              ? skillVersion(skillFilesOf(tx, row.key))
              : undefined,
          }));
        // The marketplace entry's version is not stored; the next fetch or
        // update check reads it.
        const pluginRows = tx
          .select({ key: plugins.id, held: plugins.filesHeld })
          .from(plugins)
          .all()
          .map((row) => ({
            key: row.key,
            version: pluginVersion(
              row.held ? pluginFilesOf(tx, row.key) : null,
              undefined
            ),
          }));
        for (const { key, version } of skillRows) {
          if (version) {
            tx.update(skills)
              .set({ version })
              .where(eq(skills.name, key))
              .run();
          }
        }
        for (const { key, version } of pluginRows) {
          if (version) {
            tx.update(plugins)
              .set({ version })
              .where(eq(plugins.id, key))
              .run();
          }
        }
        tx.insert(dataMigrations).values({ name, at: new Date() }).run();
        const counted = (rows: { version?: string }[]) => ({
          of: rows.length,
          versioned: rows.filter((row) => row.version).length,
        });
        return { skills: counted(skillRows), plugins: counted(pluginRows) };
      }),
    unresolvedPlugins: () =>
      db
        .select({ id: plugins.id, hash: plugins.hash, error: plugins.error })
        .from(plugins)
        .where(eq(plugins.enabled, true))
        .all()
        .flatMap(({ id, hash, error }) => (hash && !error ? [] : [id])),
    listPlugins: () =>
      db
        .select({
          id: plugins.id,
          enabled: plugins.enabled,
          hash: plugins.hash,
          bytes: plugins.bytes,
          error: plugins.error,
          filesUnread: plugins.filesUnread,
          version: plugins.version,
          refreshAt: plugins.refreshAt,
          refreshOutcome: plugins.refreshOutcome,
          refreshError: plugins.refreshError,
          refreshFromHash: plugins.refreshFromHash,
          refreshFromVersion: plugins.refreshFromVersion,
          refreshToHash: plugins.refreshToHash,
          refreshToVersion: plugins.refreshToVersion,
          refreshUnread: plugins.refreshUnread,
          latestHash: plugins.latestHash,
          latestVersion: plugins.latestVersion,
          checkedAt: plugins.checkedAt,
          checkError: plugins.checkError,
        })
        .from(plugins)
        .all()
        .map((row) => ({
          id: row.id,
          ...fetched(row),
        })),
    putPlugin: ({ id, enabled }) => {
      const plugin: FleetPlugin = { id, enabled: enabled ?? true };
      db.insert(plugins)
        .values({ id, enabled: plugin.enabled })
        .onConflictDoUpdate({
          target: plugins.id,
          set: { enabled: plugin.enabled },
        })
        .run();
      return plugin;
    },
    // One row's source each: a pass over every skill and plugin asked the
    // whole catalog, and the whole fleet config, once per row (the update
    // check's `watched`, at every hub start on a copy of the live
    // database).
    skillSource: (name) =>
      db
        .select({ source: skills.source })
        .from(skills)
        .where(eq(skills.name, name))
        .get()?.source,
    marketplaceSource: (name) =>
      db
        .select({ source: marketplaces.source })
        .from(marketplaces)
        .where(eq(marketplaces.name, name))
        .get()?.source,
    listSkills: () => db.select().from(skills).all().map(skillMeta),
    heldSkillNames: (name) => {
      const declared = skillName(skillFilesOf(db, name));
      return declared && declared !== name ? [name, declared] : [name];
    },
    putSkill: ({
      name,
      source,
      enabled,
      hash,
      bytes,
      error,
      files,
      projectId,
      areaId,
    }) => {
      const stored = db
        .select()
        .from(skills)
        .where(eq(skills.name, name))
        .get();
      // A resolve that failed on the source the row already carries keeps the
      // last copy that worked: the machines are serving it, and a repo that was
      // unreachable for a minute is no reason to take a working skill off them.
      const keep = error !== undefined && stored?.source === source;
      const fileHash = files ? storedHash(files, hash) : hash;
      const storedFiles = stored?.filesHeld ? skillFilesOf(db, name) : null;
      if (!keep) {
        keepReplaced(stored, storedFiles, fileHash);
      }
      // Kept, the row's files stay as they are, and so does a list of
      // them kept as not read; otherwise this write's files replace both.
      const held = keep
        ? {
            hash: stored.hash,
            bytes: stored.bytes,
            files: storedFiles,
            filesUnread: stored.filesUnread,
          }
        : {
            hash: fileHash ?? null,
            bytes: bytes ?? null,
            files: files ?? null,
            filesUnread: null,
          };
      const rowFiles = held.files;
      const row = {
        name,
        source,
        enabled: enabled ?? true,
        hash: held.hash,
        bytes: held.bytes,
        error: error ?? null,
        filesHeld: rowFiles !== null,
        filesUnread: held.filesUnread,
      };
      const version = skillVersion(rowFiles) ?? null;
      // What a source held and what its last fetch came to are that source's:
      // a row given another source has read neither from it yet.
      const carried = sourceColumnsOf(stored, source);
      const placement = placementOf({ projectId, areaId }, stored, "project");
      db.transaction((tx) => {
        tx.insert(skills)
          .values({ ...row, version, ...placement })
          .onConflictDoUpdate({
            target: skills.name,
            set: {
              ...carried,
              source: row.source,
              enabled: row.enabled,
              hash: row.hash,
              bytes: row.bytes,
              error: row.error,
              filesHeld: row.filesHeld,
              filesUnread: row.filesUnread,
              version,
              ...placement,
            },
          })
          .run();
        if (!keep) {
          putSkillFiles(tx, name, rowFiles);
        }
      });
      return skillMeta({
        ...carried,
        ...row,
        version,
        ...placement,
      });
    },
    setSkillEnabled: (name, enabled) => {
      const stored = db
        .select()
        .from(skills)
        .where(eq(skills.name, name))
        .get();
      if (!stored) {
        return;
      }
      db.update(skills).set({ enabled }).where(eq(skills.name, name)).run();
      return skillMeta({ ...stored, enabled });
    },
    stageSkill: ({ name, source, enabled, projectId, areaId }) => {
      const stored = db
        .select()
        .from(skills)
        .where(eq(skills.name, name))
        .get();
      const placement = placementOf({ projectId, areaId }, stored, "project");
      if (!stored) {
        const row = {
          name,
          source,
          enabled: enabled ?? true,
          hash: null,
          bytes: null,
          error: null,
          filesHeld: false,
          filesUnread: null,
        };
        db.insert(skills)
          .values({ ...row, ...placement })
          .run();
        return skillMeta({ ...noVersionColumns, ...row, ...placement });
      }
      // The source, hash and files stay the last fetch's until this one lands
      // (`putSkill`), so a fetch that fails keeps what the machines serve.
      const next = { enabled: enabled ?? stored.enabled, ...placement };
      db.update(skills).set(next).where(eq(skills.name, name)).run();
      return skillMeta({ ...stored, ...next });
    },
    keepSkillVersion: (name) => {
      // A delete takes a final snapshot, as a hook's does.
      const stored = db
        .select()
        .from(skills)
        .where(eq(skills.name, name))
        .get();
      if (stored?.hash) {
        keepVersion(
          stored,
          stored.hash,
          stored.filesHeld ? skillFilesOf(db, name) : null
        );
      }
    },
    recordFleetSkill,
    listFleetSkillHistory: (name) =>
      db
        .select({
          id: fleetSkillHistory.id,
          name: fleetSkillHistory.name,
          hash: fleetSkillHistory.hash,
          bytes: fleetSkillHistory.bytes,
          source: fleetSkillHistory.source,
          createdAt: fleetSkillHistory.createdAt,
        })
        .from(fleetSkillHistory)
        .where(eq(fleetSkillHistory.name, name))
        .orderBy(desc(fleetSkillHistory.id))
        .all()
        .map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
    fleetSkillVersion: (id) => {
      const row = db
        .select()
        .from(fleetSkillHistory)
        .where(eq(fleetSkillHistory.id, id))
        .get();
      if (!row) {
        return;
      }
      const { filesUnread, ...version } = row;
      return {
        ...version,
        createdAt: row.createdAt.toISOString(),
        files: filesUnread === null ? versionFilesOf(db, id) : null,
      };
    },
    listFleetAgents: () =>
      db
        .select()
        .from(fleetAgents)
        .orderBy(fleetAgents.name)
        .all()
        .map(agentFile),
    putFleetAgent: ({ name, content }) => {
      const row = {
        name,
        content,
        hash: hashText(content),
        bytes: Buffer.byteLength(content),
        updatedAt: new Date(),
      };
      db.insert(fleetAgents)
        .values(row)
        .onConflictDoUpdate({
          target: fleetAgents.name,
          set: {
            content: row.content,
            hash: row.hash,
            bytes: row.bytes,
            updatedAt: row.updatedAt,
          },
        })
        .run();
      return agentFile(row);
    },
    listFleetHooks: () =>
      db
        .select()
        .from(fleetHooks)
        .orderBy(fleetHooks.name)
        .all()
        .flatMap((row) => storedHookOf(row) ?? []),
    listHarnessConfig,
    getHarnessConfig: (kind, name) => {
      const row = db
        .select()
        .from(fleetHarnessConfig)
        .where(eq(fleetHarnessConfig.id, `${kind}:${name}`))
        .get();
      return row ? harnessConfigOf(row)[0] : undefined;
    },
    putHarnessConfig: (row) => {
      const values = {
        id: `${row.kind}:${row.name}`,
        kind: row.kind,
        name: row.name,
        enabled: row.enabled,
        settings: row.settings ?? null,
        module: row.module ?? null,
        package: row.package ?? null,
        ...placementOf(
          { projectId: row.projectId ?? null, areaId: row.areaId ?? null },
          undefined,
          row.scope ?? "project"
        ),
        updatedAt: new Date(),
      };
      db.insert(fleetHarnessConfig)
        .values({ ...values, createdAt: values.updatedAt })
        .onConflictDoUpdate({
          target: fleetHarnessConfig.id,
          set: {
            enabled: values.enabled,
            settings: values.settings,
            module: values.module,
            package: values.package,
            scope: values.scope,
            projectId: values.projectId,
            areaId: values.areaId,
            updatedAt: values.updatedAt,
          },
        })
        .run();
      return harnessConfigFrom({ ...values, createdAt: values.updatedAt });
    },
    getFleetHook: (id) => {
      const row = db
        .select()
        .from(fleetHooks)
        .where(eq(fleetHooks.id, id))
        .get();
      return row ? storedHookOf(row) : undefined;
    },
    putFleetHook: (hook) => {
      const values = {
        id: hook.id,
        name: hook.name,
        enabled: hook.enabled,
        event: hook.event,
        matcher: hook.matcher ?? null,
        handler: hook.handler,
        script: hook.script ?? null,
        hash: hashHookMaterial(hook),
        scope: hook.scope ?? null,
        projectId: hook.projectId ?? null,
        areaId: hook.areaId ?? null,
        updatedAt: new Date(),
      };
      db.insert(fleetHooks)
        .values({ ...values, createdAt: values.updatedAt })
        // `createdAt` is deliberately absent from the update set, like a
        // rule's: editing a hook must not reorder the list under the person
        // editing it.
        .onConflictDoUpdate({
          target: fleetHooks.id,
          set: {
            name: values.name,
            enabled: values.enabled,
            event: values.event,
            matcher: values.matcher,
            handler: values.handler,
            script: values.script,
            hash: values.hash,
            scope: values.scope,
            projectId: values.projectId,
            areaId: values.areaId,
            updatedAt: values.updatedAt,
          },
        })
        .run();
      return hookOf(values);
    },
    recordFleetHook: (version) => {
      db.insert(fleetHookHistory)
        .values({
          hookId: version.hookId,
          name: version.name,
          enabled: version.enabled,
          event: version.event,
          matcher: version.matcher ?? null,
          handler: version.handler,
          script: version.script ?? null,
          hash: version.hash,
          scope: version.scope ?? null,
          projectId: version.projectId ?? null,
          source: version.source,
        })
        .run();
      pruneHistory(
        fleetHookHistory,
        fleetHookHistory.id,
        eq(fleetHookHistory.hookId, version.hookId)
      );
    },
    listFleetHookHistory: (hookId) =>
      db
        .select()
        .from(fleetHookHistory)
        .where(
          hookId === undefined ? undefined : eq(fleetHookHistory.hookId, hookId)
        )
        .orderBy(desc(fleetHookHistory.id))
        .all()
        .map(({ id, hookId: of, name, hash, source, createdAt }) => ({
          id,
          hookId: of,
          name,
          hash,
          source,
          createdAt: createdAt.toISOString(),
        })),
    fleetHookVersion: (id) => {
      const row = db
        .select()
        .from(fleetHookHistory)
        .where(eq(fleetHookHistory.id, id))
        .get();
      // A version of an event this build does not know is none it can restore ({@link storedHookOf}).
      const event = row && hookEventNamed(row.event);
      if (!(row && event)) {
        return;
      }
      return {
        id: row.id,
        hookId: row.hookId,
        name: row.name,
        hash: row.hash,
        source: row.source,
        createdAt: row.createdAt.toISOString(),
        event,
        ...(row.matcher ? { matcher: row.matcher } : {}),
        enabled: row.enabled,
        handler: row.handler,
        ...(row.script ? { script: row.script } : {}),
        ...(row.scope ? { scope: row.scope } : {}),
        ...(row.projectId ? { projectId: row.projectId } : {}),
        ...(row.areaId ? { areaId: row.areaId } : {}),
      };
    },
    getFleetMemory,
    setFleetMemory: (content) => {
      const row = {
        id: MEMORY_ID,
        content,
        hash: hashText(content),
        updatedAt: new Date(),
      };
      db.insert(fleetMemory)
        .values(row)
        .onConflictDoUpdate({
          target: fleetMemory.id,
          set: {
            content: row.content,
            hash: row.hash,
            updatedAt: row.updatedAt,
          },
        })
        .run();
      return {
        content: row.content,
        hash: row.hash,
        updatedAt: row.updatedAt.toISOString(),
      };
    },
    listFleetMemoryDocs,
    getFleetMemoryDoc,
    putFleetMemoryDoc: ({ path: docPath, content, scope }) => {
      const written = {
        content,
        hash: hashText(content),
        updatedAt: new Date(),
        // Given, it replaces the stored scope whole; left out, the stored one stays.
        ...(scope === undefined
          ? {}
          : {
              role: scope.role ?? null,
              model: scope.model?.trim() || null,
              briefer: scope.briefer === true,
            }),
      };
      db.transaction((tx) => {
        tx.insert(fleetMemoryDocs)
          .values({ path: docPath, ...written })
          .onConflictDoUpdate({ target: fleetMemoryDocs.path, set: written })
          .run();
        if (scope === undefined) {
          return;
        }
        tx.delete(fleetMemoryDocProjects)
          .where(eq(fleetMemoryDocProjects.path, docPath))
          .run();
        for (const projectId of new Set(scope.projectIds ?? [])) {
          tx.insert(fleetMemoryDocProjects)
            .values({ path: docPath, projectId })
            .run();
        }
        tx.delete(fleetMemoryDocAreas)
          .where(eq(fleetMemoryDocAreas.path, docPath))
          .run();
        for (const areaId of new Set(scope.areaIds ?? [])) {
          tx.insert(fleetMemoryDocAreas)
            .values({ path: docPath, areaId })
            .run();
        }
        tx.delete(fleetMemoryDocTypes)
          .where(eq(fleetMemoryDocTypes.path, docPath))
          .run();
        for (const typeName of new Set(scope.delegateTypes ?? [])) {
          tx.insert(fleetMemoryDocTypes)
            .values({ path: docPath, typeName: typeName.trim() })
            .run();
        }
      });
      const stored = getFleetMemoryDoc(docPath);
      if (!stored) {
        throw new Error(`${docPath} was not stored`);
      }
      return stored;
    },
    briefingsHanded: (instanceId) =>
      new Map(
        db
          .select({ path: memoryBriefings.path, hash: memoryBriefings.hash })
          .from(memoryBriefings)
          .where(eq(memoryBriefings.instanceId, instanceId))
          .all()
          .map(({ path: docPath, hash }) => [docPath, hash])
      ),
    handBriefings: (instanceId, docs) => {
      db.transaction((tx) => {
        for (const { path: docPath, hash } of docs) {
          tx.insert(memoryBriefings)
            .values({ instanceId, path: docPath, hash })
            .onConflictDoUpdate({
              target: [memoryBriefings.instanceId, memoryBriefings.path],
              set: { hash, handedAt: new Date() },
            })
            .run();
        }
      });
    },
    forgetBriefings: (instanceId) => {
      db.delete(memoryBriefings)
        .where(eq(memoryBriefings.instanceId, instanceId))
        .run();
    },
    deleteFleetMemoryDoc: (docPath) => {
      db.delete(fleetMemoryDocs).where(eq(fleetMemoryDocs.path, docPath)).run();
    },
    recordFleetMemory: ({ content, hash, source, path: docPath }) => {
      db.insert(fleetMemoryHistory)
        .values({ content, hash, source, path: docPath ?? null })
        .run();
      pruneHistory(
        fleetMemoryHistory,
        fleetMemoryHistory.id,
        docPath === undefined
          ? isNull(fleetMemoryHistory.path)
          : eq(fleetMemoryHistory.path, docPath)
      );
    },
    listFleetMemoryHistory: (docPath) =>
      db
        .select()
        .from(fleetMemoryHistory)
        .where(
          docPath === undefined
            ? isNull(fleetMemoryHistory.path)
            : eq(fleetMemoryHistory.path, docPath)
        )
        .orderBy(desc(fleetMemoryHistory.id))
        .all()
        .map(({ id, hash, source, content, createdAt, path: of }) => ({
          id,
          hash,
          source,
          ...(of ? { path: of } : {}),
          bytes: Buffer.byteLength(content),
          createdAt: createdAt.toISOString(),
        })),
    fleetMemoryVersion: (id) => {
      const row = db
        .select()
        .from(fleetMemoryHistory)
        .where(eq(fleetMemoryHistory.id, id))
        .get();
      return row
        ? {
            id: row.id,
            hash: row.hash,
            source: row.source,
            ...(row.path ? { path: row.path } : {}),
            bytes: Buffer.byteLength(row.content),
            createdAt: row.createdAt.toISOString(),
            content: row.content,
          }
        : undefined;
    },
  };
};
