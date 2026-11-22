/**
 * The Controls card, live: the design graph's stage with its tools at the
 * foot, the card grown out of the Controls button over the stage, holding a
 * project's How it runs line's props: a situation picked from nine long
 * ones, how fresh its reading is, its free words, and the words' switch.
 */

import { HOW_IT_RUNS, HOW_IT_RUNS_ARGS } from "./bench/props-fixture";
import DialsCardFrame from "./dials-card-frame.svelte";

export default {
  title: "Design graph/Controls card",
  component: DialsCardFrame,
  args: {
    dials: [],
    written: {},
    values: {},
    component: "HowItRuns",
    props: HOW_IT_RUNS,
    args: HOW_IT_RUNS_ARGS,
    edits: {},
    lang: "en",
  },
};

/** The Controls card open over the stage, a How it runs line's props in it. */
export const HowItRuns = {};
