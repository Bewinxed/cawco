/**
 * Sessions, in "Places down the side" (Component Story Format 3, live
 * components): every session of the project in one ledger, and Spin off a
 * session's form at its head. Cawco's seven; Cawco-Dev's three; none;
 * reading; the hub unreachable. At 1440 and 390.
 */
import { CAWCO_IN_SWING } from "./cawco-in-swing";
import { CAWCO_DEV_QUIET, JUST_MADE, LOADING, STALE } from "./fixtures";
import { LIVE } from "./model";
import { press } from "./play";
import ProjectScreen from "./ProjectScreen.svelte";

export default {
  title: "Rail of places/Sessions",
  component: ProjectScreen,
  args: { project: CAWCO_IN_SWING, read: LIVE, place: "sessions" },
};

/** Cawco's sessions: Caw's conversation, three attempts (one asks, one failed), one spun off, a routine's run. */
export const InFullSwing = { parameters: { viewport: 1440 } };

/** On a phone. */
export const InFullSwingPhone = { parameters: { viewport: 390 } };

/** Cawco-Dev's three. */
export const CawcoDev = {
  args: { project: CAWCO_DEV_QUIET },
  parameters: { viewport: 1440 },
};

/** No sessions yet, and Spin off a session. */
export const NoSessions = {
  args: { project: JUST_MADE },
  parameters: { viewport: 1440 },
};

/** The first read is out. */
export const Reading = { args: { read: LOADING }, parameters: { viewport: 1440 } };

/** The hub unreachable. */
export const HubUnreachable = {
  args: { read: STALE },
  parameters: { viewport: 1440 },
};

/** Spin off a session: machine and checkout, harness and type, and what comes along. */
export const SpinningOff = {
  from: "InFullSwing",
  parameters: { viewport: 1440 },
  play: press("Spin off a session"),
};

/** Spin off a session, on a phone. */
export const SpinningOffPhone = {
  from: "InFullSwingPhone",
  parameters: { viewport: 390 },
  play: press("Spin off a session"),
};
