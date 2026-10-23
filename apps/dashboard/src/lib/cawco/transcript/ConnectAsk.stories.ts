/**
 * Option A of the connect ask (Component Story Format 3, live components):
 * the browser ask's sibling, standing in the composer's grown shape
 * (Prompt's connect branch, connect-ask.ts), settling into a record row in
 * the transcript (ConnectRow). Each moment on a desk (the transcript column
 * about 900px wide, the composer under it) and on a phone (390px). Linear
 * is the service; Claude Code asks.
 *
 * What the session hears: Not now sends `decline` with the Other line's
 * words; parking the ask to its bar over the pill (the chevron, or a swipe
 * down) sends nothing, and one press on the bar brings it back; a session
 * that ends with the ask open sends `cancel`.
 *
 * The meta's args are every story's; a story's own are what it changes.
 * The hub is the stand-in's, live (hub-stand-in `hubAs`).
 */
import { hubAs } from "../hub-stand-in";
import ConnectFrame from "./connect-frame.svelte";

const PHONE_HEIGHT = 720;

export default {
  title: "Connect card/A · The composer's ask",
  component: ConnectFrame,
  args: { option: "ask", moment: "asking", account: "bewinxed", words: "" },
  decorators: [hubAs("connected")],
  parameters: { viewport: 900 },
};

/** Desk: asking. Which agent, why, the whole address with linear.app in strong ink, Connect and Not now. */
export const Asking = {};

/** Phone: asking. The same card across the phone's composer, its address broken after its dots. */
export const AskingPhone = {
  args: { height: PHONE_HEIGHT },
  parameters: { viewport: 390 },
};

/** Desk: parked. Minimized (or swiped down) to the bar over the pill, still live; one press brings it back. */
export const Parked = { args: { moment: "parked" } };

/** Phone: parked to the bar over the pill. */
export const ParkedPhone = {
  args: { moment: "parked", height: PHONE_HEIGHT },
  parameters: { viewport: 390 },
};

/** Desk: waiting while he signs in on Linear's page in its own tab; Not now stays live. */
export const Waiting = { args: { moment: "waiting" } };

/** Phone: waiting; Linear's page is open in Safari over the app. */
export const WaitingPhone = {
  args: { moment: "waiting", height: PHONE_HEIGHT },
  parameters: { viewport: 390 },
};

/** Desk: connected as bewinxed. The card has folded; the transcript keeps the row, and the turn goes on. */
export const Connected = { args: { moment: "connected" } };

/** Phone: connected as bewinxed. */
export const ConnectedPhone = {
  args: { moment: "connected", height: PHONE_HEIGHT },
  parameters: { viewport: 390 },
};

/** Desk: connected, the service gave no account name: "Connected to Linear". */
export const ConnectedNoName = {
  args: { moment: "connected", account: null },
};

/** Phone: connected with no account name. */
export const ConnectedNoNamePhone = {
  args: { moment: "connected", account: null, height: PHONE_HEIGHT },
  parameters: { viewport: 390 },
};

/** Desk: declined with Not now; the row keeps the Other line's words, and the agent goes another way. */
export const Declined = {
  args: { moment: "declined", words: "We track OPS in Jira now, not Linear" },
};

/** Phone: declined, the Other line's words cut at the row's end. */
export const DeclinedPhone = {
  args: {
    moment: "declined",
    words: "We track OPS in Jira now, not Linear",
    height: PHONE_HEIGHT,
  },
  parameters: { viewport: 390 },
};

/** Desk: failed. Caw in the card's centre, what happened, Try again, Show details. */
export const Failed = { args: { moment: "failed" } };

/** Phone: failed. */
export const FailedPhone = {
  args: { moment: "failed", height: PHONE_HEIGHT },
  parameters: { viewport: 390 },
};

/** Desk: expired. The connection lapsed; its row turns signed out in place, Reconnect on it. */
export const Expired = { args: { moment: "expired" } };

/** Phone: expired. */
export const ExpiredPhone = {
  args: { moment: "expired", height: PHONE_HEIGHT },
  parameters: { viewport: 390 },
};

/** Desk: reconnect. Reconnect pressed, or the session that hit the lapse asks again: the same card, its lede "Linear signed CawCo out". */
export const Reconnect = { args: { moment: "reconnect" } };

/** Phone: reconnect. */
export const ReconnectPhone = {
  args: { moment: "reconnect", height: PHONE_HEIGHT },
  parameters: { viewport: 390 },
};
