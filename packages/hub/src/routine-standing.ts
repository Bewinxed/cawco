/**
 * Whether a routine's task has ended it, and its trigger as every reader
 * tells it then (Projects spec §5.5: a routine fires only while its task is
 * open). Kept apart from the scheduler so the views thread's find index
 * reads the same rule.
 */

import type { StageKind } from "@cawco/core/views";
import { routineToolWords } from "@cawco/core/words/routines";
import type { TriggerRow } from "./db/task-triggers";

/**
 * A routine's task as its reader has it: its stage and that stage's kind,
 * or `gone` when the index holds no row of it (archived, deleted, or not
 * filed yet).
 */
export type RoutineTask = { kind: StageKind | null; stage: string } | "gone";

/**
 * Whether its task ends a routine: the task is in a done or dropped stage,
 * or gone. The scheduler fires nothing for such a routine (routines.ts
 * `shutWhy`, read before every slot, test, event run and run by hand), and a
 * move back out turns it on from then (routines.ts `taskMoved`).
 */
export const routineEnded = (task: RoutineTask): boolean =>
  task === "gone" || task.kind === "done" || task.kind === "dropped";

/**
 * A routine's trigger as every reader tells it: while its task ends it
 * ({@link routineEnded}), off, saying why, with no next start; else as
 * kept. The trigger row keeps the scheduler's cursor, which moves on while
 * the task is closed, so no reader shows `enabled` or `nextSlot` without
 * this.
 */
export const standingOf = <
  R extends Pick<TriggerRow, "disabledReason" | "enabled" | "nextSlot">,
>(
  row: R,
  task: RoutineTask
): R =>
  routineEnded(task)
    ? {
        ...row,
        enabled: false,
        disabledReason: routineToolWords.endedWith(
          task === "gone" ? null : task.stage
        ),
        nextSlot: null,
      }
    : row;
