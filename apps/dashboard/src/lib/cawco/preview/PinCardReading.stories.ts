/**
 * Option A, the reading card: the thread stays beside its pill, two fifths
 * of the well wide (280 to 480px), as tall as the room from the pill to the
 * well's foot, its head and reply pinned while the entries scroll. Every
 * story draws the same long thread in a preview pane at its real size.
 */
import Fixture from "./PinCardFixture.svelte";

const desk = { w: 1357, h: 1137 };
const tablet = { w: 820, h: 1180 };
const phone = { w: 390, h: 844 };

export default {
  title: "Comment card sizing/A, the reading card",
  component: Fixture,
  args: { option: "reading", pane: desk, list: "beside", stands: "card" },
};

/** Desk 1357, Comments open: the card is two fifths of the 1037px well, 415px. */
export const DeskListOpen = { parameters: { viewport: 1357 } };

/** Desk 1357, Comments shut: the card reaches its 480px ceiling. */
export const DeskListClosed = {
  args: { list: "none" },
  parameters: { viewport: 1357 },
};

/** Tablet 820, Comments open: no side of the pill has 280px in the 500px well, so the thread is the well's foot sheet. */
export const TabletListOpen = {
  args: { pane: tablet, stands: "sheet" },
  parameters: { viewport: 820 },
};

/** Tablet 820, Comments shut while the card is open: the card stands beside its pill at 328px. */
export const TabletListClosed = {
  args: { pane: tablet, list: "none" },
  parameters: { viewport: 820 },
};

/** Phone 390: under 680px the thread is the well's foot sheet, as today. */
export const Phone = {
  args: { pane: phone, list: "none", stands: "sheet" },
  parameters: { viewport: 390 },
};
