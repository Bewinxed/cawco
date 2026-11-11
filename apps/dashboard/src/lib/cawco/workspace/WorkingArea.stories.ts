/**
 * The working area whole (Component Story Format 3, live components): the
 * tabs, the transcript, the preview panel beside it and what the panel shows,
 * real components on placeholder data. The panel's comments are six on the
 * ask in the composer: one waiting on him, three open, two resolved.
 * Everything in it is live: its menus, cards and modes open as they do in
 * the app.
 *
 * Each state is a picture the others don't draw: what stands open in the
 * panel and what waits on him (component-canvas, the naming rule; the
 * owner's pin on the states' names: "what is \"preview open\" obviously
 * it's open?").
 */
import { canvasPath } from "@cawco/core/stage";
import WorkingAreaFrame from "./fixtures/WorkingAreaFrame.svelte";

export default {
  title: "Workspace/Working area",
  component: WorkingAreaFrame,
  parameters: { viewport: "desk" },
};

/** An agent answered one of my comments with a question: the Comments card stands open over the drawing. */
export const AnswerWaiting = {};

/** Comments put away, the drawing stands at a state a move leads into: ▶ plays the move. */
export const MoveToPlay = {
  args: {
    path: canvasPath(["src/lib/cawco/StopTrayPick.stories.ts"], {}),
    artifactName: "Pick what stops",
    ask: "Off title desk",
    comments: "shut",
  },
};
