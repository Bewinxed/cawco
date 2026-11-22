/**
 * The lead tile (Component Story Format 3, live components): staging open
 * whole, its lines on the left and the selected line's ask, what checks it
 * and its newest run on the right; stacked under 640.
 */
import LeadTile from "./LeadTile.svelte";
import { STAGING } from "./outcomes.fixture";

const noop = () => undefined;

export default {
  title: "Outcomes/Lead tile part",
  component: LeadTile,
  args: {
    outcome: STAGING,
    selected: "staging-healthy",
    face: "line",
    form: "split",
    answers: {},
    offline: null,
    onselect: noop,
    onface: noop,
    onclose: noop,
    onsend: noop,
    onopen: noop,
    onopenline: noop,
  },
  parameters: { viewport: 960 },
};

/** Staging leads: its question open beside its lines. */
export const Split = {};

/** The agents' plan under staging, in place of the line. */
export const Plan = { args: { face: "plan" } };

/** The demo account line selected: nothing checks it now. */
export const EndedLine = { args: { selected: "staging-demo" } };
