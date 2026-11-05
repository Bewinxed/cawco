/**
 * Decisions, in "Places down the side" (Component Story Format 3, live
 * components): three groups, Waits on you, Sent, Decided, each named when
 * empty; a row opens the decision page at its first open question.
 * Cawco's twelve pages; Cawco-Dev's three; none yet; reading; the hub
 * unreachable; one page unread. At 1440 and 390.
 */
import { CAWCO_IN_SWING } from "./cawco-in-swing";
import { JUST_MADE, LOADING, STALE } from "./fixtures";
import { LIVE } from "./model";
import ProjectScreen from "./ProjectScreen.svelte";
import { press } from "./play";

export default {
  title: "Rail of places/Decisions",
  component: ProjectScreen,
  args: { project: CAWCO_IN_SWING, read: LIVE, place: "decisions" },
};

/** Cawco: the setup page waits at 8 of 9 picked; the lyrics were sent; ten decided. */
export const DecisionsInFullSwing = { parameters: { viewport: 1440 } };

/** On a phone: one group at a time under a segmented control. */
export const DecisionsInFullSwingPhone = { parameters: { viewport: 390 } };

/** None yet: the three groups named, and Ask Caw. */
export const DecisionsNoneYet = {
  args: { project: JUST_MADE },
  parameters: { viewport: 1440 },
};

/** The first read is out. */
export const DecisionsReading = {
  args: { read: LOADING },
  parameters: { viewport: 1440 },
};

/** The hub unreachable: rows kept and marked. */
export const DecisionsHubUnreachable = {
  args: { read: STALE },
  parameters: { viewport: 1440 },
};

/** The airplane shots' page could not be read; the rest are current. */
export const DecisionsPageUnread = {
  args: { read: { ...LIVE, unread: ["decision:d-airplane"] } },
  parameters: { viewport: 1440 },
};

/** The waiting page opened at question 9. */
export const DecisionsSetupOpened = {
  from: "DecisionsInFullSwing",
  parameters: { viewport: 1440 },
  play: press("Open Set up the project again"),
};
