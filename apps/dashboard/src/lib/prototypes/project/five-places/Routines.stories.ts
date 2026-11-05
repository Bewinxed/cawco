/**
 * Routines in a project of five places (Component Story Format 3, live
 * components): the Proposed group over the routines, a failed one first,
 * on the hub's own records (records.ts). The meta's args are every story's;
 * a story's own args are what it changes.
 */
import FivePlaces from "./FivePlaces.svelte";
import { EMPTY, QUIET, SWING } from "./records";
import { press } from "./story-kit";

export default {
  title: "Five places/Routines",
  component: FivePlaces,
  args: { records: SWING, place: "routines" },
};

/** Routines on Cawco-Dev: one reply waits on your yes; the failed weekly check stands first. */
export const Proposed = {
  args: { place: "routines", height: 920 },
  parameters: { viewport: 1440 },
};

/** The failed routine pressed: it opens beside the list with its reason, runs and Run now. */
export const FailedOpen = {
  args: { place: "routines", height: 920, routine: "d86be128" },
  parameters: { viewport: 1440 },
  from: "Proposed",
  play: press("button", /^Weekly X milestone check/u),
};

/** Approve pressed on the reply: it leaves Proposed, which stays named with nothing in it. */
export const Approved = {
  args: { place: "routines", height: 920 },
  parameters: { viewport: 1440 },
  from: "Proposed",
  play: press("button", /^Approve$/u),
};

/** The first read: skeleton rows at their real size. */
export const Loading = {
  args: { place: "routines", height: 920, read: "loading" },
  parameters: { viewport: 1440 },
};

/** A quiet project: Proposed named and empty, two routines on, nothing failed. */
export const Quiet = {
  args: { place: "routines", height: 920, records: QUIET },
  parameters: { viewport: 1440 },
};

/** No routines yet: what runs here, and Ask Caw for a routine. */
export const Empty = {
  args: { place: "routines", height: 920, records: EMPTY },
  parameters: { viewport: 1440 },
};

/** The hub is unreachable: rows kept and stale; Approve, Run now and the rest wait. */
export const Stale = {
  args: { place: "routines", height: 920, read: "stale", routine: "d86be128" },
  parameters: { viewport: 1440 },
};

/** Routines' read failed: no mark on the row, the page says why and keeps its last rows. */
export const Unread = {
  args: { place: "routines", height: 920, unread: ["routines"] },
  parameters: { viewport: 1440 },
};

/** A phone: Proposed, then the routines, failed first. */
export const ProposedPhone = {
  args: { place: "routines", height: 844 },
  parameters: { viewport: 390 },
};
