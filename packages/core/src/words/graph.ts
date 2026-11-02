/**
 * What the design graph says (dashboard `cawco/graph`): the surface where
 * the owner judges a component an agent built, live on a stage in each of
 * its states, with the moves between them and their timing. Plain words,
 * DESIGN.md's Voice: a state is named as the product talks of it.
 */
export const graphWords = {
  /** The room's three faces, its switch's segments, and the switch's name for a screen reader. */
  statesFace: "States",
  wholeSet: "Whole set",
  moveFace: "Move",
  faces: "What the panel shows",
  /** Where the journey stands: "3 of 5, Saving". */
  position: (at: number, of: number, name: string) => `${at} of ${of}, ${name}`,
  previous: "Previous state",
  next: "Next state",
  /** The room put away and brought back, a bare symbol's name. */
  closeRoom: "Hide states",
  openRoom: "Show states",
  /** The component in front, when the ask names several: the switch's name. */
  components: "Component",
  /** A state the states file tags as a failure: its glyph's name and tooltip in the whole set. */
  errorState: "Error state",
  /** A state that is not its machine's start, with no move into it: its glyph's tooltip. */
  nothingReaches: "No move leads here",
  /** A state that is not the end of its path, with no move out of it: its glyph's tooltip. */
  nothingLeaves: "No move leads on from here",
  /** A state's moves out, in the whole set: the list's name for a screen reader, and each move as the person causes it. */
  movesOut: (state: string) => `Moves from ${state}`,
  moveTo: (act: string | null, to: string) =>
    act ? `${act} → ${to}` : `→ ${to}`,
  /** A state's variants, the toggle group's name for a screen reader. */
  variants: (state: string) => `Variants of ${state}`,
  /** A variant's state, said before its own name to a reader and a pin ("Failed save: Longest names"). */
  variantOf: (state: string) => `${state}: `,
  /** A states file with one state and no machine, said once. */
  oneState: "This component has one state.",

  /** Compare: a switch that stays on until he turns it off. */
  compare: "Compare",
  comparedWith: (state: string) => `Compared with ${state}`,
  /** One line per difference. */
  cameIn: (element: string) => `${element} came in`,
  went: (element: string) => `${element} went`,
  changed: (element: string, before: string, after: string) =>
    `${element}: ${before} → ${after}`,
  changedPlain: (element: string) => `${element} changed`,
  sameAs: (state: string) => `Nothing differs from ${state}.`,

  /** The move into the kept state. */
  move: (from: string, to: string) => `${from} → ${to}`,
  noMove: (state: string) => `No move plays into ${state}.`,
  play: "Play",
  pause: "Pause",
  playQuarter: "Play at quarter speed",
  /** The playhead's time over the move's length, tabular figures. */
  playhead: (at: number, of: number) => `${at} / ${of} ms`,
  scrub: "Playhead",
  /** A clip's two handles on its bar. */
  clipStarts: (clip: string) => `${clip}: starts`,
  clipEnds: (clip: string) => `${clip}: ends`,
  /** Reduced motion: Play draws the end state with a fade. */
  playStill: "Reduce motion is on: Play fades the end state in.",
  /** Clips outside DESIGN.md's tokens, flagged once at the move's head. */
  adHoc: (n: number) =>
    n === 1
      ? "1 clip is outside the tokens"
      : `${n} clips are outside the tokens`,
  /** While the move is read off the stage. */
  reading: "Reading the move…",
  /** The move played but the engine saw nothing animate. */
  nothingAnimated: (from: string, to: string) =>
    `Nothing on the stage moved from ${from} to ${to}.`,
  /** The move's play threw. */
  moveFailed: (why: string) => `The move didn't play: ${why}`,

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
  ownCurve: "Its own curve",
  /** A clip's element when nothing names it. */
  element: "Element",

  /** A clip's row, named as a person says it: "Form failure unfolds, 260 ms". */
  clipName: (element: string, how: string, ms: number) =>
    `${element} ${how}, ${ms} ms`,
  /** The clip editor. */
  edit: (clip: string) => `Change ${clip}`,
  length: "Length",
  curve: "Curve",
  spring: "Spring",
  advanced: "Advanced",
  custom: "Custom",
  bounce: "Bounce",
  mass: "Mass",
  stiffness: "Stiffness",
  damping: "Damping",
  delay: "Delay",
  reset: "Reset",
  ms: (value: number) => `${value} ms`,
  /** A tuned clip says so on its row, before and after. */
  tuned: (before: string, after: string) => `Tuned: ${before} → ${after}`,
  /** Where a tuning goes, said once in the editor. */
  tunedGoes: "The agent reads every change back.",

  /** A list state's record sets, each a variant. */
  recordsOne: "One record",
  recordsMany: (n: number) => `Many, ${n}`,
  recordsLongest: "Longest names",
  recordsAsOf: (time: string) => `Records as they stood at ${time}`,

  /** The stage's view. */
  stageView: "View",
  width: "Width",
  ownWidth: (px: number) => `Its own width, ${px}`,
  phone: "Phone",
  tablet: "Tablet",
  desk: "Desk",
  widthOf: (device: string, px: number) => `${device}, ${px}`,
  scheme: "Scheme",
  light: "Light",
  dark: "Dark",
  reduceMotion: "Reduce motion",
  mounting: (name: string) => `Mounting ${name}…`,
  /** The component failed to mount: what happened, why, what to do, what next. */
  mountFailed: (name: string, state: string) =>
    `${name} didn't mount at ${state}, so the stage has nothing to draw.`,
  showDetails: "Show details",
  hideDetails: "Hide details",
  tryAgain: "Try again",
  /** The hub's link down: the stage keeps its last drawing. */
  stale: "Not live: the hub's link is down. This is the last drawing.",
} as const;
