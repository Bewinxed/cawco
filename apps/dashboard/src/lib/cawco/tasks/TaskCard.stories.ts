/**
 * A task's card on the board with its head's status badge (Component Story
 * Format 3, live components): Can't start of each kind the hub tells apart
 * (`startProblemKind`), and a failed attempt. A task the hub waits to start
 * draws the blocked mark in the attn pair; a start that was tried and broke
 * draws the failure mark in the fail pair; the word is Can't start for both,
 * the hub's reason its title (DESIGN.md, The failure mark and the blocked
 * mark). The meta's args are every story's; a story's own args change the
 * task.
 */
import type { TaskSummary } from "#lib/cawco/project-tasks.js";
import TaskCard from "./TaskCard.svelte";

const AT = Date.UTC(2026, 9, 20, 9, 30);

/** A todo task with nothing running, as the hub's index lists it. */
const task = (changes: Partial<TaskSummary>): TaskSummary => ({
  id: "tsk-12",
  number: 12,
  title: "Draw the board's status badges in the solid cut",
  path: "tasks/tsk-12.md",
  stage: "todo",
  kind: "todo",
  type: null,
  labels: [],
  after: [],
  related: [],
  duplicateOf: null,
  foundIn: null,
  parent: null,
  fields: {},
  needsYou: false,
  outputs: [],
  problem: null,
  rank: null,
  todos: { done: 0, total: 0 },
  attempts: [],
  blockedBy: [],
  lastAttemptFailed: false,
  lastAttemptStopped: false,
  liveAttempt: false,
  queuedStart: false,
  startProblem: null,
  startProblemKind: null,
  createdAt: AT,
  updatedAt: AT,
  ...changes,
});

export default {
  title: "Tasks/Card",
  component: TaskCard,
  args: {
    href: "?task=tsk-12",
    kindOf: () => "todo",
    movable: false,
  },
  parameters: { viewport: 320 },
};

/** Nothing broke: no machine with a checkout is online, so the hub waits for a person. */
export const CantStartWaits = {
  args: {
    task: task({
      startProblem:
        "No checkout of tidewater is on a machine that is online, so there is nowhere to cut tsk-12's workspace. Bring one of its machines online, or add a checkout place on one that is.",
      startProblemKind: "waits",
    }),
  },
};

/** The start was tried and broke: Caw, who takes the report, did not start. */
export const CantStartBroke = {
  args: {
    task: task({
      startProblem:
        "tsk-12 is ready to start, but Caw, who takes the reports of the attempts the hub starts, did not start: no account is signed in on obelisk.",
      startProblemKind: "broke",
    }),
  },
};

/** Its newest attempt failed. */
export const Failed = {
  args: { task: task({ lastAttemptFailed: true }) },
};
