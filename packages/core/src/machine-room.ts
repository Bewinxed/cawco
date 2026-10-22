/**
 * The machine's room on memory, measured on the machine itself, and its
 * contention, one reading. Two readers:
 *
 * - A SESSION'S START waits while the machine's memory is thrashing or its
 *   swap is nearly full ({@link measureMemoryRoom}; agent session.ts
 *   `#roomForStart`), and starts by itself once the room is back. Added on
 *   2026-10-18 (a00f49f31, "session starts wait for memory"): a start onto a
 *   machine already paging is what turned obelisk's memory stall into a
 *   frozen desktop on 2026-10-16 (load 84, memory PSI `full avg300=12.82`;
 *   the kernel's PSI doc, https://docs.kernel.org/accounting/psi.html: "a
 *   workload that spends extended time in this state is considered to be
 *   thrashing").
 * - Every timing leg of the probe kit (quiet.ts) reads the machine's
 *   pressure ({@link machinePressure}) so a leg measured on a loaded machine
 *   is void and taken again.
 *
 * Heavy runs (a probe kit run, a typecheck, a landing gate, the release) are
 * read by neither: every one starts at once. What a run leaks is told to the
 * session that started it (agent leak-watch.ts), and nothing is stopped.
 *
 * macOS has no PSI, so the Mac reads its own counterparts from the kernel
 * ({@link macReadings}), each over the same last 10 s: the pages read back in
 * from swap, how full swap is against the Mac's memory, and its pressure
 * level, refused only at critical. On 2026-10-19 the Mac had 29.6 GiB swapped
 * out of 32 GiB of memory at a load of 800.
 *
 * The machines a run brings up for itself (stage 2's rig machines, a scratch
 * fleet's) carry {@link INSIDE_RUN_ENV}: their session starts wait on no
 * reading of the host's memory, which their own run's load moves. On
 * 2026-10-19 a stage-2 run's rig machines held their session starts 63 s on
 * the host's memory stall while its 24 machines ran.
 */
import { dlopen, FFIType, ptr } from "bun:ffi";
import { readFileSync } from "node:fs";
import { totalmem } from "node:os";

/**
 * Set on the machines a run brings up for itself (stage 2's rig machines, a
 * scratch fleet's), naming that run: a session start there waits on no
 * reading of the host's memory ({@link measureMemoryRoom}).
 */
export const INSIDE_RUN_ENV = "CAWCO_INSIDE_RUN";

/**
 * Linux: the most of the last 10 s in which some task waited on memory
 * (`/proc/pressure/memory` "some" avg10, a percent) that still lets a session
 * start. Our call: any sustained memory stall means the kernel is already
 * reclaiming from someone's working set. 1% leaves room for reclaim blips.
 */
const MEMORY_STALL_MAX = 1;
/**
 * macOS: `kern.memorystatus_vm_pressure_level` 4, critical (1 is normal, 2
 * warn), holds a start whatever the other readings say. Level 2 is this
 * Mac's resting state (35% of memory available, 2026-10-17), so it holds
 * nothing.
 */
const MAC_PRESSURE_CRITICAL = 4;
/**
 * macOS: the most memory read back in from swap over the last 10 s that
 * still lets a start go, in MiB: the Mac's reading of thrashing (Linux's
 * memory stall). Our call: at rest, with 9 GiB of 10 GiB swap in use and
 * pressure at level 2, six 10 s windows read 0 to 4 swap-ins (64 KiB at
 * most); 128 MiB in 10 s is the kernel reading back what it pushed out as
 * fast as work needs it, which no resting window comes near.
 */
const MAC_SWAPIN_MAX_MIB = 128;
/** macOS: the window every rate reading spans, as Linux's PSI avg10 does. */
const MAC_WINDOW_MS = 10_000;
/**
 * Linux: the least share of swap left free (`/proc/meminfo` SwapFree over
 * SwapTotal, a percent) that still lets a start go. Our call: Linux's swap is
 * the size it was made, and once it is full the next allocation that cannot
 * be reclaimed is the OOM killer's; a tenth left is the last moment a start
 * can still be held back rather than ended. A machine with no swap has none
 * to fill and is read on its memory stall alone.
 */
const LINUX_SWAP_FREE_MIN_PCT = 10;
/**
 * macOS: the most swap in use (`vm.swapusage` used), as a percent of the
 * Mac's memory, that still lets a start go. macOS adds swap files as it needs
 * them, so what tells rest from paging is how much is swapped out against
 * the memory there is to bring it back into: 9 GiB of 32 (28%) at rest, 29.6
 * GiB of 32 (93%) with the Mac paging at a load of 800. Our call: half of
 * memory, between the two.
 */
const MAC_SWAP_USED_MAX_PCT = 50;

/**
 * Overrides of the thresholds above, for proving a start waits and goes (set
 * one to 0 and a start waits, naming the numbers; unset it and it starts).
 * Each is a number; one that is not is no room, with its name.
 */
const ROOM_ENV = {
  memoryStall: "CAWCO_ROOM_MEMORY_STALL_MAX",
  swapInMib: "CAWCO_ROOM_SWAPIN_MAX_MIB",
  swapFreeMin: "CAWCO_ROOM_SWAP_FREE_MIN_PCT",
  swapUsedMax: "CAWCO_ROOM_SWAP_USED_MAX_PCT",
} as const;

const GIB = 1024 ** 3;

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

/** Whether the machine has room for a session to start now, and its readings in words. */
export interface Room {
  ok: boolean;
  words: string;
}

/** One reading of the machine's memory: whether it lets a start go, in words. */
interface Reading {
  ok: boolean;
  words: string;
}

/** Readings as a waiting start says them: each in turn, a refusing one marked. */
const roomOf = (readings: Reading[]): Room => ({
  ok: readings.every((reading) => reading.ok),
  words: `this machine's measured room: ${readings.map((reading) => `${reading.words}${reading.ok ? "" : " ✗"}`).join(", ")}`,
});

const SOME_AVG10 = /^some avg10=([\d.]+)/m;
const MEM_AVAILABLE = /^MemAvailable:\s+(\d+) kB$/m;
const SWAP_TOTAL = /^SwapTotal:\s+(\d+) kB$/m;
const SWAP_FREE = /^SwapFree:\s+(\d+) kB$/m;

const gib = (bytes: number): string => `${(bytes / GIB).toFixed(1)} GiB`;

/**
 * The whole machine's pressure files. Each is the root group's whatever
 * cgroup or namespace reads it: kernel/sched/psi.c answers a read of
 * `/proc/pressure/cpu` with `return psi_show(m, &psi_system, PSI_CPU);`
 * (git.kernel.org, torvalds/linux, kernel/sched/psi.c), `psi_system` being
 * the root's, where a cgroup's `cpu.pressure` counts only its own tasks'
 * waits ("pressure stall information is also tracked for tasks grouped into
 * cgroups", docs.kernel.org/accounting/psi.html).
 */
export const MACHINE_PRESSURE = {
  cpu: "/proc/pressure/cpu",
  memory: "/proc/pressure/memory",
} as const;

/**
 * THE MACHINE'S CONTENTION, ONE READING: the share of the last 10 s in which
 * some task anywhere on the machine waited for a CPU, and for memory
 * ({@link MACHINE_PRESSURE}, "some" avg10, each a percent). A session start
 * reads memory's ({@link measureMemoryRoom}) and every timing leg's gate (the
 * probe kit's quiet.ts) reads both, so the two never read different things.
 * Linux only.
 */
export interface MachinePressure {
  cpu: number;
  memory: number;
}
export const machinePressure = (): MachinePressure => ({
  cpu: someAvg10(MACHINE_PRESSURE.cpu),
  memory: someAvg10(MACHINE_PRESSURE.memory),
});

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
const linuxSwap = (meminfo: string): Reading => {
  const total = meminfoBytes(meminfo, SWAP_TOTAL, "SwapTotal");
  const free = meminfoBytes(meminfo, SWAP_FREE, "SwapFree");
  const available = meminfoBytes(meminfo, MEM_AVAILABLE, "MemAvailable");
  const freeMin = threshold(ROOM_ENV.swapFreeMin, LINUX_SWAP_FREE_MIN_PCT);
  if (total === 0) {
    return { ok: true, words: "no swap" };
  }
  const share = (100 * free) / total;
  const short = (100 * available) / totalmem() < LINUX_SWAP_FREE_MIN_PCT;
  return {
    ok: share >= freeMin || !short,
    words: `swap ${gib(free)} free of ${gib(total)}, ${share.toFixed(0)}% (a start needs ${freeMin}% free once under ${LINUX_SWAP_FREE_MIN_PCT}% of memory is available)`,
  };
};

const linuxReadings = (): Reading[] => {
  const memoryMax = threshold(ROOM_ENV.memoryStall, MEMORY_STALL_MAX);
  const { memory } = machinePressure();
  return [
    {
      ok: memory < memoryMax,
      words: `memory stall ${memory.toFixed(2)}% of the last 10 s (a start goes under ${memoryMax})`,
    },
    linuxSwap(readFileSync("/proc/meminfo", "utf8")),
  ];
};

/**
 * The Mac's readings, from the kernel through libSystem with no spawn (a
 * synchronous spawn under Bun can wedge its caller's loop, process-identity.ts
 * says why): `host_statistics64`'s `HOST_VM_INFO64` (`struct vm_statistics64`,
 * 38 integers, `swapins` at byte 112; <mach/vm_statistics.h>, checked against
 * `vm_stat` on 2026-10-17), `host_page_size`, and `sysctlbyname` for
 * `vm.swapusage` and `kern.memorystatus_vm_pressure_level`.
 */
const openMach = () =>
  dlopen("/usr/lib/libSystem.B.dylib", {
    mach_host_self: { args: [], returns: FFIType.u32 },
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
const HOST_VM_INFO64 = 4;
const VM_INFO64_COUNT = 38;
const VM_SWAPINS = 112;

/** One reading of the Mac's counter: pages swapped in since boot. */
interface MacSample {
  at: number;
  swapins: bigint;
}

const macSample = (): MacSample => {
  const { lib, host } = machHost();
  const vm = new BigUint64Array(VM_INFO64_COUNT / 2);
  const vmCount = new Uint32Array([VM_INFO64_COUNT]);
  const code = lib.symbols.host_statistics64(
    host,
    HOST_VM_INFO64,
    ptr(vm),
    ptr(vmCount)
  );
  if (code !== 0) {
    throw new Error(`host_statistics64 answered ${code} (VM), not 0`);
  }
  return {
    at: Date.now(),
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

/** This process's samples of the Mac's counter, the last minute of them. */
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

const macReadings = (): Reading[] => {
  const swapInMax = threshold(ROOM_ENV.swapInMib, MAC_SWAPIN_MAX_MIB);
  const swapUsedMax = threshold(ROOM_ENV.swapUsedMax, MAC_SWAP_USED_MAX_PCT);
  const now = recordMacSample();
  const then = windowStart(now.at);
  if (!then) {
    throw new Error(
      `its readings span less than the last ${MAC_WINDOW_MS / 1000} s so far`
    );
  }
  const swappedIn =
    (Number(now.swapins - then.swapins) * macPageSize()) / 1024 ** 2;
  const swap = macSwapUsage();
  const swapShare = (100 * swap.used) / totalmem();
  const level = sysctlInt("kern.memorystatus_vm_pressure_level");
  return [
    {
      ok: swappedIn < swapInMax,
      words: `${swappedIn.toFixed(1)} MiB read back from swap (under ${swapInMax})`,
    },
    {
      ok: swapShare < swapUsedMax,
      words: `${gib(swap.used)} swapped out, ${swapShare.toFixed(0)}% of memory (under ${swapUsedMax}%; ${gib(swap.free)} free of ${gib(swap.total)} in its swap files)`,
    },
    {
      ok: level < MAC_PRESSURE_CRITICAL,
      words: `memory pressure level ${level} (refused at ${MAC_PRESSURE_CRITICAL}, critical)`,
    },
  ];
};

/**
 * This machine's room on memory, measured now: what a session start waits
 * on (Linux's memory stall and swap left; the Mac's swap
 * read back, swap out and pressure level). A reading that cannot be taken is
 * no room, in words naming why: a start is never let go on what could not be
 * measured. A machine a run brought up for itself ({@link INSIDE_RUN_ENV})
 * always has room.
 */
export const measureMemoryRoom = (): Room => {
  const inside = process.env[INSIDE_RUN_ENV];
  if (inside) {
    return {
      ok: true,
      words: `this machine is one a run brought up for itself (${INSIDE_RUN_ENV}=${inside}), and the host's memory moves with that run's own load`,
    };
  }
  try {
    if (process.platform === "linux") {
      return roomOf(linuxReadings());
    }
    if (process.platform === "darwin") {
      return roomOf(macReadings());
    }
    return {
      ok: false,
      words: `this machine's room cannot be measured on ${process.platform}: it reads Linux's PSI or macOS's sysctl`,
    };
  } catch (error) {
    return {
      ok: false,
      words: `this machine's room could not be measured: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
};

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
