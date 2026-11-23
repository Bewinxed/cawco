import type { SessionPlan } from "@cawco/core/plan";
import type { InstanceRow } from "@cawco/core/protocol";
import type { Plans, WrittenStep } from "./plans";
import type { ProblemsOf } from "./refusal";

/**
 * What the hub's other sections call of the person's plan changes
 * (plan-changes.ts `createPlanChanges`, whose answer is declared to meet
 * this). Said here, below them, so sends.ts, cut-turns.ts and task-tools.ts
 * read these without importing plan-changes.ts, which types its own deps
 * from the sections that reach them (spawns.ts `spawnFromHub`).
 */
export interface PlanChangeCalls {
  /**
   * `instanceId` cannot go on: starting it found its conversation gone. The
   * changes whose message it never read go on to a new session from it.
   */
  cannotGoOn: (instanceId: string, reason: string) => void;
  /**
   * What `instanceId` is owed of its plans' changes, as words a note ahead
   * of its next turn carries, the changes then told. Undefined when it is
   * owed nothing.
   */
  foldInto: (instanceId: string) => string | undefined;
  /**
   * `todo_write`'s session scope (plans.ts `write`), its answer carrying
   * what the session is owed of its plans' changes, those then told.
   */
  written: (
    row: InstanceRow,
    steps: WrittenStep[]
  ) => Promise<
    | (SessionPlan & { personChanged?: string })
    | ProblemsOf<ReturnType<Plans["write"]>>
  >;
}
