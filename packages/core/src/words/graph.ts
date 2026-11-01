/**
 * What the design graph says (dashboard `cawco/graph`): the surface where
 * the owner judges a component an agent built, live on a stage in each of
 * its states, with the moves between them and their timing. Plain words,
 * DESIGN.md's Voice: a state is named as the product talks of it.
 */
export const graphWords = {
  /** The two ways of seeing the states, the segmented control's segments. */
  journey: "Journey",
  wholeSet: "Whole set",
  /** The switch's name for a screen reader. */
  seeing: "How the states are shown",
  /** Where the journey stands: "3 of 5, Saving". */
  position: (at: number, of: number, name: string) => `${at} of ${of}, ${name}`,
  previous: "Previous state",
  next: "Next state",
  /** The room's two faces. */
  statesFace: "States",
  moveFace: "Move",
  /** The room put away and brought back, a bare symbol's name. */
  closeRoom: "Close states and move",
  openRoom: "Show states and move",
  /** The component in front, when the ask names several: the switch's name. */
  components: "Component in front",
  /** How many states a component has, in its switch's rows. */
  stateCount: (n: number) => (n === 1 ? "1 state" : `${n} states`),
  /** The kept state, named at the stage's head. */
  kept: "Kept",
  /** A state shown while the pointer rests on it. */
  previewing: "Previewing",
  /** A machine's first state. */
  start: "Start",
  /** A failure state's word beside its glyph. */
  failure: "Failure",
  /** A state that is not its machine's start, with no move into it. */
  nothingReaches: "Nothing reaches it",
  /** A state that is not the end of its path, with no move out of it. */
  nothingLeaves: "Nothing leaves it",
  /** A state's variants, the row's name for a screen reader. */
  variants: (state: string) => `${state}'s variants`,
  /** The variant that is the state itself. */
  asWritten: "As written",
  /** A states file with one state and no machine, said once. */
  oneState:
    "This component has one state, so there is nothing to step through.",

  /** Compare: a switch that stays on until he turns it off. */
  compare: "Compare",
  compareOn: "Compare with the kept state",
  compareOff: "Stop comparing",
  /** Under Compare, before a state is chosen. */
  compareChoose: "Press a state to compare it with the kept one.",
  compareChooseTouch: "Tap a state to compare it with the kept one.",
  comparedWith: (kept: string) => `Against ${kept}`,
  /** One line per difference. */
  cameIn: (element: string) => `${element} came in`,
  went: (element: string) => `${element} went`,
  changed: (element: string, before: string, after: string) =>
    `${element}: ${before} → ${after}`,
  changedPlain: (element: string) => `${element} changed`,
  sameAsKept: "Nothing differs from the kept state.",

  /** The move into the kept state. */
  move: (from: string, to: string) => `${from} → ${to}`,
  noMove: (state: string) =>
    `Nothing moves into ${state}: its states file plays no move to it.`,
  noMoveYet: "Keep a state to see the move into it.",
  play: "Play",
  playQuarter: "Play at quarter speed",
  replay: "Play again",
  /** The playhead's time over the move's length, tabular figures. */
  playhead: (at: number, of: number) => `${at} / ${of} ms`,
  scrub: "Playhead",
  /** Reduced motion: Play draws the end state with a fade. */
  playStill: "Reduced motion is on: Play draws the end state with a fade.",
  /** Clips outside DESIGN.md's tokens, flagged once at the move's head. */
  adHoc: (n: number) =>
    n === 1
      ? "1 clip is outside the tokens"
      : `${n} clips are outside the tokens`,
  adHocMark: "ad hoc",
  /** While the move is read off the stage. */
  reading: "Playing the move to read its clips…",
  /** The move played but the engine saw nothing animate. */
  nothingAnimated: (from: string, to: string) =>
    `The move from ${from} to ${to} played, and nothing on the stage animated.`,
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
  /** A curve baked into the clip's keyframes (a Svelte transition's): its shape is in its frames. */
  keyframedCurve: "Curve in its frames",
  keyframedNoCurve:
    "This clip draws its curve into its frames, so only its length can change here.",
  /** A clip's element when nothing names it. */
  element: "Element",

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
  tunedGoes:
    "The stage plays it at once; the agent reads every tuning back with the clip's facts.",

  /** A list state's record sets, each a variant. */
  recordsOne: "One record",
  recordsMany: (n: number) => `Many, ${n}`,
  recordsLongest: "Longest names",
  recordsAsOf: (time: string) => `Records as they stood at ${time}`,

  /** The stage. */
  stageView: "Stage",
  width: "Width",
  ownWidth: (px: number) => `Its own, ${px}`,
  widthPx: (px: number) => `${px} wide`,
  scheme: "Scheme",
  light: "Light",
  dark: "Dark",
  reduceMotion: "Reduce motion",
  mounting: (name: string) => `Mounting ${name}…`,
  /** The component failed to mount: what happened, why, what to do, what next. */
  mountFailed: (name: string, state: string) =>
    `${name} didn't mount at ${state}, so the stage has nothing to draw.`,
  mountFailedNext:
    "The agent is told when its states file changes; the stage mounts it again then. Try again mounts it now.",
  showDetails: "Show details",
  hideDetails: "Hide details",
  tryAgain: "Try again",
  /** The hub's link down: the stage keeps its last drawing. */
  stale: "Not live: the hub's link is down. This is the last drawing.",
} as const;
