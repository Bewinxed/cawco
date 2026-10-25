/**
 * One Ask Caw glyph, Chat-add (Component Story Format 3, live): the glyph in
 * the strip's Ask Caw for a view and the head's capsule on a desk, and in
 * the views' bar's trailing capsule on a phone, with the one-row head.
 * Cawco-Dev's live data (ProjectTopDesk, ProjectTopPhone).
 */
import ProjectTopDesk from "./preview/ProjectTopDesk.svelte";
import ProjectTopPhone from "./preview/ProjectTopPhone.svelte";

export default {
  title: "Project page/Ask Caw · Chat-add",
  component: ProjectTopDesk,
  args: { width: 1212, head: "row", askGlyph: "chat-add", strip: "loose" },
};

/** On a desk: the strip in the bar and the head's capsule. */
export const Desk = { parameters: { viewport: 1212 } };

/** On a phone: the views' bar at the foot, Ask Caw its trailing capsule. */
export const Phone = {
  component: ProjectTopPhone,
  args: { askGlyph: "chat-add", width: 390, height: 420 },
  parameters: { viewport: 390 },
};
