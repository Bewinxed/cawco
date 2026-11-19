/**
 * The project details card to use (Component Story Format 3, live
 * components): the project's head as it ships, the card hung from its
 * place mark, reading and writing the hub as it does in the product,
 * through a stand-in for the hub (details-stand-in.ts). The dials set what
 * no press reaches: what the hub says of the project, and whether it takes
 * a change or refuses it. Its `beforeEach` takes the stores the card reads
 * (the board, the accounts, the projects, the moves), so the frame's
 * stand-in writes stores of its own.
 */
import ProjectDetailsLive from "./project-details-live.svelte";

export default {
  title: "Project details/Use it",
  component: ProjectDetailsLive,
  args: {
    situation: "all-well",
    answer: "yes",
    open: true,
    again: 0,
  },
  parameters: { viewport: 1024 },
};

/** My project's details at a glance: agents can start, and how it is set. */
export const Live = {
  async beforeEach() {
    await Promise.all([
      import("../../stores/board.svelte"),
      import("../../stores/accounts.svelte"),
      import("../../stores/projects.svelte"),
      import("../../stores/moves.svelte"),
    ]);
  },
};
