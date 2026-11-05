/**
 * A project opens in a tab beside your chats (Component Story Format 3,
 * live components, a fixture frame: ProjectTabsScreen). The project's tab
 * stands where a chat's would, just after the tab you were on, and moves,
 * splits and closes as a chat's does.
 */
import ProjectTabsScreen from "./ProjectTabsScreen.svelte";

export default {
  title: "Project tabs/Beside your chats",
  component: ProjectTabsScreen,
  args: { direction: "beside", step: "project", full: "none", phone: false },
};

/** Cawco-Dev opened from the rail: its tab right after the chat you were on, its board in front. */
export const ProjectOpened = { parameters: { viewport: 1440 } };

/** Three chats open, Continue CawCo open tasks in front. */
export const ChatsOpen = { args: { step: "chats" }, parameters: { viewport: 1440 } };

/** Caw's chat opened from the project: its tab right after the project's, the project still open. */
export const CawOpened = { args: { step: "caw" }, parameters: { viewport: 1440 } };

/** On a phone: three chats in the tab row. */
export const PhoneChats = { args: { step: "chats", phone: true }, parameters: { viewport: 390 } };

/** On a phone: the project's tab in the row after the chat you were on, its views at the foot. */
export const PhoneProject = { args: { phone: true }, parameters: { viewport: 390 } };
