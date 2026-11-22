/**
 * The project "cockpit" as the Outcomes view reads it on Sunday 22 Nov at
 * 14:20 on the owner's clock: five outcomes in the order he said them, one
 * of them waiting on him (Nightly staging check asks whether to restart
 * staging), Caw's one suggested outcome, and the work under no outcome.
 * Task numbers and routine names are the project's own.
 */
import type {
  LineChecker,
  NewestRun,
  Outcome,
  SuggestedOutcome,
  UnplacedRow,
} from "./outcomes";

const MAIN_WATCH_CHECKER: LineChecker = {
  kind: "routine",
  name: "Main watch",
  does: "Each run reads the checks of every commit pushed to main since the last run, and says which failed and why.",
  when: "On every push to main, and every night at 03:00. Next: tonight at 03:00.",
  state: null,
  cannotStart: null,
};

const PR_SWEEP_CHECKER: LineChecker = {
  kind: "routine",
  name: "PR sweep",
  does: "Each run reads the open pull requests and answers each review comment, or says why not.",
  when: "Every two hours. Next: today at 15:00.",
  state: null,
  cannotStart: null,
};

const WEEKLY_SIGNUPS_REPORT_CHECKER: LineChecker = {
  kind: "routine",
  name: "Weekly signups report",
  does: "Each run reads last week's signups by source from the analytics export and writes the week's report.",
  when: "Every Sunday at 08:00. Next: 29 Nov at 08:00.",
  state: null,
  cannotStart: null,
};

const MAIN_WATCH_RUN: NewestRun = {
  when: "Today at 13:58",
  startedBy: "A push to main",
  ended: "Holds",
  took: "2 minutes",
};

export const MAIN_GREEN: Outcome = {
  id: "main-green",
  sentence: "Main stays green.",
  lines: [
    {
      id: "main-checks",
      sentence: "Every commit on main passes its checks",
      answer: { kind: "holds" },
      reason: {
        said: "All 14 commits since Friday passed lint, types and the binary's tests.",
        when: "Today at 13:58",
        from: "Main watch",
      },
      ask: null,
      checker: MAIN_WATCH_CHECKER,
      run: MAIN_WATCH_RUN,
      work: [],
    },
    {
      id: "main-skips",
      sentence: "No check has been skipped for a day",
      answer: { kind: "holds" },
      reason: null,
      ask: null,
      checker: MAIN_WATCH_CHECKER,
      run: MAIN_WATCH_RUN,
      work: [],
    },
  ],
  plan: {
    groups: [
      {
        line: "Every commit on main passes its checks",
        rows: [
          {
            kind: "routine",
            name: "Main watch",
            ref: null,
            state: "Holds, 22 minutes ago",
            live: false,
          },
        ],
      },
    ],
    done: 3,
  },
};

export const PULL_REQUESTS: Outcome = {
  id: "pull-requests",
  sentence: "Make sure all pull requests are addressed.",
  lines: [
    {
      id: "pr-answered",
      sentence: "Every open pull request has our answer",
      answer: { kind: "fails" },
      reason: {
        said: "#412 and #415 have review comments with no reply.",
        when: "40 minutes ago",
        from: "PR sweep",
      },
      ask: null,
      checker: PR_SWEEP_CHECKER,
      run: {
        when: "Today at 13:40",
        startedBy: "Its time",
        ended: "Does not hold",
        took: "6 minutes",
      },
      work: [
        {
          ref: "#152",
          title: "Answer the review on #412",
          state: "In progress: a session is working",
          live: true,
        },
      ],
    },
    {
      id: "pr-day",
      sentence: "None has waited a day",
      answer: { kind: "holds" },
      reason: null,
      ask: null,
      checker: PR_SWEEP_CHECKER,
      run: {
        when: "Today at 13:40",
        startedBy: "Its time",
        ended: "Holds",
        took: "6 minutes",
      },
      work: [],
    },
  ],
  plan: {
    groups: [
      {
        line: "Every open pull request has our answer",
        rows: [
          {
            kind: "routine",
            name: "PR sweep",
            ref: null,
            state: "Does not hold, 40 minutes ago",
            live: false,
          },
          {
            kind: "task",
            name: "Answer the review on #412",
            ref: "#152",
            state: "In progress",
            live: true,
          },
          {
            kind: "task",
            name: "Answer the review on #415",
            ref: "#153",
            state: "Backlog",
            live: false,
          },
        ],
      },
    ],
    done: 7,
  },
};

export const STAGING: Outcome = {
  id: "staging",
  sentence: "Staging is safe to demo.",
  lines: [
    {
      id: "staging-healthy",
      sentence: "Staging is healthy",
      answer: { kind: "unknown" },
      reason: {
        said: "Staging answered 502 twice, so the run could not tell whether it is healthy.",
        when: "Today at 02:24",
        from: "Nightly staging check",
      },
      ask: {
        who: "Nightly staging check",
        since: "02:24",
        quote:
          "Staging answered 502 twice. Restart it, or wait for the deploy?",
        evidence: [
          "02:00 · staging.cockpit.dev/health answered 502 Bad Gateway",
          "02:20 · asked again, 502 again",
          "Deploy #318 of main started at 01:52 and has not finished",
        ],
        held: "Nightly staging check will not start again until you answer.",
        choices: ["Restart it", "Wait for the deploy"],
        goesOn: "Nightly staging check starts again.",
      },
      checker: {
        kind: "routine",
        name: "Nightly staging check",
        does: "Each run loads staging's health page, signs in as the demo user and opens the board, then says whether staging is healthy.",
        when: "Every night at 02:00.",
        state: null,
        cannotStart: "Its next run waits for your answer.",
      },
      run: {
        when: "Today at 02:00",
        startedBy: "Its time",
        ended: "Stopped to ask you",
        took: "24 minutes",
      },
      work: [
        {
          ref: "#161",
          title: "Move staging behind the new load balancer",
          state: "In progress: a session is working",
          live: true,
        },
      ],
    },
    {
      id: "staging-assets",
      sentence: "Release assets are published",
      answer: { kind: "holds" },
      reason: {
        said: "v0.42.0 has its four binaries and its checksums on the release page.",
        when: "Yesterday at 18:05",
        from: "Release asset check",
      },
      ask: null,
      checker: {
        kind: "routine",
        name: "Release asset check",
        does: "Each run reads the newest release on GitHub and checks that every binary and its checksum is attached.",
        when: "Whenever a release is published, and every day at 18:00. Next: today at 18:00.",
        state: null,
        cannotStart: null,
      },
      run: {
        when: "Yesterday at 18:00",
        startedBy: "Its time",
        ended: "Holds",
        took: "5 minutes",
      },
      work: [],
    },
    {
      id: "staging-demo",
      sentence: "The demo account signs in",
      answer: { kind: "held", on: "12 Nov" },
      reason: {
        said: "Nothing checks this now: Demo sign-in check ended on 12 Nov, when its stop condition was met.",
        when: "12 Nov at 09:00",
        from: "Demo sign-in check",
      },
      ask: null,
      checker: {
        kind: "ended",
        name: "Demo sign-in check",
        why: "Ended on 12 Nov: its run said the sign-in had held for a week, which was its stop condition.",
      },
      run: {
        when: "12 Nov at 09:00",
        startedBy: "Its time",
        ended: "Held, and stopped the routine",
        took: "1 minute",
      },
      work: [],
    },
  ],
  plan: {
    groups: [
      {
        line: "Staging is healthy",
        rows: [
          {
            kind: "routine",
            name: "Nightly staging check",
            ref: null,
            state: "Waits for your answer",
            live: false,
          },
          {
            kind: "task",
            name: "Move staging behind the new load balancer",
            ref: "#161",
            state: "In progress",
            live: true,
          },
        ],
      },
      {
        line: "Release assets are published",
        rows: [
          {
            kind: "routine",
            name: "Release asset check",
            ref: null,
            state: "Holds, yesterday",
            live: false,
          },
        ],
      },
      {
        line: "The demo account signs in",
        rows: [
          {
            kind: "routine",
            name: "Demo sign-in check",
            ref: null,
            state: "Ended on 12 Nov",
            live: false,
          },
        ],
      },
      {
        line: null,
        rows: [
          {
            kind: "task",
            name: "Write the five-minute demo script",
            ref: "#158",
            state: "Review",
            live: false,
          },
        ],
      },
    ],
    done: 4,
  },
};

const DOCS: Outcome = {
  id: "docs",
  sentence: "The docs match the product.",
  lines: [
    {
      id: "docs-readme",
      sentence: "Every command in the README runs as written",
      answer: { kind: "holds" },
      reason: {
        said: "All 23 commands in the README ran on a fresh checkout.",
        when: "Monday at 09:12",
        from: "README check",
      },
      ask: null,
      checker: {
        kind: "routine",
        name: "README check",
        does: "Each run clones the repository fresh and runs every command in the README, in order.",
        when: "Every Monday at 09:00. Next: tomorrow at 09:00.",
        state: null,
        cannotStart: null,
      },
      run: {
        when: "Monday at 09:00",
        startedBy: "Its time",
        ended: "Holds",
        took: "12 minutes",
      },
      work: [],
    },
    {
      id: "docs-settings",
      sentence: "No page names a removed setting",
      answer: { kind: "unknown" },
      reason: null,
      ask: null,
      checker: {
        kind: "suggested",
        text: "Every morning at 09:00, an agent reads each docs page against the settings the product has today.",
      },
      run: null,
      work: [],
    },
  ],
  plan: {
    groups: [
      {
        line: "Every command in the README runs as written",
        rows: [
          {
            kind: "routine",
            name: "README check",
            ref: null,
            state: "Holds, Monday",
            live: false,
          },
        ],
      },
    ],
    done: 2,
  },
};

const SIGNUPS: Outcome = {
  id: "signups",
  sentence: "A hundred signups a week come from search.",
  lines: [
    {
      id: "signups-week",
      sentence: "Last week's signups from search reached 100",
      answer: { kind: "fails" },
      reason: {
        said: "Search brought 64 signups from 16 to 22 Nov, up from 51 the week before.",
        when: "Today at 08:04",
        from: "Weekly signups report",
      },
      ask: null,
      checker: WEEKLY_SIGNUPS_REPORT_CHECKER,
      run: {
        when: "Today at 08:00",
        startedBy: "Its time",
        ended: "Does not hold",
        took: "4 minutes",
      },
      work: [
        {
          ref: "#147",
          title: "Write landing pages for the five most searched setups",
          state: "In progress: 3 of 5 published",
          live: false,
        },
      ],
    },
    {
      id: "signups-speed",
      sentence: "Every landing page loads in under two seconds",
      answer: { kind: "holds" },
      reason: null,
      ask: null,
      checker: {
        kind: "routine",
        name: "Landing speed check",
        does: "Each run loads every landing page from three regions and reads how long each took.",
        when: "Every day at 06:00. Next: tomorrow at 06:00.",
        state: null,
        cannotStart: null,
      },
      run: {
        when: "Today at 06:00",
        startedBy: "Its time",
        ended: "Holds",
        took: "3 minutes",
      },
      work: [],
    },
    {
      id: "signups-report",
      sentence: "The weekly report was delivered",
      answer: { kind: "holds" },
      reason: null,
      ask: null,
      checker: WEEKLY_SIGNUPS_REPORT_CHECKER,
      run: {
        when: "Today at 08:00",
        startedBy: "Its time",
        ended: "Delivered a report",
        took: "4 minutes",
      },
      work: [],
    },
  ],
  plan: {
    groups: [
      {
        line: "Last week's signups from search reached 100",
        rows: [
          {
            kind: "routine",
            name: "Weekly signups report",
            ref: null,
            state: "Does not hold, this morning",
            live: false,
          },
          {
            kind: "task",
            name: "Write landing pages for the five most searched setups",
            ref: "#147",
            state: "In progress",
            live: false,
          },
        ],
      },
    ],
    done: 5,
  },
};

/** The project's outcomes, in the order they were said. */
const COCKPIT_OUTCOMES: Outcome[] = [
  MAIN_GREEN,
  PULL_REQUESTS,
  STAGING,
  DOCS,
  SIGNUPS,
];

/** Caw's suggested outcomes, the one on show first; `more` is counted as they show. */
const COCKPIT_SUGGESTIONS: SuggestedOutcome[] = [
  {
    id: "release-notes",
    sentence: "Every release has notes a user can read.",
    lines: [
      "Each release on GitHub has notes",
      "The notes name every change a user can see",
    ],
    more: 0,
  },
  {
    id: "install-works",
    sentence: "A new machine installs CawCo in one command.",
    lines: [
      "install.sh finishes on a fresh Ubuntu 24.04",
      "install.sh finishes on a fresh macOS 15",
      "The installed daemon joins the hub within a minute",
    ],
    more: 0,
  },
  {
    id: "spend-under-cap",
    sentence: "A day's spend stays under the project's cap.",
    lines: ["No day this week went past $40"],
    more: 0,
  },
];

const COCKPIT_UNPLACED: UnplacedRow[] = [
  {
    kind: "task",
    ref: "#149",
    name: "Upgrade Bun to 1.3 across the repository",
    state: "In progress",
  },
  {
    kind: "task",
    ref: "#163",
    name: "Tidy the release script's flags",
    state: "Backlog",
  },
  {
    kind: "routine",
    ref: null,
    name: "Weekly dependency report",
    state: "Delivered a report, Monday",
  },
];

/** Every story's records and the mock hub's answers, as Outcomes opens on arrival. */
export const COCKPIT_ARGS = {
  outcomes: COCKPIT_OUTCOMES,
  suggestions: COCKPIT_SUGGESTIONS,
  unplaced: COCKPIT_UNPLACED,
  hub: "takes it",
  live: true,
  lastRead: "14:02",
  opens: "arrival",
  conversation: false,
};
