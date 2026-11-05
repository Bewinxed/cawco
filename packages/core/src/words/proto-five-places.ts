/**
 * What the "Five places, and the board is the front door" prototype of a
 * project says (apps/dashboard/src/lib/prototypes/project/five-places/):
 * the row of five places, the needs-you line, Tasks, Routines, Decisions,
 * Outputs, Caw's pane, the task pane's stand-in and the two sheets under
 * More. A prototype's words, kept apart from the shipped surfaces' modules
 * until the person picks a structure; not written into the app.
 *
 * "Outputs" is the working name of the place that gathers what the project
 * produced; the pick page asks the person for its name.
 */

const plural = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`;

export const fivePlacesWords = {
  /** The five places, in the row's order. */
  places: {
    tasks: "Tasks",
    routines: "Routines",
    decisions: "Decisions",
    outputs: "Outputs",
    caw: "Caw",
  },
  placesLabel: "Places in this project",
  /** A place's mark, read out after its name. */
  markNeeds: (count: number) => `${count} need you`,
  markFailed: "a routine failed",
  markNew: (count: number) => `${count} new`,
  markUnread: "could not read",
  markReading: "reading",

  // The needs-you line.
  needsYou: "Needs you",
  needsTasks: (count: number) => plural(count, "task", "tasks"),
  needsDecisions: (count: number) => plural(count, "decision", "decisions"),
  needsActions: (count: number) => plural(count, "action", "actions"),
  needsSessionAsks: (count: number) =>
    count === 1 ? "a session asks" : `${count} sessions ask`,
  needsCap: "dispatch paused at the cap",
  staleSince: (time: string) => `stale since ${time}, hub unreachable`,

  // The bar.
  more: "More",
  search: "Search tasks",
  select: "Select tasks",
  spend: "Spend",
  configure: "Configure",
  addTask: "Add task",
  newRoutine: "New routine",
  openMenu: "Projects",
  back: "Back to Tasks",

  // Tasks.
  views: {
    board: "Board",
    table: "Table",
    calendar: "Calendar",
    dependencies: "Dependencies",
  },
  viewLabel: "View",
  noDates: "no task has a date yet",
  filters: {
    all: "All",
    needs: "Needs you",
    working: "Working",
    stuck: "Stuck",
  },
  filterLabel: "Saved filters",
  saveNarrowing: "Save this narrowing",
  searchPlaceholder: "Find a task by id, title or words",
  chipLabel: "Label",
  chipStage: "Stage",
  chipType: "Delegate type",
  ofTotal: (total: number) => `of ${total}`,
  showMore: (count: number) => `Show ${count} more`,
  stageEmpty: "Nothing here",
  archive: "Archive",
  composerPlaceholder: "Add a task to Ready, then Enter",
  composerLabel: "New task's title",
  composerFiling: "Filing…",
  stageStrip: "Stages",
  waitsOn: "Waits on",
  noWaits: "No task waits on another.",
  tableTitle: "Task",
  tableStage: "Stage",
  tableType: "Type",
  tableLabels: "Labels",
  tableChanged: "Changed",
  todos: (done: number, total: number) => `${done} of ${total} to-dos`,
  emptyTitle: "Nothing on the board yet",
  emptyLine: "Caw plans the work into tasks here; add one by hand above.",
  askCawPlan: "Ask Caw to plan the work",
  movesOff: "Moves wait until the hub answers again.",
  stageUnread: "This stage could not be read. Its last cards are kept.",

  // A card's attempt and wait, in words beside its glyph.
  attempt: {
    working: "Working",
    queued: "Queued",
    needs: "Needs you",
    failed: "Failed",
    blocked: "Blocked",
    landed: "Landed",
  },

  // Routines.
  proposed: "Proposed",
  routinesHead: "Routines",
  approve: "Approve",
  decline: "Decline",
  runNow: "Run now",
  pause: "Pause",
  resume: "Turn on",
  change: "Change",
  deleteRoutine: "Delete routine",
  recentRuns: "Recent runs",
  instruction: "What each run does",
  nextRun: (when: string) => `next ${when}`,
  lastRun: (outcome: string, ago: string) => `${outcome} ${ago}`,
  off: "Off",
  on: "On",
  outcomes: {
    ran: "Ran",
    silent: "Nothing new",
    failed: "Failed",
    delivered: "Delivered",
  },
  noRoutinesTitle: "No routines yet",
  noRoutinesLine:
    "Work that should happen on a schedule or on an event runs here.",
  askCawRoutine: "Ask Caw for a routine",
  proposedNone: "Nothing waits on your yes.",
  routinePane: "Routine",

  // Decisions.
  decisionGroups: {
    waits: "Waits on you",
    sent: "Sent",
    decided: "Decided",
  },
  picked: (picked: number, total: number) => `${picked} of ${total} picked`,
  unsent: (count: number) => `${count} unsent`,
  after: "after",
  unlocks: "unlocks",
  madeTasks: (count: number) => plural(count, "task", "tasks"),
  makeTasks: "Make tasks",
  noneYet: "none yet",
  searchDecisions: "Search what was chosen and why",
  noDecisionsTitle: "No decisions yet",
  noDecisionsLine:
    "When Caw or a session lays out choices, they wait here for your picks.",
  askCawDecide: "Ask Caw what needs deciding",

  // Outputs.
  outputsKinds: {
    all: "All",
    post: "Post",
    markdown: "Markdown",
    picture: "Picture",
    media: "Video or audio",
    file: "File",
    preview: "Preview",
    canvas: "Canvas",
    choices: "Choice set",
  },
  outputsKindsLabel: "Kinds",
  groupBy: "Group",
  byTask: "By task",
  newest: "Newest",
  searchOutputs: "Search outputs",
  isNew: "new",
  alternates: (count: number) => `+${count} alternates · media plan`,
  cannotServe: "The hub cannot serve it",
  openFile: "Open file",
  noOutputsTitle: "Nothing made yet",
  noOutputsLine:
    "Posts, files, pictures and previews the work makes land here, each with its task.",
  askCawOutputs: "Ask Caw to start the first piece",

  // Caw.
  cawStatus: {
    working: "Working",
    needs: "Needs you",
    idle: "Idle",
    off: "Off",
    unreachable: "Unreachable",
  },
  events: "Project events reach Caw",
  turnOff: "Turn off Caw",
  turnOn: "Turn on Caw",
  openSession: "Open as its own session",
  newConversation: "New conversation",
  older: "Older conversations",
  sessionsHead: "Sessions on this project",
  attemptOf: (task: string) => `attempt on ${task}`,
  spunOff: "spun off",
  spinMachine: "Machine",
  spinHarness: "Harness",
  spinType: "Delegate type",
  spinComes:
    "Comes along: the project's 6 skills and its MCP servers x-use, github and monid.",
  startSession: "Start session",
  spinOff: "Spin off a session",
  noSessions: "No sessions yet",
  starters: "Starters",
  starterHint: "A starter fills the field; nothing sends until you do.",
  askCaw: "Ask Caw",
  send: "Send",
  cawOffLine:
    "Caw is off. Turn him on to talk, and project events reach him again.",
  cawUnreachable:
    "obelisk-of-light stopped answering (timeout). The conversation holds its place. Check the machine, then Turn on Caw.",
  sessionsStale: "Sessions are stale; the conversation is live.",
  freshConversation:
    "A fresh conversation. Start from a starter or your own words.",
  closeCaw: "Close Caw",

  // The task pane's stand-in.
  taskPane: "Task",
  taskStandIn:
    "The task opens here whole: what the session said and showed, what to check, and its moves. Its insides are designed separately.",
  closeTask: "Back to the board",
  decisionStandIn:
    "The decision page opens here at its first open question; Send wakes the session that asked.",
  outputStandIn:
    "The output opens here whole, with Open file for the file itself and its task one press away.",
  wordmark: "Caw&Co",

  // The sheets under More.
  spendTitle: "Spend",
  today: "Today",
  thisMonth: "This month",
  capLine: (cap: string) => `Cap ${cap} a day`,
  capStops:
    "At the cap, dispatch pauses: no new attempt starts until the next day or a raised cap. Running sessions finish their turn.",
  configureTitle: "Configure",
  configureSections: {
    setup: "How it runs",
    places: "Places and wiring",
    decides: "Who decides",
    events: "Events",
    account: "Account",
  },
  forget: "Forget project…",
  deleteProject: "Delete project…",
  forgetAsk: (name: string) => `Forget ${name}?`,
  forgetLine: (running: number) =>
    `Its files stay where they are. ${plural(running, "running session stops", "running sessions stop")} first.`,
  deleteAsk: (name: string) => `Delete ${name}?`,
  deleteLine: (running: number) =>
    `Its folder on the hub, its browser and its volume are removed. ${plural(running, "running session stops", "running sessions stop")} first. This cannot be undone.`,
  forgetVerb: "Forget project",
  deleteVerb: "Delete project",
  cancel: "Cancel",
  close: "Close",

  // Reads.
  loading: "Reading the project…",
  partial: (place: string) =>
    `${place} could not be read (502). Its last good rows are kept; Retry reads it again.`,
  retry: "Retry",
} as const;
