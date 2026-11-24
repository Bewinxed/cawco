/**
 * A session's plan read by who is on each task (direction "By who"), open over
 * the composer of the session's screen (Component Story Format 3, live).
 * The plan's chip on the tray row opens and shuts it; a task's title opens
 * its to-dos; "3 done" opens the finished ones; "Waiting on you" opens the
 * list of what waits. The screen round it is PlanSessionFixture; the
 * delegate tray's two delegates are seeded in `beforeEach` through the
 * work-items store's writer.
 */

import PlanSessionFixture from "./preview/PlanSessionFixture.svelte";
import { seedDelegates } from "./preview/plan-fixtures";

export default {
  title: "Plan/By who",
  component: PlanSessionFixture,
  args: {
    direction: "who",
    plan: "Eleven tasks",
    working: "One delegate idle",
    opened: true,
  },
  beforeEach: seedDelegates,
};

/** The plan open over the conversation: this session and two delegates, each with what it holds. */
export const ByWho = {};

/** A long plan: the sessions on top, the many tasks nobody is on yet under them. */
export const ByWhoLong = { args: { plan: "Thirty-eight tasks" } };

/** A task that has left the board, still in the plan. */
export const ByWhoGone = { args: { plan: "A task gone from the board" } };

/** Every session working a turn now, each saying what it is doing. */
export const ByWhoAllWorking = { args: { working: "Everyone working" } };
