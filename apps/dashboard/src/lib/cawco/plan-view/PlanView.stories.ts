/**
 * A session's plan view (Component Story Format 3, live components): calm
 * transient overview first (plan -> task -> nested to-do well, with one mark
 * only where the plan needs the person), and full details + controls when a
 * task is opened, at desk (1440px) and phone (390px) widths.
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

/** Realistic plan overview on desk (1440px): unbroken spine, active nested to-do wells, and one Needs you mark. */
export const RealisticPlan = {
  args: {
    dataset: REALISTIC_PLAN_DATA,
    openTaskId: null,
  },
  parameters: { viewport: 1440 },
};

/** Realistic plan overview on phone (390px): answers every glance question without scrolling. */
export const RealisticPlanPhone = {
  args: {
    dataset: REALISTIC_PLAN_DATA,
    openTaskId: null,
  },
  parameters: { viewport: 390 },
};

/** Long plan of 34 tasks on desk (1440px): earlier finished prefix folds in place so active and Needs you steps stay above the fold. */
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

/** A moving task opened on desk (1440px): side sheet discloses delegate steps, full editable to-dos, stage, and notes. */
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

/** Held task opened on desk (1440px): tsk-506 stands marked in place on the plan while its hold and controls open beside it. */
export const HeldTask = {
  args: {
    dataset: HELD_PLAN_DATA,
    openTaskId: "tsk-506",
  },
  parameters: { viewport: 1440 },
};

/** Held task opened on phone (390px). */
export const HeldTaskPhone = {
  args: {
    dataset: HELD_PLAN_DATA,
    openTaskId: "tsk-506",
  },
  parameters: { viewport: 390 },
};
