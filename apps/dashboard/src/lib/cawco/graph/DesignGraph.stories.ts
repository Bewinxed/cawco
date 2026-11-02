/**
 * The design graph's own states (Component Story Format 3, live
 * components): the surface as the agent opens it on the routine form at
 * Save failed, each way it can stand, with the routine form and the roster
 * from their own states files. On a desk the states and the move stand in
 * a room beside the stage (the owner's pick on design-graph-arrangement).
 * Where the surface cannot hold both, the room is the kit's drawer, which vaul places by the
 * window's height: it is judged on the page itself at 390 and 680
 * (/dev/design-graph), where the window is the surface's.
 */
import { menu } from "./menu-review";
import DesignGraphFrame from "./preview/DesignGraphFrame.svelte";
import { unmountable } from "./preview/unmountable-review";

export default {
  title: "Design graph/Design graph",
  component: DesignGraphFrame,
  args: {
    ask: { component: "Routine form", state: "FailedSave" },
  },
};

/** Opened by the agent's ask: the routine form at Save failed, its move playing once, the journey beside it. */
export const Opened = { parameters: { viewport: 1440 } };

/** The whole set: every state of the form's four machines and where each one's moves go. */
export const WholeSet = {
  args: {
    ask: { component: "Routine form", state: "FailedSave", face: "whole" },
  },
  parameters: { viewport: 1440 },
};

/** The move into Save failed: its clips, their lengths and curves, the playhead at its start. */
export const Move = {
  args: {
    ask: { component: "Routine form", state: "FailedSave", face: "move" },
  },
  parameters: { viewport: 1440 },
};

/** Two components under one ask: the roster waits behind the name's menu. */
export const TwoComponents = {
  args: { withRoster: true },
  parameters: { viewport: 1440 },
};

/** The hub's link is down: the stage keeps its last drawing, marked not live. */
export const LinkDown = {
  args: { stale: true },
  parameters: { viewport: 1440 },
};

/** A states file of one story and no machine: the stage alone, nothing to step through. */
export const OneState = {
  args: { alone: menu, ask: {} },
  parameters: { viewport: 1440 },
};

/** The component threw as it mounted: why, in the stage's place, with Try again and its details. */
export const MountFailed = {
  args: { alone: unmountable, ask: {} },
  parameters: { viewport: 1440 },
};

/** Opened at 2529 with the conversation beside it: the stage at the form's own width, the room beside it. */
export const Wide = { parameters: { viewport: 1280 } };
