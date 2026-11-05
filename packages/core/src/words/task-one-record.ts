/**
 * The words of the "One record" prototype of a task opened from its
 * project's board (apps/dashboard/src/lib/prototypes/task/one-record): the
 * task told as the record of what happened to it, oldest to newest, the
 * person's acts standing inside the entries they answer, a state line under
 * the head with its two doors (the waits and the file), and what an entry
 * opens beside the record on a desk or in its place on a phone. Labels come
 * from the task's objects (task, stage, kind, attempt, wait, decision page,
 * to-do, comment); an act's label is its verb and its object.
 */

/** A count of things with its noun, singular at one. */
const count = (n: number, one: string, many: string): string =>
  `${n} ${n === 1 ? one : many}`;

export const taskOneRecordWords = {
  /* ---- The head ------------------------------------------------------ */
  backToBoard: "Back to the board",
  backToTask: "Back to the task",
  openSession: "Open session",
  more: (title: string): string => `More for ${title}`,
  close: (what: string): string => `Close ${what}`,
  passOn: (stage: string): string => `Pass on to ${stage}`,
  passingOn: "Passing on…",
  sendBack: (stage: string): string => `Send back to ${stage}`,
  sendingBack: "Sending back…",

  /* ---- More ------------------------------------------------------------ */
  moveTo: "Move to",
  moveToStage: (stage: string): string => `Move to ${stage}`,
  /** Who takes the task up in a stage it is moved to, by the stage's kind. */
  takesUp: {
    todo: "Waits for an attempt",
    active: "Starts an attempt",
    you: "Waits on you",
    done: "Closes it",
    dropped: "Asks a reason",
  },
  dropTask: "Drop task…",
  reopenTask: "Reopen task…",
  archiveTask: "Archive task",
  copyLink: "Copy link",

  /* ---- The state line --------------------------------------------------- */
  /** The words for a stage's kind, after its name. */
  kind: {
    todo: "to do",
    active: "active",
    waiting: "waiting",
    you: "yours",
    done: "done",
    dropped: "dropped",
  },
  /** The liveness word, derived on every read. */
  live: {
    needsYou: "Needs you",
    working: "Working",
    asking: "Asking",
    queued: "Queued",
    blocked: "Blocked",
    ready: "Ready",
    failed: "Failed",
    stopped: "Stopped",
    landing: "Landing",
    landed: "Landed",
    dropped: "Dropped",
    idle: "Idle",
  },
  /** The waits door: how many, and how many of those settled. */
  waitsOn: (all: number, settled: number): string =>
    settled === 0 ? `Waits on ${all}` : `Waits on ${all} (${settled} settled)`,
  unblocks: (n: number): string => `Unblocks ${n}`,
  fileDoor: "File",
  /** Why it is not running, when it is ready and still nobody is on it. */
  waitsForDispatch: "Ready; dispatch starts it when a slot is free",
  /** The record's day heads. */
  today: "Today",
  yesterday: "Yesterday",

  /* ---- Entries ---------------------------------------------------------- */
  entry: {
    filed: "Filed",
    filedFrom: "made from",
    triaged: "Triaged",
    briefChanged: "Brief changed",
    moved: "Moved",
    attemptStarted: "Attempt started",
    attemptRunning: "Attempt running",
    sessionAsks: "Session asks",
    actionFiled: "Action filed",
    attemptEnded: "Attempt ended",
    handedIn: "Handed in",
    refused: "Hub refused",
    waitSettled: "Wait settled",
    comment: "Comment",
    landed: "Landed",
    dropped: "Dropped",
    todosAdded: "To-dos added",
  },
  /** Where a filed task started. */
  inStage: (stage: string): string => `In ${stage}`,
  /** An older attempt folded to one line, by its number. */
  attemptLine: (n: number): string => `Attempt ${n}`,
  /** How many entries an older attempt folds. */
  folded: (n: number): string => count(n, "entry", "entries"),
  unfoldAttempt: (n: number): string => `Show attempt ${n}`,
  foldAttempt: (n: number): string => `Fold attempt ${n}`,
  /** A session's to-dos ticking: agreed done of agreed. */
  todos: (done: number, total: number): string => `${done} of ${total} to-dos`,
  todosOffered: (n: number): string =>
    `${count(n, "to-do", "to-dos")} offered, not counted`,
  stopAttempt: "Stop attempt",
  retryAttempt: "Retry attempt",
  retrying: "Starting…",
  /** Who heard a failure: its starter. */
  reportedTo: (who: string): string => `Reported to ${who}`,
  /** A session ask, answered or waiting. */
  approve: "Approve",
  deny: "Deny",
  answered: (answer: string, who: string): string => `${answer} by ${who}`,
  askAgo: (minutes: number): string =>
    minutes < 1 ? "just now" : `${minutes} min ago`,
  /** The handed-in entry. */
  result: "Result",
  openResult: "Open result",
  checks: "Checks",
  checkSource: {
    session: "Session",
    acceptance: "Acceptance",
    merge: "Merge check",
  },
  checkState: {
    passed: "Passed",
    notShown: "Not shown met",
    toCheck: "To check",
    notRun: "Not run",
  },
  /** Jev's judgement of a criterion, as a share. */
  confidence: (share: number): string => `${Math.round(share * 100)}%`,
  /** A landed entry's commit, and an output the hub doesn't hold yet. */
  commit: "Commit",
  notHeldYet: "The hub does not hold this file yet",
  readAgain: "Read again",
  reopenInto: (stage: string): string => `Reopen into ${stage}`,
  closeReason: "Reason",

  /* ---- Asking in the page ------------------------------------------------ */
  cancel: "Cancel",
  sendBackAsk: (stage: string): string => `Send back to ${stage}?`,
  note: "What should change",
  dropAsk: "Drop this task?",
  dropConsequence:
    "It leaves the board for dropped. Reopen brings it back into a stage open to you.",
  dropReason: "Why",
  dropConfirm: "Drop task",
  dropping: "Dropping…",
  reopenAsk: (stage: string): string => `Reopen into ${stage}?`,
  reopenConsequence:
    "It goes back on the board, and dispatch can start an attempt on it.",
  reopening: "Reopening…",

  /* ---- Say something ------------------------------------------------------ */
  saySomething: "Say something",
  sendComment: "Send comment",
  sending: "Sending…",
  goesToSession: (session: string): string =>
    `Goes to ${session} at its next step.`,
  waitsInFile: "Waits in the file for the next attempt.",
  /** Where a sent comment went, on its entry. */
  reached: (session: string): string => `Reached ${session}`,
  waitedInFile: "Waits in the file",

  /* ---- Beside ------------------------------------------------------------ */
  beside: {
    result: "Result",
    waits: "Waits",
    file: "File",
    session: "Session",
    task: "Task",
  },
  /** Who handed the result in, and its state now. */
  handedInBy: "Handed in by",
  openTranscript: "Open transcript",
  presented: "Presented",
  commits: "Commits",
  report: "Report",
  /** The waits beside. */
  own: "Its own",
  inherited: (from: string): string => `Inherited from ${from}`,
  settled: "Settled",
  notSettled: "Not settled",
  blockedForGood: "Blocked for good",
  openIt: "Open it",
  rePoint: "Re-point…",
  removeWait: "Remove wait",
  settledWith: (value: string): string => `Settled with ${value}`,
  noWaits: "It waits on nothing.",
  whatItUnblocks: "Unblocks",
  /** Kinds of thing a wait points at, in the glyph's name. */
  waitKind: {
    task: "Task",
    card: "Decision",
    pin: "Pin",
    pr: "Pull request",
    run: "CI run",
    session: "Session",
  },
  /** The file beside. */
  brief: "Brief",
  acceptance: "Acceptance",
  todosHead: "To-dos",
  /** A to-do an attempt only offered, out of the count. */
  offered: "offered",
  howItRuns: "How it runs",
  runsAs: "Runs as",
  lands: "Lands",
  runsOn: "Runs on",
  hubDefault: "the hub's pick",
  projectDefault: "as the project lands",
  projectMachines: "the project's machines",
  readyRequires: "Ready requires",
  readyIn: "In a to-do stage",
  readySettled: "Every wait settled",
  readyFree: "Nothing holding it",
  links: "Links",
  labels: "Labels",
  startAttempt: "Start attempt",
  starting: "Starting…",
  editBrief: "Edit brief",
  saveBrief: "Save brief",
  saving: "Saving…",
  readOnlyDone:
    "Judged, done or dropped: no session reads this file again, so it is read-only.",
  /** Another task opened from a wait. */
  notInProject: "This task is not in the project.",

  /* ---- States -------------------------------------------------------------- */
  loading: "Reading the task…",
  stale: (at: string): string =>
    `The hub isn't answering. This is the read from ${at}; acts wait until it answers.`,
  staleAct: "Waits for the hub",
  resultMissing: (path: string): string =>
    `The hub does not hold ${path} yet. Read it again once the attempt's outputs are copied.`,
};
