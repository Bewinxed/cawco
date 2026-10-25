/**
 * Caw's seat, direction A (Component Story Format 3, live): the one-row head
 * under the bar, its name leading, the place as an OS-mark item, then Caw's
 * 48px seat and one glass capsule of Ask Caw, Spin off and More, nothing
 * coral; the view strip stays in the bar. Cawco-Dev's live data, on the
 * page beside the rail at 1440 (ProjectTopDesk).
 */
import ProjectTopDesk from "./preview/ProjectTopDesk.svelte";

export default {
  title: "Project page/Caw's seat · One-row head",
  component: ProjectTopDesk,
  args: { width: 1212, head: "row", askGlyph: "chat-add", strip: "loose" },
};

/** The page's top on a desk: the bar, then the one-row head. */
export const Desk = { parameters: { viewport: 1212 } };
