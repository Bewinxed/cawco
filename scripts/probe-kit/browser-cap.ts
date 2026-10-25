/**
 * Every browser the kit launches is held under a memory cap: once its
 * process tree (the browser and every process under it: Chromium's
 * renderers and GPU process, WebKit's MiniBrowser, WPEWebProcess and
 * WPENetworkProcess) holds more than {@link BROWSER_MEMORY_CAP} resident,
 * the whole tree is killed and the spec fails, its line naming the spec,
 * the leg (`--leg`), the pages the browser had open and the cap.
 *
 * WHY. On 2026-10-25 one WebKit web process of `run.ts web decision-embed
 * --leg project-head` reached 102 GB in 16 minutes and froze the owner's
 * desktop and the CawCo agent until it was killed by hand.
 *
 * HOW. A kernel cap (a cgroup's `memory.max`, `systemd-run --user --scope
 * -p MemoryMax=`) can't be made from a workspace: its boundary reaches no
 * user bus ("Failed to connect to user scope bus via local transport"), and
 * sessiond's `children` cgroup delegates only `pids` to the boundaries
 * under it, never `memory`. So the kit watches the trees itself, the same
 * way on the host and in a workspace: every {@link WATCH_MS} it walks each
 * browser's tree from its root (Linux `/proc/<pid>/task/<tid>/children`,
 * macOS `ps`) and sums each process's resident set. A page that allocates
 * as fast as it can passes the cap by at most what it allocates in one look
 * (the browser-cap spec reads how far). The sum counts a page shared by
 * two of the tree's processes twice (their libraries), a few hundred MB
 * on a cap of gigabytes, so it errs to the safe side.
 *
 * A launch's roots are the children this process gained across the launch
 * whose command names a Playwright browser build (`ms-playwright`, or
 * `PROBE_WEBKIT`'s): launches are made one at a time, so no other launch's
 * root is counted as this one's.
 */
import { readdirSync, readFileSync } from "node:fs";
import { listedPid, signal } from "../../packages/core/src/signal";
import { probeSlot } from "./slot";

const GIB = 1024 ** 3;
/**
 * The most one browser's tree may hold. Read on obelisk 2026-10-25 from
 * each tree's resident sets while a spec ran: decision-embed's Chromium
 * 0.54 GiB over its six processes, webkit-caw's WPEWebProcess 0.66 GiB;
 * the heaviest whole run read (a scratch fleet, the dashboard build and
 * Chromium together) 2.5 GiB, 4.2 in the old gate's reading of 2026-10-14.
 * 6 GiB is about nine times the browsers' and leaves a run inside its slot
 * (slot.ts `GIB_PER_SLOT`) with its fleet; the runaway it guards against
 * reached 102 GB. Each browser says its own most as it closes.
 */
export const BROWSER_MEMORY_CAP = 6 * GIB;
/** How often each browser's tree is read. */
const WATCH_MS = 250;
const PAGE_SIZE = 4096;
/** One row of `ps -o pid=,ppid=,rss=,command=`. */
const PS_ROW = /^(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/;

/** What a watched browser is, for the lines about it. */
interface Watched {
  /** The cap it is held to, in bytes. */
  cap: number;
  /** Its engine, as the kit names it. */
  engine: string;
  /** Set once the cap killed it: what the line said. */
  killed: string | null;
  /** The pages it has open, read as it is killed. */
  pages: () => string[];
  /** The most its tree held at one look. */
  peak: number;
  /** The processes the launch started under this one: the tree's tops. */
  roots: number[];
}

const watched = new Set<Watched>();
let timer: ReturnType<typeof setInterval> | null = null;

/** Where a kill's line goes: the running spec's check (kit.ts), else a FAIL line and a failed exit. */
let report: (line: string) => void = (line) => {
  console.log(`FAIL ${line}`);
  process.exitCode = 1;
};
/** The spec now running, for a kill's line. */
let specNow = "the run";

/** The kit names the running spec and where its failures go. */
export function reportCapsTo(spec: string, to: (line: string) => void): void {
  specNow = spec;
  report = to;
}

interface Proc {
  command: string;
  pid: number;
  rss: number;
}

const linuxChildren = (pid: number): number[] => {
  const out: number[] = [];
  let tasks: string[];
  try {
    tasks = readdirSync(`/proc/${pid}/task`);
  } catch {
    return out;
  }
  for (const tid of tasks) {
    try {
      for (const child of readFileSync(
        `/proc/${pid}/task/${tid}/children`,
        "utf8"
      )
        .trim()
        .split(" ")) {
        if (child) {
          out.push(Number(child));
        }
      }
    } catch {
      // The thread ended.
    }
  }
  return out;
};

const linuxProc = (pid: number): Proc | null => {
  try {
    const rss =
      Number(readFileSync(`/proc/${pid}/statm`, "utf8").split(" ")[1]) *
      PAGE_SIZE;
    const command = readFileSync(`/proc/${pid}/cmdline`, "utf8")
      .split("\0")
      .join(" ")
      .trim();
    return { pid, rss, command };
  } catch {
    return null;
  }
};

/** Every process in the trees under `roots`, roots included: on macOS one `ps` read. */
function trees(roots: number[]): Proc[] {
  if (process.platform === "linux") {
    const out: Proc[] = [];
    const seen = new Set<number>();
    const stack = [...roots];
    while (stack.length > 0) {
      const pid = stack.pop() as number;
      if (seen.has(pid)) {
        continue;
      }
      seen.add(pid);
      const proc = linuxProc(pid);
      if (proc) {
        out.push(proc);
        stack.push(...linuxChildren(pid));
      }
    }
    return out;
  }
  const rows = Bun.spawnSync(["ps", "-A", "-o", "pid=,ppid=,rss=,command="])
    .stdout.toString()
    .split("\n")
    .map((line) => PS_ROW.exec(line.trim()))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => ({
      pid: Number(m[1]),
      ppid: Number(m[2]),
      rss: Number(m[3]) * 1024,
      command: m[4] as string,
    }));
  const out: Proc[] = [];
  const keep = new Set(roots);
  let grew = true;
  while (grew) {
    grew = false;
    for (const row of rows) {
      if (!keep.has(row.pid) && keep.has(row.ppid)) {
        keep.add(row.pid);
        grew = true;
      }
    }
  }
  for (const row of rows) {
    if (keep.has(row.pid)) {
      out.push(row);
    }
  }
  return out;
}

/** This process's children now. */
const ownChildren = (): Proc[] => {
  if (process.platform === "linux") {
    return linuxChildren(process.pid)
      .map(linuxProc)
      .filter((p): p is Proc => p !== null);
  }
  return trees([process.pid]).filter((p) => p.pid !== process.pid);
};

const gib = (bytes: number): string => `${(bytes / GIB).toFixed(2)} GiB`;

/** The browser builds a launch runs: Playwright's, or the WebKit `PROBE_WEBKIT` names. */
const isBrowserBuild = (command: string): boolean =>
  command.includes("ms-playwright") ||
  (process.env.PROBE_WEBKIT !== undefined &&
    command.includes(process.env.PROBE_WEBKIT));

const leg = (): string => {
  const at = process.argv.indexOf("--leg");
  return at >= 0 ? (process.argv[at + 1] ?? "") : "";
};

function look(): void {
  for (const one of watched) {
    const procs = trees(one.roots);
    if (procs.length === 0) {
      watched.delete(one);
      console.log(
        `  ${one.engine} browser closed; its processes held ${gib(one.peak)} at most (cap ${gib(one.cap)})`
      );
      continue;
    }
    const held = procs.reduce((sum, p) => sum + p.rss, 0);
    one.peak = Math.max(one.peak, held);
    if (held <= one.cap) {
      continue;
    }
    for (const proc of procs) {
      // Each pid read from the process table a moment ago; one that ended since answers "gone".
      signal(listedPid(proc.pid), "SIGKILL");
    }
    watched.delete(one);
    const biggest = procs.reduce((a, b) => (b.rss > a.rss ? b : a));
    let pages: string[] = [];
    try {
      pages = one.pages();
    } catch {
      // The browser's connection is gone.
    }
    const name = (biggest.command.split(" ")[0] ?? "").split("/").at(-1);
    one.killed = `${specNow}${leg() ? ` (leg ${leg()})` : ""}: its ${one.engine} browser was killed at the kit's memory cap of ${gib(one.cap)}: its ${procs.length} processes held ${gib(held)}, ${name} (pid ${biggest.pid}) ${gib(biggest.rss)} of it; pages open: ${pages.join(", ") || "none read"}`;
    report(one.killed);
  }
  if (watched.size === 0 && timer) {
    clearInterval(timer);
    timer = null;
  }
}

/** One launch at a time, so the children a launch adds are its own. */
let launching: Promise<unknown> = Promise.resolve();

/** A browser under the cap: what its line says of it, and whether the cap ended it. */
export interface CappedBrowser {
  /** The kill's line once the cap killed it; null while it stands. */
  killed: () => string | null;
  /** The most its tree held at one look. */
  peak: () => number;
}

/**
 * Launches a browser under this process's probe slot (slot.ts) and the
 * memory cap: `launch` starts it, `pagesOf` reads the addresses it has open.
 * `cap` is the kit's own unless a spec proving the cap names a smaller one.
 */
export async function capped<T>(
  engine: string,
  launch: () => Promise<T>,
  pagesOf: (browser: T) => string[],
  cap = BROWSER_MEMORY_CAP
): Promise<T & { memoryCap: CappedBrowser }> {
  await probeSlot();
  const turn = launching.then(async () => {
    const before = new Set(ownChildren().map((p) => p.pid));
    const browser = await launch();
    const roots = ownChildren()
      .filter((p) => !before.has(p.pid) && isBrowserBuild(p.command))
      .map((p) => p.pid);
    return { browser, roots };
  });
  launching = turn.catch(() => undefined);
  const { browser, roots } = await turn;
  if (roots.length === 0) {
    throw new Error(
      `the ${engine} browser started no process of a Playwright browser build under this run: its memory can't be held to the cap`
    );
  }
  const one: Watched = {
    engine,
    roots,
    cap,
    peak: 0,
    killed: null,
    pages: () => pagesOf(browser),
  };
  watched.add(one);
  timer ??= setInterval(look, WATCH_MS);
  timer.unref();
  return Object.assign(browser as T & object, {
    memoryCap: { killed: () => one.killed, peak: () => one.peak },
  }) as T & { memoryCap: CappedBrowser };
}
