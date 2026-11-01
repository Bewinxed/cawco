/**
 * The design graph (Component Story Format 3, live components): the surface
 * where the person judges what an agent built, here judging two real
 * components an agent showed him, the routine form and Who decides' roster,
 * each mounted live from its own states file's args (graph-records). Each
 * state is where the person stands; a desk story at 1540, the window's
 * width the owner checks at, and a phone story at 390. The meta's args are
 * every story's; a story's own args are what it changes.
 */
import { dur } from "#lib/cawco/motion/curves.svelte.js";
import DesignGraphFrame from "./design-graph-frame.svelte";
import { reviewGraphs } from "./graph-records";

export default {
  title: "Design graph/Surface",
  component: DesignGraphFrame,
  args: { graphs: reviewGraphs, height: 900 },
};

/** Opened on the routine form, filled in: the steps on top, the form whole under them, the map folded into its button. */
export const Opened = { parameters: { viewport: 1540 } };

/** The map open beside the form: two machines, each its own region, the kept state on the selection's pill. */
export const MapOpen = {
  args: { start: { kept: "Filled", map: true } },
  parameters: { viewport: 1540 },
};

/** Create pressed: Creating kept, its move's three clips in the dock at the foot. */
export const MoveKept = {
  args: { start: { kept: "Saving", cameFrom: "Filled", map: true } },
  parameters: { viewport: 1540 },
};

/** The same moment with the steps and the dock floating over the form, as glass (the other way to lay out a desk, open with the owner). */
export const MoveKeptFloating = {
  args: {
    start: { kept: "Saving", cameFrom: "Filled", map: true },
    layout: { room: "float" },
  },
  parameters: { viewport: 1540 },
};

/** The hub didn't answer: the move's four clips, the failure line unfolding over 260ms. */
export const FailedMove = {
  args: { start: { kept: "FailedSave", cameFrom: "Saving", map: true } },
  parameters: { viewport: 1540 },
};

/** Two clips edited, one off the tokens with ⌥ (its chip dashed): Original | Edited in the dock's head. */
export const Edited = {
  args: {
    start: {
      kept: "FailedSave",
      cameFrom: "Saving",
      map: true,
      edits: {
        "line-unfold": { duration: dur("--dur-lift"), token: "--dur-lift" },
        // Dragged with ⌥ held, to a length between two tokens.
        "row-slide": {
          duration: Math.round((dur("--dur-panel") + dur("--dur-lift")) / 2),
          token: null,
        },
      },
      progress: 0.6,
    },
  },
  parameters: { viewport: 1540 },
};

/** Resting on Unreadable schedule while Custom is kept: washes behind what came in and what went. */
export const Previewing = {
  args: { start: { kept: "Custom", map: true, preview: "InvalidSchedule" } },
  parameters: { viewport: 1540 },
};

/** The map as a list: each machine's name over its states. */
export const Outline = {
  args: { start: { kept: "Weekly", map: true, outline: true } },
  parameters: { viewport: 1540 },
};

/** The second component, Who decides, with its count of real members on the steps' row. */
export const SecondComponent = {
  args: { start: { at: 1, kept: "OpenManyMembers", map: true } },
  parameters: { viewport: 1540 },
};

/** On his 2529 window, a preview stands beside the kept state rather than over it. */
export const WidePair = {
  args: { start: { kept: "Filled", map: true, preview: "Saving" } },
  parameters: { viewport: 2529 },
};

/** On a phone: the form fills the well; one glass bar at the foot holds the steps, Timing and Map. */
export const Phone = {
  args: { start: { kept: "Filled" }, height: 760 },
  parameters: { viewport: 390 },
};

/** On a phone, the map's sheet over the form's foot, as a list under each machine's name. */
export const PhoneMap = {
  args: { start: { kept: "Filled", sheet: "map" }, height: 760 },
  parameters: { viewport: 390 },
};

/** On a phone, Creating kept with Timing open: the dock's sheet over the form's foot. */
export const PhoneTiming = {
  args: {
    start: { kept: "Saving", cameFrom: "Filled", sheet: "dock" },
    height: 760,
  },
  parameters: { viewport: 390 },
};

/** On a phone with the glass bar at the top, over the form's head (the other way, open with the owner). */
export const PhoneBarTop = {
  args: { start: { kept: "Filled" }, height: 760, layout: { bar: "top" } },
  parameters: { viewport: 390 },
};
