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

/** One thing on the stage, by the page's id for it: what a row names and rings. */
let things = 0;
const thing = (): string => {
  things += 1;
  return `t${things}`;
};

/** The house ease-out, as the engine reports it on the stage. */
const EASE_OUT = browser ? ease("--ease-out") : "";
/** The house's drawer curve: the failure line's curve changed to it is a change from the ease-out it was written with. */
const EASE_DRAWER = browser ? ease("--ease-drawer") : "";
let ids = 0;
/** A clip as `clipOf` reads one off the stage. */
const clip = (
  of: string,
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
    frameCurve: null,
    group: null,
    iterations: 1,
    legs: [],
    repeat: "once",
    values: [],
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
    "--press-by",
    24,
    180,
    "--duration-morph"
  ),
  clip(
    button,
    "Button “Create routine”",
    "fades",
    "opacity",
    24,
    180,
    "--duration-morph"
  ),
  clip(
    button,
    "Button “Create routine”",
    "changes",
    "--press-by",
    626,
    180,
    "--duration-morph"
  ),
  clip(
    button,
    "Button “Create routine”",
    "fades",
    "opacity",
    626,
    180,
    "--duration-morph"
  ),
  clip(
    failure,
    "Form failure",
    "unfolds",
    "height, opacity",
    626,
    260,
    "--duration-pop"
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

/** The failure line given the house drawer curve in place of the ease-out it was written with. */
const curved = (): Clip[] => {
  const line = tracksOf(formMove).find((row) => row.thing === failure);
  if (!line) {
    return formMove;
  }
  const by = new Map(
    reshape(line, EASE_DRAWER, null).map((one) => [one.id, one])
  );
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
  clip(spring, "Sheet", "fades", "opacity", 0, 160, "--duration-exit"),
];

const meter = thing();
/** A run's budget filling over 30 minutes. */
const longMove: Clip[] = [
  clip(meter, "Budget meter", "widens", "width", 0, 1_800_000, null, {
    easing: "linear",
    curve: "Linear",
  }),
];

const heading = thing();
const card = thing();
const badge = thing();
/** A mockup's own choreography, written in its play: a header of two under the agent's group, a card of two legs, a badge going back and forth. */
const authoredMove: Clip[] = [
  clip(heading, "Title", "moves", "transform", 0, 260, "--duration-pop", {
    group: "Header",
    values: [{ property: "transform", from: "translateY(24px)", to: "none" }],
  }),
  clip(heading, "Title", "fades", "opacity", 0, 260, "--duration-pop", {
    group: "Header",
    values: [{ property: "opacity", from: "0", to: "1" }],
  }),
  clip(card, "Card", "scales", "scale", 120, 400, null, {
    legs: [0.4],
    values: [{ property: "scale", from: "0.9", to: "1" }],
  }),
  clip(badge, "Badge", "fades", "opacity", 200, 300, "--duration-glide", {
    iterations: 3,
    values: [{ property: "opacity", from: "0.4", to: "1" }],
  }),
];
const authored = (): Clip[] =>
  authoredMove.map((one) =>
    one.thing === badge ? { ...one, repeat: "mirror", was: one } : one
  );

const noop = () => undefined;

export default {
  title: "Design graph/Animation",
  component: MoveFace,
  args: {
    move: ready(formMove),
    playhead: 886,
    playing: false,
    repeat: false,
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
    onreplay: noop,
    onrepeat: noop,
    onloopfrom: noop,
    onseek: noop,
    onseekend: noop,
    onretime: noop,
    onreset: noop,
    onchoose: noop,
    onfocusthing: noop,
    onlight: noop,
    onretry: noop,
    onundo: noop,
    lang: undefined,
  },
  // The room beside a desk's stage; the canvas's widths draw it at 800 beside a 2529 stage, and in the drawer at 680 and 390.
  parameters: { viewport: 400 },
};

/** At rest: the move into "Hub didn't answer" played, its playhead on its end over the kept state. */
export const AtRest = {};

/** A row chosen: Form failure's words in the Selected wash, its bar ringed, its three settings under it. */
export const Selected = { args: { selected: "5" } };

/** A row with two runs opened: Button “Create routine” as one row per animation, each named by its property and its run. */
export const TwoRuns = { args: { selected: "1" } };

/** One animation of a two-run row chosen: its own settings under it. */
export const TwoRunsOneChosen = {
  args: { selected: "1/1/--press-by" },
};

/** Playing: the playhead 700 ms in, Pause in Play's place. */
export const Playing = { args: { playing: true, playhead: 700 } };

/** Playing on repeat: Repeat pressed, the move going round again. */
export const OnRepeat = {
  args: { playing: true, playhead: 300, repeat: true },
};

/** Held mid-way: a scrub let go 412 ms in, the move held on that frame. */
export const HeldMidway = { args: { playhead: 412 } };

/** The failure line made 400 ms long and set 74 ms later by hand: each edited value marked on its chip, the original outlined, Reset in the head. */
export const Edited = { args: { move: ready(edited()), selected: "5" } };

/** The failure line's curve changed from Ease-out to the drawer curve: its Curve chip followed by the undo glyph, its row's too. */
export const CurveChanged = {
  args: { move: ready(curved()), selected: "5" },
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

/** A mockup's own choreography: the agent's Header group over its rows, the card's two legs marked on its bar, the badge going back and forth to the lane's end; the card chosen, its Values and Repeats chips under it. */
export const Authored = {
  args: {
    move: ready(authored(), "Shown"),
    selected: String(authoredMove[2]?.id),
  },
};

/** Repeat on, going round again from 300 ms: its mark on the ruler. */
export const RepeatFrom = {
  args: { playing: true, playhead: 500, repeat: true, loopFrom: 300 },
};
