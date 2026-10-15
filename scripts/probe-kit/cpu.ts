/**
 * The CPU a WebKit page's main thread runs, read off the kernel's per-thread
 * run time rather than the wall clock: what the page costs whatever else the
 * machine runs and however late the engine's next frame comes. Linux only
 * (`/proc`); the kit's WebKit there is WPE.
 *
 * Headless WPE makes a frame on three kinds of thread (obelisk, 2026-10-15,
 * the caw open at 390×844 3x, CPU per 2.75s open against the page at rest):
 *
 *  - the web process's main thread: the page's script, style, layout and
 *    the paint's recording (166ms; at rest 90);
 *  - Skia's CPU paint workers (`SkiaCPUWorker`, eight here): the raster
 *    (7ms);
 *  - the ThreadedCompositor and Mesa's llvmpipe threads, one per core
 *    ("The default value is the number of CPU cores present",
 *    https://docs.mesa3d.org/envvars.html, LP_NUM_THREADS): the layers
 *    composited in software GL, the work a phone's GPU does (390ms and
 *    2574ms; at rest none).
 *
 * The main thread is what a frame interval is charged (`between`): the one
 * thread the page's own frame work runs on, in order, so its CPU in an
 * interval is commensurable with the interval's budget. The raster and the
 * compositing run beside it on many threads at once, the compositing a
 * GPU's work done on this machine's cores (each frame waits for the slowest
 * of ~48 llvmpipe threads, and 1 thread or 4 left the long intervals in
 * place): their CPU over a recording is reported (`paint`, `compositing`).
 *
 * The web process is the descendant of this one whose main thread a busy
 * page task (`IDENTIFY_MS`) shows running. A worker samples its main thread
 * (cpu-worker.ts) while a recording runs. WebKit's page clock is floored to
 * whole milliseconds ("static Seconds timePrecision { 1_ms }",
 * https://github.com/WebKit/WebKit/blob/main/Source/WebCore/page/Performance.cpp;
 * `std::floor`, https://trac.webkit.org/changeset/226495/webkit): each round
 * trip bounds the page clock's offset from the sampler's, and the bounds of
 * all of a recording's trips together put it within about the shortest
 * trip.
 */
import { readdirSync, readFileSync } from "node:fs";
import { release } from "node:os";
import { gunzipSync } from "node:zlib";
import type { Page } from "playwright-core";

/** What starts cpu-worker.ts. */
export interface SamplerStart {
  /** `[0]`: 1 while sampling; set to 0 to stop it. */
  control: SharedArrayBuffer;
  /** The sampled thread's `schedstat`. */
  file: string;
  /** Float64s, `STRIDE` a sample: the time, the run time. */
  samples: SharedArrayBuffer;
}

/** Numbers per sample. */
export const STRIDE = 2;
/** The busy page task that names the page's web process, ms. */
const IDENTIFY_MS = 300;
/** Round trips that bound the page clock's offset, at a recording's start and again at its end. */
const ROUND_TRIPS = 24;
/** WebKit's page clock: whole milliseconds, floored. */
const GRAIN_MS = 1;
/**
 * Samples a recording holds: a quarter millisecond apart, about 20s. A
 * sampler never stopped (its spec threw mid-recording) ends itself there.
 */
const CAPACITY = 65_536;
/** A process's folder in /proc. */
const PROCESS = /^\d+$/;
/** Raster threads. */
const PAINT = /^SkiaCPUWorker/;
/** Compositing threads: the compositor and its software GL. */
const COMPOSITING = /Compositor$|^llvmpipe/;
const HZ = /^CONFIG_HZ=(\d+)$/m;

/** One recording, read. */
export interface FrameCpu {
  /**
   * CPU ms the main thread ran from `from` to `to` (the page's clock): never
   * less than it ran, to the page clock's millisecond, and never more than
   * `to − from`.
   */
  between: (from: number, to: number) => number;
  /** CPU ms the compositing threads ran over the recording. */
  compositing: number;
  /** CPU ms the raster threads ran over the recording. */
  paint: number;
}

export interface PageCpu {
  /** Starts sampling; `stop` ends it and answers what it read. */
  record: () => Promise<{ stop: () => Promise<FrameCpu> }>;
}

/**
 * The kernel's tick, ms: a running thread's run time is brought up to date
 * on it, so a count read while the thread runs can trail by one.
 */
function tickMs(): number {
  const configs = [`/boot/config-${release()}`, "/proc/config.gz"];
  for (const file of configs) {
    try {
      const raw = readFileSync(file);
      const text = (file.endsWith(".gz") ? gunzipSync(raw) : raw).toString(
        "utf8"
      );
      const hz = Number(HZ.exec(text)?.[1]);
      if (hz > 0) {
        return 1000 / hz;
      }
    } catch {
      // Not this one.
    }
  }
  throw new Error(
    `the kernel's tick (CONFIG_HZ) is in neither ${configs.join(" nor ")}`
  );
}

const ranMs = (pid: number, tid: number): number =>
  Number(
    readFileSync(`/proc/${pid}/task/${tid}/schedstat`, "utf8").split(" ", 1)[0]
  ) / 1e6;

/** Every process descended from this one. */
function descendants(): number[] {
  const parent = new Map<number, number>();
  for (const entry of readdirSync("/proc")) {
    if (!PROCESS.test(entry)) {
      continue;
    }
    try {
      const stat = readFileSync(`/proc/${entry}/stat`, "utf8");
      // The fields after the name, which sits in parentheses: state, ppid.
      const ppid = Number(stat.slice(stat.lastIndexOf(")") + 2).split(" ")[1]);
      parent.set(Number(entry), ppid);
    } catch {
      // Gone between the listing and the read.
    }
  }
  const found: number[] = [];
  const under = [process.pid];
  for (let at = under.pop(); at !== undefined; at = under.pop()) {
    for (const [child, of] of parent) {
      if (of === at) {
        found.push(child);
        under.push(child);
      }
    }
  }
  return found;
}

/** CPU ms the threads of `pid` named by `group` have run. */
function groupMs(pid: number, group: RegExp): number {
  let sum = 0;
  for (const entry of readdirSync(`/proc/${pid}/task`)) {
    try {
      const tid = Number(entry);
      const name = readFileSync(`/proc/${pid}/task/${tid}/comm`, "utf8").trim();
      if (tid !== pid && group.test(name)) {
        sum += ranMs(pid, tid);
      }
    } catch {
      // Ended between the listing and the read.
    }
  }
  return sum;
}

/** The sampler's clock, ms (cpu-worker.ts writes the same). */
const now = (): number => performance.timeOrigin + performance.now();

/** Bounds on the page clock less the sampler's: `low` ≤ it < `high`. */
interface Offset {
  high: number;
  low: number;
}

/**
 * Narrows `bounds` by round trips: a page reading `there`, made between
 * `sent` and `back`, is the page's time floored, so the offset is at least
 * `there − back` and under `there + GRAIN_MS − sent`.
 */
async function narrow(page: Page, bounds: Offset): Promise<Offset> {
  let { low, high } = bounds;
  for (let n = 0; n < ROUND_TRIPS; n += 1) {
    const sent = now();
    // biome-ignore lint/performance/noAwaitInLoops: each round trip on its own
    const there = await page.evaluate(() => performance.now());
    const back = now();
    low = Math.max(low, there - back);
    high = Math.min(high, there + GRAIN_MS - sent);
  }
  if (low >= high) {
    throw new Error(
      `the page's clock and the sampler's disagree: offset at least ${low.toFixed(3)}ms and under ${high.toFixed(3)}`
    );
  }
  return { low, high };
}

/** The web process `page` runs in: the descendant whose main thread its busy task ran on. */
async function webProcess(page: Page): Promise<number> {
  const candidates = descendants().filter((pid) => {
    try {
      ranMs(pid, pid);
      return true;
    } catch {
      return false;
    }
  });
  const before = candidates.map((pid) => ranMs(pid, pid));
  await page.evaluate((ms) => {
    const end = performance.now() + ms;
    while (performance.now() < end) {
      // The busy task.
    }
  }, IDENTIFY_MS);
  const rise = candidates.map((pid, i) => {
    try {
      return ranMs(pid, pid) - (before[i] as number);
    } catch {
      return 0;
    }
  });
  const most = Math.max(0, ...rise);
  const at = rise.indexOf(most);
  const others = rise.filter((_, i) => i !== at);
  if (most < IDENTIFY_MS / 3 || others.some((one) => one > most / 4)) {
    throw new Error(
      `no one process ran the page's ${IDENTIFY_MS}ms task: ${candidates
        .map((pid, i) => `${pid} ${(rise[i] as number).toFixed(0)}ms`)
        .join(", ")}`
    );
  }
  return candidates[at] as number;
}

/**
 * The page's main-thread CPU, ready to record: run once the page has made
 * its last navigation (a navigation may move it to another web process).
 */
export async function pageCpu(page: Page): Promise<PageCpu> {
  if (process.platform !== "linux") {
    throw new Error(
      "a page's CPU is read from the kernel's per-thread run time in /proc: Linux only"
    );
  }
  const tick = tickMs();
  const pid = await webProcess(page);
  return {
    record: async () => {
      const control = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT);
      const samples = new SharedArrayBuffer(
        CAPACITY * STRIDE * Float64Array.BYTES_PER_ELEMENT
      );
      const flag = new Int32Array(control);
      flag[0] = 1;
      const worker = new Worker(new URL("./cpu-worker.ts", import.meta.url));
      // The sampler says two things, each awaited from before it can come.
      const message = () =>
        new Promise<unknown>((resolve) =>
          worker.addEventListener("message", ({ data }) => resolve(data), {
            once: true,
          })
        );
      const start: SamplerStart = {
        control,
        file: `/proc/${pid}/task/${pid}/schedstat`,
        samples,
      };
      const ready = message();
      worker.postMessage(start);
      await ready;
      const paintBefore = groupMs(pid, PAINT);
      const compositingBefore = groupMs(pid, COMPOSITING);
      const opening = await narrow(page, {
        low: Number.NEGATIVE_INFINITY,
        high: Number.POSITIVE_INFINITY,
      });
      return {
        stop: async () => {
          const { low, high } = await narrow(page, opening);
          const paint = groupMs(pid, PAINT) - paintBefore;
          const compositing = groupMs(pid, COMPOSITING) - compositingBefore;
          const ended = message();
          Atomics.store(flag, 0, 0);
          Atomics.notify(flag, 0);
          const count = (await ended) as number;
          worker.terminate();
          if (count >= CAPACITY) {
            throw new Error(
              `the CPU sampler filled its ${CAPACITY} samples before the recording ended`
            );
          }
          const series = new Float64Array(samples, 0, count * STRIDE);
          const time = (i: number) => series[STRIDE * i] as number;
          const ran = (i: number) => series[STRIDE * i + 1] as number;
          /** How many samples were taken before `t` (the sampler's clock). */
          const takenBefore = (t: number) => {
            let first = 0;
            let last = count;
            while (first < last) {
              const mid = Math.floor((first + last) / 2);
              if (time(mid) < t) {
                first = mid + 1;
              } else {
                last = mid;
              }
            }
            return first;
          };
          return {
            paint,
            compositing,
            between: (from, to) => {
              // The window began in [from, from + grain) and ended in
              // [to, to + grain) of the page's clock; on the sampler's, no
              // earlier than `from − high` and no later than
              // `to + grain − low`, and a running thread's count trails by
              // up to a tick. The last sample before that and the first
              // after it hold all the window's CPU between them.
              const before = takenBefore(from - high) - 1;
              const after = takenBefore(to + GRAIN_MS - low + tick);
              if (before < 0 || after >= count) {
                throw new Error(
                  `the window ${from.toFixed(0)}–${to.toFixed(0)}ms lies outside the CPU recording (${count} samples, ${(time(0) + low).toFixed(0)}–${(time(count - 1) + low).toFixed(0)}ms on the page's clock)`
                );
              }
              // One thread runs no longer than the window lasted, read on the
              // page's clock as the window itself is: so a window is never
              // charged more than its interval would have read.
              return Math.min(ran(after) - ran(before), to - from);
            },
          };
        },
      };
    },
  };
}
