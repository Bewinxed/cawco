/**
 * THE HUB PROFILES ITSELF. On 2026-11-18/19 obelisk's hub sat at 100% of a
 * core for hours and could not be profiled from outside: the host forbids
 * `perf` (kernel.perf_event_paranoid 4) and ptrace (kernel.yama.ptrace_scope
 * 1), and the compiled binary carries no inspector. So the hub samples its
 * own main thread through `node:inspector/promises`' Profiler (`Profiler.start`,
 * `Profiler.stop`), which runs in-process since Bun 1.3.7 and in the
 * compiled binary alike, for {@link PROFILE_MS}:
 *
 * - by itself, when the loop's holds pass a budget ({@link HOLD_BUDGET_MS}
 *   within {@link HOLD_WINDOW_MS}), at most once every {@link AUTO_GAP_MS};
 * - on the owner's ask, `POST /api/hub/profile` (routes/hub-info.ts).
 *
 * Each profile is one `.cpuprofile` file beside the database and the loop
 * watch's `loop-ended.json` ({@link profilePath}), the newest
 * {@link PROFILES_KEPT} kept. It is the Chrome DevTools CPU profile format:
 * DevTools' Performance panel loads it ("Load profile"), as does
 * speedscope.app, each frame named by its function and its file and line.
 * The main thread alone is sampled: the loop watch's worker is not in it.
 */

import { readdir, rm, writeFile } from "node:fs/promises";
import { Session } from "node:inspector/promises";
import { join } from "node:path";
import { detach } from "@cawco/core/detach";
import { syncSection } from "@cawco/core/loop-watch";
import { HOUR_MS, MINUTE_MS } from "@cawco/core/time";
import { loopWords } from "@cawco/core/words/loop";
import type { HubLifetimeShape } from "./lifetime";

/** How long one profile samples. */
const PROFILE_MS = 20_000;
/** Holds the loop's tick said, summed over {@link HOLD_WINDOW_MS}, past which the hub profiles by itself. */
const HOLD_BUDGET_MS = 3000;
/** The stretch the hold budget is summed over. */
const HOLD_WINDOW_MS = MINUTE_MS;
/** The least time between two profiles the hub takes by itself. */
const AUTO_GAP_MS = HOUR_MS;
/** The profiles kept: the newest, a day of the hourly ones. */
const PROFILES_KEPT = 24;
/** An ISO time's milliseconds, left out of a profile's name. */
const MILLISECONDS = /\.\d+Z$/u;
/** A profile's file name: its start, sortable. */
const PROFILE_FILE = /^hub-[\d-]+T[\d-]+Z\.cpuprofile$/u;

/** Where a profile begun at `at` is written, in `dir`. */
const profilePath = (dir: string, at: Date): string =>
  join(
    dir,
    `hub-${at.toISOString().replaceAll(":", "-").replace(MILLISECONDS, "Z")}.cpuprofile`
  );

export interface HubProfiler {
  /**
   * A hold the loop's own tick said, by its length: counted against the
   * budget, a profile begun once it is passed and none ran within the hour.
   */
  held: (ms: number) => void;
  /**
   * Profiles the main thread now, or joins the profile already running;
   * answers the path its file was written at.
   */
  take: (why: string) => Promise<string>;
}

/** The profiles in `dir` past the newest {@link PROFILES_KEPT}, let go. */
const prune = async (dir: string): Promise<void> => {
  const profiles = (await readdir(dir))
    .filter((name) => PROFILE_FILE.test(name))
    .sort()
    .reverse();
  await Promise.all(
    profiles
      .slice(PROFILES_KEPT)
      .map((name) => rm(join(dir, name), { force: true }))
  );
};

export const createHubProfiler = ({
  dir,
  lifetime,
}: {
  /** Where profiles are written: the database's folder, beside `loop-ended.json`. */
  dir: string;
  lifetime: HubLifetimeShape;
}): HubProfiler => {
  /** The profile running now, and the path it is written at. */
  let running: Promise<string> | undefined;
  /** When the hub last profiled by itself (ms epoch). */
  let lastAuto = Number.NEGATIVE_INFINITY;
  /** The holds within {@link HOLD_WINDOW_MS}: when each ended, and its length. */
  const holds: { at: number; ms: number }[] = [];

  const profile = async (why: string): Promise<string> => {
    const at = new Date();
    const path = profilePath(dir, at);
    console.warn(loopWords.profiling("hub", PROFILE_MS / 1000, why));
    const session = new Session();
    session.connect();
    try {
      await session.post("Profiler.enable");
      await session.post("Profiler.start");
      await lifetime.sleep(PROFILE_MS);
      const { profile: taken } = await session.post("Profiler.stop");
      const text = syncSection("CPU profile serialised", () =>
        JSON.stringify(taken)
      );
      await writeFile(path, text, { mode: 0o600 });
      console.warn(loopWords.profiled("hub", path));
      await prune(dir);
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

  const held = (ms: number): void => {
    const now = Date.now();
    holds.push({ at: now, ms });
    while (holds[0] && holds[0].at < now - HOLD_WINDOW_MS) {
      holds.shift();
    }
    const total = holds.reduce((sum, hold) => sum + hold.ms, 0);
    if (total < HOLD_BUDGET_MS || running || now - lastAuto < AUTO_GAP_MS) {
      return;
    }
    lastAuto = now;
    detach(
      take(loopWords.holdsPastBudget(Math.round(total))),
      "hub CPU profile"
    );
  };

  return { held, take };
};
