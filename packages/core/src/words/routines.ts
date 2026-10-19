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
  /** The Routines block's own action: the composer to Caw over the ledger. */
  newRoutine: "New routine",
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
  emptyCaw: (project: string) =>
    `Caw runs work for ${project} on a schedule, or when something happens. Say what, and when.`,
  emptyOff: (problem: string) =>
    `Caw makes routines, and he can't start: ${problem}.`,
  away: "his machine is away",
  startersLabel: "Routines to ask Caw for",
  noSources:
    "No event sources yet. Caw connects one when a routine should start on an event, like a merged pull request.",
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
