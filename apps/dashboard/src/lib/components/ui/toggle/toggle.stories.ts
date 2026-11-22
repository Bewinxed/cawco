/**
 * The kit's Toggle (Component Story Format 3, live components) in a frame of
 * its own (toggle-frame): off, on, edged and disabled. The meta's args are
 * every story's; a story's own args are what it changes.
 */
import { IconPin } from "#lib/icons.js";
import ToggleFrame from "./toggle-frame.svelte";

export default {
  title: "Kit/Toggle",
  component: ToggleFrame,
  args: { icon: IconPin, words: "Pin to the rail" },
};

/** Not pinned. */
export const Off = {};

/** Pinned. */
export const On = { args: { pressed: true } };

/** Edged, pinned. */
export const EdgedOn = { args: { variant: "outline", pressed: true } };

/** Can't be pinned here. */
export const Disabled = { args: { disabled: true } };
