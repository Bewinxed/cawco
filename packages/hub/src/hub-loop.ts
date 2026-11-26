/**
 * THE HUB'S LOOP NEVER STAYS HELD. Every request, frame and timer of the hub
 * runs on one thread's loop, so work that never yields holds the whole
 * fleet: on 2026-11-04 obelisk's hub sat 18 minutes at 100% CPU in a loop of
 * microtasks (a continuation advancing again and again on a machine that
 * held its starts), answered nothing, logged nothing, and stayed so until a
 * person killed it.
 *
 * The hub's loop is watched as the agent's is (core loop-watch.ts): its own
 * tick says each hold of {@link HUB_LATE_MS} or more once it ends, with the
 * named work (`doing`) and marked section that held it longest, and a
 * watch on a thread of its own says a hold while it lasts (at 10, 30 and 60
 * s) with the work the hub started last (core `doing`), and ends the hub
 * once the hold reaches {@link HUB_HELD_END_MS}: it keeps what it read in
 * {@link loopRecord}, and kills the process. The hub's service starts it
 * again on every end, Linux and macOS alike (cli service.ts: systemd's
 * `Restart=always`, launchd's `KeepAlive` true), and the hub after it says
 * what the watch kept, once ({@link sayEndedBefore}).
 *
 * Each hold the tick says counts toward a CPU profile the hub takes of
 * itself, and once a minute one line says how the loop fared (core
 * loop-profile.ts, as the agent's).
 *
 * Why a thread of the hub's own and not systemd's `WatchdogSec=`: that
 * needs `sd_notify` over a unix datagram socket, which Bun's `node:dgram`
 * cannot open (udp4 and udp6 only), launchd has no watchdog at all, and
 * neither could say what the loop was doing. The thread works on both, and
 * says it.
 */

import { rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { type LoopProfiler, loopMinute } from "@cawco/core/loop-profile";
import { watchFromItsOwnThread, watchLoop } from "@cawco/core/loop-watch";
import { LoopEndedSchema } from "@cawco/core/loop-watch-shared";
import { readRecordSync } from "@cawco/core/state-file";
import { loopWords } from "@cawco/core/words/loop";
import type { HubLifetimeShape } from "./lifetime";

/**
 * A hold the hub's own tick says once it ends: one turn of its tick (core
 * loop-watch.ts `TICK_MS`). The hub's budget is no hold over 250 ms (tsk-391);
 * at 5 s, its line said none of the holds of 2026-11-18/19, which ran 1.5 to
 * 6.6 s a turn.
 */
const HUB_LATE_MS = 250;

/**
 * A hold that ends the hub. Twelve of the hub's 10 s read deadlines, so
 * every caller has long given up on it, and past the longest hold of a
 * process's loop the fleet has seen end by itself (the agent's ~75 s as it
 * reattached 369 sessions, core loop-watch.ts); the watch's lines at 10, 30
 * and 60 s come first. Nothing before `listen` counts: the watch starts
 * once the hub listens.
 */
// @limit measured: twelve of the hub's 10 s read deadlines, past the 75 s longest hold seen to end by itself (369 sessions reattached, core loop-watch.ts)
const HUB_HELD_END_MS = 120_000;

/** Where the watch keeps what it read as it ended a hub: beside its database. */
export const loopRecord = (dbPath: string): string =>
  join(dirname(dbPath), "loop-ended.json");

/**
 * What the watch kept as it ended the hub before this one, said once as
 * this one starts, then let go.
 */
const sayEndedBefore = (record: string): void => {
  try {
    const kept = readRecordSync(record, LoopEndedSchema);
    if (!kept) {
      return;
    }
    const read = [
      kept.doing ? loopWords.doing(kept.doing) : "",
      kept.thread,
      kept.memory,
      `pid ${kept.pid}`,
    ]
      .filter(Boolean)
      .join("; ");
    console.warn(
      loopWords.endedBefore(
        kept.who,
        new Date(kept.at).toISOString(),
        Math.round(kept.heldMs / 1000),
        read
      )
    );
  } catch (error) {
    console.warn(
      `[loop] what the watch kept at ${record} could not be read: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  rmSync(record, { force: true });
};

/**
 * Watches the service hub's loop ({@link HUB_LATE_MS},
 * {@link HUB_HELD_END_MS}), keeping what an end read at `record`: each hold
 * its tick says goes to `profiler`, and a line a minute says how it fared
 * (core loop-profile.ts `loopMinute`, with its admission's minute). Answers its stop: both watches and the minute line
 * end, and nothing ends the process after.
 */
export const watchHubLoop = (
  record: string,
  {
    lifetime,
    profiler,
  }: { lifetime: HubLifetimeShape; profiler: LoopProfiler },
  endAfterMs = HUB_HELD_END_MS
): (() => void) => {
  sayEndedBefore(record);
  const stopTick = watchLoop((line) => console.warn(line), {
    held: profiler.held,
    lateMs: HUB_LATE_MS,
    name: "hub",
  });
  const stopThread = watchFromItsOwnThread({
    who: "hub",
    end: { afterMs: endAfterMs, record },
  });
  const stopMinute = loopMinute({
    who: "hub",
    profiler,
    every: (name, ms, run) => {
      const timer = lifetime.every(name, ms, run);
      return () => lifetime.cancel(timer);
    },
    admission: () => lifetime.jobs.minute(),
  });
  return () => {
    stopTick();
    stopThread();
    stopMinute();
  };
};
