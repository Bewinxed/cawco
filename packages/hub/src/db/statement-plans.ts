/**
 * THE CONTROL CONNECTION READS BY KEY, AND SAYS SO AT RUNTIME. The hub's own
 * connection serves the thread every request, machine frame and timer waits
 * on; a statement on it that reads a large table whole costs that table on
 * every run. On 2026-11-18/19 such reads (a beat's reconcile filtered on an
 * unindexed column, a find's names rebuilt from every row) kept the hub's
 * thread pinned (tsk-391). A lint rule refuses an unkeyed `.all()` in the
 * source (scripts/lint/control-loop-keyed-reads.grit); a `where` SQLite still
 * answers by scanning, and raw SQL, only the plan shows.
 *
 * So once the hub listens ({@link StatementPlans.arm}), each statement the
 * connection prepares is explained once (`EXPLAIN QUERY PLAN`,
 * sqlite.org/eqp.html: "SCAN" is a full scan of a table or an index,
 * "SEARCH" a read by key). One that scans a large table without a `LIMIT`
 * is told to whoever hears it: the hub's law `control-reads-keyed`
 * (core invariant.ts), which logs it by name and files it as a defect task
 * (law-tasks.ts). A statement is known by its text with each list of
 * parameters made one (`IN (?, ?, ?)` is `IN (?)`), so a lookup of three ids
 * and one of three hundred are explained once between them; at most
 * {@link EXPLAINED_MOST} are kept.
 */
import type { Database, Statement } from "bun:sqlite";
import { isRecord } from "@cawco/core/is-record";

/**
 * The tables whose whole read costs the hub: the ones that grow with the
 * fleet's history (157 MB of sessions, 188 MB of send bodies, 118 MB of
 * doc updates and 84 MB of delegate events on the live hub, 2026-11-19).
 */
const LARGE: ReadonlySet<string> = new Set([
  "instances",
  "instance_tooling",
  "instance_conversations",
  "sent_messages",
  "sent_message_bodies",
  "work_items",
  "work_item_texts",
  "delegate_events",
  "completed_turns",
  "artifacts",
  "artifact_updates",
  "artifact_changes",
  "turn_usage",
  "usage_buckets",
  "usage_limit_history",
  "limit_events",
  "session_lines",
  "capability_calls",
  "tool_call_keys",
  "inbound_events",
  "routine_runs",
]);

/** How many statements' plans are kept as explained: past it, new ones go unexplained, and the log says so once. */
const EXPLAINED_MOST = 5000;

/** What a statement reads its rows by, as SQLite planned it (`EXPLAIN QUERY PLAN`'s `detail`). */
const SCAN = /^SCAN (\w+)/u;
/** A list of bound parameters, however long: one key for every length. */
const PARAMETER_LIST = /\(\s*\?(?:\s*,\s*\?)*\s*\)/gu;
/** What only reads or writes by statement and is no query: nothing to explain. */
const NOT_A_QUERY =
  /^\s*(?:PRAGMA|BEGIN|COMMIT|ROLLBACK|SAVEPOINT|RELEASE|CREATE|DROP|ALTER|ANALYZE|VACUUM|ATTACH|DETACH|EXPLAIN)\b/iu;
const LIMITED = /\bLIMIT\b/iu;

/** A statement that reads a large table whole. */
export interface StatementScan {
  /** The plan's own line for it, as SQLite said it. */
  detail: string;
  /** The statement, as the connection was handed it. */
  sql: string;
  table: string;
}

export interface StatementPlans {
  /** From now on, each statement prepared is explained once: what the hub does before it listens (its migrations, its boot) is not. */
  arm: () => void;
  /** Hears each scan found; those found before it are heard at once. */
  hear: (listener: (scan: StatementScan) => void) => void;
}

/** The large table `sql`'s plan reads whole, when it reads one so; undefined when it reads by key. */
const scanOf = (
  explain: (sql: string) => string[],
  sql: string
): StatementScan | undefined => {
  if (NOT_A_QUERY.test(sql) || LIMITED.test(sql)) {
    return;
  }
  let plan: string[];
  try {
    plan = explain(sql);
  } catch {
    // A statement SQLite cannot explain alone (one of several in a string):
    // its own run fails or answers as it would have.
    return;
  }
  for (const detail of plan) {
    const table = SCAN.exec(detail)?.[1];
    if (table && LARGE.has(table)) {
      return { detail, sql, table };
    }
  }
};

/**
 * Explains each statement `client` prepares, once, from {@link
 * StatementPlans.arm} on ({@link scanOf}).
 */
export const explainStatements = (client: Database): StatementPlans => {
  const explained = new Set<string>();
  const listeners: ((scan: StatementScan) => void)[] = [];
  const found: StatementScan[] = [];
  let armed = false;
  let full = false;
  const prepare = client.prepare.bind(client);
  const query = client.query.bind(client);
  /**
   * Each line of `sql`'s plan, as SQLite says it. The EXPLAIN statement is
   * finalized as soon as it is read: on Bun 1.4.4 (SQLite 3.53.4) an
   * `EXPLAIN QUERY PLAN` of a write, read whole by `.all()`, still counts as
   * a write in progress on the connection until it is finalized, so every
   * COMMIT until the collector took it failed "cannot commit transaction -
   * SQL statements in progress" (a session's credential ACK and a landing,
   * 2026-11-19).
   */
  const explain = (sql: string): string[] => {
    const statement = prepare(`EXPLAIN QUERY PLAN ${sql}`);
    try {
      return statement
        .all()
        .flatMap((row) =>
          isRecord(row) && typeof row.detail === "string" ? [row.detail] : []
        );
    } finally {
      statement.finalize();
    }
  };

  const look = (sql: string): void => {
    if (!armed) {
      return;
    }
    const key = sql.replace(PARAMETER_LIST, "(?)");
    if (explained.has(key)) {
      return;
    }
    if (explained.size >= EXPLAINED_MOST) {
      if (!full) {
        full = true;
        console.warn(
          `[db] ${EXPLAINED_MOST} statements explained on the hub's connection; new ones go unexplained until it restarts`
        );
      }
      return;
    }
    explained.add(key);
    const scan = scanOf(explain, sql);
    if (!scan) {
      return;
    }
    found.push(scan);
    for (const listener of listeners) {
      listener(scan);
    }
  };

  Object.assign(client, {
    prepare: (sql: string, ...rest: unknown[]): Statement => {
      const statement = Reflect.apply(prepare, client, [sql, ...rest]);
      look(sql);
      return statement;
    },
    query: (sql: string): Statement => {
      const statement = query(sql);
      look(sql);
      return statement;
    },
  });

  return {
    arm: () => {
      armed = true;
    },
    hear: (listener) => {
      listeners.push(listener);
      for (const scan of found) {
        listener(scan);
      }
    },
  };
};
