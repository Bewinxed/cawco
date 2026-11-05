/**
 * Open projects lead the strip (Component Story Format 3, live components,
 * a fixture frame: ProjectTabsScreen). A project's tab stands at the strip's
 * start, ahead of every chat, a gap after the projects; chats opened from
 * it stand first among the chats.
 */
import ProjectTabsScreen from "./ProjectTabsScreen.svelte";

export default {
  title: "Project tabs/Projects lead the strip",
  component: ProjectTabsScreen,
  args: { direction: "lead", step: "project", full: "none", phone: false },
};

/** Cawco-Dev opened from the rail: its tab first in the strip, the chats after it, its board in front. */
export const ProjectOpened = { parameters: { viewport: 1440 } };

/** Three chats open, Continue CawCo open tasks in front. */
export const ChatsOpen = { args: { step: "chats" }, parameters: { viewport: 1440 } };

/** Caw's chat opened from the project: first among the chats, the project still leading. */
export const CawOpened = { args: { step: "caw" }, parameters: { viewport: 1440 } };

/** On a phone: three chats in the tab row. */
export const PhoneChats = { args: { step: "chats", phone: true }, parameters: { viewport: 390 } };

/** On a phone: the project's tab first in the row, its views at the foot. */
export const PhoneProject = { args: { phone: true }, parameters: { viewport: 390 } };
