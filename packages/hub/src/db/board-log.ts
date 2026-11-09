import type { Database, Statement } from "bun:sqlite";

/** Takes the ids of the `instances` rows written since the board last read them, on this connection. */
export type TakeChanges = Statement<{ id: string }, []>;

/**
 * Creates the board's change log on the hub's connection (temporary, gone
 * with it) and its reader. Built once, after the migrations.
 */
export const boardChangeLog = (client: Database): TakeChanges => {
  // THE BOARD'S CHANGE LOG: the id of every `instances` row written since the
  // board last read it, on this connection, which is the only one that writes
  // the table. Temporary (this connection's own, gone with it), so a hub
  // starts with an empty log and a board read whole. The board reads only
  // these rows again instead of every row on every publish, which with
  // 2,600 rows held the hub's thread for seconds when twenty sessions moved
  // at once (2026-10-09). A foreign key's own action (a project deleted, its
  // sessions' `project_id` set null) fires these as any write does.
  // No key and no conflict clause: a trigger's `OR IGNORE` yields to the
  // statement that fired it, so a register's upsert that touched a row twice
  // failed whole on a unique id here. Repeats are folded when the log is taken.
  client.run(
    "CREATE TEMP TABLE IF NOT EXISTS instance_changes (id TEXT NOT NULL)"
  );
  client.run(
    "CREATE TEMP TRIGGER IF NOT EXISTS instance_inserted AFTER INSERT ON main.instances BEGIN INSERT INTO instance_changes (id) VALUES (new.id); END"
  );
  client.run(
    "CREATE TEMP TRIGGER IF NOT EXISTS instance_updated AFTER UPDATE ON main.instances BEGIN INSERT INTO instance_changes (id) VALUES (old.id), (new.id); END"
  );
  client.run(
    "CREATE TEMP TRIGGER IF NOT EXISTS instance_deleted AFTER DELETE ON main.instances BEGIN INSERT INTO instance_changes (id) VALUES (old.id); END"
  );
  // A work item ending moves its session's row on the board as a write to
  // the row would: whether the session's sleep keeps it listed is the
  // item's ({@link listedAt}).
  client.run(
    "CREATE TEMP TRIGGER IF NOT EXISTS work_item_state AFTER UPDATE OF state ON main.work_items WHEN old.state IS NOT new.state BEGIN INSERT INTO instance_changes (id) VALUES (new.instance_id); END"
  );
  return client.prepare<{ id: string }, []>(
    "DELETE FROM instance_changes RETURNING id"
  );
};
