/**
 * The Outcomes view alone (Component Story Format 3, live components), in
 * the project pane's inset: the bento with staging leading, and the even
 * bento with nothing open. Its live story, inside the project page, is
 * OutcomesLead.stories.ts.
 */
import { inProjectPane } from "#lib/cawco/project/pane-frame.js";
import OutcomesView from "./OutcomesView.svelte";
import { COCKPIT_ARGS, STAGING } from "./outcomes.fixture";

const noop = () => undefined;

export default {
  title: "Outcomes/Outcomes view",
  component: OutcomesView,
  args: {
    outcomes: COCKPIT_ARGS.outcomes,
    suggestion: { ...COCKPIT_ARGS.suggestions[0], more: 2 },
    unplaced: COCKPIT_ARGS.unplaced,
    lead: STAGING.id,
    selected: "staging-healthy",
    face: "line",
    linePage: null,
    answers: {},
    offline: null,
    onlead: noop,
    onselect: noop,
    onface: noop,
    onsend: noop,
    onopen: noop,
    onopenline: noop,
    ontake: noop,
    ondismiss: noop,
    onnext: noop,
  },
  decorators: [inProjectPane],
  parameters: { viewport: 1440 },
};

/** Staging leads, the other outcomes beside it. */
export const StagingLeads = {};

/** Nothing open: every outcome whole, in an even bento. */
export const Even = { args: { lead: null, selected: null } };

/** The hub is not answering: the last reading stands. */
export const LastReading = {
  args: {
    offline: {
      lastRead: "Last read at 14:02.",
      why: "The hub is not answering.",
    },
  },
};
