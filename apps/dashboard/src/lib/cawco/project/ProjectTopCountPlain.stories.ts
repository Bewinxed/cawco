/**
 * The Decisions tab's count, the muted figure (Component Story Format 3, live): its
 * four pages waiting on picks, on the tab where the views stand whole, and
 * on the views' ⋯ where Decisions folds into it, which wears the Needs you
 * dot either way. Cawco-Dev's live data (ProjectTopDesk).
 */
import ProjectTopDesk from "./preview/ProjectTopDesk.svelte";

export default {
  title: "Project page/Decisions count · The muted figure",
  component: ProjectTopDesk,
  args: {
    head: "row",
    askGlyph: "chat-add",
    strip: "loose",
    decisionsDot: false,
  },
};

/** At 1440: every view a tab, Decisions saying its count. */
export const Wide = { args: { width: 1212 }, parameters: { viewport: 1212 } };

/** At 900 with the rail widened: Decisions folds into the ⋯, which says the count. */
export const Narrow = { args: { width: 500 }, parameters: { viewport: 500 } };
