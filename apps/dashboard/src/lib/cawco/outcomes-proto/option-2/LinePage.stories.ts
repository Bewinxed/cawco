/**
 * A line opened as its own page under 640 (Component Story Format 3, live
 * components): Back to Outcomes, the line and its answer, This line or The
 * agents' plan.
 */
import LinePage from "./LinePage.svelte";
import { STAGING } from "./outcomes.fixture";

const noop = () => undefined;

export default {
  title: "Outcomes/Line page",
  component: LinePage,
  args: {
    outcome: STAGING,
    line: STAGING.lines[0],
    face: "line",
    answer: { kind: "open" },
    offline: null,
    onback: noop,
    onface: noop,
    onsend: noop,
    onopen: noop,
  },
  parameters: { viewport: "phone" },
};

/** Staging is healthy, opened: its question first. */
export const StagingLine = {};

/** The agents' plan under staging, from the line's page. */
export const Plan = { args: { face: "plan" } };
