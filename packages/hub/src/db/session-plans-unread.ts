/**
 * Before migration 0418's SQL runs, the hub's log names every session
 * whose stored plan (`session_plans.steps`, its steps as JSON, and
 * `session_plans.orphaned_comments`, the person's comments on words no
 * step has any more) 0418 keeps as not read: a plan whose steps or
 * orphaned comments do not read whole, or two of whose steps have one id.
 * None of such a plan is placed as rows; both values are kept as stored in
 * `steps_unread` and `orphaned_comments_unread`, and the plan says it holds
 * steps that do not read (core `SessionPlan.unread`).
 *
 * The predicates below are 0418's own: its SQL was written from them, over
 * the JSON columns as they stand before it. {@link STEPS} and
 * {@link ORPHANS} are the columns' shapes as the hub read them then (core
 * plan.ts `PlanStep` and `OrphanedComments`, stored/columns.json), frozen
 * here. {@link plansKept} reads every plan with them, for the count taken
 * on a copy before 0418 runs (scripts/session-plans.ts).
 *
 * Every JSON function sits inside a CASE that has proved its column JSON
 * (db/json-reads.ts): SQLite may run the right side of an AND first.
 */
import type { Database } from "bun:sqlite";
import { listOf, NUMBER, object, oneOf, readsWhole, TEXT } from "./json-reads";
import { shown } from "./lifted-reading";

/** The person's comment on a step (core `PlanComment`). */
const COMMENT = object({ at: TEXT, text: TEXT });

/** A plan's steps, as `session_plans.steps` held them (core `PlanStep`). */
const STEPS = listOf(
  object(
    {
      content: TEXT,
      depth: NUMBER,
      id: TEXT,
      status: oneOf("pending", "in_progress", "completed"),
    },
    {
      comments: listOf(COMMENT),
      priority: oneOf("high", "medium", "low"),
      waitsOn: TEXT,
    }
  )
);

/** A plan's orphaned comments, as `session_plans.orphaned_comments` held them (core `OrphanedComments`). */
const ORPHANS = listOf(object({ comments: listOf(COMMENT), step: TEXT }));

/** The steps read whole as a list of steps. */
const STEPS_READ = readsWhole("steps", STEPS);

/** The orphaned comments read whole as a list of groups. */
const ORPHANS_READ = readsWhole("orphaned_comments", ORPHANS);

/** No two of the steps have one id: each is its own row (`session_plan_steps_id`). Read only once {@link STEPS_READ} holds. */
const IDS_OWN = `CASE WHEN ${STEPS_READ} THEN NOT EXISTS (SELECT 1 FROM json_each(steps) a, json_each(steps) b WHERE a.key < b.key AND json_extract(steps, a.fullkey || '.id') = json_extract(steps, b.fullkey || '.id')) ELSE 0 END`;

/** The plan reads whole: its steps, each with its own id, and its orphaned comments. */
const PLAN_READS = `CASE WHEN ${IDS_OWN} THEN ${ORPHANS_READ} ELSE 0 END`;

/** What a stored plan is to 0418. */
export type PlanReading =
  /** It reads whole and holds no step and no comment: nothing to place, read as the empty plan it was. */
  | { kind: "never" }
  /** It reads whole and is placed as it is: `steps` steps and `comments` comments. */
  | { comments: number; kind: "placed"; steps: number }
  /** It does not read whole: kept as stored, none of it placed. */
  | { kind: "unread"; why: string };

/** One plan as 0418 reads it: its session, its values as stored, and what 0418 makes of it. */
export interface KeptPlan {
  instanceId: string;
  orphans: string | null;
  reading: PlanReading;
  steps: string | null;
}

interface Row {
  comments: number | null;
  idsOwn: number;
  instanceId: string;
  orphans: string | null;
  orphansJson: number;
  orphansRead: number;
  reads: number;
  steps: string | null;
  stepsCount: number | null;
  stepsJson: number;
  stepsRead: number;
}

/** Why a plan does not read, each half that does not. */
const whyOf = (row: Row): string =>
  [
    ...(row.stepsJson === 0 ? ["its steps are not JSON"] : []),
    ...(row.stepsJson === 1 && row.stepsRead === 0
      ? [
          "its steps are not a list of steps (content, id and status as text, depth a number, priority, wait and comments as their kinds)",
        ]
      : []),
    ...(row.stepsRead === 1 && row.idsOwn === 0
      ? ["two of its steps have one id"]
      : []),
    ...(row.orphansJson === 0 ? ["its orphaned comments are not JSON"] : []),
    ...(row.orphansJson === 1 && row.orphansRead === 0
      ? [
          "its orphaned comments are not a list of a step's words and its comments",
        ]
      : []),
  ].join(", ");

const readingOf = (row: Row): PlanReading => {
  if (!row.reads) {
    return { kind: "unread", why: whyOf(row) };
  }
  const steps = row.stepsCount ?? 0;
  const comments = row.comments ?? 0;
  return steps === 0 && comments === 0
    ? { kind: "never" }
    : { kind: "placed", steps, comments };
};

/** A plan's steps and comments as 0418 places them: its steps, each step's comments and each orphaned group's. Read only once {@link PLAN_READS} holds. */
const COUNTS = `CASE WHEN ${PLAN_READS} THEN json_array_length(steps) END AS stepsCount, CASE WHEN ${PLAN_READS} THEN (SELECT coalesce(sum(json_array_length(steps, e.fullkey || '.comments')), 0) FROM json_each(steps) e) + (SELECT coalesce(sum(json_array_length(orphaned_comments, o.fullkey || '.comments')), 0) FROM json_each(orphaned_comments) o) END AS comments`;

/** Every plan as 0418 reads it, by session. Run on a database 0418 has not run on. */
export const plansKept = (client: Database): KeptPlan[] =>
  client
    .query<Row, []>(
      `SELECT instance_id AS instanceId, CAST(steps AS TEXT) AS steps, CAST(orphaned_comments AS TEXT) AS orphans, CASE WHEN json_valid(steps) THEN 1 ELSE 0 END AS stepsJson, ${STEPS_READ} AS stepsRead, ${IDS_OWN} AS idsOwn, CASE WHEN json_valid(orphaned_comments) THEN 1 ELSE 0 END AS orphansJson, ${ORPHANS_READ} AS orphansRead, ${PLAN_READS} AS reads, ${COUNTS} FROM session_plans ORDER BY instance_id`
    )
    .all()
    .map((row) => ({
      instanceId: row.instanceId,
      steps: row.steps,
      orphans: row.orphans,
      reading: readingOf(row),
    }));

/** Logs every plan 0418 keeps as not read, one line each. Run only in a start that applies 0418 (db/migrate.ts). */
export const logPlansUnread = (client: Database): void => {
  for (const plan of plansKept(client)) {
    if (plan.reading.kind !== "unread") {
      continue;
    }
    console.info(
      `[migrations] 0418: session ${plan.instanceId}: its plan's steps ${shown(plan.steps ?? "")} and orphaned comments ${shown(plan.orphans ?? "")} do not read: ${plan.reading.why}; kept as stored, none placed: its plan says it holds steps that do not read, and none of them is read for anything`
    );
  }
};
