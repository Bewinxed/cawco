/**
 * My reading of the tunable word fade: each curve its dial reaches, mounted in the live fixture. A still frame of
 * each shows the same reply; the line under it says what iPhone Safari draws.
 */

import tunable from "./WordFadeTuned.stories";
import WordFadeLive from "./word-fade-live.svelte";

export default {
  title: "Word fade/Every curve",
  component: WordFadeLive,
  args: tunable.args,
};

/** Words fading in on the crossfade curve, slow at both ends. */
export const Crossfade = {};

/** Words fading in on the house ease-out, most of the fade in its first frames. */
export const EaseOut = { args: { curve: "Ease out" } };

/** Words fading in on the drawer's curve. */
export const Drawer = { args: { curve: "Drawer" } };

/** Words fading in on the house ease-in-out, slow to start. */
export const EaseInOut = { args: { curve: "Ease in-out" } };

/** Words fading in on the goo curve, which runs past full and settles. */
export const Goo = { args: { curve: "Goo" } };

/** Words fading in on the glide's last stretch. */
export const GlideOut = { args: { curve: "Glide out" } };

/** Words fading in on a curve of my own points, a slow start and a soft landing. */
export const Custom = {
  args: { curve: "Custom", x1: 0.5, y1: 0, x2: 0.3, y2: 1 },
};
