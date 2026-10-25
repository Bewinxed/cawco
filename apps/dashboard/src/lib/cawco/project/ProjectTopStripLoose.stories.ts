/**
 * The view strip's actions, loose bare symbols (Component Story Format 3, live): the
 * filter, New task and Ask Caw for a view at the strip's end in the bar,
 * with the one-row head under it. Cawco-Dev's live data (ProjectTopDesk).
 */
import ProjectTopDesk from "./preview/ProjectTopDesk.svelte";

export default {
  title: "Project page/Strip actions · Loose bare symbols",
  component: ProjectTopDesk,
  args: { width: 1212, head: "row", askGlyph: "chat-add", strip: "loose" },
};

/** The page's top on a desk. */
export const Desk = { parameters: { viewport: 1212 } };
