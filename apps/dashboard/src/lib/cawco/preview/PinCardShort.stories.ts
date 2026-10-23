/**
 * Option B, the short card: a fixed 320px card at most 400px (or two fifths
 * of the page) tall, with no scroll inside it: the first and the last
 * message, the ones between one press. A comment with more than two
 * messages, or one taller than the card, opens in the Comments list
 * instead, which widens to 400px while it holds it. Every story but the
 * first draws the same long reply in a preview pane at its real size, its
 * caption over it. The desk is 1320px, the widest a decision page's well
 * holds at a 1440px window.
 */
import Fixture from "./PinCardFixture.svelte";

const desk = { w: 1320, h: 1137 };
const tablet = { w: 820, h: 1180 };
const phone = { w: 390, h: 844 };

export default {
  title: "Comment card sizing/B, the short card",
  component: Fixture,
  args: {
    option: "short",
    pane: desk,
    list: "beside",
    stands: "rail",
    caption: "Your screen, Comments open",
  },
};

/** Desk, a comment that fits: the card shows the first and last messages, the two between one press. */
export const DeskShortThread = {
  args: {
    stands: "card",
    longer: true,
    caption: "Your screen, a short exchange",
  },
  parameters: { viewport: 1320 },
};

/** Desk, Comments open: the long reply is taller than the card, so the Comments list widens to 400px and holds it. */
export const DeskListOpen = { parameters: { viewport: 1320 } };

/** Desk, Comments shut: the pin's press opens the Comments list at 400px, holding the comment. */
export const DeskListClosed = {
  args: { list: "none", caption: "Your screen, Comments shut" },
  parameters: { viewport: 1320 },
};

/** Tablet 820, Comments open: every comment opens in the Comments list. */
export const TabletListOpen = {
  args: { pane: tablet, caption: "Tablet, Comments open" },
  parameters: { viewport: 820 },
};

/** Phone 390: one drawer lists every comment, the picked one opened in place, the page lifting its pin above it. */
export const Phone = {
  args: { pane: phone, list: "sheet", stands: "row", caption: "Phone" },
  parameters: { viewport: 390 },
};
