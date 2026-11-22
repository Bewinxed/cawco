/**
 * The kit's Sidebar parts (Component Story Format 3, live components) in a
 * frame of their own (sidebar-frame): the rail's places and projects, a
 * place current and a project current. The meta's args are every story's; a
 * story's own args are what it changes.
 */
import { IconBox, IconDecisions, IconFiles } from "#lib/icons.js";
import SidebarFrame from "./sidebar-frame.svelte";

export default {
  title: "Kit/Sidebar",
  component: SidebarFrame,
  args: {
    places: [
      { icon: IconBox, words: "Fleet", count: 7, live: true },
      { icon: IconDecisions, words: "Decisions", count: 2 },
      { icon: IconFiles, words: "Files" },
    ],
    projects: ["cockpit", "caw-landing", "phone-app"],
    current: "Fleet",
  },
};

/** The fleet is the current page. */
export const PlaceCurrent = {};

/** A project is the current page. */
export const ProjectCurrent = { args: { current: "cockpit" } };
