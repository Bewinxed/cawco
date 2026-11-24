/**
 * A session's plan view (Component Story Format 3, live components): the
 * plan's horizon and delegate strip (level 1), the tasks along its spine
 * (level 2), and each task's recessed to-do well (level 3), at desk (1440px)
 * and phone (390px) widths.
 */

import PlanView from "./PlanView.svelte";
import {
  HELD_PLAN_DATA,
  LONG_PLAN_DATA,
  REALISTIC_PLAN_DATA,
} from "./plan.mock.js";

export default {
  title: "Session/Plan view",
  component: PlanView,
  args: {
    dataset: REALISTIC_PLAN_DATA,
    openTaskId: null,
    initialPhase: "all",
  },
  parameters: { viewport: 1440 },
};

/** Realistic plan on desk (1440px): 3 done folded, 1 off-board, 2 moving across delegates, 1 held, 3 ahead. */
export const RealisticPlan = {
  args: {
    dataset: REALISTIC_PLAN_DATA,
    openTaskId: null,
  },
  parameters: { viewport: 1440 },
};

/** Realistic plan on phone (390px): single-column spine with horizon bar and delegate pills. */
export const RealisticPlanPhone = {
  args: {
    dataset: REALISTIC_PLAN_DATA,
    openTaskId: null,
  },
  parameters: { viewport: 390 },
};

/** Long plan of 34 tasks on desk (1440px): horizon bar shows all 34 steps; finished and late-ahead fold cleanly. */
export const LongPlan = {
  args: {
    dataset: LONG_PLAN_DATA,
    openTaskId: null,
  },
  parameters: { viewport: 1440 },
};

/** Long plan of 34 tasks on phone (390px). */
export const LongPlanPhone = {
  args: {
    dataset: LONG_PLAN_DATA,
    openTaskId: null,
  },
  parameters: { viewport: 390 },
};

/** A moving task opened on desk (1440px): right-hand inspector shows delegate's own plan, to-dos, stage, and notes. */
export const TaskOpened = {
  args: {
    dataset: REALISTIC_PLAN_DATA,
    openTaskId: "tsk-504",
  },
  parameters: { viewport: 1440 },
};

/** A moving task opened on phone (390px): bottom sheet rises with 100×6 grabber over the plan. */
export const TaskOpenedPhone = {
  args: {
    dataset: REALISTIC_PLAN_DATA,
    openTaskId: "tsk-504",
  },
  parameters: { viewport: 390 },
};

/** Held task state on desk (1440px): tsk-506 held on decision card pick and PR #614, inspected beside the spine. */
export const HeldTask = {
  args: {
    dataset: HELD_PLAN_DATA,
    openTaskId: "tsk-506",
    initialPhase: "held",
  },
  parameters: { viewport: 1440 },
};

/** Held task state on phone (390px). */
export const HeldTaskPhone = {
  args: {
    dataset: HELD_PLAN_DATA,
    openTaskId: "tsk-506",
    initialPhase: "held",
  },
  parameters: { viewport: 390 },
};
