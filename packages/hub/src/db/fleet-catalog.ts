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
import type {
  FleetHook,
  HookEvent,
  HookHandler,
  HookVersion,
} from "@cawco/core/hooks";
import { and, desc, eq, isNull, notInArray, type SQL } from "drizzle-orm";
import type { AnySQLiteColumn, AnySQLiteTable } from "drizzle-orm/sqlite-core";
import { bundledSkills, starterSkills } from "../bundled-skills";
import { pluginVersion, skillName, skillVersion } from "../fleet-versions";
import type { DbCore } from "./core";
import { bindingOf, placementOf } from "./fleet-bindings";
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
  plugins,
  projects,
  skills,
} from "./schema";
import { singleton } from "./singleton";

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

/** A skill row as everything outside the hub reads it: the row, minus its files. */
const skillMeta = (
  row: Omit<typeof skills.$inferSelect, "files" | "createdAt">
): FleetSkillMeta => ({
  name: row.name,
  source: row.source,
  ...bindingOf(row, "project"),
  ...fetched(row),
});

/** The columns a skill and a plugin row keep their {@link FleetVersioned} in. */
type VersionColumns = Pick<
  typeof skills.$inferSelect,
  | "hash"
  | "version"
  | "lastRefresh"
  | "latestHash"
  | "latestVersion"
  | "checkedAt"
  | "checkError"
>;

/** A row's version, what its source held when last read, and its last fetch. */
const versioned = (row: VersionColumns): FleetVersioned => ({
  ...(row.version ? { version: row.version } : {}),
  ...(row.lastRefresh ? { lastRefresh: row.lastRefresh } : {}),
  ...(row.latestHash ? { latestHash: row.latestHash } : {}),
  ...(row.latestVersion ? { latestVersion: row.latestVersion } : {}),
  ...(row.checkedAt ? { checkedAt: row.checkedAt.getTime() } : {}),
  ...(row.checkError ? { checkError: row.checkError } : {}),
  ...(row.hash && row.latestHash && row.latestHash !== row.hash
    ? { updateAvailable: true }
    : {}),
});

/** A skill's or a plugin's row as both read: whether it is on, its last fetch, and its versions. */
const fetched = (
  row: VersionColumns &
    Pick<typeof skills.$inferSelect, "enabled" | "bytes" | "error">
): Pick<FleetPlugin, "enabled" | "hash" | "bytes" | "error"> &
  FleetVersioned => ({
  enabled: row.enabled,
  ...(row.hash ? { hash: row.hash } : {}),
  ...(row.bytes === null ? {} : { bytes: row.bytes }),
  ...(row.error ? { error: row.error } : {}),
  ...versioned(row),
});

/** A row nothing has fetched or checked yet. */
const noVersionColumns = {
  version: null,
  lastRefresh: null,
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
        lastRefresh: stored.lastRefresh,
        latestHash: stored.latestHash,
        latestVersion: stored.latestVersion,
        checkedAt: stored.checkedAt,
        checkError: stored.checkError,
      }
    : noVersionColumns;

/** The columns a {@link SourceNote} writes. */
const noteColumns = ({ lastRefresh, checked }: SourceNote) => ({
  ...(lastRefresh === undefined ? {} : { lastRefresh }),
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

/** A stored harness config row in the shape both ends of the fleet share; none for settings the hub's key does not open. */
const harnessConfigOf = (
  row: typeof fleetHarnessConfig.$inferSelect
): FleetHarnessConfig[] =>
  row.kind === "claudeSettings" && !row.settings
    ? []
    : [
        {
          kind: row.kind,
          name: row.name,
          enabled: row.enabled,
          ...(row.settings ? { settings: row.settings } : {}),
          ...(row.module ? { module: row.module } : {}),
          ...(row.package ? { package: row.package } : {}),
          ...bindingOf(row, "project"),
        },
      ];

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

/**
 * The hash a row of files is stored under: always its files' own
 * (hashFiles), whatever its writer passed, so a stored hash changes exactly
 * when its files do and no write leaves the two disagreeing.
 */
export const storedHash = (
  files: SkillFile[] | null | undefined,
  given: string | null | undefined
): string | null => (files ? hashFiles(files) : (given ?? null));

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
  /** A skill's superseded version in full: what restoring it writes back. */
  readonly fleetSkillVersion: (
    id: number
  ) => (SkillVersion & { skillSource: string; files: SkillFile[] }) | undefined;
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
    files: SkillFile[];
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
    id: AnySQLiteColumn,
    of: SQL
  ): void => {
    const keep = db
      .select({ id })
      .from(table)
      .where(of)
      .orderBy(desc(id))
      .limit(HISTORY_LIMIT)
      .all()
      .map((row) => row.id as number);
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
    files: SkillFile[];
    source: string;
  }): void => {
    db.insert(fleetSkillHistory)
      .values({
        name,
        skillSource,
        hash: hashFiles(files),
        bytes: files.reduce(
          (total, file) =>
            total + Buffer.byteLength(file.contentBase64, "base64"),
          0
        ),
        files,
        source,
      })
      .run();
    pruneHistory(
      fleetSkillHistory,
      fleetSkillHistory.id,
      eq(fleetSkillHistory.name, name)
    );
  };

  const getFleetMemory = () => {
    const row = singleton(db, fleetMemory, MEMORY_ID);
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
   * from its row only when that hash is new. The fleet's config is built for
   * every machine's welcome and delta, and it read and parsed every skill's
   * and plugin's files each time, 78 MB on the live hub, 267 ms a build
   * (measured on a copy of the live database, 2026-10-23). A row's hash is its files' (fleet
   * `hashSkillFiles`), so a kept copy under the same hash is those files.
   */
  const filesKept = new Map<string, { files: SkillFile[]; hash: string }>();

  const keptFiles = (
    key: string,
    hash: string,
    read: () => SkillFile[] | null | undefined
  ): SkillFile[] | undefined => {
    const held = filesKept.get(key);
    if (held?.hash === hash) {
      return held.files;
    }
    const files = read() ?? undefined;
    if (files) {
      filesKept.set(key, { files, hash });
    } else {
      filesKept.delete(key);
    }
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
              platforms,
              shared,
            }) => ({
              name,
              config,
              enabled,
              ...bindingOf({ projectId, areaId, scope }, "local"),
              ...(platforms ? { platforms } : {}),
              ...(shared ? { shared } : {}),
              auth: mcpAuthOf(name, authMode, authError),
            })
          ),
        marketplaces: db
          .select()
          .from(marketplaces)
          .all()
          .map(({ name, source }) => ({ name, source })),
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
              projectId: skills.projectId,
              areaId: skills.areaId,
              scope: skills.scope,
            })
            .from(skills)
            .where(eq(skills.enabled, true))
            .all()
            .flatMap(({ name, hash, projectId, areaId, scope }) => {
              const files = hash
                ? keptFiles(
                    `skill:${name}`,
                    hash,
                    () =>
                      db
                        .select({ files: skills.files })
                        .from(skills)
                        .where(eq(skills.name, name))
                        .get()?.files
                  )
                : undefined;
              return hash && files
                ? [
                    {
                      name,
                      hash,
                      files,
                      ...bindingOf({ projectId, areaId, scope }, "project"),
                    },
                  ]
                : [];
            }),
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
            version: plugins.version,
          })
          .from(plugins)
          .where(eq(plugins.enabled, true))
          .all()
          .flatMap(({ id, hash, bytes, version }) => {
            const files = hash
              ? keptFiles(
                  `plugin:${id}`,
                  hash,
                  () =>
                    db
                      .select({ files: plugins.files })
                      .from(plugins)
                      .where(eq(plugins.id, id))
                      .get()?.files
                )
              : undefined;
            if (!(hash && files)) {
              return [];
            }
            const name = id.split("@")[0] ?? id;
            return [
              {
                name,
                marketplace: id.split("@")[1] ?? "",
                hash,
                bytes: bytes ?? 0,
                files,
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
          .map(hookOf),
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
      db.update(plugins)
        .set(
          error === undefined
            ? {
                hash: storedHash(files, hash),
                bytes: bytes ?? null,
                error: null,
                files: files ?? null,
                version: version ?? null,
              }
            : { error }
        )
        .where(eq(plugins.id, id))
        .run();
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
          .select({ key: skills.name, files: skills.files })
          .from(skills)
          .all()
          .map((row) => ({ key: row.key, version: skillVersion(row.files) }));
        // The marketplace entry's version is not stored; the next fetch or
        // update check reads it.
        const pluginRows = tx
          .select({ key: plugins.id, files: plugins.files })
          .from(plugins)
          .all()
          .map((row) => ({
            key: row.key,
            version: pluginVersion(row.files, undefined),
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
          version: plugins.version,
          lastRefresh: plugins.lastRefresh,
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
    listSkills: () =>
      db
        .select({
          name: skills.name,
          source: skills.source,
          enabled: skills.enabled,
          hash: skills.hash,
          bytes: skills.bytes,
          error: skills.error,
          scope: skills.scope,
          projectId: skills.projectId,
          areaId: skills.areaId,
          version: skills.version,
          lastRefresh: skills.lastRefresh,
          latestHash: skills.latestHash,
          latestVersion: skills.latestVersion,
          checkedAt: skills.checkedAt,
          checkError: skills.checkError,
        })
        .from(skills)
        .all()
        .map(skillMeta),
    heldSkillNames: (name) => {
      const stored = db
        .select({ files: skills.files })
        .from(skills)
        .where(eq(skills.name, name))
        .get();
      const declared = skillName(stored?.files);
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
      // What this change replaces is kept first, as a hook's or a memory
      // document's is: every refresh, adopt, new source or restore that
      // moves the fleet's copy leaves the old one in the skill's history.
      if (
        !keep &&
        stored?.hash &&
        stored.files &&
        fileHash !== undefined &&
        fileHash !== stored.hash
      ) {
        recordFleetSkill({
          name,
          skillSource: stored.source,
          files: stored.files,
          source: "fleet",
        });
      }
      const row = {
        name,
        source,
        enabled: enabled ?? true,
        hash: (keep ? stored.hash : fileHash) ?? null,
        bytes: (keep ? stored.bytes : bytes) ?? null,
        error: error ?? null,
        files: (keep ? stored.files : files) ?? null,
      };
      const version = skillVersion(row.files) ?? null;
      // What a source held and what its last fetch came to are that source's:
      // a row given another source has read neither from it yet.
      const carried = sourceColumnsOf(stored, source);
      const placement = placementOf({ projectId, areaId }, stored, "project");
      db.insert(skills)
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
            files: row.files,
            version,
            ...placement,
          },
        })
        .run();
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
          files: null,
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
      if (stored?.hash && stored.files) {
        recordFleetSkill({
          name,
          skillSource: stored.source,
          files: stored.files,
          source: "fleet",
        });
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
      return row && { ...row, createdAt: row.createdAt.toISOString() };
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
      db.select().from(fleetHooks).orderBy(fleetHooks.name).all().map(hookOf),
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
      return harnessConfigOf({
        ...values,
        createdAt: values.updatedAt,
      })[0] as FleetHarnessConfig;
    },
    getFleetHook: (id) => {
      const row = db
        .select()
        .from(fleetHooks)
        .where(eq(fleetHooks.id, id))
        .get();
      return row ? hookOf(row) : undefined;
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
      if (!row) {
        return;
      }
      return {
        id: row.id,
        hookId: row.hookId,
        name: row.name,
        hash: row.hash,
        source: row.source,
        createdAt: row.createdAt.toISOString(),
        event: row.event,
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
