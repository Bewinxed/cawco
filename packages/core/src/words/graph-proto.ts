/**
 * What the design graph's three structure prototypes say (task tsk-18's
 * pick: the timeline, the field and the pair), each a working page the
 * owner operates before he picks one. The words they share with the design
 * graph itself stay in `design-graph.ts`; these are the ones a structure
 * brings of its own.
 */
export const graphProtoWords = {
  /** The bar's leading menu: the component under review, and its open remarks. */
  components: "Components under review",
  openRemarks: (count: number) =>
    count === 1 ? "1 open remark" : `${count} open remarks`,
  /** The bar's trailing symbols. */
  viewSettings: "View settings",
  adjust: "Adjust",
  comment: "Comment",
  commentTip: "Comment (C)",
  remarks: "Remarks",
  more: "More",
  close: "Close",
  /** View settings: scheme, width and motion (Xcode's Device Settings). */
  scheme: "Scheme",
  light: "Light",
  dark: "Dark",
  width: "Width",
  ownWidth: (px: number) => `${px}, its own`,
  reduceMotion: "Reduce motion",
  /** Adjust: the kept state's records. */
  records: "Records",
  tasksShown: "Tasks shown",
  noList: (state: string) => `${state} holds no list to count`,
  /** The two ways of seeing one set of states. */
  waysOfSeeing: "Way of seeing",
  inOrder: "In order",
  allAtOnce: "All at once",
  walk: "Walk",
  fit: "Fit",
  /** The sequence's transport. */
  firstStep: "First step",
  lastStep: "Last step",
  playSteps: "Play the steps",
  pause: "Pause",
  playMove: (from: string, to: string) => `Play ${from} → ${to}`,
  holdMove: (from: string, to: string) => `Hold ${from} → ${to}`,
  /** A move's length, on its gap, its arrow or its seam. */
  ms: (ms: number) => `${Math.round(ms)} ms`,
  /** A gap whose move isn't measured yet: it plays the first time it is crossed. */
  notMeasured: "…",
  /** The clips the move fired, read off the live component. */
  clips: (count: number) => `Clips (${count})`,
  clipsOf: (from: string, to: string) => `${from} → ${to}`,
  noClips: "This move animated nothing.",
  /** A clip's element: a card by the task it shows, the count, the column itself. */
  clipCard: (id: string) => `Card ${id}`,
  clipCount: "Count",
  clipColumn: "Column",
  replay: "Replay",
  /** A state no arrow reaches, or none leaves. */
  noWayIn: "No way in",
  noWayOn: "No way on",
  /** The track's sheet. */
  hideStates: "Hide states",
  showStates: "Show states",
  resizeStates: "Resize the states",
  /** A held keyframe or card: the state previewed over the kept one. */
  held: (name: string) => `Held: ${name}`,
  kept: (name: string) => `Kept: ${name}`,
  /** Difference marks, to a reader. */
  came: "Came in or changed",
  went: "Went",
  /** Option 2: what the owner has stood on. */
  seen: "Stood on",
  stoodOn: (count: number, of: number) => `Stood on ${count} of ${of}`,
  /** Option 3: the pair. */
  here: "Here",
  next: "Next",
  differences: "Differences",
  swap: "Make it Here",
  nextFromHere: "Next from here",
  nothingFollows: (name: string) => `Nothing follows ${name}`,
  showNext: (name: string) => `Hold to see ${name} over Here`,
  setSheet: "The whole set",
  pressForNext: "Press a state to stand it in Next",
  done: "Done",
  doneOpen: (count: number) => `Done, ${count} open`,
  handedOver: (name: string, open: number) =>
    `Done judging ${name} · ${open === 0 ? "nothing open" : `${open} open`}`,
  undo: "Undo",
  /** Remarks: pins on the live component. */
  composer: "What should change?",
  send: "Comment",
  cancel: "Cancel",
  nothingMarked: "Nothing marked yet. Press C and pin an element.",
  onState: (path: string) => `On ${path}`,
  goToState: "Go to this state",
  wholeState: "The whole state",
};
