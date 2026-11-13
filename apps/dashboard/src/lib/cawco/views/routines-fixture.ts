/**
 * Cawco-Dev's Routines page as the hub answers it, for the states file of
 * the live page (ViewRoutines.stories.ts): its own routines, the unused
 * skills and servers routine before and after it is turned on, and the
 * reads the page makes, keyed by the path each asks (hub-stand-in `hubAs`).
 */
import { hubRequest } from "@cawco/core/hub-request";
import { DAY_MS, HOUR_MS, MINUTE_MS } from "@cawco/core/time";
import { routinesWords } from "@cawco/core/words/routines";
import type { ProjectStarter } from "#lib/cawco/project-tasks.js";
import type { Routine, RoutineRun } from "#lib/cawco/routines/routines-api.js";

export const PROJECT = { id: "70ac3d41", name: "Cawco-Dev" };

const now = Date.now();

/** A schedule's runs over the next week, at `hour` on the weekdays `days` names (0 Sunday). */
function weekOf(hour: number, days: number[]): number[] {
  const runs: number[] = [];
  for (let day = 0; day <= 7; day += 1) {
    const when = new Date(now + day * DAY_MS);
    when.setHours(hour, 0, 0, 0);
    if (when.getTime() > now && days.includes(when.getDay())) {
      runs.push(when.getTime());
    }
  }
  return runs;
}

const run = (
  id: string,
  ago: number,
  minutes: number,
  outcome: RoutineRun["outcome"],
  output: string | null
): RoutineRun => {
  const startedAt = now - ago;
  return {
    attempt: 1,
    endedAt: startedAt + minutes * MINUTE_MS,
    id,
    instanceId: null,
    outcome,
    output,
    reason: null,
    slot: String(startedAt),
    startedAt,
    state: "ended",
    usd: 0.42,
    workItemId: null,
  };
};

const base = {
  budget: null,
  createdAt: now - 30 * DAY_MS,
  createdBy: "owner",
  dailyCapUsd: null,
  delegateType: null,
  disabledReason: null,
  expiresAt: null,
  keep: true,
  lands: "main",
  lastSlot: null,
  madeIn: null,
  madeWhy: null,
  mode: null,
  projectId: PROJECT.id,
  timeZone: "Europe/London",
} as const;

/** The project's own routines. */
const OWN: Routine[] = [
  {
    ...base,
    id: "curator",
    name: "Memory curator",
    cron: "0 6 * * *",
    enabled: true,
    createdBy: "hub",
    target: "curator",
    prompt: "Fold, reshape and archive the project's knowledge files.",
    nextRuns: weekOf(6, [0, 1, 2, 3, 4, 5, 6]),
    nextSlot: weekOf(6, [0, 1, 2, 3, 4, 5, 6])[0] ?? now,
    schedule: {
      cron: "0 6 * * *",
      nextAt: weekOf(6, [0, 1, 2, 3, 4, 5, 6])[0] ?? now,
      timeZone: base.timeZone,
      words: "At 06:00, every day (Europe/London)",
    },
    runs: [
      run(
        "c1",
        5 * HOUR_MS,
        6,
        "delivered",
        "Proposed folding two lines of decisions.md."
      ),
    ],
  },
  {
    ...base,
    id: "check-all",
    name: "Nightly check --all on main",
    cron: "0 2 * * 1-5",
    enabled: true,
    target: "delegate",
    prompt: "Run `bun run check --all` on main and file what fails as tasks.",
    nextRuns: weekOf(2, [1, 2, 3, 4, 5]),
    nextSlot: weekOf(2, [1, 2, 3, 4, 5])[0] ?? now,
    schedule: {
      cron: "0 2 * * 1-5",
      nextAt: weekOf(2, [1, 2, 3, 4, 5])[0] ?? now,
      timeZone: base.timeZone,
      words: "At 02:00, Monday through Friday (Europe/London)",
    },
    runs: [run("n1", 9 * HOUR_MS, 14, "silent", null)],
  },
  {
    ...base,
    id: "github",
    name: "File GitHub items as tasks",
    cron: "*/30 * * * *",
    enabled: false,
    target: "delegate",
    prompt: "File each new GitHub issue on Bewinxed/cawco as a task.",
    nextRuns: [],
    nextSlot: now + HOUR_MS,
    schedule: {
      cron: "*/30 * * * *",
      nextAt: null,
      timeZone: base.timeZone,
      words: "Every 30 minutes (Europe/London)",
    },
    runs: [run("g1", 16 * DAY_MS, 3, "delivered", "Filed #412.")],
  },
];

const TRIM = {
  ...base,
  id: "unused",
  name: routinesWords.trimName,
  cron: "0 9 * * 1",
  createdBy: "hub",
  target: "trim",
  enabled: true,
  prompt:
    "You run the unused skills and servers routine. The hub has compared what sessions called over the last 30 days with each starting set; its findings follow.",
  nextRuns: weekOf(9, [1]),
  nextSlot: weekOf(9, [1])[0] ?? now,
  schedule: {
    cron: "0 9 * * 1",
    nextAt: weekOf(9, [1])[0] ?? now,
    timeZone: base.timeZone,
    words: "At 09:00, only on Monday (Europe/London)",
  },
} as const;

/** The routine turned on: no run yet. */
const TRIM_ON: Routine = { ...TRIM, runs: [] };

/** The routine after Monday's run proposed a trim, and the Monday before found nothing. */
export const TRIM_RAN: Routine = {
  ...TRIM,
  runs: [
    run(
      "u1",
      2 * DAY_MS,
      4,
      "delivered",
      "Proposed unlisting 43 items from Cawco-Dev's starting set and 3 items from the build type's starting set. Each waits on you in Needs you."
    ),
    run(
      "u0",
      9 * DAY_MS,
      1,
      "delivered",
      "Found nothing to unlist: every item in this project's starting sets was called in the last 30 days, kept by you, or already waits on you."
    ),
  ],
};

/** The reads the page makes, answered: `routines` its ledger, `offered` whether Caw suggests the routine. */
const pageAnswers = (
  routines: Routine[],
  offered: boolean
): Record<string, unknown> => {
  const path = (request: { path: string }) => request.path;
  return {
    [path(
      hubRequest("GET /api/routines", { query: { projectId: PROJECT.id } })
    )]: routines,
    [path(
      hubRequest("GET /api/projects/:id/ingress", { path: { id: PROJECT.id } })
    )]: {
      connectorPolls: [],
      github: {
        connection: null,
        polled: false,
        polledAt: null,
        repos: [],
        state: "",
      },
      routes: [],
    },
    [path(
      hubRequest("GET /api/projects/:id/relays", { path: { id: PROJECT.id } })
    )]: [],
    [path(
      hubRequest("GET /api/actions", { query: { projectId: PROJECT.id } })
    )]: {
      actions: [],
    },
    [path(hubRequest("GET /api/connections"))]: { connections: [] },
    [path(
      hubRequest("GET /api/projects/:id/trim-routine", {
        path: { id: PROJECT.id },
      })
    )]: { offered },
  };
};

/** What Cawco-Dev's empty page offers to ask Caw for: the work it repeats, written for it. */
export const STARTERS: ProjectStarter[] = [
  {
    glyph: "bug",
    text: "Every weekday at 07:00, file last night's failed checks on main as tasks",
    reason:
      "Failed checks on main were filed by hand on four mornings this week.",
    sources: [{ kind: "task", ref: "tsk-412" }],
  },
  {
    glyph: "triage",
    text: "When an issue opens on Bewinxed/cawco, sort it into a stage and say why",
    reason:
      "Twelve issues opened this month and waited a day or more to be sorted.",
    sources: [{ kind: "event", ref: "github:Bewinxed/cawco issue.opened" }],
  },
  {
    glyph: "rocket",
    text: "After each release, write its notes from the merged pull requests",
    reason: "The last three releases had their notes written by hand.",
    sources: [{ kind: "commit", ref: "0ce055687" }],
  },
];

/** Each state of the page the suggestion meets. */
export const STATES = {
  /** Caw suggests the routine under the routines the project has. */
  offered: pageAnswers(OWN, true),
  /** A project with no routine yet: the suggestion is the empty state's last chip. */
  empty: pageAnswers([], true),
  /** Turned on: a routine like the others, the suggestion gone. */
  on: pageAnswers([TRIM_ON, ...OWN], false),
  /** Monday's run delivered: its row's Last run says so. */
  ran: pageAnswers([TRIM_RAN, ...OWN], false),
} as const;
