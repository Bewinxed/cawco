/**
 * What the design graph says (dashboard `cawco/graph`): the surface where
 * the owner judges a component an agent built, live on a stage in each of
 * its states, with the moves between them and their timing. Plain words,
 * DESIGN.md's Voice: a state is named as the product talks of it.
 */
export const graphWords = {
  /** The room's three faces, its switch's segments, and the switch's name for a screen reader. */
  statesFace: "States",
  wholeSet: "Map",
  moveFace: "Animation",
  faces: "Panel view",
  /** The panel's own name, whichever face it shows: the room's aside and the phone drawer's title. */
  room: "States, map and animation",
  /** Where the journey stands on the component's path: "8 of 11". */
  position: (at: number, of: number) => `${at} of ${of}`,
  previous: "Previous state",
  next: "Next state",
  /** The room's one close, its own; and the bar's symbol that brings it back while it is put away. */
  closeRoom: "Close panel",
  openRoom: "Open panel",
  /** The phone drawer's grabber: a press steps it to its next stop. */
  nextStop: "Resize panel",
  /** The kept row's mark: the state the stage shows. */
  onStage: "Showing",
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
  /** One line per difference. */
  cameIn: (element: string) => `${element} added`,
  went: (element: string) => `${element} removed`,
  changed: (element: string, before: string, after: string) =>
    `${element}: ${before} → ${after}`,
  changedPlain: (element: string) => `${element} changed`,
  sameAs: (state: string) => `No difference from ${state}.`,
  /** The list of differences at the stage's head, its name for a screen reader. */
  differences: "Differences",

  /** The move into the kept state. */
  move: (from: string, to: string) => `${from} → ${to}`,
  noMove: (state: string) => `${state} has no animation.`,
  play: "Play",
  pause: "Pause",
  playQuarter: "Play at quarter speed",
  /** The playhead's time over the move's length, tabular figures. */
  playhead: (at: number, of: number) => `${at} / ${of} ms`,
  scrub: "Time",
  /** A clip's two handles on its bar. */
  clipStarts: (clip: string) => `Start of ${clip}`,
  clipEnds: (clip: string) => `End of ${clip}`,
  /** Clips outside DESIGN.md's tokens, flagged once at the move's head. */
  adHoc: (n: number) =>
    n === 1
      ? "1 timing is not from the design system"
      : `${n} timings are not from the design system`,
  /** While the move is read off the stage. */
  reading: "Reading the animation…",
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

  /** A row of the move, one per thing that moves, named as a person says it: "Form failure unfolds, 260 ms"; a thing that moves at two moments of different lengths says its whole stretch. */
  clipName: (element: string, how: string, ms: number) =>
    `${element} ${how}, ${ms} ms`,
  clipSpan: (element: string, how: string, from: number, to: number) =>
    `${element} ${how}, ${from}–${to} ms`,
  /** The clip editor. */
  edit: (clip: string) => `Change ${clip}`,
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
  /** The house's own token, when the clip's timing is one: CawCo's words, said inside the editor only. */
  tokenLine: (token: string) => `From the design system: ${token}`,
  advanced: "Advanced",
  custom: "Curve numbers",
  bounce: "Bounce",
  mass: "Mass",
  stiffness: "Stiffness",
  damping: "Damping",
  delay: "Delay",
  reset: "Reset",
  ms: (value: number) => `${value} ms`,
  /** The ruler's unit, beside the playhead's figure. */
  msUnit: "ms",
  /** A tuned clip says so on its row, before and after. */
  tuned: (before: string, after: string) =>
    `Changed: ${before} → ${after}, sent to the agent`,

  /** The head's switch once there are edits: the animation as read, or as changed; its name for a reader. */
  timings: "Timings",
  original: "Original",
  edited: "Edited",
  /** The moment a row's animation was started, before any delay: its mark on the lane. */
  triggeredAt: (ms: number) => `Triggered at ${ms} ms`,
  /** A row with several animations, opened into one row each. */
  showClips: (n: number) => `Show ${n} animations`,
  hideClips: (n: number) => `Hide ${n} animations`,
  /** A row's duration chip when its length is the design system's, and its name for a reader. */
  durationChip: (ms: number, name: string) => `${ms} ms · ${name}`,
  durationOf: (ms: number, name: string) =>
    `${ms} ms, the design system's “${name}” duration`,
  /** The dashed chip, its length off the ladder (⌥), and its name for a reader. */
  freeOf: (ms: number) => `${ms} ms, not from the design system`,
  /** A spring row: its bar's figure, and what a reader hears for it. */
  springFigure: (ms: number) => `~${ms} ms`,
  springSettles: (ms: number) => `Spring, settles in about ${ms} ms`,
  /** The bar's body, dragged: the whole animation along the lane. */
  moveClip: (clip: string) => `Move ${clip}`,
  /** The editor's curve sections: the house's curves, then the shapes. */
  designSystem: "Design system",
  shapesHead: "Shapes",

  /** A list state's record sets, each a variant. */
  recordsOne: "One record",
  recordsMany: (n: number) => `${n} records`,
  recordsLongest: "Longest names",

  /** The stage's view. */
  stageView: "View options",
  width: "Width",
  ownWidth: (px: number) => `Component's own width, ${px}`,
  /** A listed width that is also the component's own. */
  ownListed: (device: string, px: number) =>
    `${device}, ${px}, the component's own width`,
  phone: "Phone",
  tablet: "Tablet",
  desk: "Desktop",
  widthOf: (device: string, px: number) => `${device}, ${px}`,
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
