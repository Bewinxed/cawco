/**
 * The row of five and the needs-you line in each state (Component Story
 * Format 3, live components), drawn on Tasks where a project opens. The
 * meta's args are every story's; a story's own args are what it changes.
 */
import FivePlaces from "./FivePlaces.svelte";
import { QUIET, SWING } from "./records";
import {} from "./story-kit";

export default {
  title: "Five places/Row and line",
  component: FivePlaces,
  args: { records: SWING, place: "tasks" },
};

/** Every mark live: Tasks 3, Routines failed, Decisions 5, Outputs 2 new, Caw Working; the line counts each wait. */
export const Marks = {
  args: { place: "tasks", height: 920 },
  parameters: { viewport: 1440 },
};

/** Nothing waits: the five named with no count, Caw idle, no line. */
export const NoMarks = {
  args: { place: "tasks", height: 920, records: QUIET },
  parameters: { viewport: 1440 },
};

/** The hub is unreachable: marks suppressed, the line says since when. */
export const Stale = {
  args: { place: "tasks", height: 920, read: "stale" },
  parameters: { viewport: 1440 },
};

/** Routines' read failed: its mark gone, its name kept; the rest live. */
export const OneUnread = {
  args: { place: "tasks", height: 920, unread: ["routines"] },
  parameters: { viewport: 1440 },
};

/** The dispatch cap reached: the line says so and leads to Spend. */
export const AtTheCap = {
  args: {
    height: 920,
    records: { ...SWING, spend: { ...SWING.spend, today: 60, atCap: true } },
  },
  parameters: { viewport: 1440 },
};

/** A phone: the five as the bottom bar, the line on top of Tasks. */
export const MarksPhone = {
  args: { place: "tasks", height: 844 },
  parameters: { viewport: 390 },
};
