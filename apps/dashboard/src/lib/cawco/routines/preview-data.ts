/**
 * PREVIEW ONLY: a project's routines, event sources and approved actions,
 * as the routines preview draws them. Nothing here reads the hub.
 *
 * A routine and its runs have the shape the hub answers `GET /api/routines`
 * with (routines.ts `RoutineView`, `RoutineRunView`), less what this page
 * never shows: a run's spend, a routine's budget and daily cap. A run's words
 * are what the hub keeps for it: `output`, the result its run set (Caw's
 * `routine_result`, or a delegate's `finish_item` summary); `reason`, why it
 * failed or was skipped; `outcome`, silent when it answered `NO_REPLY`.
 *
 * One field is the preview's own: `trigger`, the words for the event route
 * that fires an event routine. The hub has no read of a project's event
 * routes yet; this line needs one.
 *
 * "cockpit" holds the full set; every other project holds nothing, for the
 * empty page's starters.
 */
import type { Starter } from "#lib/cawco/project-tasks.js";

/** How a run ended (routines.ts `RoutineOutcome`). */
export type RoutineOutcome = "silent" | "delivered" | "failed" | "cancelled";
/** Where a run is (routines.ts `RoutineRunState`). */
export type RoutineRunState =
  "queued" | "starting" | "running" | "ended" | "skipped";

/** One run, as the hub answers it (times in ms). */
export interface RoutineRun {
  attempt: number;
  endedAt: number | null;
  id: string;
  outcome: RoutineOutcome | null;
  output: string | null;
  reason: string | null;
  slot: string;
  startedAt: number;
  state: RoutineRunState;
  workItemId: string | null;
}

/** A routine, as the hub answers it (times in ms), with its newest runs. */
export interface Routine {
  createdBy: string;
  cron: string;
  disabledReason: string | null;
  enabled: boolean;
  /** When an agent's routine turns itself off unless kept; null for the owner's. */
  expiresAt: number | null;
  id: string;
  keep: boolean;
  lastSlot: number | null;
  name: string;
  nextSlot: number;
  projectId: string | null;
  prompt: string;
  runs: RoutineRun[];
  target: "delegate" | "lead";
  threadId: string | null;
  timeZone: string;
  /** PREVIEW: what fires an event routine, in words; null for a schedule's. */
  trigger: string | null;
}

export type Service = "github" | "linear" | "slack" | "gmail";

export interface EventRoute {
  filter: string | null;
  id: string;
  kinds: string[];
  routine: string;
  source: Service;
}

export interface Poll {
  every: string;
  id: string;
  last: { at: number; ok: true } | { at: number; error: string; ok: false };
  service: Service;
  what: string;
}

export interface ApprovedAction {
  decided: { at: number; kind: "approved" | "denied" } | null;
  id: string;
  outcome: { at: number; kind: "ran" | "failed"; result: string } | null;
  routine: string;
  service: Service;
  what: string;
}

export interface RoutinesPage {
  actions: ApprovedAction[];
  polls: Poll[];
  relay: { state: "live" | "off" };
  routes: EventRoute[];
  routines: Routine[];
}

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** The reader's own zone: most routines read in it, so their zone stays unsaid. */
const HERE = Intl.DateTimeFormat().resolvedOptions().timeZone;
/** The one routine kept in another zone: its zone shows as a chip. */
const AWAY = HERE === "America/New_York" ? "Europe/London" : "America/New_York";

/** `hh:mm` on the day `days` from today, in `zone`, as a time. */
function at(days: number, hh: number, mm = 0, zone = HERE): number {
  const now = new Date();
  const day = new Date(now.getTime() + days * DAY);
  // The wall time in `zone` that day, found by the zone's offset then.
  const guess = Date.UTC(
    day.getUTCFullYear(),
    day.getUTCMonth(),
    day.getUTCDate(),
    hh,
    mm
  );
  const offset = offsetOf(zone, guess);
  return guess - offset;
}

/** `zone`'s offset from UTC at `when`, in ms. */
function offsetOf(zone: string, when: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(when);
  const get = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value);
  const wall = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute")
  );
  return wall - Math.floor(when / MIN) * MIN;
}

/** The weekday `days` from today in `zone` (0 Sunday). */
const weekdayIn = (days: number, zone = HERE) =>
  ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
    new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      weekday: "short",
    }).format(Date.now() + days * DAY)
  );

/** The nearest past (`step` -1) or next (`step` 1) day, from today, whose weekday `ok` takes. */
function dayWhere(
  ok: (weekday: number) => boolean,
  step: 1 | -1,
  from = 0,
  zone = HERE
) {
  let days = from;
  while (!ok(weekdayIn(days, zone))) {
    days += step;
  }
  return days;
}

const weekday = (day: number) => day >= 1 && day <= 5;

function run(
  id: string,
  startedAt: number,
  ended: Pick<RoutineRun, "outcome" | "output" | "reason">,
  workItemId: string | null = null
): RoutineRun {
  return {
    id,
    slot: new Date(startedAt).toISOString(),
    attempt: 1,
    state: "ended",
    startedAt,
    endedAt: startedAt + 4 * MIN,
    workItemId,
    ...ended,
  };
}

function routinesOf(projectId: string): Routine[] {
  const now = Date.now();
  // Triage: weekdays 09:00 here. Its last three weekdays' runs.
  const t0 = dayWhere(weekday, -1, new Date().getHours() >= 9 ? 0 : -1);
  const t1 = dayWhere(weekday, -1, t0 - 1);
  const t2 = dayWhere(weekday, -1, t1 - 1);
  const tNext = dayWhere(weekday, 1, t0 + 1);
  // The New York report: Mondays 09:00 there.
  const monday = (day: number) => day === 1;
  const nyLast = dayWhere(monday, -1, 0, AWAY);
  const nyPrev = nyLast - 7;
  const nyNext = dayWhere(monday, 1, nyLast + 1, AWAY);
  // The changelog: nightly 23:30 here.
  const c0 =
    new Date().getHours() * 60 + new Date().getMinutes() >= 23 * 60 + 30
      ? 0
      : -1;

  const base = {
    projectId,
    createdBy: "owner",
    disabledReason: null,
    enabled: true,
    expiresAt: null,
    keep: false,
    trigger: null,
  };
  return [
    {
      ...base,
      id: "rt-triage",
      name: "Triage new issues",
      cron: "0 9 * * 1-5",
      timeZone: HERE,
      target: "lead",
      threadId: "th-triage",
      prompt:
        "Read the issues opened since the last run. File a task in Ready for each real one, label duplicates with a link to the original, and close nothing.",
      lastSlot: at(t0, 9),
      nextSlot: at(tNext, 9),
      runs: [
        run("r-t3", at(t0, 9), {
          outcome: "delivered",
          output:
            "Filed 3 tasks from 5 new issues: Retry webhook deliveries on 5xx, Relay health check in the smoke suite, and Label duplicates from the triage run. #431 and #433 repeat #412; both are labelled duplicate with a link to it.",
          reason: null,
        }),
        run("r-t2", at(t1, 9), {
          outcome: "silent",
          output: null,
          reason: null,
        }),
        run("r-t1", at(t2, 9), {
          outcome: "delivered",
          output: "Filed 1 task: Move the changelog to one file per release.",
          reason: null,
        }),
      ],
    },
    {
      ...base,
      id: "rt-smoke",
      name: "Smoke run on merge",
      // An event routine's schedule never comes round: its route fires it.
      cron: "0 0 1 1 *",
      timeZone: HERE,
      target: "delegate",
      threadId: "th-smoke",
      trigger: "a pull request merges to main",
      prompt:
        "Run the smoke suite against main. File a task in Ready for each red check, naming the pull request that merged.",
      lastSlot: null,
      nextSlot: at(365, 0),
      runs: [
        run(
          "r-s3",
          now - 5 * HOUR,
          {
            outcome: "failed",
            output: null,
            reason:
              "Check `bun run smoke` failed: 2 of 41 checks red (webhook-retry, relay-health) after #436 merged",
          },
          "wi-smoke-3"
        ),
        run(
          "r-s2",
          now - DAY - 3 * HOUR,
          {
            outcome: "delivered",
            output: "41 of 41 checks passed on main after #434.",
            reason: null,
          },
          "wi-smoke-2"
        ),
        run(
          "r-s1",
          now - 2 * DAY - 6 * HOUR,
          {
            outcome: "delivered",
            output: "41 of 41 checks passed on main after #431.",
            reason: null,
          },
          "wi-smoke-1"
        ),
      ],
    },
    {
      ...base,
      id: "rt-changelog",
      name: "Nightly changelog",
      cron: "30 23 * * *",
      timeZone: HERE,
      target: "delegate",
      threadId: "th-changelog",
      // Caw made it: it turns itself off in three days unless kept.
      createdBy: "caw",
      expiresAt: now + 3 * DAY,
      prompt:
        "Write the day's merged pull requests into CHANGELOG.md under today's date, one line each, and open a pull request with it.",
      lastSlot: at(c0, 23, 30),
      nextSlot: at(c0 + 1, 23, 30),
      runs: [
        run(
          "r-c3",
          at(c0, 23, 30),
          {
            outcome: "delivered",
            output:
              "Wrote 4 merged pull requests into CHANGELOG.md; opened #437.",
            reason: null,
          },
          "wi-changelog-3"
        ),
        run(
          "r-c2",
          at(c0 - 1, 23, 30),
          { outcome: "silent", output: null, reason: null },
          "wi-changelog-2"
        ),
        run(
          "r-c1",
          at(c0 - 2, 23, 30),
          {
            outcome: "delivered",
            output:
              "Wrote 2 merged pull requests into CHANGELOG.md; opened #432.",
            reason: null,
          },
          "wi-changelog-1"
        ),
      ],
    },
    {
      ...base,
      id: "rt-weekly-us",
      name: "Weekly summary for the US team",
      cron: "0 9 * * 1",
      timeZone: AWAY,
      target: "lead",
      threadId: "th-weekly-us",
      prompt:
        "Sum up last week for the team in New York: what landed, what is in Review, and what waits on them. Keep it to five lines.",
      lastSlot: at(nyLast, 9, 0, AWAY),
      nextSlot: at(nyNext, 9, 0, AWAY),
      runs: [
        run("r-w2", at(nyLast, 9, 0, AWAY), {
          outcome: "delivered",
          output:
            "Landed: Effect 4.2, Linear issues read through the connection. In Review: the beta note. Waiting on you: the beta note's wording.",
          reason: null,
        }),
        run("r-w1", at(nyPrev, 9, 0, AWAY), {
          outcome: "delivered",
          output:
            "Landed: the relay on bewinxed-mbp. Nothing waits on the team.",
          reason: null,
        }),
      ],
    },
    {
      ...base,
      id: "rt-deps",
      name: "Weekly dependency bump",
      cron: "0 10 * * 1",
      timeZone: HERE,
      target: "delegate",
      threadId: "th-deps",
      enabled: false,
      prompt:
        "Bump the dependencies one minor version at a time, run the checks after each, and open one pull request with every bump that passed.",
      lastSlot: at(dayWhere(monday, -1), 10),
      nextSlot: at(dayWhere(monday, 1, 1), 10),
      runs: [
        run(
          "r-d1",
          at(dayWhere(monday, -1), 10),
          {
            outcome: "delivered",
            output: "Bumped 4 packages; opened #422 with all four.",
            reason: null,
          },
          "wi-deps-1"
        ),
      ],
    },
  ];
}

function sourcesOf(): Pick<RoutinesPage, "polls" | "relay" | "routes"> {
  const now = Date.now();
  return {
    routes: [
      {
        id: "ev-merged",
        source: "github",
        kinds: ["pull_request.closed"],
        filter: "merged into main",
        routine: "Smoke run on merge",
      },
      {
        id: "ev-issues",
        source: "github",
        kinds: ["issues.opened", "issues.reopened"],
        filter: null,
        routine: "Triage new issues",
      },
    ],
    polls: [
      {
        id: "poll-github",
        service: "github",
        what: "bewinxed/cockpit",
        every: "On push",
        last: { ok: true, at: now - 2 * MIN },
      },
      {
        id: "poll-linear",
        service: "linear",
        what: "Team CCK",
        every: "Every 10 min",
        last: { ok: true, at: now - 6 * MIN },
      },
    ],
    relay: { state: "live" },
  };
}

function actionsOf(): ApprovedAction[] {
  const now = Date.now();
  return [
    {
      id: "aa-4",
      what: "Post the beta note to #general",
      service: "slack",
      routine: "Nightly changelog",
      decided: null,
      outcome: null,
    },
    {
      id: "aa-3",
      what: "Post the release notes to #releases",
      service: "slack",
      routine: "Nightly changelog",
      decided: { kind: "approved", at: now - DAY - HOUR },
      outcome: {
        kind: "ran",
        at: now - DAY - HOUR,
        result: "Posted to #releases",
      },
    },
    {
      id: "aa-2",
      what: "Email the weekly summary to the US team",
      service: "gmail",
      routine: "Weekly summary for the US team",
      decided: { kind: "approved", at: now - 2 * DAY },
      outcome: {
        kind: "failed",
        at: now - 2 * DAY,
        result:
          "Gmail answered 401: the connection had expired. Nothing was sent.",
      },
    },
    {
      id: "aa-1",
      what: "Close 2 issues as duplicates of #412",
      service: "github",
      routine: "Triage new issues",
      decided: { kind: "denied", at: now - 3 * DAY },
      outcome: null,
    },
  ];
}

/** What the routines page holds for a project: everything for cockpit, nothing elsewhere. */
export function routinesPageOf(project: {
  id: string;
  name: string;
}): RoutinesPage {
  if (project.name !== "cockpit") {
    return {
      routines: [],
      routes: [],
      polls: [],
      relay: { state: "off" },
      actions: [],
    };
  }
  return {
    routines: routinesOf(project.id),
    ...sourcesOf(),
    actions: actionsOf(),
  };
}

/**
 * What an empty Routines page offers to start (The Empty Starts Work Rule),
 * in the hub's starter shape (stages.ts `Starter`). PREVIEW: written here;
 * landing puts them beside each template's board starters in stages.ts.
 */
export function routineStartersOf(template: string | null): Starter[] {
  if (template === "code") {
    return [
      {
        glyph: "triage",
        text: "Every weekday at 09:00, triage new issues into Ready",
      },
      { glyph: "bug", text: "When a pull request merges, run the smoke tests" },
      {
        glyph: "refresh",
        text: "Every Monday, bump dependencies and open one pull request",
      },
      {
        glyph: "brief",
        text: "Every evening, write the day's merges into the changelog",
      },
    ];
  }
  return [
    { glyph: "routine", text: "Suggest routines that fit this project" },
    {
      glyph: "brief",
      text: "Every morning at 08:30, sum up yesterday's sessions",
    },
    {
      glyph: "calendar",
      text: "Every Friday at 16:00, write up the week's work",
    },
    { glyph: "search", text: "Every Monday, list what changed in the folder" },
  ];
}
