import type { Database, Statement } from "bun:sqlite";

/**
 * What a write moved on the board, by the collection that lays it
 * (board-store.ts): a session's row (its id), the running delegates above a
 * work item (its parent's id), a session's stop at its limit (its id), a
 * machine's facts, its status or its inventory (the machine's id), a former
 * id, a continuation job.
 */
export type BoardChangeKind =
  | "session"
  | "delegates"
  | "stall"
  | "machine"
  | "machine_status"
  | "inventory"
  | "former"
  | "continuation";

/** One logged change: what moved and its key. */
export interface BoardChange {
  id: string;
  kind: BoardChangeKind;
}

/** Takes every change logged since the board last took them, on this connection. */
export type TakeChanges = Statement<BoardChange, []>;

/**
 * A table the board reads, and what a write to it moved: `key` is the
 * column (of the row written, `old.` and `new.`) the change is filed under.
 * `columns` names the columns whose change moves it: every column when
 * absent, every column but `except` when that is given. An update that
 * leaves all of them as they were logs nothing, so a write that changes
 * nothing the board says (a beat's `last_seen_at`, a report the same as the
 * last) costs no publish.
 */
interface Logged {
  columns?: readonly string[];
  except?: readonly string[];
  key: string;
  kind: BoardChangeKind;
  /** A name of its own for the trigger, for a table logged more than once. */
  name: string;
  /** Inserts and deletes move it too. Default true. */
  rows?: boolean;
  table: string;
}

/**
 * Every write the board hears of, by table. A session's row is everything
 * a reader is handed of it but what only the hub's own steps read (how its
 * end is confirmed and retried, what it owes its next start, whether a turn
 * is open, which keep-alive turn runs): those move nothing on the board.
 */
const LOGGED: readonly Logged[] = [
  {
    name: "instances",
    table: "instances",
    key: "id",
    kind: "session",
    except: [
      "end_confirmed_at",
      "end_reason",
      "scratch_worktree",
      "end_retry_at",
      "end_attempts",
      "owed_spawn",
      "owed_at",
      "fresh_start_at",
      "turn_open_at",
      "keep_alive_turn",
    ],
  },
  // A work item's state lists its session (a delegate's sleep is listed
  // while its item lives, db instances.ts `listedAt`) and its workspace is
  // the row's `workspaceId`.
  {
    name: "work_item_session",
    table: "work_items",
    key: "instance_id",
    kind: "session",
    columns: ["state", "workspace_id", "instance_id"],
  },
  // A work item starting or ending moves the running delegates of every
  // session above it.
  {
    name: "work_item_delegates",
    table: "work_items",
    key: "parent_instance_id",
    kind: "delegates",
    columns: ["state", "parent_instance_id"],
  },
  {
    name: "may_start",
    table: "instance_may_start",
    key: "instance_id",
    kind: "session",
  },
  {
    name: "starting_set",
    table: "instance_starting_set",
    key: "instance_id",
    kind: "session",
  },
  {
    name: "owed_moves",
    table: "owed_moves",
    key: "instance_id",
    kind: "session",
  },
  // A session stopped at its limit, held or stranded, says so on its row.
  {
    name: "limit_holds",
    table: "limit_holds",
    key: "instance_id",
    kind: "stall",
  },
  {
    name: "stranded",
    table: "stranded_sessions",
    key: "instance_id",
    kind: "stall",
  },
  {
    name: "machine_facts",
    table: "agents",
    key: "machine_id",
    kind: "machine",
    columns: [
      "machine_id",
      "hostname",
      "os",
      "auth",
      "build",
      "home",
      "paused_until",
      "pause_stopped_commands",
      "pause_stopped_unread",
    ],
  },
  {
    name: "machine_status",
    table: "agents",
    key: "machine_id",
    kind: "machine_status",
    columns: ["machine_id", "status"],
  },
  {
    name: "machine_inventory",
    table: "agents",
    key: "machine_id",
    kind: "inventory",
    columns: [
      "machine_id",
      "fleet",
      "fleet_sync",
      "fleet_items",
      "machine_capabilities",
    ],
  },
  {
    name: "agent_tools",
    table: "agent_tools",
    key: "machine_id",
    kind: "inventory",
  },
  {
    name: "agent_harnesses",
    table: "agent_harnesses",
    key: "machine_id",
    kind: "inventory",
  },
  {
    name: "chosen_modes",
    table: "chosen_modes",
    key: "machine_id",
    kind: "machine",
  },
  { name: "aliases", table: "instance_aliases", key: "id", kind: "former" },
  {
    name: "continuations",
    table: "continuations",
    key: "id",
    kind: "continuation",
    // A job's slip (db continuations.ts `ContinuationSlip`); its prepared
    // inputs and its request are no frame's.
    except: ["prepared", "request"],
  },
];

const quote = (name: string): string => `"${name.replaceAll('"', '""')}"`;

/** `table`'s columns, as the database has them. */
const columnsOf = (client: Database, table: string): string[] =>
  client
    .query<{ name: string }, [string]>("SELECT name FROM pragma_table_info(?)")
    .all(table)
    .map((row) => row.name);

/** The columns whose change moves `logged`, each checked to be the table's. */
const watched = (client: Database, logged: Logged): string[] => {
  const all = columnsOf(client, logged.table);
  const named = [
    logged.key,
    ...(logged.columns ?? []),
    ...(logged.except ?? []),
  ];
  const unknown = named.filter((column) => !all.includes(column));
  if (unknown.length > 0) {
    throw new Error(
      `The board's change log names ${unknown.join(", ")} on ${logged.table}, which it does not have.`
    );
  }
  if (logged.columns) {
    return [...logged.columns];
  }
  const except = new Set(logged.except ?? []);
  return all.filter((column) => !except.has(column));
};

/** The temporary triggers that log `logged`'s writes. */
const triggersOf = (client: Database, logged: Logged): string[] => {
  const columns = watched(client, logged);
  const key = quote(logged.key);
  const table = `main.${quote(logged.table)}`;
  const insert = (row: "old" | "new") =>
    `INSERT INTO board_changes (kind, id) SELECT '${logged.kind}', ${row}.${key} WHERE ${row}.${key} IS NOT NULL`;
  const moved = columns
    .map((column) => `old.${quote(column)} IS NOT new.${quote(column)}`)
    .join(" OR ");
  const name = (what: string) => `board_${logged.name}_${what}`;
  return [
    ...(logged.rows === false
      ? []
      : [
          `CREATE TEMP TRIGGER IF NOT EXISTS ${name("inserted")} AFTER INSERT ON ${table} BEGIN ${insert("new")}; END`,
          `CREATE TEMP TRIGGER IF NOT EXISTS ${name("deleted")} AFTER DELETE ON ${table} BEGIN ${insert("old")}; END`,
        ]),
    `CREATE TEMP TRIGGER IF NOT EXISTS ${name("updated")} AFTER UPDATE OF ${columns.map(quote).join(", ")} ON ${table} WHEN ${moved} BEGIN ${insert("old")}; ${insert("new")}; END`,
  ];
};

/**
 * Creates the board's change log on the hub's connection (temporary, gone
 * with it) and its reader. Built once, after the migrations.
 *
 * THE BOARD'S CHANGE LOG: what every write to a table the board reads moved,
 * by kind and key, since the board last took it, on this connection, which
 * is the only one that writes those tables. Temporary (this connection's
 * own, gone with it), so a hub starts with an empty log and a board read
 * whole. The board reads again only what the log names, instead of
 * everything on every publish, which with 2,600 rows held the hub's thread
 * for seconds when twenty sessions moved at once (2026-10-09). A foreign
 * key's own action (a project deleted, its sessions' `project_id` set null)
 * fires these as any write does.
 * No key and no conflict clause: a trigger's `OR IGNORE` yields to the
 * statement that fired it, so a register's upsert that touched a row twice
 * failed whole on a unique id here. Repeats are folded when the log is taken.
 */
export const boardChangeLog = (client: Database): TakeChanges => {
  client.run(
    "CREATE TEMP TABLE IF NOT EXISTS board_changes (kind TEXT NOT NULL, id TEXT NOT NULL)"
  );
  for (const logged of LOGGED) {
    for (const trigger of triggersOf(client, logged)) {
      client.run(trigger);
    }
  }
  return client.prepare<BoardChange, []>(
    "DELETE FROM board_changes RETURNING kind, id"
  );
};

/** Whether `sql` may write: anything but a read, conservatively. */
const READS = /^\s*(?:select|pragma|explain)\b/iu;

/** The statement methods that run it. */
const RUNS = ["run", "all", "get", "values", "iterate"] as const;

/**
 * Hears every statement on `client` that may write, once it has run:
 * `wrote` is called after it, so the board's change log is taken on the
 * turn after any write (board-store.ts) and no writer has to say what it
 * wrote. bun:sqlite gives no update or commit hook (its `Database` has
 * neither), so the connection's own entry points are wrapped: a statement
 * prepared or queried, and SQL run directly. A read never calls it. The
 * board's own take (`boardChangeLog`) is prepared before this, so taking the
 * log is not heard as a write.
 */
export const hearWrites = (client: Database, wrote: () => void): void => {
  const heard = new WeakSet<object>();
  const hear = <S extends Statement>(statement: S, sql: string): S => {
    if (READS.test(sql) || heard.has(statement)) {
      return statement;
    }
    heard.add(statement);
    for (const method of RUNS) {
      const run = statement[method];
      if (typeof run !== "function") {
        continue;
      }
      Object.defineProperty(statement, method, {
        value: (...args: unknown[]) => {
          try {
            return Reflect.apply(run, statement, args);
          } finally {
            wrote();
          }
        },
      });
    }
    return statement;
  };
  const prepare = client.prepare.bind(client);
  const query = client.query.bind(client);
  const run = client.run.bind(client);
  const exec = client.exec.bind(client);
  Object.assign(client, {
    prepare: (sql: string, ...rest: unknown[]) =>
      hear(Reflect.apply(prepare, client, [sql, ...rest]), sql),
    query: (sql: string) => hear(query(sql), sql),
    run: (sql: string, ...rest: unknown[]) => {
      try {
        return Reflect.apply(run, client, [sql, ...rest]);
      } finally {
        if (!READS.test(sql)) {
          wrote();
        }
      }
    },
    exec: (sql: string, ...rest: unknown[]) => {
      try {
        return Reflect.apply(exec, client, [sql, ...rest]);
      } finally {
        if (!READS.test(sql)) {
          wrote();
        }
      }
    },
  });
};
