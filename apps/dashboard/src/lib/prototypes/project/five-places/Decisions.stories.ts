/**
 * Decisions in a project of five places (Component Story Format 3, live
 * components): Waits on you, Sent and Decided on the hub's own decision
 * pages (records.ts). The meta's args are every story's; a story's own args
 * are what it changes.
 */
import FivePlaces from "./FivePlaces.svelte";
import { EMPTY, SWING } from "./records";
import { press } from "./story-kit";

export default {
  title: "Five places/Decisions",
  component: FivePlaces,
  args: { records: SWING, place: "decisions" },
};

/** Cawco-Dev's decisions: five wait on you, two were sent, three are decided. */
export const ThreeGroups = {
  args: { place: "decisions", height: 920 },
  parameters: { viewport: 1440 },
};

/** A waiting page pressed: it opens at its first open question. */
export const PageOpen = {
  args: { place: "decisions", height: 920, decision: "dec-title-bars" },
  parameters: { viewport: 1440 },
  from: "ThreeGroups",
  play: press("button", /^Pick where Close stands/u),
};

/** The start of the answer: Tasks, where the needs-you line counts 5 decisions. */
export const LineOnTasks = {
  args: { height: 920, place: "tasks", group: "waits" },
  parameters: { viewport: 1440 },
};

/** "5 decisions" pressed in the line: Decisions opens with Waits on you first. */
export const FromTheLine = {
  args: { height: 920, place: "decisions", group: "waits" },
  parameters: { viewport: 1440 },
  from: "LineOnTasks",
  play: press("button", /^5 decisions$/u),
};

/** No decisions yet: the three groups' place says what lands here, and Ask Caw. */
export const Empty = {
  args: { place: "decisions", height: 920, records: EMPTY },
  parameters: { viewport: 1440 },
};

/** The first read: skeleton rows in each group. */
export const Loading = {
  args: { place: "decisions", height: 920, read: "loading" },
  parameters: { viewport: 1440 },
};

/** The hub is unreachable: rows kept, no group counted, no attn dots. */
export const Stale = {
  args: { place: "decisions", height: 920, read: "stale" },
  parameters: { viewport: 1440 },
};

/** A phone: one group at a time, Waits on you first. */
export const WaitsPhone = {
  args: { place: "decisions", height: 844 },
  parameters: { viewport: 390 },
};

/** A phone, Decided pressed: who settled each and the tasks it made. */
export const DecidedPhone = {
  args: { place: "decisions", height: 844, group: "decided" },
  parameters: { viewport: 390 },
  from: "WaitsPhone",
  play: press("tab", /^Decided/u),
};
