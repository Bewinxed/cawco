/**
 * The process table, as the keeper reads it: on a thread of its own.
 *
 * NOTHING THE KEEPER ANSWERS WAITS ON THE KERNEL'S TABLE BUT WHAT NEEDS IT.
 * Every welcome, line and command goes through the keeper's one loop, and the
 * table is read from the kernel by a synchronous call (macOS: the
 * `kern.proc.all` sysctl through FFI). That call is under a millisecond as a
 * rule and 48ms at worst on a Mac at load 340, yet one blocked the keeper's
 * loop for about two minutes on 9 Oct (every main-thread sample in
 * `__sysctl`), and nothing was answered until it returned. So the read runs
 * in a worker (table-worker.ts), the only place it runs: a slow one delays
 * the verbs that need the table (a signal, the end of a stdin, a drain, the
 * survey) and nothing else.
 *
 * EVERY ASK GETS A READING TAKEN AFTER IT. A reading names only what was
 * running when it was taken, and a signal reaches only what its reading
 * names: a child started after a reading began would be missing from it, and
 * so not signalled. Asks made while a reading is out share the next one,
 * which starts as that one ends.
 *
 * AND NOTHING HERE WAITS ON ANOTHER PROCESS. The table was once a synchronous
 * spawn of the process lister, and on a Mac it wedged the keeper: Bun's
 * `spawnSync` waits on a private kqueue of its own and, while it waits,
 * points the runtime's loop handle at it (oven-sh/bun#34069, the fix still
 * open as oven-sh/bun#40078). The keeper of 8 Oct held that second kqueue,
 * sat in `kevent64` with its socket open, and sent no `welcome` to anyone for
 * 35 minutes. The worker reads the kernel directly, never through a process.
 */
import { standalone } from "@cawco/core/runtime";
import type { TableAnswer, TableAsk } from "./table-worker";

/**
 * One process as the operating system lists it. `started` is its start time
 * as `ps -o lstart=` prints it: with the pid, what says a pid seen later is
 * still the same process and not another that was since given its number.
 */
export interface Listed {
  /** Its command line, in a marked reading, for a process that carries a tree mark. */
  command?: string;
  pgid: number;
  pid: number;
  ppid: number;
  started: string;
  /** The child whose tree it is, by the mark its environment carries (`CAWCO_SESSIOND_TREE`), in a marked reading. */
  tree?: string;
}

const SPACES = /\s+/;

/** Where the worker is: the binary's own entry when compiled, the source beside this file otherwise. */
const WORKER_URL = new URL(
  standalone ? "./scripts/binary/process-table-worker.js" : "./table-worker.ts",
  import.meta.url
);

let worker: Worker | undefined;
/** The reading the worker is taking now: one at a time. */
let answering:
  | { resolve: (rows: Listed[]) => void; reject: (error: Error) => void }
  | undefined;

/** A worker that failed or ended fails the reading it was taking, and the next ask starts another. */
const lost = (error: Error): void => {
  worker?.terminate();
  worker = undefined;
  const waiting = answering;
  answering = undefined;
  waiting?.reject(error);
};

const tableWorker = (): Worker => {
  if (worker) {
    return worker;
  }
  // Unreferenced: the keeper's exit is its drain's business, never this thread's.
  const started = new Worker(WORKER_URL, { ref: false });
  started.onmessage = (event: MessageEvent<TableAnswer>) => {
    const waiting = answering;
    answering = undefined;
    const answer = event.data;
    if ("error" in answer) {
      waiting?.reject(new Error(answer.error));
      return;
    }
    waiting?.resolve(
      answer.rows.map(({ started: at, ...row }) => ({
        ...row,
        // As this daemon always held it: the columns split on runs of spaces
        // and joined by one (`Thu Oct 1 20:26:18 2026`).
        started: at.split(SPACES).join(" "),
      }))
    );
  };
  started.onerror = (event) => {
    lost(
      new Error(
        `the process-table reader failed: ${event.message || "no reason given"}`
      )
    );
  };
  started.addEventListener("close", () => {
    if (worker === started) {
      lost(new Error("the process-table reader ended"));
    }
  });
  worker = started;
  return started;
};

const readOnce = (marked: boolean): Promise<Listed[]> =>
  new Promise((resolve, reject) => {
    answering = { resolve, reject };
    tableWorker().postMessage({ marked } satisfies TableAsk);
  });

let inFlight: Promise<Listed[]> | undefined;
/** The reading that starts once the one in flight ends, marked when any ask sharing it wants the marks. */
let queued: { marked: boolean; reading: Promise<Listed[]> } | undefined;

const startReading = (marked: boolean): Promise<Listed[]> => {
  const reading = readOnce(marked).finally(() => {
    if (inFlight === reading) {
      inFlight = undefined;
    }
  });
  inFlight = reading;
  return reading;
};

const nothing = (): void => undefined;

/**
 * Every process on the machine, read from the kernel (core's process reader:
 * one `kern.proc.all` sysctl on macOS, `/proc` on Linux), as `ps -A -o
 * pid=,ppid=,pgid=,lstart=` listed it. Neither system has a call that lists a
 * process's descendants, so the whole table is read. `marked`, each
 * process's environment is read too, for the child whose tree mark it
 * carries ({@link Listed.tree}): asked where a child's tree is ended or
 * signalled, never on the survey's clock.
 */
export const processTable = (marked = false): Promise<Listed[]> => {
  if (!inFlight) {
    return startReading(marked);
  }
  if (queued) {
    queued.marked ||= marked;
    return queued.reading;
  }
  const next: { marked: boolean; reading: Promise<Listed[]> } = {
    marked,
    reading: inFlight.then(nothing, nothing).then((): Promise<Listed[]> => {
      queued = undefined;
      return startReading(next.marked);
    }),
  };
  queued = next;
  return next.reading;
};
