/**
 * Option 1's records: project Harbor on Saturday 21 Nov 2026 at 13:40, as
 * the routines structure options name them (eleven routines, the outside
 * actions their runs asked for, and two outside sources). Times are words
 * on the person's clock, as the hub's reading would give them to the page.
 */

/** How a run ended, or where it is. */
export type RunHow =
  | "delivered"
  | "nothing"
  | "failed"
  | "running"
  | "notYet"
  | "met"
  | "couldNot";

/** One time a routine ran, or one look. */
export interface Run {
  /** Who did it, when no session did: a command, or nothing ran. */
  by?: string;
  /** New since the person last looked: its words stand at full ink. */
  fresh?: boolean;
  how: RunHow;
  id: string;
  /** The whole result as the run left it (markdown), when longer than its line. */
  result?: string;
  /** Whether this run was the retry of a failed one. */
  retry?: boolean;
  /** The session that did it; absent for a command or a skip. */
  sessionId?: string;
  /** What started it: its time, an event, the test on creation, the person. */
  started: string;
  /** How long it took. */
  took?: string;
  /** When it started, on the person's clock. */
  when: string;
  /** Its one line: the result, the failure's reason, what the command said. */
  words: string;
}

/** What a routine that looks for something looks for. */
interface LooksFor {
  /** How it finds out: a model judging, or a command's exit. */
  answer:
    | { kind: "model"; instructions: string }
    | { kind: "command"; command: string };
  /** What waits on it. */
  holds: { steps: number; tasks: string[] };
  statement: string;
  /** The day it stops looking, or until met. */
  stops: string;
}

/** Why a routine needs the person now, and what each choice reaches. */
interface NeedsYou {
  choices: { label: string; primary?: boolean }[];
  why: string;
}

export type RoutineState = "on" | "running" | "needs" | "paused" | "finished";

export interface Routine {
  /** CawCo's own: what it does is fixed. */
  cawco?: boolean;
  /** Who does each run. */
  doer: string;
  id: string;
  /** The full instruction each run follows. */
  instruction: string;
  /** Its limit per run, its daily cap, and what recent runs cost. */
  limits: string;
  looksFor?: LooksFor;
  /** Who made it. */
  madeBy: string;
  name: string;
  needs?: NeedsYou;
  /** The next run on the person's clock, or what keeps it from running. */
  next: { at: string; when?: string } | { held: string };
  /** The rhythm in words, with what else starts it. */
  rhythm: string;
  /** Newest first. */
  runs: Run[];
  /** What each run does, or what it looks for, in one sentence. */
  sentence: string;
  /** Each event that also starts it, and when one last did; absent: nothing else does. */
  starts?: string;
  state: RoutineState;
  /** The state in words, for its mark's name and its head. */
  stateWords: string;
  /** The next five runs on the person's clock; one that will not happen says why. */
  upcoming: string[];
  /** The why the session that made it gave. */
  why?: string;
}

/** One exact call a run asked to make outside CawCo. */
export interface OutsideAction {
  /** Where it stands and when. */
  at: string;
  /** From which routine. */
  from: string;
  id: string;
  /** What the service answered, when it answered. */
  said?: string;
  service: string;
  standing: "waits" | "failed" | "ran";
  what: string;
}

/** A service CawCo listens to for this project. */
export interface OutsideSource {
  failing?: string;
  id: string;
  read: string;
  service: string;
  what: string;
}

/** The whole result of Friday's triage run, its delegate's report included. */
const TRIAGE_RESULT = `Labelled 6 new issues; 2 look like duplicates of #812.

| Issue | Label | Note |
| --- | --- | --- |
| #806 Sync stalls after the phone sleeps for an hour | \`bug\`, \`area:sync\` | Duplicate of #812 |
| #807 Offline edits lost when two devices change one note | \`bug\`, \`area:sync\` | Duplicate of #812 |
| #808 Add a keyboard shortcut to archive a harbour log | \`feature\` | |
| #809 Typo on the pricing page ("anual") | \`docs\` | |
| #810 Crash opening a shared notebook from a link on Android 15 | \`bug\`, \`android\` | Asked the reporter for a log |
| #811 Export to CSV drops the time zone | \`bug\`, \`area:export\` | |

I proposed closing #790 as a duplicate of #812 too. It waits on you.

**Loose ends.** #810 has no steps to reproduce yet, so it stays unlabelled for priority. The label \`area:export\` didn't exist; I made it.`;

const SUMMARY_RESULT = `14 sessions yesterday: 9 finished, 3 waiting on you, 2 failed.

- **Finished:** the sync retry fix (#812), the export time zone fix, five dependency bumps, the pricing page copy, the release 2.3.1 notes.
- **Waiting on you:** a question about the Android minimum version; a plan for the offline queue; approval to post the changelog.
- **Failed:** "Fix flaky deploy job" ran out of its daily cap at 16:20; "Rewrite onboarding emails" stopped on a missing template.`;

const ROUTINES: Routine[] = [
  {
    id: "rtn-staging",
    instruction:
      "Follow the instructions, then answer met or not yet, with the one line of the page that decides it.",
    limits: "Up to $0.40 a look · $6 a day · today $0.31",
    upcoming: ["Stopped until you choose"],
    name: "Check the staging deploy is green",
    sentence: "Looks for: “The staging deploy of main finished without errors”",
    state: "needs",
    stateWords: "Stopped looking",
    doer: "A model follows written instructions",
    madeBy: "session “Fix flaky deploy job”",
    rhythm: "Every 10 minutes",
    next: { held: "Stopped: its check failed three times" },
    needs: {
      why: "Its check failed three times in a row: “The deploy page asked for a sign-in”. “Run the load test on staging” waits on it.",
      choices: [
        { label: "Look again now", primary: true },
        { label: "Say it is met" },
      ],
    },
    looksFor: {
      statement: "The staging deploy of main finished without errors",
      answer: {
        kind: "model",
        instructions:
          "Open the staging deploy page for main. Read the newest deploy's status and its log's last 40 lines. It is met when the status is Succeeded and the log shows no error lines.",
      },
      holds: { tasks: ["Run the load test on staging"], steps: 0 },
      stops: "Until met",
    },
    runs: [
      {
        id: "run-s3",
        fresh: true,
        when: "Today 13:20",
        how: "couldNot",
        started: "Its time",
        took: "38 s",
        words: "The deploy page asked for a sign-in.",
        sessionId: "8f2c41d0",
      },
      {
        id: "run-s2",
        when: "Today 13:10",
        how: "couldNot",
        started: "Its time",
        took: "41 s",
        words: "The deploy page asked for a sign-in.",
        sessionId: "8f2c41a9",
      },
      {
        id: "run-s1",
        when: "Today 13:00",
        how: "couldNot",
        started: "Its time",
        took: "35 s",
        words: "The deploy page asked for a sign-in.",
        sessionId: "8f2c4172",
      },
    ],
  },
  {
    id: "rtn-deps",
    instruction:
      "List every package in harbor-app and harbor-cli that is behind its latest release, and every security advisory against one. Group them by how far behind. Open no pull request.",
    limits: "Up to $2 a run · $4 a day · its test run $0.84",
    upcoming: [
      "Mon 23 Nov 08:00",
      "Mon 30 Nov 08:00 · turned off by then unless kept",
      "Mon 7 Dec 08:00",
      "Mon 14 Dec 08:00",
      "Mon 21 Dec 08:00",
    ],
    name: "Weekly dependency sweep",
    sentence: "Lists outdated packages and security advisories",
    state: "needs",
    stateWords: "Turns itself off in 3 days unless kept",
    doer: "A fresh delegate",
    madeBy: "session “Fix flaky deploy job”, 4 days ago",
    why: "You asked twice this week for outdated packages; this does it each Monday.",
    rhythm: "Mondays at 08:00",
    next: { at: "Mon 08:00" },
    needs: {
      why: "An agent made it 4 days ago. It turns itself off in 3 days unless you keep it.",
      choices: [{ label: "Keep", primary: true }, { label: "Turn off" }],
    },
    runs: [
      {
        id: "run-d1",
        when: "Tue 17 Nov 11:04",
        how: "delivered",
        started: "The test when it was made",
        took: "6 min",
        words: "14 packages behind, 2 with security advisories.",
        sessionId: "3b91e7c2",
      },
    ],
  },
  {
    id: "rtn-changelog",
    instruction:
      "Draft this week's changelog from the merged pull requests, and propose posting it on X from @harborapp. Post nothing yourself.",
    limits: "Up to $3 a run · $6 a day · Friday $1.92",
    upcoming: [
      "Fri 27 Nov 16:00",
      "Fri 4 Dec 16:00",
      "Fri 11 Dec 16:00",
      "Fri 18 Dec 16:00",
      "Fri 25 Dec 16:00",
    ],
    name: "Post the weekly changelog",
    sentence: "Drafts the changelog and proposes the post",
    state: "needs",
    stateWords: "Failed twice",
    doer: "An orchestrating session",
    madeBy: "you",
    rhythm: "Fridays at 16:00",
    next: { at: "Fri 27 Nov 16:00" },
    needs: {
      why: "It failed twice on Friday, the second time as its retry: “X refused the post: token expired (401)”.",
      choices: [{ label: "Run again", primary: true }],
    },
    runs: [
      {
        id: "run-c2",
        when: "Fri 16:09",
        how: "failed",
        started: "Retry",
        retry: true,
        took: "3 min",
        words: "X refused the post: token expired (401).",
        sessionId: "a40d77e1",
      },
      {
        id: "run-c1",
        when: "Fri 16:00",
        how: "failed",
        started: "Its time",
        took: "7 min",
        words: "X refused the post: token expired (401).",
        sessionId: "a40d7302",
      },
    ],
  },
  {
    id: "rtn-npm",
    instruction:
      "Run the command; its exit says whether harbor-cli 2.4.0 is published.",
    limits: "No model, no spend",
    upcoming: [
      "Today 13:49",
      "Today 14:04",
      "Today 14:19",
      "Today 14:34",
      "Today 14:49",
    ],
    name: "Wait for release 2.4 on npm",
    sentence: "Looks for: “harbor-cli 2.4.0 is published on npm”",
    state: "on",
    stateWords: "On",
    doer: "A shell command, no model",
    madeBy: "session “Ship release 2.4”",
    rhythm: "Every 15 minutes, stops looking 30 Nov",
    next: { at: "13:49", when: "today" },
    looksFor: {
      statement: "harbor-cli 2.4.0 is published on npm",
      answer: { kind: "command", command: "npm view harbor-cli@2.4.0 version" },
      holds: {
        tasks: ["Update install docs for 2.4", "Announce 2.4 in the changelog"],
        steps: 3,
      },
      stops: "30 Nov",
    },
    runs: [
      {
        id: "run-n9",
        fresh: true,
        when: "Today 13:34",
        how: "notYet",
        started: "Its time",
        took: "2 s",
        words: "npm error code E404",
        by: "A shell command, no session",
      },
      {
        id: "run-n8",
        when: "Today 13:19",
        how: "notYet",
        started: "Its time",
        took: "2 s",
        words: "npm error code E404",
        by: "A shell command, no session",
      },
    ],
  },
  {
    id: "rtn-memory",
    instruction:
      "Curate the project's memory: keep what later sessions need, drop what no longer holds.",
    limits: "CawCo's own · today $0.22",
    upcoming: [
      "Tomorrow 03:00",
      "Mon 03:00",
      "Tue 03:00",
      "Wed 03:00",
      "Thu 03:00",
    ],
    name: "Nightly memory run",
    sentence: "Curates the project's memory",
    state: "on",
    stateWords: "On",
    cawco: true,
    doer: "CawCo",
    madeBy: "CawCo",
    rhythm: "Every day at 03:00",
    next: { at: "03:00", when: "tomorrow" },
    runs: [
      {
        id: "run-m1",
        fresh: true,
        when: "Today 03:00",
        how: "delivered",
        started: "Its time",
        took: "2 min",
        words: "Kept 4 notes, dropped 2 stale lines.",
        sessionId: "c7e05b18",
      },
    ],
  },
  {
    id: "rtn-summary",
    instruction:
      "Read every session of this project from yesterday and write a digest: what finished, what waits on me, what failed and why.",
    limits: "Up to $1.50 a run · $3 a day · Friday $0.96",
    upcoming: [
      "Tomorrow 13:30",
      "Mon 13:30",
      "Tue 13:30",
      "Wed 13:30",
      "Thu 13:30",
    ],
    name: "Summarise yesterday's sessions",
    sentence: "Writes a digest of what every session did",
    state: "running",
    stateWords: "On, running since 13:30",
    doer: "An orchestrating session",
    madeBy: "you",
    rhythm: "Every day at 13:30",
    next: { at: "13:30", when: "tomorrow" },
    runs: [
      {
        id: "run-y2",
        fresh: true,
        when: "Today 13:30",
        how: "running",
        started: "Its time",
        words: "Reading 14 sessions from yesterday…",
        sessionId: "e1a96c30",
      },
      {
        id: "run-y1",
        when: "Fri 13:30",
        how: "delivered",
        started: "Its time",
        took: "5 min",
        words: "14 sessions yesterday: 9 finished, 3 waiting on you, 2 failed.",
        result: SUMMARY_RESULT,
        sessionId: "e1a90b44",
      },
    ],
  },
  {
    id: "rtn-triage",
    instruction:
      "Read the issues opened since the last run. Label each by kind and area, flag likely duplicates with the issue they repeat, and propose closing a duplicate. Ask the reporter for steps when an issue has none.",
    limits: "Up to $1 a run · $5 a day · Friday $0.58",
    upcoming: ["Mon 09:00", "Tue 09:00", "Wed 09:00", "Thu 09:00", "Fri 09:00"],
    starts:
      "When an issue is opened in harbor/harbor-app · last Thu 14:12, #805",
    name: "Triage new GitHub issues",
    sentence: "Labels new issues and flags duplicates",
    state: "on",
    stateWords: "On",
    doer: "A fresh delegate",
    madeBy: "you",
    rhythm: "Weekdays at 09:00; also when an issue is opened",
    next: { at: "Mon 09:00" },
    runs: [
      {
        id: "run-t4",
        when: "Fri 09:00",
        how: "delivered",
        started: "Its time",
        took: "4 min",
        words: "Labelled 6 new issues; 2 look like duplicates of #812.",
        result: TRIAGE_RESULT,
        sessionId: "5d0e2f91",
      },
      {
        id: "run-t3",
        when: "Thu 14:12",
        how: "delivered",
        started: "Issue #805 was opened",
        took: "1 min",
        words: "Labelled #805 bug and area:sync.",
        sessionId: "5d0e1c07",
      },
      {
        id: "run-t2",
        when: "Thu 09:00",
        how: "delivered",
        started: "Its time",
        took: "3 min",
        words: "Labelled 3 new issues; none look like duplicates.",
        sessionId: "5d0e0a66",
      },
      {
        id: "run-t1",
        when: "Wed 09:00",
        how: "nothing",
        started: "Its time",
        took: "40 s",
        words: "No new issues since Tuesday 09:00.",
        sessionId: "5d0df812",
      },
    ],
  },
  {
    id: "rtn-notes",
    instruction:
      "Draft release notes from the merged pull request's description and commits, and comment them on the pull request.",
    limits: "Up to $1 a run · $4 a day · Thursday $0.41",
    upcoming: [],
    starts:
      "When a pull request is merged into main in harbor/harbor-app · last Thu 17:12, PR 409",
    name: "Draft release notes on merge",
    sentence: "Drafts notes from the merged pull request",
    state: "on",
    stateWords: "On",
    doer: "A fresh delegate",
    madeBy: "you",
    rhythm: "When a pull request is merged into main",
    next: { held: "When a pull request is merged into main" },
    runs: [
      {
        id: "run-r1",
        when: "Thu 17:12",
        how: "delivered",
        started: "Pull request 409 was merged",
        took: "3 min",
        words: "Drafted notes for PR 409 “Retry sync after the phone wakes”.",
        sessionId: "9c3f5a20",
      },
    ],
  },
  {
    id: "rtn-appstore",
    instruction:
      "Follow the instructions, then answer met or not yet, with the line of the page that decides it.",
    limits: "Up to $0.30 a look · $3 a day",
    upcoming: ["No look runs while nothing waits on it"],
    name: "Wait for the App Store review",
    sentence: "Looks for: “Build 81 is approved for sale”",
    state: "on",
    stateWords: "On",
    doer: "A model follows written instructions",
    madeBy: "you",
    rhythm: "Every hour",
    next: { held: "No look will run: nothing waits on it" },
    looksFor: {
      statement: "Build 81 is approved for sale",
      answer: {
        kind: "model",
        instructions:
          "Open App Store Connect's build list for Harbor. It is met when build 81 reads Ready for Sale.",
      },
      holds: { tasks: [], steps: 0 },
      stops: "Until met",
    },
    runs: [],
  },
  {
    id: "rtn-unused",
    instruction:
      "Count which skills and servers this project's sessions called in 30 days, and propose unlisting the ones none called.",
    limits: "CawCo's own",
    upcoming: ["Paused"],
    name: "Find unused skills and servers",
    sentence: "Counts what sessions call, proposes unlisting",
    state: "paused",
    stateWords: "Paused by you on 12 Nov",
    cawco: true,
    doer: "CawCo",
    madeBy: "CawCo",
    rhythm: "Mondays",
    next: { held: "Paused by you on 12 Nov" },
    runs: [
      {
        id: "run-u1",
        when: "Mon 9 Nov 09:00",
        how: "delivered",
        started: "Its time",
        took: "3 min",
        words:
          "4 skills and 1 server unused for 30 days; proposed unlisting them.",
        sessionId: "f4b2d9e3",
      },
    ],
  },
  {
    id: "rtn-pr412",
    instruction:
      "Run the command; its exit says whether pull request 412 is merged.",
    limits: "No model, no spend",
    upcoming: ["Looks no more: it was met"],
    name: "Wait for PR 412 to merge",
    sentence: "Looks for: “Pull request 412 is merged”",
    state: "finished",
    stateWords: "Met 19 Nov 14:02, said by its check",
    doer: "A shell command, no model",
    madeBy: "session “Ship release 2.4”",
    rhythm: "Every 5 minutes",
    next: { held: "Met 19 Nov 14:02, said by its check" },
    looksFor: {
      statement: "Pull request 412 is merged",
      answer: {
        kind: "command",
        command: "gh pr view 412 --json state -q .state | grep -q MERGED",
      },
      holds: { tasks: [], steps: 0 },
      stops: "Until met",
    },
    runs: [
      {
        id: "run-p1",
        when: "19 Nov 14:02",
        how: "met",
        started: "Its time",
        took: "1 s",
        words: "merged by mira at 14:01",
        by: "A shell command, no session",
      },
    ],
  },
];

export const ACTIONS: OutsideAction[] = [
  {
    id: "act-790",
    what: "Close #790 as a duplicate of #812",
    service: "GitHub · harbor-bot",
    from: "Triage new GitHub issues",
    standing: "waits",
    at: "Since Fri 09:04",
  },
  {
    id: "act-post",
    what: "Post the 2.3.1 changelog on X",
    service: "X · @harborapp",
    from: "Post the weekly changelog",
    standing: "failed",
    at: "Fri 16:09",
    said: "token expired (401)",
  },
  {
    id: "act-805",
    what: "Label #805 bug and area:sync",
    service: "GitHub · harbor-bot",
    from: "Triage new GitHub issues",
    standing: "ran",
    at: "Thu 14:13",
  },
];

export const SOURCES: OutsideSource[] = [
  {
    id: "src-gh",
    service: "GitHub",
    what: "harbor/harbor-app",
    read: "As they happen · last read 13:31, 3 items",
  },
  {
    id: "src-linear",
    service: "Linear",
    what: "Harbor team issues",
    read: "Every 5 minutes",
    failing: "Linear answered 401: the key was revoked",
  },
];

/** The session a run's button opens. */
export const sessionHref = (sessionId: string): string =>
  `/session/${sessionId}`;

/**
 * The routines the first frame draws, whose rows fit one desk screen's
 * height under the shell: two that need the person (a check that stopped,
 * a run that failed), four on (a look, one running, a delegate's work,
 * CawCo's own), and the two not running (paused, finished).
 */
const FIRST_FRAME = new Set([
  "rtn-staging",
  "rtn-changelog",
  "rtn-npm",
  "rtn-summary",
  "rtn-triage",
  "rtn-memory",
  "rtn-unused",
  "rtn-pr412",
]);

export const ONE_SCREEN: Routine[] = ROUTINES.filter((one) =>
  FIRST_FRAME.has(one.id)
);
