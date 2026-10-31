/**
 * Removing a member he added, asked in its settings' flow under the card
 * that opened them: the kinds that come back to him, and Keep it or Remove
 * member. Its own section: the question takes the focus as it stands, as
 * it does on the page.
 */
import SetupFixture from "./preview/SetupFixture.svelte";

export default {
  title: "Who decides/Removing a member",
  component: SetupFixture,
};

/** Removing Design reviewer: the question stands in the settings' flow. */
export const RemovingMember = {
  args: { open: "design-reviewer", removing: true },
  parameters: { viewport: 1440 },
};

/** Removing Design reviewer on a phone. */
export const RemovingMemberPhone = {
  args: { open: "design-reviewer", removing: true },
  parameters: { viewport: 390 },
};
