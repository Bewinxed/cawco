import type { StageKind } from "../views";

/** What a new task's stage would do to it, by the stage's kind, for {@link stageWords}`.filed`. */
const FILED_IN: Record<Exclude<StageKind, "todo" | "you">, string> = {
  active: "start it",
  waiting: "carry it past its start",
  done: "close it as done",
  dropped: "close it as dropped",
};

/**
 * What the hub says when a stage of kind `you` holds a task (hub stages.ts
 * `heldProblem`): it waits for the person, so a session's move on, drop or
 * attempt start past it is refused, naming where it can send it back. And
 * why a session's new task may not start in a stage (hub stages.ts
 * `startProblem`): it files one only where it waits.
 */
export const stageWords = {
  /** Why it stays: who alone takes it on from `from`. */
  waits: (from: string): string =>
    `it waits for the person in ${from}, and only their own move, an approved action or ${from}'s own routine takes it on or drops it`,
  /** What `mover` can do instead: send it back to `open` (a list in words), or ask; `open` empty when nowhere. */
  instead: (mover: string, open: string): string =>
    open
      ? `${mover} can send it back to ${open}, or ask the person to move it.`
      : `${mover} cannot move it anywhere; ask the person to move it.`,
  /** The refusal whole: `task` cannot `refused` (a move, an attempt start) out of `from`. */
  held: (
    task: string,
    refused: string,
    from: string,
    instead: string
  ): string =>
    `${task} cannot ${refused}: ${stageWords.waits(from)}. From ${from}, ${instead}`,
  /** What was refused: a move. */
  move: (from: string, to: string): string => `go from ${from} to ${to}`,
  /** What was refused: an attempt start, which moves the task into `to`. */
  start: (to: string): string => `start an attempt in ${to}`,
  /**
   * Why a session may not file a new task in `stage`, of kind `kind`: it
   * files one only where the task waits, `open` (the project's todo and
   * you stages, a list in words; empty when it has none). Entering an active stage is a start,
   * which task_start, a delegate naming the task, the project's dispatch or
   * the person makes.
   */
  filed: (
    stage: string,
    kind: Exclude<StageKind, "todo" | "you">,
    open: string
  ): string =>
    `A session files a new task only where it waits for a start or for the person: ${open || "a stage of kind todo or you, which this project has none of"}. Filing it in ${stage} would ${FILED_IN[kind]}. A task starts by task_start, a delegate naming it, the project's dispatch or the person.`,
} as const;
