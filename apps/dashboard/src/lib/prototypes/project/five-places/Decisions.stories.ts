/**
 * Decisions in a project of five places (Component Story Format 3, live
 * components): Waits on you, Sent and Decided on the hub's own decision
 * pages (records.ts). The meta's args are every story's; a story's own args
 * are what it changes.
 */
import FivePlaces from "./FivePlaces.svelte";
import { EMPTY, SWING } from "./records";
import { at, DESK, PHONE, press } from "./story-kit";

export default {
  title: "Five places/Decisions",
  component: FivePlaces,
  args: { records: SWING, place: "decisions" },
};

/** Cawco-Dev's decisions: five wait on you, two were sent, three are decided. */
export const ThreeGroups = at(DESK);

/** A waiting page pressed: it opens at its first open question. */
export const PageOpen = {
  ...at(DESK, { decision: "dec-title-bars" }),
  from: "ThreeGroups",
  play: press("button", /^Pick where Close stands/u),
};

/** Arriving from the needs-you line's "5 decisions" on Tasks. */
export const FromTheLine = {
  ...at(DESK, { place: "tasks" }),
  play: press("button", /^5 decisions$/u),
};

/** No decisions yet: the three groups' place says what lands here, and Ask Caw. */
export const Empty = at(DESK, { records: EMPTY });

/** The first read: skeleton rows in each group. */
export const Loading = at(DESK, { read: "loading" });

/** The hub is unreachable: rows kept, no group counted, no attn dots. */
export const Stale = at(DESK, { read: "stale" });

/** A phone: one group at a time, Waits on you first. */
export const WaitsPhone = at(PHONE);

/** A phone, Decided pressed: who settled each and the tasks it made. */
export const DecidedPhone = {
  ...at(PHONE, { group: "decided" }),
  from: "WaitsPhone",
  play: press("tab", /^Decided/u),
};
