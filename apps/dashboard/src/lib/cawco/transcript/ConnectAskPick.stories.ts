/**
 * Option B of the connect ask, the pick (Component Story Format 3, live
 * components; from Relevance AI, where "connected accounts are chosen from
 * a dropdown" and "later runs aren't interrupted"): the composer's grown
 * shape lists the Google accounts the hub keeps (the question card's list
 * form), the project's and his own; the provider's page opens only to add
 * one or sign a lapsed one in again. Claude Code asks for Google Drive.
 * Each moment on a desk (about 900px); the phone (390px) where the advisor
 * drew it.
 *
 * The meta's args are every story's; a story's own are what it changes.
 * The hub is the stand-in's, live (hub-stand-in `hubAs`).
 */
import { hubAs } from "../hub-stand-in";
import ConnectFrame from "./connect-frame.svelte";

const PHONE = { height: 720 };

export default {
  title: "Connect card/B · The pick, a kept account",
  component: ConnectFrame,
  args: { option: "pick", moment: "asking", height: 680 },
  decorators: [hubAs("connected")],
  parameters: { viewport: 900 },
};

/** Desk, asking: two kept accounts, yours and the project's, with what each holds; Add an account; Other; Use this account. */
export const Asking = {};

/** Desk, asking with nothing kept: Add an account alone, pressed, and Add Google account. */
export const AskingNoAccount = { args: { moment: "no-account" } };

/** Desk, waiting, only after Add an account: "Finish in the Google tab" over the pair, Not now still live. */
export const Waiting = { args: { moment: "waiting" } };

/** Desk, connected, the beat after adding: "Connected as bewinxed@petralab.ai" before the card folds. */
export const ConnectedBeat = { args: { moment: "done" } };

/** Desk, connected with a kept account: no provider page at all; the row says "Using Google Drive as ops@petralab.ai (project)". */
export const ConnectedKept = { args: { moment: "connected" } };

/** Desk, connected with an added account: the row says "Connected Google Drive as" the new one. */
export const ConnectedAdded = { args: { moment: "added" } };

/** Desk, declined with Not now: the record row keeps the Other line's words. */
export const Declined = {
  args: { moment: "declined", words: "it's in the shared drive" },
};

/** Desk, failed adding, the Google tab closed early: the reason over the pair with Try again. */
export const FailedTabClosed = { args: { moment: "failed", fault: "closed" } };

/** Desk, failed adding, the hub refused to start the sign-in: its reason in the fail ink. */
export const FailedHubRefused = {
  args: { moment: "failed", fault: "refused" },
};

/** Desk, failed, the session's machine is offline: "can't connect yet", both buttons held. */
export const FailedMachineOffline = {
  args: { moment: "failed", fault: "offline" },
  decorators: [hubAs("connected", {}, { offline: true })],
};

/** Desk, expired while adding: Google's sign-in page ran out; Try again. */
export const ExpiredSignInPage = { args: { moment: "page-expired" } };

/** Desk, expired later: the project account's sign-in lapsed, and its record row says so where it stands. */
export const ExpiredKeptSignIn = { args: { moment: "expired" } };

/** Desk, reconnect: asked again, ops@petralab.ai pressed and marked "expired · signs in again", Reconnect ops@petralab.ai. */
export const Reconnect = { args: { moment: "reconnect" } };

/** Phone, asking: the list rows full width, whose and what each holds under the address. */
export const AskingPhone = {
  args: { ...PHONE },
  parameters: { viewport: 390 },
};

/** Phone, waiting after Add an account: back from Google's tab, the card up at the pill. */
export const WaitingPhone = {
  args: { moment: "waiting", ...PHONE },
  parameters: { viewport: 390 },
};
