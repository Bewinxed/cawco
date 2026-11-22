/**
 * How a repeating task repeats, at the head of its Details (Component Story
 * Format 3, live components): what starts each run, when it stops, where it
 * stands, and Edit and Change with Caw.
 */

import RepeatSettings from "./RepeatSettings.svelte";
import { REPEATS } from "./repeating-data";

const on = (id: string, title: string) => ({
  args: { repeat: REPEATS[id], title },
});

export default {
  title: "Project/Repeating task's Repeats",
  component: RepeatSettings,
  args: { onaskcaw: () => undefined, onchange: () => undefined },
  parameters: { viewport: 390 },
};

/** The PR digest runs every weekday morning and keeps running. */
export const OnASchedule = on("tsk-171", "PRs triaged this morning");

/** The changelog line is added each time a pull request merges. */
export const OnAnEvent = on("tsk-172", "Changelog has the latest merge");

/** CawCo stopped the staging check; it runs until staging is healthy. */
export const Stopped = on("tsk-180", "Staging is healthy");

/** I paused the nightly memory run. */
export const Paused = on("tsk-160", "Project memory curated");
