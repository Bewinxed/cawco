/**
 * Option B of the reader's own message row (Component Story Format 3, live
 * components): a well that hugs its words, its controls on its open side
 * (MessageRowHug). Copy, Edit and Fork from here stand beside the well's
 * last line under the pointer, or under a full-width well at its end; a
 * run's messages are separate slabs; a phone has a ⋯ handle at the well's
 * outer corner at rest. Each moment in the session it was sent in
 * (msgrow-frame), on a desk (1440) and a phone (390).
 *
 * The meta's args are every story's; a story's own are what it changes.
 * The hub is the stand-in's, live (hub-stand-in `hubAs`).
 */
import { hubAs } from "../hub-stand-in";
import MsgrowFrame from "./msgrow-frame.svelte";

const PHONE = 680;

export default {
  title: "Message row/B · A well that hugs its words",
  component: MsgrowFrame,
  args: { option: "hug", set: "one", moment: "rest", touch: false },
  decorators: [hubAs("connected")],
  parameters: { viewport: 1440 },
};

/** Desk · at rest. The well is as long as its words. */
export const DeskRest = {};

/** Desk · hovered. Copy, Edit and Fork from here beside the well's last line, outside it. */
export const DeskHovered = { args: { moment: "hover" } };

/** Desk · a long message hovered. On a wide pane even a long well stops at the reading measure, so the strip still stands beside it. */
export const DeskLongHovered = { args: { set: "long", moment: "hover" } };

/** Narrow pane (680, the panel open) · a long message hovered. With no room beside a full-width well, the strip stands under it at its end. */
export const NarrowLongHovered = {
  args: { set: "long", moment: "hover" },
  parameters: { viewport: 680 },
};

/** Desk · selected. The selection pill in the well's own contour, the strip beside it. */
export const DeskSelected = { args: { moment: "selected" } };

/** Desk · a run of three, the last hovered. Separate slabs a step apart, each with its own strip. */
export const DeskRun = { args: { set: "run", moment: "hover" } };

/** Desk · not delivered. The well goes full width to carry Retry, Edit and Remove at rest; no strip. */
export const DeskFailed = { args: { set: "failed" } };

/** Phone · at rest. A ⋯ handle at the well's outer bottom corner, standing at rest. */
export const PhoneRest = {
  args: { touch: true, height: PHONE },
  parameters: { viewport: 390 },
};

/** Phone · after a tap on ⋯. Copy, Edit and Fork from here in the menu at the handle. */
export const PhoneTapped = {
  args: { touch: true, moment: "tap", height: PHONE },
  parameters: { viewport: 390 },
};
