/**
 * A routine as the `/api/routines` routes answer it (routines.ts `viewOf`),
 * thin over its task until the dashboard reads tasks (slice 6 of the
 * routines-as-tasks merge): its trigger, and its task's words.
 */

import type { OfferedMode } from "@cawco/core/harness/modes";
import type { LandsMode } from "@cawco/core/injected";
import type {
  RoutineMadeBy,
  RoutineSchedule,
} from "@cawco/core/project-conversation";
import type {
  ConditionView,
  RoutineCheckView,
  RoutineRunView,
  RoutineTarget,
} from "@cawco/core/routine-kinds";
import type { WorkBudget } from "./db/stored-types";

/**
 * Where a routine was made: the session whose `task_create` call made
 * it, and how its notice names that session.
 */
interface RoutineMadeIn {
  by: RoutineMadeBy;
  instanceId: string;
}

/** A routine's stop condition as its view answers it: where it stands. */
export interface RoutineCondition extends ConditionView {
  /** What a task's `waits_on` or a plan step's `waitsOn` writes to wait on it: its task, `tsk-N`. */
  handle: string;
  /** Plan steps not done, of sessions not over, that wait on it. */
  steps: number;
  /** The tasks whose own `waits_on` names it, by id, in any stage. */
  waitedBy: string[];
}

/** A routine, as the routes and tools answer it (times in ms), with its newest runs. */
export interface RoutineView {
  budget: WorkBudget | null;
  /** Its check, which gates its runs; null: every run starts its target. */
  check: RoutineCheckView | null;
  /** Its stop condition; null for a routine with none. */
  condition: RoutineCondition | null;
  createdAt: number;
  createdBy: string;
  cron: string;
  dailyCapUsd: number | null;
  delegateType: string | null;
  disabledReason: string | null;
  enabled: boolean;
  expiresAt: number | null;
  id: string;
  keep: boolean;
  lands: LandsMode;
  lastSlot: number | null;
  /** Where a session made it; null for yours, the hub's, and those made before the hub kept where. */
  madeIn: RoutineMadeIn | null;
  /** What the making turn said just before its call, one paragraph; null when it said nothing or a session did not make it. */
  madeWhy: string | null;
  /** The mode a conversation run starts the project's conversation in when it has none; null: the project's. */
  mode: OfferedMode | null;
  name: string;
  /**
   * Its runs ahead, as the scheduler will start them (`nextRunsOf`): the next
   * week's, at most 288, epoch ms; a paused routine's too.
   */
  nextRuns: number[];
  nextSlot: number;
  /** Its project; null for the Fleet project's. */
  projectId: string | null;
  /** Its task's description: what each run does. */
  prompt: string;
  runs: RoutineRunView[];
  /** Every run it has had; `runs` holds only the newest of them. */
  runsTotal: number;
  /** Its schedule in words, and its next run. */
  schedule: RoutineSchedule;
  target: RoutineTarget;
  /** Its task, `tsk-N`; null while a routine carried over from before routines were tasks waits to be filed. */
  taskId?: string | null;
  timeZone: string;
}
