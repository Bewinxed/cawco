/**
 * Option B, the short card: a fixed 320px card at most 400px (or two fifths
 * of the well) tall, with no scroll inside it: the first and the last entry,
 * the ones between one press. A thread with more than two entries, or an
 * entry taller than the card's room, opens in the Comments rail instead,
 * which widens to 400px while it holds it. Every story but the first draws
 * the same long thread in a preview pane at its real size.
 */
import Fixture from "./PinCardFixture.svelte";

const desk = { w: 1357, h: 1137 };
const tablet = { w: 820, h: 1180 };
const phone = { w: 390, h: 844 };

export default {
  title: "Comment card sizing/B, the short card",
  component: Fixture,
  args: { option: "short", pane: desk, list: "beside", stands: "rail" },
};

/** Desk 1357, a thread that fits: the card shows the first and last entries, the two between one press. */
export const DeskShortThread = {
  args: { stands: "card", longer: true },
  parameters: { viewport: 1357 },
};

/** Desk 1357, Comments open: the long answer is taller than the card, so the rail widens to 400px and holds the thread. */
export const DeskListOpen = { parameters: { viewport: 1357 } };

/** Desk 1357, Comments shut: the pill's press opens the rail at 400px, holding the thread. */
export const DeskListClosed = {
  args: { list: "none" },
  parameters: { viewport: 1357 },
};

/** Tablet 820, Comments open: every thread opens in the rail. */
export const TabletListOpen = {
  args: { pane: tablet },
  parameters: { viewport: 820 },
};

/** Phone 390: one sheet lists every comment, the picked one opened in its row. */
export const Phone = {
  args: { pane: phone, list: "sheet", stands: "row" },
  parameters: { viewport: 390 },
};
