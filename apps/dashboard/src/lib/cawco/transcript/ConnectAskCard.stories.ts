/**
 * Option C of the connect ask, the card in the transcript (Component Story
 * Format 3, live components; from Cofounder's card in the conversation,
 * its head from Tines's two marks): the ask stands in the transcript where
 * the agent asked (ConnectCard, the house's ask in the page) and turns into
 * the record where it stood (ConnectRow). The composer stays free; a
 * "1 needs you" chip at the tray row's end leads back to it. Claude Code
 * asks for Figma. Each moment on a desk (about 900px); the phone (390px)
 * where the advisor drew it.
 *
 * The meta's args are every story's; a story's own are what it changes.
 * The hub is the stand-in's, live (hub-stand-in `hubAs`).
 */
import { hubAs } from "../hub-stand-in";
import ConnectFrame from "./connect-frame.svelte";

const PHONE = { height: 720 };

export default {
  title: "Connect card/C · The card that becomes the record",
  component: ConnectFrame,
  args: { option: "card", moment: "asking", height: 680 },
  decorators: [hubAs("connected")],
  parameters: { viewport: 900 },
};

/** Desk, asking: Caw&Co ⇄ Figma, what it reads and can't do, the address, Connect Figma and a worded Not now; "1 needs you" on the pill. */
export const Asking = {};

/** Desk, waiting in place: "Finish in the Figma tab", Connect Figma pending. */
export const Waiting = { args: { moment: "waiting" } };

/** Desk, connected, the beat: "Connected as bewinxed@petralab.ai" in the card before it collapses. */
export const ConnectedBeat = { args: { moment: "done" } };

/** Desk, connected: the card has collapsed to its record row where it stood; the chip is gone. */
export const Connected = { args: { moment: "connected" } };

/** Desk, declined: the card collapses to "Figma not connected · Not now"; words for the agent go in the composer. */
export const Declined = { args: { moment: "declined" } };

/** Desk, failed, the Figma tab closed early: the reason in the card with Try again, Connect free. */
export const FailedTabClosed = { args: { moment: "failed", fault: "closed" } };

/** Desk, failed, the hub refused to start the sign-in: its reason in the fail ink. */
export const FailedHubRefused = {
  args: { moment: "failed", fault: "refused" },
};

/** Desk, failed, the session's machine is offline: "can't connect yet", both buttons held. */
export const FailedMachineOffline = {
  args: { moment: "failed", fault: "offline" },
  decorators: [hubAs("connected", {}, { offline: true })],
};

/** Desk, expired while waiting: Figma's sign-in page ran out; Try again. */
export const ExpiredSignInPage = { args: { moment: "page-expired" } };

/** Desk, expired later: the collapsed row turns "sign-in expired" in place. */
export const ExpiredKeptSignIn = { args: { moment: "expired" } };

/** Desk, reconnect: a new card where the agent asks again, "Reconnect Figma to Caw&Co", Read-only as before. */
export const Reconnect = { args: { moment: "reconnect" } };

/** Phone, asking: the card full width in the transcript, "1 needs you" over the pill. */
export const AskingPhone = {
  args: { ...PHONE },
  parameters: { viewport: 390 },
};

/** Phone, waiting: back from Figma's tab the transcript has moved on; the card is above, and the chip is the way back to it. */
export const WaitingPhone = {
  args: { moment: "scrolled", ...PHONE },
  parameters: { viewport: 390 },
};
