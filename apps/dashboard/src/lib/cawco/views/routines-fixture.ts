/**
 * Cawco-Dev's Routines page as the hub answers it, for the states file of
 * the live page (ViewRoutines.stories.ts): its own routines, the unused
 * skills and servers routine before and after it is turned on, and the
 * reads the page makes, keyed by the path each asks (hub-stand-in `hubAs`).
 */
import { hubRequest } from "@cawco/core/hub-request";
import { DAY_MS, HOUR_MS, MINUTE_MS } from "@cawco/core/time";
import { routinesWords } from "@cawco/core/words/routines";
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
  createdBy: "owner",
  disabledReason: null,
  expiresAt: null,
  keep: true,
  lastSlot: null,
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
  const id = encodeURIComponent(PROJECT.id);
  const path = (request: { path: string }) => request.path;
  return {
    [path(hubRequest("GET /api/routines", { query: { projectId: id } }))]:
      routines,
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
    [path(hubRequest("GET /api/actions", { query: { projectId: id } }))]: {
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

/** Each state of the page the suggestion meets. */
export const STATES = {
  /** Caw suggests the routine under the routines the project has. */
  offered: pageAnswers(OWN, true),
  /** A project with no routine yet: the suggestion is the block's whole body. */
  empty: pageAnswers([], true),
  /** Turned on: a routine like the others, the suggestion gone. */
  on: pageAnswers([TRIM_ON, ...OWN], false),
  /** Monday's run delivered: its row's Last run says so. */
  ran: pageAnswers([TRIM_RAN, ...OWN], false),
} as const;
