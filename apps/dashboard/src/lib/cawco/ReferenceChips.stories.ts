/**
 * Reference chips as a conversation draws them: each in a line of an agent's
 * reply, through the transcript's own markdown and the dashboard's registry
 * of references (references.ts), over product-shaped records.
 */
import ReferenceLine from "./ReferenceLine.fixture.svelte";

const SESSION = "cawco:session/f3a91c2e-7b40-4d1e-9a52-0c6e8d417b93";
const LONG_SESSION = "cawco:session/9d2c61b8-35aa-4e07-b1f4-62e7a0c9d815";

export default {
  title: "Conversation/Reference chips",
  component: ReferenceLine,
};

/** A session in a sentence, with its short title. */
export const SessionShortTitle = {
  args: {
    source: `I handed the overflow to [Fix tray chip overflow](${SESSION}) and it is already running, so check back once it reports.`,
  },
};

/** A session whose long title runs past the line. */
export const SessionLongTitle = {
  args: {
    source: `The hub side is with [a long title](${LONG_SESSION}) and it will take a while, so I am leaving it be.`,
  },
};

/** Three tasks in a sentence, each at its own stage. */
export const TasksInThreeStages = {
  args: {
    source:
      "Where it stands: [Tray chip overflow on a phone](cawco:task/cockpit/tsk-142), then [Sign-in move for stored transcripts](cawco:task/cockpit/tsk-151) under way, and [Release health tiles](cawco:task/cockpit/tsk-97) already landed.",
  },
};

/** A page, a preview, a canvas and a component the session made. */
export const ArtifactsOfEachKind = {
  args: {
    source:
      "I made [Release health](cawco:artifact/art-page), [Tray chip, as it draws on a phone](cawco:artifact/art-preview), [Where the sign-in move touches the hub](cawco:artifact/art-canvas) and [Reference chips](cawco:artifact/art-component).",
  },
};

/** A decision card, a pin and a spot an update changed. */
export const CardPinAndChange = {
  args: {
    source:
      "Pick on [Which head fits the phone page](cawco:decision/art-page/head) first; your pin [the heading's second line](cawco:pin/art-page/2) is answered, and [the heading changed](cawco:change/art-page/h1) in the update.",
  },
};

/** A step under way and one done in the session's plan. */
export const PlanSteps = {
  args: {
    source: `Next in the plan: [Draw every chip on the canvas at both widths](cawco:step/f3a91c2e-7b40-4d1e-9a52-0c6e8d417b93/s2) is under way, after [Read the chip's markup](cawco:step/f3a91c2e-7b40-4d1e-9a52-0c6e8d417b93/s1).`,
  },
};

/** A reference to a task that is gone: its written words only. */
export const SomethingGone = {
  args: {
    source:
      "That one was [Retire the old tray](cawco:task/cockpit/tsk-999), which no longer exists.",
  },
};
