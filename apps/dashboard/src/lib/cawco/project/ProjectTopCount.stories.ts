/**
 * The Decisions tab's count (Component Story Format 3, live): its four
 * pages waiting on picks, on the tab where the views stand whole (1440) and
 * on the views' More where Decisions folds into it (a narrow desk), which
 * wears the Needs you dot either way; the tab's count with the dot, then as
 * today's muted figure. Cawco-Dev's live data (ProjectTopDesk).
 */
import ProjectTopDesk from "./preview/ProjectTopDesk.svelte";

export default {
  title: "Project page/Decisions count",
  component: ProjectTopDesk,
  args: { head: "row", askGlyph: "chat-add", strip: "loose" },
};

/** The dot, every view a tab. */
export const DotWide = {
  args: { width: 1212, decisionsDot: true },
  parameters: { viewport: 1212 },
};

/** The dot, Decisions folded into More. */
export const DotNarrow = {
  args: { width: 500, decisionsDot: true },
  parameters: { viewport: 500 },
};

/** The muted figure, every view a tab. */
export const PlainWide = {
  args: { width: 1212, decisionsDot: false },
  parameters: { viewport: 1212 },
};

/** The muted figure, Decisions folded into More. */
export const PlainNarrow = {
  args: { width: 500, decisionsDot: false },
  parameters: { viewport: 500 },
};
