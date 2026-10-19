/**
 * PROPOSED (project-redesign sheet): the one line a task says past its
 * title (taskpane advisor §2's table), shared by the board card and the
 * run order: its session's state with the session's name, a refusal, what
 * it waits on, its date, or nothing (The Idle Has No Fill Rule).
 */
import { cawco } from "../client.svelte";
import { isRetry, type TaskSummary } from "../project-tasks";
import type { MarkStatus } from "../TreeMark.svelte";
import { sessionName } from "./session-name";

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
  | { kind: "cant" | "after" | "date"; rest: string | null; word: string };

/** A session's name: the fleet's, or what a sheet feeds. */
export type NameOf = (instanceId: string) => string;

const lower = (words: string): string =>
  words.replace(/\.$/, "").replace(/^./, (c) => c.toLowerCase());

/** Where a session works, as the fleet's index has it; its id while unknown. */
export const placeOf = (instanceId: string): string =>
  cawco.instanceIndex.byId.get(instanceId)?.cwd ?? instanceId;

export function stateLineOf(
  task: TaskSummary,
  {
    date = null,
    asks = false,
    nameOf = sessionName,
  }: { asks?: boolean; date?: string | null; nameOf?: NameOf } = {}
): StateLine | null {
  const newest = task.attempts[0];
  if (task.startProblem && !task.liveAttempt) {
    return { kind: "cant", word: "Couldn't start", rest: lower(task.startProblem) };
  }
  if (newest) {
    const session = newest.instanceId;
    const place = placeOf(session);
    if (asks) {
      return { kind: "session", session, place, status: "attn", word: "Asks you", rest: null };
    }
    if (task.liveAttempt) {
      return isRetry(task)
        ? { kind: "session", session, place, status: "live", word: "Retrying", rest: `attempt ${task.attempts.length}` }
        : { kind: "session", session, place, status: "live", word: "Working", rest: nameOf(session) };
    }
    if (task.lastAttemptFailed) {
      return { kind: "session", session, place, status: "fail", word: "Failed", rest: lower(newest.endedHow ?? "") || null };
    }
  }
  const waitsOn = task.blockedBy.length > 0 ? task.blockedBy : task.after;
  if (task.kind !== "done" && waitsOn.length > 0) {
    return { kind: "after", word: `After ${waitsOn[0]}`, rest: waitsOn.length > 1 ? `+${waitsOn.length - 1}` : null };
  }
  if (date) {
    return { kind: "date", word: date, rest: null };
  }
  return null;
}
