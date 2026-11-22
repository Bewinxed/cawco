/**
 * The kit's SoundSwitcher (Component Story Format 3, live components),
 * mounted as itself: the composer's cues off and on. Each story sets the
 * reader's choice through the feel store's own writer before it mounts.
 */
import SoundSwitcher from "./SoundSwitcher.svelte";

export default {
  title: "Kit/Sound switcher",
  component: SoundSwitcher,
  args: {},
};

/** The composer's cues are off. */
export const Off = {
  async beforeEach() {
    const { setSound } = await import("#lib/platform/feel.svelte.js");
    setSound(false);
  },
};

/** The composer's cues are on. */
export const On = {
  async beforeEach() {
    const { setSound } = await import("#lib/platform/feel.svelte.js");
    setSound(true);
  },
};
