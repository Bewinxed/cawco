/**
 * Full size fills the window (Component Story Format 3, live components, a
 * fixture frame: ProjectTabsScreen). The rail and the tab strip go; the
 * project's head keeps Exit full size where Full size was, and Escape does
 * the same.
 */
import ProjectTabsScreen from "./ProjectTabsScreen.svelte";

export default {
  title: "Project full size/The window",
  component: ProjectTabsScreen,
  args: { direction: "beside", step: "project", full: "window", phone: false },
};

/** Full size: the project fills the window, Exit full size in its head. */
export const FullSize = { parameters: { viewport: 1440 } };

/** In its tab beside the chats, Full size in its head. */
export const InTab = { args: { full: "none" }, parameters: { viewport: 1440 } };
