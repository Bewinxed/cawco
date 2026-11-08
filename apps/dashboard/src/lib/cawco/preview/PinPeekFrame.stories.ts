/**
 * A pin's peek (Component Story Format 3, live components): resting a mouse
 * on a comment's pill opens its thread's own card beside it, holding what it
 * stands on, his words and only the latest reply; a press on it opens the
 * whole thread, the last story. The pins are the design graph spec's own
 * (artifact design-graph-spec), their words as the hub keeps them. Each
 * frame is the pane's well at a desk's size with the pill where the page
 * drew it.
 */
import type { Pin } from "@cawco/core/comments/model";
import PinPeekFrame from "./PinPeekFrame.svelte";

/** Pin 1 on the design graph spec, as the hub keeps it: seven entries. */
const PIN_1 = {
  id: "11ea50ff-2a28-483b-a278-43ddda24d3f5",
  number: 1,
  kind: "comment",
  by: "person",
  at: "2026-10-31T18:23:26.384Z",
  sentAt: "2026-10-31T18:23:29.417Z",
  title: "Round 29's structure, plus the step slider",
  anchor: {
    selector: "#decision-structure",
    source: null,
    text: "Round 29's structure, plus the step slider",
  },
  elements: [],
  thread: [
    {
      id: "900efe6c",
      by: "person",
      text: "though this layout might need some streamlining, don't you think? go to first principels and walk through what the user is trying to do here /interface-craft ux",
      at: "2026-10-31T18:23:26.384Z",
    },
    {
      id: "70c3f3e2",
      by: "agent",
      text: "Agreed: it was judged piece by piece over 29 rounds, never as a whole. The advisor is now running a Design Critique of round 29 from first principles. It walks each thing you do there step by step: what you're trying to do, what you see, what you press, and what's in the way or on screen without earning its place. Each streamlining it finds comes back on this page as its own card, round 29 as it is beside the streamlined version, with the walkthrough above the cards so you can read why. The structure stays your pick: round 29 plus the slider.",
      at: "2026-10-31T18:23:41.589Z",
    },
    {
      id: "01255939",
      by: "person",
      text: "so after a whole god knows how many iterations of design the advisor had absolutely 0 complaints about this ui ?",
      at: "2026-11-01T09:07:55.933Z",
    },
    {
      id: "95275edc",
      by: "person",
      text: "can u check",
      at: "2026-11-01T09:08:03.283Z",
    },
    {
      id: "d4663fdc",
      by: "agent",
      text: "You're right, and that's on me. The last review only walked through the tasks and treated your earlier picks as finished. It never checked the screen itself at your level, so it missed what you found in seconds: cut-off tabs, icons squeezed in boxes, no way to step between components, a title bar against Apple's guidelines.\n\nI've started a fresh review. A new reviewer gets only the live screen, none of its history. It uses the screen at desk, wide and phone sizes, checks it against Apple's current guidelines, measures each problem, and lists them all, worst first, each with a picture and a fix. Each fix goes into the screen before you pick anything.",
      at: "2026-11-01T09:08:30.960Z",
    },
    {
      id: "737f4fce",
      by: "agent",
      text: "Yes. The fresh review is checking it now. When it is done, I will post the list of problems here, worst first, each with a picture.",
      at: "2026-11-01T09:08:35.689Z",
    },
    {
      id: "8e274242",
      by: "agent",
      text: "I stopped that review: you asked a question, and I started work you did not ask for. The answer: yes, the last advisor raised almost nothing. It only walked through the tasks and treated your earlier picks as finished. It did not check the screen itself, so it missed what you found.",
      at: "2026-11-01T09:09:09.790Z",
    },
  ],
} as unknown as Pin;

/** Pin 5 on the design graph spec, as the hub keeps it. */
const PIN_5 = {
  id: "406d9679-49a0-4213-bc5b-a9d0b34dd508",
  number: 5,
  kind: "comment",
  by: "person",
  at: "2026-11-01T09:02:25.612Z",
  sentAt: "2026-11-01T09:02:25.612Z",
  title: "2 One row Recommended",
  anchor: {
    selector: "#decision-head",
    source: null,
    text: "2 One row Recommended",
  },
  elements: [],
  thread: [
    {
      id: "cc5448b0",
      by: "person",
      text: "why not have <> buttons to switch between them without having to open the whole list? also no indiction at a glance how many components are there, also ur not following ios 27 HIG where this title bar is taking space to begin with, also the expadn button is not viewable to the eye cause it's within a container",
      at: "2026-11-01T09:02:25.612Z",
    },
    {
      id: "bebbe547",
      by: "agent",
      text: "Good points. A designer is building this option again with:\n- previous and next buttons to change component without opening the list;\n- a count, so you see how many components there are and which one you are on;\n- the top of the panel as Apple's current HIG says, read first, so it does not take a row of its own;\n- every button clearly visible, not small inside a box.\nThe phone version gets the same changes. I will put the new versions on this page when they are ready.",
      at: "2026-11-01T09:04:38.118Z",
    },
  ],
} as unknown as Pin;

/** Pin 6 on the design graph spec, as the hub keeps it. */
const PIN_6 = {
  id: "f629ad9d-7e60-4242-b5d0-4ecdf2a1fbf3",
  number: 6,
  kind: "comment",
  by: "person",
  at: "2026-11-01T09:11:08.541Z",
  sentAt: "2026-11-01T09:11:08.541Z",
  title: "81%",
  anchor: { selector: "#decision-head", source: null, text: "81%" },
  elements: [],
  thread: [
    {
      id: "92022cfe",
      by: "person",
      text: "when i click on any state, it zooms to 100%, this shouldn't happen",
      at: "2026-11-01T09:11:08.541Z",
    },
    {
      id: "49dee384",
      by: "agent",
      text: "Agreed, that is a bug. When you press a state, the zoom must stay as it is. The designer who is fixing the top of this panel fixes this too, in the base screen, so every version gets it.",
      at: "2026-11-01T09:11:21.442Z",
    },
    {
      id: "1e0c6f38",
      by: "person",
      text: "also clicking a card should morph the highlight from wehre it was to the new element, as i said a million times in our motion language guidelines",
      at: "2026-11-01T09:11:59.259Z",
    },
    {
      id: "d03d0121",
      by: "agent",
      text: "Agreed. When you press a card, the highlight will move from the old card to the new one, as your motion rules say. The same designer adds it to the base screen, so every version gets it.",
      at: "2026-11-01T09:12:10.058Z",
    },
  ],
} as unknown as Pin;

/** Pin 4 on the design graph spec, as the hub keeps it. */
const PIN_4 = {
  id: "8cd72508-687f-4548-a960-a6ad2840c726",
  number: 4,
  kind: "comment",
  by: "person",
  at: "2026-11-01T08:59:57.687Z",
  sentAt: "2026-11-01T08:59:57.687Z",
  title: "Routine row",
  anchor: { selector: "#decision-head", source: null, text: "Routine row" },
  elements: [],
  thread: [
    {
      id: "16ed31a3",
      by: "person",
      text: "why are the buttons have missing bottoms? also the icons for zoom in/out is too small cause it's within a container",
      at: "2026-11-01T08:59:57.687Z",
    },
    {
      id: "5a9de3b2",
      by: "agent",
      text: "You're right: the tab buttons are cut off at the bottom, and the zoom icons are too small inside their box. A designer is fixing both in the base screen now. The fix shows in every version on this page.",
      at: "2026-11-01T09:04:37.910Z",
    },
  ],
} as unknown as Pin;

/** The well at a desk's width, 1440 by 800, and the pill near its top-left. */
const DESK = {
  width: 1440,
  height: 800,
  mark: { x: 154, y: 182, w: 28, h: 28 },
};

export default {
  title: "Comments/A pin's peek",
  component: PinPeekFrame,
  args: { ...DESK, peek: true, pin: PIN_5 },
  parameters: { viewport: 1440 },
};

/** Resting on pin 5: his words and the agent's reply, beside the pill. */
export const Peek = {};

/** Pin 1, seven entries long: his first words and only the latest reply. */
export const LongThread = { args: { pin: PIN_1 } };

/** Pin 6, two of his and two replies: his first words and the last reply. */
export const TwoRounds = { args: { pin: PIN_6 } };

/** Pin 4 near the well's right edge: the peek stands on the pill's other side. */
export const AtTheEdge = {
  args: { pin: PIN_4, mark: { x: 1340, y: 420, w: 28, h: 28 } },
};

/** In a pane 680 wide: the peek keeps the card's reading width. */
export const NarrowPane = {
  args: { width: 680, height: 640 },
  parameters: { viewport: 680 },
};

/** Pressed: the whole thread opens where the peek stood, every entry, its actions and the reply. */
export const Opened = { args: { peek: false } };
