/**
 * The kit's IconToggle (Component Story Format 3, live components): a
 * two-state ghost icon switch with a tooltip and swapping glyph.
 */
import { IconSound, IconSoundOff } from "#lib/icons.js";
import IconToggle from "./icon-toggle.svelte";

export default {
  title: "Kit/Icon toggle",
  component: IconToggle,
  args: {
    active: false,
    label: "Turn sound on",
    ariaLabel: "Sound",
    pressed: false,
    on: IconSound,
    off: IconSoundOff,
    onclick: () => undefined,
  },
};

/** Off state. */
export const Off = {};

/** Active state. */
export const On = {
  args: { active: true, pressed: true, label: "Turn sound off" },
};
