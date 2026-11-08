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
 * A keeper whose cgroup, or one above it, has a memory limit is read under
 * that limit too: a start there gets no more than the limit leaves, however
 * much the machine has ({@link cgroupReading}).
 *
 * macOS reads the kernel's own answer too: `kern.memorystatus_vm_pressure_level`,
 * and a start waits only at critical ({@link macReadings}). Swap read back
 * and swap out held a start before 2026-10-23; neither is the kernel saying
 * memory is out, and the Mac rests with swap in use.
 */
import { dlopen, FFIType, ptr } from "bun:ffi";
import { readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

/**
 * Linux: the least room, in MiB, that lets a session start: MemAvailable,
 * and the room left under its keeper's cgroup limit when it has one. Our
 * call: a session's first process (its harness's runtime and the MCP
 * servers it launches) takes some hundreds of MiB, so 1 GiB is what one
 * start can be given without the kernel taking it from another's working
 * set; under it the next start waits for room, and none is stopped.
 */
const MEMORY_AVAILABLE_MIN_MIB = 1024;
/**
 * macOS: the `kern.memorystatus_vm_pressure_level` a start waits at. The
 * sysctl answers the dispatch level (XNU bsd/kern/kern_memorystatus_notify.c,
 * `sysctl_memorystatus_vm_pressure_level`: "uint32_t dispatch_level =
 * convert_internal_pressure_level_to_dispatch_level(memorystatus_vm_pressure_level)"),
 * one of `NOTE_MEMORYSTATUS_PRESSURE_NORMAL` 0x1, `_WARN` 0x2 (the kernel's
 * Warning and Urgent both) and `_CRITICAL` 0x4 (bsd/sys/event_private.h). XNU's
 * doc/vm/memorystatus_notify.md: Warning, "Device is beginning to experience
 * memory pressure. Consider relaxing caching policy"; Critical, "Device is in
 * a critical memory state. Expect latencies and consider dropping all
 * caches", entered when memory neither wired nor compressed falls under 1.2
 * times the threshold that unthrottles the swapper
 * (https://github.com/apple-oss-distributions/xnu/blob/main/doc/vm/memorystatus_notify.md).
 * Warn is this Mac's resting state (35% of memory available, 2026-10-17), so
 * only critical holds a start.
 */
const MAC_PRESSURE_CRITICAL = 4;

/**
 * Overrides, for proving a start waits and goes: Linux's least room set past
 * the machine's memory, or the Mac's waiting level set to 1 (normal), and a
 * start waits, naming the numbers; unset it and it starts. Each is a number;
 * one that is not is no room, with its name. `cgroupRoot` reads a scratch
 * tree in place of the cgroup v2 mount, so a limit can be shown where the
 * proof cannot make a cgroup.
 */
const ROOM_ENV = {
  memoryAvailableMin: "CAWCO_ROOM_MEMORY_AVAILABLE_MIN_MIB",
  pressureLevel: "CAWCO_ROOM_PRESSURE_LEVEL",
  cgroupRoot: "CAWCO_ROOM_CGROUP_ROOT",
} as const;

/** Where the cgroup v2 hierarchy is mounted. */
const CGROUP_ROOT = "/sys/fs/cgroup";

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

const SOME_AVG10 = /^some avg10=([\d.]+)/mu;
const MEM_AVAILABLE = /^MemAvailable:\s+(\d+) kB$/mu;
const MEM_TOTAL = /^MemTotal:\s+(\d+) kB$/mu;

const gib = (bytes: number): string => `${(bytes / GIB).toFixed(1)} GiB`;

/**
 * THE MACHINE'S CONTENTION, ONE READING: whether anything on the whole
 * machine waited for a CPU, and for memory, as each kernel says it
 * ({@link machineGauge}). Every timing leg's gate (the probe kit's quiet.ts)
 * reads both: a timing taken while anything stalled is not a clean one. A
 * session start reads neither: a stall is not a lack of room
 * ({@link measureMemoryRoom}).
 */
export interface MachinePressure {
  cpu: number;
  memory: number;
}

/** A platform's contention reading: what each value reads, in words, the most of each a quiet machine reads, and the reading. */
export interface PressureGauge {
  /** What `cpu` reads: the kernel's file or counter, and its unit. */
  cpu: string;
  /** Under these, both, the machine is quiet: a reading at either or over is contended. */
  limit: MachinePressure;
  /** What `memory` reads, the same way. */
  memory: string;
  read: () => MachinePressure;
}

/**
 * Linux: the whole machine's pressure files, "some" avg10, each the share of
 * the last 10 s in which some task waited, a percent. Each is the root
 * group's whatever cgroup or namespace reads it: kernel/sched/psi.c answers a
 * read of `/proc/pressure/cpu` with `return psi_show(m, &psi_system,
 * PSI_CPU);` (git.kernel.org, torvalds/linux, kernel/sched/psi.c),
 * `psi_system` being the root's, where a cgroup's `cpu.pressure` counts only
 * its own tasks' waits ("pressure stall information is also tracked for
 * tasks grouped into cgroups", docs.kernel.org/accounting/psi.html). Quiet
 * under 1% each: our call.
 */
const LINUX_PRESSURE = {
  cpu: "/proc/pressure/cpu",
  memory: "/proc/pressure/memory",
} as const;
const linuxGauge: PressureGauge = {
  cpu: `${LINUX_PRESSURE.cpu} some avg10 (%)`,
  memory: `${LINUX_PRESSURE.memory} some avg10 (%)`,
  limit: { cpu: 1, memory: 1 },
  read: () => ({
    cpu: someAvg10(LINUX_PRESSURE.cpu),
    memory: someAvg10(LINUX_PRESSURE.memory),
  }),
};

/**
 * macOS has no stall accounting, so each value is the kernel's own nearest
 * reading.
 *
 * CPU: the threads that wanted a CPU beyond the CPUs there are, over the
 * last 5 s, as a percent of the CPUs. `host_statistics(HOST_LOAD_INFO)`
 * copies the scheduler's `avenrun` (osfmk/kern/host.c:
 * `bcopy((char *)avenrun, (char *)load_info->avenrun, sizeof avenrun)`), "scaled by
 * LOAD_SCALE" (osfmk/mach/host_info.h, LOAD_SCALE 1000 in
 * mach/processor_info.h); its first is the "5 second average" of
 * `sched_run_buckets[TH_BUCKET_RUN] - 1`, the runnable threads less the one
 * averaging them (osfmk/kern/sched_average.c `compute_averages`), against
 * `hw.activecpu`, the CPUs the scheduler runs on (bsd/kern/kern_mib.c
 * HW_AVAILCPU). It reads 0 while every runnable thread had a CPU on average,
 * where PSI counts any moment one waited, so a burst the average smooths
 * away is not seen: the closest the kernel gives, our call. Quiet under 1%.
 * (https://github.com/apple-oss-distributions/xnu, main.) Read on the Mac
 * (10 CPUs, 2026-10-25): 0 at rest (avenrun[0] 4398), 20 spinners 122% after
 * 2 s and 874% after 10 s, 0 again 15 s after they stopped.
 *
 * Memory: `kern.memorystatus_vm_pressure_level`, the level the session start
 * reads ({@link MAC_PRESSURE_CRITICAL}): 1 normal, 2 warn, 4 critical. A
 * timing counts only at normal: at warn the "Device is beginning to
 * experience memory pressure" (XNU doc/vm/memorystatus_notify.md), the
 * compressor taking pages back as the leg runs. Our call.
 */
const MAC_LOAD_SCALE = 1000;
/** `HOST_LOAD_INFO`, host_statistics' flavor for the load (osfmk/mach/host_info.h). */
const HOST_LOAD_INFO = 1;
/** `host_load_info`: three `avenrun`, three `mach_factor`, each an integer_t. */
const HOST_LOAD_INFO_COUNT = 6;
const MAC_PRESSURE_WARN = 2;

/** The 5 s run queue beyond `hw.activecpu`, a percent of it. */
const macCpuContention = (): number => {
  system ??= openSystem();
  host ??= system.symbols.mach_host_self();
  const info = new Int32Array(HOST_LOAD_INFO_COUNT);
  const count = new Uint32Array([HOST_LOAD_INFO_COUNT]);
  const code = system.symbols.host_statistics(
    host,
    HOST_LOAD_INFO,
    ptr(info),
    ptr(count)
  );
  if (code !== 0) {
    throw new Error(`host_statistics HOST_LOAD_INFO answered ${code}`);
  }
  const runnable = (info[0] ?? 0) / MAC_LOAD_SCALE;
  const cpus = sysctlInt("hw.activecpu");
  return Math.round((Math.max(0, runnable - cpus) / cpus) * 100 * 100) / 100;
};

const macGauge: PressureGauge = {
  cpu: "the 5 s run queue beyond hw.activecpu (host_statistics HOST_LOAD_INFO avenrun[0], % of the CPUs)",
  memory: "kern.memorystatus_vm_pressure_level (1 normal, 2 warn, 4 critical)",
  limit: { cpu: 1, memory: MAC_PRESSURE_WARN },
  read: () => ({
    cpu: macCpuContention(),
    memory: sysctlInt("kern.memorystatus_vm_pressure_level"),
  }),
};

/** This machine's contention gauge; throws on a platform with none. */
export const machineGauge = (): PressureGauge => {
  if (process.platform === "linux") {
    return linuxGauge;
  }
  if (process.platform === "darwin") {
    return macGauge;
  }
  throw new Error(
    `no contention reading on ${process.platform}: Linux's /proc/pressure or macOS's host_statistics and sysctl`
  );
};

/** The machine's contention now ({@link machineGauge}). */
export const machinePressure = (): MachinePressure => machineGauge().read();

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

/** The least room a start needs, in bytes. */
const leastRoom = (): number =>
  threshold(ROOM_ENV.memoryAvailableMin, MEMORY_AVAILABLE_MIN_MIB) * 1024 ** 2;

/** A cgroup file's one value, or a flat-keyed file's `key`, read as bytes. */
const cgroupBytes = (dir: string, file: string, key?: string): number => {
  const text = readFileSync(join(dir, file), "utf8");
  const raw = key
    ? text
        .split("\n")
        .find((row) => row.startsWith(`${key} `))
        ?.slice(key.length + 1)
    : text;
  const value = Number(raw?.trim());
  if (raw === undefined || !Number.isFinite(value)) {
    throw new Error(`${join(dir, file)} has no ${key ?? "value"} in bytes`);
  }
  return value;
};

/**
 * A group's `memory.max` in bytes; undefined where it sets no limit: "max",
 * or no file, which is a group whose parent does not give the memory
 * controller to its children ("enabling it creates the controller's
 * interface files in the child cgroups … disabling "memory" from B would
 * remove the "memory." prefixed controller interface files from C and D",
 * cgroup-v2.html, Enabling and Disabling).
 */
const limitAt = (dir: string): number | undefined => {
  let max: string;
  try {
    max = readFileSync(join(dir, "memory.max"), "utf8").trim();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return;
    }
    throw error;
  }
  if (max === "max") {
    return;
  }
  const bytes = Number(max);
  if (!Number.isFinite(bytes)) {
    throw new Error(`${join(dir, "memory.max")} reads "${max}"`);
  }
  return bytes;
};

/**
 * The room left under the tightest memory limit at or above the keeper's
 * cgroup (`keeperCgroup`, as `/proc/<pid>/cgroup` names it), where a start's
 * process is placed. Each group's limit holds everything below it: the
 * kernel's cgroup v2 document (https://docs.kernel.org/admin-guide/cgroup-v2.html)
 * has `memory.max` "Memory usage hard limit … If a cgroup's memory usage
 * reaches this limit and can't be reduced, the OOM killer is invoked in the
 * cgroup", and `memory.current` "The total amount of memory currently being
 * used by the cgroup and its descendants". What the limit leaves is
 * `memory.max` less `memory.current`, with the group's `inactive_file`
 * (memory.stat: file-backed memory "on the internal memory management lists
 * used by the page reclaim algorithm") given back, as the kubelet reads a
 * cgroup's room ("The kubelet excludes inactive_file … from its calculation,
 * as it assumes that memory is reclaimable under pressure",
 * https://kubernetes.io/docs/concepts/scheduling-eviction/node-pressure-eviction/):
 * a group whose limit is full of cache it can drop has room. No reading where
 * no group above the keeper has a limit.
 */
const cgroupReading = (keeperCgroup: string): Reading | undefined => {
  const root = process.env[ROOM_ENV.cgroupRoot] || CGROUP_ROOT;
  let tightest: { dir: string; max: number; room: number } | undefined;
  for (
    let dir = join(root, keeperCgroup);
    dir.startsWith(`${root}/`);
    dir = dirname(dir)
  ) {
    const max = limitAt(dir);
    if (max === undefined) {
      continue;
    }
    const used =
      cgroupBytes(dir, "memory.current") -
      cgroupBytes(dir, "memory.stat", "inactive_file");
    const room = Math.max(0, max - used);
    if (!tightest || room < tightest.room) {
      tightest = { dir, max, room };
    }
  }
  if (!tightest) {
    return;
  }
  const min = leastRoom();
  return {
    ok: tightest.room >= min,
    words: `${gib(tightest.room)} left under the memory limit of ${gib(tightest.max)} on /${relative(root, tightest.dir)} (a start needs ${gib(min)})`,
  };
};

/**
 * Linux's readings: MemAvailable, the kernel's estimate of what a new
 * program can be given without swapping, and the room under the keeper's
 * cgroup limit when it has one, each against {@link MEMORY_AVAILABLE_MIN_MIB}.
 * A keeper that named no cgroup (one on cgroup v1) is read on the machine
 * alone.
 */
const linuxReadings = (keeperCgroup: string | undefined): Reading[] => {
  const meminfo = readFileSync("/proc/meminfo", "utf8");
  const available = meminfoBytes(meminfo, MEM_AVAILABLE, "MemAvailable");
  const total = meminfoBytes(meminfo, MEM_TOTAL, "MemTotal");
  const min = leastRoom();
  const limited =
    keeperCgroup === undefined ? undefined : cgroupReading(keeperCgroup);
  return [
    {
      ok: available >= min,
      words: `${gib(available)} of ${gib(total)} memory available (a start needs ${gib(min)})`,
    },
    ...(limited ? [limited] : []),
  ];
};

/**
 * The Mac's readings, from the kernel through libSystem with no spawn (a
 * synchronous spawn under Bun can wedge its caller's loop, process-identity.ts
 * says why): `sysctlbyname` for `kern.memorystatus_vm_pressure_level` and
 * `hw.activecpu`, `host_statistics` on the host port for the run queue.
 */
const openSystem = () =>
  dlopen("/usr/lib/libSystem.B.dylib", {
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
    mach_host_self: { args: [], returns: FFIType.u32 },
    host_statistics: {
      args: [FFIType.u32, FFIType.i32, FFIType.ptr, FFIType.ptr],
      returns: FFIType.i32,
    },
  });
let system: ReturnType<typeof openSystem> | undefined;
/** The host port, taken once: each `mach_host_self` adds a reference to it. */
let host: number | undefined;

/** A 32-bit integer sysctl, by name. */
const sysctlInt = (name: string): number => {
  system ??= openSystem();
  const value = new Int32Array(1);
  const size = new BigUint64Array([4n]);
  const code = system.symbols.sysctlbyname(
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

const LEVEL_NAMES: Record<number, string> = {
  1: "normal",
  2: "warn",
  4: "critical",
};

const macReadings = (): Reading[] => {
  const waitsAt = threshold(ROOM_ENV.pressureLevel, MAC_PRESSURE_CRITICAL);
  const level = sysctlInt("kern.memorystatus_vm_pressure_level");
  return [
    {
      ok: level < waitsAt,
      words: `memory pressure ${LEVEL_NAMES[level] ?? "level"} (${level}; a start waits at ${LEVEL_NAMES[waitsAt] ?? "level"}, ${waitsAt})`,
    },
  ];
};

/**
 * This machine's room on memory, measured now: what a session start waits
 * on. Linux: memory available, and the room under the memory limit at or
 * above `keeperCgroup`, the cgroup the keeper starts its children under
 * (sessiond's welcome). macOS: the kernel's pressure level. A reading that
 * cannot be taken is no room, in words naming why: a start is never let go
 * on what could not be measured.
 */
export const measureMemoryRoom = (keeperCgroup?: string): Room => {
  try {
    if (process.platform === "linux") {
      return roomOf(linuxReadings(keeperCgroup));
    }
    if (process.platform === "darwin") {
      return roomOf(macReadings());
    }
    return {
      ok: false,
      words: `this machine's room cannot be measured on ${process.platform}: it reads Linux's /proc/meminfo or macOS's sysctl`,
    };
  } catch (error) {
    return {
      ok: false,
      words: `this machine's room could not be measured: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
};
