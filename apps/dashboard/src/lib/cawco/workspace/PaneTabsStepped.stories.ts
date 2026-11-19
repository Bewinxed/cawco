/**
 * A tab switch on a group of 29 conversations (Component Story Format 3,
 * live components): the session strip as a group's head draws it
 * (PaneTabs, through pane-tabs-live), its come-forward drawn `stepped`
 * (fluid-tabs/forward-style.ts). The board holds the group's sessions
 * (tab-switch-seed.ts), written through its own writers before each frame.
 */
import PaneTabsLive from "./pane-tabs-live.svelte";
import { JUMP, NEXT, switchMeta } from "./tab-switch-seed";

export default {
  title: "Tab switch/Whole pixels",
  component: PaneTabsLive,
  parameters: { viewport: "desk" },
  ...switchMeta("stepped"),
};

/** Twenty-nine conversations open, pick any tab: the same sweep moved a whole pixel at a time, about 40 ms of script and 125 ms of main thread a switch. */
export const Live = {};

/** Picking a tab four along: every tab between them sweeps its sides, 184 outlines redrawn. */
export const Jump = JUMP;

/** Picking the tab beside it: the two tabs sweep, 72 outlines redrawn. */
export const Next = NEXT;
