/**
 * Option A of the connect ask, the gate (Component Story Format 3, live
 * components; from Base44's "Allow access to your Figma account", its
 * permissions a choice, read-only the default): the browser ask's sibling
 * in the composer's grown shape (Prompt's connect branch, connect-ask.ts),
 * the access offered as two chips, settling into a record row in the
 * transcript (ConnectRow). Claude Code asks for Figma. Each moment on a
 * desk (the transcript column about 900px wide, the composer under it);
 * the phone (390px) where the advisor drew it.
 *
 * What the session hears: Not now sends `decline` with the Other line's
 * words; parking the ask to its bar over the pill (the chevron, or a swipe
 * down) sends nothing; a session that ends with the ask open sends
 * `cancel`.
 *
 * The meta's args are every story's; a story's own are what it changes.
 * The hub is the stand-in's, live (hub-stand-in `hubAs`).
 */
import { hubAs } from "../hub-stand-in";
import ConnectFrame from "./connect-frame.svelte";

const PHONE = { height: 720 };

export default {
  title: "Connect card/A · The gate, the access a choice",
  component: ConnectFrame,
  args: { option: "gate", moment: "asking", height: 680 },
  decorators: [hubAs("connected")],
  parameters: { viewport: 900 },
};

/** Desk, asking: why, the whole Figma address, Read-only pressed over Read & write, Other, Connect and Not now. */
export const Asking = {};

/** Desk, asking for a connector with one access: files:read in code type where the chips would be. */
export const AskingOneAccess = { args: { moment: "one-scope" } };

/** Desk, waiting: "Finish in the Figma tab" over the pair, Connect pending, Not now still live. */
export const Waiting = { args: { moment: "waiting" } };

/** Desk, connected, the beat: "Connected as bewinxed@petralab.ai" in the card before it folds. */
export const ConnectedBeat = { args: { moment: "done" } };

/** Desk, connected: the card has folded; the record row says as whom and read-only, figma › to the MCP page. */
export const Connected = { args: { moment: "connected" } };

/** Desk, declined with Not now: the record row keeps the Other line's words, and the agent goes another way. */
export const Declined = {
  args: { moment: "declined", words: "use the PNG I attached" },
};

/** Desk, failed, the Figma tab closed early: the reason over the pair with Try again, Connect free. */
export const FailedTabClosed = { args: { moment: "failed", fault: "closed" } };

/** Desk, failed, the hub refused to start the sign-in: its reason in the fail ink, Connect free. */
export const FailedHubRefused = {
  args: { moment: "failed", fault: "refused" },
};

/** Desk, failed, the session's machine is offline: "can't connect yet", both buttons held. */
export const FailedMachineOffline = {
  args: { moment: "failed", fault: "offline" },
  decorators: [hubAs("connected", {}, { offline: true })],
};

/** Desk, expired while waiting: Figma's sign-in page ran out; Try again, Connect free. */
export const ExpiredSignInPage = { args: { moment: "page-expired" } };

/** Desk, expired later: the kept sign-in lapsed, and the record row turns "sign-in expired" where it stands. */
export const ExpiredKeptSignIn = { args: { moment: "expired" } };

/** Desk, reconnect: the agent asks again, Read-only held "as before", Reconnect and Not now. */
export const Reconnect = { args: { moment: "reconnect" } };

/** Phone, asking: the same card at the pill's width, the title cut with its ellipsis, the chips on one row. */
export const AskingPhone = {
  args: { ...PHONE },
  parameters: { viewport: 390 },
};

/** Phone, waiting: back from Figma's tab, the card is up at the pill, Connect pending. */
export const WaitingPhone = {
  args: { moment: "waiting", ...PHONE },
  parameters: { viewport: 390 },
};

/** Phone, waiting, swiped down: folded to its bar over the pill, "Signing in to Figma…". */
export const WaitingFoldedPhone = {
  args: { moment: "parked", ...PHONE },
  parameters: { viewport: 390 },
};
