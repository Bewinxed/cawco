/**
 * The project "cockpit" as the Outcomes view reads it on Sunday 22 Nov at
 * 14:20 on the owner's clock: five outcomes in the order he said them, one
 * waiting on his answer (Nightly staging check asks whether to restart
 * staging), two not reached yet, one done, one with a line nothing checks,
 * and Caw's suggested outcomes. Task numbers and routine names are the
 * project's own.
 */
import type { Outcome, SuggestedOutcome } from "./outcomes";

const MAIN_WATCH = {
  kind: "routine",
  name: "Main watch",
  does: "Each run reads the checks of every commit pushed to main since the last run, and says which failed and why.",
  when: "On every push to main, and every night at 03:00. Next: tonight at 03:00.",
  cannotStart: null,
} as const;

const PR_SWEEP = {
  kind: "routine",
  name: "PR sweep",
  does: "Each run reads the open pull requests and answers each review comment, or says why not.",
  when: "Every two hours. Next: today at 15:00.",
  cannotStart: null,
} as const;

const SIGNUPS_REPORT = {
  kind: "routine",
  name: "Weekly signups report",
  does: "Each run reads last week's signups by source from the analytics export and writes the week's report.",
  when: "Every Sunday at 08:00. Next: 29 Nov at 08:00.",
  cannotStart: null,
} as const;

const MAIN_GREEN: Outcome = {
  id: "main-green",
  sentence: "Main stays green.",
  standing: "All 14 commits since Friday passed their checks.",
  lines: [
    {
      id: "main-checks",
      sentence: "Every commit on main passes its checks",
      state: { kind: "done" },
      finding: "All 14 commits since Friday passed",
      found: {
        said: "All 14 commits since Friday passed lint, types and the binary's tests.",
        from: "Main watch, today at 13:58",
      },
      ask: null,
      checker: MAIN_WATCH,
      work: [],
    },
    {
      id: "main-skips",
      sentence: "No check has been skipped for a day",
      state: { kind: "done" },
      finding: "None skipped since Friday",
      found: {
        said: "No check was skipped on any of the 14 commits.",
        from: "Main watch, today at 13:58",
      },
      ask: null,
      checker: MAIN_WATCH,
      work: [],
    },
  ],
  work: [],
};

const PULL_REQUESTS: Outcome = {
  id: "pull-requests",
  sentence: "Make sure all pull requests are addressed.",
  standing: "#412 and #415 have no reply; an agent is answering #412.",
  lines: [
    {
      id: "pr-answered",
      sentence: "Every open pull request has our answer",
      state: { kind: "notYet" },
      finding: "#412 and #415 have no reply",
      found: {
        said: "#412 and #415 have review comments with no reply.",
        from: "PR sweep, today at 13:46",
      },
      ask: null,
      checker: PR_SWEEP,
      work: [
        {
          ref: "#152",
          title: "Answer the review on #412",
          state: "In progress: a session is working",
          live: true,
        },
        {
          ref: "#153",
          title: "Answer the review on #415",
          state: "Backlog",
          live: false,
        },
      ],
    },
    {
      id: "pr-day",
      sentence: "None has waited a day",
      state: { kind: "done" },
      finding: "The oldest has waited 9 hours",
      found: {
        said: "The oldest open pull request, #412, was opened 9 hours ago.",
        from: "PR sweep, today at 13:46",
      },
      ask: null,
      checker: PR_SWEEP,
      work: [],
    },
  ],
  work: [],
};

const STAGING: Outcome = {
  id: "staging",
  sentence: "Staging is safe to demo.",
  standing: "Staging answered 502 twice overnight.",
  lines: [
    {
      id: "staging-healthy",
      sentence: "Staging is healthy",
      state: { kind: "unknown" },
      finding: "Answered 502 at 02:00 and again at 02:20",
      found: {
        said: "Staging answered 502 twice, so the run could not tell whether it is healthy.",
        from: "Nightly staging check, today at 02:24",
      },
      ask: {
        id: "staging-restart",
        who: "Nightly staging check",
        since: "today at 02:24",
        quote:
          "Staging answered 502 twice. Restart it, or wait for the deploy?",
        evidence: [
          { at: "01:52", saw: "Deploy #318 of main started; still running" },
          { at: "02:00", saw: "Staging's health page answered 502" },
          { at: "02:20", saw: "Asked again, 502 again" },
        ],
        choices: ["Restart staging", "Wait for the deploy"],
      },
      checker: {
        kind: "routine",
        name: "Nightly staging check",
        does: "Each run loads staging's health page and opens the board, then says whether staging is healthy.",
        when: "Every night at 02:00. The next run waits for your answer.",
        cannotStart: "No run starts until you answer.",
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
      state: { kind: "done" },
      finding: "v0.42.0 has its 4 binaries and its checksums",
      found: {
        said: "v0.42.0 has its four binaries and its checksums on the release page.",
        from: "Release asset check, yesterday at 18:05",
      },
      ask: null,
      checker: {
        kind: "routine",
        name: "Release asset check",
        does: "Each run reads the newest release on GitHub and checks that every binary and its checksum is attached.",
        when: "Whenever a release is published, and every day at 18:00. Next: today at 18:00.",
        cannotStart: null,
      },
      work: [],
    },
    {
      id: "staging-demo",
      sentence: "The demo account signs in",
      state: { kind: "was", on: "12 Nov" },
      finding: "Signed in on 12 Nov",
      found: {
        said: "The demo account signed in and opened the board.",
        from: "Demo sign-in check, 12 Nov at 09:00",
      },
      ask: null,
      checker: {
        kind: "ended",
        why: "Demo sign-in check ended on 12 Nov, after the sign-in had worked for a week.",
      },
      work: [],
    },
  ],
  work: [
    {
      ref: "#158",
      title: "Write the five-minute demo script",
      state: "Review",
      live: false,
    },
  ],
};

/** What Staging says once the hub takes his answer, by his choice. */
export const STAGING_ANSWERED: Record<
  string,
  { standing: string; finding: string }
> = {
  "Restart staging": {
    standing:
      "Nightly staging check is restarting staging and looks again once it is up.",
    finding: "Restarting now",
  },
  "Wait for the deploy": {
    standing: "Nightly staging check runs again when deploy #318 finishes.",
    finding: "Waiting for deploy #318",
  },
};

const DOCS: Outcome = {
  id: "docs",
  sentence: "The docs match the product.",
  standing:
    "Nothing checks for pages that name a removed setting; Caw suggests a routine.",
  lines: [
    {
      id: "docs-readme",
      sentence: "Every command in the README runs as written",
      state: { kind: "done" },
      finding: "All 23 ran on a fresh checkout on Monday",
      found: {
        said: "All 23 commands in the README ran on a fresh checkout.",
        from: "README check, Monday at 09:12",
      },
      ask: null,
      checker: {
        kind: "routine",
        name: "README check",
        does: "Each run clones the repository fresh and runs every command in the README, in order.",
        when: "Every Monday at 09:00. Next: tomorrow at 09:00.",
        cannotStart: null,
      },
      work: [],
    },
    {
      id: "docs-settings",
      sentence: "No page names a removed setting",
      state: { kind: "unknown" },
      finding: "Nothing checks this",
      found: null,
      ask: null,
      checker: {
        kind: "suggested",
        does: "Every morning at 09:00, an agent reads each docs page against the settings the product has today.",
      },
      work: [],
    },
  ],
  work: [],
};

const SIGNUPS: Outcome = {
  id: "signups",
  sentence: "A hundred signups a week come from search.",
  standing: "64 signups from search in the week to 21 Nov, up from 51.",
  lines: [
    {
      id: "signups-week",
      sentence: "Last week's signups from search reached 100",
      state: { kind: "notYet" },
      finding: "64, up from 51 the week before",
      found: {
        said: "Search brought 64 signups from 15 to 21 Nov, up from 51 the week before.",
        from: "Weekly signups report, today at 08:04",
      },
      ask: null,
      checker: SIGNUPS_REPORT,
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
      state: { kind: "done" },
      finding: "The slowest loads in 1.4 s",
      found: {
        said: "The slowest of 9 landing pages loaded in 1.4 seconds, from Frankfurt.",
        from: "Landing speed check, today at 06:03",
      },
      ask: null,
      checker: {
        kind: "routine",
        name: "Landing speed check",
        does: "Each run loads every landing page from three regions and reads how long each took.",
        when: "Every day at 06:00. Next: tomorrow at 06:00.",
        cannotStart: null,
      },
      work: [],
    },
    {
      id: "signups-report",
      sentence: "The weekly report was delivered",
      state: { kind: "done" },
      finding: "Delivered today at 08:04",
      found: {
        said: "The report for 15 to 21 Nov is in the project's folder.",
        from: "Weekly signups report, today at 08:04",
      },
      ask: null,
      checker: SIGNUPS_REPORT,
      work: [],
    },
  ],
  work: [],
};

/** The project's outcomes, in the order he said them. */
export const COCKPIT_OUTCOMES: Outcome[] = [
  MAIN_GREEN,
  PULL_REQUESTS,
  STAGING,
  DOCS,
  SIGNUPS,
];

/** Caw's suggested outcomes, the one on show first. */
export const COCKPIT_SUGGESTIONS: SuggestedOutcome[] = [
  {
    id: "release-notes",
    sentence: "Every release has notes a user can read.",
    lines: [
      "Each release on GitHub has notes",
      "The notes name every change a user can see",
    ],
  },
  {
    id: "install-works",
    sentence: "A new machine installs CawCo in one command.",
    lines: [
      "install.sh finishes on a fresh Ubuntu 24.04",
      "install.sh finishes on a fresh macOS 15",
      "The installed daemon joins the hub within a minute",
    ],
  },
  {
    id: "spend-under-cap",
    sentence: "A day's spend stays under the project's cap.",
    lines: ["No day this week went past $40"],
  },
];
