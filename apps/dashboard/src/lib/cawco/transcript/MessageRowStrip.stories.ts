/**
 * Option A of the reader's own message row (Component Story Format 3, live
 * components): the strip on the speaker line (MessageRowStrip). The well
 * holds the words alone; Copy, Edit and Fork from here stand on the "You"
 * line before the clock under the pointer, every later part of a run has
 * its own line with its clock and strip, and a phone has a ⋯ handle at
 * rest that opens the menu. Each moment in the session it was sent in
 * (msgrow-frame), on a desk (1440) and a phone (390).
 *
 * The meta's args are every story's; a story's own are what it changes.
 * The hub is the stand-in's, live (hub-stand-in `hubAs`).
 */
import { hubAs } from "../hub-stand-in";
import MsgrowFrame from "./msgrow-frame.svelte";

const PHONE = 640;

export default {
  title: "Message row/A · The strip on the speaker line",
  component: MsgrowFrame,
  args: { option: "strip", set: "one", moment: "rest", touch: false },
  decorators: [hubAs("connected")],
  parameters: { viewport: 1440 },
};

/** Desk · at rest. The well is as tall as its words; nothing is reserved under them. */
export const DeskRest = {};

/** Desk · hovered. Copy, Edit and Fork from here on the "You" line, before the clock. */
export const DeskHovered = { args: { moment: "hover" } };

/** Desk · selected. The selection pill in the well's own contour; the strip stays while it is chosen. */
export const DeskSelected = { args: { moment: "selected" } };

/** Desk · a run of three, the last hovered. Each later message has its own line with its clock and its strip. */
export const DeskRun = { args: { set: "run", moment: "hover" } };

/** Desk · not delivered. Retry, Edit and Remove under the words at rest; no strip. */
export const DeskFailed = { args: { set: "failed" } };

/** Phone · at rest. A ⋯ handle after the clock, standing at rest: nothing hovers. */
export const PhoneRest = {
  args: { touch: true, height: PHONE },
  parameters: { viewport: 390 },
};

/** Phone · after a tap on ⋯. Copy, Edit and Fork from here in the menu at the handle. */
export const PhoneTapped = {
  args: { touch: true, moment: "tap", height: PHONE },
  parameters: { viewport: 390 },
};
