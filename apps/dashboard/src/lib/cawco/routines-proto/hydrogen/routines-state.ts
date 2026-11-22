import { DAY_MS, HOUR_MS } from "@cawco/core/time";
import type { BarView } from "#lib/cawco/project/ViewBar.svelte";
import type { ProjectRow } from "#lib/cawco/projects.js";
import type {
  ApprovedAction,
  CawSuggestion,
  EventRule,
  EventSource,
} from "./routines-data";
import {
  INITIAL_ACTIONS,
  INITIAL_ROUTINES,
  INITIAL_RULES,
  INITIAL_SOURCES,
  INITIAL_SUGGESTION,
  LOCAL_ZONE,
  MOCK_MACHINE,
  MOCK_NOW,
  type Routine,
  type RoutineRun,
  type ScheduleCadence,
  type ScheduleUnit,
} from "./routines-data";

export const PROJECT_VIEWS: BarView[] = [
  { count: 0, draft: false, label: "Board", value: "board" },
  { count: 0, draft: false, label: "Table", value: "table" },
  { count: 0, draft: false, label: "Routines", value: "routines" },
  { count: 2, draft: false, label: "Decisions", value: "decisions" },
  { count: 0, draft: false, label: "Made", value: "made" },
];

export const PROJECT_STARTERS: string[] = [
  "Every Friday at 16:00, summarize merged PRs and open blockers for the week",
  "Check every 30 minutes until staging SSL renews, then unblock tsk-430",
  "When a GitHub issue is labelled outage, draft an incident brief",
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

export interface RoutinesBoardState {
  actions: ApprovedAction[];
  routines: Routine[];
  rules: EventRule[];
  sources: EventSource[];
  suggestion: CawSuggestion | null;
}

export function createInitialBoardState(): RoutinesBoardState {
  return {
    actions: structuredClone(INITIAL_ACTIONS),
    routines: structuredClone(INITIAL_ROUTINES),
    rules: structuredClone(INITIAL_RULES),
    sources: structuredClone(INITIAL_SOURCES),
    suggestion: structuredClone(INITIAL_SUGGESTION),
  };
}

export function removeRoutineFromBoard(
  board: RoutinesBoardState,
  id: string
): void {
  board.routines = board.routines.filter((one) => one.id !== id);
  board.rules = board.rules.filter((rule) => rule.routineId !== id);
  board.actions = board.actions.filter((action) => action.routineId !== id);
}

export type ActionDecision = "approve" | "deny" | "cancel" | "acknowledge";

export type SidePanel =
  | { routineId: string; view: "routine" }
  | { backToList: boolean; routineId: string; runId: string; view: "run" }
  | { view: "create" }
  | { routineId: string; view: "edit" }
  | null;

export interface RoutineDraftSubmit {
  cadence: ScheduleCadence;
  cron: string;
  doneWhenCommand: string;
  doneWhenMethod: "model" | "command";
  doneWhenStatement: string;
  executorMode: "delegate" | "orchestrator";
  giveUpDate: string;
  guardrail: string;
  harness: string;
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
  { id: "events", text: "matching event" },
  { id: "cron", text: "custom cron" },
];

export const SCHEDULE_EVERY_OPTIONS = [1, 2, 3, 4, 6, 12, 15, 30].map((n) => ({
  id: String(n),
  text: String(n),
}));

const SCHEDULE_UNIT_SET = new Set<string>(
  SCHEDULE_UNIT_OPTIONS.map((one) => one.id)
);

export interface RoutineTileCallbacks {
  onacknowledge: (actionId: string) => void;
  onapprove: (actionId: string) => void;
  oncancelaction: (actionId: string) => void;
  ondelete: (id: string) => void;
  ondeny: (actionId: string) => void;
  onedit: (id: string) => void;
  onextenddate: (id: string, days: number | null) => void;
  onfixwithcaw: (prompt: string) => void;
  onkeep: (id: string) => void;
  onmarkdone: (id: string) => void;
  onopenroutine: (id: string) => void;
  onopenrun: (routineId: string, runId: string) => void;
  onresumerule: (ruleId: string) => void;
  onrunnow: (id: string) => void;
  ontogglepause: (id: string) => void;
}

export function isScheduleUnit(
  value: string | undefined
): value is ScheduleUnit {
  return value !== undefined && SCHEDULE_UNIT_SET.has(value);
}

function cadenceFromScheduleUnit(
  unit: ScheduleUnit,
  every: number
): ScheduleCadence {
  switch (unit) {
    case "minute":
    case "cron":
      return "custom";
    case "hour":
      return every === 1 ? "hourly" : "custom";
    case "day":
      return every === 1 ? "daily" : "custom";
    case "weekday":
      return "weekdays";
    case "week":
      return "weekly";
    case "events":
      return "events";
  }
}

export function describeDraftSchedule(
  draft: Pick<
    RoutineDraftSubmit,
    "cron" | "scheduleEvery" | "scheduleUnit" | "time" | "timezone" | "weekday"
  >
): { nextLabel: string; rhythm: string } {
  const zone = draft.timezone === LOCAL_ZONE ? "" : ` ${draft.timezone}`;
  const hm = draft.time || "09:00";
  const day = draft.weekday || "Mon";
  const n = Math.max(1, draft.scheduleEvery);
  const expr = draft.cron.trim();

  switch (draft.scheduleUnit) {
    case "minute":
      return {
        nextLabel: `In ${n}m on your clock`,
        rhythm: n === 1 ? "Every minute" : `Every ${n} minutes`,
      };
    case "hour":
      return {
        nextLabel:
          n === 1 ? "Today 22:00 on your clock" : `In ${n}h on your clock`,
        rhythm: n === 1 ? `Hourly at :00${zone}` : `Every ${n} hours${zone}`,
      };
    case "day":
      return {
        nextLabel: `Tomorrow ${hm} on your clock`,
        rhythm:
          n === 1 ? `Daily at ${hm}${zone}` : `Every ${n} days at ${hm}${zone}`,
      };
    case "weekday":
      return {
        nextLabel: `Mon ${hm} on your clock`,
        rhythm: `Weekdays at ${hm}${zone}`,
      };
    case "week":
      return {
        nextLabel: `Next ${day} ${hm} on your clock`,
        rhythm:
          n === 1
            ? `Every ${day} at ${hm}${zone}`
            : `Every ${n} weeks (${day}) at ${hm}${zone}`,
      };
    case "events":
      return {
        nextLabel: "Waits for matching events",
        rhythm: "Only when a matching event arrives",
      };
    case "cron":
      return {
        nextLabel: expr
          ? "Today 21:30 on your clock"
          : "Enter a 5-field cron expression",
        rhythm: expr ? `Custom (${expr})${zone}` : "Custom schedule",
      };
  }
}

export const WEEKDAY_OPTIONS = [
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
  "Sun",
].map((day) => ({ id: day, text: day }));

export const ZONE_OPTIONS = [
  LOCAL_ZONE,
  "UTC",
  "America/New_York",
  "America/Los_Angeles",
  "Europe/London",
].map((zone) => ({ id: zone, text: zone }));

export const HARNESS_OPTIONS = [
  "Project default",
  "Claude Code",
  "OpenCode",
  "Pi",
].map((name) => ({ id: name, text: name }));

const WHITESPACE = /\s+/u;
const TODAY_ISO = "2026-11-21";

function unitFromRoutine(editing: Routine): {
  every: number;
  unit: ScheduleUnit;
} {
  if (editing.schedule.unit) {
    return { every: editing.schedule.every ?? 1, unit: editing.schedule.unit };
  }
  switch (editing.schedule.cadence) {
    case "hourly":
      return { every: 1, unit: "hour" };
    case "daily":
      return { every: 1, unit: "day" };
    case "weekdays":
      return { every: 1, unit: "weekday" };
    case "weekly":
      return { every: 1, unit: "week" };
    case "events":
      return { every: 1, unit: "events" };
    case "custom":
      return editing.schedule.cron === "*/15 * * * *"
        ? { every: 15, unit: "minute" }
        : { every: 1, unit: "cron" };
  }
}

export function initialDraftFromRoutine(
  editing: Routine | null
): RoutineDraftSubmit {
  if (!editing) {
    return {
      cadence: "daily",
      cron: "*/15 * * * *",
      doneWhenCommand: "",
      doneWhenMethod: "model",
      doneWhenStatement: "",
      executorMode: "delegate",
      giveUpDate: "",
      guardrail: "",
      harness: "Project default",
      instructions: "",
      name: "",
      scheduleEvery: 1,
      scheduleUnit: "day",
      time: "09:00",
      timezone: LOCAL_ZONE,
      weekday: "Mon",
    };
  }
  const { every, unit } = unitFromRoutine(editing);
  return {
    cadence: editing.schedule.cadence,
    cron: editing.schedule.cron ?? "*/15 * * * *",
    doneWhenCommand: editing.doneWhen?.command ?? "",
    doneWhenMethod: editing.doneWhen?.method ?? "model",
    doneWhenStatement: editing.doneWhen?.statement ?? "",
    executorMode:
      editing.executor.mode === "orchestrator" ? "orchestrator" : "delegate",
    giveUpDate: editing.doneWhen?.giveUpAt
      ? new Date(editing.doneWhen.giveUpAt).toISOString().slice(0, 10)
      : "",
    guardrail: editing.guardrail ?? "",
    harness: editing.executor.harness ?? "Project default",
    instructions: editing.instructions,
    name: editing.name,
    scheduleEvery: every,
    scheduleUnit: unit,
    time: editing.schedule.time,
    timezone: editing.schedule.timezone,
    weekday: editing.schedule.weekday,
  };
}

export type BadDraftField =
  "name" | "statement" | "command" | "instructions" | "date" | "cron" | null;

export function validateRoutineDraft(input: {
  cleanName: string;
  cron: string;
  doneWhenCommand: string;
  doneWhenMethod: "model" | "command";
  giveUpDate: string;
  hasDoneWhen: boolean;
  instructions: string;
  isBuiltIn: boolean;
  isCommandRun: boolean;
  scheduleUnit: ScheduleUnit;
}): { field: BadDraftField; reason: string } | null {
  if (!input.cleanName) {
    return {
      field: "name",
      reason: "Give this routine a plain name (3 to 6 words).",
    };
  }
  if (input.cleanName.length > 64) {
    return {
      field: "name",
      reason: `Name is ${input.cleanName.length} characters; keep it to 64 characters or fewer.`,
    };
  }
  if (input.hasDoneWhen) {
    if (input.doneWhenMethod === "command" && !input.doneWhenCommand.trim()) {
      return {
        field: "command",
        reason: "Enter the shell command CawCo should run to check.",
      };
    }
    if (input.giveUpDate && input.giveUpDate <= TODAY_ISO) {
      return {
        field: "date",
        reason:
          "The stop-trying date must be after today (leave blank to keep checking until done).",
      };
    }
  }
  if (!(input.isBuiltIn || input.isCommandRun || input.instructions.trim())) {
    return {
      field: "instructions",
      reason: "Describe what each run should do.",
    };
  }
  if (input.scheduleUnit === "cron") {
    const parts = input.cron.trim().split(WHITESPACE).filter(Boolean);
    if (parts.length !== 5) {
      return {
        field: "cron",
        reason:
          "Custom schedules take five space-separated fields (minute hour day month weekday).",
      };
    }
  }
  return null;
}

function createLiveRun(input: {
  attribution: RoutineRun["attribution"];
  id: string;
  oneLine: string;
  resultMarkdown: string;
  trigger: RoutineRun["trigger"];
}): RoutineRun {
  return {
    attribution: input.attribution,
    durationMs: 1000,
    id: input.id,
    oneLine: input.oneLine,
    outcome: "running",
    resultMarkdown: input.resultMarkdown,
    startedAt: MOCK_NOW,
    trigger: input.trigger,
  };
}

function buildExecutorFromDraft(
  draft: RoutineDraftSubmit
): Routine["executor"] {
  if (draft.doneWhenStatement && draft.doneWhenMethod === "command") {
    return {
      label: `Shell command on ${MOCK_MACHINE.hostname}`,
      mode: "command",
    };
  }
  const role =
    draft.executorMode === "orchestrator"
      ? "Orchestrating session"
      : "Single session";
  return {
    harness: draft.harness === "Project default" ? undefined : draft.harness,
    label: `${role} · ${draft.harness}`,
    mode: draft.executorMode,
  };
}

function buildDoneWhenFromDraft(
  draft: RoutineDraftSubmit,
  giveUpAt: number | null,
  existing?: Routine["doneWhen"]
): Routine["doneWhen"] {
  if (!draft.doneWhenStatement) {
    return undefined;
  }
  return {
    checkedAt: existing?.checkedAt ?? null,
    command:
      draft.doneWhenMethod === "command" ? draft.doneWhenCommand : undefined,
    giveUpAt,
    heldSteps: existing?.heldSteps ?? 0,
    heldTasks: existing?.heldTasks ?? [],
    lastExitCode: existing?.lastExitCode ?? null,
    lastWords: existing?.lastWords ?? null,
    lastWordsBy: existing?.lastWordsBy ?? null,
    machineName: existing?.machineName ?? MOCK_MACHINE.hostname,
    metAt: existing?.metAt ?? null,
    method: draft.doneWhenMethod,
    standing: existing?.standing ?? "pending",
    statement: draft.doneWhenStatement,
  };
}

function buildScheduleFromDraft(
  draft: RoutineDraftSubmit,
  rhythm: string,
  nextAt: number | null
): Routine["schedule"] {
  const cadence = cadenceFromScheduleUnit(
    draft.scheduleUnit,
    draft.scheduleEvery
  );
  return {
    cadence,
    cron: draft.scheduleUnit === "cron" ? draft.cron : undefined,
    every: draft.scheduleEvery,
    nextAt,
    rhythm,
    time: draft.time,
    timezone: draft.timezone,
    unit: draft.scheduleUnit,
    weekday: draft.weekday,
  };
}

export function applyRoutineEdit(
  one: Routine,
  draft: RoutineDraftSubmit,
  rhythm: string,
  giveUpAt: number | null
): Routine {
  const blocked =
    one.status === "paused" ||
    one.status === "stopped" ||
    one.status === "finished" ||
    draft.scheduleUnit === "events";
  const schedule = buildScheduleFromDraft(
    draft,
    rhythm,
    blocked ? null : MOCK_NOW + HOUR_MS
  );
  if (one.builtIn) {
    return { ...one, schedule };
  }
  const [firstLine] = draft.instructions.split("\n");
  return {
    ...one,
    doneWhen: buildDoneWhenFromDraft(draft, giveUpAt, one.doneWhen),
    executor: buildExecutorFromDraft(draft),
    guardrail: draft.guardrail.trim() || undefined,
    instructions: draft.instructions,
    name: draft.name,
    schedule,
    summary: firstLine || draft.doneWhenStatement,
  };
}

export function createRoutineRecord(input: {
  draft: RoutineDraftSubmit;
  giveUpAt: number | null;
  id: string;
  rhythm: string;
  testRunId: string;
}): Routine {
  const { draft } = input;
  const isCmd =
    Boolean(draft.doneWhenStatement) && draft.doneWhenMethod === "command";
  const [firstLine] = draft.instructions.split("\n");
  return {
    doneWhen: buildDoneWhenFromDraft(draft, input.giveUpAt),
    executor: buildExecutorFromDraft(draft),
    guardrail: draft.guardrail.trim() || undefined,
    id: input.id,
    instructions: draft.instructions,
    limits: {
      maxDollars: isCmd ? undefined : 0.75,
      maxMinutes: isCmd ? 1 : 5,
      maxTurns: isCmd ? undefined : 12,
      runsWeek: 1,
    },
    name: draft.name,
    origin: { by: "owner", kept: true },
    runningStartedAt: MOCK_NOW,
    runningStep: "Running first check",
    runs: [
      createLiveRun({
        attribution: isCmd ? "command" : "model",
        id: input.testRunId,
        oneLine: "Running creation test on obelisk…",
        resultMarkdown: "First run is in progress on `obelisk`.",
        trigger: "creation-test",
      }),
    ],
    schedule: buildScheduleFromDraft(
      draft,
      input.rhythm,
      draft.scheduleUnit === "events" ? null : MOCK_NOW + HOUR_MS
    ),
    status: "running",
    statusReason: null,
    summary: firstLine || draft.doneWhenStatement,
  };
}

export function toggleRoutinePauseState(one: Routine): Routine {
  if (one.status === "finished") {
    return one;
  }
  const resuming = one.status === "paused" || one.status === "stopped";
  return {
    ...one,
    doneWhen: one.doneWhen
      ? { ...one.doneWhen, standing: resuming ? "not-yet" : "paused" }
      : undefined,
    schedule: {
      ...one.schedule,
      nextAt: resuming ? (one.schedule.nextAt ?? MOCK_NOW + 2 * HOUR_MS) : null,
    },
    status: resuming ? "active" : "paused",
    statusReason: resuming ? null : "Paused by you",
  };
}

export function markRoutineDoneState(one: Routine, runId: string): Routine {
  if (!one.doneWhen) {
    return one;
  }
  const released = one.doneWhen.heldTasks.map((task) => task.id);
  const tail =
    released.length > 0
      ? `Released ${released.join(", ")} and stopped checking.`
      : "Marked done by you and stopped checking.";
  const doneRun: RoutineRun = {
    attribution: "system",
    durationMs: 0,
    id: runId,
    oneLine: `Marked done by you · ${tail}`,
    outcome: "met",
    resultMarkdown: `### Marked done by you\n\nStatement: *${one.doneWhen.statement}*\n\n${tail}`,
    startedAt: MOCK_NOW,
    trigger: "manual",
  };
  return {
    ...one,
    doneWhen: {
      ...one.doneWhen,
      checkedAt: MOCK_NOW,
      heldSteps: 0,
      heldTasks: [],
      lastWords: "Marked done by you.",
      lastWordsBy: "owner",
      markedDoneByOwner: true,
      metAt: MOCK_NOW,
      standing: "met",
    },
    runs: [doneRun, ...one.runs],
    schedule: { ...one.schedule, nextAt: null },
    status: "finished",
    statusReason: "Done today; you said so",
  };
}

export function checkRoutineAgainState(one: Routine, runId: string): Routine {
  if (!one.doneWhen) {
    return one;
  }
  const freshRun = createLiveRun({
    attribution: one.doneWhen.method === "command" ? "command" : "model",
    id: runId,
    oneLine: "Checking again on obelisk…",
    resultMarkdown: "A fresh check is running now on `obelisk`.",
    trigger: "manual",
  });
  return {
    ...one,
    doneWhen: {
      ...one.doneWhen,
      markedDoneByOwner: false,
      metAt: null,
      standing: "not-yet",
    },
    runningStartedAt: MOCK_NOW,
    runningStep: "Running fresh check",
    runs: [freshRun, ...one.runs],
    schedule: { ...one.schedule, nextAt: MOCK_NOW + HOUR_MS },
    status: "running",
    statusReason: null,
  };
}

export function extendCheckDateState(
  one: Routine,
  days: number | null
): Routine {
  if (!one.doneWhen) {
    return one;
  }
  return {
    ...one,
    doneWhen: {
      ...one.doneWhen,
      giveUpAt: days === null ? null : MOCK_NOW + days * DAY_MS,
      standing: "not-yet",
    },
    schedule: { ...one.schedule, nextAt: MOCK_NOW + HOUR_MS },
    status: "active",
    statusReason: null,
  };
}

export function createSuggestedRoutine(suggestion: CawSuggestion): Routine {
  return {
    builtIn: true,
    executor: { label: "CawCo built-in", mode: "builtin" },
    id: "rtn-unused-skills",
    instructions: suggestion.detail,
    limits: { maxMinutes: 3, runsWeek: 0 },
    name: suggestion.title,
    origin: { by: "cawco", kept: true },
    runs: [],
    schedule: {
      cadence: "weekly",
      nextAt: MOCK_NOW + 35 * HOUR_MS,
      rhythm: "Every Mon at 09:00",
      time: "09:00",
      timezone: LOCAL_ZONE,
      weekday: "Mon",
    },
    status: "active",
    statusReason: null,
    summary:
      "Counts skills and MCP servers called in the past 30 days and proposes unlisting unused ones.",
  };
}

function applyActionDecision(
  one: ApprovedAction,
  decision: ActionDecision
): ApprovedAction {
  if (decision === "approve") {
    return {
      ...one,
      serviceResponse: "200 OK — accepted by service",
      shortOutcome: one.sentence,
      state: "ran",
      stateAt: MOCK_NOW,
      whenLabel: "Ran just now",
    };
  }
  if (decision === "deny") {
    return { ...one, state: "denied", stateAt: MOCK_NOW };
  }
  if (decision === "cancel") {
    return { ...one, state: "cancelled", stateAt: MOCK_NOW };
  }
  return { ...one, needsLook: false };
}

export function patchActionDecision(
  list: ApprovedAction[],
  decision: ActionDecision,
  actionId: string
): ApprovedAction[] {
  return list.map((one) =>
    one.id === actionId ? applyActionDecision(one, decision) : one
  );
}

export function runRoutineNowState(one: Routine, runId: string): Routine {
  const freshRun = createLiveRun({
    attribution: one.doneWhen?.method === "command" ? "command" : "model",
    id: runId,
    oneLine: "Running now on obelisk…",
    resultMarkdown: "Run started by you and is currently running on `obelisk`.",
    trigger: "manual",
  });
  return {
    ...one,
    runningStartedAt: MOCK_NOW,
    runningStep: "Running now",
    runs: [freshRun, ...one.runs],
    status: "running",
    statusReason: null,
  };
}

export function keepRoutineState(one: Routine): Routine {
  const failed =
    one.runs[0]?.outcome === "failed" ||
    one.runs[0]?.outcome === "could-not-check";
  return {
    ...one,
    origin: { ...one.origin, expiresAt: null, kept: true },
    statusReason: failed ? "Last run failed" : null,
  };
}
