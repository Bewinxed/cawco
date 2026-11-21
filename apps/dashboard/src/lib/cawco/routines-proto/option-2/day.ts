/**
 * The records of Option 2's Routines view: project Harbor on Saturday
 * 21 Nov 2026 at 13:40, its eleven routines, a day and a half of their runs
 * and the two outside sources that feed it (routines-options.md, "Mock data
 * for both prototypes"). Times are on the person's clock, written as UTC
 * instants and read back in UTC, so every frame draws the same hours.
 */

import { DAY_MS, HOUR_MS, MINUTE_MS } from "@cawco/core/time";
import type { ProjectRow } from "#lib/cawco/projects.js";

/** How a run ended, or where it stands while it is going. */
export type Ending =
  | "delivered"
  | "nothing"
  | "failed"
  | "skipped"
  | "running"
  | "met"
  | "notYet"
  | "couldNotCheck";

/** What started a run. */
export type Start =
  | { kind: "time" }
  | { kind: "event"; what: string }
  | { kind: "you" }
  | { kind: "test" };

/** Who did a run: a session (which opens), a shell command with no model, or nobody (a skip). */
type Doer =
  | { kind: "session"; id: string }
  | { kind: "command"; command: string }
  | { kind: "none" };

/** One exact call to an outside service that a run proposed. */
export interface OutsideAction {
  answer?: string;
  id: string;
  /** In the proposer's own words. */
  sentence: string;
  /** The service and the account it acts as. */
  service: string;
  stands: "waiting" | "ran" | "failed" | "unknown" | "denied";
}

export interface Run {
  actions?: OutsideAction[];
  /** When it started, ms since the epoch. */
  at: number;
  /** What it spent, said only on its page. */
  cost?: string;
  doer: Doer;
  ending: Ending;
  id: string;
  /** How long it took, in minutes; absent while it runs. */
  minutes?: number;
  /** A command's own output, under what it said. */
  output?: string;
  /** The delegate's longer report, from its work item (a hub change for the build). */
  report?: string;
  retry?: boolean;
  routineId: string;
  start: Start;
  /** The whole result: its output when it delivered, its reason otherwise. */
  words: string;
}

type RoutineState =
  | { kind: "on" }
  | { kind: "paused"; by: string; on: string }
  | { kind: "finished"; how: string }
  | { kind: "stopped"; why: string }
  | { kind: "turnsOff"; inDays: number };

export interface Routine {
  /** Who does each run. */
  doer: string;
  /** What each run does, in one sentence; for a routine that looks, what it looks for. */
  does: string;
  id: string;
  /** What it looks for, when it is a routine that looks. */
  looksFor?: { statement: string; how: string; holds: string[] };
  madeBy: string;
  name: string;
  /** Why it needs the person, and the choices on its row. */
  needs?: { why: string; choices: string[]; prominent: string };
  /** Its next run, ms since the epoch; null when no clock time starts it. */
  next: number | null;
  rhythm: string;
  state: RoutineState;
  /** Why the next run won't happen, said in its place. */
  wontRun?: string;
}

export interface Source {
  failing?: string;
  name: string;
  read: string;
}

/** Saturday 21 Nov 2026, 13:40 on the person's clock. */
export const NOW = Date.UTC(2026, 10, 21, 13, 40);
const at = (day: number, hour: number, minute: number) =>
  Date.UTC(2026, 10, day, hour, minute);

export const ROUTINES: Routine[] = [
  {
    id: "triage",
    name: "Triage new GitHub issues",
    does: "Labels new issues and flags duplicates",
    doer: "A fresh delegate",
    madeBy: "you",
    rhythm: "Weekdays at 09:00, and when an issue is opened",
    next: at(23, 9, 0),
    state: { kind: "on" },
    needs: {
      why: "1 action waits on you: close #790 as a duplicate of #812.",
      choices: [],
      prominent: "Decide",
    },
  },
  {
    id: "digest",
    name: "Summarise yesterday's sessions",
    does: "Writes a digest of what every session did",
    doer: "An orchestrating session",
    madeBy: "you",
    rhythm: "Every day at 13:30",
    next: at(22, 13, 30),
    state: { kind: "on" },
  },
  {
    id: "npm",
    name: "Wait for release 2.4 on npm",
    does: "Looks for: harbor-cli 2.4.0 is published on npm",
    doer: "A shell command, no session",
    madeBy: "the session Ship release 2.4",
    rhythm: "Every 15 minutes, until 30 Nov",
    next: at(21, 13, 45),
    state: { kind: "on" },
    looksFor: {
      statement: "harbor-cli 2.4.0 is published on npm",
      how: "npm view harbor-cli@2.4.0 version",
      holds: [
        "Update install docs for 2.4",
        "Announce 2.4 in the changelog",
        "3 plan steps",
      ],
    },
  },
  {
    id: "staging",
    name: "Check the staging deploy is green",
    does: "Looks for: the staging deploy of main finished without errors",
    doer: "A model",
    madeBy: "the session Fix flaky deploy job",
    rhythm: "Every 10 minutes",
    next: null,
    wontRun: "Stopped after three failed checks",
    state: { kind: "stopped", why: "Its check failed three times" },
    looksFor: {
      statement: "The staging deploy of main finished without errors",
      how: "A model reads the deploy page and judges",
      holds: ["Run the load test on staging"],
    },
    needs: {
      why: "Its check failed three times: the deploy page asked for a sign-in.",
      choices: ["Say it is met"],
      prominent: "Look again now",
    },
  },
  {
    id: "deps",
    name: "Weekly dependency sweep",
    does: "Lists outdated packages and security advisories",
    doer: "A fresh delegate",
    madeBy: "the session Fix flaky deploy job",
    rhythm: "Mondays at 08:00",
    next: at(23, 8, 0),
    state: { kind: "turnsOff", inDays: 3 },
    needs: {
      why: "An agent made it 4 days ago. It turns itself off in 3 days unless you keep it.",
      choices: ["Turn off"],
      prominent: "Keep",
    },
  },
  {
    id: "changelog",
    name: "Post the weekly changelog",
    does: "Drafts the changelog and proposes the post",
    doer: "An orchestrating session",
    madeBy: "you",
    rhythm: "Fridays at 16:00",
    next: at(27, 16, 0),
    state: { kind: "on" },
    needs: {
      why: "Failed twice yesterday at 16:00: X refused the post, token expired (401).",
      choices: [],
      prominent: "Run again",
    },
  },
  {
    id: "notes",
    name: "Draft release notes on merge",
    does: "Drafts notes from the merged pull request",
    doer: "A fresh delegate",
    madeBy: "you",
    rhythm: "When a pull request is merged into main",
    next: null,
    state: { kind: "on" },
  },
  {
    id: "memory",
    name: "Nightly memory run",
    does: "Curates the project's memory",
    doer: "CawCo's own",
    madeBy: "CawCo",
    rhythm: "Every day at 03:00",
    next: at(22, 3, 0),
    state: { kind: "on" },
  },
  {
    id: "appstore",
    name: "Wait for the App Store review",
    does: "Looks for: build 81 is approved for sale",
    doer: "A model",
    madeBy: "you",
    rhythm: "Every hour",
    next: null,
    wontRun: "No look will run: nothing waits on it",
    state: { kind: "on" },
    looksFor: {
      statement: "Build 81 is approved for sale",
      how: "A model reads App Store Connect and judges",
      holds: [],
    },
  },
  {
    id: "skills",
    name: "Find unused skills and servers",
    does: "Counts what sessions call, proposes unlisting",
    doer: "CawCo's own",
    madeBy: "CawCo",
    rhythm: "Mondays",
    next: null,
    wontRun: "Paused by you on 12 Nov",
    state: { kind: "paused", by: "you", on: "12 Nov" },
  },
  {
    id: "pr412",
    name: "Wait for PR 412 to merge",
    does: "Looks for: pull request 412 is merged",
    doer: "A shell command, no session",
    madeBy: "the session Ship release 2.4",
    rhythm: "Every 5 minutes",
    next: null,
    wontRun: "Met 19 Nov 14:02, said by its check",
    state: { kind: "finished", how: "Met 19 Nov 14:02" },
  },
];

const NPM_SAID =
  "npm error code E404: No match found for version 2.4.0 of harbor-cli.";
const NPM_OUTPUT = `npm error code E404
npm error 404 No match found for version 2.4.0
npm error 404
npm error 404  'harbor-cli@2.4.0' is not in this registry.
npm error A complete log of this run can be found in: /home/ci/.npm/_logs/2026-11-21T13_30_02_114Z-debug-0.log`;

/** Every 15 minutes from Friday 17:15 to the last look at 13:30: each said not yet. */
function npmLooks(): Run[] {
  const looks: Run[] = [];
  for (let t = at(20, 17, 15); t <= at(21, 13, 30); t += 15 * MINUTE_MS) {
    looks.push({
      id: `npm-${t}`,
      routineId: "npm",
      at: t,
      minutes: 0,
      ending: "notYet",
      start: { kind: "time" },
      doer: { kind: "command", command: "npm view harbor-cli@2.4.0 version" },
      words: NPM_SAID,
      output: NPM_OUTPUT,
    });
  }
  return looks;
}

/** The staging check: seven looks from 09:40, the last three refused a sign-in. */
function stagingLooks(): Run[] {
  const looks: Run[] = [];
  for (let n = 0; n < 7; n += 1) {
    const t = at(21, 9, 40) + n * 10 * MINUTE_MS;
    const failed = n >= 4;
    looks.push({
      id: `staging-${n}`,
      routineId: "staging",
      at: t,
      minutes: 1,
      ending: failed ? "couldNotCheck" : "notYet",
      start: { kind: "time" },
      doer: { kind: "session", id: `s-staging-${n}` },
      words: failed
        ? "The deploy page asked for a sign-in, so I could not see whether the deploy of main finished. The page at deploy.harbor.dev/staging redirected to the Vercel login."
        : "The deploy of main (a41c9e2, “Retry flaky upload step”) is still running: step 4 of 6, Upload assets, for 12 minutes.",
      cost: "$0.04 · 9,812 tokens",
    });
  }
  return looks;
}

export const RUNS: Run[] = [
  ...npmLooks(),
  ...stagingLooks(),
  {
    id: "digest-today",
    routineId: "digest",
    at: at(21, 13, 30),
    ending: "running",
    start: { kind: "time" },
    doer: { kind: "session", id: "s-digest-today" },
    words:
      "Reading 23 sessions from Friday across nixbox, studio-mac and the hub; 14 read so far.",
  },
  {
    id: "triage-833",
    routineId: "triage",
    at: at(21, 11, 4),
    minutes: 3,
    ending: "delivered",
    start: { kind: "event", what: "issue #833 was opened" },
    doer: { kind: "session", id: "s-triage-833" },
    words:
      "Labelled #833 “Sign-in loop on Safari 18 after a password reset” as bug and auth. It reads like #812 (“Safari keeps returning to the login page”): same browser, same redirect, reported by a different team. I left a comment linking the two and did not close it.",
    report: `Read #833 and the 40 most recent open issues, labelled #833 **bug** and **auth**, and commented on #833 linking #812 with the matching redirect trace.

**Loose ends**
- #812 has no owner; both reports will sit until someone takes it.
- The reporter attached a HAR file I could not open (it is 48 MB, over the attachment limit I can read).`,
    cost: "$0.31 · 74,220 tokens",
  },
  {
    id: "memory-today",
    routineId: "memory",
    at: at(21, 3, 0),
    minutes: 6,
    ending: "delivered",
    start: { kind: "time" },
    doer: { kind: "session", id: "s-memory-today" },
    words:
      "Kept 4 notes, dropped 2 stale lines. Kept: the staging deploy needs a Vercel sign-in for agents; release 2.4 waits on the npm publish; the changelog posts from @harborapp on X; Safari sign-in bugs go to the auth label. Dropped: the old Node 18 pin and a note about the retired preview server.",
    cost: "$0.12 · 31,004 tokens",
  },
  {
    id: "changelog-retry",
    routineId: "changelog",
    at: at(20, 16, 5),
    minutes: 2,
    ending: "failed",
    retry: true,
    start: { kind: "time" },
    doer: { kind: "session", id: "s-changelog-retry" },
    words:
      "X refused the post: token expired (401). The changelog for week 47 is drafted and kept in the task “Post the week 47 changelog”; nothing was posted.",
    actions: [
      {
        id: "x-post-retry",
        sentence: "Post the week 47 changelog to @harborapp on X",
        service: "X, as @harborapp",
        stands: "failed",
        answer: "401 Unauthorized: token expired",
      },
    ],
    cost: "$0.09 · 18,330 tokens",
  },
  {
    id: "changelog-first",
    routineId: "changelog",
    at: at(20, 16, 0),
    minutes: 4,
    ending: "failed",
    start: { kind: "time" },
    doer: { kind: "session", id: "s-changelog-first" },
    words: "X refused the post: token expired (401). Retried once at 16:05.",
    cost: "$0.22 · 52,118 tokens",
  },
  {
    id: "triage-829",
    routineId: "triage",
    at: at(20, 15, 12),
    minutes: 2,
    ending: "delivered",
    start: { kind: "event", what: "issue #829 was opened" },
    doer: { kind: "session", id: "s-triage-829" },
    words:
      "Labelled #829 “Export to CSV drops every row past 10,000” as bug and data. No duplicates found among the open issues.",
    cost: "$0.18 · 40,671 tokens",
  },
  {
    id: "digest-friday",
    routineId: "digest",
    at: at(20, 13, 30),
    minutes: 11,
    ending: "delivered",
    start: { kind: "time" },
    doer: { kind: "session", id: "s-digest-friday" },
    words:
      "Thursday: 17 sessions across 3 machines. The release 2.4 branch was cut and tagged; 2 sessions stopped at their limit on the Max account; the flaky deploy job is still open after two attempts.",
    cost: "$0.41 · 96,500 tokens",
  },
  {
    id: "triage-friday",
    routineId: "triage",
    at: at(20, 9, 0),
    minutes: 4,
    ending: "delivered",
    start: { kind: "time" },
    doer: { kind: "session", id: "s-triage-friday" },
    words:
      "Labelled 6 new issues; 2 look like duplicates of #812. I proposed closing #790 as a duplicate and left #826 open, since it names a second browser.",
    actions: [
      {
        id: "close-790",
        sentence: "Close #790 as a duplicate of #812",
        service: "GitHub, as harbor-bot",
        stands: "waiting",
      },
    ],
    cost: "$0.27 · 63,904 tokens",
  },
];

export const SOURCES: Source[] = [
  {
    name: "GitHub harbor/harbor-app",
    read: "Events arrive as they happen · last read 13:31, 3 items",
  },
  {
    name: "Linear Harbor team issues",
    read: "Read every 5 minutes",
    failing: "Linear answered 401: the key was revoked",
  },
];

export const routineOf = (id: string): Routine => {
  const found = ROUTINES.find((one) => one.id === id);
  if (!found) {
    throw new Error(`No routine ${id} in Harbor's records.`);
  }
  return found;
};

const CLOCK = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
});
const WEEKDAY = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  timeZone: "UTC",
});
const DATE = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

/** A time on the person's clock: "13:45". */
export const clockOf = (t: number): string => CLOCK.format(t);

const dayIndex = (t: number) => Math.floor(t / DAY_MS);

/** A near time on the person's clock: "13:45", "tomorrow 03:00", "Mon 09:00", "Thu 17:12". */
export function nearTime(t: number, now = NOW): string {
  const days = dayIndex(t) - dayIndex(now);
  if (days === 0) {
    return clockOf(t);
  }
  if (days === 1) {
    return `tomorrow ${clockOf(t)}`;
  }
  if (days === -1) {
    return `yesterday ${clockOf(t)}`;
  }
  if (Math.abs(days) < 7) {
    return `${WEEKDAY.format(t)} ${clockOf(t)}`;
  }
  return `${DATE.format(t)} ${clockOf(t)}`;
}

/** The day a run falls under in What ran. */
export function dayOf(t: number, now = NOW): string {
  const days = dayIndex(now) - dayIndex(t);
  if (days === 0) {
    return "Today";
  }
  if (days === 1) {
    return `Yesterday, ${WEEKDAY.format(t)} ${DATE.format(t)}`;
  }
  return `${WEEKDAY.format(t)} ${DATE.format(t)}`;
}

export const ENDING_WORD: Record<Ending, string> = {
  delivered: "Delivered",
  nothing: "Nothing to report",
  failed: "Failed",
  skipped: "Skipped",
  running: "Running",
  met: "Met",
  notYet: "Not yet",
  couldNotCheck: "Could not check",
};

/** A run that left something to read at full weight: it delivered, failed, or is going. */
export const isFull = (ending: Ending): boolean =>
  ending !== "notYet" && ending !== "nothing";

/** A run that went wrong. */
export const isFail = (ending: Ending): boolean =>
  ending === "failed" || ending === "couldNotCheck";

export function startWords(start: Start): string {
  switch (start.kind) {
    case "time":
      return "Started by its time";
    case "event":
      return `Started when ${start.what}`;
    case "you":
      return "Started by you";
    case "test":
      return "Its first run, as it was made";
    default:
      return "";
  }
}

/** One line in What ran: a run, or runs alike in a row folded into one. */
export type RanLine =
  { kind: "run"; run: Run } | { kind: "fold"; key: string; runs: Run[] };

/**
 * What ran, newest first, under its day: runs alike (the same routine, the
 * same quiet ending, the same day) fold into one line at the newest's time,
 * so an every-15-minutes look never buries the rest. A failure always stands
 * on its own line, and so do three failed looks in a row only once they
 * stopped the routine: then they fold, said in the failure's ink.
 */
export function whatRan(
  runs: Run[],
  now = NOW
): { day: string; lines: RanLine[] }[] {
  const sorted = [...runs].sort((a, b) => b.at - a.at);
  const days: { day: string; lines: RanLine[] }[] = [];
  const folds = new Map<string, Extract<RanLine, { kind: "fold" }>>();
  for (const run of sorted) {
    const day = dayOf(run.at, now);
    let section = days.at(-1);
    if (section?.day !== day) {
      section = { day, lines: [] };
      days.push(section);
    }
    const foldable =
      run.ending === "notYet" ||
      run.ending === "nothing" ||
      run.ending === "couldNotCheck";
    if (!foldable) {
      section.lines.push({ kind: "run", run });
      continue;
    }
    const key = `${day}:${run.routineId}:${run.ending}`;
    const fold = folds.get(key);
    if (fold) {
      fold.runs.push(run);
    } else {
      const line = { kind: "fold" as const, key, runs: [run] };
      folds.set(key, line);
      section.lines.push(line);
    }
  }
  // A fold of one is that run.
  for (const section of days) {
    section.lines = section.lines.map((line) =>
      line.kind === "fold" && line.runs.length === 1
        ? { kind: "run", run: line.runs[0] }
        : line
    );
  }
  return days;
}

/** The runs before and after one, of its routine: Earlier run and Later run. */
export function neighbours(run: Run): { earlier?: Run; later?: Run } {
  const own = RUNS.filter((one) => one.routineId === run.routineId).sort(
    (a, b) => a.at - b.at
  );
  const index = own.findIndex((one) => one.id === run.id);
  return { earlier: own[index - 1], later: own[index + 1] };
}

/** The coming runs within a span ahead: each routine's clock times. */
export function comingRuns(
  now = NOW,
  hours = 24
): { routineId: string; at: number }[] {
  const end = now + hours * HOUR_MS;
  const coming: { routineId: string; at: number }[] = [];
  for (let t = at(21, 13, 45); t <= end; t += 15 * MINUTE_MS) {
    coming.push({ routineId: "npm", at: t });
  }
  for (const routine of ROUTINES) {
    if (routine.id !== "npm" && routine.next !== null && routine.next <= end) {
      coming.push({ routineId: routine.id, at: routine.next });
    }
  }
  return coming.sort((a, b) => a.at - b.at);
}

/** Where each routine stands in Now and next as the hub reads it now. */
export const STANDINGS: Record<
  string,
  "needs" | "running" | "next" | "wontRun"
> = {
  triage: "needs",
  digest: "running",
  npm: "next",
  staging: "needs",
  deps: "needs",
  changelog: "needs",
  notes: "next",
  memory: "next",
  appstore: "wontRun",
  skills: "wontRun",
  pr412: "wontRun",
};

/** The project the view stands in. */
export const HARBOR: ProjectRow = {
  account: null,
  accountAtLimit: "wait",
  cawHarness: "claude",
  cawModel: null,
  conversationInstanceId: null,
  createdAt: "2026-09-02T10:00:00Z",
  eventsOn: true,
  id: "harbor",
  lands: "main",
  lfsConnection: null,
  lfsUrl: null,
  links: ["github.com/harbor/harbor-app"],
  name: "Harbor",
  places: [],
  primaryPlaceId: null,
  review: true,
};

/**
 * The routines the pick frame draws, the same eight option 1's first frame
 * draws, so the day fits one desk screen's height under the head: the two
 * stopped or failed (the staging check, the changelog), four on (the npm
 * look, the digest, triage, the memory run), and the two not running
 * (paused, finished). Every run in RUNS belongs to one of them.
 */
const PICK_FRAME = new Set([
  "staging",
  "changelog",
  "npm",
  "digest",
  "triage",
  "memory",
  "skills",
  "pr412",
]);

export const PICK_ROUTINES: Routine[] = ROUTINES.filter((one) =>
  PICK_FRAME.has(one.id)
);

export const PICK_RUNS: Run[] = RUNS.filter((one) =>
  PICK_FRAME.has(one.routineId)
);
