/**
 * Option C of the connect ask (Component Story Format 3, live components):
 * the ask arrives as one line standing on the composer, in the offer's
 * place (ConnectStrip), as Grok's and Devin's connect chips do; Connect
 * grows the strip's own tile upward into the card for the why, the whole
 * address and consent, the strip's line kept at its foot. Each outcome is said on the same line, and the transcript
 * keeps the record row (ConnectRow). Each moment on a desk (the transcript
 * column about 900px wide) and on a phone (390px). Linear is the service;
 * Claude Code asks.
 *
 * What the session hears: Not now (the strip's ✕, or the card's) sends
 * `decline` with the Other line's words; the strip standing unanswered
 * sends nothing; a session that ends with the ask open sends `cancel`.
 *
 * The meta's args are every story's; a story's own are what it changes.
 */
import { hubAs } from "../hub-stand-in";
import ConnectFrame from "./connect-frame.svelte";

const PHONE_HEIGHT = 720;

export default {
  title: "Connect card/C · The strip on the composer",
  component: ConnectFrame,
  args: { option: "strip", moment: "asking", account: "bewinxed", words: "" },
  decorators: [hubAs("connected")],
  parameters: { viewport: 900 },
};

/** Desk: asking. One line on the composer: who needs Linear, linear.app, Connect, and ✕ for Not now. */
export const Asking = {};

/** Phone: asking, the strip over the pill. */
export const AskingPhone = {
  args: { height: PHONE_HEIGHT },
  parameters: { viewport: 390 },
};

/** Desk: opened. Connect grows the strip upward into the card: why, the whole address, consent, over the strip's own line, Connect and Not now at the two ends. */
export const Opened = { args: { moment: "opened" } };

/** Phone: the strip opened into the card, its line kept, Connect and Not now at the two ends. */
export const OpenedPhone = {
  args: { moment: "opened", height: PHONE_HEIGHT },
  parameters: { viewport: 390 },
};

/** Desk: waiting. The strip says the sign-in is open in its own tab, with Open sign-in. */
export const Waiting = { args: { moment: "waiting" } };

/** Phone: waiting; Linear's page is open in Safari over the app. */
export const WaitingPhone = {
  args: { moment: "waiting", height: PHONE_HEIGHT },
  parameters: { viewport: 390 },
};

/** Desk: connected as bewinxed. The strip says so for a beat and goes; the transcript keeps the row. */
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

/** Desk: declined with ✕. The strip goes; the row keeps the Other line's words (said in the card). */
export const Declined = {
  args: { moment: "declined", words: "We track OPS in Jira now, not Linear" },
};

/** Phone: declined. */
export const DeclinedPhone = {
  args: {
    moment: "declined",
    words: "We track OPS in Jira now, not Linear",
    height: PHONE_HEIGHT,
  },
  parameters: { viewport: 390 },
};

/** Desk: failed. The strip says the sign-in didn't finish, with Try again; the card opens with Caw in its centre. */
export const Failed = { args: { moment: "failed" } };

/** Phone: failed. */
export const FailedPhone = {
  args: { moment: "failed", height: PHONE_HEIGHT },
  parameters: { viewport: 390 },
};

/** Desk: expired. The row turns signed out, and the strip comes back with Reconnect. */
export const Expired = { args: { moment: "expired" } };

/** Phone: expired. */
export const ExpiredPhone = {
  args: { moment: "expired", height: PHONE_HEIGHT },
  parameters: { viewport: 390 },
};
