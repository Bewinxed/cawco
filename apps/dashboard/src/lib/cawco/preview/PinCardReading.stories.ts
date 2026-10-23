/**
 * Option A, the reading card: the comment stays beside its pin, two fifths
 * of the page's width (280 to 480px), as tall as the room below the pin,
 * its head and reply pinned while the replies scroll. Every story draws the
 * same long reply in a preview pane at its real size, its caption over it.
 * The desk is 1320px, the widest a decision page's well holds at a 1440px
 * window, where the owner's own screen is 1357.
 */
import Fixture from "./PinCardFixture.svelte";

const desk = { w: 1320, h: 1137 };
const tablet = { w: 820, h: 1180 };
const phone = { w: 390, h: 844 };

export default {
  title: "Comment card sizing/A, the reading card",
  component: Fixture,
  args: {
    option: "reading",
    pane: desk,
    list: "beside",
    stands: "card",
    caption: "Your screen, Comments open",
  },
};

/** Desk, Comments open: the card is two fifths of the 1000px page, 400px. */
export const DeskListOpen = { parameters: { viewport: 1320 } };

/** Desk, Comments shut: the card reaches its 480px ceiling. */
export const DeskListClosed = {
  args: { list: "none", caption: "Your screen, Comments shut" },
  parameters: { viewport: 1320 },
};

/** Tablet 820, Comments open: no side of the pin has 280px in the 500px page, so the comment is a drawer at the bottom. */
export const TabletListOpen = {
  args: {
    pane: tablet,
    stands: "sheet",
    caption: "Tablet, Comments open: a drawer at the bottom",
  },
  parameters: { viewport: 820 },
};

/** Tablet 820, Comments shut while the comment is open: the card stands beside its pin at 328px. */
export const TabletListClosed = {
  args: {
    pane: tablet,
    list: "none",
    caption: "Tablet, Comments closed while the comment is open",
  },
  parameters: { viewport: 820 },
};

/** Phone 390: under 680px the comment is a drawer at the bottom, as today, the page lifting its pin above it. */
export const Phone = {
  args: { pane: phone, list: "none", stands: "sheet", caption: "Phone" },
  parameters: { viewport: 390 },
};
