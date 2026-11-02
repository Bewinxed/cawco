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
const SAVING = "Saving it";

export const routineForm: ReviewInput = {
  file: "apps/dashboard/src/lib/cawco/routines/RoutineForm.stories.ts",
  module: RoutineFormStates as unknown as ReviewInput["module"],
  source: routineFormSource,
  group: {
    Empty: FILLING,
    EmptyPhone: "Empty",
    Filled: FILLING,
    FilledPhone: "Filled",
    Orchestrator: FILLING,
    OrchestratorPhone: "Orchestrator",
    Weekly: WHEN,
    WeeklyPhone: "Weekly",
    Hourly: WHEN,
    Custom: WHEN,
    CustomPhone: "Custom",
    InvalidSchedule: WHEN,
    InvalidSchedulePhone: "InvalidSchedule",
    TypesUnread: TYPE,
    FailedType: TYPE,
    Saving: SAVING,
    SavingPhone: "Saving",
    FailedSave: SAVING,
    FailedSavePhone: "FailedSave",
  },
  edges: [
    { from: "Empty", to: "Filled", label: "Fill it in" },
    { from: "Filled", to: "Orchestrator", label: "Each run an orchestrator" },
    { from: "Filled", to: "Weekly", label: "Every week" },
    { from: "Filled", to: "Hourly", label: "Every hour" },
    { from: "Weekly", to: "Custom", label: "Custom" },
    {
      from: "Custom",
      to: "InvalidSchedule",
      label: "A schedule it can't read",
    },
    { from: "InvalidSchedule", to: "Custom", label: "Fix the schedule" },
    { from: "FailedSave", to: "Saving", label: "Try again" },
    { from: "Saving", to: "FailedType", label: "Type refused" },
    { from: "FailedType", to: "Filled", label: "Choose another" },
  ],
};
