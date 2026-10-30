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
  /** The kept move, as the dock says it to a reader (its head draws no title: the graph's lit edge names it). */
  move: (from: string, to: string) => `${from} → ${to}`,
  /** The move as `tuned` names it to the agent. */
  moveTuned: (from: string, to: string) => `${from} → ${to}`,
  /** Original | Edited (the owner's pick "segments"), once the move has edits. */
  compare: "Compare",
  original: "Original",
  edited: "Edited",
  /** The timeline's head: how many clips stand edited away from the agent's timing. */
  changed: (count: number) => `${count} changed`,
  reset: "Reset",
  resetTip: "Every clip back to the agent's timing",
  play: "Play",
  pause: "Pause",
  loop: "Loop",
  /** The playhead's place over the move's length, to a reader. */
  readout: (at: number, length: number) => `${at} of ${length} ms`,
  /** What a clip changes (mockup round 29's six kinds), its row's glyph named for a reader. */
  kinds: {
    opacity: "Opacity",
    position: "Position",
    size: "Size",
    colour: "Colour",
    text: "Text swap",
    unfold: "Unfold",
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
  /** The agent's dials under the graph, to a reader. */
  dials: "Dials",
  /** The two indexes over the stage, the switch's segments and its name to a reader. */
  views: "View",
  steps: "Steps",
  graphView: "Graph",
  /** The step slider, to a reader; its thumb's value is the kept state's name. */
  slider: "Steps",
  /** The steps bar folds to its pill and grows back out of it. */
  hideSteps: "Hide steps",
  showSteps: "Show steps",
  /** The kept stop's place in the sequence: compact in a field or a pill, in words beside dots (Apple Books' "150 of 483"). */
  stepFigure: (at: number, of: number) => `${at}/${of}`,
  stepOf: (at: number, of: number) => `${at} of ${of}`,
  /** The player's transport. */
  previousStep: "Previous step",
  nextStep: "Next step",
  playSteps: "Play the steps",
  pauseSteps: "Pause",
  /** A wide window's row: a state's page beside the kept one, its press keeps it. */
  rowTitle: (name: string) => `${name}, beside the kept state`,
  keepState: (name: string) => `Keep ${name}`,
  /** The preview's switches for the owner's open taste calls (graph options.svelte.ts), until he picks. */
  options: "Options",
  foldOptions: "Fold the options",
  recommendedFirst: "the recommendation first",
  /** The ultrawide pair's second page, to a reader: the hovered state beside the kept one. */
  pairTitle: "The state the pointer rests on",
  /** A step naming a story the states file lacks: its dashed stop's title. */
  stepMissing: (story: string) => `${story} isn't in the file`,
  /** A section with no stories, in the well and on the page (the empty-state formula). */
  noStates: (name: string) => `${name} has no states yet.`,
  /** A count dial's figure: how many records stand of the kept story's list (The Readable Labels rule). */
  countOf: (count: number, of: number) => `${count} of ${of}`,
  /** A longest dial's switch. */
  longestFirst: "Longest names first",
  /** A record dial with nothing to range over on the kept story (its arg no list, or an empty one): its title. */
  notAList: (arg: string, story: string) => `${story} holds no ${arg} to count`,
  /** The comments rail's group of pins placed on states not kept now. */
  onOtherStates: "On other states",
  /** A pin's state, under the person's words and in the rail: placed on the stage, or on the graph's node. */
  onState: (path: string) => `On ${path}`,
  onNode: (path: string) => `On the state ${path}`,
  /** A pin whose story is gone from the states file. */
  stateGone: "Its state is gone from the file",
};
