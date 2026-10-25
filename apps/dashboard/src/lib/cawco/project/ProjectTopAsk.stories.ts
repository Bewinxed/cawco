/**
 * One Ask Caw glyph (Component Story Format 3, live), with the one-row
 * head: the glyph in the strip's Ask Caw for a view and the head's capsule
 * on a desk, and in the views bar's trailing capsule on a phone, for
 * chat-add and for sparkles. Cawco-Dev's live data (ProjectTopDesk,
 * ProjectTopPhone).
 */
import ProjectTopDesk from "./preview/ProjectTopDesk.svelte";
import ProjectTopPhone from "./preview/ProjectTopPhone.svelte";

export default {
  title: "Project page/Ask Caw",
  component: ProjectTopDesk,
  args: { width: 1212, head: "row", strip: "loose" },
};

const PHONE = { width: 390, height: 420, head: "row" } as const;

/** Chat-add, on a desk. */
export const ChatDesk = {
  args: { askGlyph: "chat-add" },
  parameters: { viewport: 1212 },
};

/** Chat-add, on a phone. */
export const ChatPhone = {
  component: ProjectTopPhone,
  args: { ...PHONE, askGlyph: "chat-add" },
  parameters: { viewport: 390 },
};

/** Sparkles, on a desk. */
export const SparklesDesk = {
  args: { askGlyph: "sparkles" },
  parameters: { viewport: 1212 },
};

/** Sparkles, on a phone. */
export const SparklesPhone = {
  component: ProjectTopPhone,
  args: { ...PHONE, askGlyph: "sparkles" },
  parameters: { viewport: 390 },
};
