/**
 * A surface opening and closing beside a long conversation (Component Story
 * Format 3, live components): the real split (Split), its page a column of
 * 120 wrapped paragraphs in a scroller, its surface a plain card. Open and
 * Close above it flip the surface, which grows into the page as it opens
 * and gives the page its width back as it closes.
 */
import SplitFrame from "./split-frame.svelte";

export default {
  title: "Side/Split",
  component: SplitFrame,
  args: { open: false, width: 1280, height: 800 },
};

/** The conversation alone, the surface closed: Open grows it in beside the page. */
export const Closed = {};

/** The plan open beside the conversation: Close gives the page its width back. */
export const Opened = { args: { open: true } };
