/**
 * The row of five and the needs-you line in each state (Component Story
 * Format 3, live components), drawn on Tasks where a project opens. The
 * meta's args are every story's; a story's own args are what it changes.
 */
import FivePlaces from "./FivePlaces.svelte";
import { QUIET, SWING } from "./records";
import { at, DESK, PHONE } from "./story-kit";

export default {
  title: "Five places/Row and line",
  component: FivePlaces,
  args: { records: SWING, place: "tasks" },
};

/** Every mark live: Tasks 3, Routines failed, Decisions 5, Outputs 2 new, Caw Working; the line counts each wait. */
export const Marks = at(DESK);

/** Nothing waits: the five named with no count, Caw idle, no line. */
export const NoMarks = at(DESK, { records: QUIET });

/** The first read: the marks as skeleton dots, no line yet. */
export const Reading = at(DESK, { read: "loading" });

/** The hub is unreachable: marks suppressed, the line says since when. */
export const Stale = at(DESK, { read: "stale" });

/** Routines' read failed: its mark gone, its name kept; the rest live. */
export const OneUnread = at(DESK, { unread: ["routines"] });

/** The dispatch cap reached: the line says so and leads to Spend. */
export const AtTheCap = at(DESK, {
  records: { ...SWING, spend: { ...SWING.spend, today: 60, atCap: true } },
});

/** A phone: the five as the bottom bar, the line on top of Tasks. */
export const MarksPhone = at(PHONE);

/** A phone while the hub is unreachable. */
export const StalePhone = at(PHONE, { read: "stale" });
