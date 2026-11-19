/**
 * A tab switch on a group of 29 conversations (Component Story Format 3,
 * live components): the session strip as a group's head draws it
 * (PaneTabs, through pane-tabs-live), its come-forward drawn `near`
 * (fluid-tabs/forward-style.ts). The board holds the group's sessions
 * (tab-switch-seed.ts), written through its own writers before each frame.
 */
import PaneTabsLive from "./pane-tabs-live.svelte";
import { JUMP, NEXT, switchMeta } from "./tab-switch-seed";

export default {
  title: "Tab switch/Nearest tabs",
  component: PaneTabsLive,
  parameters: { viewport: "desk" },
  ...switchMeta("near"),
};

/** Twenty-nine conversations open, pick any tab: only the two tabs and their neighbours sweep, about 61 ms of script and 127 ms of main thread a switch. */
export const Live = {};

/** Picking a tab four along: the tabs between them turn over at half way, 242 outlines redrawn. */
export const Jump = JUMP;

/** Picking the tab beside it: the same as today, 108 outlines redrawn. */
export const Next = NEXT;
