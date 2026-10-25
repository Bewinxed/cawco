/**
 * What the design graph says (Projects spec §5.10, "The design graph"): the
 * panel beside a component under review, its graph of states, the dock of
 * the kept move's clips and a clip's controls. The dashboard's preview pane
 * reads these; the graph is the web's alone, so the app is not given them.
 */
import type { ClipKind } from "../design-graph";

export const designGraphWords = {
  /** The panel, to a reader. */
  graph: "Design graph",
  /** Its tabs, one per component under review, to a reader. */
  components: "Components",
  /** Its zoom group, to a reader; each button's words and tooltip. */
  zoom: "Zoom",
  zoomIn: "Zoom in",
  zoomOut: "Zoom out",
  zoomInTip: "Zoom in (⌘ scroll)",
  zoomOutTip: "Zoom out (⌘ scroll)",
  /** The zoom's figure is its press: the whole graph in view. */
  fitAll: "Fit all",
  /** Hide folds the panel into its tab at the pane's edge; Show grows it back (pin 29, The One Object Rule). */
  hide: "Hide graph",
  show: "Show graph",
  /** A section whose states file hasn't loaded yet: its graph waits for its stories. */
  waiting: "Reading its states…",
  /** A section whose states file didn't load: the page says why where the component would stand. */
  failed: "Its states file didn't load. The page says why.",
  /** A narrow pane's one drawer: its two faces, and the switch between them, to a reader. */
  faces: "Show",
  faceGraph: "Graph",
  faceTimeline: "Timeline",
  /** The drawer's grabber: a press steps its height. */
  drawer: "Drawer",
  /** The resize handles, to a reader: the panel's corner, the dock's top edge. */
  resizePanel: "Resize the graph panel",
  resizeDock: "Resize the timeline",
  /** The dock, to a reader. */
  timeline: "The timeline",
  /** The kept move, as the dock's head names it. */
  move: (from: string, to: string) => `${from} → ${to}`,
  /** The move as `tuned` names it to the agent. */
  moveTuned: (from: string, to: string) => `${from} → ${to}`,
  /** Original | Edited (the owner's pick "segments"), once the move has edits. */
  compare: "Compare",
  original: "Original",
  edited: "Edited",
  edits: (count: number) => `${count} ${count === 1 ? "edit" : "edits"}`,
  reset: "Reset",
  resetTip: "Every clip back to the agent's timing",
  play: "Play",
  pause: "Pause",
  loop: "Loop",
  /** The playhead's place over the move's length, to a reader. */
  readout: (at: number, length: number) => `${at} of ${length} ms`,
  /** A clip's kind of change (pin 27), its row's glyph named for a reader. */
  kinds: {
    enter: "Comes in",
    change: "Changes",
    exit: "Goes",
  } satisfies Record<ClipKind, string>,
  /** An agent's own value off the token scale, on its chip (the owner: "it chooses to use the tokens or adhoc values"). */
  adHoc: "ad hoc",
  adHocTip: (what: string) => `The agent's own ${what}, off the token scale`,
  /** A clip's facts, to a reader. */
  length: (ms: number, token: string | null) =>
    `Length ${ms} ms${token ? `, the ${token} token` : ", ad hoc"}`,
  curveOf: (word: string) => `Curve ${word}`,
  /** A clip's controls, wherever they open. */
  controls: (element: string, property: string) =>
    `Controls, ${element} ${property}`,
  close: "Close the clip's controls",
  closeTip: "Close (Esc)",
  back: "Back to the timeline",
  duration: "Duration",
  /** A spring's length: its perceptual duration. */
  response: "Response",
  curve: "Curve",
  spring: "Spring",
  custom: "Custom",
  /** A curve the agent wrote that is no bézier (a `linear()`, `steps()`), kept as written. */
  asWritten: "As written",
  /** A written curve that overshoots its end: a spring the agent wrote as `linear()`. */
  writtenSpring: "Spring, as written",
  customCurve: "Custom curve",
  dragHandle: "Drag a handle to make it your own",
  firstHandle: "First handle",
  secondHandle: "Second handle",
  bounce: "Bounce",
  mass: "Mass",
  stiffness: "Stiffness",
  damping: "Damping",
  velocity: "Velocity",
  /** A move that didn't run, in the dock's place, in the page's own words. */
  didntRun: (why: string) => `The move didn't run: ${why}`,
  /** A move that ran and fired nothing. */
  noClips: "The move ran and animated nothing.",
  /** Where a clip's controls open (the owner's note "popover? lol..": his pick between the two answers). */
  clipControls: "Clip controls",
  inTheRow: "In the row",
  inAnInspector: "In an inspector",
  /** The agent's dials under the graph, to a reader. */
  dials: "Dials",
  /** A pin placed while a state was kept, under the person's words (the owner's pick "pins"). */
  pinKept: (path: string) => `Left on ${path}`,
};
