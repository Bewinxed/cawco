/**
 * An outcome's tile in the Outcomes bento (Component Story Format 3, live
 * components): whole when no lead is open, compact beside a lead, one line
 * under 640, with the Needs you line on the one that waits on him.
 */

import OutcomeTile from "./OutcomeTile.svelte";
import { MAIN_GREEN, PULL_REQUESTS, STAGING } from "./outcomes.fixture";

const ask = STAGING.lines[0]?.ask ?? null;

export default {
  title: "Outcomes/Outcome tile",
  component: OutcomeTile,
  args: {
    outcome: STAGING,
    form: "full",
    fold: 0,
    ask,
    onlead: () => undefined,
  },
  parameters: { viewport: 420 },
};

/** Staging waits on him: who asks and what, over every line spelled out. */
export const Waiting = {};

/** Beside a lead, the pull requests outcome says only the line that does not hold. */
export const Compact = {
  args: { outcome: PULL_REQUESTS, form: "compact", fold: 3, ask: null },
};

/** Main stays green: met, and still watched. */
export const Met = {
  args: { outcome: MAIN_GREEN, form: "compact", fold: 3, ask: null },
};

/** On a phone beside a lead, staging reads as one line with its mark. */
export const OneLine = { args: { form: "line", fold: 3 } };
