/**
 * Routines, in "Places down the side" (Component Story Format 3, live
 * components): Proposed (the approved actions waiting on you, named even
 * when empty), then the routines failed first, each opening in its pane.
 * Cawco's five routines with the weekly milestone check failed and an X
 * post proposed for 15:00; Cawco-Dev's two; none yet; reading; the hub
 * unreachable; a source failing. At 1440 and 390.
 */
import { CAWCO_IN_SWING } from "./cawco-in-swing";
import { CAWCO_DEV_QUIET, JUST_MADE, LOADING, STALE } from "./fixtures";
import { LIVE } from "./model";
import { press } from "./play";
import ProjectScreen from "./ProjectScreen.svelte";

export default {
  title: "Rail of places/Routines",
  component: ProjectScreen,
  args: { project: CAWCO_IN_SWING, read: LIVE, place: "routines" },
};

/** Cawco: an X post waits on your yes, a reply failed, the weekly milestone check failed first in the list. */
export const InFullSwing = { parameters: { viewport: 1440 } };

/** On a phone: each routine's columns fold under its name. */
export const InFullSwingPhone = { parameters: { viewport: 390 } };

/** Cawco-Dev: nothing proposed, two routines on time. */
export const NothingProposed = {
  args: { project: CAWCO_DEV_QUIET },
  parameters: { viewport: 1440 },
};

/** No routines yet: Proposed named and empty, and the way to make the first. */
export const NoRoutinesYet = {
  args: { project: JUST_MADE },
  parameters: { viewport: 1440 },
};

/** No routines yet, on a phone. */
export const NoRoutinesYetPhone = {
  args: { project: JUST_MADE },
  parameters: { viewport: 390 },
};

/** The first read is out. */
export const Reading = { args: { read: LOADING }, parameters: { viewport: 1440 } };

/** The hub unreachable: rows kept, Approve and the switches held. */
export const HubUnreachable = {
  args: { read: STALE },
  parameters: { viewport: 1440 },
};

/** The x-use releases source is failing: its row says so. */
export const SourceFailing = {
  args: { read: { ...LIVE, unread: ["source:f28fefff"] } },
  parameters: { viewport: 1440 },
};

/** The failed routine opened: its reason, Run now, its instruction and its last runs. */
export const FailedOpened = {
  from: "InFullSwing",
  parameters: { viewport: 1440 },
  play: press("Open Weekly X milestone check"),
};

/** On a phone, the failed routine rises as a bottom drawer. */
export const FailedOpenedPhone = {
  from: "InFullSwingPhone",
  parameters: { viewport: 390 },
  play: press("Open Weekly X milestone check"),
};

/** Approve on the 15:00 post: it leaves Proposed. */
export const PostApproved = {
  from: "InFullSwing",
  parameters: { viewport: 1440 },
  play: press(/^Approve$/u),
};
