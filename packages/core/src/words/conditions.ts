/**
 * What a condition says to the person: a routine that answers a question
 * (hub routines.ts, `condition`), which tasks and plan steps wait on with
 * `routine:<handle>` (hub task-waits.ts). Its states and flags on a task's
 * waits, its row in a task's view (the dashboard's tasks/TaskNeeds), its
 * fields in the routine form, its block in a routine's detail, and the
 * lines the hub writes in the project's conversation and pushes when a
 * condition is met or stops.
 *
 * A condition's statement is the person's or an agent's own words, true
 * once met: "GitHub Event Streams is generally available". A reason or
 * evidence is one sentence a check run gave, shown as it was said.
 */

/** Where a condition stands (core routine-kinds.ts `ConditionState`). */
export const conditionStateWords = {
  checking: "checking",
  "not-yet": "not yet",
  "could-not-check": "could not check",
  met: "met",
  "timed-out": "timed out",
  failing: "checks failed",
  paused: "paused",
  deleted: "deleted",
} as const;

/** What a check run answered (core routine-kinds.ts `RoutineVerdict`), in a routine's runs. */
export const verdictWords = {
  met: "Met",
  unmet: "Not yet",
  unknown: "Could not check",
} as const;

export const conditionWords = {
  // --- a wait's flag: said after the condition's statement, on the card's
  // hover and in the task's relations ("Blocked: <statement> <flag>").

  /** Its deadline passed unmet, and the hub stopped checking. */
  flagTimedOut: (date: string) => `was not met by ${date}`,
  /** Three checks in a row failed, and the hub stopped checking. */
  flagFailing: "could not be checked 3 times in a row",
  /** A person or a session paused its routine. */
  flagPaused: "is paused",
  /** Its routine was deleted. */
  flagDeleted: "was deleted",
  /**
   * A task's file names a routine that has no condition (written by hand),
   * so no check will ever say it is met. Said after the routine's name.
   */
  flagNoCondition: "has no condition to wait on",
  /** What a wait on a deleted condition is called, its statement gone with it. */
  deletedLabel: "A condition",

  // --- a task's view: the condition's row under "Waits on", by its state.

  /** Checking: no check has answered yet. */
  checkingLine: "No check has answered yet.",
  /** Not yet, could not check, timed out: when it was last checked. */
  checkedAt: (ago: string) => `Checked ${ago}`,
  /** Not yet: when it checks next. */
  nextCheckAt: (when: string) => `next check ${when}`,
  /** Not yet, with nothing waiting... never: a waited-on check always has a next one. Its deadline. */
  stopsAt: (date: string) => `stops checking ${date}`,
  /** Not yet, with no deadline. */
  noDeadline: "checks until met",
  /** Could not check: the run's own words on why. */
  couldNotCheck: (why: string) => `Last check: ${why}`,
  /** Could not check: when the next slot tries again. */
  triesAgainAt: (when: string) => `tries again ${when}`,
  /** Met by a check: its evidence and when. */
  metBy: (evidence: string, ago: string) => `Met ${ago}: ${evidence}`,
  /** Met because the person said so. */
  markedMet: (ago: string) => `You marked it met ${ago}.`,
  /** Timed out: its date, and the last check's reason. */
  timedOut: (date: string, reason: string | null) =>
    `Not met by ${date}, so checking stopped.${reason ? ` Last check: ${reason}` : ""}`,
  /** Failing: the last error. */
  failing: (error: string | null) =>
    `Its check failed 3 times in a row, so checking stopped.${error ? ` Last error: ${error}` : ""}`,
  /** Paused. */
  paused: "Nothing checks it while it is paused.",
  /** Deleted. */
  deleted: "It was deleted, so it will never be met.",

  // --- a task's view: what the person can do to a condition holding a task.

  /** Takes this task's wait away; the condition and the other tasks on it stay. */
  startAnyway: "Start anyway",
  /** Sets the condition met: every task and step waiting on it goes ahead, and its check stops. */
  markMet: "Mark met",
  /** Mark met's ask, beside the condition before it goes: what it reaches. */
  markMetAsk:
    "Every task and plan step waiting on it goes ahead, and checking stops. What starts can't be held again.",
  /** The ask's way back. */
  cancel: "Cancel",
  /** Checks it once now, and from now on: a met one is un-met first. */
  checkAgain: "Check again",
  /** A timed-out condition, checked again until a new date (none: until met). */
  keepChecking: "Keep checking",
  /** Keep checking's date field. */
  keepCheckingUntil: "Until",
  /** Under the date field. */
  keepCheckingHint: "Left empty, it checks until it is met.",
  /** A paused condition, checked again. */
  resume: "Resume",
  /** An act the hub refused, under the row: what did not happen, then the hub's own sentence. */
  refusedMarkMet: (why: string) => `It wasn't marked met. ${why}`,
  refusedCheckAgain: (why: string) => `It wasn't checked again. ${why}`,
  refusedResume: (why: string) => `It wasn't resumed. ${why}`,
  refusedStartAnyway: (why: string) => `The task still waits. ${why}`,

  // --- the routine form.

  conditionLabel: "Condition",
  conditionPlaceholder: "GitHub Event Streams is generally available",
  conditionHint:
    "Optional. Each run checks whether this is true yet, and tasks can wait on it. It runs only while something waits on it, and stops for good once it is met.",
  deadlineLabel: "Stop checking on",
  deadlineHint:
    "Optional. If it isn't met by then, the tasks waiting on it show as blocked and you are told once. Left empty, it checks until it is met.",
  /** A deadline the form will not send. */
  deadlinePast: "Choose a day after today.",
  /** A deadline with no condition. */
  deadlineNeedsCondition:
    "The date is for a condition. Write the condition, or clear the date.",

  // --- a routine's detail.

  /** The block's head. */
  conditionHead: "Condition",
  /** What waits on it: tasks by id, and plan steps by count. */
  waitedBy: (tasks: number, steps: number) =>
    tasks + steps === 0
      ? "Nothing waits on it, so no check runs."
      : `${tasks > 0 ? `${tasks} ${tasks === 1 ? "task" : "tasks"}` : ""}${tasks > 0 && steps > 0 ? " and " : ""}${steps > 0 ? `${steps} plan ${steps === 1 ? "step" : "steps"}` : ""} ${tasks + steps === 1 ? "waits" : "wait"} on it.`,

  // --- what the hub writes in the project's conversation, and pushes.

  /** One quiet line in the conversation when a check says met: no one is woken. */
  metNote: (statement: string) => `Condition met · ${statement}`,
  /** Under it: the evidence. */
  metNoteBody: (evidence: string) => evidence,
  /** The person marked it met (no evidence). */
  markedMetNote: (statement: string) =>
    `You marked a condition met · ${statement}`,
  /** Its deadline passed unmet: said once, in the conversation and as a push. */
  timedOutNote: (statement: string, date: string) =>
    `Condition not met by ${date} · ${statement} · needs you`,
  /** Three failing checks in a row: said once. */
  failingNote: (statement: string) =>
    `Condition check failed 3 times · ${statement} · needs you`,
  /** Under either: what the person can do. */
  stoppedNoteBody: (last: string | null) =>
    `Checking stopped, and each task waiting on it is blocked. Open one to check the condition again, start that task anyway, or mark the condition met.${last ? `\n\nLast check: ${last}` : ""}`,
  /** A session made a condition: its notice's line, beside the session's why. */
  madeLine: (statement: string, until: string | null) =>
    `Condition · ${statement} · ${until ? `stops checking ${until}` : "checks until met"}`,
  /** Why its routine is off, as the routines page says it. */
  offMet: "Its condition was met, so it stopped checking.",
  offTimedOut: (date: string) =>
    `Its condition was not met by ${date}, so it stopped checking.`,
  offFailing: "Its check failed 3 times in a row, so it stopped checking.",
} as const;

/**
 * A command check's words (hub routines.ts `fireCommand`): a condition
 * answered by a shell command's exit code, with no model. Each reason is
 * one run's, shown where a check run's words are (a task's Waits on row,
 * the routine's runs), with the command's last line of output as it said
 * it when it said one.
 */
export const commandCheckWords = {
  /** Exit 0, with the command's last line of output. */
  met: (said: string | null) => said ?? "The command succeeded (exit 0).",
  /** Any exit but 0 and the could-not-check ones: why not yet. */
  unmet: (code: number, said: string | null) =>
    `The command did not succeed (exit ${code})${said ? `: ${said}` : "."}`,
  /** Ran past its limit: the hub's runner stopped it (exit 124). */
  timedOut: (seconds: number) =>
    `The command ran past its ${seconds} s limit, so it was stopped.`,
  /** Exited 124 itself, well inside its limit: a timeout of its own (`timeout 5 curl …`). */
  timedOutItself: (said: string | null) =>
    `The command timed out (exit 124)${said ? `: ${said}` : "."}`,
  /** Exit 126: found, but not runnable. */
  notRunnable: (said: string | null) =>
    `A program the command needs was found but can't be run (exit 126)${said ? `: ${said}` : "."}`,
  /** Exit 127: not found. */
  notFound: (said: string | null) =>
    `A program the command needs was not found (exit 127)${said ? `: ${said}` : "."}`,
  /** Exit 128 + n: ended by signal n. */
  signalled: (signal: number) =>
    `The command crashed or was killed (signal ${signal}, exit ${128 + signal}).`,
  /** The hub or its machine stopped it before it finished. */
  stopped: "CawCo stopped the command before it finished.",
  /** Its machine could not run it at all: the machine's words. */
  unrun: (why: string) => `The command could not be started: ${why}`,
  /** Its workspace could not be cut: the hub's words. */
  uncut: (why: string) =>
    `The command's copy of the project could not be made: ${why}`,
  /** Its machine is paused: the run is skipped, as a delegate run is. */
  paused: (why: string) => `The command did not run: ${why}`,
  /** The hub stopped while its command ran: that run is over, its sandbox let go of. */
  hubStopped: "The hub stopped while the command was running.",
  /** A session made a command check: under the notice's line, the command it runs, whole. */
  madeCommand: (command: string) =>
    `Each check runs this command in a sandboxed copy of the project, on the project's machine. The condition is met when the command succeeds (exit 0).\n\n${command}`,
  /** A session changed the command a check runs, in a mode that runs commands unasked: the notice's line. */
  changedNote: (name: string) =>
    `A session changed the command a check runs: ${name}`,
  /** The approval card's line for a command check a session asks to make. */
  askMake: (name: string) => `Set up a check that runs a command: ${name}`,
  /** The approval card's line for a change to the command a check runs. */
  askChange: (name: string) => `Change the command a check runs: ${name}`,
  /** Under it: the condition its exit code answers. */
  askCondition: (statement: string) =>
    `Condition · ${statement} · met when the command succeeds (exit 0)`,
  /** Under it: the command it runs now, whole. */
  changedBody: (command: string) => `It runs this command now:\n\n${command}`,
} as const;
