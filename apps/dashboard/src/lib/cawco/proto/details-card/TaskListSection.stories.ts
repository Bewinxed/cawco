/**
 * The card's Task list (my reading): connected, refreshing, asking before
 * it stops updating, and a press on a service that opens its step.
 */
import DetailsCardLive from "./details-card-live.svelte";
import { presses } from "./plays";

export default {
  title: "Project details/Task list",
  component: DetailsCardLive,
  args: {
    situation: "all-well",
    view: "stop-updating",
    answer: "yes",
    open: true,
    again: 0,
  },
  parameters: { viewport: 1024 },
};

const LINEAR = /^Linear/u;
const ONLY_HERE = /Only here/u;

/** Asked before stopping GitHub updates: 128 tasks keep a link to their issue. */
export const StopAsked = {};

/** GitHub Issues is being refreshed now. */
export const Updating = { args: { view: "tasks-updating" } };

/** I pressed Only here while connected, and it asks under that row first. */
export const StopFromPress = {
  args: { view: "card" },
  from: "Updating",
  play: presses({ role: "radio", name: ONLY_HERE, after: 600 }),
};

/** I pressed Linear: nothing changes yet, its step opens. */
export const LinearPressed = {
  args: { view: "tasks-linear" },
  from: "StopAsked",
  play: presses({ role: "radio", name: LINEAR, after: 1400 }),
};
