/** MCP servers: their rows, oauth state, sessions, listings and policies. */

import type {
  FleetMcpConfig,
  FleetMcpServer,
  McpPlatform,
} from "@cawco/core/fleet";
import type { ToolPolicy } from "@cawco/core/tools";
import { and, eq, lt, sql } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import type { DbCore } from "./core";
import { bindingOf, placementOf } from "./fleet-bindings";
import {
  fleetMcpOauth,
  fleetMcpSessions,
  mcpServerPlatforms,
  mcpServers,
  mcpToolListings,
  tools,
} from "./schema";
import type { Tx } from "./tx";

type McpServerRow = typeof mcpServers.$inferSelect;

/** Where a server runs, as core `FleetMcpServer` says it. */
export type McpRunsOn = Pick<FleetMcpServer, "platforms" | "platformsUnread">;

/**
 * Where a server's row says it runs: every machine, or the platforms
 * `listed` names (its {@link mcpServerPlatforms} rows, in order); and
 * whether its saved platforms can't be read, which sends it to none.
 */
export const runsOnOf = (
  row: Pick<McpServerRow, "everyPlatform" | "platformsUnread">,
  listed: readonly McpPlatform[]
): McpRunsOn => ({
  ...(row.everyPlatform ? {} : { platforms: [...listed] }),
  ...(row.platformsUnread === null ? {} : { platformsUnread: true }),
});

/** Every server's {@link mcpServerPlatforms} rows, by server, each in the order saved. */
export const listedPlatforms = (
  db: Pick<BunSQLiteDatabase | Tx, "select">,
  name?: string
): Map<string, McpPlatform[]> => {
  const listed = new Map<string, McpPlatform[]>();
  for (const row of db
    .select()
    .from(mcpServerPlatforms)
    .where(
      name === undefined ? undefined : eq(mcpServerPlatforms.serverName, name)
    )
    .orderBy(sql`${mcpServerPlatforms}.rowid`)
    .all()) {
    listed.set(row.serverName, [
      ...(listed.get(row.serverName) ?? []),
      row.platform,
    ]);
  }
  return listed;
};

/** A fleet MCP server's sign-in under way, let go: no redirect matches it. */
export const SIGN_IN_TAKEN = {
  pendingState: null,
  pendingRedirectUri: null,
  pendingExpiresAt: null,
  pendingAccess: null,
  pendingVerifier: null,
} as const;

/** A fleet MCP server's detail between saving a new config and the server's first answer. */
const MCP_NOT_YET_REACHED = "The hub has not reached this server yet.";

export interface McpServersDb {
  readonly deleteMcpOauth: (name: string) => void;
  /** A fleet MCP relay session closed: its `initialize` params go. */
  readonly deleteMcpSession: (id: string) => void;
  readonly getMcpOauth: (
    name: string
  ) => typeof fleetMcpOauth.$inferSelect | undefined;
  readonly getMcpServer: (name: string) =>
    | (Omit<McpServerRow, "config" | "everyPlatform" | "platformsUnread"> &
        McpRunsOn & {
          config: FleetMcpConfig;
        })
    | undefined;
  /** The `initialize` params a fleet MCP relay session of `server` opened with, if it is kept. */
  readonly getMcpSession: (
    id: string,
    server: string
  ) => Record<string, unknown> | undefined;
  /** The fleet's tool policy (NEW.md §10) — only the tools somebody has ruled on. */
  readonly listToolPolicies: () => ToolPolicy[];
  /** Drops the fleet MCP relay sessions unused since `before`; answers how many. */
  readonly pruneMcpSessions: (before: Date) => number;
  readonly putMcpOauth: (row: typeof fleetMcpOauth.$inferInsert) => void;
  /**
   * Upsert. `projectId` binds it to one project (placed at each of its
   * checkouts and workspaces), null makes it every machine's, and left out
   * keeps what it was. `platforms` the same way: the platforms it runs on,
   * null (or none) every platform, left out as it was; named, they replace
   * saved platforms that could not be read. `shared`, one instance per
   * machine started at its first call, left out as it was.
   */
  readonly putMcpServer: (server: {
    name: string;
    config: FleetMcpServer["config"];
    enabled?: boolean;
    projectId?: string | null;
    /** As `projectId`, bound to every project in that area instead. */
    areaId?: string | null;
    platforms?: McpPlatform[] | null;
    shared?: boolean;
  }) => FleetMcpServer;
  /** A fleet MCP relay session opened: its `initialize` params, kept across hub restarts. */
  readonly putMcpSession: (row: {
    id: string;
    server: string;
    init: Record<string, unknown>;
  }) => void;
  readonly putToolListing: (listing: string, toolsHash: string) => void;
  /** Upsert; a patch names only what it changes and the rest stays as it was. */
  readonly putToolPolicy: (
    id: string,
    patch: { required?: boolean; pinnedVersion?: string | null }
  ) => ToolPolicy;
  readonly setMcpAuth: (
    name: string,
    mode: "direct" | "oauth",
    error?: string
  ) => void;
  /**
   * The row whose sign-in under way `state` names, while it has not lapsed,
   * with that sign-in let go in the same transaction: a second redirect with
   * the same `state` finds nothing.
   */
  readonly takeMcpAuthorization: (
    state: string
  ) => typeof fleetMcpOauth.$inferSelect | undefined;
  /** The hash of the tools a cawco MCP listing last answered, if it has. */
  readonly toolListing: (listing: string) => string | undefined;
  /** A fleet MCP relay session was used now. */
  readonly touchMcpSession: (id: string) => void;
}

export const mcpServersDb = (core: DbCore): McpServersDb => {
  const { db } = core;

  return {
    toolListing: (listing) =>
      db
        .select({ toolsHash: mcpToolListings.toolsHash })
        .from(mcpToolListings)
        .where(eq(mcpToolListings.listing, listing))
        .get()?.toolsHash,
    putToolListing: (listing, toolsHash) => {
      const row = { listing, toolsHash, listedAt: new Date() };
      db.insert(mcpToolListings)
        .values(row)
        .onConflictDoUpdate({ target: mcpToolListings.listing, set: row })
        .run();
    },
    getMcpServer: (name) => {
      const row = db
        .select()
        .from(mcpServers)
        .where(eq(mcpServers.name, name))
        .get();
      if (!row?.config) {
        // A config the hub's key does not open is no server until it is saved again.
        return;
      }
      const { everyPlatform, platformsUnread, ...rest } = row;
      return {
        ...rest,
        config: row.config,
        ...runsOnOf(
          { everyPlatform, platformsUnread },
          listedPlatforms(db, name).get(name) ?? []
        ),
      };
    },
    getMcpOauth: (name) =>
      db.select().from(fleetMcpOauth).where(eq(fleetMcpOauth.name, name)).get(),
    putMcpOauth: (row) => {
      db.insert(fleetMcpOauth)
        .values(row)
        .onConflictDoUpdate({ target: fleetMcpOauth.name, set: row })
        .run();
    },
    deleteMcpOauth: (name) => {
      db.delete(fleetMcpOauth).where(eq(fleetMcpOauth.name, name)).run();
    },
    getMcpSession: (id, server) =>
      db
        .select({ init: fleetMcpSessions.init })
        .from(fleetMcpSessions)
        .where(
          and(eq(fleetMcpSessions.id, id), eq(fleetMcpSessions.server, server))
        )
        .get()?.init,
    putMcpSession: ({ id, server, init }) => {
      const row = { id, server, init, usedAt: new Date() };
      db.insert(fleetMcpSessions)
        .values(row)
        .onConflictDoUpdate({ target: fleetMcpSessions.id, set: row })
        .run();
    },
    touchMcpSession: (id) => {
      db.update(fleetMcpSessions)
        .set({ usedAt: new Date() })
        .where(eq(fleetMcpSessions.id, id))
        .run();
    },
    deleteMcpSession: (id) => {
      db.delete(fleetMcpSessions).where(eq(fleetMcpSessions.id, id)).run();
    },
    pruneMcpSessions: (before) =>
      db
        .delete(fleetMcpSessions)
        .where(lt(fleetMcpSessions.usedAt, before))
        .returning({ id: fleetMcpSessions.id })
        .all().length,
    setMcpAuth: (name, mode, error) => {
      db.update(mcpServers)
        .set({ authMode: mode, authError: error ?? null })
        .where(eq(mcpServers.name, name))
        .run();
    },
    takeMcpAuthorization: (state) =>
      db.transaction((tx) => {
        const row = tx
          .select()
          .from(fleetMcpOauth)
          .where(eq(fleetMcpOauth.pendingState, state))
          .get();
        if (
          !row?.pendingExpiresAt ||
          row.pendingExpiresAt.getTime() <= Date.now()
        ) {
          return;
        }
        tx.update(fleetMcpOauth)
          .set(SIGN_IN_TAKEN)
          .where(eq(fleetMcpOauth.name, row.name))
          .run();
        return row;
      }),
    listToolPolicies: () =>
      db
        .select()
        .from(tools)
        .all()
        .map(({ id, required, pinnedVersion }) => ({
          id,
          required,
          pinnedVersion,
        })),
    putToolPolicy: (id, { required, pinnedVersion }) => {
      const stored = db.select().from(tools).where(eq(tools.id, id)).get();
      const policy: ToolPolicy = {
        id,
        required: required ?? stored?.required ?? false,
        pinnedVersion:
          pinnedVersion === undefined
            ? (stored?.pinnedVersion ?? null)
            : pinnedVersion,
      };
      db.insert(tools)
        .values(policy)
        .onConflictDoUpdate({
          target: tools.id,
          set: {
            required: policy.required,
            pinnedVersion: policy.pinnedVersion,
          },
        })
        .run();
      return policy;
    },
    putMcpServer: ({
      name,
      config,
      enabled,
      projectId,
      areaId,
      platforms,
      shared,
    }) => {
      const previous = db
        .select()
        .from(mcpServers)
        .where(eq(mcpServers.name, name))
        .get();
      const changed =
        !previous || JSON.stringify(previous.config) !== JSON.stringify(config);
      if (changed) {
        db.delete(fleetMcpOauth).where(eq(fleetMcpOauth.name, name)).run();
      }
      const placement = placementOf({ projectId, areaId }, previous, "local");
      // Platforms named (an empty list is every machine) replace what it
      // had, an unread value included; left out, they stay as they were.
      const asked = platforms?.length ? [...new Set(platforms)] : null;
      const runs =
        platforms === undefined
          ? {
              everyPlatform: previous?.everyPlatform ?? true,
              platformsUnread: previous?.platformsUnread ?? null,
            }
          : { everyPlatform: asked === null, platformsUnread: null };
      const one = shared ?? previous?.shared ?? false;
      // A new or changed config is unsettled — failed, so never synced — until
      // the hub hears from the server (fleet-mcp.ts `#probe`).
      const unsettled = {
        authMode: "direct" as const,
        authError: MCP_NOT_YET_REACHED,
      };
      const listed = db.transaction((tx) => {
        tx.insert(mcpServers)
          .values({
            name,
            config,
            enabled: enabled ?? true,
            ...runs,
            shared: one,
            ...placement,
            ...unsettled,
          })
          .onConflictDoUpdate({
            target: mcpServers.name,
            set: {
              config,
              enabled: enabled ?? true,
              ...runs,
              shared: one,
              ...placement,
              ...(changed ? unsettled : {}),
            },
          })
          .run();
        if (platforms === undefined) {
          return listedPlatforms(tx, name).get(name) ?? [];
        }
        tx.delete(mcpServerPlatforms)
          .where(eq(mcpServerPlatforms.serverName, name))
          .run();
        for (const platform of asked ?? []) {
          tx.insert(mcpServerPlatforms)
            .values({ serverName: name, platform })
            .run();
        }
        return asked ?? [];
      });
      return {
        name,
        config,
        enabled: enabled ?? true,
        ...bindingOf(placement, "local"),
        ...runsOnOf(runs, listed),
        ...(one ? { shared: one } : {}),
      };
    },
  };
};
