/**
 * Option B for Workflows, the step ledger (Component Story Format 3, live
 * components): the advisor's "Release 2.4" workflow kept as one row a
 * step, each row the work item it becomes, drawn with the session tree's
 * rows and nest lines; run 12 lit on the same rows. Desk at 1440, phone at
 * 390. The meta's args are every story's; a story's own args are what it
 * changes.
 */
import WorkflowB from "./WorkflowB.svelte";

export default {
  title: "Workflows/B · The step ledger",
  component: WorkflowB,
  args: { view: "open" },
};

/** Desk · Release 2.4 open under its row: brief, input, its five steps as rows, the Call's fields open. */
export const DeskWorkflowOpen = { parameters: { viewport: 1440 } };

/** Desk · Run 12 live beside it: steps 1–3 done, step 4 asks which channel, the workflow shown as its Shape. */
export const DeskLiveRunAsking = {
  args: { view: "live" },
  parameters: { viewport: 1440 },
};

/** Desk · Past runs with run 10 opened as it ended, and the checks, one scored on a step alone. */
export const DeskPastRunsAndChecks = {
  args: { view: "past" },
  parameters: { viewport: 1440 },
};

/** Desk · Created: Caw's draft of five rows, two kept, three to keep or drop; or keep a finished run. */
export const DeskCreateFromCawsDraft = {
  args: { view: "create" },
  parameters: { viewport: 1440 },
};

/** Phone · The workflow: its brief, its input and its steps as rows. */
export const PhoneWorkflow = {
  args: { view: "phone" },
  parameters: { viewport: 390 },
};

/** Phone · Run 12 as its own page: the tree, step 4's question with its two options. */
export const PhoneLiveRun = {
  args: { view: "phone-run" },
  parameters: { viewport: 390 },
};
