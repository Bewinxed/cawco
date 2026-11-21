import type { ActionState as CoreActionState } from "@cawco/core/actions";
import type { ConditionState } from "@cawco/core/routine-kinds";
import { DAY_MS, HOUR_MS, MINUTE_MS } from "@cawco/core/time";
import type { BarView } from "#lib/cawco/project/ViewBar.svelte";
import type { ProjectRow } from "#lib/cawco/projects.js";
import type { Machine } from "#lib/cawco/stores/board.svelte.js";

export type ServiceKey = "github" | "slack" | "linear" | "cloudflare";

export type RoutineKind = "work" | "check";

type RoutineStatus = "active" | "running" | "paused" | "stopped" | "finished";

export type CheckStanding =
  Exclude<ConditionState, "checking" | "deleted"> | "pending";

export type RunTrigger = "schedule" | "event" | "manual" | "creation-test";

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

export type ScheduleCadence =
  "hourly" | "daily" | "weekdays" | "weekly" | "custom" | "events";

interface HeldTaskRef {
  id: string;
  stage: string;
  title: string;
}

interface RoutineCheck {
  checkedAt: number | null;
  command?: string;
  giveUpAt: number | null;
  heldSteps: number;
  heldTasks: HeldTaskRef[];
  lastExitCode?: number | null;
  lastWords: string | null;
  lastWordsBy: "model" | "command" | "owner" | null;
  machineName: string;
  markedMetByOwner?: boolean;
  metAt: number | null;
  method: "model" | "command";
  standing: CheckStanding;
  statement: string;
}

interface RoutineSchedule {
  cadence: ScheduleCadence;
  cron?: string;
  eventSummary?: string;
  nextAt: number | null;
  rhythm: string;
  time: string;
  timezone: string;
  weekday: string;
}

interface EventTriggerRef {
  eventKind: string;
  filters: string[];
  id: string;
  service: ServiceKey;
}

interface SessionEntry {
  detail?: string;
  id: string;
  kind: "prompt" | "tool" | "reply";
  label: string;
  text: string;
  timeOffset: string;
}

interface RunSession {
  entries: SessionEntry[];
  harness: string;
  id: string;
  model: string;
  place: string;
  title: string;
}

export interface RoutineRun {
  attribution: "model" | "command" | "system";
  commandStdout?: string;
  costDollars?: number;
  durationMs: number;
  exitCode?: number | null;
  id: string;
  oneLine: string;
  outcome: RunOutcome;
  proposedActionIds?: string[];
  resultMarkdown: string;
  retriedOnce?: boolean;
  session?: RunSession;
  startedAt: number;
  trigger: RunTrigger;
  triggerDetail?: string;
  turns?: number;
}

export interface Routine {
  builtIn?: boolean;
  check?: RoutineCheck;
  eventTriggers: EventTriggerRef[];
  executor: {
    delegateType?: string;
    label: string;
    mode: "delegate" | "orchestrator" | "command" | "builtin";
  };
  id: string;
  instructions: string;
  kind: RoutineKind;
  limits: {
    dailyCapDollars?: number;
    maxDollars?: number;
    maxMinutes: number;
    maxTurns?: number;
    runsWeek: number;
    spentTodayDollars?: number;
    spentWeekDollars?: number;
  };
  name: string;
  origin: {
    by: "owner" | "session" | "cawco";
    expiresAt?: number | null;
    kept: boolean;
    sessionId?: string;
    sessionTitle?: string;
    why?: string;
  };
  runningStartedAt?: number;
  runningStep?: string;
  runs: RoutineRun[];
  schedule: RoutineSchedule;
  status: RoutineStatus;
  statusReason: string | null;
  summary: string;
}

export type ActionState =
  Exclude<CoreActionState, "proposed" | "done"> | "waiting" | "ran";

export interface ApprovedAction {
  account: string;
  exactCall: string;
  id: string;
  needsLook?: boolean;
  routineId: string;
  routineName: string;
  runId: string;
  sentence: string;
  service: ServiceKey;
  serviceResponse?: string;
  state: ActionState;
  stateAt: number;
  task?: {
    id: string;
    movesTo: string;
    title: string;
  };
  whenLabel: string;
}

export interface EventSource {
  cadence: string;
  delivery: "webhook" | "poll";
  enabled: boolean;
  error: string | null;
  id: string;
  itemsSeen: number;
  lastReadAt: number;
  service: ServiceKey;
  serviceName: string;
  target: string;
}

export interface EventRule {
  enabled: boolean;
  eventKinds: string[];
  filters: string[];
  id: string;
  lastDeliveredAt: number | null;
  routineId: string;
  routineName: string;
  service: ServiceKey;
  serviceName: string;
}

export interface RecentEvent {
  at: number;
  destination:
    | { kind: "routine"; routineId: string; routineName: string }
    | { kind: "conversation" };
  id: string;
  service: ServiceKey;
  summary: string;
}

export interface CawSuggestion {
  detail: string;
  id: string;
  title: string;
}

/** Reference clock for deterministic mock readings (2026-11-21 21:10 local). */
export const MOCK_NOW = Date.parse("2026-11-21T18:10:00Z");
export const LOCAL_ZONE = "Europe/Istanbul";

export const MOCK_PROJECT: ProjectRow = {
  id: "prj-cawco-cloud",
  name: "CawCo Cloud",
  createdAt: "2026-08-14T09:00:00Z",
  cawHarness: "claude",
  cawModel: "claude-sonnet-4-6",
  conversationInstanceId: null,
  eventsOn: true,
  lands: "branch",
  review: true,
  account: null,
  accountAtLimit: "wait",
  lfsConnection: null,
  lfsUrl: null,
  links: ["github.com/cawco/cloud"],
  primaryPlaceId: "plc-obelisk",
  places: [
    {
      id: "plc-obelisk",
      projectId: "prj-cawco-cloud",
      kind: "checkout",
      machineId: "mch-obelisk",
      path: "/home/bewinxed/code/cawco-cloud",
      isPrimary: true,
      found: true,
      made: false,
      missing: false,
      within: [],
      createdAt: "2026-08-14T09:00:00Z",
    },
  ],
};

export const MOCK_MACHINE: Machine = {
  auth: "authenticated",
  home: "/home/bewinxed",
  hostname: "obelisk",
  joinedAt: Date.parse("2026-08-14T09:00:00Z"),
  machineId: "mch-obelisk",
  os: "linux",
  pausedUntil: null,
  pauseStopped: null,
  status: "online",
};

function releaseWatchSession(id: string, rest: SessionEntry[]): RunSession {
  return {
    id,
    title: "Release 2.4 tag watch",
    harness: "Claude Code",
    model: "claude-sonnet-4-6",
    place: "/home/bewinxed/code/cawco-cloud",
    entries: [
      {
        id: "e1",
        kind: "prompt",
        label: "Check statement",
        timeOffset: "00:00",
        text: "Verify whether v2.4.0 is published on github.com/cawco/cloud with signed Linux and macOS tarballs.",
      },
      ...rest,
    ],
  };
}

export const PROJECT_VIEWS: BarView[] = [
  { value: "board", label: "Board", count: 0, draft: false },
  { value: "table", label: "Table", count: 0, draft: false },
  { value: "routines", label: "Routines", count: 0, draft: false },
  { value: "decisions", label: "Decisions", count: 2, draft: false },
  { value: "made", label: "Made", count: 0, draft: false },
];

export const PROJECT_STARTERS: string[] = [
  "Every Friday at 16:00, summarize merged PRs and open blockers for the week",
  "Check every 30 minutes until staging SSL renews, then unblock tsk-430",
  "When a GitHub issue is labelled outage, draft an incident brief",
];

export const INITIAL_SUGGESTION: CawSuggestion = {
  id: "sug-unused-skills",
  title: "Weekly unused skills & servers check",
  detail:
    "Each Monday at 09:00, count what sessions called over the past 30 days and propose unlisting what went unused. Nothing changes until you approve.",
};

export const INITIAL_ROUTINES: Routine[] = [
  {
    id: "rtn-staging-health",
    name: "Staging health check",
    summary:
      "Checks that staging /health returns 200 OK with database migrations at head.",
    kind: "check",
    status: "stopped",
    statusReason: "Stopped after 3 failed checks",
    instructions:
      "Confirm the staging deployment is healthy and all Drizzle migrations are applied before promoting v2.4.0.",
    check: {
      statement:
        "Staging /health returns HTTP 200 with status ok and migrations at head.",
      method: "command",
      command:
        'curl -sf --max-time 15 https://staging.cawco.dev/health | jq -e \'.status == "ok" and .migrations == "head"\'',
      machineName: "obelisk",
      standing: "failing",
      lastWords: "sh: jq: command not found",
      lastWordsBy: "command",
      lastExitCode: 127,
      checkedAt: MOCK_NOW - 18 * MINUTE_MS,
      metAt: null,
      giveUpAt: MOCK_NOW + 4 * DAY_MS,
      heldTasks: [
        {
          id: "tsk-418",
          title: "Promote v2.4.0 build to production",
          stage: "Ready",
        },
        {
          id: "tsk-421",
          title: "Publish v2.4.0 changelog",
          stage: "Ready",
        },
      ],
      heldSteps: 2,
    },
    schedule: {
      cadence: "custom",
      cron: "*/15 * * * *",
      rhythm: "Every 15 minutes",
      time: "00:00",
      weekday: "Mon",
      timezone: LOCAL_ZONE,
      nextAt: null,
    },
    eventTriggers: [
      {
        id: "rule-ops-503",
        service: "slack",
        eventKind: "message.posted",
        filters: ["channel: #ops-alerts", 'text: "503"'],
      },
    ],
    executor: {
      mode: "command",
      label: "Shell command on obelisk",
    },
    origin: {
      by: "owner",
      kept: true,
    },
    limits: {
      maxMinutes: 1,
      runsWeek: 26,
    },
    runs: [
      {
        id: "run-sh-4",
        startedAt: MOCK_NOW - 18 * MINUTE_MS,
        durationMs: 420,
        trigger: "schedule",
        outcome: "could-not-check",
        attribution: "command",
        exitCode: 127,
        oneLine: "sh: jq: command not found (exit 127)",
        resultMarkdown:
          "The check command could not run because `jq` is not installed in the sandbox image on `obelisk`.",
        commandStdout:
          '$ curl -sf --max-time 15 https://staging.cawco.dev/health | jq -e \'.status == "ok" and .migrations == "head"\'\nsh: 1: jq: command not found\n\nProcess exited with code 127 (could not check — command missing).',
      },
      {
        id: "run-sh-3",
        startedAt: MOCK_NOW - 33 * MINUTE_MS,
        durationMs: 390,
        trigger: "schedule",
        outcome: "could-not-check",
        attribution: "command",
        exitCode: 127,
        oneLine: "sh: jq: command not found (exit 127)",
        resultMarkdown:
          "The check command could not run because `jq` is not installed in the sandbox image on `obelisk`.",
        commandStdout:
          '$ curl -sf --max-time 15 https://staging.cawco.dev/health | jq -e \'.status == "ok" and .migrations == "head"\'\nsh: 1: jq: command not found\n\nProcess exited with code 127 (could not check — command missing).',
      },
      {
        id: "run-sh-2",
        startedAt: MOCK_NOW - 48 * MINUTE_MS,
        durationMs: 410,
        trigger: "schedule",
        outcome: "could-not-check",
        attribution: "command",
        exitCode: 127,
        oneLine: "sh: jq: command not found (exit 127)",
        resultMarkdown:
          "The check command could not run because `jq` is not installed in the sandbox image on `obelisk`.",
        commandStdout:
          '$ curl -sf --max-time 15 https://staging.cawco.dev/health | jq -e \'.status == "ok" and .migrations == "head"\'\nsh: 1: jq: command not found\n\nProcess exited with code 127 (could not check — command missing).',
      },
      {
        id: "run-sh-1",
        startedAt: MOCK_NOW - 3 * HOUR_MS,
        durationMs: 1840,
        trigger: "creation-test",
        outcome: "not-yet",
        attribution: "command",
        exitCode: 1,
        oneLine:
          "migrations field reported 0041_pending instead of head (exit 1)",
        resultMarkdown:
          "Staging responded `200 OK`, but `migrations` was `0041_pending` rather than `head`.",
        commandStdout:
          '{"status":"ok","version":"2.4.0-rc.3","migrations":"0041_pending"}\n\nProcess exited with code 1 (not yet met).',
      },
    ],
  },
  {
    id: "rtn-broken-links",
    name: "Nightly broken-link sweep",
    summary:
      "Crawls docs.cawco.dev for 404 links and files a task if any page breaks.",
    kind: "work",
    status: "active",
    statusReason: "Turns off in 2 days · last run failed",
    instructions:
      "Crawl every route listed in docs.cawco.dev/sitemap.xml, verify internal links and anchor hashes resolve cleanly, and file a task in Ready if any 404 or redirect loop appears.",
    schedule: {
      cadence: "daily",
      rhythm: "Daily at 03:00",
      time: "03:00",
      weekday: "Mon",
      timezone: "UTC",
      nextAt: MOCK_NOW + 8 * HOUR_MS + 50 * MINUTE_MS,
    },
    eventTriggers: [],
    executor: {
      mode: "delegate",
      delegateType: "Claude Code",
      label: "Fresh delegate · Claude Code",
    },
    origin: {
      by: "session",
      kept: false,
      sessionId: "ses-docs-migration",
      sessionTitle: "Docs migration pass",
      why: "I'll set up a nightly link sweep while the docs redirects settle; keep it if you want it past next week.",
      expiresAt: MOCK_NOW + 2 * DAY_MS,
    },
    limits: {
      maxTurns: 12,
      maxMinutes: 5,
      maxDollars: 0.75,
      dailyCapDollars: 2.0,
      spentTodayDollars: 0.19,
      spentWeekDollars: 0.84,
      runsWeek: 5,
    },
    runs: [
      {
        id: "run-bl-3",
        startedAt: MOCK_NOW - 15 * HOUR_MS,
        durationMs: 62_000,
        trigger: "schedule",
        outcome: "failed",
        retriedOnce: true,
        attribution: "system",
        costDollars: 0.19,
        turns: 4,
        oneLine:
          "Timed out fetching docs.cawco.dev/sitemap.xml after 30s (retried once)",
        resultMarkdown:
          "### Why this run stopped\n\nBoth attempts timed out waiting for `https://docs.cawco.dev/sitemap.xml` (HTTP timeout after 30s). Cloudflare edge logs were unreachable from `obelisk` at 03:00 UTC.\n\n- **Attempt 1:** 03:00 UTC — `ETIMEDOUT` after 30s\n- **Attempt 2 (automatic retry):** 03:02 UTC — `ETIMEDOUT` after 30s\n\nNo tasks were filed.",
        session: {
          id: "ses-bl-3",
          title: "Nightly broken-link sweep · retry",
          harness: "Claude Code",
          model: "claude-sonnet-4-6",
          place: "/home/bewinxed/code/cawco-cloud",
          entries: [
            {
              id: "e1",
              kind: "prompt",
              label: "Routine instructions",
              timeOffset: "00:00",
              text: "Crawl every route listed in docs.cawco.dev/sitemap.xml, verify internal links and anchor hashes resolve cleanly, and file a task if any 404 appears.",
            },
            {
              id: "e2",
              kind: "tool",
              label: "bash · curl -fsS https://docs.cawco.dev/sitemap.xml",
              timeOffset: "00:04",
              text: "curl: (28) Operation timed out after 30001 milliseconds with 0 bytes received",
            },
            {
              id: "e3",
              kind: "reply",
              label: "Delegate report",
              timeOffset: "01:02",
              text: "Could not reach docs.cawco.dev/sitemap.xml after retrying. Marking run failed without filing false-positive broken link tasks.",
            },
          ],
        },
      },
      {
        id: "run-bl-2",
        startedAt: MOCK_NOW - 39 * HOUR_MS,
        durationMs: 44_000,
        trigger: "schedule",
        outcome: "delivered",
        attribution: "model",
        costDollars: 0.21,
        turns: 6,
        oneLine:
          "Checked 84 routes · 2 broken links found and filed as tsk-416",
        resultMarkdown:
          "### Docs crawl summary\n\nCrawled **84 routes** from `docs.cawco.dev/sitemap.xml`.\n\n- **82 pages** returned `200 OK` with valid anchors.\n- **2 broken links** found on `/guides/self-hosting`:\n  - `/docs/relay-setup` → `404` (moved to `/guides/relay`)\n  - `/api/tokens#scopes` → missing `#scopes` heading\n\nFiled **tsk-416** (*Fix two broken links in self-hosting guide*) in `Ready`.",
        session: {
          id: "ses-bl-2",
          title: "Nightly broken-link sweep",
          harness: "Claude Code",
          model: "claude-sonnet-4-6",
          place: "/home/bewinxed/code/cawco-cloud",
          entries: [
            {
              id: "e1",
              kind: "prompt",
              label: "Routine instructions",
              timeOffset: "00:00",
              text: "Crawl every route listed in docs.cawco.dev/sitemap.xml and file a task if any 404 appears.",
            },
            {
              id: "e2",
              kind: "tool",
              label: "bash · bun scripts/check-links.ts https://docs.cawco.dev",
              timeOffset: "00:11",
              text: "Checked 84 pages, 412 links. 2 failures on /guides/self-hosting.",
            },
            {
              id: "e3",
              kind: "tool",
              label: "create_task · Fix two broken links in self-hosting guide",
              timeOffset: "00:34",
              text: "Created tsk-416 in stage Ready.",
            },
            {
              id: "e4",
              kind: "reply",
              label: "Delegate report",
              timeOffset: "00:44",
              text: "Found 2 broken links on /guides/self-hosting and filed tsk-416 in Ready.",
            },
          ],
        },
      },
      {
        id: "run-bl-1",
        startedAt: MOCK_NOW - 63 * HOUR_MS,
        durationMs: 31_000,
        trigger: "creation-test",
        outcome: "nothing-to-report",
        attribution: "model",
        costDollars: 0.14,
        turns: 3,
        oneLine: "All 84 routes returned 200 OK · nothing to report",
        resultMarkdown:
          "All **84 routes** and **410 internal links** resolved cleanly with `200 OK`. Nothing to report.",
      },
    ],
  },
  {
    id: "rtn-release-tag",
    name: "Release 2.4 tag watch",
    summary:
      "Looks for v2.4.0 on GitHub Releases with signed Linux and macOS tarballs.",
    kind: "check",
    status: "running",
    statusReason: null,
    runningStartedAt: MOCK_NOW - 74_000,
    runningStep: "Checking release assets on github.com/cawco/cloud",
    instructions:
      "Inspect GitHub Releases on cawco/cloud. Confirm tag v2.4.0 is published (not draft or prerelease) and includes signed linux-x64 and darwin-arm64 tarballs plus SHA256SUMS.",
    check: {
      statement:
        "Release v2.4.0 is published on github.com/cawco/cloud with signed Linux and macOS tarballs.",
      method: "model",
      machineName: "obelisk",
      standing: "not-yet",
      lastWords:
        "v2.4.0-rc.3 is the newest tag; final v2.4.0 release is still marked draft.",
      lastWordsBy: "model",
      checkedAt: MOCK_NOW - 60 * MINUTE_MS,
      metAt: null,
      giveUpAt: MOCK_NOW + 7 * DAY_MS,
      heldTasks: [
        {
          id: "tsk-424",
          title: "Notify self-hosters of v2.4.0 upgrade notes",
          stage: "Ready",
        },
      ],
      heldSteps: 0,
    },
    schedule: {
      cadence: "hourly",
      rhythm: "Hourly at :00",
      time: "00:00",
      weekday: "Mon",
      timezone: LOCAL_ZONE,
      nextAt: MOCK_NOW + 50 * MINUTE_MS,
      eventSummary: "+ GitHub release published",
    },
    eventTriggers: [
      {
        id: "rule-gh-release",
        service: "github",
        eventKind: "release.published",
        filters: ["repo: cawco/cloud"],
      },
    ],
    executor: {
      mode: "delegate",
      delegateType: "Claude Code",
      label: "Fresh delegate · Claude Code",
    },
    origin: {
      by: "owner",
      kept: true,
    },
    limits: {
      maxTurns: 6,
      maxMinutes: 3,
      maxDollars: 0.3,
      dailyCapDollars: 2.0,
      spentTodayDollars: 0.42,
      spentWeekDollars: 1.12,
      runsWeek: 16,
    },
    runs: [
      {
        id: "run-rt-4",
        startedAt: MOCK_NOW - 74_000,
        durationMs: 74_000,
        trigger: "schedule",
        outcome: "running",
        attribution: "model",
        oneLine: "Checking GitHub Releases on cawco/cloud…",
        resultMarkdown:
          "Run is still in progress on `obelisk`. Checking published assets for `v2.4.0`.",
        session: releaseWatchSession("ses-rt-4", [
          {
            id: "e2",
            kind: "tool",
            label: "gh release list --repo cawco/cloud --limit 5",
            timeOffset: "00:08",
            text: "Running…",
          },
        ]),
      },
      {
        id: "run-rt-3",
        startedAt: MOCK_NOW - 60 * MINUTE_MS,
        durationMs: 14_000,
        trigger: "schedule",
        outcome: "not-yet",
        attribution: "model",
        costDollars: 0.06,
        turns: 2,
        oneLine:
          "v2.4.0-rc.3 is the newest tag; final v2.4.0 release is still marked draft.",
        resultMarkdown:
          "### Latest check finding\n\n- **Latest published release:** `v2.4.0-rc.3` (prerelease, published 5h ago)\n- **Draft found:** `v2.4.0` (draft, missing `darwin-arm64.tar.gz.sig`)\n\nVerdict: **Not yet met.** Holding `tsk-424` until the final release is published with both signed tarballs.",
        session: releaseWatchSession("ses-rt-3", [
          {
            id: "e2",
            kind: "tool",
            label: "gh api repos/cawco/cloud/releases?per_page=3",
            timeOffset: "00:05",
            text: '[{"tag_name":"v2.4.0","draft":true,"assets":["linux-x64.tar.gz"]},{"tag_name":"v2.4.0-rc.3","prerelease":true}]',
          },
          {
            id: "e3",
            kind: "reply",
            label: "Model verdict",
            timeOffset: "00:14",
            text: "Not yet — v2.4.0-rc.3 is the newest published tag; final v2.4.0 release is still marked draft.",
          },
        ]),
      },
      {
        id: "run-rt-2",
        startedAt: MOCK_NOW - 2 * HOUR_MS,
        durationMs: 12_000,
        trigger: "schedule",
        outcome: "not-yet",
        attribution: "model",
        costDollars: 0.06,
        turns: 2,
        oneLine: "v2.4.0-rc.3 is still the latest published release.",
        resultMarkdown:
          "Checked `cawco/cloud` releases. Only `v2.4.0-rc.3` is published; no final `v2.4.0` tag yet.",
      },
    ],
  },
  {
    id: "rtn-morning-triage",
    name: "Morning PR triage",
    summary:
      "Reviews open pull requests overnight, flags blockers, and drafts a morning digest.",
    kind: "work",
    status: "active",
    statusReason: null,
    instructions:
      "List every open PR in cawco/cloud updated in the past 24 hours. Check CI status, review comments, and merge conflicts. Summarize blockers clearly and propose a Slack post to #engineering-releases if any release PR is blocked.",
    schedule: {
      cadence: "weekdays",
      rhythm: "Weekdays at 09:00",
      time: "09:00",
      weekday: "Mon",
      timezone: LOCAL_ZONE,
      nextAt: MOCK_NOW + 35 * HOUR_MS + 50 * MINUTE_MS,
    },
    eventTriggers: [],
    executor: {
      mode: "orchestrator",
      delegateType: "Claude Code",
      label: "Orchestrating session · Claude Code",
    },
    origin: {
      by: "owner",
      kept: true,
    },
    limits: {
      maxTurns: 20,
      maxMinutes: 8,
      maxDollars: 1.0,
      dailyCapDollars: 3.0,
      spentTodayDollars: 0.34,
      spentWeekDollars: 1.62,
      runsWeek: 5,
    },
    runs: [
      {
        id: "run-mt-5",
        startedAt: MOCK_NOW - 12 * HOUR_MS,
        durationMs: 138_000,
        trigger: "schedule",
        outcome: "delivered",
        attribution: "model",
        costDollars: 0.34,
        turns: 9,
        proposedActionIds: ["act-slack-digest"],
        oneLine:
          "5 open PRs reviewed · 2 ready to merge, 1 failing typecheck (#422)",
        resultMarkdown:
          "### Morning PR digest — 21 Nov\n\nReviewed **5 open pull requests** in `cawco/cloud`.\n\n#### Ready to merge\n- **#419** `fix(relay): keep reconnect jitter bounded` — CI green, 1 approval\n- **#420** `docs: add systemd socket activation steps` — CI green, no conflicts\n\n#### Needs attention\n- **#422** `feat(billing): prorate mid-cycle seat changes` — `typecheck` failing in `packages/hub/src/billing.ts:148` (`Property 'seatDelta' does not exist`).\n- **#417** `chore: upgrade drizzle-orm` — merge conflict in `bun.lock`.\n\n#### Proposed outside action\nProposed posting the v2.4.0 blocker digest to **#engineering-releases** (waiting on your approval).",
        session: {
          id: "ses-mt-5",
          title: "Morning PR triage · Nov 21",
          harness: "Claude Code",
          model: "claude-sonnet-4-6",
          place: "/home/bewinxed/code/cawco-cloud",
          entries: [
            {
              id: "e1",
              kind: "prompt",
              label: "Routine instructions",
              timeOffset: "00:00",
              text: "List every open PR in cawco/cloud updated in the past 24 hours. Check CI status, review comments, and merge conflicts.",
            },
            {
              id: "e2",
              kind: "tool",
              label:
                "gh pr list --state open --json number,title,statusCheckRollup",
              timeOffset: "00:07",
              text: "Returned 5 open PRs (#417, #419, #420, #422, #423).",
            },
            {
              id: "e3",
              kind: "tool",
              label: "gh run view 19482711 --log-failed",
              timeOffset: "00:41",
              text: "packages/hub/src/billing.ts(148,19): error TS2339: Property 'seatDelta' does not exist on type 'InvoiceLine'.",
            },
            {
              id: "e4",
              kind: "tool",
              label:
                "propose_action · slack.chat.postMessage (#engineering-releases)",
              timeOffset: "01:55",
              text: "Proposed action act-slack-digest (waiting on owner approval).",
            },
            {
              id: "e5",
              kind: "reply",
              label: "Final summary",
              timeOffset: "02:18",
              text: "Digest delivered: 2 PRs ready to merge (#419, #420), #422 blocked on typecheck, #417 needs rebase. Proposed Slack summary for approval.",
            },
          ],
        },
      },
      {
        id: "run-mt-4",
        startedAt: MOCK_NOW - 36 * HOUR_MS,
        durationMs: 112_000,
        trigger: "schedule",
        outcome: "delivered",
        attribution: "model",
        costDollars: 0.29,
        turns: 7,
        oneLine: "3 open PRs reviewed · all CI checks passing",
        resultMarkdown:
          "### Morning PR digest — 20 Nov\n\nAll **3 open PRs** passed CI cleanly with zero conflicts.",
      },
      {
        id: "run-mt-3",
        startedAt: MOCK_NOW - 60 * HOUR_MS,
        durationMs: 0,
        trigger: "schedule",
        outcome: "skipped",
        attribution: "system",
        oneLine: "Skipped · daily spending cap ($3.00) reached ($3.12 spent)",
        resultMarkdown:
          "### Run skipped\n\nThe project reached this routine's daily spending cap (**$3.00/day**; **$3.12** already spent on Nov 19), so CawCo skipped the scheduled 09:00 run without starting a session.",
      },
      {
        id: "run-mt-2",
        startedAt: MOCK_NOW - 84 * HOUR_MS,
        durationMs: 96_000,
        trigger: "manual",
        outcome: "delivered",
        attribution: "model",
        costDollars: 0.26,
        turns: 6,
        oneLine: "4 open PRs reviewed · flagged flaky Playwright test on #412",
        resultMarkdown:
          "### Manual PR triage — 18 Nov\n\nFlagged flaky timeout in `tests/checkout.spec.ts` on PR **#412**.",
      },
    ],
  },
  {
    id: "rtn-changelog-draft",
    name: "Post-merge changelog draft",
    summary:
      "Appends a user-facing release note entry whenever a pull request merges to main.",
    kind: "work",
    status: "active",
    statusReason: null,
    instructions:
      "Read the merged PR diff and commit message. If the change is user-facing, append one concise bullet under Unreleased in CHANGELOG.md and propose a GitHub comment confirming the wording. Skip internal refactors and lockfile-only bumps.",
    schedule: {
      cadence: "events",
      rhythm: "On GitHub PR merged",
      time: "09:00",
      weekday: "Mon",
      timezone: LOCAL_ZONE,
      nextAt: null,
      eventSummary: "GitHub · pull_request.closed · branch: main",
    },
    eventTriggers: [
      {
        id: "rule-gh-pr",
        service: "github",
        eventKind: "pull_request.closed",
        filters: ["branch: main", "merged: true"],
      },
    ],
    executor: {
      mode: "delegate",
      delegateType: "Claude Code",
      label: "Fresh delegate · Claude Code",
    },
    origin: {
      by: "owner",
      kept: true,
    },
    limits: {
      maxTurns: 8,
      maxMinutes: 4,
      maxDollars: 0.4,
      spentTodayDollars: 0.11,
      spentWeekDollars: 0.48,
      runsWeek: 6,
    },
    runs: [
      {
        id: "run-cd-3",
        startedAt: MOCK_NOW - 3 * HOUR_MS,
        durationMs: 48_000,
        trigger: "event",
        triggerDetail: "GitHub PR #418 merged to main",
        outcome: "delivered",
        attribution: "model",
        costDollars: 0.11,
        turns: 4,
        proposedActionIds: ["act-gh-comment"],
        oneLine: "Added v2.4.0 note for faster cold reconnects (PR #418)",
        resultMarkdown:
          "### Changelog entry drafted\n\nAppended under **Improved** in `CHANGELOG.md`:\n\n> Reconnecting after a network drop now restores open session panes in a single frame without clearing unsent drafts (#418).\n\nPosted confirmation comment on PR **#418**.",
        session: {
          id: "ses-cd-3",
          title: "Changelog draft · PR #418",
          harness: "Claude Code",
          model: "claude-sonnet-4-6",
          place: "/home/bewinxed/code/cawco-cloud",
          entries: [
            {
              id: "e1",
              kind: "prompt",
              label: "Triggered by GitHub PR #418",
              timeOffset: "00:00",
              text: "PR #418 merged to main by @sara: 'Keep open panes warm across tailnet reconnects'. Draft a user-facing release note if applicable.",
            },
            {
              id: "e2",
              kind: "tool",
              label: "edit · CHANGELOG.md",
              timeOffset: "00:29",
              text: "Added 1 bullet under ## Unreleased → ### Improved.",
            },
            {
              id: "e3",
              kind: "reply",
              label: "Delegate report",
              timeOffset: "00:48",
              text: "Added release note for PR #418 and commented on the pull request.",
            },
          ],
        },
      },
      {
        id: "run-cd-2",
        startedAt: MOCK_NOW - 19 * HOUR_MS,
        durationMs: 18_000,
        trigger: "event",
        triggerDetail: "GitHub PR #416 merged to main",
        outcome: "nothing-to-report",
        attribution: "model",
        costDollars: 0.04,
        turns: 2,
        oneLine: "Internal lint rule bump — skipped changelog entry",
        resultMarkdown:
          "PR **#416** only adjusted internal Biome formatting scripts. No user-facing release note needed.",
      },
    ],
  },
  {
    id: "rtn-nightly-memory",
    name: "Nightly project memory",
    summary:
      "Distills settled decisions and recurring gotchas from today's sessions into project memory.",
    kind: "work",
    status: "paused",
    statusReason: "Paused by you",
    builtIn: true,
    instructions:
      "Built-in CawCo routine. Reviews sessions ended in the last 24 hours and updates project memory notes with durable conventions and decisions.",
    schedule: {
      cadence: "daily",
      rhythm: "Daily at 23:30",
      time: "23:30",
      weekday: "Mon",
      timezone: LOCAL_ZONE,
      nextAt: null,
    },
    eventTriggers: [],
    executor: {
      mode: "builtin",
      label: "CawCo built-in",
    },
    origin: {
      by: "cawco",
      kept: true,
    },
    limits: {
      maxMinutes: 5,
      runsWeek: 4,
      spentWeekDollars: 0.28,
    },
    runs: [
      {
        id: "run-nm-1",
        startedAt: MOCK_NOW - 2 * DAY_MS,
        durationMs: 27_000,
        trigger: "schedule",
        outcome: "nothing-to-report",
        attribution: "model",
        costDollars: 0.07,
        turns: 2,
        oneLine: "Reviewed 4 sessions · no new conventions to record",
        resultMarkdown:
          "Reviewed **4 sessions** from Nov 19. Everything decided was already captured in `MEMORY.md`.",
      },
    ],
  },
  {
    id: "rtn-stripe-v3",
    name: "Stripe webhook v3 migration",
    summary:
      "Looked for 24 hours of production billing traffic on webhook v3 with zero v2 events.",
    kind: "check",
    status: "finished",
    statusReason: "Met · won't run again",
    instructions:
      "Query production webhook delivery metrics for the past 24 hours. Confirm zero deliveries hit /webhooks/stripe/v2 and all v3 deliveries succeeded.",
    check: {
      statement:
        "All production billing events arrive on the v3 webhook endpoint with zero v2 traffic for 24 hours.",
      method: "model",
      machineName: "obelisk",
      standing: "met",
      lastWords:
        "Zero v2 deliveries in the last 24h; 1,412 v3 events succeeded with HTTP 200.",
      lastWordsBy: "model",
      checkedAt: MOCK_NOW - 2 * DAY_MS,
      metAt: MOCK_NOW - 2 * DAY_MS,
      giveUpAt: null,
      heldTasks: [],
      heldSteps: 0,
    },
    schedule: {
      cadence: "hourly",
      rhythm: "Every 6 hours",
      time: "00:00",
      weekday: "Mon",
      timezone: LOCAL_ZONE,
      nextAt: null,
    },
    eventTriggers: [],
    executor: {
      mode: "delegate",
      delegateType: "Claude Code",
      label: "Fresh delegate · Claude Code",
    },
    origin: {
      by: "owner",
      kept: true,
    },
    limits: {
      maxTurns: 6,
      maxMinutes: 3,
      maxDollars: 0.25,
      runsWeek: 3,
      spentWeekDollars: 0.18,
    },
    runs: [
      {
        id: "run-sv-1",
        startedAt: MOCK_NOW - 2 * DAY_MS,
        durationMs: 19_000,
        trigger: "schedule",
        outcome: "met",
        attribution: "model",
        costDollars: 0.06,
        turns: 2,
        oneLine:
          "Zero v2 deliveries in 24h; 1,412 v3 events succeeded — released tsk-399",
        resultMarkdown:
          "### Fact met\n\n- **`/webhooks/stripe/v2`:** 0 requests in the past 24 hours\n- **`/webhooks/stripe/v3`:** 1,412 requests, 100% HTTP `200 OK`\n\nReleased **tsk-399** (*Remove legacy Stripe v2 handler*) and stopped looking for good.",
      },
    ],
  },
];

export const INITIAL_ACTIONS: ApprovedAction[] = [
  {
    id: "act-slack-digest",
    sentence:
      "Post the Nov 21 morning PR blocker digest to #engineering-releases.",
    service: "slack",
    account: "@cawco-bot",
    exactCall:
      'chat.postMessage(channel: "#engineering-releases", text: "Morning PR digest: #419 and #420 ready; #422 blocked on billing.ts typecheck.")',
    whenLabel: "As soon as approved",
    state: "waiting",
    stateAt: MOCK_NOW - 12 * HOUR_MS,
    routineId: "rtn-morning-triage",
    routineName: "Morning PR triage",
    runId: "run-mt-5",
  },
  {
    id: "act-cf-purge",
    sentence: "Purge docs.cawco.dev edge cache after redirect map deploy.",
    service: "cloudflare",
    account: "ops@cawco.dev",
    exactCall:
      'zones.purge_cache(zone: "docs.cawco.dev", purge_everything: true)',
    whenLabel: "Ran 15h ago",
    state: "unknown",
    stateAt: MOCK_NOW - 15 * HOUR_MS,
    serviceResponse:
      "Connection closed before Cloudflare returned an HTTP status — check the Cloudflare dashboard before retrying.",
    needsLook: true,
    routineId: "rtn-broken-links",
    routineName: "Nightly broken-link sweep",
    runId: "run-bl-3",
  },
  {
    id: "act-gh-release-notes",
    sentence: "Publish draft GitHub release notes for v2.4.0.",
    service: "github",
    account: "@bewinxed",
    exactCall:
      'repos.updateRelease(repo: "cawco/cloud", tag: "v2.4.0", draft: false)',
    whenLabel: "Tomorrow 10:00",
    state: "approved",
    stateAt: MOCK_NOW - 4 * HOUR_MS,
    routineId: "rtn-release-tag",
    routineName: "Release 2.4 tag watch",
    runId: "run-rt-3",
    task: {
      id: "tsk-421",
      title: "Publish v2.4.0 changelog",
      movesTo: "Shipped",
    },
  },
  {
    id: "act-gh-comment",
    sentence: "Comment the drafted changelog bullet on PR #418.",
    service: "github",
    account: "@bewinxed",
    exactCall:
      'issues.createComment(repo: "cawco/cloud", issue_number: 418, body: "Added under Unreleased → Improved in CHANGELOG.md.")',
    whenLabel: "Ran 3h ago",
    state: "ran",
    stateAt: MOCK_NOW - 3 * HOUR_MS,
    serviceResponse: "201 Created — comment #249184412",
    routineId: "rtn-changelog-draft",
    routineName: "Post-merge changelog draft",
    runId: "run-cd-3",
    task: {
      id: "tsk-415",
      title: "Keep open panes warm across reconnects",
      movesTo: "Shipped",
    },
  },
];

export const INITIAL_SOURCES: EventSource[] = [
  {
    id: "src-github",
    service: "github",
    serviceName: "GitHub",
    target: "cawco/cloud",
    delivery: "webhook",
    cadence: "Live webhooks",
    lastReadAt: MOCK_NOW - 3 * HOUR_MS,
    itemsSeen: 12,
    enabled: true,
    error: null,
  },
  {
    id: "src-slack",
    service: "slack",
    serviceName: "Slack",
    target: "#ops-alerts",
    delivery: "poll",
    cadence: "Every 2 minutes",
    lastReadAt: MOCK_NOW - 1 * MINUTE_MS,
    itemsSeen: 0,
    enabled: true,
    error: null,
  },
  {
    id: "src-linear",
    service: "linear",
    serviceName: "Linear",
    target: "Cloud team issues",
    delivery: "poll",
    cadence: "Every 5 minutes",
    lastReadAt: MOCK_NOW - 42 * MINUTE_MS,
    itemsSeen: 0,
    enabled: true,
    error:
      "OAuth token expired (401). Reconnect Linear in Configure › Connections.",
  },
];

export const INITIAL_RULES: EventRule[] = [
  {
    id: "rule-gh-pr",
    service: "github",
    serviceName: "GitHub",
    eventKinds: ["pull_request.closed"],
    filters: ["branch: main", "merged: true"],
    routineId: "rtn-changelog-draft",
    routineName: "Post-merge changelog draft",
    lastDeliveredAt: MOCK_NOW - 3 * HOUR_MS,
    enabled: true,
  },
  {
    id: "rule-gh-release",
    service: "github",
    serviceName: "GitHub",
    eventKinds: ["release.published"],
    filters: ["repo: cawco/cloud"],
    routineId: "rtn-release-tag",
    routineName: "Release 2.4 tag watch",
    lastDeliveredAt: MOCK_NOW - 4 * DAY_MS,
    enabled: true,
  },
  {
    id: "rule-ops-503",
    service: "slack",
    serviceName: "Slack",
    eventKinds: ["message.posted"],
    filters: ["channel: #ops-alerts", 'text: "503"'],
    routineId: "rtn-staging-health",
    routineName: "Staging health check",
    lastDeliveredAt: MOCK_NOW - 2 * DAY_MS,
    enabled: false,
  },
];

export const INITIAL_EVENTS: RecentEvent[] = [
  {
    id: "evt-1",
    at: MOCK_NOW - 3 * HOUR_MS,
    service: "github",
    summary: "PR #418 merged to main by @sara",
    destination: {
      kind: "routine",
      routineId: "rtn-changelog-draft",
      routineName: "Post-merge changelog draft",
    },
  },
  {
    id: "evt-2",
    at: MOCK_NOW - 5 * HOUR_MS,
    service: "github",
    summary: "Issue #425 opened by @mika: 'Export routine run logs as JSON'",
    destination: { kind: "conversation" },
  },
  {
    id: "evt-3",
    at: MOCK_NOW - 9 * HOUR_MS,
    service: "slack",
    summary: "#ops-alerts: 'staging deploy v2.4.0-rc.3 started'",
    destination: { kind: "conversation" },
  },
  {
    id: "evt-4",
    at: MOCK_NOW - 19 * HOUR_MS,
    service: "github",
    summary: "PR #416 merged to main by @bewinxed",
    destination: {
      kind: "routine",
      routineId: "rtn-changelog-draft",
      routineName: "Post-merge changelog draft",
    },
  },
];

/** Relative age from MOCK_NOW (or current time when newer) so prototype timestamps stay consistent. */
export function formatRelAge(at: number, now: number = MOCK_NOW): string {
  const diffSec = Math.max(0, Math.floor((now - at) / 1000));
  if (diffSec < 45) {
    return "just now";
  }
  const mins = Math.floor(diffSec / 60);
  if (mins < 60) {
    return `${mins}m ago`;
  }
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) {
    return `${hrs}h ago`;
  }
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export function formatShortDuration(ms: number): string {
  if (ms <= 0) {
    return "0s";
  }
  const secs = Math.round(ms / 1000);
  if (secs < 60) {
    return `${secs}s`;
  }
  const mins = Math.floor(secs / 60);
  const rem = secs % 60;
  return rem > 0 ? `${mins}m ${rem}s` : `${mins}m`;
}

const SHORT_DAY = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: LOCAL_ZONE,
});

const CLOCK_HM = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: LOCAL_ZONE,
});

const WEEKDAY_SHORT = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  timeZone: LOCAL_ZONE,
});

const EXACT_TIME = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: LOCAL_ZONE,
});

export function formatDay(at: number): string {
  return SHORT_DAY.format(new Date(at));
}

export function formatExactClock(at: number): string {
  return EXACT_TIME.format(new Date(at));
}

export function formatNextClock(at: number, now: number = MOCK_NOW): string {
  const hm = CLOCK_HM.format(new Date(at));
  const nowDay = SHORT_DAY.format(new Date(now));
  const targetDay = SHORT_DAY.format(new Date(at));
  if (nowDay === targetDay) {
    return `Today ${hm}`;
  }
  const tomorrowDay = SHORT_DAY.format(new Date(now + DAY_MS));
  if (tomorrowDay === targetDay) {
    return `Tomorrow ${hm}`;
  }
  return `${WEEKDAY_SHORT.format(new Date(at))} ${hm}`;
}

export function daysUntil(at: number, now: number = MOCK_NOW): number {
  return Math.max(1, Math.ceil((at - now) / DAY_MS));
}

/** Plain-English schedule readback and next run estimate for the Create / Edit form. */
export function describeDraftSchedule(draft: {
  cadence: ScheduleCadence;
  time: string;
  weekday: string;
  cron: string;
  timezone: string;
}): { nextLabel: string; rhythm: string } {
  const tzNote = draft.timezone === LOCAL_ZONE ? "" : ` (${draft.timezone})`;
  switch (draft.cadence) {
    case "hourly":
      return {
        rhythm: `Hourly at :00${tzNote}`,
        nextLabel: "Today 22:00 on your clock",
      };
    case "daily":
      return {
        rhythm: `Daily at ${draft.time || "09:00"}${tzNote}`,
        nextLabel: `Tomorrow ${draft.time || "09:00"} on your clock`,
      };
    case "weekdays":
      return {
        rhythm: `Weekdays at ${draft.time || "09:00"}${tzNote}`,
        nextLabel: `Mon ${draft.time || "09:00"} on your clock`,
      };
    case "weekly":
      return {
        rhythm: `Every ${draft.weekday || "Mon"} at ${draft.time || "09:00"}${tzNote}`,
        nextLabel: `Next ${draft.weekday || "Mon"} ${draft.time || "09:00"} on your clock`,
      };
    case "custom":
      return {
        rhythm: draft.cron.trim()
          ? `Custom (${draft.cron.trim()})${tzNote}`
          : "Custom schedule",
        nextLabel: draft.cron.trim()
          ? "Today 21:30 on your clock"
          : "Enter a 5-field cron expression",
      };
    case "events":
      return {
        rhythm: "Only when a matching event arrives",
        nextLabel: "Waits for matching events",
      };
  }
}

/** Whether a routine currently needs the owner's attention (T1, T7, T14). */
export function routineNeedsAttention(routine: Routine): boolean {
  if (routine.status === "stopped") {
    return true;
  }
  if (routine.origin.by === "session" && !routine.origin.kept) {
    return true;
  }
  const [latest] = routine.runs;
  if (
    routine.status === "active" &&
    latest &&
    (latest.outcome === "failed" || latest.outcome === "could-not-check")
  ) {
    return true;
  }
  return false;
}
