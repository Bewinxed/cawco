/**
 * What a project's Routines page says (views/ViewRoutines.svelte and the
 * routines/ parts it draws): its three blocks, the routines ledger, a
 * routine's detail, the event sources, the approved actions, and the
 * schedule and times in words. For the dashboard and the native app alike.
 *
 * `bun run words` writes these into the app as `Words.Routines`
 * (CawCoCore/Words.generated.swift), and `words:check` fails the typecheck
 * chain when that file is stale. So a word is changed here or nowhere.
 */
export const routinesWords = {
  /** The strip's tab, and the page's first block. */
  tab: "Routines",
  sources: "Event sources",
  actions: "Approved actions",
  /** A block's needs-you mark, in words. */
  failing: (count: number) => `${count} failing`,
  waiting: (count: number) => `${count} waiting on you`,
  /** The routine form's name, read out (the app: its composer to Caw). */
  newRoutine: "New routine",
  /** The Routines block's way to Caw: the composer over the ledger. */
  askCaw: "Ask Caw",
  /** The Routines block's way by hand: the routine form over the ledger. */
  createRoutine: "Create routine",
  creating: "Creating…",

  // The routine form: what POST /api/routines takes, by hand.
  nameLabel: "Name",
  namePlaceholder: "Triage new issues",
  needsName: "Name it in 3 to 6 plain words.",
  nameTooLong: (length: number, max: number) =>
    `The name runs ${length} characters. Keep it to ${max}.`,
  promptLabel: "What each run does",
  promptPlaceholder:
    "Read the issues opened since the last run, label each one, and say which need me.",
  needsPrompt: "Say what each run does.",
  whenLabel: "When",
  whenHint: "Five cron fields: minute, hour, day, month, weekday.",
  whenPlaceholder: "0 9 * * 1-5",
  needsWhen: "Give a schedule in five cron fields, like 0 9 * * 1-5.",
  zoneLabel: "Time zone",
  typeLabel: "Delegate type",
  /** No type named: each run's is the hub's pick. */
  typeHubPick: "The hub's pick for each run",
  /** A refused read of the project's types: the hub's pick still stands. */
  typesUnread: (problem: string) =>
    `The project's delegate types couldn't be read: ${problem} Runs take the hub's pick.`,
  /** Under the schedule: its next run, on your clock. */
  nextRunAt: (when: string) => `Next run ${when}`,
  /** A schedule with no run in the next week. */
  noRunThisWeek: "No run in the next week",
  /** Beside Create: what making it does at once. */
  testRun: "It runs once as soon as it's made, as a test.",
  createFailed: (problem: string) =>
    `The routine wasn't created. ${problem} Your words stay here: change them, then create it again.`,
  /** The Event sources block's badge: events arrive as they happen, or only when polled. */
  relayLive: "Relay live",
  relayOff: "Relay off",
  polledOnly: "Only polled events arrive",
  /** The composer's placeholder: a routine in a sentence. */
  placeholder: "Every weekday at 09:00, triage…",

  // The ledgers' heads.
  columnState: "State",
  columnRoutine: "Routine",
  columnLastRun: "Last run",
  columnNextRun: "Next run",
  columnActions: "Actions",
  columnService: "Service",
  columnSource: "Source",
  columnLastRead: "Last read",
  columnAction: "Action",
  columnStatus: "Status",
  columnWhen: "When",
  columnOutcome: "Outcome",
  columnTook: "Took",
  columnResult: "Result",

  /** A routine's lead glyph, said: whether it runs, and how. */
  leadOn: "On, on a schedule",
  leadEvent: "On, on a schedule and when an event comes",
  leadPaused: "Paused",
  leadExpiring: "On, turning itself off",
  /** An agent's routine turning itself off, after its schedule. */
  offIn: (days: number) => `Off in ${days} ${days === 1 ? "day" : "days"}`,
  /** The schedule's hover: the exact next run, and each event that also runs it. */
  next: (exact: string) => `next ${exact}`,
  alsoWhen: (event: string) => `also when ${event}`,
  /** A route's event in words: its source's kinds, or events. */
  events: "events",
  onBranch: (branch: string) => `on ${branch}`,
  byAuthor: (author: string) => `by ${author}`,
  /** On a narrow ledger, Last and Next fold into the schedule's line. */
  lastShort: "Last",
  nextShort: "Next",

  // How a run went (RunStatus's words), and the Last and Next cells.
  never: "Never",
  notRunYet: "Not run yet",
  running: "Running",
  runningSince: (at: string) => `Running since ${at}`,
  queued: "Queued",
  skipped: "Skipped",
  failed: "Failed",
  stopped: "Stopped",
  silent: "Nothing to report",
  delivered: "Delivered",
  paused: "Paused",
  /** A run's word and its exact time, for a hover. */
  wordAt: (word: string, at: string) => `${word} · ${at}`,

  // A routine's ⋯.
  runNow: "Run now",
  pause: "Pause",
  resume: "Resume",
  keep: "Keep",
  remove: "Delete routine…",
  removeAsk: (name: string) =>
    `Delete ${name}? It stops now; its past runs stay in the project's history.`,
  removeConfirm: "Delete routine",
  /** The ask's own name, read out. */
  removeLabel: (name: string) => `Delete ${name}`,
  removing: "Deleting…",
  cancel: "Cancel",

  // The empty Routines block.
  empty: "No routines yet",
  /** What the empty page is for: its line whether or not Caw can start. */
  emptyWhat: (project: string) =>
    `Caw runs work for ${project} on a schedule, or when something happens.`,
  /** Caw can start: what the page is for, then what to tell him over his composer. */
  emptyCaw: (project: string) =>
    `Caw runs work for ${project} on a schedule, or when something happens. Say what, and when.`,
  /**
   * The app's empty page while Caw can't start (RoutinesPane.swift): what
   * the page is, then his reason as he gives it, a whole sentence saying why
   * and what to do (CAW_NO_MACHINE, his view's `problem`), never restated.
   * The dashboard stands `emptyWhat` over his reason's own line instead.
   */
  emptyOff: (problem: string) => `Caw makes routines. ${problem}`,
  /** His reason while none was given: the same sentence, his machine away. */
  away: "His machine is away, so he can't start. Bring it online and he can.",
  startersLabel: "Routines to ask Caw for",
  noSources:
    "No event sources yet. Caw connects one when a routine should start on an event, like a merged pull request.",
  // The empty Event sources block (the Empty recipe: title, line, one action).
  noSourcesTitle: "No event sources yet",
  noSourcesLine:
    "Caw connects one when a routine should start on an event, like a merged pull request.",
  connectSource: "Ask Caw for an event source",
  /** What the action puts in Caw's composer, unsent. */
  connectSourceAsk:
    "Connect an event source so a routine can start when something happens, like a merged pull request.",
  noActions:
    "Nothing yet. Caw asks you before a routine posts, emails or closes anything, and what you decide is kept here.",

  // An event source's Last read.
  noEvents: "No events yet",
  notReadYet: "Not read yet",
  read: "Read",
  /** How often a poll reads. */
  readByHub: "Read by the hub",
  everyMinute: "Read every minute",
  everyMinutes: (minutes: number) => `Read every ${minutes} minutes`,
  hourly: "Read hourly",
  everyHours: (hours: number) => `Read every ${hours} hours`,
  /** The repository's GitHub poller, before it knows its repository. */
  theRepository: "The repository",

  // The page unread.
  unavailable: "Routines are not available",
  unavailableLine: (project: string, problem: string) =>
    `The routines for ${project} could not be read: ${problem} Nothing was changed.`,
  retry: "Retry",

  // A routine opened in place.
  recentRuns: "Recent runs",
  more: "More",
  less: "Less",
  readRun: "Read the run",
  /** How long a run ran: under a minute, minutes, hours and minutes. */
  tookUnder: "<1m",
  tookMinutes: (minutes: number) => `${minutes}m`,
  tookHours: (hours: number, minutes: number) => `${hours}h ${minutes}m`,

  // An approved action's status, and where it came from.
  actionWaiting: "Waiting on you",
  actionApproved: "Approved",
  actionRunning: "Running",
  actionRan: "Ran",
  actionFailed: "Failed",
  actionUnknown: "Outcome unknown",
  actionDenied: "Denied",
  actionCancelled: "Cancelled",
  from: (who: string) => `From ${who}`,

  /** How long ago (rules.ts `since`): under a minute, then minutes, hours, days. */
  justNow: "just now",
  ago: (span: string) => `${span} ago`,
  neverAt: "never",

  // A schedule in words, on the reader's clock (schedule.ts).
  daily: "Daily",
  weekdays: "Weekdays",
  weekends: "Weekends",
  /** Sunday first, as a cron counts them. */
  dayNames: [
    "Sundays",
    "Mondays",
    "Tuesdays",
    "Wednesdays",
    "Thursdays",
    "Fridays",
    "Saturdays",
  ],
  daysAt: (days: string, time: string) => `${days} at ${time}`,
  hourlyAt: (minute: string) => `Hourly at :${minute}`,
  /** The schedule in its own zone, for a hover: `Daily at 06:30 New York time`. */
  zoneTime: (words: string, place: string) => `${words} ${place} time`,
  placeTime: (place: string) => `${place} time`,
  /** A time near now, said near. */
  today: (time: string) => `Today ${time}`,
  tomorrow: (time: string) => `Tomorrow ${time}`,
  yesterday: (time: string) => `Yesterday ${time}`,
};
