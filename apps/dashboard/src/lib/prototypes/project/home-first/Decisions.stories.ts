/**
 * Decisions, reached from Home's Decisions open (Option 2): Waits on you,
 * Sent and Decided side by side on a desk, one at a time on a phone.
 * Cawco's choice sets: two waiting on picks, two sent, three decided (one
 * settled by an advisor, two with no tasks yet), none, loading and stale.
 */

import DecisionsScreen from "./DecisionsScreen.svelte";
import { DECISIONS, PROJECT } from "./fixture";
import { LOADING, moveTo, STALE } from "./play";

const desk = { viewport: 1440 };
const phone = { viewport: 390 };

export default {
  title: "Home first/Decisions",
  component: DecisionsScreen,
  args: { project: PROJECT, decisions: DECISIONS, read: "live" },
};

/** Three groups side by side: what waits, what was sent, what is decided. */
export const Decisions = { parameters: desk };

/** On a phone: Waits on you, the switch over it. */
export const DecisionsPhone = {
  name: "Decisions on a phone",
  parameters: phone,
};

/** On a phone, Decided: who settled each and the tasks it made. */
export const DecidedPhone = {
  name: "Decided on a phone",
  args: { phoneGroup: "decided" },
  parameters: phone,
  from: "DecisionsPhone",
  play: moveTo({ phoneGroup: "decided" }),
};

/** Nothing waits, nothing sent, nothing decided: the three still named. */
export const NoDecisions = {
  name: "No decision yet",
  args: { decisions: [] },
  parameters: desk,
};

/** The first read. */
export const Loading = { args: LOADING, parameters: desk };

/** The hub unreachable: the last rows kept, marked. */
export const Stale = {
  name: "Hub unreachable",
  args: STALE,
  parameters: desk,
};
