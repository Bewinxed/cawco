/**
 * The kit's EmptyState (Component Story Format 3, live components) in a
 * frame of its own (empty-state-frame): a block with its action, and the
 * one line a strip has room for. The meta's args are every story's; a
 * story's own args are what it changes.
 */
import { IconServerSquare, IconTaskList } from "#lib/icons.js";
import EmptyStateFrame from "./empty-state-frame.svelte";

export default {
  title: "Kit/Empty state",
  component: EmptyStateFrame,
  args: {
    icon: IconServerSquare,
    title: "No machines have joined yet",
    line: "Install the daemon on a machine and it joins this hub over your tailnet.",
    act: "Add a machine",
  },
};

/** An empty fleet, with the way to fill it. */
export const Block = {};

/** An empty strip, said in one line. */
export const Inline = {
  args: {
    icon: IconTaskList,
    title: "No tasks in review",
    line: "Tasks land here once their checks pass.",
    act: undefined,
    inline: true,
  },
};
