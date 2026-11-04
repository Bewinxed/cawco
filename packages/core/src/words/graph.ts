/**
 * What the design graph says (dashboard `cawco/graph`): the surface where
 * the owner judges a component an agent built, live on a stage in each of
 * its states, with the moves between them and their timing. Plain words,
 * DESIGN.md's Voice: a state is named as the product talks of it.
 */
/**
 * A number as the page's language writes it (dashboard graph/figures.ts
 * `figureOf`, `Intl.NumberFormat` in the page's `lang`): every figure these
 * words say is one, so none says a raw number ("1800000 ms").
 */
export type Figure = string & { readonly figure: true };

export const graphWords = {
  /** The room's three faces, its switch's segments, and the switch's name for a screen reader. */
  statesFace: "States",
  wholeSet: "Map",
  moveFace: "Animation",
  faces: "Panel view",
  /** The panel's own name, whichever face it shows: the room's aside and the phone drawer's title. */
  room: "States, map and animation",
  /** Where the journey stands on the component's path: "8 of 11". */
  position: (at: Figure, of: Figure) => `${at} of ${of}`,
  previous: "Previous state",
  next: "Next state",
  /** The room's one close, its own; and the bar's symbol that brings it back while it is put away. */
  closeRoom: "Close panel",
  openRoom: "Open panel",
  /** The phone drawer's grabber: a press steps it to its next stop. */
  nextStop: "Resize panel",
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
  changed: (element: string, before: string, after: string) =>
    `${element}: ${before} → ${after}`,
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
  noMove: (state: string) => `${state} has no animation.`,
  play: "Play",
  pause: "Pause",
  /** The playhead's time over the move's length, tabular figures; a narrow corner breaks it after the slash, never between a figure and its unit. */
  playhead: (at: Figure, of: Figure) => `${at}\u00a0/ ${of}\u00a0ms`,
  scrub: "Time",
  /** A clip's two handles on its bar. */
  clipStarts: (clip: string) => `Start of ${clip}`,
  clipEnds: (clip: string) => `End of ${clip}`,
  /** While the move is read off the stage. */
  reading: "Playing the move once to read its timing…",
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
  /** A curve named by its token, else said as what it is. */
  curves: {
    "--ease-out": "Ease-out",
    "--ease-in-out": "Ease-in-out",
    "--ease-drawer": "Drawer",
    "--ease-crossfade": "Crossfade",
    "--ease-goo": "Goo",
    linear: "Linear",
  } as Record<string, string>,
  /** A curve no token names. */
  ownCurve: "Custom curve",
  /** A clip's element when nothing names it. */
  element: "Element",

  /** A row of the move, one per thing that moves, named as a person says it: "Form failure unfolds". Its length stands in its own column; its words are the press that opens its editor. */
  clipName: (element: string, how: string) => `${element} ${how}`,
  length: "Duration",
  /** Lengths offered first, in plain words with their figure beside each. */
  lengths: [
    { name: "Quick", ms: 150 },
    { name: "Standard", ms: 250 },
    { name: "Slow", ms: 400 },
  ],
  longer: "Longer",
  shorter: "Shorter",
  curve: "Curve",
  /** The curves offered first, by their shape (Jitter's presets). */
  shapes: {
    linear: "Linear",
    smooth: "Smooth",
    slowDown: "Slow down",
    speedUp: "Speed up",
    spring: "Spring",
  } as Record<string, string>,
  /** A curve no shape is near: its four numbers stand under Advanced. */
  ownShape: "Custom curve: none of these shapes matches it",
  /** How strongly the chosen shape bends. */
  intensity: "Intensity",
  advanced: "Advanced",
  custom: "Curve numbers",
  bounce: "Bounce",
  mass: "Mass",
  stiffness: "Stiffness",
  damping: "Damping",
  delay: "Delay",
  reset: "Reset",
  ms: (value: Figure) => `${value} ms`,
  /** A length's unit, beside its figure in the editor. */
  msUnit: "ms",
  /** A value he changed, marked on itself (the row's length, the editor's value names): pressing it puts that one value back as the agent built it. Its name and tooltip. */
  resetLength: (ms: Figure) => `Reset length to ${ms} ms`,
  resetCurve: (curve: string) => `Reset curve to ${curve}`,
  resetDelay: (ms: Figure) => `Reset delay to ${ms} ms`,
  /** Reset, every value back: the visible word is `reset`; a reader hears its object. */
  resetAll: "Reset all edits",
  /** The editor's row naming what the clip changes, when it is one number. */
  changesHead: "Changes",
  /** What the clip changes, when it is one number: the editor's Changes row. */
  property: (name: string, from: Figure, to: Figure, unit: string) =>
    `${name} ${from} → ${to} ${unit}`,
  propertyOf: (name: string, from: Figure, to: Figure, unit: string) =>
    `${name} from ${from} to ${to} ${unit}`,

  /** A row with several animations, opened into one row each. */
  showClips: (n: number) => `Show ${n} animations`,
  hideClips: (n: number) => `Hide ${n} animations`,
  /** A spring row: its length's figure; a spring has no set length, so its figure is when it settles. */
  springFigure: (ms: Figure) => `~${ms} ms`,
  springSettles: (ms: Figure) => `A spring, settled by ${ms} ms`,
  /** The bar's body, dragged: the whole animation along the lane. */
  moveClip: (clip: string) => `Move ${clip}`,
  /** One run of a row that runs more than once: its bar's name for a reader. */
  runOf: (clip: string, at: number, of: number) =>
    `${clip}, run ${at} of ${of}`,
  /** An animation's row under its row, by the run it is in: "Run 2". */
  runShort: (at: number) => `Run ${at}`,
  /** A run's bar's tooltip: its name and where it runs. */
  runSpan: (run: string, from: Figure, to: Figure) =>
    `${run}: ${from}–${to} ms`,
  /** A row of several runs: its length figure is its whole span; its tooltip says so. */
  runsSpan: (n: number, from: Figure, to: Figure) =>
    `${n} runs, ${from}–${to} ms`,
  /** The editor's curve sections: the house's curves, then the shapes. */
  designSystem: "Design system",
  shapesHead: "Shapes",

  /** A list state's record sets, each a variant. */
  recordsOne: "One record",
  recordsMany: (n: Figure) => `${n} records`,
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
  mounting: (name: string) => `Loading ${name}…`,
  /** The component failed to mount: what happened, why, what to do, what next. */
  mountFailed: (name: string, state: string) =>
    `${name} didn't load at ${state}.`,
  showDetails: "Show details",
  hideDetails: "Hide details",
  tryAgain: "Try again",
  /** The hub's link down: the stage keeps its last drawing. */
  stale: "Not live: the hub can't be reached. This is the last view it sent.",
} as const;
