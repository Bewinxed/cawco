/** MCP servers: their rows, oauth state, sessions, listings and policies. */

import type {
  FleetMcpConfig,
  FleetMcpServer,
  McpPlatform,
} from "@cawco/core/fleet";
import type { ToolPolicy } from "@cawco/core/tools";
import { and, eq, isNotNull, lt } from "drizzle-orm";
import type { DbCore } from "./core";
import { bindingOf, placementOf } from "./fleet-bindings";
import {
  fleetMcpOauth,
  fleetMcpSessions,
  mcpServers,
  mcpToolListings,
  tools,
} from "./schema";

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
    | (Omit<typeof mcpServers.$inferSelect, "config"> & {
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
   * null every platform, left out as it was. `shared`, one instance per
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
      // A config the hub's key does not open is no server until it is saved again.
      return row?.config ? { ...row, config: row.config } : undefined;
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
        // A sign-in under way is sealed, so its state is found by opening
        // each one: a fleet holds a handful.
        const row = tx
          .select()
          .from(fleetMcpOauth)
          .where(isNotNull(fleetMcpOauth.pending))
          .all()
          .find((one) => one.pending?.state === state);
        if (!row?.pending || row.pending.expiresAt <= Date.now()) {
          return;
        }
        tx.update(fleetMcpOauth)
          .set({ pending: null })
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
      const asked = platforms?.length ? platforms : null;
      const runsOn =
        platforms === undefined ? (previous?.platforms ?? null) : asked;
      const one = shared ?? previous?.shared ?? false;
      // A new or changed config is unsettled — failed, so never synced — until
      // the hub hears from the server (fleet-mcp.ts `#probe`).
      const unsettled = {
        authMode: "direct" as const,
        authError: MCP_NOT_YET_REACHED,
      };
      db.insert(mcpServers)
        .values({
          name,
          config,
          enabled: enabled ?? true,
          platforms: runsOn,
          shared: one,
          ...placement,
          ...unsettled,
        })
        .onConflictDoUpdate({
          target: mcpServers.name,
          set: {
            config,
            enabled: enabled ?? true,
            platforms: runsOn,
            shared: one,
            ...placement,
            ...(changed ? unsettled : {}),
          },
        })
        .run();
      return {
        name,
        config,
        enabled: enabled ?? true,
        ...bindingOf(placement, "local"),
        ...(runsOn ? { platforms: runsOn } : {}),
        ...(one ? { shared: one } : {}),
      };
    },
  };
};
