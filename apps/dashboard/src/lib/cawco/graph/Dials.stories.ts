/**
 * The Controls face's own states (Component Story Format 3, live
 * components), fed the controls an agent puts on the routine form under its
 * two headings: one of each kind, as the page reads each one's value off the
 * drawing. Each story is one way the face stands in the room (dials-frame),
 * at the room's least width beside a 1440 stage (400) or at the phone
 * drawer's (354 inside a 390 screen).
 */

import {
  ROUTINE_DIALS,
  ROUTINE_DIALS_GROUPED,
  ROUTINE_WRITTEN,
} from "./bench/fixture";
import DialsFrame from "./dials-frame.svelte";

const nothing = () => undefined;
const ONE_TURNED = { radius: 4 };
/** The screen a 400px room and its page's gutters stand in. */
const DESK = 436;
/** The phone drawer's body, its inset each side of a 390 screen. */
const PHONE = { width: 354 };

export default {
  title: "Design graph/Controls",
  component: DialsFrame,
  args: {
    width: 400,
    height: 600,
    dials: ROUTINE_DIALS_GROUPED,
    written: ROUTINE_WRITTEN,
    values: {},
    lang: "en",
    onchange: nothing,
    onreset: nothing,
  },
};

/** One turned: the corner radius dragged to 4 px, its undo glyph after it in the edit's ink, Reset all under the rows. */
export const OneChanged = {
  args: { values: ONE_TURNED },
  parameters: { viewport: DESK },
};

/** Every control at the agent's value: no undo glyph, nothing under the rows. */
export const AgentValues = { parameters: { viewport: DESK } };

/** The field colour's picker open under its field. */
export const PickerOpen = {
  args: { values: ONE_TURNED, open: "fill" },
  parameters: { viewport: DESK },
};

/** The corner radius under a drag: its edge steps up, its fill follows the hand. */
export const Dragging = {
  args: {
    values: { radius: 14 },
    held: { name: "radius", as: "dragging" },
  },
  parameters: { viewport: DESK },
};

/** A figure typed into the corner radius, not yet kept. */
export const Typing = {
  args: {
    values: ONE_TURNED,
    held: { name: "radius", as: "typing", text: "12" },
  },
  parameters: { viewport: DESK },
};

/** The field height's list open. */
export const ListOpen = {
  args: { values: ONE_TURNED, open: "height" },
  parameters: { viewport: DESK },
};

/** Every control turned. */
export const AllChanged = {
  args: {
    values: { radius: 4, height: "44px", fill: "#e8f1ee", attempted: true },
  },
  parameters: { viewport: DESK },
};

/** Every control turned, in the room beside a 1440 stage. */
const EVERY_TURNED = {
  width: 690,
  height: 500,
  values: { radius: 4, height: "44px", fill: "#e8f1ee", attempted: true },
};

/** Every control turned at 1440: each changed row's undo glyph in the edit's ink (his pick, graph-dials-questions `coral`), Reset all in ink. */
export const CoralEach = {
  args: EVERY_TURNED,
  parameters: { viewport: 1440 },
};

/** Reset all just pressed: Undo reset in its place. */
export const ResetAll = {
  args: { undoable: true },
  parameters: { viewport: DESK },
};

/** Under no heading: one list of rows. */
export const NoHeadings = {
  args: { dials: ROUTINE_DIALS, values: ONE_TURNED },
  parameters: { viewport: DESK },
};

/** In the phone's drawer: each name beside its control. */
export const OneChangedPhone = {
  args: { ...PHONE, values: ONE_TURNED },
  parameters: { viewport: 390 },
};

/** The field colour's picker open in the phone's drawer. */
export const PickerOpenPhone = {
  args: { ...PHONE, values: ONE_TURNED, open: "fill" },
  parameters: { viewport: 390 },
};

/** The field height's list open in the phone's drawer. */
export const ListOpenPhone = {
  args: { ...PHONE, values: ONE_TURNED, open: "height" },
  parameters: { viewport: 390 },
};

/** The hardening case's controls and values. */
const HARDENED = {
  dials: [
    ...ROUTINE_DIALS_GROUPED,
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

/** The longest name an agent writes, a figure in the millions, a line of words and an action. */
export const Hardened = {
  args: HARDENED,
  parameters: { viewport: DESK },
};

/** The hardening case in the phone's drawer. */
export const HardenedPhone = {
  args: { ...HARDENED, ...PHONE },
  parameters: { viewport: 390 },
};
