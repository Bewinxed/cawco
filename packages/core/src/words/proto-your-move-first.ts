/**
 * What the "Your move first" prototype of a task's page says
 * (apps/dashboard/src/lib/prototypes/task/your-move-first/): one column whose
 * top block is chosen by the task's live state, then what changed since the
 * person looked, the work, its waits, the composer, its history and its
 * brief. A prototype's own words, apart from the shipped task's.
 */
export const yourMoveFirstWords = {
  head: {
    back: "Back to board",
    openSession: "Open session",
    closeSession: "Close session",
    more: "More",
  },
  /** The top block's heading and its shapes. */
  move: {
    heading: "Your move",
    /** What the session presented, drawn whole. */
    presented: "What it presented",
    report: "Its report",
    showReport: "Show the whole report",
    hideReport: "Show less",
    openResult: "Open in its own tab",
    /** The checks strip: the session's list, the acceptance criteria, the merge checks. */
    checks: "What to check",
    sessionChecks: "The session's checks",
    acceptance: "Acceptance criteria",
    mergeChecks: "Merge checks",
    met: "Shown met",
    notShownMet: "Not shown met",
    /** Jev's score beside a criterion it could not show met. */
    score: (score: string): string => `Jev's score ${score}`,
    mergePassed: "Passed",
    noMergeChecks: "This project names no merge checks.",
    whoDidIt: "Who did it",
    builtOn: "Built on",
    builtOnNone: "No decision. It was dispatched on none.",
    /** Where an approval goes. */
    goesToFiler: (filer: string): string =>
      `Passing it on tells ${filer}, who filed it.`,
    passOn: (stage: string): string => `Pass on → ${stage}`,
    passingOn: "Passing on…",
    sendBack: (stage: string): string => `Send back → ${stage}`,
    sendingBack: "Sending back…",
    note: "Note",
    notePlaceholder: "Travels with either move",
    leaveNote: "Leave as a comment",
    /** Who takes it up once it is sent back, by the hub's `sendBack.by`. */
    backToAttempt: "Its session carries on, your note with it.",
    backToStart: "A new session starts on it, your note with it.",
    backToNobody: (stage: string): string =>
      `Nobody takes it up. It waits in ${stage} until someone starts it.`,
    /** The hub did not answer a move: what happened, what is safe, the way on. */
    unanswered: (stage: string): string =>
      `The hub didn't answer (502). The task is still in ${stage}. Try the move again.`,
    tryAgain: "Try again",
    /** A session's ask. */
    asks: (session: string): string => `${session} asks`,
    approve: "Approve",
    deny: "Deny",
    approving: "Approving…",
    denying: "Denying…",
    answered: (at: string): string => `Answered at ${at}`,
    /** The newest attempt stopped. */
    stopped: "Its attempt stopped",
    stoppedHow: (how: string, at: string): string => `${how} at ${at}.`,
    /** The dispatcher started it, so its report went to the project's conversation. */
    reportedToProject: "Reported to the project's conversation.",
    retry: "Retry",
    retrying: "Retrying…",
    openTranscript: "Open its transcript",
    /** Nothing needs the person: one quiet line. */
    working: (session: string): string => `Working · ${session}`,
    waitingOn: (count: number): string =>
      `Waiting on ${count} ${count === 1 ? "thing" : "things"}`,
    ready: "Ready. Nothing has started it yet.",
    /** Done: what landed. */
    done: "Done",
    landed: (commit: string): string => `Landed ${commit}`,
    dropped: "Dropped",
    droppedBy: (who: string, at: string): string => `By ${who}, ${at}.`,
    reopen: "Reopen",
  },
  since: {
    heading: "Since you looked",
    nothing: "Nothing since you last looked.",
    showAll: "Show all history",
  },
  work: {
    heading: "The work",
    live: "Live attempt",
    started: (at: string): string => `Started ${at}`,
    todos: (done: number, total: number): string =>
      `${done} of ${total} to-dos`,
    offered: "Offered by the session",
    noAttempt: "No attempt yet.",
    noAttemptWhy: "Nothing has started one: it isn't in a ready stage.",
    pastAttempts: (count: number): string =>
      `${count} past ${count === 1 ? "attempt" : "attempts"}`,
    endedDone: "Handed in",
    endedStopped: "Stopped",
    endedFailed: "Failed",
    ran: (from: string, to: string): string => `${from} – ${to}`,
  },
  waits: {
    heading: "Waiting on",
    unblocks: "Unblocks",
    nothing: "Waits on nothing.",
    openIt: "Open it",
    rePoint: "Re-point",
    remove: "Remove",
    settled: "Settled",
    own: "Its own",
    inherited: (from: string): string => `From ${from}`,
    blockedForGood: "Blocked for good",
    kind: {
      task: "Task",
      card: "Decision",
      pin: "Pin",
      pr: "Pull request",
      run: "Run",
      session: "Session",
    },
    question: "Question",
    answer: "Answer",
    settledBy: "Settled by",
    notInProject: "This task is not in the project.",
    notInProjectFix: "Re-point the wait to a task that is, or remove it.",
    backTo: (title: string): string => `Back to ${title}`,
    moreTasks: (count: number): string => `and ${count} more`,
  },
  say: {
    heading: "Say something",
    placeholder: "Write to the session or the next attempt",
    send: "Send comment",
    sending: "Sending…",
    toLive: (session: string): string => `Goes to ${session} at its next step.`,
    toEnded: (session: string): string =>
      `${session} has ended: it continues with this.`,
    toFile: "Waits in the task for the next attempt.",
    comments: (count: number): string =>
      `${count} ${count === 1 ? "comment" : "comments"}`,
  },
  history: {
    heading: "History",
    from: (from: string, to: string): string => `${from} → ${to}`,
    madeIn: (stage: string): string => `made in ${stage}`,
    kind: { moved: "Moved", commented: "Commented", changed: "Changed" },
  },
  brief: {
    heading: "Brief & how it runs",
    title: "Title",
    description: "Description",
    acceptance: "Acceptance criteria",
    noAcceptance: "None written.",
    todos: "To-dos",
    howItRuns: "How it runs",
    type: "Delegate type",
    typeDefault: "The hub's default",
    lands: "Lands",
    landsDefault: "As the project lands",
    labels: "Labels",
    fields: "Project facts",
    filedBy: "Filed by",
    readyRequires: "Ready requires",
    readyMet: "Nothing missing.",
    startAttempt: "Start attempt",
    links: "Links",
    noLinks: "No tracker record or outside links.",
    readOnly: "A closed task's brief is read only.",
  },
  more: {
    moveTo: "Move to…",
    drop: "Drop…",
    reopen: "Reopen",
    archive: "Archive",
    link: "Link…",
  },
  /** Drop, asked in the page. */
  drop: {
    title: "Drop this task?",
    consequence: "It leaves the board. Reopen brings it back.",
    reason: "Why",
    reasonPlaceholder: "The reason goes in its history",
    cancel: "Cancel",
    confirm: "Drop task",
    dropping: "Dropping…",
  },
  sendBackTile: {
    title: (stage: string): string => `Send back to ${stage}?`,
    cancel: "Cancel",
  },
  session: {
    heading: "Session",
    loading: "Reading the transcript…",
    stoppedAnswering: (session: string): string =>
      `${session} stopped answering (timeout). Its work holds its place. Try again.`,
    tryAgain: "Try again",
    state: { working: "Working", idle: "Idle", asking: "Needs you" },
  },
  states: {
    stale: (at: string): string =>
      `The hub isn't answering. This is the read from ${at}.`,
  },
};
