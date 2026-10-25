/**
 * The view strip's actions (Component Story Format 3, live): the filter,
 * New task and Ask Caw for a view at the strip's end in the bar, in a
 * capsule of the bar's glass, then loose after a hairline rule as today,
 * with the one-row head under it. Cawco-Dev's live data (ProjectTopDesk).
 */
import ProjectTopDesk from "./preview/ProjectTopDesk.svelte";

export default {
  title: "Project page/Strip actions",
  component: ProjectTopDesk,
  args: { width: 1212, head: "row", askGlyph: "chat-add" },
  parameters: { viewport: 1212 },
};

/** In a glass capsule. */
export const Capsule = { args: { strip: "capsule" } };

/** Loose bare symbols. */
export const Loose = { args: { strip: "loose" } };
