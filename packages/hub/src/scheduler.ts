/**
 * THE HUB'S ADMISSION: WHAT IT RUNS WHEN IT IS BEHIND. Work the hub works
 * out again after something moved (the board's publish, a machine's beat,
 * the artifacts waiting, the tool lists, the keep-alive schedule) is not run
 * where it was asked for: it is wanted here, under a key, and run on a turn
 * of its own. On 2026-11-18 the hub's thread fell behind and never came
 * back, because each late beat was worked as it came: ten beats queued were
 * ten beats' work, and work arrived as fast as it was done (a metastable
 * failure, Bronson et al., HotOS 2021: "the true root cause is the
 * sustaining effect"). Here, work waiting is merged, not stacked:
 *
 * - **Latest wins per key.** A job wanted under a key that already waits
 *   replaces it: ten beats from one machine are one beat's work, and the
 *   board's publish asked twenty times is one publish.
 * - **Priority.** A person's (what a screen waits on: the board's publish),
 *   then a machine's (a beat), then background (the artifacts waiting, the
 *   tool lists, the keep-alive wake), each in the order first wanted.
 * - **A budget per turn.** A turn runs jobs until {@link TURN_BUDGET_MS} has
 *   gone, then gives the loop back, so sockets and requests are read between
 *   turns however much waits.
 * - **Background pauses when the loop is late.** The loop's lateness is
 *   sampled every {@link SAMPLE_MS}; past {@link LOOP_BUDGET_MS} background
 *   work waits (merged, by its key) until the loop is back under half that,
 *   and the log says when it paused and resumed, and the hub's minute line
 *   how long it was paused ({@link SchedulerShape.minute}). A background job
 *   that has waited {@link STARVED_MS} runs all the same, one a turn, so a
 *   loop kept late by a person's and machines' work alone still gets its
 *   background done, slowly.
 *
 * It runs on the hub's lifetime (lifetime.ts): its turns and its sampler are
 * the lifetime's named timers, and they stop when it closes.
 */
import { syncSection } from "@cawco/core/loop-watch";

/** Whose wait a job serves, first first. */
export type JobPriority = "person" | "machine" | "background";

const PRIORITIES: readonly JobPriority[] = ["person", "machine", "background"];

/** A job wanted ({@link SchedulerShape.want}). */
export interface Job {
  /** What it is merged under: a later job under the same key replaces it. */
  readonly key: string;
  /** What it is known by in the loop's lines (core loop-watch.ts): no ids, so its runs count together. */
  readonly name: string;
  readonly priority: JobPriority;
  readonly run: () => void;
}

/** What the scheduler did since the last minute line. */
export interface SchedulerMinute {
  /** Jobs that replaced one still waiting under their key. */
  merged: number;
  /** How long background work was paused, in ms. */
  pausedMs: number;
  /** Background jobs waiting now. */
  waiting: number;
}

export interface SchedulerShape {
  /** What it did since the last call; the counts start again. */
  readonly minute: () => SchedulerMinute;
  /** Runs the job waiting under `key` now, if one does: work that must come before what follows it. */
  readonly runNow: (key: string) => void;
  /** Runs `job` on a turn of its own; one waiting under its key is replaced (latest wins). */
  readonly want: (job: Job) => void;
}

/** The timers a scheduler runs on: the hub's lifetime's own. */
export interface SchedulerTimers {
  readonly after: (name: string, ms: number, run: () => void) => unknown;
  readonly every: (name: string, ms: number, run: () => void) => unknown;
}

/** How long one turn runs jobs before it gives the loop back. A fifth of the hub's 250 ms hold budget (hub-loop.ts). */
const TURN_BUDGET_MS = 50;
/** How often the loop's lateness is sampled. */
const SAMPLE_MS = 500;
/** Lateness past which background work pauses: the hub's hold budget (hub-loop.ts `HUB_LATE_MS`). */
const LOOP_BUDGET_MS = 250;
/** A background job that has waited this long runs, paused or not, one a turn. */
const STARVED_MS = 60_000;

interface Waiting extends Job {
  /** When a job under its key first waited: a merge keeps it. */
  readonly since: number;
}

/** A thrown job fails that job alone, said with its stack. */
const jobFailed = (name: string, error: unknown): void => {
  console.error(
    `[hub] the job "${name}" failed, and only it: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`
  );
};

export const makeScheduler = (timers: SchedulerTimers): SchedulerShape => {
  const queues = new Map<JobPriority, Map<string, Waiting>>(
    PRIORITIES.map((priority) => [priority, new Map()])
  );
  let turnOwed = false;
  /** When background work paused; undefined while it runs. */
  let pausedAt: number | undefined;
  /** When the paused time not yet in a minute line began counting. */
  let pausedCounted = 0;
  let pausedMs = 0;
  let merged = 0;

  const queueOf = (priority: JobPriority): Map<string, Waiting> =>
    queues.get(priority) ?? new Map();

  const background = queueOf("background");

  /** The job to run next: a person's, a machine's, then background unless paused, or one starved. */
  const next = (now: number): Waiting | undefined => {
    for (const priority of PRIORITIES) {
      const [first] = queueOf(priority).values();
      if (!first) {
        continue;
      }
      if (
        priority !== "background" ||
        pausedAt === undefined ||
        now - first.since >= STARVED_MS
      ) {
        return first;
      }
    }
    return undefined;
  };

  /**
   * A job, run as a marked section alone (core loop-watch.ts `syncSection`):
   * the minute line counts it once. Named work (`doing`) as well counted it
   * twice, the second time until its turn's stack emptied, so obelisk's
   * minute of 3,494 publishes said 6,986 (2026-11-19).
   */
  const runJob = (job: Waiting): void => {
    queueOf(job.priority).delete(job.key);
    const name = `job: ${job.name}`;
    try {
      syncSection(name, job.run);
    } catch (error) {
      jobFailed(job.name, error);
    }
  };

  const turn = (): void => {
    turnOwed = false;
    const started = performance.now();
    let starvedRan = false;
    for (
      let job = next(Date.now());
      job !== undefined;
      job = next(Date.now())
    ) {
      // One starved background job a turn while paused.
      const starved = job.priority === "background" && pausedAt !== undefined;
      if (starved && starvedRan) {
        break;
      }
      starvedRan ||= starved;
      runJob(job);
      if (performance.now() - started >= TURN_BUDGET_MS) {
        break;
      }
    }
    if (next(Date.now())) {
      owe();
    }
  };

  const owe = (): void => {
    if (turnOwed) {
      return;
    }
    turnOwed = true;
    timers.after("scheduler turn", 0, turn);
  };

  // The loop's lateness: how much later than asked the sampler ran.
  let sampled = performance.now();
  timers.every("loop lateness sampled", SAMPLE_MS, () => {
    const now = performance.now();
    const late = now - sampled - SAMPLE_MS;
    sampled = now;
    if (pausedAt === undefined && late > LOOP_BUDGET_MS) {
      pausedAt = Date.now();
      pausedCounted = pausedAt;
      console.warn(
        `[loop] the hub's loop ran ${Math.round(late)} ms late: background work pauses (${background.size} waiting) until it is back under ${LOOP_BUDGET_MS / 2} ms`
      );
      return;
    }
    if (pausedAt !== undefined && late < LOOP_BUDGET_MS / 2) {
      const resumed = Date.now();
      const paused = resumed - pausedAt;
      pausedMs += resumed - pausedCounted;
      pausedAt = undefined;
      console.info(
        `[loop] the hub's loop is back on time: background work resumes after ${Math.round(paused / 1000)} s paused (${background.size} waiting)`
      );
      if (background.size > 0) {
        owe();
      }
    }
    // A starved job waits for no other wake.
    if (pausedAt !== undefined && background.size > 0) {
      owe();
    }
  });

  return {
    want: (job) => {
      const now = Date.now();
      let since = now;
      for (const [priority, queue] of queues) {
        const held = queue.get(job.key);
        if (held) {
          ({ since } = held);
          merged += 1;
          // Under its own priority it keeps its place; else it moves.
          if (priority !== job.priority) {
            queue.delete(job.key);
          }
        }
      }
      queueOf(job.priority).set(job.key, { ...job, since });
      owe();
    },
    runNow: (key) => {
      for (const queue of queues.values()) {
        const waiting = queue.get(key);
        if (waiting) {
          runJob(waiting);
          return;
        }
      }
    },
    minute: () => {
      const now = Date.now();
      const taken: SchedulerMinute = {
        merged,
        pausedMs: pausedMs + (pausedAt === undefined ? 0 : now - pausedCounted),
        waiting: background.size,
      };
      merged = 0;
      pausedMs = 0;
      pausedCounted = now;
      return taken;
    },
  };
};
