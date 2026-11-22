import { HOUR_MS } from "@cawco/core/time";
import type { BarView } from "#lib/cawco/project/ViewBar.svelte";
import type { ProjectRow } from "#lib/cawco/projects.js";
import {
  INITIAL_ROUTINES,
  LOCAL_ZONE,
  MOCK_NOW,
  type Routine,
  type ScheduleUnit,
} from "./routines-data";

export const PROJECT_VIEWS: BarView[] = [
  { count: 0, draft: false, label: "Board", value: "board" },
  { count: 0, draft: false, label: "Table", value: "table" },
  { count: 0, draft: false, label: "Routines", value: "routines" },
  { count: 2, draft: false, label: "Decisions", value: "decisions" },
  { count: 0, draft: false, label: "Made", value: "made" },
];

export const MOCK_PROJECT: ProjectRow = {
  account: null,
  accountAtLimit: "wait",
  cawHarness: "claude",
  cawModel: "claude-sonnet-4-6",
  conversationInstanceId: null,
  createdAt: "2026-08-14T09:00:00Z",
  eventsOn: true,
  id: "prj-cawco-cloud",
  lands: "branch",
  lfsConnection: null,
  lfsUrl: null,
  links: ["github.com/cawco/cloud"],
  name: "CawCo Cloud",
  places: [
    {
      createdAt: "2026-08-14T09:00:00Z",
      found: true,
      id: "plc-obelisk",
      isPrimary: true,
      kind: "checkout",
      machineId: "mch-obelisk",
      made: false,
      missing: false,
      path: "/home/bewinxed/code/cawco-cloud",
      projectId: "prj-cawco-cloud",
      within: [],
    },
  ],
  primaryPlaceId: "plc-obelisk",
  review: true,
};

export function initialRoutines(): Routine[] {
  return structuredClone(INITIAL_ROUTINES);
}

export type RunTab = "result" | "session";

export type SidePanel =
  | { routineId: string; view: "routine" }
  | { routineId: string; runId: string; tab: RunTab; view: "run" }
  | { view: "create" }
  | { routineId: string; view: "edit" }
  | null;

export interface RoutineDraft {
  guardrail: string;
  instructions: string;
  name: string;
  scheduleEvery: number;
  scheduleUnit: ScheduleUnit;
  time: string;
  timezone: string;
  weekday: string;
}

export const SCHEDULE_UNIT_OPTIONS: { id: ScheduleUnit; text: string }[] = [
  { id: "day", text: "day" },
  { id: "weekday", text: "weekday" },
  { id: "week", text: "week" },
  { id: "hour", text: "hour" },
  { id: "minute", text: "minute" },
];

export const SCHEDULE_EVERY_OPTIONS = [1, 2, 3, 4, 6, 12, 15, 30].map((n) => ({
  id: String(n),
  text: String(n),
}));

const SCHEDULE_UNIT_SET = new Set<string>(
  SCHEDULE_UNIT_OPTIONS.map((one) => one.id)
);

export function isScheduleUnit(
  value: string | undefined
): value is ScheduleUnit {
  return value !== undefined && SCHEDULE_UNIT_SET.has(value);
}

const WEEKDAY_NAMES: Record<string, string> = {
  Fri: "Friday",
  Mon: "Monday",
  Sat: "Saturday",
  Sun: "Sunday",
  Thu: "Thursday",
  Tue: "Tuesday",
  Wed: "Wednesday",
};

/** The schedule read back in words, with its next run on the person's clock. */
export function describeDraftSchedule(
  draft: Pick<
    RoutineDraft,
    "scheduleEvery" | "scheduleUnit" | "time" | "timezone" | "weekday"
  >
): { nextLabel: string; rhythm: string } {
  const zone = draft.timezone === LOCAL_ZONE ? "" : ` ${draft.timezone}`;
  const hm = draft.time || "09:00";
  const day = WEEKDAY_NAMES[draft.weekday] ?? draft.weekday;
  const n = Math.max(1, draft.scheduleEvery);

  switch (draft.scheduleUnit) {
    case "minute":
      return {
        nextLabel: `in ${n} ${n === 1 ? "minute" : "minutes"}`,
        rhythm: n === 1 ? "Every minute" : `Every ${n} minutes`,
      };
    case "hour":
      return {
        nextLabel: n === 1 ? "today at 22:00" : `in ${n} hours`,
        rhythm: n === 1 ? "Every hour, on the hour" : `Every ${n} hours`,
      };
    case "day":
      return {
        nextLabel: `tomorrow at ${hm}`,
        rhythm:
          n === 1
            ? `Every day at ${hm}${zone}`
            : `Every ${n} days at ${hm}${zone}`,
      };
    case "weekday":
      return {
        nextLabel: `Monday at ${hm}`,
        rhythm: `Weekdays at ${hm}${zone}`,
      };
    case "week":
      return {
        nextLabel: `${day} at ${hm}`,
        rhythm:
          n === 1
            ? `Every ${day} at ${hm}${zone}`
            : `Every ${n} weeks on ${day} at ${hm}${zone}`,
      };
  }
}

export const WEEKDAY_OPTIONS = Object.keys(WEEKDAY_NAMES).map((id) => ({
  id,
  text: WEEKDAY_NAMES[id] ?? id,
}));

export const ZONE_OPTIONS = [
  LOCAL_ZONE,
  "UTC",
  "America/New_York",
  "America/Los_Angeles",
  "Europe/London",
].map((zone) => ({ id: zone, text: zone }));

export function initialDraft(editing: Routine | null): RoutineDraft {
  if (!editing) {
    return {
      guardrail: "",
      instructions: "",
      name: "",
      scheduleEvery: 1,
      scheduleUnit: "day",
      time: "09:00",
      timezone: LOCAL_ZONE,
      weekday: "Mon",
    };
  }
  return {
    guardrail: editing.guardrail ?? "",
    instructions: editing.instructions,
    name: editing.name,
    scheduleEvery: editing.schedule.every,
    scheduleUnit: editing.schedule.unit,
    time: editing.schedule.time,
    timezone: editing.schedule.timezone,
    weekday: editing.schedule.weekday,
  };
}

export type BadDraftField = "name" | "instructions" | null;

export function validateDraft(
  draft: RoutineDraft,
  builtIn: boolean
): { field: BadDraftField; reason: string } | null {
  const name = draft.name.trim();
  if (!name) {
    return { field: "name", reason: "Give the routine a name." };
  }
  if (name.length > 64) {
    return {
      field: "name",
      reason: `The name is ${name.length} characters; keep it to 64.`,
    };
  }
  if (!(builtIn || draft.instructions.trim())) {
    return { field: "instructions", reason: "Say what each run does." };
  }
  return null;
}

function scheduleFromDraft(
  draft: RoutineDraft,
  nextAt: number | null
): Routine["schedule"] {
  return {
    every: draft.scheduleEvery,
    nextAt,
    rhythm: describeDraftSchedule(draft).rhythm,
    time: draft.time,
    timezone: draft.timezone,
    unit: draft.scheduleUnit,
    weekday: draft.weekday,
  };
}

export function applyEdit(one: Routine, draft: RoutineDraft): Routine {
  const runs = one.status === "active" || one.status === "running";
  const schedule = scheduleFromDraft(draft, runs ? MOCK_NOW + HOUR_MS : null);
  if (one.builtIn) {
    return { ...one, schedule };
  }
  return {
    ...one,
    guardrail: draft.guardrail.trim() || undefined,
    instructions: draft.instructions.trim(),
    name: draft.name.trim(),
    schedule,
  };
}

/** A new routine runs once at once, as its test. */
export function createRoutine(
  draft: RoutineDraft,
  id: string,
  runId: string
): Routine {
  return {
    guardrail: draft.guardrail.trim() || undefined,
    id,
    instructions: draft.instructions.trim(),
    name: draft.name.trim(),
    // What it delivers is said by its name until the person words it.
    outcome: { kind: "delivery", says: draft.name.trim() },
    runningStep: "Running its first test",
    runs: [
      {
        id: runId,
        oneLine: "Running its first test on obelisk",
        outcome: "running",
        resultMarkdown: "The first run is going now on `obelisk`.",
        startedAt: MOCK_NOW,
      },
    ],
    schedule: scheduleFromDraft(draft, MOCK_NOW + HOUR_MS),
    status: "running",
    statusReason: null,
  };
}
