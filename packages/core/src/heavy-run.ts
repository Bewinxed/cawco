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
 *
 * Both also read how full swap is: Linux's SwapFree, the Mac's
 * `vm.swapusage`. On 2026-10-19 the Mac had 29.6 GiB swapped out of 32 GiB
 * of memory at a load of 800, and its swap read-back refused heavy runs while
 * nothing held a session start. Memory's readings alone
 * ({@link measureMemoryRoom}) hold session starts and simulator boots, in
 * the same words.
 *
 * A work item's landing gate goes first. A run under a gate step
 * ({@link HEAVY_GATE_ENV}, set by the machine that runs the step: core
 * harness.ts `CommandRun.gate`) holds a ticket while it waits, a
 * `gate-<arrival>-<pid>` file in `heavy-runs/` it holds `flock(2)` on, made
 * under the `gate` file's lock so arrivals are in order. While any ticket is
 * held, a free slot goes only to the oldest ticket's run; every other run
 * waits, its `wait heavy` line naming that gate. A ticket whose holder ended
 * (a SIGKILL included) is unlocked, and the next look under the gate deletes
 * it. Before 2026-10-18 a leaf's probe kit run held the Mac's one slot for 35
 * minutes while four landing gates waited, and a slot went to whichever
 * waiting run polled first.
 */
import { dlopen, FFIType, ptr } from "bun:ffi";
import {
  closeSync,
  ftruncateSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeSync,
} from "node:fs";
import { availableParallelism, hostname, totalmem } from "node:os";
import { join } from "node:path";
import { openLockFile, tryLock, unlock } from "./flock";
import { HEAVY_GATE_ENV, QUEUE_MARKER } from "./harness";
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
 * Linux: the least share of swap left free (`/proc/meminfo` SwapFree over
 * SwapTotal, a percent) that still admits. Our call: Linux's swap is the
 * size it was made, and once it is full the next allocation that cannot be
 * reclaimed is the OOM killer's; a tenth left is the last moment a start can
 * still be held back rather than ended. A machine with no swap has none to
 * fill and is read on its memory stall alone.
 */
const LINUX_SWAP_FREE_MIN_PCT = 10;
/**
 * macOS: the most swap in use (`vm.swapusage` used), as a percent of the
 * Mac's memory, that still admits. macOS adds swap files as it needs them, so
 * `vm.swapusage`'s free is the slack in the files made so far, not what is
 * left: at rest it read 1 GiB free of 10 GiB (2026-10-17), on the night of
 * 2026-10-19 1.4 GiB free of 31 GiB. What tells the two apart is how much is
 * swapped out against the memory there is to bring it back into: 9 GiB of 32
 * (28%) at rest, 29.6 GiB of 32 (93%) with the Mac paging at a load of 800.
 * Our call: half of memory, between the two.
 */
const MAC_SWAP_USED_MAX_PCT = 50;

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
  swapFreeMin: "CAWCO_HEAVY_SWAP_FREE_MIN_PCT",
  swapUsedMax: "CAWCO_HEAVY_SWAP_USED_MAX_PCT",
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

/**
 * One reading of the machine's room: whether it admits, in words, and
 * whether it is one of memory's ({@link measureMemoryRoom} reads those
 * alone).
 */
interface Reading {
  memory: boolean;
  ok: boolean;
  words: string;
}

/** Readings as the queue says them: each in turn, a refusing one marked. */
const roomOf = (readings: Reading[]): Room => ({
  ok: readings.every((reading) => reading.ok),
  words: `this machine's measured room: ${readings.map((reading) => `${reading.words}${reading.ok ? "" : " ✗"}`).join(", ")}`,
});

const SOME_AVG10 = /^some avg10=([\d.]+)/m;
const MEM_AVAILABLE = /^MemAvailable:\s+(\d+) kB$/m;
const SWAP_TOTAL = /^SwapTotal:\s+(\d+) kB$/m;
const SWAP_FREE = /^SwapFree:\s+(\d+) kB$/m;

const gib = (bytes: number): string => `${(bytes / GIB).toFixed(1)} GiB`;

/** A pressure file's "some avg10", a percent. */
const someAvg10 = (path: string): number => {
  const found = SOME_AVG10.exec(readFileSync(path, "utf8"));
  if (!found) {
    throw new Error(`${path} has no "some avg10=" line`);
  }
  return Number(found[1]);
};

/** A `/proc/meminfo` line's kB, as bytes. */
const meminfoBytes = (meminfo: string, line: RegExp, name: string): number => {
  const found = line.exec(meminfo);
  if (!found) {
    throw new Error(`/proc/meminfo has no ${name} line`);
  }
  return Number(found[1]) * 1024;
};

/**
 * Swap's reading from SwapTotal and SwapFree: refused once less than the
 * least share is left free while memory is short too (MemAvailable under
 * {@link LINUX_SWAP_FREE_MIN_PCT} of RAM). A full swap beside plenty of
 * memory is pages nothing uses: obelisk's 0.5 GiB was all in use with
 * 100 GiB available (2026-10-19), and refused there it would hold every
 * start on a machine with room.
 */
const linuxSwap = (meminfo: string, available: number): Reading => {
  const total = meminfoBytes(meminfo, SWAP_TOTAL, "SwapTotal");
  const free = meminfoBytes(meminfo, SWAP_FREE, "SwapFree");
  const freeMin = threshold(ROOM_ENV.swapFreeMin, LINUX_SWAP_FREE_MIN_PCT);
  if (total === 0) {
    return { memory: true, ok: true, words: "no swap" };
  }
  const share = (100 * free) / total;
  const short = (100 * available) / totalmem() < LINUX_SWAP_FREE_MIN_PCT;
  return {
    memory: true,
    ok: share >= freeMin || !short,
    words: `swap ${gib(free)} free of ${gib(total)}, ${share.toFixed(0)}% (a start needs ${freeMin}% free once under ${LINUX_SWAP_FREE_MIN_PCT}% of memory is available)`,
  };
};

const linuxReadings = (): Reading[] => {
  const memoryMax = threshold(ROOM_ENV.memoryStall, MEMORY_STALL_MAX);
  const cpuMax = threshold(ROOM_ENV.cpuStall, CPU_STALL_MAX);
  const reserve =
    process.env[ROOM_ENV.reserveGib] !== undefined &&
    process.env[ROOM_ENV.reserveGib] !== ""
      ? threshold(ROOM_ENV.reserveGib, 0) * GIB
      : Math.max(RESERVE_FLOOR, totalmem() * RESERVE_SHARE);
  const memory = someAvg10("/proc/pressure/memory");
  const cpu = someAvg10("/proc/pressure/cpu");
  const meminfo = readFileSync("/proc/meminfo", "utf8");
  const free = meminfoBytes(meminfo, MEM_AVAILABLE, "MemAvailable");
  const needs = SLOT_MEMORY + reserve;
  return [
    {
      memory: true,
      ok: memory < memoryMax,
      words: `memory stall ${memory.toFixed(2)}% of the last 10 s (a run starts under ${memoryMax})`,
    },
    linuxSwap(meminfo, free),
    {
      memory: false,
      ok: cpu < cpuMax,
      words: `CPU stall ${cpu.toFixed(2)}% (under ${cpuMax})`,
    },
    {
      memory: false,
      ok: free >= needs,
      words: `${gib(free)} available (a run needs ${gib(needs)}: ${gib(SLOT_MEMORY)} for it, ${gib(reserve)} kept for the person)`,
    },
  ];
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

/**
 * `vm.swapusage`, as `sysctl vm.swapusage` prints it: `struct xsw_usage`
 * (<sys/sysctl.h>: `xsu_total`, `xsu_avail`, `xsu_used`, each a u_int64_t,
 * then `xsu_pagesize` and `xsu_encrypted`), in bytes.
 */
const macSwapUsage = (): { free: number; total: number; used: number } => {
  const usage = new BigUint64Array(4);
  const size = new BigUint64Array([BigInt(usage.byteLength)]);
  const code = machHost().lib.symbols.sysctlbyname(
    new TextEncoder().encode("vm.swapusage\0"),
    ptr(usage),
    ptr(size),
    null,
    0
  );
  if (code !== 0) {
    throw new Error(`sysctlbyname vm.swapusage answered ${code}`);
  }
  return {
    total: Number(usage[0]),
    free: Number(usage[1]),
    used: Number(usage[2]),
  };
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

const macReadings = (): Reading[] => {
  const busyMax = threshold(ROOM_ENV.cpuBusy, MAC_CPU_BUSY_MAX);
  const swapInMax = threshold(ROOM_ENV.swapInMib, MAC_SWAPIN_MAX_MIB);
  const swapUsedMax = threshold(ROOM_ENV.swapUsedMax, MAC_SWAP_USED_MAX_PCT);
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
  const swap = macSwapUsage();
  const swapShare = (100 * swap.used) / totalmem();
  const free = (sysctlInt("kern.memorystatus_level") / 100) * totalmem();
  const level = sysctlInt("kern.memorystatus_vm_pressure_level");
  const needs = SLOT_MEMORY + reserve;
  return [
    {
      memory: false,
      ok: busy < busyMax,
      words: `CPU busy ${busy.toFixed(0)}% of the last ${seconds} s (a run starts under ${busyMax})`,
    },
    {
      memory: true,
      ok: swappedIn < swapInMax,
      words: `${swappedIn.toFixed(1)} MiB read back from swap (under ${swapInMax})`,
    },
    {
      memory: true,
      ok: swapShare < swapUsedMax,
      words: `${gib(swap.used)} swapped out, ${swapShare.toFixed(0)}% of memory (under ${swapUsedMax}%; ${gib(swap.free)} free of ${gib(swap.total)} in its swap files)`,
    },
    {
      memory: false,
      ok: free >= needs,
      words: `${gib(free)} available (a run needs ${gib(needs)}${reserve > 0 ? `: ${gib(SLOT_MEMORY)} for it, ${gib(reserve)} kept for the person` : ""})`,
    },
    {
      memory: true,
      ok: level < MAC_PRESSURE_CRITICAL,
      words: `memory pressure level ${level} (refused at ${MAC_PRESSURE_CRITICAL}, critical)`,
    },
  ];
};

/**
 * The room `pick` keeps of this machine's readings, measured now. A reading
 * that cannot be taken is no room, in words naming why: the gate never admits
 * what it could not measure for.
 */
const measured = (pick: (reading: Reading) => boolean): Room => {
  try {
    if (process.platform === "linux") {
      return roomOf(linuxReadings().filter(pick));
    }
    if (process.platform === "darwin") {
      return roomOf(macReadings().filter(pick));
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

/** This machine's room for one more heavy run, measured now: every reading. */
export const measureRoom = (): Room => measured(() => true);

/**
 * This machine's room on memory alone, measured now: what a session start and
 * a simulator boot wait on (Linux's memory stall and swap left; the Mac's
 * swap read back, swap out and pressure level), in the words the heavy-run
 * queue says them. A start needs no slot's 8 GiB, nor idle CPUs.
 */
export const measureMemoryRoom = (): Room => measured(({ memory }) => memory);

/**
 * Keeps this process's Mac readings a window deep, so {@link
 * measureMemoryRoom} answers at once in a process that measures now and then
 * (the agent, at each session start). Nothing elsewhere: Linux's kernel keeps
 * its own windows. Answers the stop.
 */
export const keepRoomSampled = (): (() => void) => {
  if (process.platform !== "darwin") {
    return () => undefined;
  }
  recordMacSample();
  const timer = setInterval(recordMacSample, MAC_WINDOW_MS / 2);
  timer.unref();
  return () => clearInterval(timer);
};

const slotsDir = (): string => join(workspaceCacheDir(), "heavy-runs");

/** Who holds a slot, or a gate's ticket, as its file says. */
export interface HeavyHolder {
  command: string;
  /** The landing gate the run is a step of, in its words ({@link heavyGate}): it goes first. */
  gate?: string;
  pid: number;
  where: string;
}
type Written = HeavyHolder & { since: number };

/** The landing gate this process runs under, in its words, when it is one's step ({@link HEAVY_GATE_ENV}). */
export const heavyGate = (): string | undefined =>
  process.env[HEAVY_GATE_ENV] || undefined;

/** A gate's ticket: `gate-<arrival, ms, 15 digits>-<pid>`, so names sort in arrival order. */
const TICKET_FILE = /^gate-(\d{15})-\d+$/;

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
  return `${holder.gate ? `${holder.gate}, ` : ""}pid ${holder.pid} in ${holder.where}, ${minutes} min: ${holder.command}`;
};

/** This process's place: a workspace's pids are its boundary's own. */
export const heavyWhere = (): string => {
  const workspace = process.env.CAWCO_WORKSPACE;
  return workspace ? `workspace ${workspace.slice(0, 8)}` : hostname();
};

/**
 * What a wait is behind, by kind and, behind a gate, which ticket: a change
 * of either is said again.
 */
interface Behind {
  kind: "slots" | "spacing" | "room" | "gate";
  ticket?: string;
  words: string;
}

/** A landing gate's place in the line: its ticket file's name, and the descriptor holding its lock. */
interface Ticket {
  fd: number;
  name: string;
}

/**
 * The tickets held in `dir`, oldest first, read under the gate's lock. One
 * whose lock is free has lost its holder, and is deleted. `mine`, this
 * process's own, is not opened again.
 */
const liveTickets = (dir: string, mine: string | undefined): string[] => {
  const live: string[] = [];
  const names = readdirSync(dir)
    .filter((name) => TICKET_FILE.test(name))
    .sort();
  for (const name of names) {
    if (name === mine) {
      live.push(name);
      continue;
    }
    const path = join(dir, name);
    let fd: number;
    try {
      fd = openLockFile(path, false);
    } catch {
      // Deleted since the listing: its holder took a slot or gave up.
      continue;
    }
    if (tryLock(fd)) {
      unlinkSync(path);
      unlock(fd);
    } else {
      closeSync(fd);
      live.push(name);
    }
  }
  return live;
};

/**
 * A gate's ticket, made and locked under the gate's lock, named after every
 * live one so it sorts last; nothing when another run holds the gate this
 * tick.
 */
const takeTicket = (dir: string, holder: HeavyHolder): Ticket | undefined => {
  const gate = openLockFile(join(dir, "gate"), true);
  if (!tryLock(gate)) {
    closeSync(gate);
    return;
  }
  try {
    const last = liveTickets(dir, undefined).at(-1);
    const after = last ? Number(TICKET_FILE.exec(last)?.[1] ?? 0) + 1 : 0;
    const name = `gate-${String(Math.max(Date.now(), after)).padStart(15, "0")}-${process.pid}`;
    const fd = openLockFile(join(dir, name), true);
    if (!tryLock(fd)) {
      closeSync(fd);
      return;
    }
    writeSync(fd, JSON.stringify({ ...holder, since: Date.now() }), 0);
    return { fd, name };
  } finally {
    unlock(gate);
  }
};

/** A gate's ticket given up: it took a slot, or its run is gone. */
const dropTicket = (dir: string, ticket: Ticket): void => {
  try {
    unlinkSync(join(dir, ticket.name));
  } catch {
    // A look under the gate deleted it already.
  }
  unlock(ticket.fd);
};

/**
 * The landing gate a run waits behind, read under the gate's lock: the
 * oldest ticket held, when it is not this run's own (`ticket`); nothing when
 * no gate waits, or this run's ticket is the oldest.
 */
const gateAhead = (
  dir: string,
  ticket: string | undefined
): Behind | undefined => {
  const [first] = liveTickets(dir, ticket);
  if (first === undefined || first === ticket) {
    return;
  }
  return {
    kind: "gate",
    ticket: first,
    words: ticket
      ? `landing gates take heavy-run slots in the order they came, and an earlier one waits: ${describe(join(dir, first))}`
      : `a landing gate waits for a heavy-run slot, and takes the next free one before any other run: ${describe(join(dir, first))}`,
  };
};

/**
 * One look at the slots under the gate: the taken slot's descriptor, or what
 * holds the run (nothing when another run holds the gate this tick). While a
 * landing gate's ticket is held, a slot goes only to the oldest ticket's run
 * (`ticket`, this run's own when it is a gate's).
 */
const tryTake = (
  dir: string,
  count: number,
  holder: HeavyHolder,
  ticket: string | undefined
): { fd: number } | { behind?: Behind } => {
  const gate = openLockFile(join(dir, "gate"), true);
  if (!tryLock(gate)) {
    closeSync(gate);
    return {};
  }
  try {
    const ahead = gateAhead(dir, ticket);
    if (ahead) {
      return { behind: ahead };
    }
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
 * A landing gate's ticket for `holder`, taken as soon as no other run holds
 * the gate's lock; nothing when `gone` ends the wait first.
 */
const queueGate = async (
  dir: string,
  holder: HeavyHolder,
  gone: () => boolean
): Promise<Ticket | undefined> => {
  for (;;) {
    const ticket = takeTicket(dir, holder);
    if (ticket) {
      return ticket;
    }
    // biome-ignore lint/performance/noAwaitInLoops: the gate's lock is held for one look at a time
    await Bun.sleep(POLL_MS);
    if (gone()) {
      return;
    }
  }
};

/**
 * Takes a slot for `holder` once one is free and the machine has room,
 * waiting as long as that takes; `gone` ends the wait early, with no slot.
 * A landing gate's run (`holder.gate`) holds a ticket while it waits, and
 * goes before every run that is not one. Each marker line goes to `say`
 * (stderr unless given).
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
  const ticket = holder.gate ? await queueGate(dir, holder, gone) : undefined;
  if (holder.gate && !ticket) {
    return;
  }
  try {
    await readyRoom();
    return await waitForSlot(dir, count, holder, ticket?.name, { say, gone });
  } finally {
    if (ticket) {
      dropTicket(dir, ticket);
    }
  }
}

/**
 * {@link takeHeavySlot}'s wait: a look at the slots each tick while the
 * machine has room, the room measured again every {@link ROOM_POLL_MS}, each
 * change of what holds the run said once.
 */
async function waitForSlot(
  dir: string,
  count: number,
  holder: HeavyHolder,
  ticket: string | undefined,
  { say, gone }: { say: (line: string) => void; gone: () => boolean }
): Promise<HeavyTaken | undefined> {
  let said: string | undefined;
  let room: Room | undefined;
  let measuredAt = 0;
  for (;;) {
    if (!room || Date.now() - measuredAt >= ROOM_POLL_MS) {
      room = measureRoom();
      measuredAt = Date.now();
    }
    let behind: Behind | undefined;
    if (room.ok) {
      const look = tryTake(dir, count, holder, ticket);
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
    const saying = behind && `${behind.kind} ${behind.ticket ?? ""}`;
    if (behind && saying !== said) {
      said = saying;
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
