/**
 * What the design graph says (dashboard `cawco/graph/`): the surface where
 * the person judges what an agent built, one live component at a state, the
 * steps bar over its states, the map of its states and moves, and the dock
 * of the kept move's timing. Its own words are few on purpose: the states'
 * titles and lines, the machines' names and the clips' targets are the
 * agent's, read from the states file.
 */
export const graphWords = {
  /** The steps bar's slider, as a screen reader names it. */
  steps: "States",
  /** The slider's value read out: the state's title, then where it stands. */
  stepOf: (title: string, at: number, of: number) => `${title}, ${at} of ${of}`,
  previous: "Previous state",
  next: "Next state",

  /** The map's toggle in the steps bar, and its own Hide. */
  map: "Map",
  showMap: "Show the map",
  hideMap: "Hide the map",
  fit: "Fit the map",
  outline: "Outline",
  showOutline: "Show as a list",
  showGraph: "Show as a graph",
  /** The map's component control: its menu, and stepping through the canvas's components. */
  components: "Components",
  previousComponent: "Previous component",
  nextComponent: "Next component",
  componentOf: (at: number, of: number) => `${at} of ${of}`,
  /** A map's edge, resized by a drag. */
  resizeWidth: "Map width",
  resizeHeight: "Map height",

  /** The dock: the kept move's clips over time. */
  play: "Play the move",
  pause: "Pause",
  original: "Original",
  edited: "Edited",
  /** A clip's chips. */
  delay: "Delay",
  duration: "Duration",
  curve: "Curve",
  /** A length dragged off the tokens with ⌥ held: the agent names it. */
  freeLength: "Not a token: the agent names it",

  /** The data dials over real records. */
  dials: "Data",
  ofRecords: (shown: number, all: number) => `${shown} of ${all}`,

  /** The stage while the component's module loads, and when it fails. */
  drawing: "Drawing the component",
  failed: (component: string) =>
    `${component} didn't load, so none of its states are drawn.`,
} as const;
