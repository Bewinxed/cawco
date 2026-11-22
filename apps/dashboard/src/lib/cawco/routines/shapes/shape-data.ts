/**
 * Cawco-Dev's routines on a Saturday late morning (22 Nov, 11:40 on the
 * person's clock), as the Routines shapes draw them: the card's words, and
 * what opening a routine shows. Shaped from the project's own routines and
 * tasks; every time is already said on the person's clock.
 */

import type { BarView } from "#lib/cawco/project/ViewBar.svelte";
import type { ProjectRow } from "#lib/cawco/projects.js";
import type { Status } from "#lib/cawco/routines/RunStatus.svelte";
import type { Machine } from "#lib/cawco/stores/board.svelte.js";

/** When its next run falls, for the shape that lays routines out by when. */
export type Lane = "soon" | "today" | "later" | "event" | "off";

/** What a routine asks of the person, and the one act that answers it. */
interface ShapeAsk {
  act: string;
  /** What pressing the act does on the card. */
  does: "run" | "open" | "keep";
}

/** One run, as the opened routine lists it. */
interface ShapeRun {
  /** What started it, said plainly. */
  by: string;
  id: string;
  /** A session did it: its session opens from the run. */
  session: boolean;
  status: Status;
  /** How long it took, or that it is going. */
  took: string;
  when: string;
  /** The words it left: its result, its failure, or a command's last line. */
  words: string;
}

/** What a routine that waits for something is waiting for, and where it stands. */
interface ShapeWait {
  /** The command whole, for a command. */
  command: string | null;
  /** The tasks it holds, by id and title. */
  holds: { id: string; title: string }[];
  /** A command answers it, or a model judges it. */
  how: "command" | "model";
  /** Who gave the newest look's words: the command, or the model. */
  saidBy: string;
  statement: string;
  /** Plan steps that wait on it. */
  steps: number;
  /** When it gives up, or that it looks until met. */
  until: string;
}

/** An action outside CawCo that a run asked the person to approve. */
interface ShapeAction {
  account: string;
  call: string;
  runs: string;
  sentence: string;
  service: string;
}

export interface ShapeRoutine {
  action: ShapeAction | null;
  /** How long ago that was; null while it is the news itself (running). */
  ago: string | null;
  /** Its next runs on the person's clock. */
  ahead: string[];
  /** Anything else that starts it. */
  alsoStarts: string | null;
  /** It needs the person: the sentence says why, the act answers it. */
  ask: ShapeAsk | null;
  /** What each run does, whole. */
  does: string;
  /** What keeps the next run from happening, when anything does. */
  held: string | null;
  id: string;
  lane: Lane;
  /** Who made it, and what the making session said. */
  madeBy: string;
  madeWhy: string | null;
  name: string;
  /** Its next run on the person's clock, or why there is none. */
  next: string;
  /** Minutes until its next run, to order a column by: 0 while one runs. */
  nextIn: number;
  /** Paused, finished or stopped: it recedes. */
  off: boolean;
  paused: boolean;
  /** The rhythm in words. */
  rhythm: string;
  running: boolean;
  runs: ShapeRun[];
  runsTotal: number;
  /** What it last did or is waiting for, one plain sentence. */
  sentence: string;
  spend: string;
  wait: ShapeWait | null;
}

export const MOCK_MACHINE: Machine = {
  auth: "authenticated",
  home: "/home/bewinxed",
  hostname: "obelisk",
  joinedAt: Date.parse("2026-08-14T09:00:00Z"),
  machineId: "mch-obelisk",
  os: "linux",
  pauseStopped: null,
  pausedUntil: null,
  status: "online",
};

export const MOCK_PROJECT: ProjectRow = {
  account: null,
  accountAtLimit: "wait",
  cawHarness: "claude",
  cawModel: "claude-sonnet-5-5",
  conversationInstanceId: null,
  createdAt: "2026-08-14T09:00:00Z",
  eventsOn: true,
  id: "70ac3d41",
  lands: "main",
  lfsConnection: null,
  lfsUrl: null,
  links: ["github.com/bewinxed/cockpit"],
  name: "Cawco-Dev",
  places: [
    {
      createdAt: "2026-08-14T09:00:00Z",
      found: true,
      id: "plc-obelisk",
      isPrimary: true,
      kind: "checkout",
      machineId: "mch-obelisk",
      made: false,
      missing: false,
      path: "/home/bewinxed/cockpit",
      projectId: "70ac3d41",
      within: [],
    },
  ],
  primaryPlaceId: "plc-obelisk",
  review: true,
};

export const PROJECT_VIEWS: BarView[] = [
  { count: 0, draft: false, label: "Board", value: "board" },
  { count: 0, draft: false, label: "Table", value: "table" },
  { count: 0, draft: false, label: "Routines", value: "routines" },
  { count: 2, draft: false, label: "Decisions", value: "decisions" },
  { count: 0, draft: false, label: "Made", value: "made" },
];

const DELEGATE_SPEND =
  "Each run is a fresh delegate of CawCo's pick, up to $2.00 and 30 minutes. The last 10 runs cost $3.84.";

/** The project's routines, in the order the person keeps them: by name. */
export const ROUTINES: ShapeRoutine[] = [
  {
    id: "rtn-bun",
    name: "Bun 1.4 release",
    sentence:
      "Waiting for Bun 1.4.0 to be released. The latest is still bun-v1.3.9.",
    ago: "40 min ago",
    ask: null,
    running: false,
    off: false,
    lane: "soon",
    next: "12:00",
    nextIn: 20,
    does: "Checks GitHub for Bun's latest release, and lets the dashboard's move to Bun's test runner start once 1.4.0 is out.",
    wait: {
      statement: "Bun 1.4.0 is released on GitHub.",
      how: "command",
      command:
        "curl -fsS https://api.github.com/repos/oven-sh/bun/releases/latest | jq -e '.tag_name == \"bun-v1.4.0\"'",
      saidBy: "The command answered",
      holds: [
        {
          id: "tsk-451",
          title: "Move the dashboard to Bun 1.4's test runner",
        },
      ],
      steps: 0,
      until: "Looks until it's out: no date to give up.",
    },
    action: null,
    rhythm: "Every hour, on the hour",
    ahead: ["Today 12:00", "Today 13:00", "Today 14:00"],
    alsoStarts: null,
    held: null,
    runs: [
      {
        id: "r1",
        by: "Its time",
        status: "neutral",
        took: "2 s",
        when: "Today 11:00",
        words: "Not yet: false (exit 1)",
        session: false,
      },
      {
        id: "r2",
        by: "Its time",
        status: "neutral",
        took: "2 s",
        when: "Today 10:00",
        words: "Not yet: false (exit 1)",
        session: false,
      },
      {
        id: "r3",
        by: "Its time",
        status: "neutral",
        took: "3 s",
        when: "Today 09:00",
        words: "Not yet: false (exit 1)",
        session: false,
      },
    ],
    runsTotal: 61,
    madeBy: "You, on 20 Nov",
    madeWhy: null,
    spend:
      "A command with no model: it runs in a sandboxed copy of the project on obelisk, for a minute at most, and costs nothing.",
    paused: false,
  },
  {
    id: "rtn-nightly",
    name: "Check the nightly build",
    sentence: "Nightly 8443 installed on obelisk and its smoke test passed.",
    ago: "17 h ago",
    ask: null,
    running: false,
    off: false,
    lane: "today",
    next: "18:00",
    nextIn: 380,
    does: "Installs last night's nightly on obelisk, runs the smoke test, and tells Caw only when something breaks.",
    wait: null,
    action: null,
    rhythm: "Every day at 18:00",
    ahead: ["Today 18:00", "Tomorrow 18:00", "Mon 18:00"],
    alsoStarts: null,
    held: null,
    runs: [
      {
        id: "n1",
        by: "Its time",
        status: "done",
        took: "6 min",
        when: "Yesterday 18:00",
        words:
          "Nightly 8443 installed on obelisk; smoke test passed in 41 s. Nothing to report.",
        session: true,
      },
      {
        id: "n2",
        by: "Its time",
        status: "done",
        took: "7 min",
        when: "Thu 18:00",
        words:
          "Nightly 8435 installed on obelisk; smoke test passed in 44 s. Nothing to report.",
        session: true,
      },
    ],
    runsTotal: 38,
    madeBy: "You, on 15 Oct",
    madeWhy: null,
    spend: DELEGATE_SPEND,
    paused: false,
  },
  {
    id: "rtn-stale",
    name: "Close stale issues",
    sentence:
      "Asks to close 4 issues in bewinxed/cockpit with no activity since September.",
    ago: "yesterday",
    ask: { act: "Review", does: "open" },
    running: false,
    off: false,
    lane: "later",
    next: "Fri 17:00",
    nextIn: 8960,
    does: "Finds issues in bewinxed/cockpit with no activity in 60 days and proposes closing them, with a closing comment for each.",
    wait: null,
    action: {
      sentence:
        "Close #702, #715, #731 and #740, each with a comment saying it went quiet and can be reopened.",
      service: "GitHub",
      account: "bewinxed",
      call: "issues.update state=closed × 4, issues.createComment × 4",
      runs: "As soon as you approve",
    },
    rhythm: "Every Friday at 17:00",
    ahead: ["Fri 28 Nov 17:00", "Fri 5 Dec 17:00", "Fri 12 Dec 17:00"],
    alsoStarts: null,
    held: null,
    runs: [
      {
        id: "s1",
        by: "Its time",
        status: "waiting",
        took: "4 min",
        when: "Yesterday 17:00",
        words:
          "Found 4 issues quiet for more than 60 days and asked you to approve closing them.",
        session: true,
      },
      {
        id: "s2",
        by: "Its time",
        status: "done",
        took: "3 min",
        when: "Fri 14 Nov 17:00",
        words: "No issue has been quiet for 60 days. Nothing to report.",
        session: true,
      },
    ],
    runsTotal: 9,
    madeBy: "You, on 19 Sep",
    madeWhy: null,
    spend: DELEGATE_SPEND,
    paused: false,
  },
  {
    id: "rtn-preview",
    name: "Deploy preview is green",
    sentence:
      "Done: preview.cawco.dev answered 200 on 19 Nov, and tsk-430 started.",
    ago: null,
    ask: null,
    running: false,
    off: true,
    lane: "off",
    next: "Finished on 19 Nov",
    nextIn: 99_999,
    does: "Asks preview.cawco.dev for its health page, and lets the landing copy pass start once it answers.",
    wait: {
      statement: "preview.cawco.dev/health answers 200.",
      how: "command",
      command: "curl -fsS -o /dev/null https://preview.cawco.dev/health",
      saidBy: "The command answered",
      holds: [{ id: "tsk-430", title: "Rewrite the landing's first fold" }],
      steps: 0,
      until: "Met on 19 Nov at 16:20; it has stopped looking for good.",
    },
    action: null,
    rhythm: "Every 10 minutes",
    ahead: [],
    alsoStarts: null,
    held: "Finished: once met it never looks again.",
    runs: [
      {
        id: "p1",
        by: "Its time",
        status: "done",
        took: "1 s",
        when: "19 Nov 16:20",
        words: "Met (exit 0)",
        session: false,
      },
      {
        id: "p2",
        by: "Its time",
        status: "neutral",
        took: "11 s",
        when: "19 Nov 16:10",
        words: "Not yet: curl: (22) The requested URL returned error: 503",
        session: false,
      },
    ],
    runsTotal: 144,
    madeBy: "Write the landing's first fold, a session, on 18 Nov",
    madeWhy:
      "The copy pass can't start until the preview deploy is healthy, so I'll hold tsk-430 on a check of its health page.",
    spend:
      "A command with no model: it runs in a sandboxed copy of the project on obelisk, for a minute at most, and costs nothing.",
    paused: false,
  },
  {
    id: "rtn-streams",
    name: "Event Streams general availability",
    sentence:
      "Stopped looking on 20 Nov without a yes, so tsk-448 is still held.",
    ago: "2 days ago",
    ask: { act: "Keep looking", does: "open" },
    running: false,
    off: false,
    lane: "off",
    next: "Stopped on 20 Nov",
    nextIn: 99_999,
    does: "Reads GitHub's changelog and the Event Streams docs, and judges whether Event Streams is generally available.",
    wait: {
      statement: "GitHub Event Streams is generally available.",
      how: "model",
      command: null,
      saidBy: "The model answered",
      holds: [
        {
          id: "tsk-448",
          title: "Replace the GitHub poller with Event Streams",
        },
      ],
      steps: 2,
      until: "Gave up on 20 Nov, the date it was given.",
    },
    action: null,
    rhythm: "Every day at 10:00",
    ahead: [],
    alsoStarts: null,
    held: "Stopped at its date: nothing runs until you keep it looking.",
    runs: [
      {
        id: "e1",
        by: "Its time",
        status: "neutral",
        took: "3 min",
        when: "20 Nov 10:00",
        words:
          "Not yet: the changelog still lists Event Streams as a public preview, last updated 12 Nov.",
        session: true,
      },
      {
        id: "e2",
        by: "Its time",
        status: "neutral",
        took: "2 min",
        when: "19 Nov 10:00",
        words: "Not yet: no general availability post on the changelog.",
        session: true,
      },
    ],
    runsTotal: 12,
    madeBy: "You, on 8 Nov",
    madeWhy: null,
    spend: DELEGATE_SPEND,
    paused: false,
  },
  {
    id: "rtn-issues",
    name: "File GitHub issues as tasks",
    sentence:
      "Waits for a new issue in bewinxed/cockpit. The last one became tsk-412.",
    ago: "27 days ago",
    ask: null,
    running: false,
    off: false,
    lane: "event",
    next: "When an issue opens",
    nextIn: 99_999,
    does: "Tells Caw about each new issue in bewinxed/cockpit, and Caw files it as a task in Triage.",
    wait: null,
    action: null,
    rhythm: "No set time",
    ahead: [],
    alsoStarts:
      "An issue opened in bewinxed/cockpit, by anyone. GitHub is read every 5 minutes; it was last read 3 min ago.",
    held: null,
    runs: [
      {
        id: "i1",
        by: "Issue #712 opened",
        status: "done",
        took: "1 min",
        when: "26 Oct 14:02",
        words: "Filed issue #712 as tsk-412 in Triage.",
        session: true,
      },
    ],
    runsTotal: 14,
    madeBy: "Caw, on 3 Oct, when you asked for it",
    madeWhy: null,
    spend: "Each run is a message to Caw in the project's conversation.",
    paused: false,
  },
  {
    id: "rtn-memory",
    name: "Memory curator",
    sentence: "Added 3 rules and staged 6 lessons from yesterday's sessions.",
    ago: "8 h ago",
    ask: null,
    running: false,
    off: false,
    lane: "later",
    next: "Tomorrow 03:00",
    nextIn: 920,
    does: "Reads what you told agents since its last run and keeps the project's rules and lessons current. CawCo's own: what it does is fixed.",
    wait: null,
    action: null,
    rhythm: "Every night at 03:00",
    ahead: ["Tomorrow 03:00", "Mon 03:00", "Tue 03:00"],
    alsoStarts: null,
    held: null,
    runs: [
      {
        id: "m1",
        by: "Its time",
        status: "done",
        took: "9 min",
        when: "Today 03:00",
        words:
          "Memory run: 3 rules added, 6 lessons staged, 2 lessons corroborated, 26 sources dropped.",
        session: true,
      },
      {
        id: "m2",
        by: "Its time",
        status: "done",
        took: "12 min",
        when: "Yesterday 03:00",
        words:
          "Memory run: 10 lessons added (1 of them a check), 1 staged, 34 sources dropped.",
        session: true,
      },
    ],
    runsTotal: 97,
    madeBy: "CawCo",
    madeWhy: null,
    spend: DELEGATE_SPEND,
    paused: false,
  },
  {
    id: "rtn-release-notes",
    name: "Nightly release notes",
    sentence:
      "Writing the notes for 14 commits that landed since last night's nightly.",
    ago: null,
    ask: null,
    running: true,
    off: false,
    lane: "soon",
    next: "Running now",
    nextIn: 0,
    does: "Writes release notes for what landed on main since the last nightly, in the changelog's voice, and opens them for you to read.",
    wait: null,
    action: null,
    rhythm: "Every day at 11:30",
    ahead: ["Tomorrow 11:30", "Mon 11:30", "Tue 11:30"],
    alsoStarts: null,
    held: null,
    runs: [
      {
        id: "rn1",
        by: "Its time",
        status: "running",
        took: "Running for 10 min",
        when: "Today 11:30",
        words: "Reading 14 commits since nightly 8443.",
        session: true,
      },
      {
        id: "rn2",
        by: "Its time",
        status: "done",
        took: "8 min",
        when: "Yesterday 11:30",
        words:
          "Wrote notes for nightly 8443: routine runs now open their sessions, and 6 fixes.",
        session: true,
      },
    ],
    runsTotal: 41,
    madeBy: "You, on 12 Oct",
    madeWhy: null,
    spend: DELEGATE_SPEND,
    paused: false,
  },
  {
    id: "rtn-changelog",
    name: "Post the weekly changelog to X",
    sentence: "Paused by you on 4 Nov.",
    ago: null,
    ask: null,
    running: false,
    off: true,
    lane: "off",
    next: "Paused",
    nextIn: 99_999,
    does: "Drafts the week's changelog as a post for @cawco_dev and asks you to approve it before it goes out.",
    wait: null,
    action: null,
    rhythm: "Every Sunday at 10:00",
    ahead: [],
    alsoStarts: null,
    held: "Paused by you on 4 Nov: nothing runs until you resume it.",
    runs: [
      {
        id: "c1",
        by: "Its time",
        status: "done",
        took: "5 min",
        when: "Sun 2 Nov 10:00",
        words:
          "Drafted the week's post (271 characters) and you approved it; it went out at 10:12.",
        session: true,
      },
    ],
    runsTotal: 7,
    madeBy: "You, on 14 Sep",
    madeWhy: null,
    spend: DELEGATE_SPEND,
    paused: true,
  },
  {
    id: "rtn-e2e",
    name: "Re-run the pairing test on main",
    sentence:
      "A session made this 2 days ago. It turns itself off in 5 days unless you keep it.",
    ago: null,
    ask: { act: "Keep", does: "keep" },
    running: false,
    off: false,
    lane: "today",
    next: "13:00",
    nextIn: 80,
    does: "Runs the phone pairing end-to-end test on main and reports only a failure, with the failing step and its screenshot.",
    wait: null,
    action: null,
    rhythm: "Every 2 hours, on odd hours",
    ahead: ["Today 13:00", "Today 15:00", "Today 17:00"],
    alsoStarts: null,
    held: null,
    runs: [
      {
        id: "x1",
        by: "Its time",
        status: "done",
        took: "4 min",
        when: "Today 11:00",
        words: "Pairing test passed (3 of 3 tries). Nothing to report.",
        session: true,
      },
      {
        id: "x2",
        by: "Its time",
        status: "done",
        took: "4 min",
        when: "Today 09:00",
        words: "Pairing test passed (3 of 3 tries). Nothing to report.",
        session: true,
      },
    ],
    runsTotal: 23,
    madeBy: "Fix the flaky pairing test, a session, on 20 Nov",
    madeWhy:
      "The fix looks right, but the flake showed up about once a day. I'll keep re-running the test on main for a week so we see whether it comes back.",
    spend: DELEGATE_SPEND,
    paused: false,
  },
  {
    id: "rtn-unused",
    name: "Unused skills and servers",
    sentence: "Found nothing that went unused in the last 30 days.",
    ago: "5 days ago",
    ask: null,
    running: false,
    off: false,
    lane: "later",
    next: "Mon 09:00",
    nextIn: 2720,
    does: "Counts what this project's sessions call, and proposes unlisting the skills and servers nobody called in 30 days. Nothing changes until you approve. CawCo's own: what it does is fixed.",
    wait: null,
    action: null,
    rhythm: "Every Monday at 09:00",
    ahead: ["Mon 09:00", "Mon 1 Dec 09:00", "Mon 8 Dec 09:00"],
    alsoStarts: null,
    held: null,
    runs: [
      {
        id: "u1",
        by: "Its time",
        status: "done",
        took: "2 min",
        when: "Mon 17 Nov 09:00",
        words:
          "Every skill and server listed here was called at least once in 30 days. Nothing to report.",
        session: true,
      },
    ],
    runsTotal: 6,
    madeBy: "CawCo, when you turned on Caw's suggestion on 13 Oct",
    madeWhy: null,
    spend: DELEGATE_SPEND,
    paused: false,
  },
  {
    id: "rtn-crw",
    name: "Watch CRW upstream PRs",
    sentence: "Failed twice: gh answered “HTTP 401: Bad credentials”.",
    ago: "25 min ago",
    ask: { act: "Run again", does: "run" },
    running: false,
    off: false,
    lane: "soon",
    next: "12:15",
    nextIn: 35,
    does: "Checks our open pull requests on other people's repositories, and tells Caw when a maintainer comments, reviews or merges one.",
    wait: null,
    action: null,
    rhythm: "Every hour at :15",
    ahead: ["Today 12:15", "Today 13:15", "Today 14:15"],
    alsoStarts: null,
    held: null,
    runs: [
      {
        id: "w1",
        by: "A retry",
        status: "failed",
        took: "1 min",
        when: "Today 11:17",
        words:
          "gh pr list --author bewinxed --state open: HTTP 401: Bad credentials (https://api.github.com/graphql)",
        session: true,
      },
      {
        id: "w2",
        by: "Its time",
        status: "failed",
        took: "1 min",
        when: "Today 11:15",
        words:
          "gh pr list --author bewinxed --state open: HTTP 401: Bad credentials (https://api.github.com/graphql)",
        session: true,
      },
      {
        id: "w3",
        by: "Its time",
        status: "done",
        took: "2 min",
        when: "Today 10:15",
        words:
          "fastcrw/crw #766 was merged; the other three are unchanged. Told Caw.",
        session: true,
      },
    ],
    runsTotal: 214,
    madeBy: "You, on 2 Nov",
    madeWhy: null,
    spend: DELEGATE_SPEND,
    paused: false,
  },
];

/** One of the project's routines, by its id, for a states file. */
export function named(id: string): ShapeRoutine {
  const routine = ROUTINES.find((one) => one.id === id);
  if (!routine) {
    throw new Error(`No routine ${id} in the shape's data`);
  }
  return routine;
}

/** The lanes the By when shape lays routines out in, in order. */
export const LANES: { lane: Lane; label: string; line: string }[] = [
  { lane: "soon", label: "Now and next hour", line: "Running or due by 12:40" },
  { lane: "today", label: "Later today", line: "Before midnight" },
  { lane: "later", label: "Later", line: "Tomorrow and after" },
  { lane: "event", label: "When something happens", line: "No set time" },
  { lane: "off", label: "Not running", line: "Paused, finished or stopped" },
];
