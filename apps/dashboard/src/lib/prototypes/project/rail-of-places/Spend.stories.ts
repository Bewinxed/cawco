/**
 * Spend, in "Places down the side" (Component Story Format 3, live
 * components): today and this month against the cap, what reaching it
 * stops, and where today's spend went. Cawco; Cawco-Dev; nothing spent;
 * reading; the hub unreachable. At 1440 and 390.
 */
import { CAWCO_IN_SWING } from "./cawco-in-swing";
import { JUST_MADE, LOADING, STALE } from "./fixtures";
import { LIVE } from "./model";
import ProjectScreen from "./ProjectScreen.svelte";

export default {
  title: "Rail of places/Spend",
  component: ProjectScreen,
  args: { project: CAWCO_IN_SWING, read: LIVE, place: "spend" },
};

/** Cawco: $4.10 of a $10 day, $38.62 of a $200 month. */
export const SpendCawco = { parameters: { viewport: 1440 } };

/** On a phone. */
export const SpendCawcoPhone = { parameters: { viewport: 390 } };

/** Nothing spent yet. */
export const SpendNothingSpent = {
  args: { project: JUST_MADE },
  parameters: { viewport: 1440 },
};

/** The first read is out. */
export const SpendReading = {
  args: { read: LOADING },
  parameters: { viewport: 1440 },
};

/** The hub unreachable: the last figures kept. */
export const SpendHubUnreachable = {
  args: { read: STALE },
  parameters: { viewport: 1440 },
};
