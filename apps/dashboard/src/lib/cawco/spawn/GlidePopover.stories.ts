/**
 * The glide popover (Component Story Format 3, live components): the
 * new-session form's own popovers (`roomy`) open under their chips in a
 * frame of its own (glide-popover-frame), holding the rows each chip holds,
 * so their corners are read against the surface's (DESIGN.md, The
 * Concentric Rule). The meta's args are every story's; a story's own args
 * are what it changes.
 */
import GlidePopoverFrame from "./glide-popover-frame.svelte";

export default {
  title: "Spawn/Glide popover",
  component: GlidePopoverFrame,
  args: { which: "lifetime", height: 320 },
};

/** The session lifetime chip's popover: two rows, the first chosen. */
export const Lifetime = { parameters: { viewport: 390 } };

/** The project chip's popover: the projects, the chosen one tinted, then New project. */
export const Project = {
  args: { which: "project" },
  parameters: { viewport: 390 },
};

/** The machines chip's popover: two chosen machines joined as one block, then one more. */
export const Machines = {
  args: { which: "machines" },
  parameters: { viewport: 390 },
};

/** The permission mode's popover: the permission list embedded, its fill under the chosen mode. */
export const Permission = {
  args: { which: "permission" },
  parameters: { viewport: 390 },
};
