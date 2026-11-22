import { DAY_MS, HOUR_MS, MINUTE_MS } from "@cawco/core/time";
import type { Machine } from "#lib/cawco/stores/board.svelte.js";

type RoutineStatus = "active" | "running" | "paused" | "stopped" | "finished";

export type ScheduleUnit = "minute" | "hour" | "day" | "weekday" | "week";

export type RunOutcome =
  | "delivered"
  | "nothing-to-report"
  | "met"
  | "not-yet"
  | "could-not-check"
  | "failed"
  | "skipped"
  | "running";

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

/**
 * What a run found about the fact its routine answers, where the run's own
 * outcome doesn't say it: a sweep that delivered a list of broken links found
 * the fact untrue.
 */
export type FactAnswer = "yes" | "no" | "unknown";

export interface RoutineRun {
  answer?: FactAnswer;
  commandStdout?: string;
  id: string;
  /** One plain sentence of what the run did or found. */
  oneLine: string;
  outcome: RunOutcome;
  resultMarkdown: string;
  session?: RunTranscript;
  startedAt: number;
}

/** What a routine looks for: the statement that holds work until it is true. */
interface RoutineCheck {
  command?: string;
  giveUpAt: number | null;
  heldTasks: string[];
  metAt: number | null;
  method: "model" | "command";
  statement: string;
}

interface RoutineTiming {
  every: number;
  nextAt: number | null;
  rhythm: string;
  time: string;
  timezone: string;
  unit: ScheduleUnit;
  weekday: string;
}

/**
 * What the project gets from a routine, in the person's words: a fact it
 * depends on, answered by each run, or what each run delivers.
 */
interface RoutineOutcome {
  kind: "fact" | "delivery";
  says: string;
}

export interface Routine {
  builtIn?: boolean;
  check?: RoutineCheck;
  guardrail?: string;
  id: string;
  instructions: string;
  name: string;
  outcome: RoutineOutcome;
  runningStep?: string;
  runs: RoutineRun[];
  schedule: RoutineTiming;
  status: RoutineStatus;
  statusReason: string | null;
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

const jqFailureStdout = [
  '$ curl -sf --max-time 15 https://staging.cawco.dev/health | jq -e \'.status == "ok" and .migrations == "head"\'',
  "sh: 1: jq: command not found",
  "",
  "Process exited with code 127.",
].join("\n");

const makeJqFailureRun = (id: string, minutesAgo: number): RoutineRun => ({
  commandStdout: jqFailureStdout,
  id,
  oneLine: "The check can't run because jq is missing on obelisk",
  outcome: "could-not-check",
  resultMarkdown:
    "The check command could not run because `jq` is not installed in the sandbox on `obelisk`. Staging itself was not reached.",
  startedAt: MOCK_NOW - minutesAgo * MINUTE_MS,
});

export const INITIAL_ROUTINES: Routine[] = [
  {
    check: {
      command:
        'curl -sf --max-time 15 https://staging.cawco.dev/health | jq -e \'.status == "ok" and .migrations == "head"\'',
      giveUpAt: MOCK_NOW + 4 * DAY_MS,
      heldTasks: [
        "Promote the v2.4.0 build to production",
        "Publish the v2.4.0 changelog",
      ],
      metAt: null,
      method: "command",
      statement:
        "Staging answers its health check with status ok and every migration applied.",
    },
    id: "rtn-staging-health",
    instructions:
      "Confirm the staging deployment is healthy and all database migrations are applied before v2.4.0 is promoted.",
    name: "Staging health check",
    outcome: { kind: "fact", says: "Staging is healthy" },
    runs: [
      makeJqFailureRun("run-sh-4", 18),
      makeJqFailureRun("run-sh-3", 33),
      makeJqFailureRun("run-sh-2", 48),
      {
        commandStdout:
          '{"status":"ok","version":"2.4.0-rc.3","migrations":"0041_pending"}\n\nProcess exited with code 1.',
        id: "run-sh-1",
        oneLine: "Staging is up, but migration 0041 hasn't been applied yet",
        outcome: "not-yet",
        resultMarkdown:
          "Staging responded `200 OK`, but `migrations` was `0041_pending` rather than `head`.",
        startedAt: MOCK_NOW - 3 * HOUR_MS,
      },
    ],
    schedule: {
      every: 15,
      nextAt: null,
      rhythm: "Every 15 minutes",
      time: "00:00",
      timezone: LOCAL_ZONE,
      unit: "minute",
      weekday: "Mon",
    },
    status: "stopped",
    statusReason: "Stopped after three failed checks",
  },
  {
    id: "rtn-broken-links",
    instructions:
      "Crawl every page listed in docs.cawco.dev/sitemap.xml, check that internal links and anchors resolve, and file a task in Ready for any 404 or redirect loop.",
    name: "Nightly broken-link sweep",
    outcome: { kind: "fact", says: "Docs have no broken links" },
    runs: [
      {
        id: "run-bl-3",
        oneLine: "The sweep timed out twice reaching the docs sitemap",
        outcome: "failed",
        resultMarkdown:
          "Both attempts timed out waiting for `https://docs.cawco.dev/sitemap.xml` after 30 seconds.\n\n- **First try:** 03:00 UTC, timed out after 30s\n- **Automatic retry:** 03:02 UTC, timed out after 30s\n\nNo tasks were filed.",
        session: makeSession("ses-bl-3", "Nightly broken-link sweep", [
          {
            id: "e1",
            kind: "prompt",
            label: "Routine instructions",
            text: "Crawl every page listed in docs.cawco.dev/sitemap.xml, check that internal links and anchors resolve, and file a task for any 404.",
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
            text: "Could not reach docs.cawco.dev/sitemap.xml after retrying. Marking the run failed without filing false broken-link tasks.",
            timeOffset: "01:02",
          },
        ]),
        startedAt: MOCK_NOW - 15 * HOUR_MS,
      },
      {
        id: "run-bl-2",
        answer: "no",
        oneLine:
          "Found 2 broken links in the self-hosting guide and filed a task",
        outcome: "delivered",
        resultMarkdown:
          "Crawled **84 pages** from `docs.cawco.dev/sitemap.xml`.\n\n- **82 pages** returned `200 OK` with valid anchors.\n- **2 broken links** on `/guides/self-hosting`:\n  - `/docs/relay-setup` → `404` (moved to `/guides/relay`)\n  - `/api/tokens#scopes` → missing `#scopes` heading\n\nFiled *Fix two broken links in the self-hosting guide* in Ready.",
        session: makeSession("ses-bl-2", "Nightly broken-link sweep", [
          {
            id: "e1",
            kind: "prompt",
            label: "Routine instructions",
            text: "Crawl every page listed in docs.cawco.dev/sitemap.xml and file a task for any 404.",
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
            label:
              "create_task · Fix two broken links in the self-hosting guide",
            text: "Created the task in Ready.",
            timeOffset: "00:34",
          },
          {
            id: "e4",
            kind: "reply",
            label: "Session report",
            text: "Found 2 broken links on /guides/self-hosting and filed a task in Ready.",
            timeOffset: "00:44",
          },
        ]),
        startedAt: MOCK_NOW - 39 * HOUR_MS,
      },
      {
        id: "run-bl-1",
        answer: "yes",
        oneLine: "All 84 pages loaded and every link worked",
        outcome: "nothing-to-report",
        resultMarkdown:
          "All **84 pages** and **410 internal links** resolved with `200 OK`. Nothing to report.",
        startedAt: MOCK_NOW - 63 * HOUR_MS,
      },
    ],
    schedule: {
      every: 1,
      nextAt: MOCK_NOW + 8 * HOUR_MS + 50 * MINUTE_MS,
      rhythm: "Every day at 03:00 UTC",
      time: "03:00",
      timezone: "UTC",
      unit: "day",
      weekday: "Mon",
    },
    status: "active",
    statusReason: null,
  },
  {
    check: {
      giveUpAt: MOCK_NOW + 7 * DAY_MS,
      heldTasks: ["Tell self-hosters about the v2.4.0 upgrade"],
      metAt: null,
      method: "model",
      statement:
        "Release v2.4.0 is published on github.com/cawco/cloud with signed Linux and macOS downloads.",
    },
    id: "rtn-release-tag",
    instructions:
      "Look at GitHub Releases on cawco/cloud. Confirm v2.4.0 is published (not a draft or prerelease) and has signed Linux and macOS downloads plus checksums.",
    name: "Release 2.4 watch",
    outcome: { kind: "fact", says: "Release 2.4 is out" },
    runningStep: "Checking the release downloads on github.com/cawco/cloud",
    runs: [
      {
        id: "run-rt-4",
        oneLine: "Checking the release downloads on github.com/cawco/cloud",
        outcome: "running",
        resultMarkdown:
          "Still running on `obelisk`: checking the published downloads for `v2.4.0`.",
        session: makeSession("ses-rt-4", "Release 2.4 watch", [
          {
            id: "e1",
            kind: "prompt",
            label: "What it looks for",
            text: "Release v2.4.0 is published on github.com/cawco/cloud with signed Linux and macOS downloads.",
            timeOffset: "00:00",
          },
          {
            id: "e2",
            kind: "tool",
            label: "gh release list --repo cawco/cloud --limit 5",
            text: "Running…",
            timeOffset: "00:08",
          },
        ]),
        startedAt: MOCK_NOW - 74_000,
      },
      {
        id: "run-rt-3",
        oneLine: "v2.4.0 is still a draft",
        outcome: "not-yet",
        resultMarkdown:
          "- **Newest published release:** `v2.4.0-rc.3` (prerelease, published 5 hours ago)\n- **Draft found:** `v2.4.0`, missing its signed macOS download\n\nThe upgrade notice keeps waiting until the final release is published with both signed downloads.",
        session: makeSession("ses-rt-3", "Release 2.4 watch", [
          {
            id: "e1",
            kind: "prompt",
            label: "What it looks for",
            text: "Release v2.4.0 is published on github.com/cawco/cloud with signed Linux and macOS downloads.",
            timeOffset: "00:00",
          },
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
            text: "Not yet: v2.4.0-rc.3 is the newest published release, and v2.4.0 is still a draft.",
            timeOffset: "00:14",
          },
        ]),
        startedAt: MOCK_NOW - 60 * MINUTE_MS,
      },
      {
        id: "run-rt-2",
        oneLine: "Only the third release candidate is published",
        outcome: "not-yet",
        resultMarkdown:
          "Checked `cawco/cloud` releases. Only `v2.4.0-rc.3` is published; there is no final `v2.4.0` yet.",
        startedAt: MOCK_NOW - 2 * HOUR_MS,
      },
    ],
    schedule: {
      every: 1,
      nextAt: MOCK_NOW + 50 * MINUTE_MS,
      rhythm: "Every hour, on the hour",
      time: "00:00",
      timezone: LOCAL_ZONE,
      unit: "hour",
      weekday: "Mon",
    },
    status: "running",
    statusReason: null,
  },
  {
    guardrail: "At least one release pull request is blocked.",
    id: "rtn-morning-triage",
    instructions:
      "List every open pull request in cawco/cloud updated in the past 24 hours. Check CI, review comments and merge conflicts, and write a morning digest of what is ready and what is blocked.",
    name: "Morning PR triage",
    outcome: { kind: "delivery", says: "PRs triaged this morning" },
    runs: [
      {
        id: "run-mt-5",
        oneLine:
          "Reviewed 5 pull requests: 2 are ready to merge and #422 fails its type check",
        outcome: "delivered",
        resultMarkdown:
          "### Morning PR digest, 21 Nov\n\nReviewed **5 open pull requests** in `cawco/cloud`.\n\n#### Ready to merge\n- **#419** `fix(relay): keep reconnect jitter bounded`: CI green, 1 approval\n- **#420** `docs: add systemd socket activation steps`: CI green, no conflicts\n\n#### Needs attention\n- **#422** `feat(billing): prorate mid-cycle seat changes`: `typecheck` fails in `packages/hub/src/billing.ts:148` (`Property 'seatDelta' does not exist`).\n- **#417** `chore: upgrade drizzle-orm`: merge conflict in `bun.lock`.",
        session: makeSession("ses-mt-5", "Morning PR triage, Nov 21", [
          {
            id: "e1",
            kind: "prompt",
            label: "Routine instructions",
            text: "List every open pull request in cawco/cloud updated in the past 24 hours. Check CI, review comments and merge conflicts.",
            timeOffset: "00:00",
          },
          {
            id: "e2",
            kind: "tool",
            label:
              "gh pr list --state open --json number,title,statusCheckRollup",
            text: "Returned 5 open pull requests (#417, #419, #420, #422, #423).",
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
            kind: "reply",
            label: "Final summary",
            text: "Digest written: #419 and #420 are ready to merge, #422 is blocked on its type check, #417 needs a rebase.",
            timeOffset: "02:18",
          },
        ]),
        startedAt: MOCK_NOW - 12 * HOUR_MS,
      },
      {
        id: "run-mt-4",
        oneLine: "Reviewed 3 pull requests: all pass CI",
        outcome: "delivered",
        resultMarkdown:
          "### Morning PR digest, 20 Nov\n\nAll **3 open pull requests** passed CI with no conflicts.",
        startedAt: MOCK_NOW - 36 * HOUR_MS,
      },
      {
        id: "run-mt-2",
        oneLine: "Reviewed 4 pull requests: a Playwright test is flaky on #412",
        outcome: "delivered",
        resultMarkdown:
          "### Morning PR digest, 18 Nov\n\nFlagged a flaky timeout in `tests/checkout.spec.ts` on **#412**.",
        startedAt: MOCK_NOW - 84 * HOUR_MS,
      },
    ],
    schedule: {
      every: 1,
      nextAt: MOCK_NOW + 35 * HOUR_MS + 50 * MINUTE_MS,
      rhythm: "Weekdays at 09:00",
      time: "09:00",
      timezone: LOCAL_ZONE,
      unit: "weekday",
      weekday: "Mon",
    },
    status: "active",
    statusReason: null,
  },
  {
    guardrail: "Skip internal refactors and lockfile-only changes.",
    id: "rtn-changelog-draft",
    instructions:
      "Read the pull requests merged to main today. For each change a user would notice, add one short line under Unreleased in CHANGELOG.md.",
    name: "Changelog draft",
    outcome: { kind: "fact", says: "Changelog has the latest merge" },
    runs: [
      {
        id: "run-cd-3",
        answer: "yes",
        oneLine: "Added the reconnect fix (#418)",
        outcome: "delivered",
        resultMarkdown:
          "Added under **Improved** in `CHANGELOG.md`:\n\n> Reconnecting after a network drop now restores open session panes in one frame without clearing unsent drafts (#418).",
        session: makeSession("ses-cd-3", "Changelog draft, Nov 21", [
          {
            id: "e1",
            kind: "prompt",
            label: "Routine instructions",
            text: "Read the pull requests merged to main today and add a line for each change a user would notice.",
            timeOffset: "00:00",
          },
          {
            id: "e2",
            kind: "tool",
            label: "edit · CHANGELOG.md",
            text: "Added 1 line under ## Unreleased → ### Improved.",
            timeOffset: "00:29",
          },
          {
            id: "e3",
            kind: "reply",
            label: "Session report",
            text: "One user-facing change today (#418); its line is under Unreleased.",
            timeOffset: "00:48",
          },
        ]),
        startedAt: MOCK_NOW - 3 * HOUR_MS,
      },
      {
        id: "run-cd-2",
        answer: "yes",
        oneLine: "Nothing a user would notice was merged",
        outcome: "nothing-to-report",
        resultMarkdown:
          "Two pull requests merged (a lockfile bump and an internal refactor). Neither changes anything a user sees, so CHANGELOG.md is unchanged.",
        startedAt: MOCK_NOW - 27 * HOUR_MS,
      },
    ],
    schedule: {
      every: 1,
      nextAt: MOCK_NOW + 20 * HOUR_MS + 50 * MINUTE_MS,
      rhythm: "Weekdays at 18:00",
      time: "18:00",
      timezone: LOCAL_ZONE,
      unit: "weekday",
      weekday: "Mon",
    },
    status: "active",
    statusReason: null,
  },
  {
    builtIn: true,
    id: "rtn-nightly-memory",
    instructions:
      "Reads the sessions that ended in the last 24 hours and writes lasting decisions and conventions into the project's memory.",
    name: "Nightly project memory",
    outcome: { kind: "delivery", says: "Project memory curated" },
    runs: [
      {
        id: "run-nm-1",
        oneLine: "Read 4 sessions and found nothing new to remember",
        outcome: "nothing-to-report",
        resultMarkdown:
          "Read **4 sessions** from Nov 19. Everything decided in them was already in the project's memory.",
        startedAt: MOCK_NOW - 2 * DAY_MS,
      },
    ],
    schedule: {
      every: 1,
      nextAt: null,
      rhythm: "Every day at 23:30",
      time: "23:30",
      timezone: LOCAL_ZONE,
      unit: "day",
      weekday: "Mon",
    },
    status: "paused",
    statusReason: "Paused by you",
  },
  {
    check: {
      giveUpAt: null,
      heldTasks: [],
      metAt: MOCK_NOW - 2 * DAY_MS,
      method: "model",
      statement:
        "Every production billing event arrives on the v3 webhook, with no v2 traffic for 24 hours.",
    },
    id: "rtn-stripe-v3",
    instructions:
      "Read production webhook deliveries for the past 24 hours. Confirm nothing reached the v2 endpoint and every v3 delivery succeeded.",
    name: "Stripe webhook v3 move",
    outcome: { kind: "fact", says: "Stripe v3 migration complete" },
    runs: [
      {
        id: "run-sv-1",
        oneLine:
          "No v2 deliveries in 24 hours, and all 1,412 v3 events went through",
        outcome: "met",
        resultMarkdown:
          "- **`/webhooks/stripe/v2`:** 0 requests in the past 24 hours\n- **`/webhooks/stripe/v3`:** 1,412 requests, all `200 OK`\n\n*Remove the legacy Stripe v2 handler* went ahead, and this routine finished.",
        startedAt: MOCK_NOW - 2 * DAY_MS,
      },
    ],
    schedule: {
      every: 6,
      nextAt: null,
      rhythm: "Every 6 hours",
      time: "00:00",
      timezone: LOCAL_ZONE,
      unit: "hour",
      weekday: "Mon",
    },
    status: "finished",
    statusReason: null,
  },
];

const AGE_UNITS: [ms: number, one: string][] = [
  [DAY_MS, "day"],
  [HOUR_MS, "hour"],
  [MINUTE_MS, "minute"],
];

/** How long ago, spelled out: "just now", "18 minutes ago", "yesterday". */
export function formatRelAge(at: number, now: number = MOCK_NOW): string {
  const diff = Math.max(0, now - at);
  if (diff < MINUTE_MS) {
    return "just now";
  }
  for (const [ms, one] of AGE_UNITS) {
    const n = Math.floor(diff / ms);
    if (n >= 1) {
      if (one === "day" && n === 1) {
        return "yesterday";
      }
      return `${n} ${one}${n === 1 ? "" : "s"} ago`;
    }
  }
  return "just now";
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

const fmtWeekday = new Intl.DateTimeFormat("en-US", {
  timeZone: LOCAL_ZONE,
  weekday: "long",
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

/** A near time on the person's clock: "today 22:00", "tomorrow 09:00", "Monday 09:00". */
export function formatNextClock(at: number, now: number = MOCK_NOW): string {
  const clock = fmtClockHm.format(new Date(at));
  const day = fmtShortDay.format(new Date(at));
  if (day === fmtShortDay.format(new Date(now))) {
    return `today at ${clock}`;
  }
  if (day === fmtShortDay.format(new Date(now + DAY_MS))) {
    return `tomorrow at ${clock}`;
  }
  return `${fmtWeekday.format(new Date(at))} at ${clock}`;
}
