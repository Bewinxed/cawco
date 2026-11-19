/**
 * The Connect task list step, the card's body become it (my reading): for
 * GitHub Issues and for Linear, while it reads, with no sign-in that fits,
 * and when the service refuses.
 */
import DetailsCardLive from "./details-card-live.svelte";
import { presses } from "./plays";

export default {
  title: "Project details/Connect task list",
  component: DetailsCardLive,
  args: {
    situation: "all-well",
    view: "tasks-github",
    answer: "yes",
    open: true,
    again: 0,
  },
  parameters: { viewport: 1024 },
};

const START = /Start updating/u;

/** Connecting my codebase's issues: what that does, the sign-in, the codebase and a status board. */
export const GitHub = {};

/** Connecting Linear: no status board, a team in place of a codebase. */
export const Linear = { args: { view: "tasks-linear" } };

/** The sign-ins and codebases are still being read. */
export const Reading = { args: { view: "tasks-loading" } };

/** No Linear sign-in can serve, and it says what kind to add and where. */
export const NoSignIn = { args: { view: "tasks-no-signin" } };

/** The service refused to start, in its own words; my picks stay. */
export const Refused = { args: { view: "tasks-refused" } };

/** My token can't read boards; the rest still works without one. */
export const BoardRefused = { args: { view: "tasks-board-refused" } };

/** Changing the issues connection later: its answers filled in, and Save. */
export const Changing = { args: { view: "tasks-change" } };

/** I pressed Start updating: the card returns with the issues chosen and the first update running. */
export const Started = {
  args: { view: "card" },
  from: "GitHub",
  play: presses({ role: "button", name: START, after: 1600 }),
};
