import type { ActionState as CoreActionState } from "@cawco/core/actions";
import type { ConditionState } from "@cawco/core/routine-kinds";
import { DAY_MS, HOUR_MS, MINUTE_MS } from "@cawco/core/time";
import type { Machine } from "#lib/cawco/stores/board.svelte.js";

type RoutineStatus = "active" | "running" | "paused" | "stopped" | "finished";
type DoneStanding = Exclude<ConditionState, "checking" | "deleted"> | "pending";

export type ServiceKey = "github" | "slack" | "linear" | "cloudflare";
export type RunTrigger = "schedule" | "event" | "manual" | "creation-test";
export type ScheduleCadence =
  "hourly" | "daily" | "weekdays" | "weekly" | "custom" | "events";
export type ScheduleUnit =
  "minute" | "hour" | "day" | "weekday" | "week" | "events" | "cron";

export type RunOutcome =
  | "delivered"
  | "nothing-to-report"
  | "met"
  | "not-yet"
  | "could-not-check"
  | "failed"
  | "stopped"
  | "skipped"
  | "running"
  | "queued";

interface WaitingTaskRef {
  id: string;
  stage: string;
  title: string;
}

export interface RoutineDoneWhen {
  checkedAt: number | null;
  command?: string;
  giveUpAt: number | null;
  heldSteps: number;
  heldTasks: WaitingTaskRef[];
  lastExitCode?: number | null;
  lastWords: string | null;
  lastWordsBy: "model" | "command" | "owner" | null;
  machineName: string;
  markedDoneByOwner?: boolean;
  metAt: number | null;
  method: "model" | "command";
  standing: DoneStanding;
  statement: string;
}

interface RoutineTiming {
  cadence: ScheduleCadence;
  cron?: string;
  every?: number;
  nextAt: number | null;
  rhythm: string;
  time: string;
  timezone: string;
  unit?: ScheduleUnit;
  weekday: string;
}

export interface TranscriptStep {
  id: string;
  kind: "prompt" | "tool" | "reply";
  label: string;
  text: string;
  timeOffset: string;
}

export interface RunTranscript {
  entries: TranscriptStep[];
  harness: string;
  id: string;
  model: string;
  place: string;
  title: string;
}

interface RunCommandOutput {
  attribution: "model" | "command" | "system";
  commandStdout?: string;
  exitCode?: number | null;
}

interface RunUsage {
  costDollars?: number;
  durationMs: number;
  turns?: number;
}

export interface RoutineRun extends RunCommandOutput, RunUsage {
  id: string;
  oneLine: string;
  outcome: RunOutcome;
  proposedActionIds?: string[];
  resultMarkdown: string;
  retriedOnce?: boolean;
  session?: RunTranscript;
  startedAt: number;
  trigger: RunTrigger;
  triggerDetail?: string;
}

interface RoutineExecutor {
  harness?: string;
  label: string;
  mode: "delegate" | "orchestrator" | "command" | "builtin";
}

interface RoutineLimits {
  dailyCapDollars?: number;
  maxDollars?: number;
  maxMinutes: number;
  maxTurns?: number;
  runsWeek: number;
  spentTodayDollars?: number;
  spentWeekDollars?: number;
}

interface RoutineOrigin {
  by: "owner" | "session" | "cawco";
  expiresAt?: number | null;
  kept: boolean;
  sessionId?: string;
  sessionTitle?: string;
  why?: string;
}

export interface Routine {
  builtIn?: boolean;
  doneWhen?: RoutineDoneWhen;
  executor: RoutineExecutor;
  guardrail?: string;
  id: string;
  instructions: string;
  limits: RoutineLimits;
  name: string;
  origin: RoutineOrigin;
  runningStartedAt?: number;
  runningStep?: string;
  runs: RoutineRun[];
  schedule: RoutineTiming;
  status: RoutineStatus;
  statusReason: string | null;
  summary: string;
}

export type ActionState =
  Exclude<CoreActionState, "proposed" | "done"> | "waiting" | "ran";

interface LinkedActionTask {
  id: string;
  movesTo: string;
  title: string;
}

export interface ApprovedAction {
  account: string;
  exactCall: string;
  id: string;
  needsLook?: boolean;
  routineId: string;
  routineName: string;
  runId: string;
  scheduledAt?: number;
  sentence: string;
  service: ServiceKey;
  serviceResponse?: string;
  shortOutcome?: string;
  state: ActionState;
  stateAt: number;
  task?: LinkedActionTask;
  whenLabel: string;
}

export interface EventSource {
  enabled: boolean;
  error: string | null;
  id: string;
  service: ServiceKey;
  serviceName: string;
}

export interface EventRule {
  enabled: boolean;
  eventKinds: string[];
  filters: string[];
  id: string;
  lastDeliveredAt: number | null;
  routineId: string;
  service: ServiceKey;
  serviceName: string;
}

export interface CawSuggestion {
  detail: string;
  id: string;
  nextLabel: string;
  title: string;
}

/** Reference clock for deterministic readings (2026-11-21 21:10 Europe/Istanbul). */
export const MOCK_NOW = Date.parse("2026-11-21T18:10:00Z");
export const LOCAL_ZONE = "Europe/Istanbul";
const REPO_PLACE = "/home/bewinxed/code/cawco-cloud";

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

export const INITIAL_SUGGESTION: CawSuggestion = {
  detail:
    "Each Monday at 09:00, count what sessions called over the past 30 days and propose unlisting what went unused. Nothing changes until you approve.",
  id: "sug-unused-skills",
  nextLabel: "Mon 09:00",
  title: "Weekly unused skills & servers check",
};

const makeSession = (
  id: string,
  title: string,
  entries: TranscriptStep[]
): RunTranscript => ({
  entries,
  harness: "Claude Code",
  id,
  model: "claude-sonnet-4-6",
  place: REPO_PLACE,
  title,
});

const releaseCheckEntry: TranscriptStep = {
  id: "e1",
  kind: "prompt",
  label: "Done when",
  text: "Verify whether v2.4.0 is published on github.com/cawco/cloud with signed Linux and macOS tarballs.",
  timeOffset: "00:00",
};

const jqFailureMarkdown =
  "The check command could not run because `jq` is not installed in the sandbox image on `obelisk`.";
const jqFailureStdout = [
  '$ curl -sf --max-time 15 https://staging.cawco.dev/health | jq -e \'.status == "ok" and .migrations == "head"\'',
  "sh: 1: jq: command not found",
  "",
  "Process exited with code 127.",
].join("\n");

const makeJqFailureRun = (id: string, minutesAgo: number): RoutineRun => ({
  attribution: "command",
  commandStdout: jqFailureStdout,
  durationMs: 410,
  exitCode: 127,
  id,
  oneLine: "sh: jq: command not found",
  outcome: "could-not-check",
  resultMarkdown: jqFailureMarkdown,
  startedAt: MOCK_NOW - minutesAgo * MINUTE_MS,
  trigger: "schedule",
});

export const INITIAL_ROUTINES: Routine[] = [
  {
    doneWhen: {
      checkedAt: MOCK_NOW - 18 * MINUTE_MS,
      command:
        'curl -sf --max-time 15 https://staging.cawco.dev/health | jq -e \'.status == "ok" and .migrations == "head"\'',
      giveUpAt: MOCK_NOW + 4 * DAY_MS,
      heldSteps: 2,
      heldTasks: [
        {
          id: "tsk-418",
          stage: "Ready",
          title: "Promote v2.4.0 build to production",
        },
        {
          id: "tsk-421",
          stage: "Ready",
          title: "Publish v2.4.0 changelog",
        },
      ],
      lastExitCode: 127,
      lastWords: "sh: jq: command not found",
      lastWordsBy: "command",
      machineName: "obelisk",
      metAt: null,
      method: "command",
      standing: "failing",
      statement:
        "Staging /health returns HTTP 200 with status ok and migrations at head.",
    },
    executor: {
      label: "Shell command on obelisk",
      mode: "command",
    },
    id: "rtn-staging-health",
    instructions:
      "Confirm the staging deployment is healthy and all Drizzle migrations are applied before promoting v2.4.0.",
    limits: {
      maxMinutes: 1,
      runsWeek: 26,
    },
    name: "Staging health check",
    origin: {
      by: "owner",
      kept: true,
    },
    runs: [
      makeJqFailureRun("run-sh-4", 18),
      makeJqFailureRun("run-sh-3", 33),
      makeJqFailureRun("run-sh-2", 48),
      {
        attribution: "command",
        commandStdout:
          '{"status":"ok","version":"2.4.0-rc.3","migrations":"0041_pending"}\n\nProcess exited with code 1.',
        durationMs: 1840,
        exitCode: 1,
        id: "run-sh-1",
        oneLine: "migrations field reported 0041_pending instead of head",
        outcome: "not-yet",
        resultMarkdown:
          "Staging responded `200 OK`, but `migrations` was `0041_pending` rather than `head`.",
        startedAt: MOCK_NOW - 3 * HOUR_MS,
        trigger: "creation-test",
      },
    ],
    schedule: {
      cadence: "custom",
      cron: "*/15 * * * *",
      every: 15,
      nextAt: null,
      rhythm: "Every 15 minutes",
      time: "00:00",
      timezone: LOCAL_ZONE,
      unit: "minute",
      weekday: "Mon",
    },
    status: "stopped",
    statusReason: "Stopped after 3 failed checks",
    summary:
      "Checks that staging /health returns 200 OK with database migrations at head.",
  },
  {
    executor: {
      harness: "Claude Code",
      label: "Single session · Claude Code",
      mode: "delegate",
    },
    guardrail:
      "Only file tasks for new 404s or redirect loops on docs.cawco.dev.",
    id: "rtn-broken-links",
    instructions:
      "Crawl every route listed in docs.cawco.dev/sitemap.xml, verify internal links and anchor hashes resolve cleanly, and file a task in Ready if any 404 or redirect loop appears.",
    limits: {
      dailyCapDollars: 2.0,
      maxDollars: 0.75,
      maxMinutes: 5,
      maxTurns: 12,
      runsWeek: 5,
      spentTodayDollars: 0.19,
      spentWeekDollars: 0.84,
    },
    name: "Nightly broken-link sweep",
    origin: {
      by: "session",
      expiresAt: MOCK_NOW + 2 * DAY_MS,
      kept: false,
      sessionId: "ses-docs-migration",
      sessionTitle: "Docs migration pass",
      why: "I'll set up a nightly link sweep while the docs redirects settle; keep it if you want it past next week.",
    },
    runs: [
      {
        attribution: "system",
        costDollars: 0.19,
        durationMs: 62_000,
        id: "run-bl-3",
        oneLine:
          "Timed out fetching docs.cawco.dev/sitemap.xml after 30s (retried once)",
        outcome: "failed",
        resultMarkdown:
          "Both attempts timed out waiting for `https://docs.cawco.dev/sitemap.xml` (HTTP timeout after 30s). Cloudflare edge logs were unreachable from `obelisk` at 03:00 UTC.\n\n- **Attempt 1:** 03:00 UTC — `ETIMEDOUT` after 30s\n- **Attempt 2 (automatic retry):** 03:02 UTC — `ETIMEDOUT` after 30s\n\nNo tasks were filed.",
        retriedOnce: true,
        session: makeSession("ses-bl-3", "Nightly broken-link sweep · retry", [
          {
            id: "e1",
            kind: "prompt",
            label: "Routine instructions",
            text: "Crawl every route listed in docs.cawco.dev/sitemap.xml, verify internal links and anchor hashes resolve cleanly, and file a task if any 404 appears.",
            timeOffset: "00:00",
          },
          {
            id: "e2",
            kind: "tool",
            label: "bash · curl -fsS https://docs.cawco.dev/sitemap.xml",
            text: "curl: (28) Operation timed out after 30001 milliseconds with 0 bytes received",
            timeOffset: "00:04",
          },
          {
            id: "e3",
            kind: "reply",
            label: "Session report",
            text: "Could not reach docs.cawco.dev/sitemap.xml after retrying. Marking run failed without filing false-positive broken link tasks.",
            timeOffset: "01:02",
          },
        ]),
        startedAt: MOCK_NOW - 15 * HOUR_MS,
        trigger: "schedule",
        turns: 4,
      },
      {
        attribution: "model",
        costDollars: 0.21,
        durationMs: 44_000,
        id: "run-bl-2",
        oneLine:
          "Checked 84 routes · 2 broken links found and filed as tsk-416",
        outcome: "delivered",
        resultMarkdown:
          "Crawled **84 routes** from `docs.cawco.dev/sitemap.xml`.\n\n- **82 pages** returned `200 OK` with valid anchors.\n- **2 broken links** found on `/guides/self-hosting`:\n  - `/docs/relay-setup` → `404` (moved to `/guides/relay`)\n  - `/api/tokens#scopes` → missing `#scopes` heading\n\nFiled **tsk-416** (*Fix two broken links in self-hosting guide*) in `Ready`.",
        session: makeSession("ses-bl-2", "Nightly broken-link sweep", [
          {
            id: "e1",
            kind: "prompt",
            label: "Routine instructions",
            text: "Crawl every route listed in docs.cawco.dev/sitemap.xml and file a task if any 404 appears.",
            timeOffset: "00:00",
          },
          {
            id: "e2",
            kind: "tool",
            label: "bash · bun scripts/check-links.ts https://docs.cawco.dev",
            text: "Checked 84 pages, 412 links. 2 failures on /guides/self-hosting.",
            timeOffset: "00:11",
          },
          {
            id: "e3",
            kind: "tool",
            label: "create_task · Fix two broken links in self-hosting guide",
            text: "Created tsk-416 in stage Ready.",
            timeOffset: "00:34",
          },
          {
            id: "e4",
            kind: "reply",
            label: "Session report",
            text: "Found 2 broken links on /guides/self-hosting and filed tsk-416 in Ready.",
            timeOffset: "00:44",
          },
        ]),
        startedAt: MOCK_NOW - 39 * HOUR_MS,
        trigger: "schedule",
        turns: 6,
      },
      {
        attribution: "model",
        costDollars: 0.14,
        durationMs: 31_000,
        id: "run-bl-1",
        oneLine: "All 84 routes returned 200 OK · nothing to report",
        outcome: "nothing-to-report",
        resultMarkdown:
          "All **84 routes** and **410 internal links** resolved cleanly with `200 OK`. Nothing to report.",
        startedAt: MOCK_NOW - 63 * HOUR_MS,
        trigger: "creation-test",
        turns: 3,
      },
    ],
    schedule: {
      cadence: "daily",
      nextAt: MOCK_NOW + 8 * HOUR_MS + 50 * MINUTE_MS,
      rhythm: "Daily at 03:00",
      time: "03:00",
      timezone: "UTC",
      weekday: "Mon",
    },
    status: "active",
    statusReason: "Turns off in 2 days · last run failed",
    summary:
      "Crawls docs.cawco.dev for 404 links and files a task if any page breaks.",
  },
  {
    doneWhen: {
      checkedAt: MOCK_NOW - 60 * MINUTE_MS,
      giveUpAt: MOCK_NOW + 7 * DAY_MS,
      heldSteps: 0,
      heldTasks: [
        {
          id: "tsk-424",
          stage: "Ready",
          title: "Notify self-hosters of v2.4.0 upgrade notes",
        },
      ],
      lastWords:
        "v2.4.0-rc.3 is the newest tag; final v2.4.0 release is still marked draft.",
      lastWordsBy: "model",
      machineName: "obelisk",
      metAt: null,
      method: "model",
      standing: "not-yet",
      statement:
        "Release v2.4.0 is published on github.com/cawco/cloud with signed Linux and macOS tarballs.",
    },
    executor: {
      harness: "Claude Code",
      label: "Single session · Claude Code",
      mode: "delegate",
    },
    id: "rtn-release-tag",
    instructions:
      "Inspect GitHub Releases on cawco/cloud. Confirm tag v2.4.0 is published (not draft or prerelease) and includes signed linux-x64 and darwin-arm64 tarballs plus SHA256SUMS.",
    limits: {
      dailyCapDollars: 2.0,
      maxDollars: 0.3,
      maxMinutes: 3,
      maxTurns: 6,
      runsWeek: 16,
      spentTodayDollars: 0.42,
      spentWeekDollars: 1.12,
    },
    name: "Release 2.4 tag watch",
    origin: {
      by: "owner",
      kept: true,
    },
    runningStartedAt: MOCK_NOW - 74_000,
    runningStep: "Checking release assets on github.com/cawco/cloud",
    runs: [
      {
        attribution: "model",
        durationMs: 74_000,
        id: "run-rt-4",
        oneLine: "Checking GitHub Releases on cawco/cloud…",
        outcome: "running",
        resultMarkdown:
          "Run is still in progress on `obelisk`. Checking published assets for `v2.4.0`.",
        session: makeSession("ses-rt-4", "Release 2.4 tag watch", [
          releaseCheckEntry,
          {
            id: "e2",
            kind: "tool",
            label: "gh release list --repo cawco/cloud --limit 5",
            text: "Running…",
            timeOffset: "00:08",
          },
        ]),
        startedAt: MOCK_NOW - 74_000,
        trigger: "schedule",
      },
      {
        attribution: "model",
        costDollars: 0.06,
        durationMs: 14_000,
        id: "run-rt-3",
        oneLine:
          "v2.4.0-rc.3 is the newest tag; final v2.4.0 release is still marked draft",
        outcome: "not-yet",
        proposedActionIds: ["act-gh-release-notes"],
        resultMarkdown:
          "- **Latest published release:** `v2.4.0-rc.3` (prerelease, published 5h ago)\n- **Draft found:** `v2.4.0` (draft, missing `darwin-arm64.tar.gz.sig`)\n\nHolding `tsk-424` until the final release is published with both signed tarballs.",
        session: makeSession("ses-rt-3", "Release 2.4 tag watch", [
          releaseCheckEntry,
          {
            id: "e2",
            kind: "tool",
            label: "gh api repos/cawco/cloud/releases?per_page=3",
            text: '[{"tag_name":"v2.4.0","draft":true,"assets":["linux-x64.tar.gz"]},{"tag_name":"v2.4.0-rc.3","prerelease":true}]',
            timeOffset: "00:05",
          },
          {
            id: "e3",
            kind: "reply",
            label: "Finding",
            text: "Not yet — v2.4.0-rc.3 is the newest published tag; final v2.4.0 release is still marked draft.",
            timeOffset: "00:14",
          },
        ]),
        startedAt: MOCK_NOW - 60 * MINUTE_MS,
        trigger: "schedule",
        turns: 2,
      },
      {
        attribution: "model",
        costDollars: 0.06,
        durationMs: 12_000,
        id: "run-rt-2",
        oneLine: "v2.4.0-rc.3 is still the latest published release",
        outcome: "not-yet",
        resultMarkdown:
          "Checked `cawco/cloud` releases. Only `v2.4.0-rc.3` is published; no final `v2.4.0` tag yet.",
        startedAt: MOCK_NOW - 2 * HOUR_MS,
        trigger: "schedule",
        turns: 2,
      },
    ],
    schedule: {
      cadence: "hourly",
      nextAt: MOCK_NOW + 50 * MINUTE_MS,
      rhythm: "Hourly at :00",
      time: "00:00",
      timezone: LOCAL_ZONE,
      weekday: "Mon",
    },
    status: "running",
    statusReason: null,
    summary:
      "Looks for v2.4.0 on GitHub Releases with signed Linux and macOS tarballs.",
  },
  {
    executor: {
      harness: "Claude Code",
      label: "Orchestrating session · Claude Code",
      mode: "orchestrator",
    },
    guardrail:
      "Only propose a Slack digest when at least one release PR is blocked.",
    id: "rtn-morning-triage",
    instructions:
      "List every open PR in cawco/cloud updated in the past 24 hours. Check CI status, review comments, and merge conflicts. Summarize blockers clearly and propose a Slack post to #engineering-releases if any release PR is blocked.",
    limits: {
      dailyCapDollars: 3.0,
      maxDollars: 1.0,
      maxMinutes: 8,
      maxTurns: 20,
      runsWeek: 5,
      spentTodayDollars: 0.34,
      spentWeekDollars: 1.62,
    },
    name: "Morning PR triage",
    origin: {
      by: "owner",
      kept: true,
    },
    runs: [
      {
        attribution: "model",
        costDollars: 0.34,
        durationMs: 138_000,
        id: "run-mt-5",
        oneLine:
          "5 open PRs reviewed · 2 ready to merge, 1 failing typecheck (#422)",
        outcome: "delivered",
        proposedActionIds: ["act-slack-digest"],
        resultMarkdown:
          "### Morning PR digest — 21 Nov\n\nReviewed **5 open pull requests** in `cawco/cloud`.\n\n#### Ready to merge\n- **#419** `fix(relay): keep reconnect jitter bounded` — CI green, 1 approval\n- **#420** `docs: add systemd socket activation steps` — CI green, no conflicts\n\n#### Needs attention\n- **#422** `feat(billing): prorate mid-cycle seat changes` — `typecheck` failing in `packages/hub/src/billing.ts:148` (`Property 'seatDelta' does not exist`).\n- **#417** `chore: upgrade drizzle-orm` — merge conflict in `bun.lock`.",
        session: makeSession("ses-mt-5", "Morning PR triage · Nov 21", [
          {
            id: "e1",
            kind: "prompt",
            label: "Routine instructions",
            text: "List every open PR in cawco/cloud updated in the past 24 hours. Check CI status, review comments, and merge conflicts.",
            timeOffset: "00:00",
          },
          {
            id: "e2",
            kind: "tool",
            label:
              "gh pr list --state open --json number,title,statusCheckRollup",
            text: "Returned 5 open PRs (#417, #419, #420, #422, #423).",
            timeOffset: "00:07",
          },
          {
            id: "e3",
            kind: "tool",
            label: "gh run view 19482711 --log-failed",
            text: "packages/hub/src/billing.ts(148,19): error TS2339: Property 'seatDelta' does not exist on type 'InvoiceLine'.",
            timeOffset: "00:41",
          },
          {
            id: "e4",
            kind: "tool",
            label:
              "propose_action · slack.chat.postMessage (#engineering-releases)",
            text: "Proposed action act-slack-digest (waiting on owner approval).",
            timeOffset: "01:55",
          },
          {
            id: "e5",
            kind: "reply",
            label: "Final summary",
            text: "Digest delivered: 2 PRs ready to merge (#419, #420), #422 blocked on typecheck, #417 needs rebase. Proposed Slack summary for approval.",
            timeOffset: "02:18",
          },
        ]),
        startedAt: MOCK_NOW - 12 * HOUR_MS,
        trigger: "schedule",
        turns: 9,
      },
      {
        attribution: "model",
        costDollars: 0.29,
        durationMs: 112_000,
        id: "run-mt-4",
        oneLine: "3 open PRs reviewed · all CI checks passing",
        outcome: "delivered",
        resultMarkdown:
          "### Morning PR digest — 20 Nov\n\nAll **3 open PRs** passed CI cleanly with zero conflicts.",
        startedAt: MOCK_NOW - 36 * HOUR_MS,
        trigger: "schedule",
        turns: 7,
      },
      {
        attribution: "system",
        durationMs: 0,
        id: "run-mt-3",
        oneLine: "Skipped · daily spending cap ($3.00) reached ($3.12 spent)",
        outcome: "skipped",
        resultMarkdown:
          "The project reached this routine's daily spending cap (**$3.00/day**; **$3.12** already spent on Nov 19), so CawCo skipped the scheduled 09:00 run without starting a session.",
        startedAt: MOCK_NOW - 60 * HOUR_MS,
        trigger: "schedule",
      },
      {
        attribution: "model",
        costDollars: 0.26,
        durationMs: 96_000,
        id: "run-mt-2",
        oneLine: "4 open PRs reviewed · flagged flaky Playwright test on #412",
        outcome: "delivered",
        resultMarkdown:
          "### Manual PR triage — 18 Nov\n\nFlagged flaky timeout in `tests/checkout.spec.ts` on PR **#412**.",
        startedAt: MOCK_NOW - 84 * HOUR_MS,
        trigger: "manual",
        turns: 6,
      },
    ],
    schedule: {
      cadence: "weekdays",
      nextAt: MOCK_NOW + 35 * HOUR_MS + 50 * MINUTE_MS,
      rhythm: "Weekdays at 09:00",
      time: "09:00",
      timezone: LOCAL_ZONE,
      weekday: "Mon",
    },
    status: "active",
    statusReason: null,
    summary:
      "Reviews open pull requests overnight, flags blockers, and drafts a morning digest.",
  },
  {
    executor: {
      harness: "Claude Code",
      label: "Single session · Claude Code",
      mode: "delegate",
    },
    guardrail: "Skip internal refactors and lockfile-only bumps.",
    id: "rtn-changelog-draft",
    instructions:
      "Read the merged PR diff and commit message. If the change is user-facing, append one concise bullet under Unreleased in CHANGELOG.md and propose a GitHub comment confirming the wording. Skip internal refactors and lockfile-only bumps.",
    limits: {
      maxDollars: 0.4,
      maxMinutes: 4,
      maxTurns: 8,
      runsWeek: 6,
      spentTodayDollars: 0.11,
      spentWeekDollars: 0.48,
    },
    name: "Post-merge changelog draft",
    origin: {
      by: "owner",
      kept: true,
    },
    runs: [
      {
        attribution: "model",
        costDollars: 0.11,
        durationMs: 48_000,
        id: "run-cd-3",
        oneLine: "Added v2.4.0 note for faster cold reconnects (PR #418)",
        outcome: "delivered",
        proposedActionIds: ["act-gh-comment"],
        resultMarkdown:
          "Appended under **Improved** in `CHANGELOG.md`:\n\n> Reconnecting after a network drop now restores open session panes in a single frame without clearing unsent drafts (#418).",
        session: makeSession("ses-cd-3", "Changelog draft · PR #418", [
          {
            id: "e1",
            kind: "prompt",
            label: "Started by GitHub PR #418",
            text: "PR #418 merged to main by @sara: 'Keep open panes warm across tailnet reconnects'. Draft a user-facing release note if applicable.",
            timeOffset: "00:00",
          },
          {
            id: "e2",
            kind: "tool",
            label: "edit · CHANGELOG.md",
            text: "Added 1 bullet under ## Unreleased → ### Improved.",
            timeOffset: "00:29",
          },
          {
            id: "e3",
            kind: "reply",
            label: "Session report",
            text: "Added release note for PR #418 and commented on the pull request.",
            timeOffset: "00:48",
          },
        ]),
        startedAt: MOCK_NOW - 3 * HOUR_MS,
        trigger: "event",
        triggerDetail: "Started by PR #418 merged to main by @sara",
        turns: 4,
      },
      {
        attribution: "model",
        costDollars: 0.04,
        durationMs: 18_000,
        id: "run-cd-2",
        oneLine: "Internal lint rule bump — skipped changelog entry",
        outcome: "nothing-to-report",
        resultMarkdown:
          "PR **#416** only adjusted internal Biome formatting scripts. No user-facing release note needed.",
        startedAt: MOCK_NOW - 19 * HOUR_MS,
        trigger: "event",
        triggerDetail: "Started by PR #416 merged to main by @bewinxed",
        turns: 2,
      },
    ],
    schedule: {
      cadence: "events",
      nextAt: null,
      rhythm: "On GitHub PR merge",
      time: "09:00",
      timezone: LOCAL_ZONE,
      weekday: "Mon",
    },
    status: "active",
    statusReason: null,
    summary:
      "Appends a user-facing release note entry whenever a pull request merges to main.",
  },
  {
    builtIn: true,
    executor: {
      label: "CawCo built-in",
      mode: "builtin",
    },
    id: "rtn-nightly-memory",
    instructions:
      "Reviews sessions ended in the last 24 hours and updates project memory notes with durable conventions and decisions.",
    limits: {
      maxMinutes: 5,
      runsWeek: 4,
      spentWeekDollars: 0.28,
    },
    name: "Nightly project memory",
    origin: {
      by: "cawco",
      kept: true,
    },
    runs: [
      {
        attribution: "model",
        costDollars: 0.07,
        durationMs: 27_000,
        id: "run-nm-1",
        oneLine: "Reviewed 4 sessions · no new conventions to record",
        outcome: "nothing-to-report",
        resultMarkdown:
          "Reviewed **4 sessions** from Nov 19. Everything decided was already captured in `MEMORY.md`.",
        startedAt: MOCK_NOW - 2 * DAY_MS,
        trigger: "schedule",
        turns: 2,
      },
    ],
    schedule: {
      cadence: "daily",
      nextAt: null,
      rhythm: "Daily at 23:30",
      time: "23:30",
      timezone: LOCAL_ZONE,
      weekday: "Mon",
    },
    status: "paused",
    statusReason: "Paused by you",
    summary:
      "Distills settled decisions and recurring gotchas from today's sessions into project memory.",
  },
  {
    doneWhen: {
      checkedAt: MOCK_NOW - 2 * DAY_MS,
      giveUpAt: null,
      heldSteps: 0,
      heldTasks: [],
      lastWords:
        "Zero v2 deliveries in the last 24h; 1,412 v3 events succeeded with HTTP 200.",
      lastWordsBy: "model",
      machineName: "obelisk",
      metAt: MOCK_NOW - 2 * DAY_MS,
      method: "model",
      standing: "met",
      statement:
        "All production billing events arrive on the v3 webhook endpoint with zero v2 traffic for 24 hours.",
    },
    executor: {
      harness: "Claude Code",
      label: "Single session · Claude Code",
      mode: "delegate",
    },
    id: "rtn-stripe-v3",
    instructions:
      "Query production webhook delivery metrics for the past 24 hours. Confirm zero deliveries hit /webhooks/stripe/v2 and all v3 deliveries succeeded.",
    limits: {
      maxDollars: 0.25,
      maxMinutes: 3,
      maxTurns: 6,
      runsWeek: 3,
      spentWeekDollars: 0.18,
    },
    name: "Stripe webhook v3 migration",
    origin: {
      by: "owner",
      kept: true,
    },
    runs: [
      {
        attribution: "model",
        costDollars: 0.06,
        durationMs: 19_000,
        id: "run-sv-1",
        oneLine:
          "Zero v2 deliveries in 24h; 1,412 v3 events succeeded — released tsk-399",
        outcome: "met",
        resultMarkdown:
          "- **`/webhooks/stripe/v2`:** 0 requests in the past 24 hours\n- **`/webhooks/stripe/v3`:** 1,412 requests, 100% HTTP `200 OK`\n\nReleased **tsk-399** (*Remove legacy Stripe v2 handler*) and finished.",
        startedAt: MOCK_NOW - 2 * DAY_MS,
        trigger: "schedule",
        turns: 2,
      },
    ],
    schedule: {
      cadence: "hourly",
      nextAt: null,
      rhythm: "Every 6 hours",
      time: "00:00",
      timezone: LOCAL_ZONE,
      weekday: "Mon",
    },
    status: "finished",
    statusReason: "Done Nov 19",
    summary:
      "Looked for 24 hours of production billing traffic on webhook v3 with zero v2 events.",
  },
];

export const INITIAL_ACTIONS: ApprovedAction[] = [
  {
    account: "@cawco-bot",
    exactCall:
      'chat.postMessage(channel: "#engineering-releases", text: "Morning PR digest: #419 and #420 ready; #422 blocked on billing.ts typecheck.")',
    id: "act-slack-digest",
    routineId: "rtn-morning-triage",
    routineName: "Morning PR triage",
    runId: "run-mt-5",
    sentence:
      "Post the Nov 21 morning PR blocker digest to #engineering-releases.",
    service: "slack",
    state: "waiting",
    stateAt: MOCK_NOW - 12 * HOUR_MS,
    whenLabel: "As soon as approved",
  },
  {
    account: "ops@cawco.dev",
    exactCall:
      'zones.purge_cache(zone: "docs.cawco.dev", purge_everything: true)',
    id: "act-cf-purge",
    needsLook: true,
    routineId: "rtn-broken-links",
    routineName: "Nightly broken-link sweep",
    runId: "run-bl-3",
    sentence: "Purge docs.cawco.dev edge cache after redirect map deploy.",
    service: "cloudflare",
    serviceResponse:
      "Connection closed before Cloudflare returned an HTTP status — check the Cloudflare dashboard before retrying.",
    shortOutcome: "Cloudflare didn't confirm the cache purge.",
    state: "unknown",
    stateAt: MOCK_NOW - 15 * HOUR_MS,
    whenLabel: "Ran 15h ago",
  },
  {
    account: "@bewinxed",
    exactCall:
      'repos.updateRelease(repo: "cawco/cloud", tag: "v2.4.0", draft: false)',
    id: "act-gh-release-notes",
    routineId: "rtn-release-tag",
    routineName: "Release 2.4 tag watch",
    runId: "run-rt-3",
    scheduledAt: MOCK_NOW + 12 * HOUR_MS + 50 * MINUTE_MS,
    sentence: "Publish draft GitHub release notes for v2.4.0.",
    service: "github",
    state: "approved",
    stateAt: MOCK_NOW - 4 * HOUR_MS,
    task: {
      id: "tsk-421",
      movesTo: "Shipped",
      title: "Publish v2.4.0 changelog",
    },
    whenLabel: "Tomorrow 10:00",
  },
  {
    account: "@bewinxed",
    exactCall:
      'issues.createComment(repo: "cawco/cloud", issue_number: 418, body: "Added under Unreleased → Improved in CHANGELOG.md.")',
    id: "act-gh-comment",
    routineId: "rtn-changelog-draft",
    routineName: "Post-merge changelog draft",
    runId: "run-cd-3",
    sentence: "Comment the drafted changelog bullet on PR #418.",
    service: "github",
    serviceResponse: "201 Created — comment #249184412",
    shortOutcome: "Posted comment on PR #418",
    state: "ran",
    stateAt: MOCK_NOW - 3 * HOUR_MS,
    task: {
      id: "tsk-415",
      movesTo: "Shipped",
      title: "Keep open panes warm across reconnects",
    },
    whenLabel: "Ran 3h ago",
  },
];

export const INITIAL_SOURCES: EventSource[] = [
  {
    enabled: true,
    error: null,
    id: "src-github",
    service: "github",
    serviceName: "GitHub",
  },
  {
    enabled: true,
    error: null,
    id: "src-slack",
    service: "slack",
    serviceName: "Slack",
  },
  {
    enabled: true,
    error:
      "OAuth token expired (401). Reconnect Linear in Configure › Connections.",
    id: "src-linear",
    service: "linear",
    serviceName: "Linear",
  },
];

export const INITIAL_RULES: EventRule[] = [
  {
    enabled: true,
    eventKinds: ["pull_request.closed"],
    filters: ["branch: main", "merged: true"],
    id: "rule-gh-pr",
    lastDeliveredAt: MOCK_NOW - 3 * HOUR_MS,
    routineId: "rtn-changelog-draft",
    service: "github",
    serviceName: "GitHub",
  },
  {
    enabled: true,
    eventKinds: ["release.published"],
    filters: ["repo: cawco/cloud"],
    id: "rule-gh-release",
    lastDeliveredAt: MOCK_NOW - 4 * DAY_MS,
    routineId: "rtn-release-tag",
    service: "github",
    serviceName: "GitHub",
  },
  {
    enabled: false,
    eventKinds: ["message.posted"],
    filters: ["channel: #ops-alerts", 'text: "503"'],
    id: "rule-ops-503",
    lastDeliveredAt: MOCK_NOW - 2 * DAY_MS,
    routineId: "rtn-staging-health",
    service: "slack",
    serviceName: "Slack",
  },
];

export function formatRelAge(at: number, now: number = MOCK_NOW): string {
  const seconds = Math.max(0, Math.floor((now - at) / 1000));
  if (seconds < 45) {
    return "just now";
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`;
}

export function formatShortDuration(ms: number): string {
  if (ms <= 0) {
    return "0s";
  }
  const totalSec = Math.round(ms / 1000);
  if (totalSec < 60) {
    return `${totalSec}s`;
  }
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
}

const fmtShortDay = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  month: "short",
  timeZone: LOCAL_ZONE,
});

const fmtClockHm = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  hour12: false,
  minute: "2-digit",
  timeZone: LOCAL_ZONE,
});

const fmtWeekdayShort = new Intl.DateTimeFormat("en-US", {
  timeZone: LOCAL_ZONE,
  weekday: "short",
});

const fmtExact = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  hour: "2-digit",
  hour12: false,
  minute: "2-digit",
  month: "short",
  timeZone: LOCAL_ZONE,
  weekday: "short",
});

export function formatDay(at: number): string {
  return fmtShortDay.format(new Date(at));
}

export function formatExactClock(at: number): string {
  return fmtExact.format(new Date(at));
}

export function formatNextClock(at: number, now: number = MOCK_NOW): string {
  const clock = fmtClockHm.format(new Date(at));
  const label = fmtShortDay.format(new Date(at));
  if (label === fmtShortDay.format(new Date(now))) {
    return `Today ${clock}`;
  }
  if (label === fmtShortDay.format(new Date(now + DAY_MS))) {
    return `Tomorrow ${clock}`;
  }
  return `${fmtWeekdayShort.format(new Date(at))} ${clock}`;
}

export function daysUntil(at: number, now: number = MOCK_NOW): number {
  return Math.max(1, Math.ceil((at - now) / DAY_MS));
}

export function formatRelNext(at: number, now: number = MOCK_NOW): string {
  const diff = Math.max(0, at - now);
  if (diff < MINUTE_MS) {
    return "in <1m";
  }
  if (diff < HOUR_MS) {
    return `in ${Math.round(diff / MINUTE_MS)}m`;
  }
  const hours = Math.round(diff / HOUR_MS);
  if (hours < 24) {
    return `in ~${hours}h`;
  }
  const days = Math.round(diff / DAY_MS);
  return `in ~${days}d`;
}
