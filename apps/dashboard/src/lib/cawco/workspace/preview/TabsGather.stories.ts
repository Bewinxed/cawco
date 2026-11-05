/**
 * A project gathers its chats (Component Story Format 3, live components,
 * a fixture frame: ProjectTabsScreen). Opening a project brings its open
 * chats beside its tab under one band in its colour; Caw's chat joins
 * them; chats of other projects stand after the run.
 */
import ProjectTabsScreen from "./ProjectTabsScreen.svelte";

export default {
  title: "Project tabs/A project gathers its chats",
  component: ProjectTabsScreen,
  args: { direction: "gather", step: "project", full: "none", phone: false },
};

/** Cawco-Dev opened from the rail: its tab leads its two open chats under its band, HyucksField's chat after. */
export const ProjectOpened = { parameters: { viewport: 1440 } };

/** Three chats open, Continue CawCo open tasks in front. */
export const ChatsOpen = { args: { step: "chats" }, parameters: { viewport: 1440 } };

/** Caw's chat opened from the project: it joins the run, right after the project's tab. */
export const CawOpened = { args: { step: "caw" }, parameters: { viewport: 1440 } };

/** On a phone: three chats in the tab row. */
export const PhoneChats = { args: { step: "chats", phone: true }, parameters: { viewport: 390 } };

/** On a phone: the project's run in the row, its views at the foot. */
export const PhoneProject = { args: { phone: true }, parameters: { viewport: 390 } };
