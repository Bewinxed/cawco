/**
 * The Animation face's own states (Component Story Format 3, live
 * components), fed the routine form's move into "Hub didn't answer" as the
 * engine reads it off the stage: the button's label swapping twice and the
 * failure line unfolding. Each story is one way the face stands, at the
 * room's own width: 400 beside a 1440 stage, 800 beside a 2529 one, the
 * drawer's 390 and 680.
 */

import { ease } from "#lib/cawco/motion/curves.svelte.js";
import { browser } from "$app/env";
import type { MoveState } from "./MoveFace.svelte";
import MoveFace from "./MoveFace.svelte";
import { type Clip, reshape, retimeRun, tracksOf } from "./motion";

/** One thing on the stage: an element a row names and rings. */
const thing = (): Element | null =>
  typeof document === "undefined" ? null : document.createElement("span");

/** The house ease-out, as the engine reports it on the stage. */
const EASE_OUT = browser ? ease("--ease-out") : "";
let ids = 0;
/** A clip as `clipOf` reads one off the stage. */
const clip = (
  of: Element | null,
  element: string,
  how: string,
  property: string,
  start: number,
  duration: number,
  token: string | null,
  extra: Partial<Clip> = {}
): Clip => {
  ids += 1;
  return {
    id: `${ids}`,
    target: of,
    thing: of,
    spring: null,
    frames: [],
    element,
    property,
    how,
    start,
    delay: 0,
    duration,
    easing: EASE_OUT,
    framed: false,
    curve: "Ease-out",
    token,
    adHoc: token === null,
    was: null,
    ...extra,
  };
};

const button = thing();
const failure = thing();
/** The routine form's move into "Hub didn't answer", as it played. */
const formMove: Clip[] = [
  clip(
    button,
    "Button “Create routine”",
    "changes",
    "--swap-away",
    24,
    180,
    "--dur-morph"
  ),
  clip(
    button,
    "Button “Create routine”",
    "fades",
    "opacity",
    24,
    180,
    "--dur-morph"
  ),
  clip(
    button,
    "Button “Create routine”",
    "changes",
    "--swap-away",
    626,
    180,
    "--dur-morph"
  ),
  clip(
    button,
    "Button “Create routine”",
    "fades",
    "opacity",
    626,
    180,
    "--dur-morph"
  ),
  clip(
    failure,
    "Form failure",
    "unfolds",
    "height, opacity",
    626,
    260,
    "--dur-pop"
  ),
];
const ready = (clips: Clip[], to = "Hub didn't answer"): MoveState => ({
  kind: "ready",
  from: "Filled in",
  to,
  clips,
});

/** The failure line made 400 ms long and set 74 ms later by hand: its length and its delay edited. */
const edited = (): Clip[] => {
  const line = tracksOf(formMove).find((row) => row.thing === failure);
  if (!line) {
    return formMove;
  }
  const [run] = line.runs;
  if (!run) {
    return formMove;
  }
  const by = new Map(retimeRun(run, 700, 1100).map((one) => [one.id, one]));
  return formMove.map((one) => by.get(one.id) ?? one);
};

/** The failure line given the house ease-out in place of the curve its frames drew. */
const curved = (): Clip[] => {
  const line = tracksOf(formMove).find((row) => row.thing === failure);
  if (!line) {
    return formMove;
  }
  const by = new Map(reshape(line, EASE_OUT, null).map((one) => [one.id, one]));
  return formMove.map((one) => by.get(one.id) ?? one);
};

const spring = thing();
/** A sheet settling on the house spring: its true end where it settles. */
const springMove: Clip[] = [
  clip(spring, "Sheet", "moves", "transform", 0, 412, null, {
    spring: { mass: 1, stiffness: 246.7, damping: 31.4, bounce: 0 },
    curve: "Spring",
    easing: "linear(0, 0.24, 0.55, 0.78, 0.91, 0.97, 0.99, 1)",
  }),
  clip(spring, "Sheet", "fades", "opacity", 0, 160, "--dur-exit"),
];

const meter = thing();
/** A run's budget filling over 30 minutes. */
const longMove: Clip[] = [
  clip(meter, "Budget meter", "widens", "width", 0, 1_800_000, null, {
    easing: "linear",
    curve: "Linear",
  }),
];

const noop = () => undefined;

export default {
  title: "Design graph/Animation",
  component: MoveFace,
  args: {
    move: ready(formMove),
    playhead: 0,
    playing: false,
    repeat: false,
    version: "yours",
    choices: [
      {
        key: "filled->hub",
        from: "filled",
        to: "hub",
        name: "Filled in → Hub didn't answer",
      },
      {
        key: "open->filled",
        from: "open",
        to: "filled",
        name: "Just opened → Filled in",
      },
    ],
    chosen: "filled->hub",
    onplay: noop,
    onpause: noop,
    onrepeat: noop,
    onseek: noop,
    onseekend: noop,
    onretime: noop,
    onreset: noop,
    onversion: noop,
    onchoose: noop,
    onfocusthing: noop,
    onlight: noop,
    onretry: noop,
    lang: undefined,
  },
  parameters: { viewport: 400 },
};

/** At rest beside a 1440 stage: the move into "Hub didn't answer", the playhead at 0. */
export const AtRest = {};

/** A row chosen: Form failure's words in the Selected wash, its bar ringed, its three settings under it. */
export const Selected = { args: { selected: "5" } };

/** A row with two runs opened: Button “Create routine” as one row per animation, each named by its property and its run. */
export const TwoRuns = { args: { opened: { "1": true } } };

/** One animation of a two-run row chosen: its own settings under it. */
export const TwoRunsOneChosen = {
  args: { opened: { "1": true }, selected: "1/3" },
};

/** At rest beside a 2529 stage: the room at 800. */
export const Wide = { parameters: { viewport: 800 } };

/** Playing: the playhead 700 ms in, Pause in Play's place. */
export const Playing = { args: { playing: true, playhead: 700 } };

/** Playing on repeat: Repeat pressed, the move going round again. */
export const OnRepeat = {
  args: { playing: true, playhead: 300, repeat: true },
};

/** Held mid-way: a scrub let go 412 ms in, the move held on that frame. */
export const HeldMidway = { args: { playhead: 412 } };

/** Scrubbed to the move's end: the line on the end's edge. */
export const AtTheEnd = { args: { playhead: 886 } };

/** The failure line made 400 ms long and set 74 ms later by hand: each edited value marked on its chip, the original outlined, Reset in the head. */
export const Edited = { args: { move: ready(edited()), selected: "5" } };

/** The failure line's curve changed to Ease-out: its Curve chip carrying the restore glyph, its row's length figure carrying its own. */
export const CurveChanged = {
  args: { move: ready(curved()), selected: "5" },
};

/** The agent's timing, As written, beside his: the same edits, the face showing the agent's version read-only. */
export const AsWritten = {
  args: { move: ready(edited()), version: "written" },
};

/** A spring: its length a figure with `~`, where it settles. */
export const Spring = { args: { move: ready(springMove, "Sheet open") } };

/** Nothing animates into the state: the title is the menu of moves. */
export const NoMove = {
  args: { move: { kind: "none", state: "Saved" }, chosen: null },
};

/** The move read off the stage. */
export const Reading = {
  args: {
    move: { kind: "reading", from: "Filled in", to: "Hub didn't answer" },
  },
};

/** The move's play threw: why, and Try again. */
export const Failed = {
  args: {
    move: {
      kind: "failed",
      from: "Filled in",
      to: "Hub didn't answer",
      why: "the form has no Create routine button any more.",
    },
  },
};

/** A move of 30 minutes: 1,800,000 ms on the ruler, its marks thinned. */
export const ThirtyMinutes = {
  args: { move: ready(longMove, "Running"), playhead: 600_000 },
};

/** The same in German: 1.800.000. */
export const German = {
  args: { move: ready(longMove, "Running"), playhead: 600_000, lang: "de-DE" },
};

/** On a phone, in the drawer at 390. */
export const Phone = { parameters: { viewport: 390 } };

/** In the drawer at 680. */
export const Drawer = { parameters: { viewport: 680 } };
