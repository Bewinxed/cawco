/**
 * One task of the plan, as its row reads in each state it reaches
 * (Component Story Format 3): the rows read from today's plan
 * (preview/plan-fixtures.ts) through the plan's own derivation, so each
 * stands as the plan draws it.
 */
import PlanTaskRow from "./PlanTaskRow.svelte";
import { planRows } from "./plan-view";
import { GONE_PLAN, PLAN, WORKERS } from "./preview/plan-fixtures";

const row = (handle: string, plan = PLAN) => {
  const found = planRows(plan, WORKERS).find((one) => one.handle === handle);
  if (!found) {
    throw new Error(`No ${handle} in the plan's fixture`);
  }
  return found;
};

export default {
  title: "Plan/Task row",
  component: PlanTaskRow,
  args: { row: row("tsk-326"), open: false, who: true, ontoggle: () => null },
  parameters: { viewport: 390 },
};

/** A task a delegate is on, the to-do it is doing under its title. */
export const UnderWay = {};

/** The same task opened: all five to-dos under it. */
export const Opened = { args: { open: true } };

/** Held on you: its row leads to the list of what waits. */
export const HeldOnYou = { args: { row: row("tsk-335") } };

/** Waiting for another task to finish. */
export const WaitsForTask = { args: { row: row("tsk-344") } };

/** Waiting for a pull request to merge. */
export const WaitsForPullRequest = { args: { row: row("tsk-352") } };

/** Not started, nobody on it. */
export const NotStarted = { args: { row: row("tsk-355") } };

/** Finished. */
export const Done = { args: { row: row("tsk-318") } };

/** Its task has left the board. */
export const Gone = { args: { row: row("tsk-347", GONE_PLAN), who: false } };
