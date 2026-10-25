/**
 * tsk-16 as the hub holds it, nothing made up. Read 2026-10-25 with the
 * hub's `task_read` (id tsk-16, history) and `find`:
 *
 * - the task: "Make the webkit-caw probe pass on obelisk", stage done,
 *   label probe-kit, its one attempt (work item 1e957c60, session
 *   d2d350ee, done);
 * - its to-dos: td-1 and td-2, both `(proposed)`, added by the hub in
 *   commit 226264e9 at 1792106887000 (2026-10-16 02:28:07 +0300): "task
 *   tsk-16: add td-1, td-2 (by hub: attempt 1e957c60 ended cancelled with
 *   these left open in its plan)";
 * - that attempt's session: "Fix webkit-caw probe on obelisk", handle
 *   cockpit-c3201594#d2d350ee (its workspace, the mark's hue).
 *
 * The design's lines name the attempt that offered them (`(proposed by
 * 1e957c60)`, the report's §2): `offeredBy` below is that work item, the
 * one the commit names. The page's clock stands at NOW (main.js), so the
 * hint's age reads as it did when the preview was made.
 */

/** The page's "now": 2026-10-25 12:00 +0300. */
export const NOW = Date.parse("2026-10-25T12:00:00+03:00");

/** The attempt that left both offers open in its plan. */
export const ATTEMPT = {
  workItemId: "1e957c60-03fb-4ca1-bdc5-cede4cbfd69f",
  state: "done",
  instanceId: "d2d350ee-0423-4d6e-8b29-bd00350f8ff9",
  result: null,
  startedAt: 1_792_053_555_544,
  endedAt: 1_792_116_375_953,
  endedHow: null,
  headline:
    "webkit-caw now bounds the dashboard's own main-thread CPU per frame instead of WebKit's frame cadence, and Caw's first press dropped from 21–28ms to 14–21ms. Rebased onto main, it passes alone and in the full web run (first press 14ms both times), with the 25ms limit unchanged.",
};

/** The hint's attempt: its session, as Sessions draws its row. */
export const OFFERED_BY = {
  at: 1_792_106_887_000,
  href: "?__state=view:offered",
  place: "/home/bewinxed/.worktrees/cockpit-c3201594",
  session: ATTEMPT.instanceId,
  status: "done",
  title: "Fix webkit-caw probe on obelisk",
};

/** Its to-dos as the file has them today: `- [ ] [td-1] (proposed) …`. */
export const TODOS = [
  {
    id: "td-1",
    proposed: true,
    text: "Full web run on committed fix",
    promoted: null,
    path: "1",
    done: false,
    depth: 0,
  },
  {
    id: "td-2",
    proposed: true,
    text: "finish_item with findings (first-press cold cost, compositing not bounded)",
    promoted: null,
    path: "2",
    done: false,
    depth: 0,
  },
];

/** The same lines as the design writes them: `(proposed by 1e957c60)`. */
export const OFFERED = TODOS.map((todo) => ({
  ...todo,
  offeredBy: ATTEMPT.workItemId,
}));

/** After Keep on the first: its line loses the marker, in place. */
export const KEPT_ONE = OFFERED.map((todo) =>
  todo.id === "td-1"
    ? { ...todo, proposed: false, offeredBy: undefined }
    : todo
);

/** The task as the board's index row has it (TaskSummary). */
export const SUMMARY = {
  after: [],
  attempts: [ATTEMPT],
  blockedBy: [],
  createdAt: 1_791_966_514_000,
  duplicateOf: null,
  fields: { triage: "ready-for-agent" },
  foundIn: null,
  id: "tsk-16",
  kind: "done",
  labels: ["probe-kit"],
  lastAttemptFailed: false,
  lastAttemptStopped: false,
  liveAttempt: false,
  needsYou: false,
  number: 16,
  outputs: [],
  parent: null,
  path: "tasks/tsk-16-make-the-webkit-caw-probe-pass-on-obelisk.md",
  problem: null,
  queuedStart: false,
  rank: null,
  related: [],
  stage: "done",
  startProblem: null,
  title: "Make the webkit-caw probe pass on obelisk",
  // Main's index: offers out of the count (core todoProgress).
  todos: { done: 0, total: 0 },
  type: null,
  updatedAt: 1_792_116_376_000,
};

/** The hub's own words when a keep names a to-do the file no longer has (task-file.ts `findTodoLine`). */
export const GONE = "tsk-16 has no to-do td-1.";
