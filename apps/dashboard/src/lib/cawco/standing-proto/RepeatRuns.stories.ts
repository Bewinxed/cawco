/**
 * A repeating task's Runs tab (Component Story Format 3, live components):
 * its runs newest first, quiet runs alike folded into one line.
 */

import RepeatRuns from "./RepeatRuns.svelte";
import { PROJECT_ID, REPEATS } from "./repeating-data";

const of = (taskId: string) => ({
  args: { repeat: REPEATS[taskId], taskId },
});

export default {
  title: "Project/Repeating task's runs",
  component: RepeatRuns,
  args: { projectId: PROJECT_ID },
  parameters: { viewport: 600 },
};

/** Last night's sweep failed; the night before found two links; twelve quiet nights fold. */
export const SweepRuns = of("tsk-176");

/** Three checks couldn't run; the twelve before them were still not yet. */
export const StagingRuns = of("tsk-180");

/** A check runs now, above the hour's not-yets. */
export const ReleaseRuns = of("tsk-184");

/** Each morning's digest is a run of its own. */
export const DigestRuns = of("tsk-171");
