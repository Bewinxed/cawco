/**
 * A session's plan read in its own order (direction "In order"), open over
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
  title: "Plan/In order",
  component: PlanSessionFixture,
  args: {
    direction: "order",
    plan: "Eleven tasks",
    working: "One delegate idle",
    opened: true,
  },
  beforeEach: seedDelegates,
};

/** The plan open over the conversation: three tasks under way, one held on you. */
export const InOrder = {};

/** A long plan: the finished tasks and the untouched tail folded. */
export const InOrderLong = { args: { plan: "Thirty-eight tasks" } };

/** A task that has left the board, still in the plan. */
export const InOrderGone = { args: { plan: "A task gone from the board" } };
