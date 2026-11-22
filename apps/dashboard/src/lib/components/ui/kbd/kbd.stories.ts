/**
 * The kit's Kbd (Component Story Format 3, live components) in a frame of
 * its own (kbd-frame): the keys a hint names. The meta's args are every
 * story's; a story's own args are what it changes.
 */
import KbdFrame from "./kbd-frame.svelte";

export default {
  title: "Kit/Kbd",
  component: KbdFrame,
  args: { keys: ["⌘", "K"] },
};

/** Open the finder. */
export const Chord = {};

/** One key. */
export const Single = { args: { keys: ["Esc"] } };

/** A three-key chord. */
export const ThreeKeys = { args: { keys: ["⇧", "⌘", "N"] } };
