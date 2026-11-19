/**
 * Today's word fade in a streaming reply: the product's own, the menu's
 * 140 ms on the house ease-out. Under the reply, what iPhone Safari shows of
 * each word's fade, frame by frame.
 */
import WordFadeLive from "./word-fade-live.svelte";

export default {
  title: "Word fade/Today",
  component: WordFadeLive,
  args: { tuned: false, pace: "usual", again: 0 },
};

/** A reply streaming in with today's word fade. */
export const Today = {};
