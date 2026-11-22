/**
 * The cockpit project's routines as the hub would read them on a Sunday
 * morning, for the Routines view's states files: eleven routines under four
 * outcome sentences and two under none. The staging check's run asked a
 * question; the migration check was turned off after failing three slots
 * running; the runes sweeps stopped, their work done; the rest run.
 */
import type { RoutineRunView } from "@cawco/core/routine-kinds";
import type { TaskRoutine } from "@cawco/core/task-views";
import { HOUR_MS, MINUTE_MS } from "@cawco/core/time";
import type { RoutineItem } from "./outcomes";

/** Sunday 22 November 2026, 09:40 in London. */
export const NOW = Date.UTC(2026, 10, 22, 9, 40);
const run = (
  id: string,
  ago: number,
  took: number,
  output: string | null,
  rest: Partial<RoutineRunView> = {}
): RoutineRunView => ({
  attempt: 1,
  endedAt: NOW - ago + took,
  id,
  instanceId: `ses-${id}`,
  outcome: "delivered",
  output,
  reason: null,
  slot: new Date(NOW - ago).toISOString(),
  startedAt: NOW - ago,
  state: "ended",
  usd: 0.18,
  verdict: "keep",
  workItemId: `wi-${id}`,
  ...rest,
});

const routine = (
  id: string,
  words: string,
  nextIn: number | null,
  lastRun: RoutineRunView | null,
  rest: Partial<TaskRoutine> = {}
): TaskRoutine => ({
  deadline: null,
  disabledReason: null,
  enabled: true,
  id,
  lastRun,
  needs: null,
  problem: null,
  schedule: {
    cron: "",
    nextAt: nextIn === null ? null : NOW + nextIn,
    timeZone: "Europe/London",
    words,
  },
  stop: null,
  target: "delegate",
  ...rest,
});

const PRS = "Make sure every pull request gets a reply";
const STAGING = "Keep staging up";
const MIGRATIONS = "Check every migration on a copy of real data";
const RUNES = "Finish moving the dashboard to runes";

export const ROUTINES: RoutineItem[] = [
  {
    id: "tsk-412",
    title: "PR sweep",
    outcome: PRS,
    done: false,
    routine: routine(
      "rtn-pr-sweep",
      "Every 2 hours",
      80 * MINUTE_MS,
      run(
        "run-pr-0938",
        40 * MINUTE_MS,
        4 * MINUTE_MS,
        "#412 and #415 have no reply; an agent is answering #412."
      )
    ),
  },
  {
    id: "tsk-388",
    title: "Nightly staging check",
    outcome: STAGING,
    done: false,
    routine: routine(
      "rtn-staging",
      "Every night at 03:00",
      null,
      run(
        "run-staging-0300",
        6 * HOUR_MS + 40 * MINUTE_MS,
        3 * MINUTE_MS,
        "Staging answered 502 twice, at 03:01 and 03:03. The deploy from #409 is still rolling out.",
        { verdict: "ask" }
      ),
      {
        enabled: false,
        disabledReason: "Waiting for your answer",
        needs: {
          why: "asked",
          said: "Restart staging now, or wait for the deploy to finish?",
        },
      }
    ),
  },
  {
    id: "tsk-391",
    title: "Uptime ping",
    outcome: STAGING,
    done: false,
    routine: routine(
      "rtn-uptime",
      "Every 15 minutes",
      5 * MINUTE_MS,
      run(
        "run-uptime-0930",
        10 * MINUTE_MS,
        MINUTE_MS,
        "Staging answered in 180 ms."
      ),
      { target: "command" }
    ),
  },
  {
    id: "tsk-397",
    title: "Migration check",
    outcome: MIGRATIONS,
    done: false,
    routine: routine(
      "rtn-migrations",
      "After each merge to main",
      null,
      run("run-mig-0812", 88 * MINUTE_MS, 2 * MINUTE_MS, null, {
        outcome: "failed",
        reason:
          "Could not download the database copy: nixbox refused the connection.",
        verdict: null,
      }),
      {
        enabled: false,
        disabledReason: "Turned off after three failed runs in a row",
        needs: {
          why: "failing",
          said: "Could not download the database copy: nixbox refused the connection.",
        },
      }
    ),
  },
  {
    id: "tsk-399",
    title: "Schema drift check",
    outcome: MIGRATIONS,
    done: false,
    routine: routine(
      "rtn-drift",
      "Every day at 06:00",
      20 * HOUR_MS + 20 * MINUTE_MS,
      run(
        "run-drift-0600",
        3 * HOUR_MS + 40 * MINUTE_MS,
        2 * MINUTE_MS,
        "The hub's schema matches its migrations."
      )
    ),
  },
  {
    id: "tsk-415",
    title: "Dependency updates",
    outcome: PRS,
    done: false,
    routine: routine(
      "rtn-deps",
      "Every weekday at 08:00",
      22 * HOUR_MS + 20 * MINUTE_MS,
      run(
        "run-deps-0800",
        100 * MINUTE_MS,
        6 * MINUTE_MS,
        "Merged three Dependabot pull requests; none are left open."
      )
    ),
  },
  {
    id: "tsk-417",
    title: "Stale branch clean-up",
    outcome: PRS,
    done: false,
    routine: routine(
      "rtn-branches",
      "Every Sunday at 10:00",
      20 * MINUTE_MS,
      run(
        "run-branches-1115",
        7 * 24 * HOUR_MS,
        3 * MINUTE_MS,
        "Deleted 6 merged branches; 2 unmerged ones are older than a month."
      )
    ),
  },
  {
    id: "tsk-361",
    title: "Legacy stores sweep",
    outcome: RUNES,
    done: true,
    routine: routine(
      "rtn-stores",
      "Every day at 07:00",
      null,
      run(
        "run-stores-1119",
        3 * 24 * HOUR_MS,
        5 * MINUTE_MS,
        "No file imports svelte/store any more.",
        { verdict: "stop" }
      ),
      { enabled: false, stop: "No file imports svelte/store." }
    ),
  },
  {
    id: "tsk-362",
    title: "Svelte 4 syntax sweep",
    outcome: RUNES,
    done: true,
    routine: routine(
      "rtn-syntax",
      "Every day at 07:30",
      null,
      run(
        "run-syntax-1120",
        2 * 24 * HOUR_MS,
        7 * MINUTE_MS,
        "No component uses export let or $: any more.",
        { verdict: "stop" }
      ),
      { enabled: false, stop: "No component uses export let or $:." }
    ),
  },
  {
    id: "tsk-301",
    title: "Nightly memory run",
    outcome: null,
    done: false,
    routine: routine(
      "rtn-memory",
      "Every night at 02:00",
      16 * HOUR_MS + 20 * MINUTE_MS,
      run(
        "run-memory-0200",
        7 * HOUR_MS + 40 * MINUTE_MS,
        9 * MINUTE_MS,
        "Kept 4 new notes and withdrew 1 that no longer holds."
      ),
      { target: "curator" }
    ),
  },
  {
    id: "tsk-344",
    title: "Weekly report",
    outcome: null,
    done: false,
    routine: routine(
      "rtn-weekly",
      "Every Monday at 09:00",
      23 * HOUR_MS + 20 * MINUTE_MS,
      run(
        "run-weekly-1116",
        6 * 24 * HOUR_MS + 40 * MINUTE_MS,
        8 * MINUTE_MS,
        "12 tasks landed and 2 pull requests are open."
      )
    ),
  },
];
