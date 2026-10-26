/**
 * WHAT A SESSION STARTS AND LEAKS, THE SESSION IS TOLD. Nothing is stopped,
 * throttled or held for it: every run starts at once and runs to its own
 * end. Every {@link LOOK_MS} the agent reads each keeper child a session
 * runs in (its own process, its workspace's boundary, the OpenCode server it
 * runs on) and every process that child started, and tells the sessions it
 * touches, once per leak, as the hub's own word in their conversation (core
 * `LEAK_FOUND`, hub server.ts `tellSession`):
 *
 * - A PROCESS WHOSE MEMORY KEEPS CLIMBING: resident memory at or past
 *   {@link LEAK_MEMORY_GIB} and higher at each of the last {@link WINDOW}
 *   readings than at the one before it, by {@link CLIMB_MIN} in all. Said
 *   again each time it climbs another threshold's worth.
 * - PROCESSES LEFT BEHIND: a process the child started still running after
 *   the process that started it ended, once it has stayed so
 *   {@link ORPHAN_GRACE_MS} (a command's own output copiers outlive it by a
 *   moment). An orphan is reparented to whoever reaps for its parent: the
 *   service manager or init, outside the child's processes, or, inside a
 *   workspace's sandbox on Linux, the sandbox's init, which starts nothing
 *   of its own after its runner (boundary.ts `Place.idle`). A browser's
 *   crash handler, which Chromium starts orphaned and which ends with its
 *   browser, is one only once no process of its browser's install runs
 *   ({@link browsersHandlers}).
 *
 * What a child started: on Linux, where the keeper gives each child a cgroup
 * of its own (sessiond cgroup.ts), every process in that cgroup, a
 * double-forked one included; on macOS, for a workspace's boundary, every
 * process its Seatbelt profile names its own (boundary.ts `answering`),
 * wherever it moved. Beside those, its tree, as the keeper reads it (sessiond
 * server.ts `#survey`): its descendants, and every process an earlier reading
 * found that is still the same process, so one whose parent ended is still
 * known as the child's. A process that a session's own shell double-forks on
 * a machine whose keeper has no cgroups is out of its tree from its first
 * instant, and is not seen.
 *
 * A delegate whose work item has ended takes no word, and is never told of a
 * leftover: what its session left running in its workspace ends as the hub
 * settles that workspace (hub work-items.ts `endLeftWork`), or is kept while
 * an artifact shows it. Its parent is told of a climb in memory alone (hub
 * server.ts `tellLeak`).
 *
 * The same reading says which children are working (agent awake.ts holds
 * idle sleep off for them): a child whose processes, itself aside, used at
 * least {@link WORKING_SHARE} of one core since the reading before. A run a
 * session started in its shell and left running past its turn (a probe kit
 * run, a typecheck, a release) is one; the MCP servers a harness keeps idle
 * beside it are not.
 *
 * Why: the owner's word, 2026-10-22, replacing the heavy-run slots that
 * queued every probe, typecheck, landing gate and release behind 8 fixed
 * slots: "the issue is runaway tests runaway processes etc, javascript
 * shouldn't crash such a machine, if a test leaks it should notify somehow so
 * the agent can fix it. But it doesn't stop it."
 */
import { readdir, readFile, readlink } from "node:fs/promises";
import { hostname } from "node:os";
import { basename, dirname, join } from "node:path";
import type { LeakFound } from "@cawco/core/harness";
import {
  commandLine,
  cpuTimeUsed,
  executablePath,
  type ProcessLineage,
  processLineage,
  residentBytes,
} from "@cawco/core/process-identity";
import { leakWords } from "@cawco/core/words/leaks";
import { keeperChildren } from "./sessiond-client";

const GIB = 1024 ** 3;

/** How often every child's processes are read. Ours: a minute's climb is six readings, and a leftover is told within a reading of its grace. */
const LOOK_MS = 10_000;
/**
 * The readings a climb spans: six steps of {@link LOOK_MS}, a minute. Ours:
 * a test that leaks keeps leaking for as long as it runs, and a build's or
 * a bundler's peak rises for seconds, then falls.
 */
const WINDOW = 6;
/**
 * The resident memory past which one process that keeps climbing is a leak,
 * in GiB (`CAWCO_LEAK_MEMORY_GIB` to set another, a number above 0). From
 * what runs here measured: a whole probe kit run, every process together,
 * peaks around 8 GiB (composer-canvas on obelisk, 2026-10-14: 4.2 GiB peak
 * RSS over its scratch fleet, dashboard build and Chromium; the slot the old
 * heavy-run gate sized from it was twice that, 8 GiB); the largest child
 * tree on obelisk on 2026-10-13 was 4.9 GB and the largest Claude session
 * 1.7 GB (sessiond cgroup.ts `CHILD_TASKS`). One process alone past what a
 * whole run reaches, still climbing, is past anything a run needs.
 */
const LEAK_MEMORY_GIB = 8;
const LEAK_MEMORY_ENV = "CAWCO_LEAK_MEMORY_GIB";
/** The least a climb rises over its {@link WINDOW}, in bytes. Ours: under it the readings are a process holding still. */
const CLIMB_MIN = 64 * 1024 ** 2;
/** How far one reading may fall below the one before and the climb still stand, a share. Ours: the allocator's give and take. */
const DIP = 0.01;
/** How long a process stays left behind before its session is told. */
const ORPHAN_GRACE_MS = 10_000;
/**
 * The share of one core a child's processes, itself aside, use between two
 * readings for the child to be working. Ours: an idle MCP server or shell
 * uses well under a hundredth of a core; a bundler, a test run or a compiler
 * uses most of one or more, and its waits for a build or a network answer
 * still sum above a quarter over {@link LOOK_MS}.
 */
const WORKING_SHARE = 0.25;
/** The most leftovers one message names; the rest are counted. */
const NAMED = 8;
/** Where the cgroup v2 hierarchy is mounted. */
const CGROUP_ROOT = "/sys/fs/cgroup";
/** The keeper's groups of its children's own groups: `children`, and `children/workspaces` for a workspace's own processes (sessiond cgroup.ts `CHILDREN_GROUP`, `WORKSPACES_GROUP`). */
const CHILDREN_GROUPS = ["/children", "/children/workspaces"];
/** `/proc/<pid>/status`'s pids of a process, one per pid namespace it is in, innermost last. */
const NS_PID = /^NSpid:\s*(.+)$/mu;
const BLANKS = /\s+/u;

/** Who a keeper child's leaks are told to, and where its processes run. */
export interface LeakTarget {
  instanceIds: string[];
  /** The workspace whose boundary the child is, when it is one. */
  workspace?: string;
}

/** A process once: its pid and its start, so a pid given out again is another. */
const keyOf = (row: Pick<ProcessLineage, "pid" | "startSeconds">): string =>
  `${row.pid}@${row.startSeconds}`;

/** The leak threshold in bytes ({@link LEAK_MEMORY_GIB}), or why the setting is not one. */
const threshold = (): number => {
  const raw = process.env[LEAK_MEMORY_ENV];
  if (raw === undefined || raw === "") {
    return LEAK_MEMORY_GIB * GIB;
  }
  const gib = Number(raw);
  if (!(Number.isFinite(gib) && gib > 0)) {
    throw new Error(
      `${LEAK_MEMORY_ENV} is the resident memory of a leaking process, in GiB, a number above 0; it is "${raw}"`
    );
  }
  return gib * GIB;
};

const gib = (bytes: number): string =>
  `${(bytes / GIB).toFixed(bytes < GIB ? 2 : 1)} GiB`;

/** A process's cgroup v2 path, from the mount; undefined where it has none. */
const cgroupOf = async (pid: number): Promise<string | undefined> =>
  (await readFile(`/proc/${pid}/cgroup`, "utf8").catch(() => ""))
    .split("\n")
    .find((line) => line.startsWith("0::"))
    ?.slice(3)
    .trim();

/** What a keeper's cgroup name keeps of a procId: the rest becomes `_` (sessiond cgroup.ts `openChildGroup`). */
const UNNAMEABLE = /[^A-Za-z0-9_-]/gu;

/**
 * Linux: the cgroup dir the keeper made for child `procId` (process `pid`),
 * when it made one: `children/<procId>-<serial>`, or
 * `children/workspaces/<procId>-<serial>` (sessiond cgroup.ts
 * `openChildGroup`). A keeper with no cgroups of its own runs its children
 * in its own group, which may itself be another keeper's child's (a scratch
 * fleet inside a workspace's boundary): that group is not this child's.
 */
const ownGroup = async (
  procId: string,
  pid: number
): Promise<string | undefined> => {
  if (process.platform !== "linux") {
    return;
  }
  const path = await cgroupOf(pid);
  return path &&
    CHILDREN_GROUPS.some((group) => dirname(path).endsWith(group)) &&
    basename(path).startsWith(`${procId.replace(UNNAMEABLE, "_")}-`)
    ? join(CGROUP_ROOT, path)
    : undefined;
};

/** Every pid in cgroup `dir` and the groups below it. */
const groupPids = async (dir: string): Promise<number[]> => {
  const [procs, entries] = await Promise.all([
    readFile(join(dir, "cgroup.procs"), "utf8").catch(() => ""),
    readdir(dir, { withFileTypes: true }).catch(() => []),
  ]);
  const below = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => groupPids(join(dir, entry.name)))
  );
  return [
    ...procs
      .split("\n")
      .filter(Boolean)
      .map(Number)
      .filter((pid) => pid > 0),
    ...below.flat(),
  ];
};

/** The pid a process has in its innermost pid namespace: what its session's shell calls it. */
const shownPid = async (pid: number): Promise<number> => {
  if (process.platform !== "linux") {
    return pid;
  }
  const status = await readFile(`/proc/${pid}/status`, "utf8").catch(() => "");
  const last = NS_PID.exec(status)?.[1]?.trim().split(BLANKS).at(-1);
  return last ? Number(last) : pid;
};

/** A process's command line, cut to one line a person reads. */
const commandOf = async (pid: number): Promise<string> => {
  const command = ((await commandLine(pid)) ?? "?").replaceAll("`", "'");
  return command.length > 160 ? `${command.slice(0, 157)}…` : command;
};

/** Where a child's process runs, in words: its workspace, else this machine and its directory. */
const whereOf = async (target: LeakTarget, pid: number): Promise<string> => {
  if (target.workspace) {
    return `in workspace ${target.workspace.slice(0, 8)}`;
  }
  const cwd =
    process.platform === "linux"
      ? await readlink(`/proc/${pid}/cwd`).catch(() => undefined)
      : undefined;
  return `on ${hostname()}${cwd ? ` in ${cwd}` : ""}`;
};

/** One process's memory over the last readings, and the threshold multiple last told. */
interface Climb {
  readings: number[];
  told: number;
}

/** What the watch remembers between readings. */
interface Watching {
  climbs: Map<string, Climb>;
  /** Each process's CPU time at its last reading, in microseconds, and when it was read (epoch ms). */
  cpu: Map<string, { at: number; used: number }>;
  /** When each leftover was first seen left behind, by process. */
  left: Map<string, number>;
  /**
   * The leaks told and not yet ended, by id: the sessions told and the
   * processes it names; a memory leak's one process is `climbing`.
   */
  open: Map<
    string,
    { climbing?: string; instanceIds: string[]; keys: string[] }
  >;
  /** Leftovers already told. */
  told: Set<string>;
  /** Each child's processes as last read, by the child's own process, where it has no cgroup. */
  trees: Map<string, Map<number, number>>;
}

/**
 * The processes child `root` started, itself included, from `rows`: its
 * cgroup's when it has its own, else its tree ({@link Watching.trees}) and
 * `named`, the processes a macOS boundary's profile names its own.
 */
const membersOf = async (
  procId: string,
  root: ProcessLineage,
  rows: ReadonlyMap<number, ProcessLineage>,
  byParent: ReadonlyMap<number, ProcessLineage[]>,
  watching: Watching,
  named: readonly number[]
): Promise<Map<number, ProcessLineage>> => {
  const members = new Map<number, ProcessLineage>();
  const group = await ownGroup(procId, root.pid);
  if (group) {
    for (const pid of await groupPids(group)) {
      const row = rows.get(pid);
      if (row) {
        members.set(pid, row);
      }
    }
    members.set(root.pid, root);
    return members;
  }
  const take = (row: ProcessLineage): void => {
    if (members.has(row.pid)) {
      return;
    }
    members.set(row.pid, row);
    for (const child of byParent.get(row.pid) ?? []) {
      take(child);
    }
  };
  take(root);
  for (const pid of named) {
    const row = rows.get(pid);
    if (row) {
      take(row);
    }
  }
  for (const [pid, start] of watching.trees.get(keyOf(root)) ?? []) {
    const row = rows.get(pid);
    if (row?.startSeconds === start) {
      take(row);
    }
  }
  watching.trees.set(
    keyOf(root),
    new Map([...members.values()].map((row) => [row.pid, row.startSeconds]))
  );
  return members;
};

/** A leak to tell: its id, the words the session reads, and what was found, for its row's line. */
interface Told {
  found: LeakFound;
  id: string;
  /** The processes it names, each by {@link keyOf}. */
  keys: string[];
  words: string;
}

/**
 * A climb read once more: the words to tell when it is a leak not yet told
 * at this height, else nothing.
 */
const climbed = async (
  row: ProcessLineage,
  resident: number,
  watching: Watching,
  limit: number,
  target: LeakTarget
): Promise<Told | undefined> => {
  const key = keyOf(row);
  const climb = watching.climbs.get(key) ?? { readings: [], told: 0 };
  watching.climbs.set(key, climb);
  climb.readings = [...climb.readings, resident].slice(-(WINDOW + 1));
  const { readings } = climb;
  const first = readings[0] ?? 0;
  const steady =
    readings.length === WINDOW + 1 &&
    readings.every(
      (reading, at) =>
        at === 0 || reading >= (readings[at - 1] ?? 0) * (1 - DIP)
    ) &&
    resident - first >= CLIMB_MIN;
  const height = Math.floor(resident / limit);
  if (!steady || height < 1 || height <= climb.told) {
    return;
  }
  climb.told = height;
  const [command, pid, where] = await Promise.all([
    commandOf(row.pid),
    shownPid(row.pid),
    whereOf(target, row.pid),
  ]);
  return {
    id: `leak-memory-${key}-${height}`,
    found: { kind: "memory", command, resident: gib(resident) },
    keys: [key],
    words: leakWords.memory(
      command,
      pid,
      where,
      gib(resident),
      gib(first),
      LOOK_MS / 1000,
      gib(limit)
    ),
  };
};

/** A workspace boundary's sandbox (boundary.ts `sandboxOf`): Linux's init and what it held at the start, the Mac's processes by its profile. */
type Sandbox =
  { idle: readonly number[]; inner: number } | { members: readonly number[] };

/** A browser's crash handler, by its file's name: Chromium's and Chrome's `chrome_crashpad_handler`, Edge's `msedge_crashpad_handler`, a Mac helper's `… Crashpad Handler`. */
const CRASH_HANDLER = /crashpad[_ ]handler$/iu;
const APP = ".app/";

/** The install a file is part of: its `.app` bundle on the Mac, else its folder (a browser's helpers and crash handler stand beside it). */
const installOf = (path: string): string => {
  const app = path.indexOf(APP);
  return app === -1 ? dirname(path) : path.slice(0, app + APP.length - 1);
};

/**
 * The crash handlers among `members` whose browser still runs: each one
 * whose install a process of `members` that is no crash handler runs from.
 * Chromium starts its crash handlers in a session of their own, their
 * parent gone at once (ppid 1: "the process that started them ended" from
 * their first instant), and each exits once every process it watches has
 * ("Generally speaking the handler process exits when all of its
 * connected clients have exited", crashpad-dev,
 * https://groups.google.com/a/chromium.org/g/crashpad-dev/c/Wpb6JjA75Vo).
 * So a handler is no leftover while its browser runs; once the browser has
 * ended, one still standing is.
 */
const browsersHandlers = async (
  members: ReadonlyMap<number, ProcessLineage>
): Promise<Set<number>> => {
  const files = await Promise.all(
    [...members.keys()].map(
      async (pid) => [pid, await executablePath(pid)] as const
    )
  );
  const handler = (file: string) => CRASH_HANDLER.test(basename(file));
  const running = new Set(
    files.flatMap(([, file]) =>
      file && !handler(file) ? [installOf(file)] : []
    )
  );
  return new Set(
    files.flatMap(([pid, file]) =>
      file && handler(file) && running.has(installOf(file)) ? [pid] : []
    )
  );
};

/** The leftovers of `members` past their grace and not yet told, in words; nothing when there are none. */
const leftovers = async (
  root: ProcessLineage,
  members: ReadonlyMap<number, ProcessLineage>,
  sandbox: Sandbox | undefined,
  watching: Watching,
  target: LeakTarget
): Promise<Told | undefined> => {
  const init = sandbox && "inner" in sandbox ? sandbox : undefined;
  const idle = new Set(init?.idle);
  const now = Date.now();
  // A pid namespace's init (its parent 0, outside its namespace) is no one's leftover.
  const orphans = [...members.values()].filter(
    (row) =>
      row.pid !== root.pid &&
      row.ppid !== 0 &&
      (!members.has(row.ppid) ||
        (row.ppid === init?.inner && !idle.has(row.pid))) &&
      !watching.told.has(keyOf(row))
  );
  const browsing =
    orphans.length > 0 ? await browsersHandlers(members) : new Set<number>();
  const due: ProcessLineage[] = [];
  for (const row of orphans) {
    const key = keyOf(row);
    // Its grace starts over once its browser has ended.
    if (browsing.has(row.pid)) {
      watching.left.delete(key);
      continue;
    }
    const since = watching.left.get(key) ?? now;
    watching.left.set(key, since);
    if (now - since >= ORPHAN_GRACE_MS) {
      due.push(row);
    }
  }
  if (due.length === 0) {
    return;
  }
  for (const row of due) {
    watching.told.add(keyOf(row));
  }
  const named = await Promise.all(
    due.slice(0, NAMED).map(async (row) => {
      const [command, pid] = await Promise.all([
        commandOf(row.pid),
        shownPid(row.pid),
      ]);
      const minutes = Math.max(
        0,
        Math.round((now / 1000 - row.startSeconds) / 60)
      );
      return `\`${command}\` (pid ${pid}, started ${minutes} min ago)`;
    })
  );
  return {
    id: `leak-left-${due.map(keyOf).join(",")}`,
    found: { kind: "left", count: due.length },
    keys: due.map(keyOf),
    words: leakWords.left(
      due.length,
      named.join(", "),
      due.length - named.length,
      await whereOf(target, root.pid)
    ),
  };
};

/** Forgets what no process in `alive` is any more. */
const forget = (watching: Watching, alive: ReadonlySet<string>): void => {
  for (const map of [watching.climbs, watching.left, watching.cpu]) {
    for (const key of map.keys()) {
      if (!alive.has(key)) {
        map.delete(key);
      }
    }
  }
  for (const key of watching.told) {
    if (!alive.has(key)) {
      watching.told.delete(key);
    }
  }
  for (const key of watching.trees.keys()) {
    if (!alive.has(key)) {
      watching.trees.delete(key);
    }
  }
};

/** How the watch reaches the agent: who a child's leaks are told to, a boundary's sandbox, and the telling. */
interface LeakOptions {
  /** A leak told before has ended ({@link endedLeaks}): its sessions and its id. */
  ended: (instanceIds: string[], id: string) => void;
  sandboxOf: (
    workspace: string,
    pid: number,
    pids: readonly number[]
  ) => Promise<Sandbox | undefined>;
  targetOf: (procId: string, pid: number) => LeakTarget;
  tell: (
    instanceIds: string[],
    id: string,
    words: string,
    found: LeakFound
  ) => void;
}

/** One reading of the machine's process table, by pid and by parent. */
interface Table {
  byParent: ReadonlyMap<number, ProcessLineage[]>;
  rows: ReadonlyMap<number, ProcessLineage>;
}

/**
 * What child `root`'s processes, itself aside, did since their last reading:
 * the share of one core they used together and the busiest one's pid, or
 * nothing when none was read before.
 */
const cpuSince = async (
  root: ProcessLineage,
  members: ReadonlyMap<number, ProcessLineage>,
  watching: Watching
): Promise<{ busiest: number; share: number } | undefined> => {
  const shares = await Promise.all(
    [...members.values()].map(async (row) => {
      const used = await cpuTimeUsed(row.pid);
      if (used === undefined) {
        return;
      }
      const key = keyOf(row);
      const at = Date.now();
      const before = watching.cpu.get(key);
      watching.cpu.set(key, { at, used });
      return row.pid === root.pid || !before || at <= before.at
        ? undefined
        : {
            pid: row.pid,
            share: (used - before.used) / 1000 / (at - before.at),
          };
    })
  );
  let busiest: { pid: number; share: number } | undefined;
  let share = 0;
  for (const one of shares) {
    if (one) {
      share += one.share;
      busiest = !busiest || one.share > busiest.share ? one : busiest;
    }
  }
  return busiest ? { busiest: busiest.pid, share } : undefined;
};

/** One keeper child read once: its leaks found, told to its sessions; the words for its work when it is {@link WORKING_SHARE} busy. */
const lookAtChild = async (
  child: { pid: number; procId: string; target: LeakTarget },
  table: Table,
  watching: Watching,
  limit: number,
  options: LeakOptions
): Promise<string | undefined> => {
  const root = table.rows.get(child.pid);
  if (!root) {
    return;
  }
  const sandbox = child.target.workspace
    ? await options.sandboxOf(child.target.workspace, child.pid, [
        ...table.rows.keys(),
      ])
    : undefined;
  const members = await membersOf(
    child.procId,
    root,
    table.rows,
    table.byParent,
    watching,
    sandbox && "members" in sandbox ? sandbox.members : []
  );
  const memory = await Promise.all(
    [...members.values()].map(async (row) => {
      const resident = await residentBytes(row.pid);
      return resident === undefined
        ? undefined
        : climbed(row, resident, watching, limit, child.target);
    })
  );
  const left = await leftovers(root, members, sandbox, watching, child.target);
  for (const found of [...memory, left]) {
    if (found) {
      console.warn(
        `[leaks] ${child.procId}: ${found.words} (told ${child.target.instanceIds.join(", ")})`
      );
      options.tell(
        child.target.instanceIds,
        found.id,
        found.words,
        found.found
      );
      watching.open.set(found.id, {
        instanceIds: child.target.instanceIds,
        keys: found.keys,
        ...(found.found.kind === "memory" ? { climbing: found.keys[0] } : {}),
      });
    }
  }
  const cpu = await cpuSince(root, members, watching);
  if (!cpu || cpu.share < WORKING_SHARE) {
    return;
  }
  return `\`${await commandOf(cpu.busiest)}\` in session ${child.target.instanceIds.map((id) => id.slice(0, 8)).join(", ")} (${Math.round(cpu.share * 100)}% of a core)`;
};

/**
 * The leaks told that have ended since, each said to `ended` once and
 * forgotten: every process it named gone from `alive`, or the one a memory
 * leak names fallen back under `limit` at its last reading (it is told
 * again should it climb past it again).
 */
const endedLeaks = (
  watching: Watching,
  alive: ReadonlySet<string>,
  limit: number,
  ended: LeakOptions["ended"]
): void => {
  for (const [id, leak] of watching.open) {
    const climb = leak.climbing
      ? watching.climbs.get(leak.climbing)
      : undefined;
    const fell =
      climb !== undefined && (climb.readings.at(-1) ?? limit) < limit;
    if (!(fell || leak.keys.every((key) => !alive.has(key)))) {
      continue;
    }
    if (climb && fell) {
      climb.told = 0;
    }
    watching.open.delete(id);
    console.info(
      `[leaks] ${id} ended (${fell ? "its memory fell back" : "its processes are gone"}), told ${leak.instanceIds.join(", ")}`
    );
    ended(leak.instanceIds, id);
  }
};

/** The keeper children working at the watch's last reading, in words: what awake.ts holds idle sleep off for. */
let working: readonly string[] = [];

/** The runs the sessions' processes are working on, as the leak watch last read them ({@link WORKING_SHARE}). */
export const runsWorking = (): readonly string[] => working;

/**
 * Starts the watch: every {@link LOOK_MS}, each keeper child `targetOf`
 * names sessions for is read, and each leak found is handed to `tell` with
 * its sessions, its id (one leak's, the same however often it is found) and
 * its words. `sandboxOf` answers a workspace boundary's sandbox (boundary.ts
 * `sandboxOf`). Once per agent.
 */
export const watchLeaks = (options: LeakOptions): void => {
  const watching: Watching = {
    climbs: new Map(),
    cpu: new Map(),
    left: new Map(),
    open: new Map(),
    trees: new Map(),
    told: new Set(),
  };
  /** The last look's failure, said once until it changes. */
  let failed: string | undefined;
  const look = async (): Promise<void> => {
    const limit = threshold();
    const children = (await keeperChildren())
      .map((child) => ({
        ...child,
        target: options.targetOf(child.procId, child.pid),
      }))
      .filter((child) => child.target.instanceIds.length > 0);
    if (children.length === 0 && watching.open.size === 0) {
      forget(watching, new Set());
      working = [];
      return;
    }
    // Read while a leak told is open, sessions or none: a leftover outlives
    // the session that left it.
    const lineage = await processLineage();
    const byParent = new Map<number, ProcessLineage[]>();
    for (const row of lineage) {
      byParent.set(row.ppid, [...(byParent.get(row.ppid) ?? []), row]);
    }
    const table: Table = {
      rows: new Map(lineage.map((row) => [row.pid, row])),
      byParent,
    };
    const now: string[] = [];
    for (const child of children) {
      // biome-ignore lint/performance/noAwaitInLoops: one child at a time, each read against the same table
      const work = await lookAtChild(child, table, watching, limit, options);
      if (work) {
        now.push(work);
      }
    }
    working = now;
    const alive = new Set(lineage.map(keyOf));
    endedLeaks(watching, alive, limit, options.ended);
    forget(watching, alive);
  };
  const again = (): void => {
    setTimeout(() => {
      look()
        .then(() => {
          failed = undefined;
        })
        .catch((error: unknown) => {
          const why = error instanceof Error ? error.message : String(error);
          if (why !== failed) {
            failed = why;
            console.error(
              `[leaks] a look at the sessions' processes failed: ${why}`
            );
          }
        })
        .finally(again);
    }, LOOK_MS).unref();
  };
  again();
};
