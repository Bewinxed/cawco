/**
 * Add a member, and a new agent step by step, hung from the card that opened it, on his real fleet: the five
 * built-ins, Design reviewer (an agent he added, holding Look and words in
 * Cawco-Dev) and Release checker, the harnesses on his machines with their
 * models, and the fleet's skills. Every write stays on the page.
 */
import SetupFixture from "./preview/SetupFixture.svelte";
import { NEW } from "./setup.svelte";

export default {
  title: "Who decides/Add a member",
  component: SetupFixture,
};

/** Add a member: an agent, or a person or channel once a connection carries the question. */
export const AddMember = {
  args: { open: NEW },
  parameters: { viewport: 1440 },
};

/** Add a member on a phone: the three tiles stacked. */
export const AddMemberPhone = {
  args: { open: NEW },
  parameters: { viewport: 390 },
};

/** A new agent, its first step: the name and what it does. */
export const NewAgentFirstStep = {
  args: { open: NEW, adding: true },
  parameters: { viewport: 1440 },
};

/** A new agent on its third step: the first two folded with Change, Knows open. */
export const NewAgentStepByStep = {
  args: {
    open: NEW,
    adding: true,
    reached: 2,
    draft: {
      name: "Security reviewer",
      job: "Reads auth, secrets and anything that crosses the tailnet.",
    },
  },
  parameters: { viewport: 680 },
};

/** A new agent on its last step: Add member in Continue's place. */
export const NewAgentLastStep = {
  args: {
    open: NEW,
    adding: true,
    reached: 4,
    draft: {
      name: "Security reviewer",
      job: "Reads auth, secrets and anything that crosses the tailnet.",
      instructions:
        "Read the changelog and the last build's checks. Pick the option that ships safely.",
      kinds: ["rules"],
    },
  },
  parameters: { viewport: 1440 },
};

/** A new agent with no name: the error at the field, the foot counting. */
export const NewAgentNoName = {
  args: { open: NEW, adding: true, tried: true },
  parameters: { viewport: 1440 },
};

/** A name already taken. */
export const NewAgentNameTaken = {
  args: {
    open: NEW,
    adding: true,
    tried: true,
    draft: { name: "Design reviewer" },
  },
  parameters: { viewport: 390 },
};

/** Closed before saving: Advisor's card says Unsaved changes, the add card offers Resume. */
export const ClosedBeforeSaving = {
  args: { parked: ["advisor", NEW] },
  parameters: { viewport: 1440 },
};

/** Closed before saving, on a phone. */
export const ClosedBeforeSavingPhone = {
  args: { parked: ["advisor", NEW] },
  parameters: { viewport: 390 },
};
