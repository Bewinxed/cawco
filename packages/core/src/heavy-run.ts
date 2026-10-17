/**
 * The machine's gate for heavy work: a dashboard build, a dev or preview
 * server, a scratch fleet and its browser, a typecheck, an Apple build. A heavy run starts only while one of the machine's slots is
 * free and the machine has room for it right now, measured on the machine
 * itself ({@link measureRoom}), so everything else holding it counts: the
 * person's apps, a GPU job's memory, other sessions. Once started, it holds
 * its slot until it ends.
 *
 * Why measured room: on 2026-10-16 obelisk (48 cores, 188 GiB) hung with a
 * load of 84 and memory PSI `full avg300=12.82` (the kernel's PSI doc,
 * https://docs.kernel.org/accounting/psi.html: "a workload that spends
 * extended time in this state is considered to be thrashing"). The slots
 * then counted only the machine's totals (8 on obelisk), blind to the
 * person's two ComfyUI servers holding 65 GiB, and the probe kit held a slot
 * only while a build ran or a server booted, so ten scratch fleets with
 * their Chromiums ran at once holding none.
 *
 * The slot count ({@link slotCount}) is the ceiling: `CAWCO_HEAVY_RUNS`, else
 * what the machine's cores and memory would carry with nothing else on it
 * ({@link machineRuns}). Each slot is a file in `heavy-runs/` under the
 * workspaces' shared cache (paths.ts `workspaceCacheDir`), the one tree every
 * workspace's boundary and the host's own shells all read and write. A run
 * holds a slot by `flock(2)` on its file (flock.ts), from a descriptor opened
 * close-on-exec, so no child keeps it: the kernel frees it when the holder
 * ends, a SIGKILL included. The holder writes who it is into the file (pid,
 * where, since, command) for a waiting run to name.
 *
 * N can differ between runs (an env set or not), so a run chooses its slot
 * under the `gate` file's lock: it counts every held `slot-<i>` file there,
 * those at i ≥ N from a larger N included, and takes a free slot below N only
 * while fewer than N are held.
 *
 * A run waiting prints one `CAWCO-QUEUE wait heavy: …` line naming what
 * holds it (the slots' holders, or the machine's measured room with its
 * numbers), again only when that changes from one to the other, and
 * `CAWCO-QUEUE held heavy` once it starts (core harness.ts `QUEUE_MARKER`; a
 * work item's check stands its clock while it waits). It re-measures the room
 * every {@link ROOM_POLL_MS}, never spinning.
 *
 * macOS has no PSI, so the Mac reads its own counterparts from the kernel
 * ({@link macRoom}), each over the same last 10 s: the share of CPU time
 * spent busy, the pages read back in from swap, the memory the kernel calls
 * available, and its pressure level, refused only at critical. Before
 * 2026-10-17 the Mac admitted a run only at pressure level 1 and a 1-minute
 * load under its core count; its resting state with nothing heavy running is
 * level 2 and a load of 7 to 16 (Colima, Brave, the sessions and their MCP
 * servers), so it started nothing for hours while twenty gates waited.
 */
import { dlopen, FFIType, ptr } from "bun:ffi";
import {
  closeSync,
  ftruncateSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeSync,
} from "node:fs";
import { availableParallelism, hostname, totalmem } from "node:os";
import { join } from "node:path";
import { openLockFile, tryLock, unlock } from "./flock";
import { QUEUE_MARKER } from "./harness";
import { workspaceCacheDir } from "./paths";

/** The ceiling on heavy runs at once, when set (a whole number from 1). */
export const HEAVY_RUNS_ENV = "CAWCO_HEAVY_RUNS";
/**
 * Set in a holder's environment: its descendants take no slot of their own,
 * so a probe kit run's scratch fleet, or a typecheck under `cawco heavy-run`, counts once.
 */
export const HEAVY_RUN_HELD_ENV = "CAWCO_HEAVY_RUN_HELD";

/**
 * What one heavy run costs, from `bun scripts/probe-kit/run.ts
 * composer-canvas` (a scratch fleet, the dashboard build, Chromium) on
 * obelisk, 2026-10-14, its whole process tree sampled every 0.5 s: peak RSS
 * 4.2 GiB (p50 2.6, p90 2.9), peak 6.8 cores over 0.5 s, 0.77 cores over
 * its 105 s. A slot is 8 GiB, twice the peak RSS (memory is what hangs a
 * host), and 6 cores, the build's peak, about 8x the run's average.
 */
const SLOT_CORES = 6;
const SLOT_MEMORY = 8 * 1024 ** 3;

/**
 * Linux: the most of the last 10 s in which some task waited on memory
 * (`/proc/pressure/memory` "some" avg10, a percent) that still admits a run.
 * Our call: any sustained memory stall means the kernel is already reclaiming
 * from someone's working set, and adding a run there is what turned obelisk's
 * stall into a frozen desktop. 1% leaves room for reclaim blips.
 */
const MEMORY_STALL_MAX = 1;
/**
 * Linux: the most of the last 10 s in which some runnable task waited for a
 * CPU (`/proc/pressure/cpu` "some" avg10, a percent) that still admits a run.
 * Our call: CPU contention alone does not freeze a desktop the way memory
 * does, and the fleet's own unit yields CPU (`CPUWeight=`), so the gate turns
 * runs away only once half the time something is already queued for a core.
 */
const CPU_STALL_MAX = 50;
/**
 * Linux: memory kept for the person beyond one slot's: the larger of 16 GiB
 * and a tenth of RAM. Our call: a browser, an editor and a desktop session
 * take several GiB and swing by several more, and a tenth scales that to a
 * large machine whose person runs large things (obelisk's GPU servers).
 */
const RESERVE_FLOOR = 16 * 1024 ** 3;
const RESERVE_SHARE = 0.1;
/**
 * macOS: `kern.memorystatus_vm_pressure_level` 4, critical (1 is normal, 2
 * warn), refuses a run whatever the other readings say. Level 2 is this
 * Mac's resting state (35% of memory available, nothing heavy running,
 * 2026-10-17), so it holds nothing.
 */
const MAC_PRESSURE_CRITICAL = 4;
/**
 * macOS: the most of the last 10 s the CPUs spent busy (user, system and
 * nice ticks over all ticks) that still admits a run, a percent: the Mac's
 * reading of Linux's "CPU stall under 50". Our call: at rest (load 12 to 16,
 * nothing heavy running, 2026-10-17) four 10 s windows read 34 to 38% busy,
 * and a build or a booting simulator drives it to near 100; 75 leaves the
 * resting Mac a run and refuses one onto CPUs that are already saturated.
 * The 1-minute load is no measure here: it read 12 to 16 with 62 to 66% of
 * CPU time idle.
 */
const MAC_CPU_BUSY_MAX = 75;
/**
 * macOS: the most memory read back in from swap over the last 10 s that
 * still admits a run, in MiB: the Mac's reading of thrashing (Linux's memory
 * stall). Our call: at rest, with 9 GiB of 10 GiB swap in use and pressure at
 * level 2, six 10 s windows read 0 to 4 swap-ins (64 KiB at most); 128 MiB
 * in 10 s is the kernel reading back what it pushed out as fast as work
 * needs it, which no resting window comes near. Decompressions say less:
 * they swung 9,000 to 36,000 pages a window at rest.
 */
const MAC_SWAPIN_MAX_MIB = 128;
/** macOS: the window every rate reading spans, as Linux's PSI avg10 does. */
const MAC_WINDOW_MS = 10_000;

/**
 * Overrides of the thresholds above, for proving the gate holds and admits
 * (set one low and a run waits, naming the numbers; unset it and it starts).
 * Each is a number; one that is not stops the gate with its name.
 */
const ROOM_ENV = {
  memoryStall: "CAWCO_HEAVY_MEMORY_STALL_MAX",
  cpuStall: "CAWCO_HEAVY_CPU_STALL_MAX",
  reserveGib: "CAWCO_HEAVY_RESERVE_GIB",
  cpuBusy: "CAWCO_HEAVY_CPU_BUSY_MAX",
  swapInMib: "CAWCO_HEAVY_SWAPIN_MAX_MIB",
} as const;

/** How often a waiting run tries the slots, and a `hold` looks for its shell. */
export const POLL_MS = 200;
/** How often a waiting run measures the room again. */
const ROOM_POLL_MS = 3000;
/**
 * The least time between two runs taking slots on one machine: the PSI
 * window (avg10), so a reading taken for the next run already shows the last
 * one. Our call: without it, every run waiting on a full machine starts in
 * the same tick the room comes back, each admitted on the same reading.
 */
const ADMIT_SPACING_MS = 10_000;
const SLOT_FILE = /^slot-(\d+)$/;
const GIB = 1024 ** 3;

/** The heavy runs this machine's cores and memory would carry with nothing else on it, at least 1. */
const machineRuns = (): number =>
  Math.max(
    1,
    Math.min(
      Math.floor(availableParallelism() / SLOT_CORES),
      Math.floor(totalmem() / SLOT_MEMORY)
    )
  );

/** The ceiling: `CAWCO_HEAVY_RUNS` when set, else {@link machineRuns}. */
export const slotCount = (): number => {
  const raw = process.env[HEAVY_RUNS_ENV];
  if (raw === undefined || raw === "") {
    return machineRuns();
  }
  const count = Number(raw);
  if (!Number.isInteger(count) || count < 1) {
    throw new Error(
      `${HEAVY_RUNS_ENV} is the most heavy runs this machine runs at once, a whole number from 1; it is "${raw}"`
    );
  }
  return count;
};

const threshold = (name: string, fallback: number): number => {
  const raw = process.env[name];
  if (raw === undefined || raw === "") {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} is a number from 0; it is "${raw}"`);
  }
  return value;
};

/** Whether the machine has room for one more heavy run now, and its readings in words. */
export interface Room {
  ok: boolean;
  words: string;
}

const SOME_AVG10 = /^some avg10=([\d.]+)/m;
const MEM_AVAILABLE = /^MemAvailable:\s+(\d+) kB$/m;

const gib = (bytes: number): string => `${(bytes / GIB).toFixed(1)} GiB`;

/** A pressure file's "some avg10", a percent. */
const someAvg10 = (path: string): number => {
  const found = SOME_AVG10.exec(readFileSync(path, "utf8"));
  if (!found) {
    throw new Error(`${path} has no "some avg10=" line`);
  }
  return Number(found[1]);
};

const linuxRoom = (): Room => {
  const memoryMax = threshold(ROOM_ENV.memoryStall, MEMORY_STALL_MAX);
  const cpuMax = threshold(ROOM_ENV.cpuStall, CPU_STALL_MAX);
  const reserve =
    process.env[ROOM_ENV.reserveGib] !== undefined &&
    process.env[ROOM_ENV.reserveGib] !== ""
      ? threshold(ROOM_ENV.reserveGib, 0) * GIB
      : Math.max(RESERVE_FLOOR, totalmem() * RESERVE_SHARE);
  const memory = someAvg10("/proc/pressure/memory");
  const cpu = someAvg10("/proc/pressure/cpu");
  const available = MEM_AVAILABLE.exec(readFileSync("/proc/meminfo", "utf8"));
  if (!available) {
    throw new Error("/proc/meminfo has no MemAvailable line");
  }
  const free = Number(available[1]) * 1024;
  const needs = SLOT_MEMORY + reserve;
  const memoryOk = memory < memoryMax;
  const cpuOk = cpu < cpuMax;
  const freeOk = free >= needs;
  const mark = (ok: boolean) => (ok ? "" : " ✗");
  return {
    ok: memoryOk && cpuOk && freeOk,
    words: `this machine's measured room: memory stall ${memory.toFixed(2)}% of the last 10 s (a run starts under ${memoryMax})${mark(memoryOk)}, CPU stall ${cpu.toFixed(2)}% (under ${cpuMax})${mark(cpuOk)}, ${gib(free)} available (a run needs ${gib(needs)}: ${gib(SLOT_MEMORY)} for it, ${gib(reserve)} kept for the person)${mark(freeOk)}`,
  };
};

/**
 * The Mac's readings, from the kernel through libSystem with no spawn (a
 * synchronous spawn under Bun can wedge its caller's loop, process-identity.ts
 * says why): `host_statistics`' `HOST_CPU_LOAD_INFO` (4 tick counters, idle at
 * 2), `host_statistics64`'s `HOST_VM_INFO64` (`struct vm_statistics64`, 38
 * integers, `swapins` at byte 112; <mach/vm_statistics.h>, checked against
 * `vm_stat` on 2026-10-17), `host_page_size`, and `sysctlbyname` for
 * `kern.memorystatus_level` (the percent of memory available, what
 * `memory_pressure -Q` calls "free") and `kern.memorystatus_vm_pressure_level`.
 */
const openMach = () =>
  dlopen("/usr/lib/libSystem.B.dylib", {
    mach_host_self: { args: [], returns: FFIType.u32 },
    host_statistics: {
      args: [FFIType.u32, FFIType.i32, FFIType.ptr, FFIType.ptr],
      returns: FFIType.i32,
    },
    host_statistics64: {
      args: [FFIType.u32, FFIType.i32, FFIType.ptr, FFIType.ptr],
      returns: FFIType.i32,
    },
    host_page_size: {
      args: [FFIType.u32, FFIType.ptr],
      returns: FFIType.i32,
    },
    sysctlbyname: {
      args: [
        FFIType.cstring,
        FFIType.ptr,
        FFIType.ptr,
        FFIType.ptr,
        FFIType.u64,
      ],
      returns: FFIType.i32,
    },
  });
let mach: { host: number; lib: ReturnType<typeof openMach> } | undefined;
const machHost = () => {
  if (!mach) {
    const lib = openMach();
    // One send right for the process's life: each call of mach_host_self adds a reference.
    mach = { lib, host: lib.symbols.mach_host_self() };
  }
  return mach;
};
const HOST_CPU_LOAD_INFO = 3;
const CPU_STATE_IDLE = 2;
const HOST_VM_INFO64 = 4;
const VM_INFO64_COUNT = 38;
const VM_SWAPINS = 112;

/** One reading of the Mac's counters: CPU ticks busy and in all, pages swapped in since boot. */
interface MacSample {
  at: number;
  busy: number;
  swapins: bigint;
  ticks: number;
}

const macSample = (): MacSample => {
  const { lib, host } = machHost();
  const cpu = new Uint32Array(4);
  const cpuCount = new Uint32Array([4]);
  const cpuCode = lib.symbols.host_statistics(
    host,
    HOST_CPU_LOAD_INFO,
    ptr(cpu),
    ptr(cpuCount)
  );
  const vm = new BigUint64Array(VM_INFO64_COUNT / 2);
  const vmCount = new Uint32Array([VM_INFO64_COUNT]);
  const vmCode = lib.symbols.host_statistics64(
    host,
    HOST_VM_INFO64,
    ptr(vm),
    ptr(vmCount)
  );
  if (cpuCode !== 0 || vmCode !== 0) {
    throw new Error(
      `host_statistics answered ${cpuCode} (CPU load) and host_statistics64 ${vmCode} (VM), not 0`
    );
  }
  const ticks = cpu.reduce((sum, each) => sum + each, 0);
  return {
    at: Date.now(),
    busy: ticks - (cpu[CPU_STATE_IDLE] ?? 0),
    ticks,
    swapins: new DataView(vm.buffer).getBigUint64(VM_SWAPINS, true),
  };
};

/** A 32-bit integer sysctl, by name. */
const sysctlInt = (name: string): number => {
  const value = new Int32Array(1);
  const size = new BigUint64Array([4n]);
  const code = machHost().lib.symbols.sysctlbyname(
    new TextEncoder().encode(`${name}\0`),
    ptr(value),
    ptr(size),
    null,
    0
  );
  if (code !== 0) {
    throw new Error(`sysctlbyname ${name} answered ${code}`);
  }
  return value[0] ?? 0;
};

/** The page size the VM counters count in. */
const macPageSize = (): number => {
  const size = new BigUint64Array(1);
  const code = machHost().lib.symbols.host_page_size(
    machHost().host,
    ptr(size)
  );
  if (code !== 0) {
    throw new Error(`host_page_size answered ${code}`);
  }
  return Number(size[0]);
};

/** This process's samples of the Mac's counters, the last minute of them. */
const macSamples: MacSample[] = [];

/** Records a sample; keeps those within six windows of it. */
const recordMacSample = (): MacSample => {
  const now = macSample();
  macSamples.push(now);
  while ((macSamples[0]?.at ?? now.at) < now.at - 6 * MAC_WINDOW_MS) {
    macSamples.shift();
  }
  return now;
};

/** The newest sample at least a window before `now`, if this process has one. */
const windowStart = (now: number): MacSample | undefined =>
  macSamples.findLast((sample) => now - sample.at >= MAC_WINDOW_MS);

/**
 * Waits, once, until this process's samples span a window, so the Mac's
 * rates can be read ({@link macRoom}); at once elsewhere, whose kernel keeps
 * its own windows.
 */
const readyRoom = async (): Promise<void> => {
  if (process.platform !== "darwin" || windowStart(Date.now())) {
    return;
  }
  const first = macSamples[0] ?? recordMacSample();
  await Bun.sleep(Math.max(0, first.at + MAC_WINDOW_MS - Date.now()));
};

const macRoom = (): Room => {
  const busyMax = threshold(ROOM_ENV.cpuBusy, MAC_CPU_BUSY_MAX);
  const swapInMax = threshold(ROOM_ENV.swapInMib, MAC_SWAPIN_MAX_MIB);
  const reserve = threshold(ROOM_ENV.reserveGib, 0) * GIB;
  const now = recordMacSample();
  const then = windowStart(now.at);
  if (!then) {
    throw new Error(
      `its readings span less than the last ${MAC_WINDOW_MS / 1000} s so far`
    );
  }
  const seconds = Math.round((now.at - then.at) / 1000);
  const busy =
    now.ticks > then.ticks
      ? (100 * (now.busy - then.busy)) / (now.ticks - then.ticks)
      : 0;
  const swappedIn =
    (Number(now.swapins - then.swapins) * macPageSize()) / 1024 ** 2;
  const free = (sysctlInt("kern.memorystatus_level") / 100) * totalmem();
  const level = sysctlInt("kern.memorystatus_vm_pressure_level");
  const needs = SLOT_MEMORY + reserve;
  const busyOk = busy < busyMax;
  const swapOk = swappedIn < swapInMax;
  const freeOk = free >= needs;
  const levelOk = level < MAC_PRESSURE_CRITICAL;
  const mark = (ok: boolean) => (ok ? "" : " ✗");
  return {
    ok: busyOk && swapOk && freeOk && levelOk,
    words: `this machine's measured room: CPU busy ${busy.toFixed(0)}% of the last ${seconds} s (a run starts under ${busyMax})${mark(busyOk)}, ${swappedIn.toFixed(1)} MiB read back from swap (under ${swapInMax})${mark(swapOk)}, ${gib(free)} available (a run needs ${gib(needs)}${reserve > 0 ? `: ${gib(SLOT_MEMORY)} for it, ${gib(reserve)} kept for the person` : ""})${mark(freeOk)}, memory pressure level ${level} (refused at ${MAC_PRESSURE_CRITICAL}, critical)${mark(levelOk)}`,
  };
};

/**
 * This machine's room for one more heavy run, measured now. A reading that
 * cannot be taken is no room, in words naming why: the gate never admits a
 * run it could not measure for.
 */
export const measureRoom = (): Room => {
  try {
    if (process.platform === "linux") {
      return linuxRoom();
    }
    if (process.platform === "darwin") {
      return macRoom();
    }
    return {
      ok: false,
      words: `this machine's room cannot be measured on ${process.platform}: the gate reads Linux's PSI or macOS's sysctl`,
    };
  } catch (error) {
    return {
      ok: false,
      words: `this machine's room could not be measured: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
};

const slotsDir = (): string => join(workspaceCacheDir(), "heavy-runs");

/** Who holds a slot, as its file says. */
export interface HeavyHolder {
  command: string;
  pid: number;
  where: string;
}
type Written = HeavyHolder & { since: number };

const readHolder = (path: string): Written | undefined => {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Written;
  } catch {
    // Not written yet: a holder writes its name just after it takes the slot.
  }
};

const describe = (path: string): string => {
  const holder = readHolder(path);
  if (!holder) {
    return "a run that has not written its name yet";
  }
  const minutes = Math.round((Date.now() - holder.since) / 60_000);
  return `pid ${holder.pid} in ${holder.where}, ${minutes} min: ${holder.command}`;
};

/** This process's place: a workspace's pids are its boundary's own. */
export const heavyWhere = (): string => {
  const workspace = process.env.CAWCO_WORKSPACE;
  return workspace ? `workspace ${workspace.slice(0, 8)}` : hostname();
};

/** What a wait is behind, by kind: a new kind is said again. */
interface Behind {
  kind: "slots" | "spacing" | "room";
  words: string;
}

/**
 * One look at the slots under the gate: the taken slot's descriptor, or what
 * holds the run (nothing when another run holds the gate this tick).
 */
const tryTake = (
  dir: string,
  count: number,
  holder: HeavyHolder
): { fd: number } | { behind?: Behind } => {
  const gate = openLockFile(join(dir, "gate"), true);
  if (!tryLock(gate)) {
    closeSync(gate);
    return {};
  }
  try {
    const indices = new Set(Array.from({ length: count }, (_, i) => i));
    for (const name of readdirSync(dir)) {
      const index = SLOT_FILE.exec(name)?.[1];
      if (index !== undefined) {
        indices.add(Number(index));
      }
    }
    const held: string[] = [];
    let free: number | undefined;
    for (const index of [...indices].sort((a, b) => a - b)) {
      const path = join(dir, `slot-${index}`);
      const fd = openLockFile(path, true);
      if (!tryLock(fd)) {
        held.push(path);
        closeSync(fd);
      } else if (free === undefined && index < count) {
        free = fd;
      } else {
        unlock(fd);
      }
    }
    if (free === undefined || held.length >= count) {
      if (free !== undefined) {
        unlock(free);
      }
      return {
        behind: {
          kind: "slots",
          words: `all ${count} heavy-run slots (${HEAVY_RUNS_ENV}, else this machine's cores and memory) are held, by ${held.map(describe).join("; ")}`,
        },
      };
    }
    const newest = Math.max(
      0,
      ...held.map((path) => readHolder(path)?.since ?? 0)
    );
    const ago = Date.now() - newest;
    if (ago < ADMIT_SPACING_MS) {
      unlock(free);
      return {
        behind: {
          kind: "spacing",
          words: `another heavy run started ${(ago / 1000).toFixed(0)} s ago, and the machine's readings show a run ${ADMIT_SPACING_MS / 1000} s after it starts`,
        },
      };
    }
    ftruncateSync(free, 0);
    writeSync(free, JSON.stringify({ ...holder, since: Date.now() }), 0);
    return { fd: free };
  } finally {
    unlock(gate);
  }
};

/** A slot taken: its descriptor's lock, and whether the run waited for it. */
export interface HeavyTaken {
  fd: number;
  waited: boolean;
}

/**
 * Takes a slot for `holder` once one is free and the machine has room,
 * waiting as long as that takes; `gone` ends the wait early, with no slot.
 * Each marker line goes to `say` (stderr unless given).
 */
export async function takeHeavySlot(
  holder: HeavyHolder,
  options: { gone?: () => boolean; say?: (line: string) => void } = {}
): Promise<HeavyTaken | undefined> {
  const say =
    options.say ?? ((line: string) => process.stderr.write(`${line}\n`));
  const gone = options.gone ?? (() => false);
  const count = slotCount();
  const dir = slotsDir();
  mkdirSync(dir, { recursive: true });
  await readyRoom();
  let said: Behind["kind"] | undefined;
  let room: Room | undefined;
  let measuredAt = 0;
  for (;;) {
    if (!room || Date.now() - measuredAt >= ROOM_POLL_MS) {
      room = measureRoom();
      measuredAt = Date.now();
    }
    let behind: Behind | undefined;
    if (room.ok) {
      const look = tryTake(dir, count, holder);
      if ("fd" in look) {
        if (said) {
          say(`${QUEUE_MARKER} held heavy`);
        }
        return { fd: look.fd, waited: said !== undefined };
      }
      ({ behind } = look);
    } else {
      behind = { kind: "room", words: room.words };
    }
    if (behind && behind.kind !== said) {
      said = behind.kind;
      say(`${QUEUE_MARKER} wait heavy: ${behind.words}`);
    }
    // biome-ignore lint/performance/noAwaitInLoops: one look per tick, until a slot and the room are both there
    await Bun.sleep(room.ok ? POLL_MS : ROOM_POLL_MS);
    if (gone()) {
      return;
    }
  }
}

/** Lets a taken slot go. */
export const releaseHeavySlot = (fd: number): void => unlock(fd);

/** `heavy-run.ts count`'s line: the ceiling, and the room over the last window. */
export const heavyRunsSaid = async (): Promise<string> => {
  await readyRoom();
  return `${slotCount()} heavy runs at most (${HEAVY_RUNS_ENV}=${process.env[HEAVY_RUNS_ENV] || "unset"}; this machine: ${availableParallelism()} cores / ${SLOT_CORES}, ${Math.floor(totalmem() / GIB)} GiB / ${SLOT_MEMORY / GIB} → ${machineRuns()}); ${measureRoom().words}`;
};
