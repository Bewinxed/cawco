/**
 * What the "stage and ledger" prototype of a task says (the dashboard's
 * prototypes/task/stage-and-ledger): a task opened from its project's
 * board, the stage drawing what this stage kind makes central and the
 * ledger strip beside it holding the rest. One of three structures drawn
 * for the person to pick from; its words live apart until one is picked.
 */
export const taskStageLedgerWords = {
  // The head.
  backToBoard: "Back to the board",
  backToTask: (title: string): string => `Back to ${title}`,
  openSession: "Open session beside",
  closeSession: "Close session",
  more: "More",
  passOn: "Pass on",
  passingOn: "Passing on…",
  sendBack: "Send back",
  sendingBack: "Sending back…",
  /** The head's More menu. */
  moveTo: "Move to…",
  drop: "Drop…",
  reopen: "Reopen",
  archive: "Archive",
  link: "Link…",

  // Liveness, one word each, derived on every read.
  liveness: {
    needsYou: "Needs you",
    working: "Working",
    asking: "Asking",
    queued: "Queued",
    blocked: "Blocked",
    ready: "Ready",
    idle: "Nobody on it",
    stopped: "Stopped",
    failed: "Failed",
    landing: "Landing",
    done: "Done",
    dropped: "Dropped",
  },
  /** The stage kinds, as the stage's chip reads them out. */
  kinds: {
    todo: "to do",
    active: "active",
    waiting: "waiting",
    you: "yours",
    done: "done",
    dropped: "dropped",
  },
  stageChip: (stage: string, kind: string): string => `${stage}, ${kind}`,

  // The stage: the result.
  handedIn: (session: string, at: string): string =>
    `Handed in by ${session}, ${at}`,
  namedInComment: (who: string, at: string): string =>
    `Named in a comment by ${who}, ${at}. No session handed in a result.`,
  noResult:
    "No session handed in a result, and no comment or note names one. Its history says how it got here.",
  openArtifact: "Open page",
  attached: "Handed in",
  landedCommits: "Commits",
  /** The checks strip at the result's foot. */
  checks: "What to check",
  checksSession: "The session's list",
  checksAcceptance: "Acceptance criteria",
  checksMerge: "Merge checks",
  checkPassed: "Passed",
  checkToCheck: "To check",
  checkNotShown: "Not shown met",
  checkNotShownScore: (score: string): string => `Not shown met (${score})`,

  // The stage: the live attempt.
  sessionWorking: "Working",
  doingNow: "Now",
  plan: "Its plan",
  planCount: (done: number, total: number): string => `${done} of ${total}`,
  offered: "Offered, not agreed",
  nobodyOnIt: "Nobody is working on it",
  nobodyWhy: (stage: string, since: string): string =>
    `It has been in ${stage} since ${since} with no attempt. Nothing in this stage starts one.`,
  startAttempt: "Start attempt",
  startingAttempt: "Starting…",

  // The stage: the wait map.
  waitsOn: "Waits on",
  thisTask: "This task",
  unblocks: "Unblocks",
  unblocksNone: "Nothing waits on it.",
  unblocksCount: (count: number): string =>
    count === 1 ? "1 task waits on it" : `${count} tasks wait on it`,
  waitsOnNothing: "Waits on nothing.",
  showAll: (count: number): string => `Show all ${count}`,
  showFewer: "Show fewer",
  readyWhen: (count: number): string =>
    count === 1
      ? "Ready once this settles."
      : `Ready once all ${count} settle.`,
  inherited: (from: string): string => `Through ${from}`,
  own: "Its own",
  settled: "Settled",
  blockedForGood: "Blocked for good",
  waitKinds: {
    task: "Task",
    card: "Decision",
    pin: "Pin",
    pr: "Pull request",
    run: "Run",
    session: "Session",
  },
  openIt: "Open",
  openWait: (label: string): string => `Open ${label}`,
  settledWith: (value: string): string => `Answered: ${value}`,

  // The stage: outputs.
  outputs: "What landed",
  landedOn: (where: string, at: string): string => `Landed on ${where}, ${at}`,
  onMain: "main",
  commit: "Commit",
  page: "Page",

  // The stage: failure.
  stoppedHow: (how: string, at: string): string => `${how}, ${at}`,
  reportedTo: (who: string): string => `Reported to ${who}, who started it.`,
  retry: "Retry",
  retrying: "Retrying…",
  retryCarries:
    "A fresh attempt starts in the same workspace, told how the last one ended.",
  openTranscript: "Open transcript",

  // The stage: dropped.
  droppedBy: (who: string, at: string): string => `Dropped by ${who}, ${at}`,
  reopenInto: (stage: string): string => `Reopen in ${stage}`,

  // The ledger: moves.
  note: "Note",
  notePlaceholder: "What should change, or why it's good",
  noteGoes: "Goes with either move, or stays on the task as a comment.",
  comment: "Comment",
  passOnTo: (stage: string, filer: string): string =>
    `Pass on → ${stage}. ${filer} filed it and hears it, and decides what comes next.`,
  passOnToNobody: (stage: string): string =>
    `Pass on → ${stage}. Nobody filed it who will hear it, so what comes next is yours.`,
  sendBackTo: (stage: string, by: "attempt" | "start" | "nobody"): string => {
    switch (by) {
      case "attempt":
        return `Send back → ${stage}. Its session carries on, your note with it.`;
      case "start":
        return `Send back → ${stage}. A new session starts on it, your note with it.`;
      case "nobody":
        return `Send back → ${stage}. Nobody is on it there until someone starts it.`;
      default:
        return `Send back → ${stage}.`;
    }
  },
  /** Asking in the page, under Send back. */
  sendBackAsk: (stage: string): string => `Send it back to ${stage}?`,
  sendBackAskWhy:
    "Nobody is on it there until someone starts it. Your note goes with it.",
  cancel: "Cancel",
  /** The hub's refusal stands under the moves in its own words. */
  refusedHead: "The hub refused the move",
  stillOpen: (moves: string): string => `Open to you from here: ${moves}.`,

  // The ledger: Now.
  now: "Now",
  nowYours: (stage: string, since: string): string =>
    `In ${stage}, waiting on you since ${since}.`,
  nowWorking: (stage: string, since: string): string =>
    `In ${stage}. Its attempt has run since ${since}.`,
  nowBlocked: (stage: string, count: number): string =>
    `In ${stage}. Not ready: ${count === 1 ? "1 wait is" : `${count} waits are`} open.`,
  nowReady: (stage: string): string =>
    `In ${stage}. Ready: this project doesn't start attempts on its own.`,
  nowIdle: (stage: string): string => `In ${stage}, and nobody is on it.`,
  nowStopped: (stage: string): string =>
    `Back in ${stage}. Its last attempt was stopped, so dispatch leaves it.`,
  nowDropped: (stage: string): string => `In ${stage}.`,
  nowLanding: "Approved. Landing on main…",
  nowLanded: (at: string): string => `In done. Landed on main ${at}.`,
  nowMovePending: (stage: string): string => `Moving to ${stage}…`,
  stale: (at: string): string =>
    `The hub isn't answering. This is its last read, from ${at}. Moves wait until it answers.`,

  // The ledger: the session's ask.
  asks: "Asks",
  askFrom: (session: string, ago: string): string => `${session}, ${ago}`,
  approve: "Approve",
  deny: "Deny",
  answered: (answer: string, at: string): string => `${answer} ${at}`,
  approved: "Approved",

  // The ledger: who.
  who: "Who did it",
  sessionDone: "Finished",
  sessionWorkingNow: "Working",
  sessionStopped: "Stopped",

  // The ledger: decisions it rests on.
  decisions: "Built on",

  // The ledger: waits.
  waits: "Waits",

  // The ledger: attempts.
  attempts: "Attempts",
  attemptsNone: "None yet.",
  attemptRow: (started: string, took: string): string => `${started} · ${took}`,
  attemptLive: "Running",
  attemptDone: "Handed in",
  attemptStopped: "Stopped",
  attemptFailed: "Failed",

  // The ledger: say something.
  say: "Say something",
  sayPlaceholder: "Write to the task",
  sayToSession: (session: string): string =>
    `Goes to ${session} at its next step.`,
  sayToFile: "Waits in the file for the next attempt.",
  sayClosed: "Stays in the file. Nothing reads it unless the task reopens.",
  send: "Send comment",

  // The ledger: history.
  history: "History",
  historyCount: (count: number): string =>
    count === 1 ? "1 change" : `${count} changes`,

  // The ledger: the file.
  file: "File",
  fileHint: "The brief as the attempt reads it, how it runs, and links",
  backToLedger: "Back to the ledger",
  brief: "Brief",
  description: "Description",
  acceptance: "Acceptance criteria",
  acceptanceNone: "None yet. An attempt is judged against these.",
  addAcceptance: "Write acceptance criteria",
  saveAcceptance: "Save criteria",
  saving: "Saving…",
  savedAs: (commit: string): string => `Saved by the hub as ${commit}.`,
  todos: "To-dos",
  todosNone: "None.",
  promote: "Make a task",
  mergeChecks: "Merge checks",
  howItRuns: "How it runs",
  type: "Delegate type",
  typeDefault: "The stage's, else the hub's default",
  lands: "Lands",
  landsProject: "As the project lands",
  runsOn: "Runs on",
  runsOnProject: "The project's machines",
  owns: "Owns",
  budget: "Budget",
  budgetNone: "No budget set",
  labels: "Labels",
  fields: "Project fields",
  readyRequires: "Ready requires",
  requireTodo: "In a to-do stage",
  requireWaits: "Every wait settled",
  requireNoAttempt: "No live attempt",
  requireNotHeld: "Nothing holding it",
  readyNow: "Ready.",
  links: "Links",
  linksNone: "No tracker record or outside link.",
  foundIn: "Found in",
  closedFile:
    "A task that is done or dropped takes no edits. Reopen it to change what an attempt reads.",
  refusedField: "The hub refused the change",

  // The session beside.
  transcript: "Transcript",
  sessionStoppedAnswering: (session: string): string =>
    `${session} stopped answering. The transcript holds its place.`,
  retryRead: "Retry",

  // The phone's drawer.
  drawer: "The task's ledger",
  drawerNext: "Show the whole ledger",

  // Loading.
  loading: "Reading the task…",
} as const;
