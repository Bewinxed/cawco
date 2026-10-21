/**
 * The hanging card (Component Story Format 3, live components): Caw's
 * card hung open from the top bar's glass, in a `shell` container frame
 * (hang-card-frame), with stand-in rows and no store read. Its form is the
 * frame's width, not the page's: the desk's card, `c-panel-w` wide under
 * the glass, at 1440; the phone's, the screen less the bar's leading edge,
 * square on the trailing edge, at 390. And the session card hung from its
 * folder tab (hang-card-tab-frame), the frame its hang layer: 416px at
 * 1440, margin to margin at 390. The meta's args are every story's; a
 * story's own args are what it changes.
 */
import HangCardFrame from "./hang-card-frame.svelte";
import HangCardTabFrame from "./hang-card-tab-frame.svelte";

export default {
  title: "Kit/Hang card",
  component: HangCardFrame,
  args: {
    width: 1440,
    height: 360,
    rows: [
      "Approve the dashboard build Caw asked for",
      "Answer which branch the release goes out from",
      "Read the routine's last run before it runs again",
    ],
  },
};

/** Caw's card on a desk: under the glass, flush with its trailing flank. */
export const Desk = { parameters: { viewport: 1440 } };

/** Caw's card on a phone: the screen less the bar's edge, square on the trailing edge. */
export const Phone = { args: { width: 390 }, parameters: { viewport: 390 } };

const strip = {
  height: 420,
  tabs: ["Fix the tokenizer's unicode escapes", "Release notes"],
};

/** The session card on a desk: hung from its tab, 416px wide. */
export const SessionCard = {
  component: HangCardTabFrame,
  args: strip,
  parameters: { viewport: 1440 },
};

/** The session card on a phone: margin to margin, held under the phone's screen. */
export const SessionCardPhone = {
  component: HangCardTabFrame,
  args: { ...strip, width: 390 },
  parameters: { viewport: 390 },
};
