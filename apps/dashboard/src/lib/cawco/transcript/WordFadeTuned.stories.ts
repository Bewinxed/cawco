/**
 * The word fade in a streaming reply on the curve and duration the dials
 * set, starting on the crossfade curve at 140 ms. Under the reply, what
 * iPhone Safari shows of each word's fade, frame by frame.
 */
import WordFadeLive from "./word-fade-live.svelte";

export default {
  title: "Word fade/Tunable",
  component: WordFadeLive,
  args: {
    tuned: true,
    curve: "Crossfade",
    x1: 0.42,
    y1: 0,
    x2: 0.58,
    y2: 1,
    // golar-ignore-next-line house/no-raw-motion -- where the duration dial starts, --duration-menu's 140 ms; what the person picks lands as a token
    duration: 140,
    pace: "usual",
    again: 0,
  },
};

/** A reply streaming in with the word fade the dials set. */
export const Tunable = {};
