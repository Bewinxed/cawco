/**
 * The kit's Switch (Component Story Format 3, live components), mounted as
 * itself: off and on at both sizes, and disabled. The meta's args are every
 * story's; a story's own args are what it changes.
 */
import Switch from "./switch.svelte";

export default {
  title: "Kit/Switch",
  component: Switch,
  args: { "aria-label": "Push notifications to this phone" },
};

/** The setting is off. */
export const Off = {};

/** The setting is on. */
export const On = { args: { checked: true } };

/** A small switch in a dense row, on. */
export const SmallOn = { args: { checked: true, size: "sm" } };

/** A setting this machine can't change. */
export const Disabled = { args: { checked: true, disabled: true } };
