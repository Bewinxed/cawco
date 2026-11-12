/**
 * The places brought to DESIGN.md's The Alignment Rule (Component Story
 * Format 3, live components), one state each, each in its surface's own
 * padding (AlignedPlaces): words over cards, rows or a field take their
 * left edge, and Caw or a glyph stands over the middle of what is drawn
 * under him.
 */
import AlignedPlaces from "./AlignedPlaces.svelte";

export default {
  title: "Alignment/Places brought to the rule",
  component: AlignedPlaces,
  args: { place: "machines" },
  parameters: { viewport: 1440 },
};

/** No machine yet: the words line up with the two cards under them. */
export const NoMachine = { args: { place: "machines" } };

/** New project: the question starts where the field starts. */
export const NewProject = { args: { place: "new-project" } };

/** Caw's panel before a chat: the question lines up with the rows. */
export const PanelHero = { args: { place: "hero" } };

/** Empty board with Caw's panel open: Caw over the words' middle. */
export const BoardPanelOpen = { args: { place: "board-panel" } };
