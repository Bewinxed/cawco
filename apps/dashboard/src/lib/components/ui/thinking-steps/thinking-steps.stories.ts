/**
 * The kit's ThinkingSteps (Component Story Format 3, live components) in a
 * frame of its own (thinking-steps-frame): steps done, one under way and
 * those ahead. The meta's args are every story's; a story's own args are
 * what it changes.
 */
import ThinkingStepsFrame from "./thinking-steps-frame.svelte";

export default {
  title: "Kit/Thinking steps",
  component: ThinkingStepsFrame,
  args: {
    steps: [
      { label: "Snapshot the workspace", status: "complete", icon: "check" },
      { label: "Copy it to studio-mac", status: "active" },
      { label: "Install the dependencies", status: "ahead" },
      { label: "Start the session there", status: "ahead" },
    ],
  },
};

/** Halfway through moving a session. */
export const UnderWay = {};

/** Every step done. */
export const Done = {
  args: {
    steps: [
      { label: "Snapshot the workspace", status: "complete", icon: "check" },
      { label: "Copy it to studio-mac", status: "complete", icon: "check" },
      { label: "Start the session there", status: "complete", icon: "check" },
    ],
  },
};
