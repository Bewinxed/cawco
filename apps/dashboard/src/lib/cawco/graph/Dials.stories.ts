/**
 * The Dials face's own states (Component Story Format 3, live components),
 * fed the dials an agent puts on the routine form: one of each kind, as
 * the page reads each one's value off the drawing. Each story is one way
 * the face stands, at the room's least width beside a 1440 stage (400) or
 * in the phone's drawer (390). The number dial is drawn in both of the
 * forms the owner picks between (tsk-193, tsk-198).
 */

import {
  ROUTINE_DIALS,
  ROUTINE_DIALS_GROUPED,
  ROUTINE_WRITTEN,
} from "./bench/fixture";
import Dials from "./Dials.svelte";

const nothing = () => undefined;

export default {
  title: "Design graph/Dials",
  component: Dials,
  args: {
    dials: ROUTINE_DIALS,
    written: ROUTINE_WRITTEN,
    values: {},
    component: "Routine form",
    lang: "en",
    onchange: nothing,
    onreset: nothing,
    onversion: nothing,
  },
};

/** One of each kind as written: the number dial a pill, its knob carrying its figure. */
export const AsWritten = { parameters: { viewport: 400 } };

/** Two turned: the radius dragged to 4 px and the colour picked; each changed value in the edit's ink with its way back, and the head's two versions, Copy values and Reset all. */
export const Turned = {
  args: { values: { radius: 4, ink: "#1f5f7a" } },
  parameters: { viewport: 400 },
};

/** The same, the number dial a field, its figure at its end and its fill to its value. */
export const TurnedField = {
  args: { values: { radius: 4, ink: "#1f5f7a" }, numberForm: "field" },
  parameters: { viewport: 400 },
};

export const TurnedFieldPhone = {
  args: { values: { radius: 4, ink: "#1f5f7a" }, numberForm: "field" },
  parameters: { viewport: 390 },
};

/** The same, the number dial a slider with its figure beside it. */
export const TurnedSlider = {
  args: { values: { radius: 4, ink: "#1f5f7a" }, numberForm: "slider" },
  parameters: { viewport: 400 },
};

/** As written shown while two are turned: the agent's values, read only. */
export const AsWrittenShown = {
  args: { values: { radius: 4, ink: "#1f5f7a" }, version: "written" },
  parameters: { viewport: 400 },
};

/** Reset all just pressed: Undo reset in its place. */
export const ResetAll = {
  args: { undoable: true },
  parameters: { viewport: 400 },
};

/** Under the agent's headings, as DialKit's folders were. */
export const UnderHeadings = {
  args: { dials: ROUTINE_DIALS_GROUPED, values: { radius: 4 } },
  parameters: { viewport: 400 },
};

/** In the phone's drawer: each name over its control. */
export const TurnedPhone = {
  args: { values: { radius: 4, ink: "#1f5f7a" } },
  parameters: { viewport: 390 },
};

export const TurnedSliderPhone = {
  args: { values: { radius: 4, ink: "#1f5f7a" }, numberForm: "slider" },
  parameters: { viewport: 390 },
};

/** The hardening case's dials and values. */
const HARDENED = {
  dials: [
    ...ROUTINE_DIALS,
    {
      kind: "number",
      name: "pace",
      label:
        "Delay before the failure line unfolds after Create routine is pressed",
      unit: "ms",
      target: { cssVar: "--pace" },
    },
    {
      kind: "text",
      name: "cta",
      label: "Button words",
      target: { arg: "cta" },
    },
    {
      kind: "action",
      name: "replay",
      label: "Play the failure again",
      target: { arg: "replay" },
    },
  ],
  written: {
    ...ROUTINE_WRITTEN,
    pace: 1_250_000,
    cta: "Create routine",
    replay: 0,
  },
  values: { pace: 2_400_000 },
};

/** The longest name an agent writes, a figure in the millions in the knob, a text dial and an action. */
export const Hardened = {
  args: HARDENED,
  parameters: { viewport: 400 },
};

export const HardenedPhone = {
  args: HARDENED,
  parameters: { viewport: 390 },
};
