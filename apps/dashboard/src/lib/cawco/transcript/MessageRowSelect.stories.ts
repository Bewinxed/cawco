/**
 * Option C of the reader's own message row (Component Story Format 3, live
 * components): no buttons on the message; select it, and the composer
 * answers (MessageRowSelect, msgrow-chip). A message takes the hover ghost
 * under the pointer and the selection pill once chosen, both in its own
 * contour; the composer's lead row then carries whose it is and its verbs,
 * and, editing, what sending does to the later turns. The same on a desk
 * (1440) and a phone (390). Click a message to choose it, Esc or the close
 * glyph to put it down.
 *
 * The meta's args are every story's; a story's own are what it changes.
 * The hub is the stand-in's, live (hub-stand-in `hubAs`).
 */
import { hubAs } from "../hub-stand-in";
import MsgrowFrame from "./msgrow-frame.svelte";

const PHONE = 680;

export default {
  title: "Message row/C · Select it, the composer answers",
  component: MsgrowFrame,
  args: { option: "select", set: "one", moment: "rest", touch: false },
  decorators: [hubAs("connected")],
  parameters: { viewport: 1440 },
};

/** Desk · at rest. The well is as tall as its words, with nothing on it. */
export const DeskRest = {};

/** Desk · hovered. The hover ghost in the well's contour: the message lifts to the raised surface. */
export const DeskHovered = { args: { moment: "hover" } };

/** Desk · selected. The selection pill in the well's contour; the composer shows You · 11:40 with Edit and resend, Fork from here and Copy. */
export const DeskSelected = { args: { moment: "selected" } };

/** Desk · editing. The words are in the field; the composer says the agent goes on from here and its later turns are set aside. */
export const DeskEditing = { args: { moment: "editing" } };

/** Desk · a run of three, the middle one selected. The pill is square where the run opens the part, round nowhere else. */
export const DeskRun = { args: { set: "run", moment: "selected", pick: 1 } };

/** Desk · not delivered. Retry, Edit and Remove under the words at rest. */
export const DeskFailed = { args: { set: "failed" } };

/** Phone · at rest. Nothing on the message; a tap chooses it. */
export const PhoneRest = {
  args: { touch: true, height: PHONE },
  parameters: { viewport: 390 },
};

/** Phone · after a tap on the words. The pill on the message and its verbs in the composer, with the close glyph. */
export const PhoneTapped = {
  args: { touch: true, moment: "tap", height: PHONE },
  parameters: { viewport: 390 },
};
