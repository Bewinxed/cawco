/**
 * A tab switch on a group of 29 conversations (Component Story Format 3,
 * live components): the session strip as a group's head draws it
 * (PaneTabs, through pane-tabs-live), its come-forward drawn `still`
 * (fluid-tabs/forward-style.ts). The board holds the group's sessions
 * (tab-switch-seed.ts), written through its own writers before each frame.
 */
import PaneTabsLive from "./pane-tabs-live.svelte";
import { JUMP, NEXT, switchMeta } from "./tab-switch-seed";

export default {
  title: "Tab switch/No sweep",
  component: PaneTabsLive,
  parameters: { viewport: "desk" },
  ...switchMeta("still"),
};

/** Twenty-nine conversations open, pick any tab: no sweep, the tabs turn over at half way, about 31 ms of script and 130 ms of main thread a switch. */
export const Live = {};

/** Picking a tab four along: the tabs between them turn over at half way, 13 outlines redrawn. */
export const Jump = JUMP;

/** Picking the tab beside it: the two tabs turn over at half way, 6 outlines redrawn. */
export const Next = NEXT;
