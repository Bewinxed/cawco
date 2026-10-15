/**
 * cpu.ts's sampler, on a thread of its own so the spec's awaits never hold
 * it up: every quarter millisecond it reads a thread's run time (the first
 * field of `/proc/<pid>/task/<tid>/schedstat`, "time spent on the cpu (in
 * nanoseconds)", https://docs.kernel.org/scheduler/sched-stats.html) and
 * writes the time it read it (epoch ms, `performance.timeOrigin` and
 * `now()`, the clock cpu.ts reads too: `process.hrtime` counts from each
 * thread's own start in Bun, 0.7s apart between a worker and its parent
 * here) and the run time (ms) into the shared `samples`, until `control[0]`
 * leaves 1.
 *
 * Messages back: "ready" once the first sample is written, then the count of
 * samples written.
 */
import { closeSync, openSync, readSync } from "node:fs";
import { type SamplerStart, STRIDE } from "./cpu";

const SAMPLE_MS = 0.25;

declare const self: Worker;

self.onmessage = ({ data }: MessageEvent<SamplerStart>) => {
  const control = new Int32Array(data.control);
  const out = new Float64Array(data.samples);
  const fd = openSync(data.file, "r");
  const text = Buffer.alloc(128);
  const capacity = out.length / STRIDE;
  let n = 0;
  while (Atomics.load(control, 0) === 1 && n < capacity) {
    const length = readSync(fd, text, 0, text.length, 0);
    out[STRIDE * n] = performance.timeOrigin + performance.now();
    out[STRIDE * n + 1] =
      Number(text.toString("latin1", 0, length).split(" ", 1)[0]) / 1e6;
    n += 1;
    if (n === 1) {
      postMessage("ready");
    }
    Atomics.wait(control, 0, 1, SAMPLE_MS);
  }
  closeSync(fd);
  postMessage(n);
};
