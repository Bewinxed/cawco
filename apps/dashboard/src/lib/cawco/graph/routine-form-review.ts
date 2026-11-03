/**
 * The routine form under review, as an agent would open it
 * (artifact_create `kind: "component"` with `file`, `group` and `edges`):
 * its own states file with its own records, its states in four machines.
 */

// biome-ignore lint/performance/noNamespaceImport: a states file is read whole: each of its exports is a story.
import * as RoutineFormStates from "../routines/RoutineForm.stories";
import routineFormSource from "../routines/RoutineForm.stories.ts?raw";
import type { ReviewInput } from "./model";

const FILLING = "Filling it in";
const WHEN = "When it runs";
const TYPE = "Delegate type";
const CREATING = "Creating it";

export const routineForm: ReviewInput = {
  file: "apps/dashboard/src/lib/cawco/routines/RoutineForm.stories.ts",
  module: RoutineFormStates as unknown as ReviewInput["module"],
  source: routineFormSource,
  group: {
    JustOpened: FILLING,
    JustOpenedPhone: "JustOpened",
    FilledIn: FILLING,
    FilledInPhone: "FilledIn",
    RunsAnOrchestrator: FILLING,
    RunsAnOrchestratorPhone: "RunsAnOrchestrator",
    LongestName: FILLING,
    LongestNamePhone: "LongestName",
    ShortestText: FILLING,
    EveryWeek: WHEN,
    EveryWeekPhone: "EveryWeek",
    EveryHour: WHEN,
    CustomSchedule: WHEN,
    CustomSchedulePhone: "CustomSchedule",
    InvalidSchedule: WHEN,
    InvalidSchedulePhone: "InvalidSchedule",
    TypesUnread: TYPE,
    TypesReadAgain: TYPE,
    DelegateTypeRefused: TYPE,
    Creating: CREATING,
    CreatingPhone: "Creating",
    FailedSave: CREATING,
    FailedSavePhone: "FailedSave",
  },
  edges: [
    { from: "JustOpened", to: "FilledIn", label: "Fill it in" },
    {
      from: "FilledIn",
      to: "RunsAnOrchestrator",
      label: "Each run an orchestrator",
    },
    { from: "FilledIn", to: "EveryWeek", label: "Every week" },
    { from: "FilledIn", to: "EveryHour", label: "Every hour" },
    { from: "EveryWeek", to: "CustomSchedule", label: "Custom" },
    {
      from: "CustomSchedule",
      to: "InvalidSchedule",
      label: "A schedule it can't read",
    },
    {
      from: "InvalidSchedule",
      to: "CustomSchedule",
      label: "Fix the schedule",
    },
    { from: "FailedSave", to: "Creating", label: "Try again" },
    { from: "Creating", to: "DelegateTypeRefused", label: "Type refused" },
    { from: "DelegateTypeRefused", to: "FilledIn", label: "Choose another" },
  ],
};
