/**
 * An orchestrator's plan in the Cawco-Dev project, shaped as the hub
 * answers it (core plan.ts `SessionPlan`: steps naming tasks and their
 * to-dos, their words and done state their records'), and the sessions
 * working it: the orchestrator and two delegates, each on the records its
 * own plan holds under way. Every frame reads these.
 */
import type { PlanStep, SessionPlan } from "@cawco/core/plan";
import type { WorkItemSummary } from "@cawco/core/protocol";
import type { SessionQuestion } from "@cawco/core/session-questions";
import { type WaitingRow, waitingRows } from "../../waiting/rows";
import type { PlanWorker } from "../plan-view";

/** The orchestrator, whose delegate tray stands on the composer. */
export const ORCHESTRATOR = "s-orchestrator-plan";

/** The decision page the nightly waits on, by its id. */
const NIGHTLY_PAGE = "4b8e2f10-6c3d-4a7e-9f21-0d5b8c6e1a37";

const task = (
  id: number,
  content: string,
  status: PlanStep["status"],
  more: Partial<PlanStep> = {}
): PlanStep => ({
  id: `tsk-${id}`,
  task: `tsk-${id}`,
  content,
  status,
  depth: 0,
  ...more,
});

const todo = (
  taskId: number,
  n: number,
  content: string,
  status: PlanStep["status"]
): PlanStep => ({
  id: `tsk-${taskId}:td-${n}`,
  task: `tsk-${taskId}`,
  todo: `td-${n}`,
  content,
  status,
  depth: 1,
});

/** Eleven tasks: three done, three under way (two by delegates), one held on the person, two waiting on other things, two untouched. */
const STEPS: PlanStep[] = [
  task(309, "Move a session to another account at its limit", "completed"),
  task(312, "Tray chips fold their words where the row is narrow", "completed"),
  task(318, "Title bars follow the Liquid Glass toolbar model", "completed"),
  task(326, "Comments rail and sheet", "in_progress"),
  todo(
    326,
    1,
    "Rail at 1440 groups pins by the frame they stand on",
    "completed"
  ),
  todo(
    326,
    2,
    "A pin's replies open in a sheet pulled up on a phone",
    "completed"
  ),
  todo(
    326,
    3,
    "The reply field keeps a half-written reply across a reload",
    "in_progress"
  ),
  todo(326, 4, "Resolve and reopen a pin from the rail", "pending"),
  todo(326, 5, "An empty rail says what lands in it", "pending"),
  task(331, "Delegate tray at 390", "in_progress"),
  todo(331, 1, "Chips fold their words under 390", "completed"),
  todo(331, 2, "“+3” opens the shelf of the delegates it hides", "in_progress"),
  todo(
    331,
    3,
    "A failed delegate's chip keeps its place at the row's end",
    "pending"
  ),
  task(335, "Ship tonight's nightly with the title bars", "pending", {
    waitsOn: `${NIGHTLY_PAGE}#ship-nightly`,
  }),
  task(340, "Sign-in move for stored transcripts", "in_progress"),
  todo(340, 1, "Read the stored sign-in from its old key", "completed"),
  todo(340, 2, "Write it under the account's id", "in_progress"),
  todo(340, 3, "Drop the old key one release later", "pending"),
  task(344, "The plan's chip says how far the plan has got", "pending", {
    waitsOn: "tsk-326",
  }),
  task(347, "Machines list shows when a paused machine resumes", "pending"),
  task(352, "Release notes for 0.42", "pending", {
    waitsOn: "https://github.com/bewinxed/cockpit/pull/1184",
  }),
  task(355, "A project's page shows the tasks in review first", "pending"),
];

/** Twenty-one more titles from the same board, for the long plan. */
const MORE = [
  "Stop a delegate from its chip without opening it",
  "Files list keeps its scroll across tabs",
  "A machine away says since when",
  "Pairing a phone survives a hub restart",
  "Caw's panel remembers its width per project",
  "Search the transcript from the composer",
  "Hooks page shows which hook ran last",
  "Routines list reads down fixed columns",
  "A task's review shows its checks first",
  "Decision pages open at the card a link names",
  "Usage meter footnote on the account page",
  "Skills list groups by where each is loaded",
  "Model picker shows each model's context size",
  "New session modal keeps the last harness picked",
  "Artifacts menu sorts by last opened",
  "A failed landing says which check failed",
  "Delegate types list shows each type's model",
  "Project memory shows its character budget",
  "Notices fold after a day",
  "The landing's hero plays once on a phone",
  "Sign in with a passkey from the phone app",
];

/** The plan as the hub answers it. */
export const PLAN: SessionPlan = { source: "cawco", steps: STEPS };

/** A plan of thirty-eight tasks: nine done at its head, the same work under way, twenty-one more untouched after it. */
export const LONG_PLAN: SessionPlan = {
  source: "cawco",
  steps: [
    ...[
      "Plan chip on the tray row reads its count",
      "Delegate chips name their state in words",
      "Composer layer shuts by Esc from the field",
      "Sidebar rows show a session's machine",
      "Board columns hold their width on a phone",
      "Machines list sorts by last seen",
    ].map((words, n) => task(280 + n, words, "completed")),
    ...STEPS,
    ...MORE.map((words, n) => task(360 + n, words, "pending")),
  ],
};

/** One step whose task has left the board, among the rest. */
export const GONE_PLAN: SessionPlan = {
  source: "cawco",
  steps: STEPS.map((step) =>
    step.id === "tsk-347" ? { ...step, gone: true } : step
  ),
};

/** The orchestrator and its two delegates, as the plan's sessions. */
export const WORKERS: PlanWorker[] = [
  {
    id: ORCHESTRATOR,
    name: "Continue CawCo open tasks",
    self: true,
    working: true,
    now: "Running bun run check",
    status: "Working",
    on: ["tsk-340:td-2"],
  },
  {
    id: "s-rail-plan",
    name: "Design the Comments rail and sheet whole",
    self: false,
    working: true,
    now: "Editing ReplyField.svelte",
    status: "Working",
    on: ["tsk-326:td-3"],
  },
  {
    id: "s-tray-plan",
    name: "Tidy the delegate tray on a phone",
    self: false,
    working: false,
    status: "Idle",
    on: ["tsk-331"],
  },
];

/** Every session working a turn now, the tray's delegate between turns too. */
export const WORKERS_ALL_WORKING: PlanWorker[] = WORKERS.map((one) =>
  one.self || one.working
    ? one
    : { ...one, working: true, now: "Reading DelegateTray.svelte" }
);

const delegate = (worker: PlanWorker, minutes: number): WorkItemSummary => ({
  id: `wi-${worker.id}`,
  instanceId: worker.id,
  parentInstanceId: ORCHESTRATOR,
  title: worker.name,
  state: "running",
  createdAt: Date.parse("2026-11-24T09:40:00.000Z") - minutes * 60_000,
  endedAt: null,
  dismissedAt: null,
  dismissReason: null,
  replacedBy: null,
  firstLines: { brief: worker.name, result: "", error: "" },
  machinePaused: null,
  stalled: null,
  queued: null,
  checkQueue: null,
  waitReason: null,
  waitUntil: null,
});

/** The delegates' work items, as the hub's `work_item` frames carry them. */
const DELEGATES: WorkItemSummary[] = WORKERS.filter((one) => !one.self).map(
  (one, n) => delegate(one, 20 + n * 15)
);

const NIGHTLY: SessionQuestion = {
  key: "card:ship-nightly",
  kind: "card",
  words:
    "Ship tonight's nightly with the title bars, or wait for the two host checks?",
  state: "open",
  answer: null,
  stop: { card: "ship-nightly" },
  artifact: { id: NIGHTLY_PAGE, kind: "page", title: "Tonight's nightly" },
  session: null,
};

/** What the session waits on the person for: the card the nightly is held on. */
export const WAITING: WaitingRow[] = waitingRows([NIGHTLY], []);

/**
 * Seeds the delegate tray with the delegates, through the work-items
 * store's writer, as a states file's `beforeEach` does (each story's runner
 * holds its own stores): running before the page loaded, each chip is
 * simply there.
 */
export async function seedDelegates(): Promise<void> {
  const work = await import("../../stores/work-items.svelte");
  const tray = await import("../../transcript/tray.svelte");
  for (const item of DELEGATES) {
    work.takeWorkItem({
      kind: "work_item",
      instanceId: item.parentInstanceId,
      item,
    });
    tray.admit(item.instanceId, "none");
  }
}
