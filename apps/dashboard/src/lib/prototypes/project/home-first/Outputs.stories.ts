/**
 * Outputs, the place that gathers what Cawco produced (Option 2; its name is
 * a working one): posts with their alternates, a picture, markdown, a
 * preview with pins, a choice set, a video, a canvas, and a 2.1 GB file the
 * hub cannot serve. Grouped by task and newest first, narrowed to posts, an
 * item opened whole, none yet, loading and stale.
 */
import { OUTPUTS, PROJECT } from "./fixture";
import OutputsScreen from "./OutputsScreen.svelte";
import { LOADING, moveTo, STALE } from "./play";

const desk = { viewport: 1440 };
const phone = { viewport: 390 };

export default {
  title: "Home first/Outputs",
  component: OutputsScreen,
  args: {
    project: PROJECT,
    outputs: OUTPUTS,
    grouping: "task",
    kind: "all",
    read: "live",
  },
};

/** Every output, grouped by the task that made it. */
export const ByTask = { name: "By task", parameters: desk };

/** By task, on a phone: two across. */
export const ByTaskPhone = { name: "By task on a phone", parameters: phone };

/** Newest first, one grid. */
export const Newest = {
  args: { grouping: "newest" },
  parameters: desk,
  from: "ByTask",
  play: moveTo({ grouping: "newest" }),
};

/** The Post chip: only posts, each with its alternates. */
export const Posts = {
  args: { kind: "post" },
  parameters: desk,
  from: "ByTask",
  play: moveTo({ kind: "post" }),
};

/** A post opened whole, its task one press away. */
export const PostOpen = {
  name: "Post open",
  args: { openOutput: "o-post-board" },
  parameters: desk,
  from: "ByTask",
  play: moveTo({ openOutput: "o-post-board" }),
};

/** A post opened on a phone. */
export const PostOpenPhone = {
  name: "Post open on a phone",
  args: { openOutput: "o-post-board" },
  parameters: phone,
};

/** The hub unreachable: the last tiles kept, marked. */
export const Stale = {
  name: "Hub unreachable",
  args: STALE,
  parameters: desk,
};

/** Hub unreachable on a phone. */
export const StalePhone = {
  name: "Hub unreachable on a phone",
  args: STALE,
  parameters: phone,
};

/** The first read: tiles as skeletons at their size. */
export const Loading = { args: LOADING, parameters: desk };

/** Nothing produced yet. */
export const NoOutputs = {
  name: "Nothing yet",
  args: { outputs: [] },
  parameters: desk,
};
