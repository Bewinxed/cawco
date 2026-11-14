/**
 * A routine as the routes and tools answer it (routines.ts makes it), and as
 * the words that show it (presenters/project.ts) read it.
 */

import type { OfferedMode } from "@cawco/core/harness/kinds";
import type { LandsMode } from "@cawco/core/injected";
import type {
  RoutineMadeEvent,
  RoutineSchedule,
} from "@cawco/core/project-conversation";
import type { RoutineRunView, RoutineTarget } from "@cawco/core/routine-kinds";
import type { WorkBudget } from "./db/stored-types";

/**
 * Where a routine was made: the session whose `routine_create` call made
 * it, and how its notice names that session.
 */
interface RoutineMadeIn {
  by: RoutineMadeEvent["by"];
  instanceId: string;
}

/** A routine, as the routes and tools answer it (times in ms), with its newest runs. */
export interface RoutineView {
  budget: WorkBudget | null;
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
  projectId: string | null;
  prompt: string;
  runs: RoutineRunView[];
  /** Its schedule in words, and its next run. */
  schedule: RoutineSchedule;
  target: RoutineTarget;
  timeZone: string;
}
