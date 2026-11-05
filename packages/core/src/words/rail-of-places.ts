/**
 * What the "Places down the side" prototype of a project says
 * (apps/dashboard/src/lib/prototypes/project/rail-of-places/): the rail of
 * places with each one's live fact, Home's three groups, the board, the
 * routines, the decisions, the Outputs shelf, the sessions, the spend, Caw's
 * pane and the Configure sheet. A prototype's words, kept apart from the
 * product's until the person picks a structure; "Outputs" is the shelf's
 * working name until then.
 */
export const railOfPlacesWords = {
  // The places, in the rail's order.
  places: {
    home: "Home",
    tasks: "Tasks",
    routines: "Routines",
    decisions: "Decisions",
    outputs: "Outputs",
    sessions: "Sessions",
    spend: "Spend",
  },
  configure: "Configure",
  /** The rail's head: the way back to every project. */
  backToFleet: "Back to the fleet",
  /** The phone's bar: the places sheet. */
  openPlaces: "Places",
  closePlaces: "Close places",
  /** The rail's and the sheet's name for their list. */
  placesLabel: (project: string) => `${project}'s places`,

  // Each place's live fact on its rail row.
  needYou: (count: number) => (count === 1 ? "needs you" : "need you"),
  nothingNeedsYou: "nothing needs you",
  working: (count: number) => `${count} working`,
  stuck: (count: number) => `${count} stuck`,
  noneWorking: "none working",
  nextRun: (time: string) => `next ${time}`,
  failed: (count: number) => `${count} failed`,
  waits: (count: number) => (count === 1 ? "1 waits" : `${count} wait`),
  picked: (done: number, total: number) => `${done} of ${total} picked`,
  noneWaiting: "none waiting",
  newSince: (count: number) => `${count} new since you looked`,
  nothingNew: "nothing new",
  running: (count: number) => `${count} running`,
  noneRunning: "none running",
  spentOf: (spent: string, cap: string) => `${spent} of ${cap} today`,
  spentToday: (spent: string) => `${spent} today`,
  nothingYet: "nothing here yet",
  couldNotRead: "could not read",
  /** A count's place while the hub is not live (PRODUCT.md, How state is shown). */
  staleSince: (time: string) => `stale since ${time}, hub unreachable`,
  staleShort: (time: string) => `stale since ${time}`,
  /** The bar's word for a page whose rows are kept from the last good read. */
  staleRows: (time: string) =>
    `Kept from ${time}. The hub isn't answering, so nothing here can change until it is back.`,
  reading: "Reading…",

  // Caw's row at the rail's foot, and his pane.
  caw: "Caw",
  cawStatus: {
    working: "Working",
    asking: "Needs you",
    idle: "Idle",
    off: "Off",
    unreachable: "Unreachable",
  },
  openCaw: "Talk to Caw",
  closeCaw: "Close Caw",
  askCaw: "Ask Caw",
  newConversation: "New conversation",
  openAsSession: "Open as its own session",
  eventsReachHim: "The project's events reach him",
  turnOff: "Turn Caw off",
  turnOn: "Turn Caw on",
  cawOff:
    "Caw is off. Routines and reports still run, but nothing wakes him until you turn him on.",
  cawUnreachable: (machine: string) =>
    `Caw's machine, ${machine}, stopped answering. His conversation is kept; turn him on again once it's back.`,
  starters: "Starters",
  composerPlaceholder: "Tell Caw what to do next",
  harnessModel: (harness: string, model: string) => `${harness} · ${model}`,
  you: "You",

  // Home.
  needsYouGroup: "Needs you",
  workingGroup: "Working now",
  stagesGroup: "Stages",
  archive: "Archive",
  nothingNeedsYouTitle: "Nothing needs you",
  nothingNeedsYouWhy:
    "Every wait the project raises lands here, longest first, and is answered where it stands.",
  nothingRunning: "Nothing running",
  nothingRunningWhy:
    "Attempts, Caw and the sessions you spin off show here while they work.",
  needKinds: {
    task: "In your stage",
    failed: "Attempt failed",
    ask: "Session asks",
    picks: "Picks to make",
    action: "Approve the action",
    browser: "Browser ask",
    proposal: "Proposed type",
  },
  waited: (age: string) => `waited ${age}`,
  notNow: "Not now",
  approve: "Approve",
  deny: "Deny",
  decline: "Decline",
  open: "Open",
  openTask: (title: string) => `Open ${title}`,
  tryAgain: "Try again",
  takeOver: "Take over",
  openAtQuestion: (n: number) => `Open at question ${n}`,
  sendPicks: "Send picks",
  openSession: "Open session",
  stuckBecause: (cause: string) => `Stuck: ${cause}`,
  workStates: { working: "Working", queued: "Queued", stuck: "Stuck" },
  todos: (done: number, total: number) => `${done} of ${total} to-dos`,
  startStarter: "Ask Caw to plan the first tasks",

  // Tasks.
  views: {
    board: "Board",
    table: "Table",
    calendar: "Calendar",
    dependencies: "Dependencies",
  },
  noDates: "No task has a date yet",
  noEdges: "No task waits on another yet",
  searchTasks: "Search tasks",
  filters: { label: "Label", stage: "Stage", type: "Delegate type" },
  addTask: "Add task",
  composerTitle: "Title of the task",
  fileTask: "File task",
  filesInto: (stage: string) => `Files into ${stage}`,
  selectTasks: "Select tasks",
  stageUnread: (stage: string) =>
    `${stage} could not be read (the hub answered 502). The other stages are current.`,
  movesHeld: "Moves wait until the hub is back.",
  columns: {
    task: "Task",
    stage: "Stage",
    type: "Type",
    labels: "Labels",
    todos: "To-dos",
    changed: "Changed",
  },
  bringBack: "Move a task out of the archive to bring it back.",

  // Routines.
  proposedGroup: "Proposed",
  proposedEmpty: "Nothing proposed waits on you.",
  routinesGroup: "Routines",
  newRoutine: "New routine",
  byHand: "By hand",
  noRoutinesTitle: "No routines yet",
  noRoutinesWhy:
    "A routine runs on a schedule or on an event, and its first run happens as soon as you make it.",
  on: "On",
  off: "Off",
  lastRun: "Last run",
  outcomes: { ok: "Delivered", silent: "Nothing to say", failed: "Failed" },
  waitsOnTask: (title: string) => `waits on ${title}`,
  nextRunHead: "Next run",
  sourceFailing: (source: string) => `${source} is failing`,
  runNow: "Run now",
  pause: "Pause",
  change: "Change",
  deleteRoutine: "Delete routine",
  instruction: "What each run does",
  recentRuns: "Recent runs",
  produced: "Made",
  ranIn: "Ran in",
  runHeld: "Run now waits until the hub is back.",
  firedBy: "Fired by",
  expires: (when: string) => `expires ${when}`,
  from: (source: string) => `from ${source}`,
  closeRoutine: "Close routine",

  // Decisions.
  waitsOnYou: "Waits on you",
  sent: "Sent",
  decided: "Decided",
  noneYet: "none yet",
  searchChosen: "Search what was chosen and why",
  after: (name: string) => `after ${name}`,
  unlocks: (name: string) => `unlocks ${name}`,
  tasksMade: (count: number) =>
    count === 1 ? "1 task made" : `${count} tasks made`,
  makeTasks: "Make tasks",
  settledBy: (who: string) => `settled by ${who}`,
  sentAgo: (age: string) => `sent ${age} ago`,
  decisionPanel: "Decision page",
  decisionStandIn: (question: number) =>
    `The decision page opens here, at question ${question}`,
  decisionStandInWhy:
    "It is drawn by the decision page itself. Send wakes the session that wrote it.",
  closeDecision: "Close decision page",
  pageCouldNotRead: "Its page could not be read (404).",

  // Outputs.
  searchOutputs: "Search outputs",
  kinds: {
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
  groupBy: { task: "By task", newest: "Newest" },
  isNew: "New",
  openWhole: "Open whole",
  openFile: "Open file",
  notServed: (why: string) => `The hub can't serve it: ${why}`,
  outputsEmptyTitle: "Nothing made yet",
  outputsEmptyWhy:
    "Posts, pictures, files and pages the project's sessions make land here, with the task that made each.",
  promoted: "In the repository",
  alternates: (count: number) =>
    count === 1 ? "1 alternate" : `${count} alternates`,
  mediaPlan: "Media plan",

  // Sessions.
  spinOff: "Spin off a session",
  sessionKinds: {
    caw: "Caw's conversation",
    attempt: "Attempt",
    spun: "Spun off",
    routine: "Routine run",
  },
  noSessionsTitle: "No sessions",
  noSessionsWhy:
    "Caw's conversations, attempts on tasks and the sessions you start here are listed together.",
  comesAlong: "Comes along",
  startSession: "Start session",
  machine: "Machine",
  checkout: "Checkout",
  harness: "Harness",
  delegateType: "Delegate type",
  stop: "Stop",
  sessionStates: {
    working: "Working",
    needs: "Needs you",
    failed: "Failed",
    idle: "Idle",
    stopped: "Stopped",
  },

  // Spend.
  today: "Today",
  thisMonth: "This month",
  cap: (amount: string) => `cap ${amount}`,
  atCap: "At the cap",
  capStops:
    "When it reaches the cap, the hub starts no new attempts or routine runs for this project until the next day. Running sessions finish their turn.",
  noSpend: "Nothing spent today",
  changeCap: "Change cap",
  bySource: "Where it went",

  // Panes.
  closeTask: "Close task",
  taskStandIn: "The task opens here",
  inStage: (stage: string) => `In ${stage}`,
  taskStandInWhy:
    "Its insides are being designed apart from this page. Closing it brings you back to the same place.",

  // More, and the Configure sheet.
  more: "More",
  setUp: "Set up or change how it runs",
  placesWiring: "Places and wiring",
  spendCap: "Spend cap",
  forget: "Forget project…",
  delete: "Delete project…",
  closeConfigure: "Close Configure",
  forgetAsk: (project: string) => `Forget ${project}?`,
  forgetWhat: (running: number) =>
    running === 1
      ? "Its files stay where they are. 1 session still runs and stops first."
      : `Its files stay where they are. ${running} sessions still run and stop first.`,
  deleteAsk: (project: string) => `Delete ${project}?`,
  deleteWhat: (running: number) =>
    `${running} running sessions stop first, then its tasks, routines, browser and volume are removed. This cannot be undone.`,
  cancel: "Cancel",
  forgetVerb: "Forget project",
  deleteVerb: "Delete project",
  configureValues: {
    tracker: "CawCo's files",
    decides: "You, for every kind",
    account: "The fleet's routing",
    cap: (day: string, month: string) => `${day} a day · ${month} a month`,
  },
  configureRows: {
    stages: "Stages",
    types: "Delegate types",
    places: "Places",
    tracker: "Tracker",
    decides: "Who decides",
    events: "Events reach Caw",
    account: "Account",
    capRow: "Spend cap",
  },
} as const;
