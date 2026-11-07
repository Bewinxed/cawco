/**
 * What the hub says when a stage of kind `you` holds a task (hub stages.ts
 * `heldProblem`): it waits for the person, so a session's move on, drop or
 * attempt start past it is refused, naming where it can send it back.
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
} as const;
