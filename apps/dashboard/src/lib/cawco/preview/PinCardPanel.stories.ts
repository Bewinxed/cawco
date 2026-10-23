/**
 * Option C, the panel: the card beside the pin only writes a new comment,
 * at 280px; once posted, every comment opens in a panel on the right, in
 * place of the Comments list, 400px wide, its handle dragging it from 300px
 * to half the pane, the page's full height, its head and reply pinned while
 * the replies scroll. Every story but the first draws the same long reply
 * in a preview pane at its real size, its caption over it. The desk is
 * 1320px, the widest a decision page's well holds at a 1440px window.
 */
import Fixture from "./PinCardFixture.svelte";

const desk = { w: 1320, h: 1137 };
const tablet = { w: 820, h: 1180 };
const phone = { w: 390, h: 844 };

export default {
  title: "Comment card sizing/C, the panel",
  component: Fixture,
  args: {
    option: "panel",
    pane: desk,
    list: "beside",
    stands: "panel",
    caption: "Your screen, Comments open",
  },
};

/** Desk, writing a comment: the composer beside the pin, 280px. */
export const DeskComposing = {
  args: { stands: "compose", caption: "Your screen, writing a comment" },
  parameters: { viewport: 1320 },
};

/** Desk, Comments open: the comment takes the list's place, 400px, the handle on its edge. */
export const DeskListOpen = { parameters: { viewport: 1320 } };

/** Desk, the panel's edge held and dragged wider, to 600px: the page gives it the room. */
export const DeskPanelWide = {
  args: {
    panelW: 600,
    dragging: true,
    caption: "Your screen, the panel dragged wider",
  },
  parameters: { viewport: 1320 },
};

/** Desk, the panel's edge held and dragged in to its narrowest, 300px. */
export const DeskPanelNarrow = {
  args: {
    panelW: 300,
    dragging: true,
    caption: "Your screen, the panel dragged narrower",
  },
  parameters: { viewport: 1320 },
};

/** Desk, Comments shut: the same panel opens at 400px. */
export const DeskListClosed = {
  args: { list: "none", caption: "Your screen, Comments shut" },
  parameters: { viewport: 1320 },
};

/** Tablet 820, Comments open: the comment is a 400px panel over the page's right side, in the list's place, over the pin. */
export const TabletListOpen = {
  args: { pane: tablet, stands: "side", caption: "Tablet, Comments open" },
  parameters: { viewport: 820 },
};

/** Phone 390: the comment is a drawer at the bottom, the page lifting its pin above it. */
export const Phone = {
  args: {
    pane: phone,
    list: "none",
    stands: "bottom",
    caption: "Phone: the page scrolled to show the spot above the drawer",
  },
  parameters: { viewport: 390 },
};
