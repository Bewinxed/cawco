/**
 * Before migration 0414's SQL runs, the hub's log names every continuation
 * job whose stored asker (`continuations.asked_by`, who asked for the job,
 * as JSON) or wait (`continuations.waiting`) 0414 keeps as not read: a
 * value that is there and does not read whole as the hub read it, with why.
 *
 * The predicates below are 0414's own: its SQL was written from them, over
 * the JSON columns as they stand before it. {@link ASKER} and {@link WAIT}
 * are the columns' shapes as the hub read them then (stored/columns.json
 * at 0414, `ContinuationAsker` and the wait's object), frozen here, so a
 * later change to either type changes nothing 0414 does.
 * {@link continuationsKept} reads every job with them, for the count taken
 * on a copy before 0414 runs (scripts/continuations-moves-relay.ts).
 *
 * Every JSON function sits inside a CASE that has proved its column JSON
 * (db/json-reads.ts): SQLite may run the right side of an AND first.
 */
import type { Database } from "bun:sqlite";
import {
  anyOf,
  FLAG,
  inJson,
  kinded,
  listOf,
  literal,
  NUMBER,
  NUMBER_OR_NULL,
  nullable,
  object,
  oneOf,
  readsWhole,
  TEXT,
  TEXT_OR_NULL,
  TRUE,
} from "./json-reads";
import { shown } from "./lifted-reading";

/** An account a line names (core `NamedAccount`). */
const ACCOUNT = object({
  hue: oneOf("amber", "blue", "cyan", "green", "orange", "rose", "violet"),
  id: TEXT,
  name: TEXT,
});

/** Why a move went (core `MoveBecause`). */
const BECAUSE = anyOf(
  kinded("forecast", { runsOutAt: NUMBER }),
  kinded("cold", { wake: FLAG }),
  kinded("refused"),
  kinded("extra-usage")
);

/** What a move cost of a window. */
const COST = object({ pct: NUMBER, window: TEXT });

/** Why an account was passed over (core `HeldAccount`'s reason). */
const PASSED_OVER = anyOf(
  kinded("signin"),
  kinded("allowed", { by: oneOf("project", "task") }),
  kinded("benched"),
  kinded("reserve", { pct: NUMBER }),
  kinded("unread"),
  kinded("limit"),
  kinded("backup"),
  kinded("alone"),
  kinded("room", { leftPct: NUMBER, movePct: NUMBER }),
  kinded("runsOut", { at: NUMBER, leftPct: NUMBER }),
  kinded("fits", { carries: FLAG, leftPct: NUMBER })
);

/**
 * A `moved` line's fields besides its kind (core `AccountMove`), as the
 * hub read them before 0414 and 0429: those it requires, then those it
 * may leave out. 0429 reads a compaction plan's move by them
 * (db/compaction-plans-unread.ts).
 */
export const MOVED_FIELDS = {
  required: {
    from: ACCOUNT,
    to: ACCOUNT,
    sameOrganization: FLAG,
    tokens: NUMBER_OR_NULL,
    window: TEXT_OR_NULL,
    resetsAt: NUMBER_OR_NULL,
  },
  optional: {
    asked: TRUE,
    removed: TRUE,
    signedOut: TRUE,
    signedOutOn: TEXT,
    compact: oneOf("filing", "compacting", "compacted", "stopped"),
    compactFirst: TRUE,
    compactBy: oneOf("opencode", "pi"),
    summaryRefused: TEXT,
    relaunched: TRUE,
    because: BECAUSE,
    cost: COST,
    ended: object({ tasks: NUMBER, wakeups: NUMBER }),
  },
};

/** The line a move writes (core `AccountMove`), each kind of it. */
const LINE = anyOf(
  kinded("moved", MOVED_FIELDS.required, MOVED_FIELDS.optional),
  kinded(
    "moving",
    { from: ACCOUNT, to: ACCOUNT, at: NUMBER, tokens: NUMBER_OR_NULL },
    { cost: COST }
  ),
  kinded(
    "waiting",
    {
      account: ACCOUNT,
      until: NUMBER,
      why: oneOf("fork", "off", "full", "free", "room", "soon", "work"),
      tokens: NUMBER_OR_NULL,
    },
    {
      frees: ACCOUNT,
      accounts: listOf(
        object({ account: ACCOUNT, reason: PASSED_OVER }, { backAt: NUMBER })
      ),
    }
  ),
  kinded(
    "continued",
    {
      from: nullable(ACCOUNT),
      to: nullable(ACCOUNT),
      writtenOn: nullable(ACCOUNT),
      tokens: NUMBER_OR_NULL,
      preparedAtPct: NUMBER_OR_NULL,
    },
    {
      by: TEXT,
      asked: TRUE,
      asks: TRUE,
      move: object(
        {
          at: oneOf("limit", "ahead"),
          window: TEXT_OR_NULL,
          resetsAt: NUMBER_OR_NULL,
        },
        { because: BECAUSE, asked: TRUE }
      ),
    }
  ),
  kinded("stopped", { account: ACCOUNT, resetsAt: NUMBER_OR_NULL }),
  kinded("signed-out", { account: ACCOUNT }),
  kinded("ended", {
    by: anyOf(
      kinded("person"),
      kinded("session", { name: TEXT }),
      kinded("hub", { why: TEXT }),
      kinded("outside", { signal: TEXT, resumes: FLAG })
    ),
  }),
  kinded(
    "unmoved",
    {
      action: oneOf("move", "continue"),
      from: nullable(ACCOUNT),
      to: nullable(ACCOUNT),
      step: oneOf("prepare", "summary", "start"),
      reason: TEXT,
    },
    { signedOut: TRUE, asked: TRUE, waits: TRUE }
  )
);

/** Who asked for a job, as `continuations.asked_by` held it (hub `ContinuationAsker` at 0414). */
const ASKER = anyOf(
  kinded("person"),
  kinded("session", { id: TEXT }),
  kinded("task", { id: TEXT }),
  kinded("move", {
    line: TEXT,
    move: LINE,
    stopped: anyOf(
      { type: "boolean", const: false },
      literal("limit"),
      literal("signin")
    ),
    to: TEXT,
  })
);

/** A job's wait, as `continuations.waiting` held it. */
const WAIT = object({ from: NUMBER, since: NUMBER_OR_NULL, why: TEXT });

/** The asker reads whole: one of the four askers, each of its parts of its shape. */
const ASKER_READS = readsWhole("asked_by", ASKER);

/** The wait reads whole: when the job began to wait, since when its work has run (or null), and why. */
const WAIT_READS = readsWhole("waiting", WAIT);

/** What a stored asker is to 0414. */
export type AskerReading =
  /** It reads whole and is placed as it is, by its kind. */
  | { kind: "placed"; as: string }
  /** It does not read whole: kept as stored, the job the person's, failed as the hub starts while open. */
  | { kind: "unread"; why: string };

/** What a stored wait is to 0414. */
export type WaitReading =
  /** None: the job does not wait. */
  | { kind: "never" }
  /** It reads whole and is placed as it is. */
  | { kind: "placed" }
  /** It does not read whole: kept as stored, none of it placed. */
  | { kind: "unread"; why: string };

/** One job 0414 reads: its id, source and stage, its asker and wait as stored, and what 0414 makes of each. */
export interface KeptContinuation {
  asker: AskerReading;
  askerRaw: string;
  id: string;
  sourceInstanceId: string;
  stage: string;
  wait: WaitReading;
  waitRaw: string | null;
}

interface Row {
  askerJson: number;
  askerKind: string | null;
  askerRaw: string;
  askerReads: number;
  id: string;
  sourceInstanceId: string;
  stage: string;
  waitJson: number | null;
  waitRaw: string | null;
  waitReads: number;
}

const askerOf = (row: Row): AskerReading => {
  if (row.askerReads) {
    return { kind: "placed", as: row.askerKind ?? "person" };
  }
  return {
    kind: "unread",
    why:
      row.askerJson === 0
        ? "it is not JSON"
        : "it is not a person, a session, a task or a move whole",
  };
};

const waitOf = (row: Row): WaitReading => {
  if (row.waitRaw === null) {
    return { kind: "never" };
  }
  if (row.waitReads) {
    return { kind: "placed" };
  }
  return {
    kind: "unread",
    why:
      row.waitJson === 0
        ? "it is not JSON"
        : "it is not when the wait began, since when its work ran and why",
  };
};

/** Every job's asker and wait as 0414 reads them, oldest first. Run on a database 0414 has not run on. */
export const continuationsKept = (client: Database): KeptContinuation[] =>
  client
    .query<Row, []>(
      `SELECT id, source_instance_id AS sourceInstanceId, stage, CAST(asked_by AS TEXT) AS askerRaw, CASE WHEN json_valid(asked_by) THEN 1 ELSE 0 END AS askerJson, ${ASKER_READS} AS askerReads, ${inJson("asked_by", `CASE WHEN ${ASKER_READS} THEN json_extract(asked_by, '$.kind') END`)} AS askerKind, CAST(waiting AS TEXT) AS waitRaw, CASE WHEN waiting IS NULL THEN NULL WHEN json_valid(waiting) THEN 1 ELSE 0 END AS waitJson, ${WAIT_READS} AS waitReads FROM continuations ORDER BY created_at, id`
    )
    .all()
    .map((row) => ({
      id: row.id,
      sourceInstanceId: row.sourceInstanceId,
      stage: row.stage,
      askerRaw: row.askerRaw,
      asker: askerOf(row),
      waitRaw: row.waitRaw,
      wait: waitOf(row),
    }));

/** The stages a job has settled at: nothing more happens to it. */
const SETTLED = new Set(["started", "failed", "cancelled"]);

/** Logs every asker and wait 0414 keeps as not read, one line each. Run only in a start that applies 0414 (db/migrate.ts). */
export const logContinuationsUnread = (client: Database): void => {
  for (const job of continuationsKept(client)) {
    const of = `continuation job ${job.id} of session ${job.sourceInstanceId} (${job.stage})`;
    if (job.asker.kind === "unread") {
      const open = SETTLED.has(job.stage)
        ? ""
        : "; open, it fails as the hub starts and its source goes on as it was";
      console.info(
        `[migrations] 0414: ${of}: its asker ${shown(job.askerRaw)} does not read: ${job.asker.why}; kept as not read, the job is neither folded into its source nor its source's move${open}`
      );
    }
    if (job.wait.kind === "unread" && job.waitRaw !== null) {
      console.info(
        `[migrations] 0414: ${of}: its wait ${shown(job.waitRaw)} does not read: ${job.wait.why}; kept as not read, none of it placed, and its bound counts from when it next looks`
      );
    }
  }
};
