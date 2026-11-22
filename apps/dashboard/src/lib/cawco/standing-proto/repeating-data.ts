/**
 * CawCo Cloud as the hub would answer it once a routine is a task that
 * repeats (the model of 2026-11-22): its stages, its one-off tasks, its
 * repeating tasks, each a task with a trigger (a schedule or an event), an
 * end rule (keeps running, or until what it checks is true) and the runs it
 * made, newest first, and its goals: plain records, a name each, which a
 * repeating task names by its `outcome`. A goal is no task and stands on
 * no board. Every time is counted back from when the
 * frame is drawn, so the pane's own "18 minutes ago" reads true.
 */

import type { FindConversation } from "@cawco/core/find";
import { DAY_MS, HOUR_MS, MINUTE_MS } from "@cawco/core/time";
import type { BarView } from "#lib/cawco/project/ViewBar.svelte";
import type {
  Stage,
  StagesView,
  TaskAttempt,
  TaskHistoryEvent,
  TaskSummary,
  TaskView,
  TaskWait,
} from "#lib/cawco/project-tasks.js";
import type { ProjectRow } from "#lib/cawco/projects.js";
import type { Machine } from "#lib/cawco/stores/board.svelte.js";
import { hub } from "#lib/platform/hub.js";

const now = Date.now();
const ago = (ms: number) => now - ms;

export const PROJECT_ID = "prj-cawco-cloud";
const PLACE = "/home/bewinxed/code/cawco-cloud";

export const MOCK_PROJECT: ProjectRow = {
  account: null,
  accountAtLimit: "wait",
  cawHarness: "claude",
  cawModel: "claude-sonnet-4-6",
  conversationInstanceId: null,
  createdAt: "2026-08-14T09:00:00Z",
  eventsOn: true,
  id: PROJECT_ID,
  lands: "branch",
  lfsConnection: null,
  lfsUrl: null,
  links: ["github.com/cawco/cloud"],
  name: "CawCo Cloud",
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
      path: PLACE,
      projectId: PROJECT_ID,
      within: [],
    },
  ],
  primaryPlaceId: "plc-obelisk",
  review: true,
};

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

/** The project's views as the strip draws them: Routines is the board's tasks that repeat. */
export const PROJECT_VIEWS: BarView[] = [
  { count: 0, draft: false, label: "Board", value: "board" },
  { count: 0, draft: false, label: "Table", value: "table" },
  { count: 0, draft: false, label: "Routines", value: "routines" },
  { count: 2, draft: false, label: "Decisions", value: "decisions" },
  { count: 0, draft: false, label: "Made", value: "made" },
];

const stage = (name: string, kind: Stage["kind"]): Stage => ({
  hooks: {},
  kind,
  name,
});

export const STAGES: StagesView = {
  decisionStarters: [],
  moves: [{ from: "*", to: "*", who: ["you", "session", "routine"] }],
  problems: [],
  routineStarters: [],
  source: "file",
  stages: [
    stage("backlog", "todo"),
    stage("ready", "todo"),
    stage("doing", "active"),
    stage("review", "you"),
    stage("done", "done"),
  ],
  starters: [],
  template: null,
  views: [],
};

// --- what repeats ---------------------------------------------------------------

/** What started a repeating task's runs, said as the person reads it. */
type Trigger =
  { kind: "schedule"; words: string } | { kind: "event"; words: string };

/** When it stops: never on its own, or once what it checks is true. */
export type EndRule = "keeps" | "until-true";

/** How one run ended. */
export type RunOutcome =
  | "delivered"
  | "nothing-to-report"
  | "met"
  | "not-yet"
  | "could-not-check"
  | "failed"
  | "running";

/** What a run found about what its task checks, where its outcome doesn't say. */
export type CheckAnswer = "yes" | "no";

export interface Run {
  answer?: CheckAnswer;
  at: number;
  id: string;
  /** How long it took, in minutes. */
  minutes: number;
  /** One plain sentence of what it did or found. */
  oneLine: string;
  outcome: RunOutcome;
  /** Its result whole, as markdown. */
  result: string;
  /** The session that ran it. */
  session: string;
}

/**
 * What makes a task repeat: what its title states (something the project
 * depends on being true, which each run checks, or what each run
 * delivers), the goal it keeps, what starts it, when it stops, whether it
 * runs now, and its runs.
 */
export interface Repeat {
  end: EndRule;
  kind: "check" | "delivery";
  /** What a run is called in its folded rows: "checks", "sweeps". */
  noun: string;
  /** The goal it keeps (`Outcome.id`), or none. */
  outcome?: string;
  /** Runs, newest first. */
  runs: Run[];
  /** `stopped`: CawCo stopped it (`reason` says why); `paused`: someone did. */
  state: "on" | "paused" | "stopped" | "finished";
  stateReason?: string;
  trigger: Trigger;
}

/** A quiet run, one of many alike. */
const quiet = (
  id: string,
  at: number,
  outcome: RunOutcome,
  oneLine: string,
  session: string,
  answer?: CheckAnswer
): Run => ({
  answer,
  at,
  id,
  minutes: 1,
  oneLine,
  outcome,
  result: oneLine,
  session,
});

/** `count` runs, `every` apart, the newest `from` ago. */
const series = (
  prefix: string,
  count: number,
  from: number,
  every: number,
  make: (id: string, at: number) => Run
): Run[] =>
  Array.from({ length: count }, (_, index) =>
    make(`${prefix}-${index}`, ago(from + index * every))
  );

const JQ_MISSING = [
  "The check command could not run: `jq` is not installed in the sandbox on obelisk. Staging itself was not reached.",
  "",
  "```",
  '$ curl -sf --max-time 15 https://staging.cawco.dev/health | jq -e \'.status == "ok" and .migrations == "head"\'',
  "sh: 1: jq: command not found",
  "",
  "Process exited with code 127.",
  "```",
].join("\n");

const jqRun = (id: string, at: number): Run => ({
  at,
  id,
  minutes: 1,
  oneLine: "The check can't run because jq is missing on obelisk",
  outcome: "could-not-check",
  result: JQ_MISSING,
  session: "ses-staging",
});

/** A goal: its name, and nothing else; its repeating tasks name it. */
export interface Outcome {
  id: string;
  name: string;
}

/** The project's goals, in the order they were set. */
export const OUTCOMES: Outcome[] = [
  { id: "out-release", name: "Release 2.4 ships" },
  { id: "out-staging", name: "Staging stays healthy" },
  { id: "out-docs", name: "Docs stay trustworthy" },
  { id: "out-upkeep", name: "Everyday upkeep is done" },
  { id: "out-billing", name: "Billing runs on Stripe v3" },
];

export const REPEATS: Record<string, Repeat> = {
  "tsk-180": {
    end: "until-true",
    kind: "check",
    noun: "checks",
    outcome: "out-staging",
    runs: [
      jqRun("run-sh-14", ago(18 * MINUTE_MS)),
      jqRun("run-sh-13", ago(33 * MINUTE_MS)),
      jqRun("run-sh-12", ago(48 * MINUTE_MS)),
      {
        answer: "no",
        at: ago(3 * HOUR_MS),
        id: "run-sh-11",
        minutes: 1,
        oneLine: "Staging is up, but migration 0041 hasn't been applied yet",
        outcome: "not-yet",
        result:
          "Staging answered `200 OK`, but its migrations were at `0041_pending`, not `head`.",
        session: "ses-staging",
      },
      ...series(
        "run-sh",
        11,
        3 * HOUR_MS + 15 * MINUTE_MS,
        15 * MINUTE_MS,
        (id, at) =>
          quiet(
            id,
            at,
            "not-yet",
            "Migration 0041 is still pending",
            "ses-staging",
            "no"
          )
      ),
    ],
    state: "stopped",
    stateReason: "Stopped after three checks that couldn't run",
    trigger: { kind: "schedule", words: "Every 15 minutes" },
  },
  "tsk-176": {
    end: "keeps",
    kind: "check",
    noun: "sweeps",
    outcome: "out-docs",
    runs: [
      {
        at: ago(15 * HOUR_MS),
        id: "run-bl-14",
        minutes: 2,
        oneLine: "Last night's sweep timed out twice reaching the docs sitemap",
        outcome: "failed",
        result:
          "Both tries timed out waiting for `https://docs.cawco.dev/sitemap.xml` after 30 seconds.\n\n- **First try:** 03:00 UTC, timed out after 30s\n- **Retry:** 03:02 UTC, timed out after 30s\n\nNo tasks were filed.",
        session: "ses-links-14",
      },
      {
        answer: "no",
        at: ago(39 * HOUR_MS),
        id: "run-bl-13",
        minutes: 1,
        oneLine:
          "Found 2 broken links in the self-hosting guide and filed a task",
        outcome: "delivered",
        result:
          "Crawled **84 pages** from `docs.cawco.dev/sitemap.xml`.\n\n- **82 pages** loaded with every anchor in place.\n- **2 broken links** on `/guides/self-hosting`:\n  - `/docs/relay-setup` → `404` (moved to `/guides/relay`)\n  - `/api/tokens#scopes` → no `#scopes` heading\n\nFiled *Fix two broken links in the self-hosting guide* in Ready.",
        session: "ses-links-13",
      },
      ...series("run-bl", 12, 63 * HOUR_MS, DAY_MS, (id, at) =>
        quiet(
          id,
          at,
          "nothing-to-report",
          "All 84 pages loaded and every link worked",
          "ses-links-13",
          "yes"
        )
      ),
    ],
    state: "on",
    trigger: { kind: "schedule", words: "Every day at 03:00 UTC" },
  },
  "tsk-184": {
    end: "until-true",
    kind: "check",
    noun: "checks",
    outcome: "out-release",
    runs: [
      {
        at: ago(74_000),
        id: "run-rt-6",
        minutes: 0,
        oneLine: "Checking the release downloads on github.com/cawco/cloud",
        outcome: "running",
        result: "",
        session: "ses-release-6",
      },
      {
        answer: "no",
        at: ago(60 * MINUTE_MS),
        id: "run-rt-5",
        minutes: 1,
        oneLine: "The v2.4.0 release is still a draft",
        outcome: "not-yet",
        result:
          "- **Newest published release:** `v2.4.0-rc.3` (a prerelease, published 5 hours ago)\n- **Draft found:** `v2.4.0`, still missing its signed macOS download\n\n*Tell self-hosters about the v2.4.0 upgrade* keeps waiting until the final release is published with both signed downloads.",
        session: "ses-release-5",
      },
      ...series("run-rt", 4, 2 * HOUR_MS, HOUR_MS, (id, at) =>
        quiet(
          id,
          at,
          "not-yet",
          "Only the third release candidate is published",
          "ses-release-5",
          "no"
        )
      ),
    ],
    state: "on",
    trigger: { kind: "schedule", words: "Every hour, on the hour" },
  },
  "tsk-171": {
    end: "keeps",
    kind: "delivery",
    noun: "digests",
    outcome: "out-upkeep",
    runs: [
      {
        at: ago(12 * HOUR_MS),
        id: "run-mt-9",
        minutes: 3,
        oneLine:
          "Reviewed 5 pull requests: 2 are ready to merge and #422 fails its type check",
        outcome: "delivered",
        result:
          "### Morning PR digest\n\nReviewed **5 open pull requests** in `cawco/cloud`.\n\n#### Ready to merge\n- **#419** `fix(relay): keep reconnect jitter bounded`: CI green, 1 approval\n- **#420** `docs: add systemd socket activation steps`: CI green, no conflicts\n\n#### Needs attention\n- **#422** `feat(billing): prorate mid-cycle seat changes`: `typecheck` fails in `packages/hub/src/billing.ts:148` (`Property 'seatDelta' does not exist`).\n- **#417** `chore: upgrade drizzle-orm`: merge conflict in `bun.lock`.",
        session: "ses-triage-9",
      },
      {
        at: ago(36 * HOUR_MS),
        id: "run-mt-8",
        minutes: 2,
        oneLine: "Reviewed 3 pull requests: all pass CI",
        outcome: "delivered",
        result: "All **3 open pull requests** passed CI with no conflicts.",
        session: "ses-triage-8",
      },
      {
        at: ago(84 * HOUR_MS),
        id: "run-mt-7",
        minutes: 2,
        oneLine: "Reviewed 4 pull requests: a Playwright test is flaky on #412",
        outcome: "delivered",
        result:
          "Flagged a flaky timeout in `tests/checkout.spec.ts` on **#412**.",
        session: "ses-triage-7",
      },
    ],
    state: "on",
    trigger: { kind: "schedule", words: "Every weekday at 09:00" },
  },
  "tsk-172": {
    end: "keeps",
    kind: "check",
    noun: "merges",
    outcome: "out-release",
    runs: [
      {
        answer: "yes",
        at: ago(3 * HOUR_MS),
        id: "run-cd-9",
        minutes: 1,
        oneLine: "Added the reconnect fix (#418)",
        outcome: "delivered",
        result:
          "Added under **Improved** in `CHANGELOG.md`:\n\n> Reconnecting after a network drop now restores open session panes in one frame without clearing unsent drafts (#418).",
        session: "ses-changelog-9",
      },
      ...series("run-cd", 5, 7 * HOUR_MS, 5 * HOUR_MS, (id, at) =>
        quiet(
          id,
          at,
          "nothing-to-report",
          "Nothing a user would notice was merged",
          "ses-changelog-9",
          "yes"
        )
      ),
    ],
    state: "on",
    trigger: { kind: "event", words: "When a pull request merges to main" },
  },
  "tsk-160": {
    end: "keeps",
    kind: "delivery",
    noun: "nights",
    outcome: "out-upkeep",
    runs: [
      {
        at: ago(2 * DAY_MS),
        id: "run-nm-1",
        minutes: 2,
        oneLine: "Read 4 sessions and found nothing new to remember",
        outcome: "nothing-to-report",
        result:
          "Read **4 sessions**. Everything decided in them was already in the project's memory.",
        session: "ses-memory-1",
      },
    ],
    state: "paused",
    stateReason: "Paused by you",
    trigger: { kind: "schedule", words: "Every day at 23:30" },
  },
  "tsk-165": {
    end: "until-true",
    kind: "check",
    noun: "checks",
    outcome: "out-billing",
    runs: [
      {
        at: ago(2 * DAY_MS),
        id: "run-sv-9",
        minutes: 1,
        oneLine:
          "No v2 deliveries in 24 hours, and all 1,412 v3 events went through",
        outcome: "met",
        result:
          "- **`/webhooks/stripe/v2`:** no requests in the past 24 hours\n- **`/webhooks/stripe/v3`:** 1,412 requests, every one `200 OK`\n\n*Remove the legacy Stripe v2 webhook handler* went ahead, and this task stopped repeating.",
        session: "ses-stripe-9",
      },
      ...series("run-sv", 8, 2 * DAY_MS + 6 * HOUR_MS, 6 * HOUR_MS, (id, at) =>
        quiet(
          id,
          at,
          "not-yet",
          "Some billing events still reach the v2 endpoint",
          "ses-stripe-9",
          "no"
        )
      ),
    ],
    state: "finished",
    trigger: { kind: "schedule", words: "Every 6 hours" },
  },
};

// --- the tasks, as the board lists them -------------------------------------------

/** A task as it is first written: what the board's row is made from. */
export interface Seed {
  attempts?: TaskAttempt[];
  createdAt: number;
  id: string;
  kind: Stage["kind"];
  labels?: string[];
  stage: string;
  title: string;
  waits?: TaskWait[];
}

const taskWait = (target: string, label: string): TaskWait => ({
  dropped: false,
  flag: null,
  href: `cawco:task/${PROJECT_ID}/${target}`,
  kind: "task",
  label,
  settled: false,
  state: "doing",
  target,
  value: null,
  via: null,
});

/** A run's work item's state: live, failed, or done. */
function stateOf(run: Run): TaskAttempt["state"] {
  if (run.outcome === "running") {
    return "running";
  }
  return run.outcome === "failed" || run.outcome === "could-not-check"
    ? "failed"
    : "done";
}

/** One run as the attempt it is: a work item whose task it is. */
function attemptOf(run: Run): TaskAttempt {
  const live = run.outcome === "running";
  const failed = run.outcome === "failed" || run.outcome === "could-not-check";
  return {
    endedAt: live ? null : run.at + Math.max(run.minutes, 1) * MINUTE_MS,
    endedHow: failed ? run.oneLine : null,
    headline: live ? null : run.oneLine,
    instanceId: run.session,
    result:
      live || !run.result
        ? null
        : {
            artifacts: [],
            at: run.at + run.minutes * MINUTE_MS,
            check: [],
            summary: run.result,
          },
    startedAt: run.at,
    state: stateOf(run),
    waitedOn: [],
    workItemId: `wi-${run.id}`,
  };
}

const SEEDS: Seed[] = [
  // The tasks that repeat, each under its goal by its repeat's `outcome`.
  {
    createdAt: ago(9 * DAY_MS),
    id: "tsk-180",
    kind: "active",
    stage: "doing",
    title: "Staging is healthy",
  },
  {
    createdAt: ago(30 * DAY_MS),
    id: "tsk-176",
    kind: "active",
    stage: "doing",
    title: "Docs have no broken links",
  },
  {
    createdAt: ago(6 * DAY_MS),
    id: "tsk-184",
    kind: "active",
    stage: "doing",
    title: "Release assets are published",
  },
  {
    createdAt: ago(40 * DAY_MS),
    id: "tsk-171",
    kind: "active",
    stage: "doing",
    title: "PRs triaged this morning",
  },
  {
    createdAt: ago(40 * DAY_MS),
    id: "tsk-172",
    kind: "active",
    stage: "doing",
    title: "Changelog has the latest merge",
  },
  {
    createdAt: ago(60 * DAY_MS),
    id: "tsk-160",
    kind: "todo",
    stage: "ready",
    title: "Project memory curated",
  },
  {
    createdAt: ago(12 * DAY_MS),
    id: "tsk-165",
    kind: "done",
    stage: "done",
    title: "Stripe v3 migration complete",
  },
  // The one-off work around them.
  {
    createdAt: ago(5 * DAY_MS),
    id: "tsk-201",
    kind: "todo",
    labels: ["release"],
    stage: "ready",
    title: "Promote the v2.4.0 build to production",
    waits: [taskWait("tsk-180", "Staging is healthy")],
  },
  {
    createdAt: ago(5 * DAY_MS),
    id: "tsk-203",
    kind: "todo",
    labels: ["release"],
    stage: "backlog",
    title: "Publish the v2.4.0 changelog",
  },
  {
    createdAt: ago(4 * DAY_MS),
    id: "tsk-211",
    kind: "todo",
    labels: ["release", "docs"],
    stage: "backlog",
    title: "Tell self-hosters about the v2.4.0 upgrade",
    waits: [taskWait("tsk-184", "Release assets are published")],
  },
  {
    createdAt: ago(39 * HOUR_MS),
    id: "tsk-207",
    kind: "todo",
    labels: ["docs"],
    stage: "ready",
    title: "Fix two broken links in the self-hosting guide",
  },
  {
    createdAt: ago(2 * DAY_MS),
    id: "tsk-209",
    kind: "active",
    labels: ["billing"],
    stage: "doing",
    title: "Prorate mid-cycle seat changes on invoices",
    attempts: [
      {
        endedAt: null,
        endedHow: null,
        headline: null,
        instanceId: "ses-billing",
        result: null,
        startedAt: ago(25 * MINUTE_MS),
        state: "running",
        waitedOn: [],
        workItemId: "wi-billing",
      },
    ],
  },
  {
    createdAt: ago(3 * DAY_MS),
    id: "tsk-198",
    kind: "you",
    labels: ["docs"],
    stage: "review",
    title: "Add systemd socket activation to the install guide",
  },
  {
    createdAt: ago(8 * DAY_MS),
    id: "tsk-213",
    kind: "todo",
    stage: "ready",
    title: "Rebase the drizzle-orm upgrade onto main",
  },
  {
    createdAt: ago(10 * DAY_MS),
    id: "tsk-195",
    kind: "done",
    labels: ["billing"],
    stage: "done",
    title: "Remove the legacy Stripe v2 webhook handler",
  },
];

/** A task as the board lists it, its runs its attempts. */
export function summaryOf(seed: Seed): TaskSummary {
  const runs = REPEATS[seed.id]?.runs;
  const attempts = runs ? runs.map(attemptOf) : (seed.attempts ?? []);
  const [newest] = attempts;
  const updatedAt = newest?.endedAt ?? newest?.startedAt ?? seed.createdAt;
  return {
    archivedAt: null,
    attempts,
    builtOn: [],
    closeReason: null,
    completedAt: seed.kind === "done" ? updatedAt : null,
    createdAt: seed.createdAt,
    createdBy: { id: null, mover: "you", name: "you" },
    droppedAt: null,
    duplicateOf: null,
    fields: {},
    foundIn: null,
    heldBy: null,
    id: seed.id,
    kind: seed.kind,
    labels: seed.labels ?? [],
    lastAttemptFailed: newest?.state === "failed",
    lastAttemptStopped: false,
    links: [],
    liveAttempt: newest?.state === "running",
    needsYou: seed.kind === "you",
    number: Number(seed.id.slice(4)),
    outputs: [],
    partOf: null,
    parts: [],
    path: `tasks/${seed.id}.md`,
    problem: null,
    queuedStart: false,
    rank: null,
    ready: seed.kind === "todo" && !seed.waits?.length,
    stage: seed.stage,
    startedAt: seed.kind === "todo" ? null : seed.createdAt,
    startProblem: null,
    title: seed.title,
    todos: { done: 0, total: 0 },
    type: null,
    unblocks: [],
    updatedAt,
    updatedBy: null,
    waits: seed.waits ?? [],
    waitsOn: seed.waits?.map((wait) => wait.target) ?? [],
  };
}

export const initialTasks = (): TaskSummary[] => SEEDS.map(summaryOf);

/** What each repeating task's description says it does, in the person's words. */
const DESCRIPTIONS: Record<string, string> = {
  "tsk-180":
    'Run `curl -sf https://staging.cawco.dev/health | jq -e \'.status == "ok" and .migrations == "head"\'` in a sandboxed copy of the project. It is true when the command succeeds. *Promote the v2.4.0 build to production* waits on it.',
  "tsk-176":
    "Crawl every page in docs.cawco.dev/sitemap.xml, check that internal links and anchors resolve, and file a task in Ready for any 404 or redirect loop.",
  "tsk-184":
    "Look at GitHub Releases on cawco/cloud. It is true once v2.4.0 is published (not a draft or a prerelease) with signed Linux and macOS downloads and their checksums.",
  "tsk-171":
    "List every open pull request in cawco/cloud updated in the past day. Check CI, review comments and merge conflicts, and write a morning digest of what is ready and what is blocked.",
  "tsk-172":
    "Read the pull request that merged. If a user would notice the change, add one short line for it under Unreleased in CHANGELOG.md. Skip internal refactors and lockfile-only changes.",
  "tsk-160":
    "Read the sessions that ended in the last day and write lasting decisions and conventions into the project's memory.",
  "tsk-165":
    "Read production webhook deliveries for the past day. It is true when nothing reached the v2 endpoint and every v3 delivery succeeded.",
};

/** A task read whole, as the hub answers `GET /tasks/:id`. */
export function viewOf(summary: TaskSummary): TaskView {
  const newest = summary.attempts.find((attempt) => attempt.endedAt !== null);
  return {
    acceptance: "",
    archivedAt: summary.archivedAt,
    attempts: summary.attempts,
    builtOn: summary.builtOn,
    checks: [],
    closeReason: summary.closeReason,
    comments: [],
    completedAt: summary.completedAt,
    createdAt: summary.createdAt,
    createdBy: summary.createdBy,
    description: DESCRIPTIONS[summary.id] ?? "",
    droppedAt: summary.droppedAt,
    duplicateOf: null,
    extra: {},
    foundIn: null,
    foundInNamed: null,
    hash: summary.id,
    heldBy: null,
    id: summary.id,
    kind: summary.kind,
    labels: summary.labels,
    lands: null,
    lastAttemptFailed: summary.lastAttemptFailed,
    lastAttemptStopped: summary.lastAttemptStopped,
    links: [],
    liveAttempt: summary.liveAttempt,
    needsYou: summary.needsYou,
    number: summary.number,
    outputs: [],
    partOf: summary.partOf,
    parts: summary.parts,
    path: summary.path,
    problems: [],
    queuedStart: false,
    rank: null,
    ready: summary.ready,
    result: newest?.headline
      ? {
          at: newest.endedAt ?? newest.startedAt,
          headline: newest.headline,
          report: newest.result?.summary ?? newest.headline,
          workItemId: newest.workItemId,
        }
      : null,
    sections: [],
    sendBack: null,
    stage: summary.stage,
    startedAt: summary.startedAt,
    startProblem: null,
    title: summary.title,
    todos: [],
    type: null,
    unblocks: summary.unblocks,
    updatedAt: summary.updatedAt,
    updatedBy: summary.updatedBy,
    waits: summary.waits,
    waitsOn: summary.waitsOn,
  };
}

const historyOf = (summary: TaskSummary): TaskHistoryEvent[] => [
  {
    actor: { id: null, mover: "you", name: "you" },
    at: summary.createdAt,
    commit: `c${summary.number}`,
    kind: "created",
    path: summary.path,
    reason: null,
    stage: { from: null, to: summary.stage },
    what: "create",
  },
];

/** A session that ran a repeating task, as the hub's names answer it. */
const sessionNamed = (id: string, title: string): FindConversation => ({
  children: { count: 0, needsYou: 0 },
  cwd: PLACE,
  dir: "cawco-cloud",
  handle: `cawco-cloud#${id.slice(0, 8)}`,
  harness: "claude",
  id,
  instanceId: id,
  kind: "conversation",
  lastActivity: now,
  lastReport: null,
  machine: { id: "mch-obelisk", name: "obelisk" },
  matched: [],
  moments: [],
  parent: null,
  project: { id: PROJECT_ID, name: "CawCo Cloud" },
  purpose: title,
  role: "attempt",
  score: 0,
  sessionId: null,
  state: "ended",
  task: null,
  title,
});

const SESSION_TITLES: Record<string, string> = {
  "ses-staging": "Staging health check",
  "ses-links-14": "Broken-link sweep, last night",
  "ses-links-13": "Broken-link sweep",
  "ses-release-6": "Release 2.4 watch",
  "ses-release-5": "Release 2.4 watch",
  "ses-triage-9": "Morning PR triage",
  "ses-triage-8": "Morning PR triage",
  "ses-triage-7": "Morning PR triage",
  "ses-changelog-9": "Changelog line for #418",
  "ses-memory-1": "Nightly project memory",
  "ses-stripe-9": "Stripe v3 webhook check",
  "ses-billing": "Prorate mid-cycle seat changes",
};

/**
 * The stand-in hub's answers by path (hub-stand-in `hubAs`): each task read
 * whole, its history, and the sessions that ran it. A task added in the
 * frame is written in here by the fixture, as the hub would hold it.
 */
export const HUB_ANSWERS: Record<string, unknown> = {};

export function holdTask(summary: TaskSummary): void {
  const task = hub.api
    .projects({ id: PROJECT_ID })
    .tasks({ taskId: summary.id });
  HUB_ANSWERS[task["~path"]] = viewOf(summary);
  HUB_ANSWERS[task.history["~path"]] = {
    events: historyOf(summary),
    id: summary.id,
    path: summary.path,
    state: "live",
  };
}

/** What the stand-in hub holds as a frame opens: every task, and the sessions that ran them. */
export function holdProject(): void {
  for (const summary of initialTasks()) {
    holdTask(summary);
  }
  HUB_ANSWERS[hub.api.find.sessions["~path"]] = Object.fromEntries(
    Object.entries(SESSION_TITLES).map(([id, title]) => [
      id,
      sessionNamed(id, title),
    ])
  );
}
