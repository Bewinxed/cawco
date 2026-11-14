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
  /** What the pane left out of a message to or from the page, each for being past a bound: the few it names by their start. */
  leftOut: (
    left: readonly { head: string; kind: "line" | "name" | "value" }[]
  ) => {
    const part = (
      kind: "line" | "name" | "value",
      label: string,
      bound: string
    ) => {
      const these = left.filter((one) => one.kind === kind);
      if (these.length === 0) {
        return null;
      }
      const shown = these.slice(0, 3).map((one) => `"${one.head}"`);
      const more = these.length - shown.length;
      return `${label} past ${bound}: ${shown.join(", ")}${more > 0 ? `, and ${more} more` : ""}`;
    };
    return `The graph left out what was too long to read: ${[
      part("name", "names", "1,000 characters"),
      part("value", "CSS values", "400 characters"),
      part("line", "difference lines", "400 characters"),
    ]
      .filter((one) => one !== null)
      .join("; ")}.`;
  },
  /** The room's faces, its switch's segments. */
  statesFace: "States",
  wholeSet: "Map",
  moveFace: "Animation",
  /** The values an agent lets him tune, by what tools call such a panel (Storybook's Controls). */
  dialsFace: "Controls",
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

  /**
   * Compare: a switch that stays on until he turns it off, named for the
   * state it compares with (model.ts `previousOf`: the one the move into
   * the kept state starts from, else the one before it, else the first
   * state's next), so the first state's Compare never says "previous".
   */
  compare: (state: string) => `Compare with ${state}`,
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
  /** Plays the move again from its start, wherever the playhead stands. */
  replay: "Play from the start",
  /** The mark on the ruler a repeat goes round again from, while Repeat is on. */
  repeatFrom: (at: Figure) => `Repeat from ${at}\u00a0ms`,
  /** The zoomed lanes put back to the whole move. */
  fit: "Show the whole move",
  /** The strip under the ruler while the lanes are zoomed: the part of the move they show, dragged to move along it. */
  overview: "Part of the move shown",
  /** A press on the lanes' empty part scrubs, as the ruler does; with Shift, a press on a bar does too. */
  laneScrub:
    "Press anywhere on the lanes to move the playhead; Shift and press on a bar to move it over the bar.",
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
    "--duration-control": "Control",
    "--duration-menu": "Menu",
    "--duration-toggle": "Toggle",
    "--duration-exit": "Exit",
    "--duration-morph": "Morph",
    "--duration-fade": "Fade",
    "--duration-panel-exit": "Panel exit",
    "--duration-pop": "Pop",
    "--duration-panel": "Panel",
    "--duration-glide": "Glide",
    "--duration-settle": "Settle",
  } as Record<string, string>,
  /** The curve the agent wrote, when it is none of the design system's: offered to go back to. */
  agentsCurve: "Agent's curve",
  /** A curve he drew by its two control points: his own, off the design system's. */
  yourCurve: "Your curve",
  /** A clip's element when nothing names it. */
  element: "Element",

  /** A row of the move, one per thing that moves, named as a person says it: "Form failure unfolds". */
  clipName: (element: string, how: string) => `${element} ${how}`,
  /** A clip's settings, each a chip under its selected row. */
  length: "Length",
  delay: "Delay",
  curve: "Curve",
  /** What a clip runs between, per property: its first frame's value and its last's. */
  values: "Values",
  /** A property's two ends on the Values chip: "0 → 1". */
  valueEnds: (from: string, to: string) => `${from} → ${to}`,
  /** The first property's ends and how many more the card holds: "0 → 1 +2". */
  andMore: (first: string, more: number) => `${first} +${more}`,
  valueFrom: (property: string) => `${property} at the start`,
  valueTo: (property: string) => `${property} at the end`,
  resetValues: "Reset values to as written",
  /** How a clip runs on past its first time through. */
  clipRepeat: "Repeats",
  clipRepeats: {
    once: "Once",
    repeat: "Repeat",
    mirror: "Back and forth",
  } as Record<string, string>,
  resetRepeat: (to: string) => `Reset repeats to ${to}`,
  /** A clip of several legs (A to B to C): where one ends and the next begins, for a reader. */
  legEnds: (clip: string, at: number, of: number) =>
    `${clip}, end of leg ${at} of ${of}`,
  resetLegs: "Reset its legs as written",
  /** The agent's group of rows (`data-cawco-group`), folded or shown. */
  groupFold: (group: string, open: boolean) =>
    open ? `Hide ${group}` : `Show ${group}`,
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
  /** The stage drawn at the room it has: the width's default. */
  adapt: "Adapt",
  phone: "Phone",
  tablet: "Tablet",
  desk: "Desktop",
  wide: "Wide",
  widthOf: (device: string, px: Figure) => `${device}, ${px}`,
  scheme: "Appearance",
  light: "Light",
  dark: "Dark",
  reduceMotion: "Reduce motion",
  /** The view card's switch: a width wider than the stage drawn 1:1 (Apple's Actual Size), not scaled to fit. */
  actualSize: "Actual size",
  /** A phone twin's name (stage-graph.ts `shownName`): its state's, the width a qualifier after a comma, so "Hub didn't answer" stays whole. */
  onAPhone: (state: string) => `${state}, on a phone`,
  /** The scale as a figure among the view's tools while the stage draws the component scaled down to fit, itself the Actual size switch. */
  scalePercent: (percent: Figure) => `${percent}%`,
  /** The figure's name and tooltip, saying what a press does. */
  scaleShowActual: (percent: Figure) =>
    `Scaled to ${percent}%. Show at actual size`,
  /** Actual size in View options, where the tools fold, the scale said in it. */
  actualSizeFrom: (percent: Figure) => `Actual size (now ${percent}%)`,
  /** The hub's link down, on its glass over the stage: short enough for one line at 390, the whole line (`stale`) in its tooltip. */
  staleShort: "Not live: the last view the hub sent",
  mounting: (name: string) => `Loading ${name}…`,
  /** The component failed to mount: what happened, why, what to do, what next. */
  mountFailed: (name: string, state: string) =>
    `${name} didn't load at ${state}.`,
  tryAgain: "Try again",
  /** The hub's link down: the stage keeps its last drawing. */
  stale: "Not live: the hub can't be reached. This is the last view it sent.",

  /**
   * The agent's controls (its canvas spec's `dials`): the values it lets
   * the person tune on the drawing, each a row of the Controls face.
   */
  dials: {
    /** A changed control's undo glyph, its tooltip beside the control's name: what it goes back to. */
    resetTo: (value: string) => `Reset to ${value}`,
    /** The same glyph's name to a reader, the control's name first as the agent wrote it. */
    resetSaid: (dial: string, value: string) => `${dial}: reset to ${value}`,
    /** The agent's option in a select's list while his differs, said to a reader (the undo glyph marks it). */
    agentsValue: "the agent's value",
    resetAllSaid: "Reset all values",
    /** A colour control's swatch: it opens the picker. */
    pick: (dial: string) => `Pick ${dial}`,
    /** The picker's square, its thumb: the colour's saturation across, its brightness down. */
    area: "Saturation and brightness",
    hue: "Hue",
    alpha: "Opacity",
    /** The picker's eyedropper, where the browser has one. */
    eyedropper: "Pick a colour from the screen",
    /** A colour typed that the browser reads as none: under its field until it is one (what he typed stands in the field above it). */
    notAColour: "Not a colour. Type one like #2a6df4.",
    on: "On",
    off: "Off",
    /** Under the rows once a prop differs from the saved state: writes his values into it. */
    save: "Save",
    /** Beside Save: a new state from his values, the saved one kept. */
    saveNew: "Save as new state",
    saving: "Saving…",
    /** The card's part that holds the dials the agent put on the drawing. */
    agentHead: "Agent's dials",
    /** The card's part that holds the props of the state on the stage, by its component's name in words. */
    propsHead: (component: string) => `${component} props`,
    /** The props' one switch of words, read out: each case fills every text prop it reaches at once. */
    content: "Fill all text with",
    cases: {
      saved: "Saved",
      empty: "Empty",
      long: "Long",
      noSpaces: "No spaces",
      emoji: "Emoji",
      rightToLeft: "Right to left",
    },
  },
} as const;
