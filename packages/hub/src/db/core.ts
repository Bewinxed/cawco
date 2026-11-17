/**
 * What the domain stores share: the connection and the closures more than
 * one of them calls. `db/index.ts` builds it once and hands it to each.
 */

import { and, eq, inArray, not, sql } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { type AreasDb, areasDb } from "./areas";
import { type ArtifactEvents, artifactEvents, projectPage } from "./artifacts";
import type { TakeChanges } from "./board-log";
import { idList } from "./id-list";
import { walkOwned } from "./owned-rows";
import {
  artifacts,
  fleetDeniedTools,
  instanceConversations,
  instances,
  purgedSessions,
  SUPERVISOR_CONFIG_ID,
  supervisorConfig,
} from "./schema";
import { type Revocations, revocations } from "./session-identity";
import { type TaskLinksDb, taskLinksDb } from "./task-links";
import type { Tx } from "./tx";

export interface DbCore extends ArtifactEvents, Revocations {
  /** The areas and which project sits in which (db/areas.ts). */
  readonly areasStore: AreasDb;
  readonly db: BunSQLiteDatabase;
  /** The fleet's tool denials, in the order they were added. */
  readonly deniedToolNames: () => string[];
  /** Deletes session rows and everything keyed to them, inside the caller's transaction. */
  readonly dropInstances: (tx: Tx, ids: readonly string[]) => void;
  /** The fleet's choices row, which drizzle 0032 writes on every hub. */
  readonly supervisorChoices: () => typeof supervisorConfig.$inferSelect;
  /** The board's change log (db/board-log.ts). */
  readonly takeChanges: TakeChanges;
  readonly taskLinksOf: TaskLinksDb;
}

export const dbCore = (
  db: BunSQLiteDatabase,
  takeChanges: TakeChanges
): DbCore => {
  const areasStore = areasDb(db);
  const taskLinksOf = taskLinksDb(db);
  const events = artifactEvents(db);
  const credentials = revocations(db);
  const { dropArtifacts } = events;
  const { revokeIdentities } = credentials;

  /**
   * Every conversation of the sessions `ids` that no other session still
   * holds, recorded purged (`purged_sessions`, by its machine and harness
   * key): find and Recent leave it out though its machine's index keeps its
   * words. Its current one and each it went on from (`instance_conversations`)
   * are on its machine; one a fold handed to the survivor, which reads it as
   * its own earlier conversation, stays.
   */
  const purgeConversations = (tx: Tx, ids: string[]): void => {
    const going = new Set(ids);
    const named = [
      ...tx
        .select({
          instanceId: instances.id,
          machineId: instances.machineId,
          sessionId: instances.sessionId,
        })
        .from(instances)
        .where(inArray(instances.id, ids))
        .all(),
      ...tx
        .select({
          instanceId: instanceConversations.instanceId,
          machineId: instances.machineId,
          sessionId: instanceConversations.sessionId,
        })
        .from(instanceConversations)
        .innerJoin(
          instances,
          eq(instances.id, instanceConversations.instanceId)
        )
        .where(inArray(instanceConversations.instanceId, ids))
        .all(),
    ].flatMap(({ machineId, sessionId }) =>
      sessionId ? [{ machineId, sessionId }] : []
    );
    if (named.length === 0) {
      return;
    }
    const keys = [...new Set(named.map((one) => one.sessionId))];
    const held = new Set(
      [
        ...tx
          .select({ id: instances.id, sessionId: instances.sessionId })
          .from(instances)
          .where(inArray(instances.sessionId, keys))
          .all(),
        ...tx
          .select({
            id: instanceConversations.instanceId,
            sessionId: instanceConversations.sessionId,
          })
          .from(instanceConversations)
          .where(inArray(instanceConversations.sessionId, keys))
          .all(),
      ].flatMap(({ id, sessionId }) =>
        going.has(id) || !sessionId ? [] : [sessionId]
      )
    );
    const purgedAt = new Date();
    const purged = named
      .filter((one) => !held.has(one.sessionId))
      .map((one) => ({ ...one, purgedAt }));
    if (purged.length > 0) {
      tx.insert(purgedSessions).values(purged).onConflictDoNothing().run();
    }
  };

  /**
   * Deletes session rows and everything keyed to them, inside the caller's
   * transaction — the one way a session leaves the hub, whether its machine
   * went with it or it never started at all.
   */
  const dropInstances = (tx: Tx, ids: readonly string[]): void => {
    if (ids.length === 0) {
      return;
    }
    const list = [...ids];
    purgeConversations(tx, list);
    // What belonged to those sessions goes with them; what only pointed at
    // one keeps its own history, pointing nowhere (a delegate whose parent
    // went); and what their credentials granted ends.
    walkOwned(
      "drop",
      { session_identities: () => revokeIdentities(tx, list) },
      ({ column, drop }) => {
        const name = column.table;
        const by = sql.identifier(column.name);
        tx.run(
          drop === "delete"
            ? sql`DELETE FROM ${name} WHERE ${by} IN (${idList(list)})`
            : sql`UPDATE ${name} SET ${by} = NULL WHERE ${by} IN (${idList(list)})`
        );
      }
    );
    // Their artifacts go with them, but a project's page: its life is its
    // source's in the project's folder, so it stays with no session (the
    // key's set null), its picks and places kept.
    dropArtifacts(
      tx,
      and(inArray(artifacts.instanceId, list), not(projectPage))
    );
    tx.delete(instances).where(inArray(instances.id, list)).run();
  };

  const deniedToolNames = (): string[] =>
    db
      .select({ tool: fleetDeniedTools.tool })
      .from(fleetDeniedTools)
      .orderBy(sql`rowid`)
      .all()
      .map(({ tool }) => tool);

  /** The fleet's choices row, which drizzle 0032 writes on every hub. */
  const supervisorChoices = (): typeof supervisorConfig.$inferSelect => {
    const row = db
      .select()
      .from(supervisorConfig)
      .where(eq(supervisorConfig.id, SUPERVISOR_CONFIG_ID))
      .get();
    if (!row) {
      throw new Error(
        `supervisor_config has no '${SUPERVISOR_CONFIG_ID}' row: drizzle 0032 writes it, so this database did not migrate`
      );
    }
    return row;
  };

  return {
    ...events,
    ...credentials,
    areasStore,
    db,
    deniedToolNames,
    dropInstances,
    supervisorChoices,
    takeChanges,
    taskLinksOf,
  };
};
