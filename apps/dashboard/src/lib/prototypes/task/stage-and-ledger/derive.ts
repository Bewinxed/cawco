/**
 * What the task says of itself, worked out on every read: its one
 * liveness word with the move in flight and the session's ask taken in,
 * the sentence Now reads, and the mark a session or an attempt wears. One
 * place for the head, the strip and the drawer's handle alike.
 */
import { taskStageLedgerWords as words } from "@cawco/core/words/task-stage-ledger";
import { clock, when } from "./format";
import { LIVENESS, type Mark } from "./marks";
import type { Liveness, MoveState, SessionAsk, TaskRead } from "./records";

/** The liveness the task reads as now: landing while the hub lands it, asking while its session asks. */
export function livenessOf(
  task: TaskRead,
  move: MoveState,
  ask: SessionAsk | null
): Liveness {
  if (move === "landing") {
    return "landing";
  }
  if (move === "landed") {
    return "done";
  }
  if (ask && ask.answered === null) {
    return "asking";
  }
  return task.liveness;
}

/** The sentence beside the liveness word, under Now. */
export function nowOf(task: TaskRead, move: MoveState, now: number): string {
  if (move === "landing") {
    return words.nowLanding;
  }
  if (move === "landed") {
    return words.nowLanded(clock(task.since));
  }
  if (move === "passing" && task.passOnTo) {
    return words.nowMovePending(task.passOnTo);
  }
  if (move === "sending" && task.sendBack) {
    return words.nowMovePending(task.sendBack.stage);
  }
  switch (task.liveness) {
    case "needsYou":
      return words.nowYours(task.stage, when(task.since, now));
    case "working":
    case "asking":
    case "landing":
      return words.nowWorking(task.stage, clock(task.since));
    case "blocked":
    case "queued":
      return words.nowBlocked(
        task.stage,
        task.waits.filter((wait) => !wait.settled).length
      );
    case "ready":
      return words.nowReady(task.stage);
    case "idle":
      return words.nowIdle(task.stage);
    case "stopped":
    case "failed":
      return words.nowStopped(task.stage);
    case "done":
    case "dropped":
      return words.nowDropped(task.stage);
    default:
      return task.liveness satisfies never;
  }
}

/** The mark an attempt wears in the strip's list, by how it stands or ended. */
export function attemptMark(
  state: TaskRead["attempts"][number]["state"]
): Mark {
  switch (state) {
    case "running":
      return LIVENESS.working;
    case "done":
      return LIVENESS.done;
    case "failed":
      return LIVENESS.failed;
    case "cancelled":
      return LIVENESS.stopped;
    default:
      return state satisfies never;
  }
}

/** The mark the session behind the newest attempt wears. */
export function sessionMark(
  state: NonNullable<TaskRead["who"]>["state"]
): Mark {
  switch (state) {
    case "working":
      return LIVENESS.working;
    case "stopped":
      return LIVENESS.stopped;
    case "done":
      return LIVENESS.done;
    default:
      return state satisfies never;
  }
}

/** Where a comment goes from here, in the strip's words. */
export function sayLineOf(task: TaskRead): string {
  if (task.kind === "done" || task.kind === "dropped") {
    return words.sayClosed;
  }
  return task.live ? words.sayToSession(task.live.session) : words.sayToFile;
}

/** The result's provenance line on the stage. */
export function provenanceOf(result: TaskRead["result"], now: number): string {
  if (!result) {
    return words.noResult;
  }
  return result.provenance.kind === "handedIn"
    ? words.handedIn(result.provenance.by, when(result.at, now))
    : words.namedInComment(result.provenance.by, when(result.at, now));
}
