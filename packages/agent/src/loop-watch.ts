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

/** Runs `run`, a synchronous section, marked as `name`: a stall it causes names it. */
export const syncSection = <T>(name: string, run: () => T): T => {
  const at = performance.now();
  last = { at, left: false, name };
  try {
    return run();
  } finally {
    const ms = performance.now() - at;
    if (last?.at === at) {
      last.left = true;
    }
    if (!longest || ms > longest.ms) {
      longest = { ms, name };
    }
  }
};

/** What the loop's last stall is said with. */
const stallLine = (heldMs: number): string => {
  const work = [...flying]
    .map(([kind, count]) => `${kind} ${count}`)
    .join(", ");
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
  return `[loop] the agent's loop was held ${Math.round(heldMs)} ms; phase: ${currentPhase}; in flight: ${work || "nothing counted"}; ${section}${lastWords}${unnamed}; heap ${Math.round(heapSize() / 1024 / 1024)} MB`;
};

/** Starts the watch: each stall of {@link LATE_MS} or more is one line through `say`. */
export const watchLoop = (say: (line: string) => void): (() => void) => {
  let expected = performance.now() + TICK_MS;
  const timer = setInterval(() => {
    const now = performance.now();
    const late = now - expected;
    expected = now + TICK_MS;
    if (late >= LATE_MS) {
      say(stallLine(late));
    }
    longest = undefined;
  }, TICK_MS);
  timer.unref();
  return () => clearInterval(timer);
};
