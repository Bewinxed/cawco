/**
 * Spend, in "Places down the side" (Component Story Format 3, live
 * components): today and this month against the cap, what reaching it
 * stops, and where today's spend went. Cawco; Cawco-Dev; nothing spent;
 * reading; the hub unreachable. At 1440 and 390.
 */
import { CAWCO_IN_SWING } from "./cawco-in-swing";
import { CAWCO_DEV_QUIET, JUST_MADE, LOADING, STALE } from "./fixtures";
import { LIVE } from "./model";
import ProjectScreen from "./ProjectScreen.svelte";

export default {
  title: "Rail of places/Spend",
  component: ProjectScreen,
  args: { project: CAWCO_IN_SWING, read: LIVE, place: "spend" },
};

/** Cawco: $4.10 of a $10 day, $38.62 of a $200 month. */
export const Cawco = { parameters: { viewport: 1440 } };

/** On a phone. */
export const CawcoPhone = { parameters: { viewport: 390 } };

/** Cawco-Dev: $27.80 of a $60 day. */
export const CawcoDev = {
  args: { project: CAWCO_DEV_QUIET },
  parameters: { viewport: 1440 },
};

/** Nothing spent yet. */
export const NothingSpent = {
  args: { project: JUST_MADE },
  parameters: { viewport: 1440 },
};

/** The first read is out. */
export const Reading = { args: { read: LOADING }, parameters: { viewport: 1440 } };

/** The hub unreachable: the last figures kept. */
export const HubUnreachable = {
  args: { read: STALE },
  parameters: { viewport: 1440 },
};
