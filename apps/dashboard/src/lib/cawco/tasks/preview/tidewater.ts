/**
 * The project the redesign page draws: tidewater, a sailing school's
 * booking site, with the tasks the two advisors drew (tsk-11 to tsk-21),
 * one per state a card or the task pane can be in. Times are relative to
 * the page's load, so "2h ago" reads true whenever it is opened.
 */
import type { ComponentProps } from "svelte";
import type ProjectHead from "#lib/cawco/project/ProjectHead.svelte";
import type {
  ProjectStarter,
  StageKind,
  StagesView,
  TaskAttempt,
  TaskHistory,
  TaskSummary,
  TaskView,
} from "#lib/cawco/project-tasks.js";

export const PROJECT = "tidewater";
export const PROJECT_NAME = "tidewater";

const NOW = Date.now();
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
export const ago = (ms: number): number => NOW - ms;

export const STAGES: StagesView = {
  stages: [
    { name: "ready", kind: "todo", hooks: {} },
    { name: "working", kind: "active", hooks: { runs: "code" } },
    { name: "review", kind: "you", hooks: {} },
    { name: "done", kind: "done", hooks: {} },
    { name: "dropped", kind: "dropped", hooks: {} },
  ],
  moves: [
    { from: "ready", to: "working", who: ["you", "lead"] },
    { from: "working", to: "review", who: ["session"] },
    { from: "review", to: "done", who: ["you"] },
    { from: "review", to: "working", who: ["you"] },
    { from: "*", to: "ready", who: ["you"] },
    { from: "*", to: "dropped", who: ["you"] },
  ],
  problems: [],
  source: "file",
  template: "code",
  views: [],
  starters: [],
  decisionStarters: [],
  routineStarters: [],
};

const starter = (
  glyph: ProjectStarter["glyph"],
  text: string
): ProjectStarter => ({ glyph, text, reason: "", sources: [] });

/** What the empty board and Caw's panel offer to say to him. */
export const BOARD_STARTERS: ProjectStarter[] = [
  starter("tasks", "Plan the spring course booking flow with online deposits"),
  starter(
    "bug",
    "Find out why the tide table is an hour out after the clocks change"
  ),
  starter("people", "Draft an instructor rota page the team can edit"),
  starter("ideas", "Suggest what to build before the season starts"),
];

/** What the empty Decisions tab offers. */
export const DECISION_STARTERS: ProjectStarter[] = [
  starter("palette", "Lay out three directions for the booking page's look"),
  starter("grill", "Weigh Stripe against GoCardless for course deposits"),
];

/** What the empty Routines page offers. */
export const ROUTINE_STARTERS: ProjectStarter[] = [
  starter(
    "calendar",
    "Every Monday at 08:00, check next week's courses for empty berths"
  ),
  starter(
    "refresh",
    "Each night, pull the Met Office forecast and flag gale days on the calendar"
  ),
];

/** The sessions the tasks' attempts ran in: their names and statuses. */
export interface SessionFixture {
  id: string;
  name: string;
  place: string;
}

export const SESSIONS: Record<string, SessionFixture> = {
  code14: {
    id: "a1b2c3d4-0014-4000-8000-000000000014",
    name: "code",
    place: "/srv/tidewater",
  },
  tide16: {
    id: "a1b2c3d4-0016-4000-8000-000000000016",
    name: "fix-tide",
    place: "/srv/tidewater",
  },
  rota18a: {
    id: "a1b2c3d4-0181-4000-8000-000000000181",
    name: "rota",
    place: "/srv/tidewater",
  },
  rota18b: {
    id: "a1b2c3d4-0182-4000-8000-000000000182",
    name: "rota",
    place: "/srv/tidewater",
  },
  cal12: {
    id: "a1b2c3d4-0012-4000-8000-000000000012",
    name: "season-calendar",
    place: "/srv/tidewater",
  },
  gift21: {
    id: "a1b2c3d4-0021-4000-8000-000000000021",
    name: "vouchers",
    place: "/srv/tidewater",
  },
};

/** The fixture's name for a session, by its id. */
export const sessionNameOf = (id: string): string =>
  Object.values(SESSIONS).find((one) => one.id === id)?.name ?? "Its session";

const attempt = (
  session: SessionFixture,
  state: TaskAttempt["state"],
  startedAgo: number,
  endedAgo: number | null,
  more: Partial<TaskAttempt> = {}
): TaskAttempt => ({
  workItemId: `wi-${session.id.slice(-4)}`,
  instanceId: session.id,
  state,
  startedAt: ago(startedAgo),
  endedAt: endedAgo === null ? null : ago(endedAgo),
  endedHow: null,
  headline: null,
  result: null,
  ...more,
});

const base = (
  id: string,
  title: string,
  stage: string,
  more: Partial<TaskSummary> = {}
): TaskSummary => {
  const kind = STAGES.stages.find((each) => each.name === stage)?.kind ?? null;
  return {
    id,
    number: Number(id.slice(4)),
    title,
    stage,
    kind,
    labels: [],
    after: [],
    attempts: [],
    blockedBy: [],
    lastAttemptFailed: false,
    lastAttemptStopped: false,
    liveAttempt: false,
    queuedStart: false,
    startProblem: null,
    duplicateOf: null,
    fields: {},
    foundIn: null,
    needsYou: kind === "you",
    outputs: [],
    parent: null,
    path: `tasks/${id}.md`,
    problem: null,
    rank: null,
    related: [],
    todos: { done: 0, total: 0 },
    type: "code",
    createdAt: ago(9 * DAY),
    updatedAt: ago(2 * HOUR),
    ...more,
  };
};

const TIDE_RESULT = {
  summary:
    "Fixed the DST offset in tide.ts; the table now matches BST from 29 March, and the Admiralty times line up for the whole season.",
  check: ["30 Mar 04:12 row", "tests green"],
  artifacts: [
    {
      kind: "file" as const,
      path: "notes/tide-table.png",
      name: "tide-table.png",
    },
    {
      kind: "link" as const,
      url: "https://github.com/tidewater/site/pull/41",
      name: "PR #41",
    },
  ],
  at: ago(2 * HOUR),
};

export const TASKS: TaskSummary[] = [
  base("tsk-12", "Course calendar from the season sheet", "done", {
    attempts: [
      attempt(SESSIONS.cal12, "done", 4 * DAY, 3 * DAY, {
        result: {
          summary:
            "The calendar reads the season sheet and lists every course date with its berths.",
          check: ["April and May dates"],
          artifacts: [],
          at: ago(3 * DAY),
        },
      }),
    ],
    todos: { done: 6, total: 6 },
    labels: ["booking"],
    updatedAt: ago(3 * DAY),
  }),
  base("tsk-14", "Take course deposits with Stripe Checkout", "working", {
    attempts: [attempt(SESSIONS.code14, "running", 12 * MIN, null)],
    liveAttempt: true,
    labels: ["booking", "payments"],
    todos: { done: 3, total: 7 },
    updatedAt: ago(12 * MIN),
  }),
  base("tsk-15", "Show remaining berths on each course date", "ready", {
    labels: ["booking"],
  }),
  base(
    "tsk-16",
    "Tide table is an hour out after the clocks change",
    "review",
    {
      attempts: [
        attempt(SESSIONS.tide16, "done", 3 * HOUR, 2 * HOUR, {
          result: TIDE_RESULT,
        }),
      ],
      labels: ["a11y", "bug"],
      todos: { done: 4, total: 4 },
    }
  ),
  base(
    "tsk-17",
    "Send a booking confirmation email with the joining notes",
    "ready",
    {
      after: ["tsk-14", "tsk-18"],
      labels: ["booking", "email"],
    }
  ),
  base("tsk-18", "Instructor rota page", "working", {
    attempts: [
      attempt(SESSIONS.rota18b, "running", 6 * MIN, null),
      attempt(SESSIONS.rota18a, "failed", 2 * HOUR, HOUR, {
        endedHow: "The rota sheet's date column could not be read.",
      }),
    ],
    liveAttempt: true,
    todos: { done: 1, total: 4 },
    labels: ["staff"],
  }),
  base("tsk-19", "Accessibility pass on the booking form", "ready", {
    labels: ["a11y"],
    todos: { done: 0, total: 5 },
  }),
  base("tsk-20", "Waiting list when a course is full", "ready", {
    startProblem: "No machine for this project is online.",
    labels: ["booking"],
  }),
  base("tsk-21", "Gift vouchers for taster sessions", "working", {
    attempts: [
      attempt(SESSIONS.gift21, "failed", 2 * HOUR, HOUR, {
        endedHow: "Ran out of context after three compactions.",
      }),
    ],
    lastAttemptFailed: true,
    labels: ["payments"],
    todos: { done: 2, total: 6 },
    updatedAt: ago(HOUR),
  }),
];

export const taskOf = (id: string): TaskSummary => {
  const found = TASKS.find((task) => task.id === id);
  if (!found) {
    throw new Error(`No fixture task ${id}`);
  }
  return found;
};

/** The kind of a task's stage, as the board reads it. */
export const kindOf = (id: string): StageKind | null =>
  TASKS.find((task) => task.id === id)?.kind ?? null;

/** The date tsk-15's file sets it for, as the board says it. */
export const DATES: Record<string, string> = { "tsk-15": "Thu 09:30" };

const DESCRIPTIONS: Record<string, string> = {
  "tsk-14":
    "Take a 25% deposit when a course is booked, through Stripe Checkout. The rest is due two weeks before the course.",
  "tsk-16":
    "The tide table shows high water an hour late from the last Sunday in March. It should follow BST.",
  "tsk-19":
    "Go through the booking form with a screen reader and the keyboard alone, and fix what stops either.",
  "tsk-12": "Read the season sheet and draw every course date on the calendar.",
  "tsk-20":
    "When a course is full, let people join a waiting list and email them in order when a berth frees up.",
  "tsk-21":
    "Sell gift vouchers for the taster sessions, redeemable at checkout.",
};

const TODOS: Record<string, string[]> = {
  "tsk-14": [
    "Stripe account keys in the project's secrets",
    "Checkout session for the deposit",
    "Webhook marks the booking paid",
    "Balance reminder email",
    "Refund rule for cancellations",
    "Receipt page",
    "Test cards pass end to end",
  ],
  "tsk-19": [
    "Labels on every field",
    "Errors read out with the field",
    "Focus order follows the form",
    "Date picker works by keyboard",
    "Contrast on the submit button",
  ],
  "tsk-16": [
    "Find where the offset is applied",
    "Use the zone's own rules",
    "Check the week the clocks change",
    "Tests for both changes",
  ],
  "tsk-12": [
    "Read the sheet",
    "Course dates",
    "Berths per date",
    "Instructor per date",
    "Calendar view",
    "Season link in the menu",
  ],
  "tsk-21": [
    "Voucher codes",
    "Checkout redeems them",
    "Voucher email",
    "Expiry rule",
    "Admin list",
    "Refunds",
  ],
};

/** A task's file, read whole: what the pane reads from the hub. */
export function viewOf(id: string): TaskView {
  const summary = taskOf(id);
  const todos = TODOS[id] ?? [];
  return {
    ...summary,
    acceptance: "",
    checks: [],
    comments: [],
    description: DESCRIPTIONS[id] ?? "",
    extra: {},
    hash: `fixture-${id}`,
    issue: null,
    lands: null,
    problems: [],
    result: null,
    sections: [],
    todos: todos.map((text, index) => ({
      depth: 0,
      done: index < summary.todos.done,
      id: `td-${index + 1}`,
      path: String(index + 1),
      promoted: null,
      proposed: false,
      text,
    })),
  };
}

/** A task's history: created, then the moves its state implies. */
export function historyOf(id: string): TaskHistory {
  const summary = taskOf(id);
  const you = { id: null, mover: "you", name: "You" };
  const caw = { id: null, mover: "lead", name: "Caw" };
  const events: TaskHistory["events"] = [
    {
      actor: caw,
      at: summary.createdAt,
      commit: `c-${id}-0`,
      kind: "created",
      path: summary.path,
      reason: null,
      stage: { from: null, to: "ready" },
      what: "create",
    },
  ];
  if (summary.stage !== "ready") {
    events.push({
      actor: you,
      at: summary.attempts.at(-1)?.startedAt ?? summary.updatedAt,
      commit: `c-${id}-1`,
      kind: "moved",
      path: summary.path,
      reason: null,
      stage: { from: "ready", to: "working" },
      what: "move",
    });
  }
  if (summary.stage === "review" || summary.stage === "done") {
    events.push({
      actor: {
        id: summary.attempts[0]?.instanceId ?? null,
        mover: "session",
        name: sessionNameOf(summary.attempts[0]?.instanceId ?? ""),
      },
      at: summary.attempts[0]?.endedAt ?? summary.updatedAt,
      commit: `c-${id}-2`,
      kind: "moved",
      path: summary.path,
      reason: null,
      stage: { from: "working", to: "review" },
      what: "move",
    });
  }
  return { id, path: summary.path, state: "live", events };
}

/** The six states the task pane is drawn in, each with its task. */
export const PANE_STATES = [
  { id: "todo", label: "To do", task: "tsk-19" },
  { id: "working", label: "Working", task: "tsk-14" },
  { id: "review", label: "Review", task: "tsk-16" },
  { id: "done", label: "Done", task: "tsk-12" },
  { id: "failed", label: "Failed", task: "tsk-21" },
  { id: "cant-start", label: "Can't start", task: "tsk-20" },
] as const;

/** The board card's states, each with its task. */
export const CARD_STATES = [
  { id: "todo", label: "To do, nothing to say", task: "tsk-19" },
  { id: "dated", label: "Set for a date", task: "tsk-15" },
  { id: "waits", label: "Waits on other tasks", task: "tsk-17" },
  { id: "working", label: "Working", task: "tsk-14" },
  { id: "retrying", label: "Retrying", task: "tsk-18" },
  { id: "review", label: "In review", task: "tsk-16" },
  { id: "failed", label: "Failed", task: "tsk-21" },
  { id: "cant-start", label: "Couldn't start", task: "tsk-20" },
  { id: "done", label: "Done", task: "tsk-12" },
] as const;

/** What each task's newest session said last, flat: the Session tab's tail. */
export const TAILS: Record<string, string[]> = {
  "tsk-14": [
    "Added the Checkout session for the deposit; the webhook now marks the booking paid.",
    "Writing the balance reminder email next.",
  ],
  "tsk-21": [
    "The voucher codes table is in. Checkout redeems a code before the deposit.",
    "Compacting again: the context is full.",
  ],
  "tsk-16": [
    "Fixed the DST offset in tide.ts; the table matches BST from 29 March.",
    "Handed in the result for review.",
  ],
  "tsk-12": [
    "The calendar reads the season sheet and lists every course date.",
  ],
};

/** The tool each live session is running. */
export const TOOLS: Record<string, string> = {
  "tsk-14": "Edit · src/booking/deposit.ts",
};

type HeadProps = ComponentProps<typeof ProjectHead>;
type ProjectRow = HeadProps["project"];
type Machine = NonNullable<HeadProps["machine"]>;

/** The machine tidewater's checkout is on. */
export const MACHINE: Machine = {
  machineId: "m-harbour",
  hostname: "harbour",
  os: "linux",
  status: "online",
  auth: "unknown",
  lastSeenAt: NOW,
  pausedUntil: null,
  pauseStopped: null,
};

/** tidewater as the hub lists it: its checkout on harbour, then its folder on the hub. */
export const PROJECT_ROW: ProjectRow = {
  id: PROJECT,
  name: PROJECT_NAME,
  caw: true,
  createdAt: new Date(ago(30 * DAY)).toISOString(),
  lands: "branch",
  primaryPlaceId: "pl-harbour",
  remote: "github.com/tidewater/site",
  review: true,
  upstreamPosts: null,
  places: [
    {
      id: "pl-harbour",
      projectId: PROJECT,
      machineId: MACHINE.machineId,
      path: "/srv/tidewater",
      kind: "checkout",
      isPrimary: true,
      createdAt: new Date(ago(30 * DAY)).toISOString(),
    },
    {
      id: "pl-hub",
      projectId: PROJECT,
      machineId: "hub",
      path: `projects/${PROJECT}`,
      kind: "hub",
      isPrimary: false,
      createdAt: new Date(ago(30 * DAY)).toISOString(),
    },
  ],
};
