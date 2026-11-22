/**
 * The project "cockpit" as Outcomes reads it on Saturday 22 November 2026
 * at 14:52 on the owner's clock: five outcomes in the order he said them,
 * "Staging is safe to demo" waiting on his answer to the nightly staging
 * check, Caw's suggestion, and the work that serves no outcome. Every
 * string is a placeholder for Fable's copy.
 */
import type { Ask, Outcome, OutcomesRecord } from "./outcomes";

export const STAGING_ASK: Ask = {
  id: "ask-staging-502",
  from: "Nightly staging check",
  since: "Since 02:14",
  ask: "Staging answered 502 twice. Restart it, or wait for the deploy?",
  evidence: [
    "02:09 GET https://staging.cawco.dev/ answered 502 Bad Gateway",
    "02:13 GET https://staging.cawco.dev/ answered 502 Bad Gateway",
    "The deploy of a3f9c21 started at 01:58 and has not finished.",
  ],
  holds: "Nightly staging check will not start again until you answer.",
  choices: ["Restart it", "Wait for the deploy"],
  act: "Answer the question",
};

const MAIN: Outcome = {
  id: "main-green",
  sentence: "Main stays green.",
  asks: [],
  lines: [
    {
      id: "main-checks",
      sentence: "Every commit on main passes its checks",
      answer: { kind: "holds" },
      why: {
        kind: "said",
        by: "Main CI watch",
        said: "All 14 checks passed on a3f9c21, Show the run's cost in the session card.",
        at: "13:58 today",
      },
      checker: {
        name: "Main CI watch",
        does: "Each run reads the checks of the newest commit on main and says which failed.",
        when: "On every push to main. Next: on the next push.",
      },
      work: [],
    },
    {
      id: "main-skips",
      sentence: "No check has been skipped for a day",
      answer: { kind: "holds" },
      why: {
        kind: "said",
        by: "Skipped-check sweep",
        said: "No check was skipped in the last 24 hours.",
        at: "08:00 today",
      },
      checker: {
        name: "Skipped-check sweep",
        does: "Each run lists the checks skipped on main since yesterday.",
        when: "Every morning at 08:00. Next: tomorrow at 08:00.",
      },
      work: [],
    },
  ],
};

const PULLS: Outcome = {
  id: "pulls-addressed",
  sentence: "Make sure all pull requests are addressed.",
  asks: [],
  lines: [
    {
      id: "pulls-answered",
      sentence: "Every open pull request has our answer",
      answer: { kind: "fails" },
      why: {
        kind: "said",
        by: "PR sweep",
        said: "#412 and #415 have review comments with no reply.",
        at: "40 minutes ago",
      },
      checker: {
        name: "PR sweep",
        does: "Each run reads the open pull requests and answers each review comment or says why not.",
        when: "Every two hours. Next: 15:00.",
      },
      work: [
        {
          ref: "#152",
          name: "Answer the review on #412",
          state: "A session is working",
          live: true,
        },
        {
          ref: "#153",
          name: "Answer the review on #415, which asks to split the migration into two",
          state: "Waiting for #152",
          live: false,
        },
      ],
    },
    {
      id: "pulls-age",
      sentence: "None has waited a day",
      answer: { kind: "holds" },
      why: {
        kind: "said",
        by: "PR sweep",
        said: "The oldest open pull request, #415, was opened 9 hours ago.",
        at: "40 minutes ago",
      },
      checker: {
        name: "PR sweep",
        does: "Each run reads the open pull requests and answers each review comment or says why not.",
        when: "Every two hours. Next: 15:00.",
      },
      work: [],
    },
  ],
};

const STAGING: Outcome = {
  id: "staging-demo",
  sentence: "Staging is safe to demo.",
  asks: [{ ask: STAGING_ASK, line: "staging-healthy" }],
  lines: [
    {
      id: "staging-healthy",
      sentence: "Staging is healthy",
      answer: { kind: "unknown" },
      why: {
        kind: "said",
        by: "Nightly staging check",
        said: "Staging answered 502 twice in a row, so I could not tell whether it is healthy.",
        at: "02:14 today",
      },
      checker: {
        name: "Nightly staging check",
        does: "Each run opens staging, signs in with the demo account and loads the dashboard.",
        when: "Every night at 02:00 and after each deploy.",
        state: "Waits for your answer",
        cannotStart: "It waits for your answer",
      },
      work: [
        {
          ref: "#158",
          name: "Move staging to the new database host",
          state: "A session is working",
          live: true,
        },
      ],
    },
    {
      id: "staging-assets",
      sentence: "Release assets are published",
      answer: { kind: "holds" },
      why: {
        kind: "said",
        by: "Release check",
        said: "All 6 assets of v0.42.0 are on the release page and their checksums match.",
        at: "Yesterday at 18:30",
      },
      checker: {
        name: "Release check",
        does: "Each run reads the newest release page and checks every asset's checksum.",
        when: "After each release. Next: on the next release.",
      },
      work: [],
    },
    {
      id: "staging-demo-account",
      sentence: "The demo account signs in",
      answer: { kind: "held", on: "12 Nov" },
      why: {
        kind: "quiet",
        reason:
          "Nothing checks this now: Demo sign-in check ended on 12 Nov, when its run stopped it after five passing runs.",
      },
      checker: {
        name: "Demo sign-in check",
        does: "Each run signs in to staging as demo@cawco.dev and opens the board.",
        when: "Every morning at 07:30.",
        state: "Ended: its run stopped it on 12 Nov",
        cannotStart: "It has ended",
      },
      work: [],
    },
  ],
};

const DOCS: Outcome = {
  id: "docs-match",
  sentence: "The docs match the product.",
  asks: [],
  lines: [
    {
      id: "docs-readme",
      sentence: "Every command in the README runs as written",
      answer: { kind: "holds" },
      why: {
        kind: "said",
        by: "README run-through",
        said: "All 11 commands ran on a clean machine and printed what the README says.",
        at: "Thursday at 22:00",
      },
      checker: {
        name: "README run-through",
        does: "Each run copies every command in the README into a fresh machine and runs it.",
        when: "Every Thursday at 22:00. Next: Thursday at 22:00.",
      },
      work: [],
    },
    {
      id: "docs-settings",
      sentence: "No page names a removed setting",
      answer: { kind: "unknown" },
      why: { kind: "quiet", reason: "Nothing checks this." },
      checker: null,
      suggested: {
        does: "An agent reads every docs page and lists each setting the product no longer has.",
        when: "Every Monday at 09:00",
      },
      work: [],
    },
  ],
};

const SIGNUPS: Outcome = {
  id: "search-signups",
  sentence: "A hundred signups a week come from search.",
  asks: [],
  lines: [
    {
      id: "signups-count",
      sentence: "Last week's signups from search reached 100",
      answer: { kind: "fails" },
      why: {
        kind: "said",
        by: "Weekly search report",
        said: "61 signups came from search last week, 39 short. The pricing page lost its top result on 14 Nov.",
        at: "Monday at 09:00",
      },
      checker: {
        name: "Weekly search report",
        does: "Each run reads last week's signups by source and writes the report.",
        when: "Every Monday at 09:00. Next: Monday at 09:00.",
      },
      work: [
        {
          ref: "#149",
          name: "Rewrite the pricing page's title and summary",
          state: "Failed: the preview build did not start",
          live: false,
        },
      ],
    },
    {
      id: "signups-speed",
      sentence: "Every landing page loads in under two seconds",
      answer: { kind: "holds" },
      why: {
        kind: "said",
        by: "Landing speed check",
        said: "The slowest page, /compare, loaded in 1.4 seconds.",
        at: "06:00 today",
      },
      checker: {
        name: "Landing speed check",
        does: "Each run loads every landing page from three regions and times it.",
        when: "Every day at 06:00. Next: tomorrow at 06:00.",
      },
      work: [],
    },
    {
      id: "signups-report",
      sentence: "The weekly report was delivered",
      answer: { kind: "holds" },
      why: {
        kind: "said",
        by: "Weekly search report",
        said: "Delivered the report for 10 to 16 November.",
        at: "Monday at 09:04",
      },
      checker: {
        name: "Weekly search report",
        does: "Each run reads last week's signups by source and writes the report.",
        when: "Every Monday at 09:00. Next: Monday at 09:00.",
      },
      work: [],
    },
  ],
};

/** "cockpit", with Staging waiting on his answer. */
export const COCKPIT: OutcomesRecord = {
  project: "cockpit",
  outcomes: [MAIN, PULLS, STAGING, DOCS, SIGNUPS],
  suggestion: {
    sentence: "Every release has notes a user can read.",
    lines: [
      "Each tagged release has a notes page",
      "The notes name every setting that changed",
    ],
    more: 2,
  },
  unplaced: {
    holds: "2 tasks and 1 routine",
  },
};

/** The same project once he has answered and the next runs held: every outcome met. */
export const COCKPIT_ALL_CLEAR: OutcomesRecord = {
  ...COCKPIT,
  suggestion: null,
  outcomes: COCKPIT.outcomes.map((outcome) => ({
    ...outcome,
    asks: [],
    lines: outcome.lines.map((line) => ({
      ...line,
      answer: { kind: "holds" },
    })),
  })),
};
