/**
 * The Dials card with the state's props folded in (the owner's pick,
 * 2026-11-10: Inspect stops being its own panel): the agent's dials, then
 * the props of the state on the stage as the same rows, under the
 * component's name. Each story is a situation he meets on the card as the
 * artifact panel raises it over the drawing's foot.
 */

import {
  DELEGATE_ARGS,
  DELEGATE_DIALS,
  DELEGATE_LONGEST,
  DELEGATE_ROW,
  DELEGATE_WRITTEN,
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
