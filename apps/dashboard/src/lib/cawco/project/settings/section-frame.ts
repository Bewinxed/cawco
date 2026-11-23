/**
 * A section's states files' decorator: each story stands in its section's
 * card on the view's 4px base (section-frame.svelte), so a frame draws a
 * section as the Settings view draws it, not bare against the frame's edge.
 */
import type { SectionId } from "./changes";
import SectionFrame from "./section-frame.svelte";

export const inSettingsCard = (section: SectionId) => () => ({
  Component: SectionFrame,
  props: { section },
});
