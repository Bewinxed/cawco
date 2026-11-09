import { idList } from "./id-list";
import { SESSION_GOES } from "./owned-rows";
import { singleton } from "./singleton";
/**
 * What the domain stores share: the connection and the closures more than
 * one of them calls. `db/index.ts` builds it once and hands it to each.
 */

import { and, inArray, not, sql } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { type AreasDb, areasDb } from "./areas";
import { type ArtifactEvents, artifactEvents, projectPage } from "./artifacts";
import type { TakeChanges } from "./board-log";
import {
  artifacts,
  fleetDeniedTools,
  instances,
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
   * Deletes session rows and everything keyed to them, inside the caller's
   * transaction — the one way a session leaves the hub, whether its machine
   * went with it or it never started at all.
   */
  const dropInstances = (tx: Tx, ids: readonly string[]): void => {
    if (ids.length === 0) {
      return;
    }
    const list = [...ids];
    revokeIdentities(tx, list);
    // What belonged to those sessions goes with them.
    for (const { table, column } of SESSION_GOES) {
      tx.run(
        sql`DELETE FROM ${sql.identifier(table)} WHERE ${sql.identifier(column)} IN (${idList(list)})`
      );
    }
    // What only pointed at one keeps its own history, pointing nowhere: a
    // delegate whose parent went.
    tx.update(instances)
      .set({ parentInstanceId: null })
      .where(inArray(instances.parentInstanceId, list))
      .run();
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
    const row = singleton(db, supervisorConfig, SUPERVISOR_CONFIG_ID);
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
