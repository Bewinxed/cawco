/**
 * The fluid track (Component Story Format 3, live components): Tabs,
 * TabsList and TabItem in a frame of their own (fluid-tabs-frame) on a
 * page's ground, the segmented groove at each step of its ladder, so its
 * chosen sheet, its hover ghost and its focus ring are read where they
 * stand. The meta's args are every story's; a story's own args are what it
 * changes.
 */
import FluidTabsFrame from "./fluid-tabs-frame.svelte";

export default {
  title: "Kit/Fluid tabs",
  component: FluidTabsFrame,
  args: { size: "default", glyphs: false, chosen: "interact" },
};

/** The track at its default step, Interact chosen: a glyph and a name per tab. */
export const Segmented = { parameters: { viewport: 1440 } };

/** The compact step, Comment chosen. */
export const Compact = {
  args: { size: "compact", chosen: "comment" },
  parameters: { viewport: 1440 },
};

/** The compact step with glyphs alone, Draw chosen. */
export const Glyphs = {
  args: { size: "compact", glyphs: true, chosen: "draw" },
  parameters: { viewport: 1440 },
};

/** The track on a phone, Comment chosen. */
export const Phone = {
  args: { chosen: "comment" },
  parameters: { viewport: 390 },
};
