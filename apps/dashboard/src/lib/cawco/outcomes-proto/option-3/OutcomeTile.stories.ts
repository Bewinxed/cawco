/**
 * An outcome's tile on option 3's first view, in each situation it meets:
 * a run's question waiting on him, his answer on its way, refused or
 * taken, and the quiet tiles that need nothing from him.
 */

import OutcomeTile from "./OutcomeTile.svelte";
import { COCKPIT_OUTCOMES } from "./outcomes.fixture";

const outcome = (id: string) => {
  const found = COCKPIT_OUTCOMES.find((one) => one.id === id);
  if (!found) {
    throw new Error(`No outcome ${id} in the cockpit fixture.`);
  }
  return found;
};
const staging = outcome("staging");
const ask = staging.lines.find((line) => line.ask !== null)?.ask ?? null;

export default {
  title: "Outcomes/One line each, tile",
  component: OutcomeTile,
  args: {
    outcome: staging,
    ask,
    answer: { kind: "open" },
    offline: null,
    onopen: () => undefined,
    onanswer: () => undefined,
  },
  parameters: { viewport: "phone" },
};

/** Nightly staging check asks whether to restart staging, with its two answers. */
export const Waiting = {};

/** His answer to restart staging is on its way. */
export const Sending = {
  args: { answer: { kind: "sending", choice: "Restart staging" } },
};

/** The hub did not take his answer, and both answers are back. */
export const Refused = {
  args: {
    answer: {
      kind: "refused",
      choice: "Restart staging",
      why: "Your answer was not taken: Nightly staging check changed while you were reading. Nothing was restarted. Choose again. (409)",
    },
  },
};

/** The hub is unreachable, so the answers wait. */
export const Unreachable = {
  args: { offline: "You can answer once the hub is reachable." },
};

/** Two pull requests have no reply yet, and an agent is on one. */
export const NotYet = {
  args: { outcome: outcome("pull-requests"), ask: null },
};

/** Main has stayed green: every commit since Friday passed. */
export const Reached = { args: { outcome: outcome("main-green"), ask: null } };

/** Nobody checks one of the docs lines yet. */
export const NotKnown = { args: { outcome: outcome("docs"), ask: null } };
