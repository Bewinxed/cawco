/**
 * The advisor's example, drawn by every Workflows option (design report
 * 901c7695): the "Release 2.4" workflow in the Release app project, its
 * five steps, its three checks, run 12 live with step 4 asking the owner,
 * and the eleven runs before it. Fixture data for the option canvases
 * only; nothing here is read by the product.
 */
import type { MarkStatus } from "#lib/cawco/TreeMark.svelte";

/** What a step is: a delegate, a hub-run tool call, an inbound event, or a question to the owner. */
export type StepKind = "agent" | "call" | "wait" | "ask";

export interface Step {
  /** What the orchestrator passes as `step` on its `delegate` call. */
  id: string;
  /** Its place in the ledger, from 1. */
  n: number;
  title: string;
  /** The title a phone row has room for. */
  short: string;
  kind: StepKind;
  /** The delegate type (Agent), or the connection (Call). */
  who: string;
  /** The steps it waits for, by place. */
  after: number[];
  /** Its brief's first line. */
  brief: string;
  /** When the orchestrator takes it at all: "if channel = beta". */
  when?: string;
  /** A Call's tool and arguments, and when he approved them. */
  call?: { tool: string; args: string; approval: string };
  /** The judge's sentence for this step's report alone (option B). */
  doneWhen?: string;
}

export const KIND_WORD: Record<StepKind, string> = {
  agent: "Agent",
  call: "Call",
  wait: "Wait",
  ask: "Ask me",
};

export const PROJECT = "Release app";
export const WORKFLOW = "Release 2.4";
export const VERSION = "v3";

export const BRIEF =
  "Release {{version}} from main. Delegate the notes and the link check, post the notes, then ask me which channel it ships to.";

export const STEPS: Step[] = [
  {
    id: "notes",
    n: 1,
    title: "Draft the release notes",
    short: "Draft notes",
    kind: "agent",
    who: "writer",
    after: [],
    brief: "Write the notes for {{version}} from the PRs merged since the last tag.",
    doneWhen: "The notes name every merged PR",
  },
  {
    id: "links",
    n: 2,
    title: "Check the changelog links",
    short: "Check links",
    kind: "agent",
    who: "checker",
    after: [],
    brief: "Open every link in CHANGELOG.md and report any that does not answer 200.",
  },
  {
    id: "post",
    n: 3,
    title: "Post to Slack #releases",
    short: "Post to Slack",
    kind: "call",
    who: "slack-brand",
    after: [1, 2],
    brief: "Post the notes to #releases.",
    call: {
      tool: "post",
      args: '{"channel": "#releases", "text": "{{notes}}"}',
      approval: "Approved at start",
    },
  },
  {
    id: "channel",
    n: 4,
    title: "Ask me which channel",
    short: "Which channel?",
    kind: "ask",
    who: "",
    after: [3],
    brief: "Which channel does {{version}} ship to: beta or stable?",
  },
  {
    id: "smoke",
    n: 5,
    title: "Run the smoke test if beta",
    short: "Smoke test",
    kind: "agent",
    who: "runner",
    after: [4],
    brief: "Run the smoke suite against the beta build and report the failures.",
    when: "if channel = beta",
    doneWhen: "0 failed",
  },
];

/** The brief written as option A writes it: one numbered line a step. */
export const PROSE = [
  "Release {{version}} from main.",
  "1. Draft the release notes (writer).",
  "2. Check the changelog links (checker), with 1.",
  "3. Post the notes to Slack #releases.",
  "4. Ask me which channel.",
  "5. If I say beta, run the smoke test (runner).",
];

export interface Check {
  sentence: string;
  /** Runs it held in, of the runs judged. */
  held: number;
  judged: number;
  /** In run 12 so far: true held, false missed, null not yet judged. */
  now: boolean | null;
}

export const CHECKS: Check[] = [
  {
    sentence: "The notes name every merged PR",
    held: 10,
    judged: 11,
    now: true,
  },
  {
    sentence: "Every changelog link answers 200",
    held: 11,
    judged: 11,
    now: true,
  },
  {
    sentence: "The Slack post carries the version",
    held: 9,
    judged: 11,
    now: null,
  },
];

/** One step as run 12 has it: the work item's state joined on its `step` id. */
export interface Lit {
  step: string;
  status: MarkStatus | "planned";
  /** Its phase, as the delegate card's pill says it. */
  phase: string;
  /** Its clock. */
  took: string;
  /** The report's first line, the Call's approval, the reason it waits. */
  line: string;
  harness?: string;
  model?: string;
}

export const RUN_12: Lit[] = [
  {
    step: "notes",
    status: "done",
    phase: "Done",
    took: "1m 3s",
    line: "Notes cover 2.3 → 2.4: 14 merged PRs",
    harness: "Claude Code",
    model: "Opus 5.5",
  },
  {
    step: "links",
    status: "done",
    phase: "Done",
    took: "48s",
    line: "Every link answers 200",
    harness: "Claude Code",
    model: "Sonnet 5",
  },
  {
    step: "post",
    status: "done",
    phase: "Posted",
    took: "1s",
    line: "slack-brand · post · approved at start",
  },
  {
    step: "channel",
    status: "attn",
    phase: "Needs you",
    took: "2m",
    line: "Which channel does 2.4 ship to?",
  },
  {
    step: "smoke",
    status: "planned",
    phase: "Planned",
    took: "",
    line: "Waits on 4 · only if you say beta",
  },
];

export const QUESTION = {
  text: "Which channel does 2.4 ship to?",
  detail: "Beta runs the smoke test before it ships; stable ships now.",
  options: ["beta", "stable"],
};

export type Outcome = "running" | "done" | "failed" | "neutral" | "waiting";

export interface Run {
  n: number;
  when: string;
  exact: string;
  version: string;
  outcome: Outcome;
  word: string;
  took: string;
  steps: string;
  score: string;
  usd: string;
  result: string;
}

export const RUNS: Run[] = [
  {
    n: 12,
    when: "4m",
    exact: "Today, 16:31",
    version: "v3",
    outcome: "waiting",
    word: "Needs you",
    took: "4m",
    steps: "3 of 5",
    score: "2 of 3",
    usd: "$0.41",
    result: "Waiting on: which channel does 2.4 ship to?",
  },
  {
    n: 11,
    when: "Tue",
    exact: "Tuesday, 11:02",
    version: "v3",
    outcome: "done",
    word: "Delivered",
    took: "9m",
    steps: "5 of 5",
    score: "3 of 3",
    usd: "$0.88",
    result: "2.3.1 shipped to beta; smoke test 41 of 41",
  },
  {
    n: 10,
    when: "Mon",
    exact: "Monday, 17:40",
    version: "v2",
    outcome: "failed",
    word: "Failed",
    took: "7m",
    steps: "4 of 5",
    score: "1 of 3",
    usd: "$0.63",
    result: "Smoke test: 2 of 41 failed (login, export)",
  },
  {
    n: 9,
    when: "12 Oct",
    exact: "12 October, 10:15",
    version: "v2",
    outcome: "done",
    word: "Delivered",
    took: "6m",
    steps: "4 of 4",
    score: "3 of 3",
    usd: "$0.52",
    result: "2.3 shipped to stable",
  },
  {
    n: 8,
    when: "5 Oct",
    exact: "5 October, 09:58",
    version: "v1",
    outcome: "neutral",
    word: "Stopped",
    took: "2m",
    steps: "1 of 4",
    score: "–",
    usd: "$0.09",
    result: "Stopped by you before the post",
  },
];

/** The project's other workflow, closed under Release 2.4. */
export const NIGHTLY = {
  name: "Nightly deps",
  version: "v1",
  last: "Tue 05:00",
  runs: 4,
  score: "4 of 4",
};

/** A step's place and kind, for a row that names what it waits on. */
export const afterWords = (step: Step): string =>
  step.after.length === 0 ? "–" : step.after.join(", ");

export const stepOf = (id: string): Step => {
  const found = STEPS.find((step) => step.id === id);
  if (!found) {
    throw new Error(`No step ${id}`);
  }
  return found;
};

/** The checks as their ledger lists them: run 12's so far first, then 11 to 8. */
export const CHECK_ROWS: {
  sentence: string;
  held: number;
  judged: number;
  recent: ("done" | "failed" | "neutral")[];
}[] = [
  {
    sentence: CHECKS[0]?.sentence ?? "",
    held: 10,
    judged: 11,
    recent: ["done", "done", "failed", "done", "neutral"],
  },
  {
    sentence: CHECKS[1]?.sentence ?? "",
    held: 11,
    judged: 11,
    recent: ["done", "done", "done", "done", "neutral"],
  },
  {
    sentence: CHECKS[2]?.sentence ?? "",
    held: 9,
    judged: 11,
    recent: ["neutral", "done", "failed", "done", "neutral"],
  },
];
