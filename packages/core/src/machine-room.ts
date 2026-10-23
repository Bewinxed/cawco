/**
 * The machine's room on memory, measured on the machine itself, and its
 * contention, one reading. Two readers:
 *
 * - A SESSION'S START waits only while the machine cannot give it memory
 *   ({@link measureMemoryRoom}; agent session.ts `#roomForStart`), and
 *   starts by itself once it can. Nothing else holds a start: no limit is
 *   set on what runs, and what a run leaks is told to the session that
 *   started it (agent leak-watch.ts), and nothing is stopped.
 * - Every timing leg of the probe kit (quiet.ts) reads the machine's
 *   pressure ({@link machinePressure}) so a leg measured on a loaded machine
 *   is void and taken again.
 *
 * Linux reads one number, the kernel's own answer to "can a start get
 * memory": `/proc/meminfo` MemAvailable, "An estimate of how much memory is
 * available for starting new applications, without swapping" (Linux commit
 * 34e431b0ae39, "/proc/meminfo: provide estimated available memory",
 * Documentation/filesystems/proc.txt; https://git.kernel.org/pub/scm/linux/kernel/git/torvalds/linux.git/commit/?id=34e431b0ae398fc54ea69ff85ec700722c9da773).
 * It counts what reclaim can give back (free memory above the low
 * watermarks, half the file cache, reclaimable slab), so a machine whose
 * memory sits in cache has room, as it does.
 *
 * Neither the memory stall nor swap holds a start any more. From 2026-10-18
 * (a00f49f31) to 2026-10-23 a start waited while `/proc/pressure/memory`
 * "some" avg10 was 1% or more. That file is the root group's: it counts a
 * task stalled anywhere ("pressure stall information is also tracked for
 * tasks grouped into cgroups", https://docs.kernel.org/accounting/psi.html),
 * a task reclaiming inside its own cgroup's `memory.high` among them ("When
 * a memcg hits its limit and reclaim can't catch up with allocations, the
 * allocations are throttled by adding a delay and this throttling delay is
 * accounted as PSI stall. This artificially inflates global PSI stall levels
 * and can be misinterpreted as critical PSI pressure", Android common kernel
 * 61789b3255c8, https://android.googlesource.com/kernel/common/+/61789b3255c818c51a8db5530aeeeea62c259217).
 * "Some" is also only "the share of time in which at least some tasks are
 * stalled" (psi.html), one task in a capped workspace enough. So one bounded
 * workspace held every start on a machine with 100 GiB free: obelisk's
 * stage-1 proof on 2026-10-23 at 1.16% beside 133 GiB available, scratch
 * fleets' delegates for 3 to 9 minutes at 13 to 63% beside 106 GB on
 * 2026-10-19. Swap's share held a start only once memory was short too, which
 * MemAvailable now says on its own: a full swap beside room is pages nothing
 * uses (obelisk's 0.5 GiB, all of it in use).
 *
 * macOS has no PSI, so the Mac reads its own counterparts from the kernel
 * ({@link macReadings}), each over the same last 10 s: the pages read back in
 * from swap, how full swap is against the Mac's memory, and its pressure
 * level, refused only at critical. On 2026-10-19 the Mac had 29.6 GiB swapped
 * out of 32 GiB of memory at a load of 800.
 */
import { dlopen, FFIType, ptr } from "bun:ffi";
import { readFileSync } from "node:fs";
import { totalmem } from "node:os";

/**
 * Linux: the least MemAvailable, in MiB, that lets a session start. Our
 * call: a session's first process (its harness's runtime and the MCP
 * servers it launches) takes some hundreds of MiB, so 1 GiB is what one
 * start can be given without the kernel taking it from another's working
 * set; under it the next start waits for room, and none is stopped.
 */
const MEMORY_AVAILABLE_MIN_MIB = 1024;
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
 * Linux's least available above the machine's memory, or a Mac's most to 0,
 * and a start waits, naming the numbers; unset it and it starts). Each is a
 * number; one that is not is no room, with its name.
 */
const ROOM_ENV = {
  memoryAvailableMin: "CAWCO_ROOM_MEMORY_AVAILABLE_MIN_MIB",
  swapInMib: "CAWCO_ROOM_SWAPIN_MAX_MIB",
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
const MEM_TOTAL = /^MemTotal:\s+(\d+) kB$/m;

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
 * ({@link MACHINE_PRESSURE}, "some" avg10, each a percent). Every timing
 * leg's gate (the probe kit's quiet.ts) reads both: a timing taken while
 * anything stalled is not a clean one. A session start reads neither: a
 * stall is not a lack of room ({@link measureMemoryRoom}). Linux only.
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
 * Linux's one reading: MemAvailable, the kernel's estimate of what a new
 * program can be given without swapping, against
 * {@link MEMORY_AVAILABLE_MIN_MIB}.
 */
const linuxReadings = (): Reading[] => {
  const meminfo = readFileSync("/proc/meminfo", "utf8");
  const available = meminfoBytes(meminfo, MEM_AVAILABLE, "MemAvailable");
  const total = meminfoBytes(meminfo, MEM_TOTAL, "MemTotal");
  const min =
    threshold(ROOM_ENV.memoryAvailableMin, MEMORY_AVAILABLE_MIN_MIB) *
    1024 ** 2;
  return [
    {
      ok: available >= min,
      words: `${gib(available)} of ${gib(total)} memory available (a start needs ${gib(min)})`,
    },
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
 * on (Linux's memory available; the Mac's swap read back, swap out and
 * pressure level). A reading that cannot be taken is no room, in words
 * naming why: a start is never let go on what could not be measured.
 */
export const measureMemoryRoom = (): Room => {
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
