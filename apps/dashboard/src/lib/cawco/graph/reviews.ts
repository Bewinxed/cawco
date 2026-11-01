/**
 * The two components the design graph's own page reviews, as an agent
 * would open them (artifact_create `kind: "component"` with `file`,
 * `group` and `edges`): the routine form and Who decides' roster, each
 * from its own states file with its own records. The page's route and the
 * graph's states file both mount these.
 */

// biome-ignore lint/performance/noNamespaceImport: a states file is read whole: each of its exports is a story.
import * as RosterStates from "../decides/Roster.stories";
import rosterSource from "../decides/Roster.stories.ts?raw";
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

const FOLLOWING = "Following the fleet";
const HANDING = "Handing a kind over";

export const roster: ReviewInput = {
  file: "apps/dashboard/src/lib/cawco/decides/Roster.stories.ts",
  module: RosterStates as unknown as ReviewInput["module"],
  source: rosterSource,
  group: {
    FollowingDesk: FOLLOWING,
    FollowingTablet: "FollowingDesk",
    FollowingPhone: "FollowingDesk",
    ChangedDesk: HANDING,
    ChangedPhone: "ChangedDesk",
    FleetPage: FOLLOWING,
    OpenFirstColumn: HANDING,
    OpenLastColumn: HANDING,
    OpenPhone: "OpenFirstColumn",
    OpenOneMember: HANDING,
    OpenManyMembers: HANDING,
    ManyMembersDesk: FOLLOWING,
    Handing: HANDING,
    Refused: HANDING,
  },
  edges: [
    { from: "FollowingDesk", to: "OpenFirstColumn", label: "Press a tile" },
    { from: "OpenFirstColumn", to: "Handing", label: "Press a member" },
    { from: "Handing", to: "ChangedDesk", label: "Handed over" },
    { from: "Handing", to: "Refused", label: "Refused" },
    { from: "Refused", to: "Handing", label: "Try again" },
  ],
};
