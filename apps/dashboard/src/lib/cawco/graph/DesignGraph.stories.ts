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
import {
  relay,
  routineFormOneMachine,
  routineFormStalePlay,
  runBudget,
  suggestions,
  who,
} from "./preview/harden-review";
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

/** The move on a phone: the room's drawer at its half stop, on the Animation face. */
export const MovePhone = {
  args: {
    ask: { component: "Routine form", state: "FailedSave", face: "move" },
    opensAt: "half",
  },
  parameters: { viewport: 390 },
};

/** The move at 680: the same drawer, wider. */
export const MoveDrawer = {
  args: {
    ask: { component: "Routine form", state: "FailedSave", face: "move" },
    opensAt: "half",
  },
  parameters: { viewport: 680 },
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

// --- Hardening (impeccable's harden.md): real text at its longest and
// shortest, one machine and thirty states, figures in the millions and in
// another language, a failed load and its way back. ---

/** The longest real text: the stream relay journey, its longest note (143 characters) on the state it opens at. */
export const LongestText = {
  args: { alone: relay, ask: { state: "CertificateToken" } },
  parameters: { viewport: 1440 },
};

/** The longest real text on a phone: the stage's head, the drawer's rows and the bar under 390. */
export const LongestTextPhone = {
  args: { alone: relay, ask: { state: "CertificateToken" } },
  parameters: { viewport: 390 },
};

/** The shortest real text: Who's sheet, a word a state, no notes, named by its file. */
export const ShortestText = {
  args: { alone: who, ask: {} },
  parameters: { viewport: 1440 },
};

/** One machine: the routine form opened with no machine named, every state under its own name. */
export const OneMachine = {
  args: { alone: routineFormOneMachine, ask: { state: "FailedSave" } },
  parameters: { viewport: 1440 },
};

/** Thirty states in one machine: Suggestions, opened at its last. */
export const ThirtyStates = {
  args: { alone: suggestions, ask: { state: "RowPhone" } },
  parameters: { viewport: 1440 },
};

/** Thirty states on a phone: the list in the drawer at its half stop's room. */
export const ThirtyStatesPhone = {
  args: { alone: suggestions, ask: { state: "RowPhone" } },
  parameters: { viewport: 390 },
};

/** Figures in the millions: a run's budget filling over 30 minutes, its move 1,800,000 ms on the ruler. */
export const MillionsOfMs = {
  args: { alone: runBudget, ask: { state: "Running", face: "move" } },
  parameters: { viewport: 1440 },
};

/** The same move in German: its figures grouped as German groups them, 1.800.000. */
export const LocaleFormats = {
  args: {
    alone: runBudget,
    ask: { state: "Running", face: "move" },
    lang: "de-DE",
  },
  parameters: { viewport: 1440 },
};

/** A move that failed to play: its play presses a button the form no longer has; why, and Try again. */
export const MoveFailed = {
  args: {
    alone: routineFormStalePlay,
    ask: { state: "FailedSave", face: "move" },
  },
  parameters: { viewport: 1440 },
};

// --- The map at a phone's width: a list, as DESIGN.md's Map mode draws a
// narrow map (in a pane under 640px the map is a list). At the drawer's
// half stop, judged on the page itself (/dev/design-graph?story=MapPhone),
// where the window is the surface's. ---

/** The map in a pane under 640px, at the agent's ask (Hub didn't answer): each machine's states as cards with their moves, opened on the state on stage. */
export const MapPhone = {
  args: {
    ask: { component: "Routine form", state: "FailedSave", face: "whole" },
    opensAt: "half",
  },
  parameters: { viewport: 390 },
};
