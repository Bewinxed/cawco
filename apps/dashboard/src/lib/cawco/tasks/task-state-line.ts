/**
 * The one line a board card says past its title (the owner's pins on the
 * card: "a better way to indicate status without overwhelming the layout"):
 * its session's state with the session's name, why the hub could not start
 * it, what it waits on, its date, or nothing. A card in Review or Done says
 * nothing more, since its column says it (The Idle Has No Fill Rule). Pure:
 * the session's name and place come in, the fleet's or a states file's.
 */
import { projectWords } from "@cawco/core";
import type { StageKind, TaskSummary } from "../project-tasks";
import type { MarkStatus } from "../TreeMark.svelte";
import { isRetry } from "./retry";

export type StateLine =
  | {
      kind: "session";
      /** Where the session works: its mark's hue. */
      place: string;
      rest: string | null;
      session: string;
      status: MarkStatus;
      word: string;
    }
  | {
      kind: "cant" | "after" | "date" | "problem" | "asks";
      rest: string | null;
      word: string;
    };

/** What the card knows past the task's own row. */
export interface StateLineOf {
  /** Its session asks you, or an action filed for it waits on you. */
  asks: "session" | "action" | null;
  /** The date its file sets it for, said short. */
  date: string | null;
  /** The kind of another task's stage, to say whether what it waits on has landed. */
  kindOf: (id: string) => StageKind | null | undefined;
  /** A session's name. */
  nameOf: (instanceId: string) => string;
  /** Where a session works, its mark's hue. */
  placeOf: (instanceId: string) => string;
}

const FULL_STOP = /\.$/;
const FIRST = /^./;
/** A sentence said after a word: its first letter lowered, its full stop gone. */
const after = (words: string): string =>
  words.replace(FULL_STOP, "").replace(FIRST, (c) => c.toLowerCase());

/** Its newest session's line: asking you, working, trying again, failed or stopped. */
function sessionLine(
  task: TaskSummary,
  { asks, nameOf, placeOf }: StateLineOf
): StateLine | null {
  const [newest] = task.attempts;
  const asked =
    asks === "session" ? projectWords.asksYou : projectWords.waitsOnYou;
  if (!newest) {
    // An action filed for it waits on you, no session of its own behind it.
    return asks ? { kind: "asks", word: asked, rest: null } : null;
  }
  const session = newest.instanceId;
  const place = placeOf(session);
  if (asks) {
    return {
      kind: "session",
      session,
      place,
      status: "attn",
      word: asked,
      rest: null,
    };
  }
  if (task.liveAttempt) {
    const retry = isRetry(task);
    return {
      kind: "session",
      session,
      place,
      status: "live",
      word: retry ? projectWords.retrying : projectWords.working,
      rest: retry
        ? projectWords.attempt(task.attempts.length)
        : nameOf(session),
    };
  }
  if (!(task.lastAttemptFailed || task.lastAttemptStopped)) {
    return null;
  }
  const failed = task.lastAttemptFailed;
  return {
    kind: "session",
    session,
    place,
    status: failed ? "fail" : "idle",
    word: failed ? projectWords.failed : projectWords.stopped,
    rest: failed && newest.endedHow ? after(newest.endedHow) : null,
  };
}

/** What it waits on that has not landed: the hub's word, else its `after` edges not done. */
function waitsOnOf(task: TaskSummary, kindOf: StateLineOf["kindOf"]): string[] {
  if (task.blockedBy.length > 0) {
    return task.blockedBy;
  }
  return task.after.filter((id) => {
    const kind = kindOf(id);
    return kind !== "done" && kind !== "dropped";
  });
}

export function stateLineOf(
  task: TaskSummary,
  known: StateLineOf
): StateLine | null {
  if (task.startProblem && !task.liveAttempt) {
    return {
      kind: "cant",
      word: projectWords.cantStart,
      rest: after(task.startProblem),
    };
  }
  const session = sessionLine(task, known);
  if (session) {
    return session;
  }
  if (task.problem) {
    return {
      kind: "problem",
      word: projectWords.fileProblem,
      rest: after(task.problem),
    };
  }
  const closed = task.kind === "done" || task.kind === "dropped";
  const waitsOn = closed ? [] : waitsOnOf(task, known.kindOf);
  if (waitsOn.length > 0) {
    return {
      kind: "after",
      word: projectWords.afterTask(waitsOn[0] ?? ""),
      rest: waitsOn.length > 1 ? `+${waitsOn.length - 1}` : null,
    };
  }
  return known.date && !closed
    ? { kind: "date", word: known.date, rest: null }
    : null;
}
