import type { HarnessKind } from "@cawco/core/harness/kinds";
import type { SessionCommands, SessionOrigin } from "@cawco/core/protocol";
import type { CapabilityKind } from "@cawco/core/suggest";
import { and, eq, gte, inArray, isNotNull, lt, sql } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import {
  agents,
  capabilityCalls,
  instanceConversations,
  instances,
  mcpServers,
} from "./schema";

/** One session's calls of one name on one day, as the counter folds them. */
export interface CapabilityCallsIn {
  count: number;
  day: string;
  instanceId: string;
  kind: CapabilityKind;
  lastAt: Date;
  name: string;
}

/** A session that called a name in a window: when last, and what the session is. */
export interface SessionCall {
  delegateType: string | null;
  harness: HarnessKind | null;
  instanceId: string;
  kind: CapabilityKind;
  lastAt: Date;
  name: string;
  origin: SessionOrigin | null;
  projectId: string | null;
}

/** What a session last listed: its skills behind `/` and its MCP servers. */
export interface SessionListing {
  commands: SessionCommands | null;
  machine: string;
  servers: string[];
}

export interface CapabilityCallsDb {
  /** Adds counted calls, summing into a row already there and keeping its newest time. */
  readonly add: (rows: CapabilityCallsIn[]) => void;
  /**
   * Each session that called a skill or an MCP server at or after `since`,
   * once per name with its newest call, and what the session is (its
   * project, delegate type, origin, harness). A session the hub no longer
   * keeps has nulls; a backfilled call of no session (`''`) is left out.
   */
  readonly bySession: (since: Date) => SessionCall[];
  /** Whether nothing has been counted yet: the backfill's cue. */
  readonly empty: () => boolean;
  /**
   * What every session active at or after `since` last listed, on which
   * machine (by its label): the skills and servers installed where it ran.
   */
  readonly listings: (since: Date) => SessionListing[];
  /** Drops every row of a day before `day`. */
  readonly prune: (day: string) => void;
  /** The fleet's MCP servers' names, enabled or not. */
  readonly serverNames: () => string[];
  /**
   * Each harness session id the hub keeps, the conversations a session
   * went on from included, to its session: what a backfilled transcript's
   * calls are kept under.
   */
  readonly sessionsById: () => Map<string, string>;
  /** Calls per kind, name and day on or after `day`, every session's summed. */
  readonly since: (
    day: string
  ) => { count: number; day: string; kind: CapabilityKind; name: string }[];
}

export const capabilityCallsDb = (
  db: BunSQLiteDatabase
): CapabilityCallsDb => ({
  add: (rows) => {
    db.transaction((tx) => {
      for (const row of rows) {
        tx.insert(capabilityCalls)
          .values(row)
          .onConflictDoUpdate({
            target: [
              capabilityCalls.instanceId,
              capabilityCalls.kind,
              capabilityCalls.name,
              capabilityCalls.day,
            ],
            set: {
              count: sql`${capabilityCalls.count} + ${row.count}`,
              lastAt: sql`max(${capabilityCalls.lastAt}, ${row.lastAt.getTime()})`,
            },
          })
          .run();
      }
    });
  },
  bySession: (since) =>
    db
      .select({
        instanceId: capabilityCalls.instanceId,
        kind: capabilityCalls.kind,
        name: capabilityCalls.name,
        lastAt: sql<Date>`max(${capabilityCalls.lastAt})`.mapWith(
          capabilityCalls.lastAt
        ),
        projectId: instances.projectId,
        delegateType: instances.delegateType,
        origin: instances.origin,
        harness: instances.harness,
      })
      .from(capabilityCalls)
      .leftJoin(instances, eq(instances.id, capabilityCalls.instanceId))
      .where(
        and(
          inArray(capabilityCalls.kind, ["skill", "mcp"]),
          gte(capabilityCalls.lastAt, since),
          sql`${capabilityCalls.instanceId} <> ''`
        )
      )
      .groupBy(
        capabilityCalls.instanceId,
        capabilityCalls.kind,
        capabilityCalls.name
      )
      .all(),
  empty: () =>
    db
      .select({ day: capabilityCalls.day })
      .from(capabilityCalls)
      .limit(1)
      .get() === undefined,
  listings: (since) =>
    db
      .select({
        commands: instances.commands,
        tooling: instances.tooling,
        machine: agents.hostname,
      })
      .from(instances)
      .innerJoin(agents, eq(agents.machineId, instances.machineId))
      .where(gte(instances.updatedAt, since))
      .all()
      .map((row) => ({
        commands: row.commands,
        machine: row.machine,
        servers: (row.tooling?.servers ?? []).map((server) => server.name),
      })),
  prune: (day) => {
    db.delete(capabilityCalls).where(lt(capabilityCalls.day, day)).run();
  },
  serverNames: () =>
    db
      .select({ name: mcpServers.name })
      .from(mcpServers)
      .all()
      .map((row) => row.name),
  sessionsById: () => {
    const ids = new Map<string, string>();
    for (const row of db
      .select({ id: instances.id, sessionId: instances.sessionId })
      .from(instances)
      .where(isNotNull(instances.sessionId))
      .all()) {
      if (row.sessionId) {
        ids.set(row.sessionId, row.id);
      }
    }
    for (const row of db
      .select({
        id: instanceConversations.instanceId,
        sessionId: instanceConversations.sessionId,
      })
      .from(instanceConversations)
      .all()) {
      ids.set(row.sessionId, row.id);
    }
    return ids;
  },
  since: (day) =>
    db
      .select({
        kind: capabilityCalls.kind,
        name: capabilityCalls.name,
        day: capabilityCalls.day,
        count: sql<number>`sum(${capabilityCalls.count})`.mapWith(Number),
      })
      .from(capabilityCalls)
      .where(gte(capabilityCalls.day, day))
      .groupBy(capabilityCalls.kind, capabilityCalls.name, capabilityCalls.day)
      .all(),
});
