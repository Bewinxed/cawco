/**
 * The Dials card with the state's props folded in (the owner's pick,
 * 2026-11-10: Inspect stops being its own panel): the agent's dials, then
 * the props of the state on the stage as the same rows, under the
 * component's name. Each story is a situation he meets on the card as the
 * design graph opens it, grown out of the Controls button over the stage.
 */

import {
  DELEGATE_ARGS,
  DELEGATE_DIALS,
  DELEGATE_LONGEST,
  DELEGATE_ROW,
  DELEGATE_WRITTEN,
  HOW_IT_RUNS,
  HOW_IT_RUNS_ARGS,
  SPEND_ARGS,
  SPEND_TILE,
  TASK_ARGS,
  TASK_CARD,
  TASK_LONGEST,
} from "./bench/props-fixture";
import DialsCardFrame from "./dials-card-frame.svelte";

export default {
  title: "Design graph/Dials with props",
  component: DialsCardFrame,
  args: {
    dials: DELEGATE_DIALS,
    written: DELEGATE_WRITTEN,
    values: {},
    component: "DelegateRow",
    props: DELEGATE_ROW,
    args: DELEGATE_ARGS,
    edits: {},
    longest: DELEGATE_LONGEST,
    lang: "en",
  },
};

/** The agent's three dials and the delegate row's props, nothing changed. */
export const AtRest = {};

/** Two props changed and not saved yet: Save and Save as new state under the rows. */
export const TwoPropsChanged = {
  args: { edits: { state: "waiting", turns: 22 } },
};

/** Every text prop of the delegate row in its longest words, the way to judge the row at its worst. */
export const LongText = {
  args: { content: "Long" },
};

/** A spend tile no agent put a dial on: only its props. */
export const PropsOnly = {
  args: {
    dials: [],
    written: {},
    component: "SpendTile",
    props: SPEND_TILE,
    args: SPEND_ARGS,
    longest: {},
  },
};

/** A task card with twenty props, scrolling inside the card, one changed. */
export const TwentyProps = {
  args: {
    dials: [],
    written: {},
    component: "TaskCard",
    props: TASK_CARD,
    args: TASK_ARGS,
    longest: TASK_LONGEST,
    edits: { priority: "urgent" },
  },
};

/** A How it runs line's props: its situation one of nine long ones, its reading one of three. */
export const LongSet = {
  args: {
    dials: [],
    written: {},
    component: "HowItRuns",
    props: HOW_IT_RUNS,
    args: HOW_IT_RUNS_ARGS,
    longest: {},
  },
};

/** Every text in its longest words: the situation its own longest, the reading left as it was. */
export const LongSetLongText = {
  args: { ...LongSet.args, content: "Long" },
};

/** What a story's `play` is handed: the frame to find its controls in, and the hand that presses them. */
interface Hand {
  canvas: {
    getByRole: (role: "combobox", options: { name: RegExp }) => HTMLElement;
  };
  userEvent: {
    click: (element: Element) => Promise<void>;
    wait: (ms: number) => Promise<void>;
  };
}
/** Longer than a popover takes to open and a list to settle. */
const SETTLED_MS = 500;
const SITUATION = /^Situation$/u;
const PICKED = "Two runs are going at once on different machines";

/** A situation picked from the list: the field holds it, its undo glyph after it. */
export const SituationPicked = {
  from: "LongSet",
  args: LongSet.args,
  play: async ({ canvas, userEvent }: Hand) => {
    // The list is portalled out of the frame: its rows are in the document.
    await userEvent.wait(SETTLED_MS);
    await userEvent.click(canvas.getByRole("combobox", { name: SITUATION }));
    await userEvent.wait(SETTLED_MS);
    const row = document.querySelector(
      `[data-slot="command-item"][data-value="${PICKED}"]`
    );
    if (row) {
      await userEvent.click(row);
    }
    await userEvent.wait(SETTLED_MS);
  },
};

/** The card closed from its button: the stage with its tools alone. */
export const Closed = { args: { open: false } };
