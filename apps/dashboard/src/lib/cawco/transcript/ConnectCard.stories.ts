/**
 * Option B of the connect ask (Component Story Format 3, live components):
 * one card in the transcript, at the point the agent asked, that holds
 * every state in place (ConnectCard): v0's paused agent action, with
 * Replit's Connect step as its consent. The composer stays a pill under
 * it. Each moment on a desk (the transcript column about 900px wide) and
 * on a phone (390px). Linear is the service; Claude Code asks.
 *
 * What the session hears: Not now sends `decline` with the Other line's
 * words; Back from the consent step sends nothing; a session that ends
 * with the card open sends `cancel`. The card cannot park: it lives in the
 * scroll, and there is no bar for it.
 *
 * The meta's args are every story's; a story's own are what it changes.
 */
import { hubAs } from "../hub-stand-in";
import ConnectFrame from "./connect-frame.svelte";

const PHONE_HEIGHT = 720;

export default {
  title: "Connect card/B · The transcript's card",
  component: ConnectFrame,
  args: { option: "card", moment: "asking", account: "bewinxed", words: "" },
  decorators: [hubAs("connected")],
  parameters: { viewport: 900 },
};

/** Desk: asking. The card under the call that needed Linear: why, linear.app and what it may do, Connect and Not now. */
export const Asking = {};

/** Phone: asking, the card across the column. */
export const AskingPhone = {
  args: { height: PHONE_HEIGHT },
  parameters: { viewport: 390 },
};

/** Desk: consent. Connect unfolds the step in place: what opens, the whole address with linear.app in strong ink, Continue to it or Back. */
export const Consent = { args: { moment: "consent" } };

/** Phone: consent, the address broken after its dots. */
export const ConsentPhone = {
  args: { moment: "consent", height: PHONE_HEIGHT },
  parameters: { viewport: 390 },
};

/** Desk: waiting while he signs in on Linear's page in its own tab; Not now stays live. */
export const Waiting = { args: { moment: "waiting" } };

/** Phone: waiting; Linear's page is open in Safari over the app. */
export const WaitingPhone = {
  args: { moment: "waiting", height: PHONE_HEIGHT },
  parameters: { viewport: 390 },
};

/** Desk: connected as bewinxed. The card folds to its record row in place, and the turn goes on. */
export const Connected = { args: { moment: "connected" } };

/** Phone: connected as bewinxed. */
export const ConnectedPhone = {
  args: { moment: "connected", height: PHONE_HEIGHT },
  parameters: { viewport: 390 },
};

/** Desk: connected, the service gave no account name: "Connected to Linear". */
export const ConnectedNoName = { args: { moment: "connected", account: null } };

/** Phone: connected with no account name. */
export const ConnectedNoNamePhone = {
  args: { moment: "connected", account: null, height: PHONE_HEIGHT },
  parameters: { viewport: 390 },
};

/** Desk: declined with Not now; the row keeps the Other line's words. */
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

/** Desk: expired. The row turns signed out in place; Reconnect on it reopens the consent step there. */
export const Expired = { args: { moment: "expired" } };

/** Phone: expired. */
export const ExpiredPhone = {
  args: { moment: "expired", height: PHONE_HEIGHT },
  parameters: { viewport: 390 },
};
