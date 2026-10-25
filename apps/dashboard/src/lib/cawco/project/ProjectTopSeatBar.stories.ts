/**
 * Caw's seat, direction B (Component Story Format 3, live): no head; the
 * name leads the bar before the views, Spin off and More end the strip
 * after New task, and Caw stands on the page's axis under the bar
 * (DESIGN.md, The Caw Stands On The Axis Rule). Cawco-Dev's live data, on
 * the page beside the rail at 1440 (ProjectTopDesk).
 */
import ProjectTopDesk from "./preview/ProjectTopDesk.svelte";

export default {
  title: "Project page/Caw's seat · Head in the bar",
  component: ProjectTopDesk,
  args: { width: 1212, head: "bar", askGlyph: "chat-add", strip: "loose" },
};

/** The page's top on a desk: the name in the bar, Caw on the page's axis. */
export const Desk = { parameters: { viewport: 1212 } };
