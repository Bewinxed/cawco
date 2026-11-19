/**
 * A PROCESS PROFILES ITSELF, AND SAYS EACH MINUTE WHAT IT COST. On
 * 2026-11-18/19 obelisk's hub sat at 100% of a core for hours, and its
 * agent at 0.9 to 1.5 cores all day, and neither could be profiled from
 * outside: the host forbids `perf` (kernel.perf_event_paranoid 4) and ptrace
 * (kernel.yama.ptrace_scope 1), and the compiled binary carries no
 * inspector. So the hub and the agent each sample their own main thread
 * through `node:inspector/promises`' Profiler (`Profiler.start`,
 * `Profiler.stop`), which runs in-process since Bun 1.3.7 and in the
 * compiled binary alike, for {@link PROFILE_MS}:
 *
 * - by itself, when the loop's holds pass a budget ({@link HOLD_BUDGET_MS}
 *   within {@link HOLD_WINDOW_MS}), or a minute's main thread took
 *   {@link BUSY_MAIN_PERCENT} of a core or more, or the whole process (every
 *   thread: Bun's pool threads run its file reads) the share its caller
 *   names, at most once every {@link AUTO_GAP_MS} between them;
 * - on the owner's ask: the hub's `POST /api/hub/profile` (routes/hub-info.ts),
 *   the agent's SIGUSR2 (agent daemon.ts).
 *
 * Each profile is one `.cpuprofile` file in the process's own data dir
 * ({@link profilePath}), the newest {@link PROFILES_KEPT} of its kind kept.
 * It is the Chrome DevTools CPU profile format: DevTools' Performance panel
 * loads it ("Load profile"), as does speedscope.app, each frame named by its
 * function and its file and line. The main thread alone is sampled: the loop
 * watch's worker is not in it.
 *
 * Once a minute one line ({@link loopMinute}) says how the loop fared: its
 * delay, the CPU its main thread and the whole process took, its memory, its
 * reads (Linux's `/proc/self/io`: read system calls and bytes a second,
 * every thread's), and the names that held it longest.
 */

import { heapSize } from "bun:jsc";
import { readFileSync } from "node:fs";
import { readdir, rm, writeFile } from "node:fs/promises";
import { Session } from "node:inspector/promises";
import { join } from "node:path";
import { monitorEventLoopDelay } from "node:perf_hooks";
import { detach } from "./detach";
import { type NamedTime, syncSection, tallyNamedWork } from "./loop-watch";
import { CLOCK_TICKS, threadStat } from "./loop-watch-shared";
import { MINUTE_MS } from "./time";
import { loopWords } from "./words/loop";

/** How long one profile samples. */
const PROFILE_MS = 20_000;
/** Holds the loop's tick said, summed over {@link HOLD_WINDOW_MS}, past which the process profiles by itself. */
const HOLD_BUDGET_MS = 3000;
/** The stretch the hold budget is summed over. */
const HOLD_WINDOW_MS = MINUTE_MS;
/**
 * A minute's main-thread CPU, as a share of one core, from which the process
 * profiles by itself. Work cut into short jobs holds the loop in no hold the
 * tick says: obelisk's hub ran its main thread at 84 to 98% for ten minutes
 * on 2026-11-19 in jobs of 3 to 96 ms, and profiled none of it.
 */
const BUSY_MAIN_PERCENT = 70;
/**
 * The least time between two profiles the process takes by itself. At an
 * hour, the one a restart's holds took was the only one for the hour after:
 * on 2026-11-19 obelisk's hub held 2 to 4 s at a time from 12:30 on and wrote
 * no profile of them, its 12:22 one all start-up.
 */
const AUTO_GAP_MS = 15 * MINUTE_MS;
/** The profiles kept of each process: the newest, six hours of the ones it takes by itself. */
const PROFILES_KEPT = 24;
/** An ISO time's milliseconds, left out of a profile's name. */
const MILLISECONDS = /\.\d+Z$/u;
/** A profile's file name for `who`: its start, sortable. */
const profileFile = (who: string): RegExp =>
  new RegExp(`^${who}-[\\d-]+T[\\d-]+Z\\.cpuprofile$`, "u");

/** Where `who`'s profile begun at `at` is written, in `dir`. */
const profilePath = (dir: string, who: string, at: Date): string =>
  join(
    dir,
    `${who}-${at.toISOString().replaceAll(":", "-").replace(MILLISECONDS, "Z")}.cpuprofile`
  );

/** A minute's CPU, each as a share of one core: the main thread's (undefined where it is not read) and every thread's. */
interface MinuteCpu {
  main: number | undefined;
  process: number;
}

export interface LoopProfiler {
  /**
   * A hold the loop's own tick said, by its length: counted against the
   * budget, a profile begun once it is passed and none ran within
   * {@link AUTO_GAP_MS}.
   */
  held: (ms: number) => void;
  /**
   * A minute's CPU ({@link loopMinute}): a profile begun from
   * {@link BUSY_MAIN_PERCENT} of the main thread on, or the process's busy
   * share, when none ran within {@link AUTO_GAP_MS}.
   */
  minute: (cpu: MinuteCpu) => void;
  /**
   * Profiles the main thread now, or joins the profile already running;
   * answers the path its file was written at.
   */
  take: (why: string) => Promise<string>;
}

/** The profiles of `who` in `dir` past the newest {@link PROFILES_KEPT}, let go. */
const prune = async (dir: string, who: string): Promise<void> => {
  const named = profileFile(who);
  const profiles = (await readdir(dir))
    .filter((name) => named.test(name))
    .sort()
    .reverse();
  await Promise.all(
    profiles
      .slice(PROFILES_KEPT)
      .map((name) => rm(join(dir, name), { force: true }))
  );
};

export const createLoopProfiler = ({
  who,
  dir,
  sleep,
  busyProcessPercent,
}: {
  /** Whose loop: "hub", "agent". Names its files and its lines. */
  who: string;
  /** Where profiles are written: the process's own data dir. */
  dir: string;
  /** A wait the process's own lifetime ends (the hub's `lifetime.sleep`). */
  sleep: (ms: number) => Promise<void>;
  /**
   * A minute's CPU of every thread, as a share of one core, from which the
   * process profiles by itself; none: the main thread's alone decides. The
   * agent's reads run on Bun's pool threads, which its main thread's share
   * does not count.
   */
  busyProcessPercent?: number;
}): LoopProfiler => {
  /** The profile running now, and the path it is written at. */
  let running: Promise<string> | undefined;
  /** When the process last profiled by itself (ms epoch). */
  let lastAuto = Number.NEGATIVE_INFINITY;
  /** The holds within {@link HOLD_WINDOW_MS}: when each ended, and its length. */
  const holds: { at: number; ms: number }[] = [];

  const profile = async (why: string): Promise<string> => {
    const at = new Date();
    const path = profilePath(dir, who, at);
    console.warn(loopWords.profiling(who, PROFILE_MS / 1000, why));
    const session = new Session();
    session.connect();
    try {
      await session.post("Profiler.enable");
      await session.post("Profiler.start");
      await sleep(PROFILE_MS);
      const { profile: taken } = await session.post("Profiler.stop");
      const text = syncSection("CPU profile serialised", () =>
        JSON.stringify(taken)
      );
      await writeFile(path, text, { mode: 0o600 });
      console.warn(loopWords.profiled(who, path));
      await prune(dir, who);
      return path;
    } finally {
      session.disconnect();
    }
  };

  const take = (why: string): Promise<string> => {
    running ??= profile(why).finally(() => {
      running = undefined;
    });
    return running;
  };

  /** A profile the process takes by itself, saying `why`: none while one runs, nor within {@link AUTO_GAP_MS} of the last. */
  const auto = (why: () => string): void => {
    const now = Date.now();
    if (running || now - lastAuto < AUTO_GAP_MS) {
      return;
    }
    lastAuto = now;
    detach(take(why()), `${who} CPU profile`);
  };

  const held = (ms: number): void => {
    const now = Date.now();
    holds.push({ at: now, ms });
    while (holds[0] && holds[0].at < now - HOLD_WINDOW_MS) {
      holds.shift();
    }
    const total = holds.reduce((sum, hold) => sum + hold.ms, 0);
    if (total >= HOLD_BUDGET_MS) {
      auto(() => loopWords.holdsPastBudget(Math.round(total)));
    }
  };

  const minute = ({ main, process: all }: MinuteCpu): void => {
    if (main !== undefined && main >= BUSY_MAIN_PERCENT) {
      auto(() => loopWords.busyMinute(main));
    } else if (busyProcessPercent !== undefined && all >= busyProcessPercent) {
      auto(() => loopWords.busyProcess(all));
    }
  };

  return { held, minute, take };
};

/** The names the minute line says, longest first. */
const TOP_NAMED = 5;
/** The loop delay histogram's resolution, in ms (node:perf_hooks `monitorEventLoopDelay`). */
const DELAY_RESOLUTION_MS = 20;

/** The main thread's CPU time in clock ticks, from Linux's `/proc`; none elsewhere. */
const mainThreadTicks = (): number | undefined => {
  if (process.platform !== "linux") {
    return;
  }
  let stat: string;
  try {
    stat = readFileSync(`/proc/self/task/${process.pid}/stat`, "utf8");
  } catch {
    return;
  }
  return threadStat(stat).ticks;
};

/** `/proc/self/io`'s `syscr` and `rchar` lines (proc(5)): read system calls, and bytes read, every thread's. */
const SYSCR = /^syscr:\s*(\d+)$/mu;
const RCHAR = /^rchar:\s*(\d+)$/mu;

/** The process's reads so far, from Linux's `/proc/self/io`; none elsewhere. */
const readsSoFar = (): { bytes: number; calls: number } | undefined => {
  if (process.platform !== "linux") {
    return;
  }
  let io: string;
  try {
    io = readFileSync("/proc/self/io", "utf8");
  } catch {
    return;
  }
  const calls = SYSCR.exec(io)?.[1];
  const bytes = RCHAR.exec(io)?.[1];
  return calls && bytes
    ? { calls: Number(calls), bytes: Number(bytes) }
    : undefined;
};

/** Each name of the minute's top, as its line says it: its time, and how many runs. */
const topWords = (top: NamedTime[]): string =>
  top
    .map(
      (named) => `${named.name} ${Math.round(named.ms)} ms (${named.count}×)`
    )
    .join(", ");

/**
 * Says, once a minute, how `who`'s loop fared: its delay's p50 and p99
 * (node:perf_hooks `monitorEventLoopDelay`), the CPU its main thread
 * (Linux's `/proc`) and the whole process (`process.cpuUsage()`, every
 * thread's) took as a share of one core (`eventLoopUtilization()` answers
 * zeros in Bun, oven-sh/bun#38441), its reads a second (Linux's
 * `/proc/self/io`), its heap and resident memory, the {@link TOP_NAMED}
 * names that held it longest (loop-watch.ts `tallyNamedWork`), and what
 * `admission` says of the minute (the hub's scheduler.ts). Each minute's CPU
 * goes to `profiler`. `every` runs the line on the process's own timer and
 * answers its stop. Answers its stop.
 */
export const loopMinute = ({
  who,
  profiler,
  every,
  admission,
}: {
  who: string;
  profiler: LoopProfiler;
  every: (name: string, ms: number, run: () => void) => () => void;
  admission?: () => { merged: number; pausedMs: number; waiting: number };
}): (() => void) => {
  const delay = monitorEventLoopDelay({ resolution: DELAY_RESOLUTION_MS });
  delay.enable();
  const takeTop = tallyNamedWork();
  let at = performance.now();
  let cpu = process.cpuUsage();
  let ticks = mainThreadTicks();
  let reads = readsSoFar();
  const stop = every("loop minute line", MINUTE_MS, () => {
    const now = performance.now();
    const seconds = (now - at) / 1000;
    const used = process.cpuUsage(cpu);
    const nowTicks = mainThreadTicks();
    const nowReads = readsSoFar();
    const share = (cpuSeconds: number) =>
      Math.round((cpuSeconds / seconds) * 100);
    const mainCpu =
      ticks === undefined || nowTicks === undefined
        ? undefined
        : share((nowTicks - ticks) / CLOCK_TICKS);
    const processCpu = share((used.user + used.system) / 1e6);
    console.info(
      loopWords.minute({
        who,
        p50Ms: Math.round(delay.percentile(50) / 1e6),
        p99Ms: Math.round(delay.percentile(99) / 1e6),
        mainCpu,
        processCpu,
        reads:
          reads && nowReads
            ? {
                perSecond: Math.round((nowReads.calls - reads.calls) / seconds),
                mbPerSecond:
                  Math.round(
                    ((nowReads.bytes - reads.bytes) / seconds / 1e6) * 10
                  ) / 10,
              }
            : undefined,
        heapMb: Math.round(heapSize() / 1024 / 1024),
        rssMb: Math.round(process.memoryUsage.rss() / 1024 / 1024),
        top: topWords(takeTop(TOP_NAMED)),
        admission: admission?.(),
      })
    );
    // A busy minute is profiled as a long hold is.
    profiler.minute({ main: mainCpu, process: processCpu });
    delay.reset();
    at = now;
    cpu = process.cpuUsage();
    ticks = nowTicks;
    reads = nowReads;
  });
  return () => {
    stop();
    delay.disable();
  };
};
