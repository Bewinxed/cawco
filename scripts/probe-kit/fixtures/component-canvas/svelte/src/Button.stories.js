import Button from "./Button.svelte";

export default {
  title: "Kit/Button",
  component: Button,
  args: { label: "Save" },
};

/** The main action of a form, at rest. */
export const Primary = { args: { tone: "primary" } };

/** A quiet action beside the main one. */
export const Quiet = { args: { tone: "quiet", label: "Cancel" } };

export const Ghost = { args: { tone: "quiet", label: "Skip" } };
