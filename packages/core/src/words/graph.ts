/**
 * What the design graph says (dashboard `cawco/graph`): the surface where
 * the owner judges a component an agent built, live on a stage in each of
 * its states, with the moves between them and their timing. Plain words,
 * DESIGN.md's Voice: a state is named as the product talks of it.
 */
import { andList } from "./helpers";

/**
 * A number as the page's language writes it (dashboard graph/figures.ts
 * `figureOf`, `Intl.NumberFormat` in the page's `lang`): every figure these
 * words say is one, so none says a raw number ("1800000 ms").
 */
export type Figure = string & { readonly figure: true };

export const graphWords = {
  /** The room's faces, its switch's segments. */
  statesFace: "States",
  wholeSet: "Map",
  moveFace: "Animation",
  dialsFace: "Dials",
  /** The panel's own name, whichever face it shows, from the faces it has: the room's aside and the phone drawer's title ("States, map and animation"). */
  room: (faces: readonly string[]) =>
    andList(faces.map((face, at) => (at === 0 ? face : face.toLowerCase()))),
  /** Where the journey stands on the component's path: "8 of 11". */
  position: (at: Figure, of: Figure) => `${at} of ${of}`,
  previous: "Previous state",
  next: "Next state",
  /**
   * The room's own controls, each naming the room as its title does (`room`,
   * its faces' names: "the states"), never a "panel": its one Close; the
   * bar's symbol that brings it back while it is put away.
   */
  closeRoom: (room: string) => `Close the ${room.toLowerCase()}`,
  openRoom: (room: string) => `Show the ${room.toLowerCase()}`,
  /**
   * The phone drawer's grabber, named for what its press does at the stop
   * the drawer stands at (`more`: below its last stop, so the press raises
   * it; at its last, the press takes it back to its head), as a sheet's
   * grabber tells VoiceOver expand or collapse.
   */
  nextStop: (room: string, more: boolean) =>
    `Show ${more ? "more" : "less"} of the ${room.toLowerCase()}`,
  /** The component in front, when the ask names several: the switch's name. */
  components: "Component",
  /** A state the states file tags as a failure: its glyph's name and tooltip in the whole set. */
  errorState: "Error state",
  /** A state that is not its machine's start, with no move into it: its glyph's tooltip. */
  nothingReaches: "Unreachable: no arrow leads to this state",
  /** A state that is not the end of its path, with no move out of it: its glyph's tooltip. */
  nothingLeaves: "Dead end: no arrow leads out of this state",
  /** What a person does to reach a state, on its card in the whole set ("Try again"). */
  arrivesBy: (acts: string[]) => acts.join(" or "),
  /** The whole set's canvas, its name for a screen reader. */
  wholeMap: (component: string) => `Map of ${component}'s states`,
  /** A state's variants, the toggle group's name for a screen reader. */
  variants: (state: string) => `Variants of ${state}`,
  /** A variant's state, said before its own name to a reader and a pin ("Failed save: Longest names"). */
  variantOf: (state: string) => `${state}: `,
  /** A states file with one state and no machine, said once. */
  oneState: "This component has one state.",

  /** Compare: a switch that stays on until he turns it off. */
  compare: "Compare with previous state",
  comparedWith: (state: string) => `Compared with ${state}`,
  /** Compare's flip: the compared state shown in the kept one's place; its tooltip, and its words while shown. */
  showCompared: (state: string) => `Show ${state} in its place`,
  showingCompared: (state: string) => `Showing ${state}`,
  /** One line per difference. */
  cameIn: (element: string) => `${element} added`,
  went: (element: string) => `${element} removed`,
  /**
   * A value that changed, its two values in the order the drawings stand
   * side by side (the kept state's, then the compared one's), the arrow
   * pointing the way it changed: from the compared state into the kept
   * one, as "added" and "removed" read. An empty side is said in words,
   * never an arrow to nothing.
   */
  changed: (element: string, kept: string, compared: string) => {
    if (compared === "") {
      return `${element} filled in: ${kept}`;
    }
    return kept === ""
      ? `${element} emptied (was ${compared})`
      : `${element}: ${kept} ← ${compared}`;
  },
  changedPlain: (element: string) => `${element} changed`,
  sameAs: (state: string) => `No difference from ${state}.`,
  /** The list of differences at the stage's head, its name for a screen reader. */
  differences: "Differences",
  /** The count that leads the differences, a press that shows or folds their lines. */
  differenceCount: (n: number, figure: Figure) =>
    n === 1 ? `${figure} difference` : `${figure} differences`,

  /** The move into the kept state. */
  move: (from: string, to: string) => `${from} → ${to}`,
  /** The map's fit tool: it frames the set at a size its words read at, on the chosen state when the whole is larger. */
  fitReadable: "Fit at a readable size",
  /** A move's arrow on the map, for a reader: its two states and the act that makes it. */
  moveEdge: (from: string, to: string, act: string | null) =>
    act ? `${from} → ${to}, ${act}` : `${from} → ${to}`,
  /** A state no animated move leads into. */
  noMove: (state: string) => `No move into ${state}.`,
  /** The face's title while no move is on it: the menu of moves. */
  chooseMove: "Choose a move",
  /** The title's menu, for a reader. */
  moves: "Moves",
  play: "Play",
  pause: "Pause",
  /** Play goes round again from its start each time the move ends. */
  repeat: "Repeat",
  /** The playhead's time over the move's length, tabular figures; a narrow corner breaks it after the slash, never between a figure and its unit. */
  playhead: (at: Figure, of: Figure) => `${at}\u00a0/ ${of}\u00a0ms`,
  scrub: "Time",
  /** A clip's two handles on its bar. */
  clipStarts: (clip: string) => `Start of ${clip}`,
  clipEnds: (clip: string) => `End of ${clip}`,
  /** While the move is read off the stage. */
  reading: "Reading the move's timing…",
  /** The move played but the engine saw nothing animate. */
  nothingAnimated: (from: string, to: string) =>
    `Nothing animates from ${from} to ${to}.`,
  /** The move's play threw. */
  moveFailed: (why: string) => `The animation didn't play: ${why}`,

  /** How a clip moves its element, by the property it animates; any other property is named as it is. */
  how: {
    height: "unfolds",
    "block-size": "unfolds",
    transform: "moves",
    translate: "moves",
    scale: "scales",
    rotate: "turns",
    width: "widens",
    "inline-size": "widens",
    "clip-path": "opens",
    opacity: "fades",
    filter: "blurs",
    "background-color": "tints",
    color: "tints",
    "border-color": "tints",
    "box-shadow": "lifts",
  } as Record<string, string>,
  /** How a clip moves when its property is none of those (a custom property's). */
  changes: "changes",
  /** A curve named by its token. */
  curves: {
    "--ease-out": "Ease-out",
    "--ease-in-out": "Ease-in-out",
    "--ease-drawer": "Drawer",
    "--ease-crossfade": "Crossfade",
    "--ease-goo": "Goo",
    linear: "Linear",
  } as Record<string, string>,
  /** The design system's durations, by token: the lengths a drag settles on. */
  durations: {
    "--dur-control": "Control",
    "--dur-menu": "Menu",
    "--dur-toggle": "Toggle",
    "--dur-exit": "Exit",
    "--dur-morph": "Morph",
    "--dur-fade": "Fade",
    "--dur-grow-exit": "Grow exit",
    "--dur-pop": "Pop",
    "--dur-panel": "Panel",
    "--dur-glide": "Glide",
    "--dur-grow": "Grow",
    "--dur-lift": "Lift",
    "--dur-settle": "Settle",
  } as Record<string, string>,
  /** The curve the agent wrote, when it is none of the design system's: offered to go back to. */
  agentsCurve: "Agent's curve",
  /** A curve he drew by its two control points: his own, off the design system's. */
  yourCurve: "Your curve",
  /** A clip's element when nothing names it. */
  element: "Element",

  /** A row of the move, one per thing that moves, named as a person says it: "Form failure unfolds". */
  clipName: (element: string, how: string) => `${element} ${how}`,
  /** A clip's three settings, each a chip under its selected row. */
  length: "Length",
  delay: "Delay",
  curve: "Curve",
  /** A length typed by hand, off the design system's durations: his, as the curve he bends is "Your curve". */
  ownLength: "Your length",
  /** The delay's steppers. */
  earlier: "Earlier",
  later: "Later",
  spring: "Spring",
  bounce: "Bounce",
  ms: (value: Figure) => `${value} ms`,
  /** A length's unit, beside its figure in a field. */
  msUnit: "ms",
  /** A value he changed carries the restore glyph; its name and tooltip say what it goes back to. */
  resetLength: (ms: Figure) => `Reset length to ${ms} ms`,
  resetCurve: (curve: string) => `Reset curve to ${curve}`,
  resetDelay: (ms: Figure) => `Reset delay to ${ms} ms`,
  /** A changed row's restore glyph: every value of that row back. */
  resetRow: (row: string) => `Reset ${row}`,
  /** Every value of every row back: its visible words, and what a reader hears. */
  resetAll: "Reset all",
  resetAllSaid: "Reset all edits",
  /** The two whole versions of the move's timing, once he changed any. */
  versions: "Timing",
  written: "As written",
  yours: "Yours",
  /** How many animations his version changes, beside Yours. */
  changedCount: (n: Figure) => `${n} changed`,

  /** A row with several animations, opened into one row each. */
  showClips: "Show its animations",
  hideClips: "Hide its animations",
  /** A spring row: its length's figure; a spring has no set length, so its figure is when it settles. */
  springFigure: (ms: Figure) => `~${ms} ms`,
  /** A row whose animations run for different lengths: the shortest and the longest. */
  lengthRange: (low: Figure, high: Figure) => `${low}–${high}\u00a0ms`,
  /** One run of a row that runs more than once: its bar's name for a reader. */
  runOf: (clip: string, at: number, of: number) =>
    `${clip}, run ${at} of ${of}`,
  /** What an animation changes, by its CSS property, for the rows under a row; any other is said from its own name. */
  properties: {
    opacity: "Opacity",
    transform: "Position",
    translate: "Position",
    scale: "Size",
    rotate: "Turn",
    height: "Height",
    "block-size": "Height",
    width: "Width",
    "inline-size": "Width",
    "clip-path": "Reveal",
    filter: "Blur",
    "background-color": "Fill",
    color: "Text colour",
    "border-color": "Edge colour",
    "box-shadow": "Shadow",
  } as Record<string, string>,
  /** The As written view, under its rows: its rows take no press, and the way on is Yours. */
  readOnly: "Switch to Yours to change the timing.",
  /** A row under a row that moves several parts of its thing at once (a morphed text's letters): how many. */
  partsCount: (n: number) => `${n} parts`,
  /** A drawn curve's two handles, for a reader. */
  curvePoint: (n: number) => `Control point ${n}`,
  /** What each bar's colour means, under the rows: the kinds of change it shows. */
  kindsKey: "Bar colours",
  kinds: {
    size: "Size",
    move: "Position",
    fade: "Opacity",
    tint: "Colour",
    effect: "Effect",
    other: "Other",
  } as Record<string, string>,
  /** Reset all taken back, while nothing has changed since. */
  undoReset: "Undo reset",
  /** With reduced motion on, Play lands the move at its end without playing it: said beside the time. */
  motionReduced: "Reduced motion: lands without playing",
  /** An animation's row under its row, when its thing runs more than once: which run it is in. */
  runAt: (at: number) => `run ${at}`,
  /** A run's bar's tooltip: its name and where it runs. */
  runSpan: (run: string, from: Figure, to: Figure) =>
    `${run}: ${from}–${to} ms`,

  /** A list state's record sets, each a variant. */
  recordsOne: "One record",
  recordsMany: (n: Figure) => `${n} records`,
  /** The many records of a list the states file builds in code, its length unread until the page cuts it. */
  recordsSome: "Many records",
  recordsLongest: "Longest names",

  /** The stage's view. */
  stageView: "View options",
  width: "Width",
  ownWidth: (px: Figure) => `Component's own width, ${px}`,
  /** A listed width that is also the component's own. */
  ownListed: (device: string, px: Figure) =>
    `${device}, ${px}, the component's own width`,
  phone: "Phone",
  tablet: "Tablet",
  desk: "Desktop",
  widthOf: (device: string, px: Figure) => `${device}, ${px}`,
  scheme: "Appearance",
  light: "Light",
  dark: "Dark",
  reduceMotion: "Reduce motion",
  /** The view card's switch: a width wider than the stage drawn 1:1 (Apple's Actual Size), not scaled to fit. */
  actualSize: "Actual size",
  /** A phone twin's name (stage-graph.ts `shownName`): its state's, the width a qualifier after a comma, so "Hub didn't answer" stays whole. */
  onAPhone: (state: string) => `${state}, on a phone`,
  /** Beside the state's name while the stage draws it scaled down to fit: how much. */
  scaledTo: (percent: Figure) => `Scaled to ${percent}%`,
  mounting: (name: string) => `Loading ${name}…`,
  /** The component failed to mount: what happened, why, what to do, what next. */
  mountFailed: (name: string, state: string) =>
    `${name} didn't load at ${state}.`,
  tryAgain: "Try again",
  /** The hub's link down: the stage keeps its last drawing. */
  stale: "Not live: the hub can't be reached. This is the last view it sent.",

  /**
   * The agent's dials (its canvas spec's `dials`): the values it lets the
   * person tune on the drawing, each a row of the Dials face.
   */
  dials: {
    /** The two whole sets of values once he changed any, as the move's timing has. */
    versions: "Values",
    /** A changed dial's restore glyph: what it goes back to. */
    reset: (dial: string, value: string) => `Reset ${dial} to ${value}`,
    resetAllSaid: "Reset all values",
    /** A colour dial's swatch: the platform's picker. */
    pick: (dial: string) => `Pick ${dial}`,
    /** A colour typed that the browser reads as none: under its field until it is one (what he typed stands in the field above it). */
    notAColour: "Not a colour. Type one like #2a6df4.",
    on: "On",
    off: "Off",
    /** The head's line while As written is shown: the dials take no turn, and the way on is Yours. */
    readOnly: "Switch to Yours to change the values.",
    /** The head's line otherwise: his values are the artifact's answer, and the hub sends them to the agent by itself once his changes stand quiet (hub artifacts `sendAnswered`, `COMMENTS_QUIET_MS`). */
    reachAgent: "These go to the agent 3 seconds after your last change.",
    /** The head's line once his values went to the agent (by the hub by itself after his last change, or by his own Send: either way they went); the time in the page's language. */
    sent: (time: string) => `Sent to the agent at ${time}.`,
    /** The dial glyph in the bar's glass while values are changed: its name says how many. */
    glassChanged: (n: Figure) => `Dials, ${n} changed`,
  },
} as const;
