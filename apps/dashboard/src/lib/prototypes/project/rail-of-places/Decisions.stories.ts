/**
 * Decisions, in "Places down the side" (Component Story Format 3, live
 * components): three groups, Waits on you, Sent, Decided, each named when
 * empty; a row opens the decision page at its first open question.
 * Cawco's twelve pages; Cawco-Dev's three; none yet; reading; the hub
 * unreachable; one page unread. At 1440 and 390.
 */
import { CAWCO_IN_SWING } from "./cawco-in-swing";
import { CAWCO_DEV_BUSY, JUST_MADE, LOADING, STALE } from "./fixtures";
import { LIVE } from "./model";
import { press } from "./play";
import ProjectScreen from "./ProjectScreen.svelte";

export default {
  title: "Rail of places/Decisions",
  component: ProjectScreen,
  args: { project: CAWCO_IN_SWING, read: LIVE, place: "decisions" },
};

/** Cawco: the setup page waits at 8 of 9 picked; the lyrics were sent; ten decided. */
export const InFullSwing = { parameters: { viewport: 1440 } };

/** On a phone: one group at a time under a segmented control. */
export const InFullSwingPhone = { parameters: { viewport: 390 } };

/** Cawco-Dev: a page waiting 3 days, one sent, one decided. */
export const CawcoDev = {
  args: { project: CAWCO_DEV_BUSY },
  parameters: { viewport: 1440 },
};

/** None yet: the three groups named, and Ask Caw. */
export const NoneYet = {
  args: { project: JUST_MADE },
  parameters: { viewport: 1440 },
};

/** The first read is out. */
export const Reading = { args: { read: LOADING }, parameters: { viewport: 1440 } };

/** The hub unreachable: rows kept and marked. */
export const HubUnreachable = {
  args: { read: STALE },
  parameters: { viewport: 1440 },
};

/** The airplane shots' page could not be read; the rest are current. */
export const PageUnread = {
  args: { read: { ...LIVE, unread: ["decision:d-airplane"] } },
  parameters: { viewport: 1440 },
};

/** The waiting page opened at question 9. */
export const SetupOpened = {
  from: "InFullSwing",
  parameters: { viewport: 1440 },
  play: press("Open Set up the project again"),
};

/** On a phone, the waiting page opened. */
export const SetupOpenedPhone = {
  from: "InFullSwingPhone",
  parameters: { viewport: 390 },
  play: press("Open Set up the project again"),
};
