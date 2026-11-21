/**
 * Option 2 of the Routines tab, live (Component Story Format 3): project
 * Harbor on Saturday at 13:40, under the project page's head and view
 * strip, Routines chosen. What ran and what is next stand in
 * time order; a run's Open puts its whole result beside the view, where
 * Open session, Earlier run and Later run stand; a routine's Open puts the
 * routine there; a choice in Needs you moves the routine as the hub would.
 */
import { HARBOR, NOW, PICK_ROUTINES, PICK_RUNS, SOURCES } from "./day";
import RoutinesDayLive from "./routines-day-live.svelte";

export default {
  title: "Routines, option 2/The project's day",
  component: RoutinesDayLive,
  args: {
    project: HARBOR,
    routines: PICK_ROUTINES,
    runs: PICK_RUNS,
    sources: SOURCES,
    now: NOW,
    live: true,
  },
  parameters: { viewport: 1440 },
};

/** Back after a day away: what ran since yesterday, what needs me, and what runs next. */
export const Live = {};
