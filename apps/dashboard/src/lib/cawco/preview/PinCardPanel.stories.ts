/**
 * Option C, the thread panel: the card beside the pill only composes, at
 * 280px; once posted, every thread opens in a panel at the pane's end, in
 * place of the Comments list, 400px wide, its handle dragging it from 300px
 * to half the pane, the full height of the well, its head and reply pinned
 * while the entries scroll. Every story but the first draws the same long
 * thread in a preview pane at its real size.
 */
import Fixture from "./PinCardFixture.svelte";

const desk = { w: 1357, h: 1137 };
const tablet = { w: 820, h: 1180 };
const phone = { w: 390, h: 844 };

export default {
  title: "Comment card sizing/C, the thread panel",
  component: Fixture,
  args: { option: "panel", pane: desk, list: "beside", stands: "panel" },
};

/** Desk 1357, writing a comment: the composer beside the pill, 280px. */
export const DeskComposing = {
  args: { stands: "compose" },
  parameters: { viewport: 1357 },
};

/** Desk 1357, Comments open: the thread takes the list's place, 400px, the handle on its edge. */
export const DeskListOpen = { parameters: { viewport: 1357 } };

/** Desk 1357, Comments shut: the same panel opens at 400px. */
export const DeskListClosed = {
  args: { list: "none" },
  parameters: { viewport: 1357 },
};

/** Tablet 820, Comments open: the thread is a 400px side sheet over the page's end, in the list's place. */
export const TabletListOpen = {
  args: { pane: tablet, stands: "side" },
  parameters: { viewport: 820 },
};

/** Phone 390: the thread is a bottom sheet. */
export const Phone = {
  args: { pane: phone, list: "none", stands: "bottom" },
  parameters: { viewport: 390 },
};
