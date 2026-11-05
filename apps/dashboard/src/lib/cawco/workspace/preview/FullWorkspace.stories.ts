/**
 * Full size fills the workspace (Component Story Format 3, live components,
 * a fixture frame: ProjectTabsScreen). Split beside the chats, the
 * project's group takes the whole workspace and the others wait behind it;
 * the rail and its tab stay.
 */
import ProjectTabsScreen from "./ProjectTabsScreen.svelte";

export default {
  title: "Project full size/The workspace",
  component: ProjectTabsScreen,
  args: { direction: "beside", step: "split", full: "workspace", phone: false },
};

/** Full size: the project's group fills the workspace, the chats' group waiting behind it. */
export const FullSize = { parameters: { viewport: 1440 } };

/** Split beside the chats, Full size in the project's head. */
export const Split = { args: { full: "none" }, parameters: { viewport: 1440 } };
