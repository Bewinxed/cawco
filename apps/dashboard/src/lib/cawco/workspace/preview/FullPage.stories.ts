/**
 * Full size opens the project's own page (Component Story Format 3, live
 * components, a fixture frame: ProjectTabsScreen): the page as it stands
 * today, its views in the bar and the tabs gone; Back returns to its tab.
 */
import ProjectTabsScreen from "./ProjectTabsScreen.svelte";

export default {
  title: "Project full size/Its own page",
  component: ProjectTabsScreen,
  args: { direction: "beside", step: "project", full: "page", phone: false },
};

/** Full size: the project's own page, its views in the bar, no tabs. */
export const FullSize = { parameters: { viewport: 1440 } };

/** In its tab beside the chats, Full size in its head. */
export const InTab = { args: { full: "none" }, parameters: { viewport: 1440 } };
