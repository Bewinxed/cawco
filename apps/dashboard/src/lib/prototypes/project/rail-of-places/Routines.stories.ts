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
import ProjectScreen from "./ProjectScreen.svelte";
import { press } from "./play";

export default {
  title: "Rail of places/Routines",
  component: ProjectScreen,
  args: { project: CAWCO_IN_SWING, read: LIVE, place: "routines" },
};

/** Cawco: an X post waits on your yes, a reply failed, the weekly milestone check failed first in the list. */
export const RoutinesInFullSwing = { parameters: { viewport: 1440 } };

/** On a phone: each routine's columns fold under its name. */
export const RoutinesInFullSwingPhone = { parameters: { viewport: 390 } };

/** Cawco-Dev: nothing proposed, two routines on time. */
export const RoutinesNothingProposed = {
  args: { project: CAWCO_DEV_QUIET },
  parameters: { viewport: 1440 },
};

/** No routines yet: Proposed named and empty, and the way to make the first. */
export const RoutinesNoRoutinesYet = {
  args: { project: JUST_MADE },
  parameters: { viewport: 1440 },
};

/** No routines yet, on a phone. */
export const RoutinesNoRoutinesYetPhone = {
  args: { project: JUST_MADE },
  parameters: { viewport: 390 },
};

/** The first read is out. */
export const RoutinesReading = {
  args: { read: LOADING },
  parameters: { viewport: 1440 },
};

/** The hub unreachable: rows kept, Approve and the switches held. */
export const RoutinesHubUnreachable = {
  args: { read: STALE },
  parameters: { viewport: 1440 },
};

/** The x-use releases source is failing: its row says so. */
export const RoutinesSourceFailing = {
  args: { read: { ...LIVE, unread: ["source:f28fefff"] } },
  parameters: { viewport: 1440 },
};

/** The failed routine opened: its reason, Run now, its instruction and its last runs. */
export const RoutinesFailedOpened = {
  from: "RoutinesInFullSwing",
  parameters: { viewport: 1440 },
  play: press("Open Weekly X milestone check"),
};
