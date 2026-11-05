/**
 * Routines in a project of five places (Component Story Format 3, live
 * components): the Proposed group over the routines, a failed one first,
 * on the hub's own records (records.ts). The meta's args are every story's;
 * a story's own args are what it changes.
 */
import FivePlaces from "./FivePlaces.svelte";
import { EMPTY, QUIET, SWING } from "./records";
import { at, DESK, PHONE, press } from "./story-kit";

export default {
  title: "Five places/Routines",
  component: FivePlaces,
  args: { records: SWING, place: "routines" },
};

/** Routines on Cawco-Dev: one reply waits on your yes; the failed weekly check stands first. */
export const Proposed = at(DESK);

/** The failed routine pressed: it opens beside the list with its reason, runs and Run now. */
export const FailedOpen = {
  ...at(DESK, { routine: "d86be128" }),
  from: "Proposed",
  play: press("button", /^Weekly X milestone check/u),
};

/** Approve pressed on the reply: it leaves Proposed, which stays named with nothing in it. */
export const Approved = {
  ...at(DESK),
  from: "Proposed",
  play: press("button", /^Approve$/u),
};

/** Arriving from the needs-you line's "1 action" on Tasks. */
export const FromTheLine = {
  ...at(DESK, { place: "tasks" }),
  play: press("button", /^1 action$/u),
};

/** The first read: skeleton rows at their real size. */
export const Loading = at(DESK, { read: "loading" });

/** A quiet project: Proposed named and empty, two routines on, nothing failed. */
export const Quiet = at(DESK, { records: QUIET });

/** No routines yet: what runs here, and Ask Caw for a routine. */
export const Empty = at(DESK, { records: EMPTY });

/** The hub is unreachable: rows kept and stale; Approve, Run now and the rest wait. */
export const Stale = at(DESK, { read: "stale", routine: "d86be128" });

/** Routines' read failed: no mark on the row, the page says why and keeps its last rows. */
export const Unread = at(DESK, { unread: ["routines"] });

/** A phone: Proposed, then the routines, failed first. */
export const ProposedPhone = at(PHONE);

/** A phone, the failed routine pressed: it rises as a drawer. */
export const FailedOpenPhone = {
  ...at(PHONE, { routine: "d86be128" }),
  from: "ProposedPhone",
  play: press("button", /^Weekly X milestone check/u),
};
