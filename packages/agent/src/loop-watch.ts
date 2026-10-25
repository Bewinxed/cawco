/**
 * The agent's own loop, watched: a stall names itself.
 *
 * Every timer, socket read and answer of this process runs on one loop, so
 * synchronous work that holds it holds them all: on 2026-10-23 19:33,
 * obelisk's agent was held ~75 s (its 10 s bounds said "within 84 s") as it
 * came up with 369 OpenCode reattaches and a wave of transcript reads, and
 * nothing it wrote said what held it.
 *
 * A tick every {@link TICK_MS} measures how late it ran. One {@link LATE_MS}
 * or more late is one line, once per stall: how long the loop was held, the
 * agent's phase ({@link phase}), the work in flight by kind
 * ({@link inFlight}), the longest marked synchronous section that ran since
 * the last tick ({@link syncSection}) and the one entered last, and the
 * heap. A stall whose longest section is short was held by something no
 * marker names (a collection, an unmarked parse): that is said too.
 *
 * Markers cost a clock read and a map write: cheap enough to wrap every
 * known heavy synchronous spot (SQLite reads, transcript parses, child
 * processes run to the end).
 */

import { heapSize } from "bun:jsc";
import { standalone } from "@cawco/core/runtime";
import { loopWords } from "@cawco/core/words/loop";
import { BEAT, LEFT, SECTION, type WatchdogMessage } from "./loop-watch-shared";

/** How often the loop is looked at. */
const TICK_MS = 250;
/** A tick this late found the loop held. Ours: four ticks, past any GC pause or burst of frames the agent should have. */
export const LATE_MS = 1000;

/** What the agent is doing, as its startup and connection say. */
let currentPhase = "starting";
/** Work in flight, by kind. */
const flying = new Map<string, number>();

interface Section {
  ms: number;
  name: string;
}
/** The longest marked section since the last tick. */
let longest: Section | undefined;
/** The last marked section entered, and whether it has been left. */
let last: { at: number; left: boolean; name: string } | undefined;

/** The agent's phase from now: "registering", "taking custody back", "running". */
export const phase = (name: string): void => {
  currentPhase = name;
};

/** `work`, counted in flight under `kind` until it settles. */
export const inFlight = <T>(kind: string, work: Promise<T>): Promise<T> => {
  flying.set(kind, (flying.get(kind) ?? 0) + 1);
  return work.finally(() => {
    const left = (flying.get(kind) ?? 1) - 1;
    if (left > 0) {
      flying.set(kind, left);
    } else {
      flying.delete(kind);
    }
  });
};

/**
 * The watch from its own thread (loop-watch-worker.ts): the memory it reads
 * the loop's beat and last section from, and the ids it knows sections by.
 */
let watchdog: { shared: Float64Array; worker: Worker } | undefined;
const sectionIds = new Map<string, number>();

/** Section `name` entered, or left, as the watch from its own thread reads it. */
const markSection = (name: string, left: boolean): void => {
  if (!watchdog) {
    return;
  }
  let id = sectionIds.get(name);
  if (id === undefined) {
    id = sectionIds.size;
    sectionIds.set(name, id);
    watchdog.worker.postMessage({
      kind: "section",
      id,
      name,
    } satisfies WatchdogMessage);
  }
  watchdog.shared[SECTION] = id;
  watchdog.shared[LEFT] = left ? 1 : 0;
};

/** Runs `run`, a synchronous section, marked as `name`: a stall it causes names it. */
export const syncSection = <T>(name: string, run: () => T): T => {
  const at = performance.now();
  last = { at, left: false, name };
  markSection(name, false);
  try {
    return run();
  } finally {
    const ms = performance.now() - at;
    if (last?.at === at) {
      last.left = true;
      markSection(name, true);
    }
    if (!longest || ms > longest.ms) {
      longest = { ms, name };
    }
  }
};

/** The work in flight, in words. */
const flyingWords = (): string =>
  [...flying].map(([kind, count]) => `${kind} ${count}`).join(", ");

/** What the loop's last stall is said with. */
const stallLine = (heldMs: number): string => {
  const work = flyingWords();
  const section = longest
    ? `the longest marked section since the tick before: ${longest.name}, ${Math.round(longest.ms)} ms`
    : "no marked section ran since the tick before";
  const unnamed =
    !longest || longest.ms < heldMs / 2
      ? "; most of the stall is in no marked section"
      : "";
  const lastWords = last
    ? `; the last entered: ${last.name}${last.left ? "" : " (not left)"}`
    : "";
  return `${loopWords.heldEnded(heldMs)}; phase: ${currentPhase}; in flight: ${work || "nothing counted"}; ${section}${lastWords}${unnamed}; heap ${Math.round(heapSize() / 1024 / 1024)} MB`;
};

/** Where the watch from its own thread is: the binary's own entry when compiled, the source beside this file otherwise. */
const WATCHDOG_URL = new URL(
  standalone
    ? "./scripts/binary/loop-watch-worker.js"
    : "./loop-watch-worker.ts",
  import.meta.url
);

/**
 * Starts the watch from its own thread (loop-watch-worker.ts): it reads the
 * beat each tick writes, and a byte it sends the echo opened here comes
 * back only while this loop takes in sockets. Unreferenced, as the echo
 * is: neither keeps the agent from exiting.
 */
const startWatchdog = (): void => {
  const shared = new Float64Array(new SharedArrayBuffer(3 * 8));
  shared[BEAT] = Date.now();
  shared[SECTION] = -1;
  const echo = Bun.listen({
    hostname: "127.0.0.1",
    port: 0,
    socket: {
      data(socket, data) {
        socket.write(data);
      },
    },
  });
  echo.unref();
  const worker = new Worker(WATCHDOG_URL, { ref: false, smol: true });
  worker.postMessage({
    kind: "start",
    beat: shared.buffer as SharedArrayBuffer,
    port: echo.port,
  } satisfies WatchdogMessage);
  watchdog = { shared, worker };
};

/**
 * Starts the watch: each stall of {@link LATE_MS} or more is one line
 * through `say` once it ends, and one that lasts, or a loop that runs its
 * timers but takes in nothing, is said while it lasts, from a thread of its
 * own ({@link startWatchdog}).
 */
export const watchLoop = (say: (line: string) => void): (() => void) => {
  startWatchdog();
  let expected = performance.now() + TICK_MS;
  let posted = "";
  const timer = setInterval(() => {
    const now = performance.now();
    const late = now - expected;
    expected = now + TICK_MS;
    if (late >= LATE_MS) {
      say(stallLine(late));
    }
    longest = undefined;
    if (watchdog) {
      watchdog.shared[BEAT] = Date.now();
      const state = {
        kind: "state",
        phase: currentPhase,
        flying: flyingWords() || "nothing counted",
      } satisfies WatchdogMessage;
      const said = `${state.phase}\0${state.flying}`;
      if (said !== posted) {
        posted = said;
        watchdog.worker.postMessage(state);
      }
    }
  }, TICK_MS);
  timer.unref();
  return () => clearInterval(timer);
};
