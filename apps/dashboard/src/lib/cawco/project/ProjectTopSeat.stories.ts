/**
 * Caw's seat at the top of the project page (Component Story Format 3,
 * live), both directions on one canvas, each on a desk at 1440, on a desk
 * at 1037 with a task open (the page beside the rail is 809px; the task
 * pane stands under the head) and on a phone, from the page's real parts
 * on Cawco-Dev's live data (ProjectTopDesk, ProjectTopPhone):
 * - the one-row head under the bar: its name, the place as an OS-mark item,
 *   Caw's 48px seat and one glass capsule of Ask Caw, Spin off and More,
 *   nothing coral; on a phone the name again under the bar's title, the
 *   capsule holding More alone;
 * - the head in the bar: the name leads the bar before the views, Spin off
 *   and More end the strip after New task, Caw stands on the page's axis
 *   (DESIGN.md, The Caw Stands On The Axis Rule); on a phone the OS mark
 *   follows the bar's title and More joins Caw in the bar's glass.
 * The phone's views bar keeps Ask Caw's plus, as it stands.
 */
import ProjectTopDesk from "./preview/ProjectTopDesk.svelte";
import ProjectTopPhone from "./preview/ProjectTopPhone.svelte";

export default {
  title: "Project page/Caw's seat",
  component: ProjectTopDesk,
  args: { width: 1212, askGlyph: "chat-add", strip: "loose" },
};

const PHONE = { width: 390, height: 420, askGlyph: "plus" } as const;

/** One-row head, on a desk at 1440. */
export const RowDesk = {
  args: { head: "row" },
  parameters: { viewport: 1212 },
};

/** One-row head, on a desk at 1037 with a task open. */
export const Row1037 = {
  args: { head: "row", width: 809 },
  parameters: { viewport: 809 },
};

/** One-row head, on a phone. */
export const RowPhone = {
  component: ProjectTopPhone,
  args: { ...PHONE, head: "row" },
  parameters: { viewport: 390 },
};

/** Head in the bar, on a desk at 1440. */
export const BarDesk = {
  args: { head: "bar" },
  parameters: { viewport: 1212 },
};

/** Head in the bar, on a desk at 1037 with a task open. */
export const Bar1037 = {
  args: { head: "bar", width: 809 },
  parameters: { viewport: 809 },
};

/** Head in the bar, on a phone. */
export const BarPhone = {
  component: ProjectTopPhone,
  args: { ...PHONE, head: "bar" },
  parameters: { viewport: 390 },
};
