/**
 * The project the project-parts bench draws: tidewater, a sailing school's
 * booking site, with one task per state a board card or the task pane can
 * be in, and one whose title runs to forty words. Times are relative to
 * the page's load, so "2h ago" reads true whenever it is opened.
 */
import type { DecisionsList } from "@cawco/core/decisions";
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

const NOW = Date.now();
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const ago = (ms: number): number => NOW - ms;

/** Forty words: a name as long as the layout must hold. */
export const LONG =
  "Rebuild the whole spring and summer course booking flow so a family can book three children onto different dinghy courses in one go, pay one deposit, pick wetsuit sizes for each child, and get one joining email with every date";

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

/** What the empty board offers to say to Caw: one, four, and four with a forty-word one. */
export const BOARD_STARTERS: Record<string, ProjectStarter[]> = {
  one: [
    starter("tasks", "Plan the spring course booking flow with online deposits"),
  ],
  four: [
    starter("tasks", "Plan the spring course booking flow with online deposits"),
    starter(
      "bug",
      "Find out why the tide table is an hour out after the clocks change"
    ),
    starter("people", "Draft an instructor rota page the team can edit"),
    starter("ideas", "Suggest what to build before the season starts"),
  ],
  long: [
    starter("tasks", LONG),
    starter(
      "bug",
      "Find out why the tide table is an hour out after the clocks change"
    ),
    starter("people", "Draft an instructor rota page the team can edit"),
    starter("ideas", "Suggest what to build before the season starts"),
  ],
};

/** What the empty Routines block offers. */
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

/** The sessions the tasks' attempts ran in. */
const SESSION = {
  code14: "a1b2c3d4-0014-4000-8000-000000000014",
  tide16: "a1b2c3d4-0016-4000-8000-000000000016",
  rota18a: "a1b2c3d4-0181-4000-8000-000000000181",
  rota18b: "a1b2c3d4-0182-4000-8000-000000000182",
  cal12: "a1b2c3d4-0012-4000-8000-000000000012",
  gift21: "a1b2c3d4-0021-4000-8000-000000000021",
  long22: "a1b2c3d4-0022-4000-8000-000000000022",
} as const;

const attempt = (
  instanceId: string,
  state: TaskAttempt["state"],
  startedAgo: number,
  endedAgo: number | null,
  more: Partial<TaskAttempt> = {}
): TaskAttempt => ({
  workItemId: `wi-${instanceId.slice(-4)}`,
  instanceId,
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
    { kind: "artifact" as const, artifactId: "art-stored-times" },
  ],
  at: ago(2 * HOUR),
};

export const TASKS: TaskSummary[] = [
  base("tsk-12", "Course calendar from the season sheet", "done", {
    attempts: [
      attempt(SESSION.cal12, "done", 4 * DAY, 3 * DAY, {
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
    attempts: [attempt(SESSION.code14, "running", 12 * MIN, null)],
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
        attempt(SESSION.tide16, "done", 3 * HOUR, 2 * HOUR, {
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
    { after: ["tsk-14", "tsk-18"], labels: ["booking", "email"] }
  ),
  base("tsk-18", "Instructor rota page", "working", {
    attempts: [
      attempt(SESSION.rota18b, "running", 6 * MIN, null),
      attempt(SESSION.rota18a, "failed", 2 * HOUR, HOUR, {
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
    startProblem: "No machine with the tidewater checkout is online.",
    labels: ["booking"],
  }),
  base("tsk-21", "Gift vouchers for taster sessions", "working", {
    attempts: [
      attempt(SESSION.gift21, "failed", 2 * HOUR, HOUR, {
        endedHow: "Ran out of context after three compactions.",
      }),
    ],
    lastAttemptFailed: true,
    labels: ["payments"],
    todos: { done: 2, total: 6 },
    updatedAt: ago(HOUR),
  }),
  base("tsk-22", LONG, "review", {
    attempts: [
      attempt(SESSION.long22, "done", 5 * HOUR, 4 * HOUR, {
        result: {
          summary: `${LONG}. Every step is in, with the deposit taken once for the family and the joining email listing each child's dates.`,
          check: ["three children, one deposit", "joining email dates"],
          artifacts: [],
          at: ago(4 * HOUR),
        },
      }),
    ],
    labels: ["booking", "payments", "email", "family"],
    todos: { done: 9, total: 12 },
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
  "tsk-22": LONG,
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

/** A task's history: made by Caw. */
export function historyOf(id: string): TaskHistory {
  const summary = taskOf(id);
  return {
    id,
    path: summary.path,
    state: "live",
    events: [
      {
        actor: { id: null, mover: "lead", name: "Caw" },
        at: summary.createdAt,
        commit: `c-${id}-0`,
        kind: "created",
        path: summary.path,
        reason: null,
        stage: { from: null, to: "ready" },
        what: "create",
      },
    ],
  };
}

/** The project's decision pages: the one tsk-16's session handed in, still being picked. */
export const DECISIONS: DecisionsList = {
  graph: false,
  problems: [],
  pages: [
    {
      artifactId: "art-stored-times",
      cards: 1,
      decided: 0,
      name: "stored-times",
      notes: 0,
      picked: 0,
      state: "picking",
      tasks: 0,
      title: "what to do with the tide times stored before the fix",
      updatedAt: ago(2 * HOUR),
      writer: null,
    },
  ],
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

/** tidewater as the hub lists it, under the name given: its checkout on harbour, then its folder on the hub. */
export const projectRow = (name: string): ProjectRow => ({
  id: PROJECT,
  name,
  caw: true,
  cawHarness: "claude",
  cawModel: null,
  createdAt: new Date(ago(30 * DAY)).toISOString(),
  lands: "branch",
  leadInstanceId: null,
  lfsConnection: null,
  lfsUrl: null,
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
});

const TASK = /^\/api\/projects\/tidewater\/tasks\/(tsk-\d+)(\/history)?$/;
/** The other reads answered: the project's decision pages. */
const READS: Record<string, unknown> = {
  "/api/projects/tidewater/decisions": DECISIONS,
};

let installed = false;

/**
 * The bench's stand-in for the hub reads the parts make of their own
 * accord (a task's file and history, the project's decision pages, an
 * empty routines page), answered from the fixtures above, as the hub
 * would. Every other request goes out as it would. Installed once.
 */
export function answerReads(): void {
  if (installed || typeof window === "undefined") {
    return;
  }
  installed = true;
  const ownFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(
      input instanceof Request ? input.url : String(input),
      location.href
    );
    const task = url.pathname.match(TASK);
    const id = task?.[1];
    if (id && TASKS.some((each) => each.id === id)) {
      return Promise.resolve(
        Response.json(task?.[2] ? historyOf(id) : viewOf(id))
      );
    }
    if (url.pathname in READS) {
      return Promise.resolve(Response.json(READS[url.pathname]));
    }
    return ownFetch(input, init);
  };
}
