/**
 * THE PROCESS READER: who a process is, beyond its number, and what the
 * machine runs. A process id is reused, so a record that names one is only
 * as good as the start time it was written with. A marker naming a process
 * counts as live only if that process is still running, was started when the
 * marker says, and the machine has not rebooted since.
 *
 * Everything is read from the kernel itself, with no spawn: `/proc` on
 * Linux; libproc and `sysctl` on macOS, where setuid `/bin/ps` is refused
 * inside a sandbox (its spawn fails with EPERM). Each reading gives the values
 * `ps` printed for it, formatted as `ps` printed them, so every record and
 * marker written from `ps` before still matches. Nothing here waits on
 * another process: a synchronous spawn under Bun waits on a private event
 * loop whose handle swap misplaces polls of the process's own loop
 * (oven-sh/bun#34069, fix open as oven-sh/bun#40078), and the session keeper
 * sat wedged on one for 35 minutes.
 */

import { dlopen, FFIType } from "bun:ffi";
import { readdir, readFile } from "node:fs/promises";

// ── macOS: libSystem ─────────────────────────────────────────────────────

/**
 * `struct kinfo_proc` (<sys/sysctl.h>, <sys/proc.h>), what
 * `sysctl(CTL_KERN, KERN_PROC, …)` answers and `ps` reads, for any user's
 * process: 648 bytes on 64-bit, `kp_proc` (`struct extern_proc`, 296 bytes)
 * then `kp_eproc`. Checked field by field against `proc_pidinfo`'s
 * `proc_bsdinfo` for every process of a user.
 */
const KINFO_SIZE = 648;
const KINFO = {
  /** `p_un.__p_starttime.tv_sec`. */
  startSeconds: 0,
  /** `p_flag`, the `P_*` flags. */
  flag: 32,
  stat: 36,
  pid: 40,
  /** `p_nice`, a signed char. */
  nice: 242,
  /** `p_comm`: `MAXCOMLEN + 1` bytes, NUL-ended; `ps` shows up to 16 characters of it. */
  comm: 243,
  commSize: 17,
  /** `kp_eproc.e_pcred.p_ruid`: the real user `ps -E` checks before it shows an environment. */
  ruid: 392,
  /** `kp_eproc.e_ppid`, `e_pgid`, `e_tpgid` and `e_flag`. */
  ppid: 560,
  pgid: 564,
  tpgid: 576,
  eFlag: 612,
} as const;
/** `p_flag` bits `ps`'s `state()` reads (<sys/proc.h>); `P_NOSWAP` and `P_PHYSIO` are 0 there. */
const P_CONTROLT = 0x2;
const P_PPWAIT = 0x10;
const P_SYSTEM = 0x2_00;
const P_TRACED = 0x8_00;
const P_WEXIT = 0x20_00;
/** `e_flag`'s session leader bit (<sys/sysctl.h>). */
const EPROC_SLEADER = 0x2;
/** `KERN_PROC` and its `KERN_PROC_ALL` and `KERN_PROC_PID` (<sys/sysctl.h>). */
const KERN_PROC = 14;
const KERN_PROC_ALL = 0;
const KERN_PROC_PID = 1;
/** `proc_pidinfo`'s `PROC_PIDTASKINFO` and its `struct proc_taskinfo` (<sys/proc_info.h>), 96 bytes. */
const PROC_PIDTASKINFO = 4;
const TASKINFO_SIZE = 96;
/** `pti_total_user` and `pti_total_system`, in Mach absolute time units. */
const TASKINFO_USER = 16;
const TASKINFO_SYSTEM = 24;
/** `CTL_KERN`, its `KERN_ARGMAX` and `KERN_PROCARGS2` (<sys/sysctl.h>). */
const CTL_KERN = 1;
const KERN_ARGMAX = 8;
const KERN_PROCARGS2 = 49;
/** `p_stat` (<sys/proc.h>): SSTOP is stopped, SZOMB a zombie; any other is read off its threads. */
const SSTOP = 4;
const SZOMB = 5;
/** `PROC_PIDLISTTHREADS`, `PROC_PIDTHREADINFO` and `struct proc_threadinfo` (112 bytes): `pth_run_state` and `pth_sleep_time`. */
const PROC_PIDLISTTHREADS = 6;
const PROC_PIDTHREADINFO = 5;
const THREADINFO_SIZE = 112;
const THREADINFO_RUN_STATE = 24;
const THREADINFO_SLEEP_TIME = 32;
/** `TH_STATE_*` (<mach/thread_info.h>). */
const TH_RUNNING = 1;
const TH_STOPPED = 2;
const TH_WAITING = 3;
const TH_UNINTERRUPTIBLE = 4;
const TH_HALTED = 5;
/**
 * `ps`'s state letters (adv_cmds ps/tasks.c `mach_state_table`), indexed by
 * `mach_state_order`: the process takes its most active thread's.
 */
const MACH_STATE_TABLE = " RUSITH?";
/** `mach_state_order`'s worst, and what a process whose threads cannot be read shows. */
const STATE_MAX = 7;
/** A thread waiting longer than this many seconds is idle (I), not sleeping (S) (`sleep_time > 20`). */
const MAXSLP = 20;
/** Thread handles asked for at first; a process with more is read again with room for twice as many. */
const THREADS_ROOM = 256;

const openLibSystem = () =>
  dlopen("/usr/lib/libSystem.B.dylib", {
    proc_pidinfo: {
      args: [FFIType.i32, FFIType.i32, FFIType.u64, FFIType.ptr, FFIType.i32],
      returns: FFIType.i32,
    },
    sysctl: {
      args: [
        FFIType.ptr,
        FFIType.u32,
        FFIType.ptr,
        FFIType.ptr,
        FFIType.ptr,
        FFIType.u64,
      ],
      returns: FFIType.i32,
    },
    mach_timebase_info: {
      args: [FFIType.ptr],
      returns: FFIType.i32,
    },
  });
let libSystem: ReturnType<typeof openLibSystem> | undefined;
const lib = (): ReturnType<typeof openLibSystem> => {
  libSystem ??= openLibSystem();
  return libSystem;
};

const decoder = new TextDecoder();

/** One process as `kinfo_proc` gives it: what `ps` lists. */
interface Kinfo {
  comm: string;
  eFlag: number;
  flag: number;
  nice: number;
  pgid: number;
  pid: number;
  ppid: number;
  ruid: number;
  startSeconds: number;
  stat: number;
  tpgid: number;
}

const kinfoAt = (bytes: Uint8Array, at: number): Kinfo => {
  const view = new DataView(bytes.buffer, bytes.byteOffset + at, KINFO_SIZE);
  const comm = bytes.subarray(
    at + KINFO.comm,
    at + KINFO.comm + KINFO.commSize
  );
  const end = comm.indexOf(0);
  return {
    startSeconds: Number(view.getBigInt64(KINFO.startSeconds, true)),
    flag: view.getUint32(KINFO.flag, true),
    stat: view.getUint8(KINFO.stat),
    pid: view.getInt32(KINFO.pid, true),
    nice: view.getInt8(KINFO.nice),
    comm: decoder.decode(end < 0 ? comm : comm.subarray(0, end)),
    ruid: view.getUint32(KINFO.ruid, true),
    ppid: view.getInt32(KINFO.ppid, true),
    pgid: view.getInt32(KINFO.pgid, true),
    tpgid: view.getInt32(KINFO.tpgid, true),
    eFlag: view.getUint32(KINFO.eFlag, true),
  };
};

/** The entries a `kinfo_proc` read came back with, refused when they are not whole entries of the size this reader knows. */
const kinfos = (bytes: Uint8Array): Kinfo[] => {
  if (bytes.byteLength % KINFO_SIZE !== 0) {
    throw new Error(
      `kinfo_proc read came back ${bytes.byteLength} bytes, not whole ${KINFO_SIZE}-byte entries`
    );
  }
  const found: Kinfo[] = [];
  for (let at = 0; at < bytes.byteLength; at += KINFO_SIZE) {
    found.push(kinfoAt(bytes, at));
  }
  return found;
};

/**
 * Every process on the machine, any user's, zombies included, as `ps -A`
 * reads them: `sysctl(CTL_KERN, KERN_PROC, KERN_PROC_ALL)`. Its size is
 * asked first, and the table can grow before the read: a read refused for
 * want of room is made again into one twice the size.
 */
const darwinKinfos = (): Kinfo[] => {
  const mib = [CTL_KERN, KERN_PROC, KERN_PROC_ALL];
  let entries = Math.ceil((sysctlSize(mib) * 1.25) / KINFO_SIZE);
  for (let tries = 0; tries < KINFO_TRIES; tries += 1) {
    const bytes = sysctl(mib, new Uint8Array(entries * KINFO_SIZE));
    if (bytes) {
      return kinfos(bytes);
    }
    entries *= 2;
  }
  throw new Error(
    `sysctl kern.proc.all refused ${KINFO_TRIES} reads, the last with room for ${entries / 2} processes`
  );
};
/** Reads of the whole table before it is said to have failed: each has twice the room of the one before. */
const KINFO_TRIES = 6;

/** One process's `kinfo_proc`, or undefined when there is no such process. */
const darwinKinfo = (pid: number): Kinfo | undefined => {
  const bytes = sysctl(
    [CTL_KERN, KERN_PROC, KERN_PROC_PID, pid],
    new Uint8Array(KINFO_SIZE)
  );
  // A pid nobody has answers with no entry at all.
  return bytes && bytes.byteLength > 0 ? kinfos(bytes)[0] : undefined;
};

/** macOS: the second the process started, from the kernel. */
const darwinStartSeconds = (pid: number): number | undefined =>
  darwinKinfo(pid)?.startSeconds;

let nanosPerTick: number | undefined;
/** Mach absolute time units in nanoseconds (`mach_timebase_info`: 125/3 on Apple silicon, 1 on Intel). */
const machNanos = (): number => {
  if (nanosPerTick === undefined) {
    const base = new Uint32Array(2);
    lib().symbols.mach_timebase_info(base);
    nanosPerTick = (base[0] ?? 1) / (base[1] ?? 1);
  }
  return nanosPerTick;
};

/**
 * macOS: the CPU time a process has used, user and system, in whole
 * microseconds (`ps` sums the task's `time_value_t`s, seconds and
 * microseconds); undefined when the kernel will not say (another user's).
 */
const darwinCpuMicroseconds = (pid: number): number | undefined => {
  const info = new Uint8Array(TASKINFO_SIZE);
  const filled = lib().symbols.proc_pidinfo(
    pid,
    PROC_PIDTASKINFO,
    0,
    info,
    TASKINFO_SIZE
  );
  if (filled !== TASKINFO_SIZE) {
    return;
  }
  const view = new DataView(info.buffer);
  const ticks =
    Number(view.getBigUint64(TASKINFO_USER, true)) +
    Number(view.getBigUint64(TASKINFO_SYSTEM, true));
  return Math.floor((ticks * machNanos()) / 1000);
};

/**
 * macOS: a live process's state letter as `ps` gives it, from its threads
 * (`p_stat` says SRUN for nearly every live process): R when one runs, else
 * U when one waits uninterruptibly, else S when one has slept no longer than
 * {@link MAXSLP} seconds and I when all have, else T when stopped. `?` when
 * its threads cannot be read (another user's, without privileges).
 */
const darwinThreadHandles = (pid: number): BigUint64Array => {
  // A buffer filled to the brim may hold only some of the threads.
  for (let room = THREADS_ROOM; ; room *= 2) {
    const handles = new BigUint64Array(room);
    const filled = lib().symbols.proc_pidinfo(
      pid,
      PROC_PIDLISTTHREADS,
      0,
      handles,
      handles.byteLength
    );
    if (filled < handles.byteLength) {
      return handles.subarray(0, Math.max(0, filled) / 8);
    }
  }
};

/** adv_cmds ps/tasks.c `mach_state_order`. */
const machStateOrder = (run: number, slept: number): number => {
  switch (run) {
    case TH_RUNNING:
      return 1;
    case TH_UNINTERRUPTIBLE:
      return 2;
    case TH_WAITING:
      return slept > MAXSLP ? 4 : 3;
    case TH_STOPPED:
      return 5;
    case TH_HALTED:
      return 6;
    default:
      return STATE_MAX;
  }
};

/**
 * macOS: a live process's state letter as `ps` gives it (tasks.c
 * `get_task_info`): the lowest {@link machStateOrder} of its threads, `?`
 * when they cannot be read (another user's, without privileges).
 */
const darwinThreadLetter = (pid: number): string => {
  let order = STATE_MAX;
  for (const handle of darwinThreadHandles(pid)) {
    const info = new Uint8Array(THREADINFO_SIZE);
    const read = lib().symbols.proc_pidinfo(
      pid,
      PROC_PIDTHREADINFO,
      handle,
      info,
      THREADINFO_SIZE
    );
    if (read === THREADINFO_SIZE) {
      const view = new DataView(info.buffer);
      order = Math.min(
        order,
        machStateOrder(
          view.getInt32(THREADINFO_RUN_STATE, true),
          view.getInt32(THREADINFO_SLEEP_TIME, true)
        )
      );
    }
  }
  return MACH_STATE_TABLE[order] ?? "?";
};

/** Whether the single bit `bit` (a power of two) is set in the unsigned `bits`. */
const hasBit = (bits: number, bit: number): boolean =>
  Math.floor(bits / bit) % 2 === 1;

/**
 * macOS: a process's state as `ps -o stat` prints it (print.c `state()`):
 * T or Z from `p_stat`, else its threads' letter; then `<` or `N` by its
 * nice value, `X` traced, `E` exiting (not a zombie), `V` its parent waiting
 * on its exec, `L` a system process, `s` a session leader, `+` in its
 * terminal's foreground process group.
 */
const darwinStat = (info: Kinfo): string => {
  let stat = "";
  if (info.stat === SSTOP) {
    stat = "T";
  } else if (info.stat === SZOMB) {
    stat = "Z";
  } else {
    stat = darwinThreadLetter(info.pid);
  }
  if (info.nice < 0) {
    stat += "<";
  } else if (info.nice > 0) {
    stat += "N";
  }
  const flags: [boolean, string][] = [
    [hasBit(info.flag, P_TRACED), "X"],
    [hasBit(info.flag, P_WEXIT) && info.stat !== SZOMB, "E"],
    [hasBit(info.flag, P_PPWAIT), "V"],
    [hasBit(info.flag, P_SYSTEM), "L"],
    [hasBit(info.eFlag, EPROC_SLEADER), "s"],
    [hasBit(info.flag, P_CONTROLT) && info.pgid === info.tpgid, "+"],
  ];
  for (const [set, letter] of flags) {
    if (set) {
      stat += letter;
    }
  }
  return stat;
};

/** The bytes `sysctl(mib)` would fill, asked with no buffer. */
const sysctlSize = (mib: number[]): number => {
  const length = new BigUint64Array(1);
  const failed = lib().symbols.sysctl(
    new Int32Array(mib),
    mib.length,
    null,
    length,
    null,
    0
  );
  if (failed !== 0) {
    throw new Error(`sysctl ${mib.join(".")} would not say its size`);
  }
  return Number(length[0]);
};

/** `sysctl(mib)` into `buffer`: the bytes it filled, or undefined when it refused. */
const sysctl = (mib: number[], buffer: Uint8Array): Uint8Array | undefined => {
  const name = new Int32Array(mib);
  const length = new BigUint64Array([BigInt(buffer.byteLength)]);
  const failed = lib().symbols.sysctl(
    name,
    mib.length,
    buffer,
    length,
    null,
    0
  );
  return failed === 0 ? buffer.subarray(0, Number(length[0])) : undefined;
};

/**
 * The one buffer every `KERN_PROCARGS2` read goes into, `KERN_ARGMAX` bytes
 * (1 MiB on macOS), the most one process's arguments and environment can
 * take: allocated once, as the strings are copied out of it before the next
 * read. Null when the kernel would not say its size.
 */
let argsBuffer: Uint8Array | null | undefined;
const argsRoom = (): Uint8Array | null => {
  if (argsBuffer === undefined) {
    const max = sysctl([CTL_KERN, KERN_ARGMAX], new Uint8Array(4));
    argsBuffer =
      max && max.byteLength === 4
        ? new Uint8Array(
            new DataView(max.buffer, max.byteOffset).getInt32(0, true)
          )
        : null;
  }
  return argsBuffer;
};

/**
 * macOS: a process's arguments and environment, as `KERN_PROCARGS2` gives
 * them and `ps` reads them: `argc`, the executable's path, NUL padding, then
 * exactly `argc` NUL-ended arguments, empty ones included (a process that
 * rewrote its title, as postgres does, leaves its other arguments empty, and
 * `ps` prints a space for each), then the environment's NUL-ended strings up
 * to the first empty one. Undefined when the kernel refuses (another user's
 * process, without privileges; one that has exited).
 */
const darwinArgs = (
  pid: number
): { argv: string[]; env: string[] } | undefined => {
  const room = argsRoom();
  const raw = room ? sysctl([CTL_KERN, KERN_PROCARGS2, pid], room) : undefined;
  if (!raw || raw.length < 4) {
    return;
  }
  const argc = new DataView(raw.buffer, raw.byteOffset).getInt32(0, true);
  let at = raw.indexOf(0, 4);
  if (at < 0) {
    return;
  }
  while (at < raw.length && raw[at] === 0) {
    at += 1;
  }
  /** The NUL-ended string at `at`, or undefined past the end. */
  const next = (): string | undefined => {
    if (at >= raw.length) {
      return;
    }
    const end = raw.indexOf(0, at);
    const stop = end < 0 ? raw.length : end;
    const text = decoder.decode(raw.subarray(at, stop));
    at = stop + 1;
    return text;
  };
  const argv: string[] = [];
  while (argv.length < argc) {
    const arg = next();
    if (arg === undefined) {
      break;
    }
    argv.push(arg);
  }
  const env: string[] = [];
  for (let variable = next(); variable; variable = next()) {
    env.push(variable);
  }
  return { argv, env };
};

// ── Linux: /proc ─────────────────────────────────────────────────────────

/**
 * `/proc/<pid>/stat`'s fields after the parenthesised name, which may hold
 * spaces and `)`: index 0 is field 3 (the state), 1 the ppid, 2 the process
 * group, 11 and 12 the user and system ticks, 19 the start in ticks since
 * boot. The name is field 2.
 */
const linuxStat = (
  pid: number
): Promise<{ comm: string; fields: string[] } | undefined> =>
  readFile(`/proc/${pid}/stat`, "utf8").then(
    (stat) => {
      const close = stat.lastIndexOf(")");
      return {
        comm: stat.slice(stat.indexOf("(") + 1, close),
        fields: stat.slice(close + 2).split(" "),
      };
    },
    // Gone, or never there.
    () => undefined
  );

/**
 * Linux: `/proc/<pid>/stat`'s 22nd field, the start in clock ticks since
 * boot, the identity every Linux marker holds.
 */
const linuxStartTicks = async (pid: number): Promise<string | undefined> =>
  (await linuxStat(pid))?.fields[19];

/** Linux's `USER_HZ`, the unit of /proc's tick counts: 100 on every architecture CawCo runs on (`getconf CLK_TCK`). */
const LINUX_TICKS_PER_SECOND = 100;
/** `/proc/stat`'s boot time, in epoch seconds. */
const BTIME = /^btime (\d+)$/m;
const NUMERIC = /^\d+$/;

/** Linux: the boot time in epoch seconds, as procps reads it for `lstart`. */
const linuxBootSeconds = async (): Promise<number | undefined> => {
  const boot = await readFile("/proc/stat", "utf8")
    .then((stat) => BTIME.exec(stat)?.[1])
    .catch(() => undefined);
  return boot === undefined ? undefined : Number(boot);
};

/** Linux: a start in ticks since boot, as epoch seconds (procps: `btime + start / Hertz`). */
const linuxStartSeconds = (boot: number, ticks: string): number =>
  boot + Math.floor(Number(ticks) / LINUX_TICKS_PER_SECOND);

/**
 * NUL-ended strings, as `/proc/<pid>/cmdline` and `environ` hold them: the
 * last NUL ends the list, and an empty string before it is an argument
 * (procps prints it as the space between its neighbours).
 */
const nulStrings = (text: string): string[] =>
  text === "" ? [] : text.replace(TRAILING_NUL, "").split("\0");
const TRAILING_NUL = /\0$/;

/** Linux: a process's arguments and environment, from `/proc/<pid>/cmdline` and `environ`. */
const linuxArgs = async (
  pid: number
): Promise<{ argv: string[]; env: string[] } | undefined> => {
  const argv = await readFile(`/proc/${pid}/cmdline`, "utf8").then(
    nulStrings,
    () => undefined
  );
  if (!argv) {
    return;
  }
  // Another user's environment is not ours to read; its arguments are.
  const env = await readFile(`/proc/${pid}/environ`, "utf8").then(
    nulStrings,
    () => []
  );
  return { argv, env };
};

// ── Formatting, as `ps` prints ───────────────────────────────────────────

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const two = (n: number): string => String(n).padStart(2, "0");

/**
 * A start second as `ps -o lstart=` prints it on macOS and Linux both, which
 * every marker written before this reader holds: `strftime("%c")` in local
 * time, C locale (`Fri Oct  9 09:08:56 2026`, the day padded with a space).
 */
const lstart = (seconds: number): string => {
  const at = new Date(seconds * 1000);
  return `${WEEKDAYS[at.getDay()]} ${MONTHS[at.getMonth()]} ${String(at.getDate()).padStart(2, " ")} ${two(at.getHours())}:${two(at.getMinutes())}:${two(at.getSeconds())} ${at.getFullYear()}`;
};

const TAB = 9;
const NEWLINE = 10;
const DEL = 127;
/** Matches the ASCII control characters a command line may carry. */
// biome-ignore lint/suspicious/noControlCharactersInRegex: matching control characters is this pattern's whole job: `ps` escapes exactly these
const CONTROL = /[\x00-\x1f\x7f]/g;

/**
 * One argument as macOS `ps` prints it: through `vis(3)` with `VIS_TAB |
 * VIS_NL | VIS_NOSLASH`, so a tab or newline shows as its three-digit octal
 * escape (`\011`, `\012`), any other control character as `^X` (`^?` for
 * DEL), and a backslash as itself. Every other character is printed as it
 * is (UTF-8 too, as `ps` prints it in a UTF-8 locale).
 */
const darwinVis = (text: string): string =>
  text.replace(CONTROL, (char) => {
    const code = char.charCodeAt(0);
    if (code === TAB || code === NEWLINE) {
      return `\\${code.toString(8).padStart(3, "0")}`;
    }
    return code === DEL ? "^?" : `^${String.fromCharCode(code + 64)}`;
  });

/** One argument as procps prints it: a character it cannot show is a `?`. */
const linuxVis = (text: string): string => text.replace(CONTROL, "?");

/**
 * A command line as `ps -o command=` (`args=`) prints it: each argument
 * escaped as `ps` escapes it, joined by single spaces, the environment after
 * them when asked for (`ps -E`). A process whose arguments cannot be read
 * shows its name: in parentheses on macOS, in brackets on Linux (a kernel
 * thread).
 */
const shownCommand = (
  args: { argv: string[]; env: string[] } | undefined,
  comm: string,
  environment: boolean
): string => {
  if (!args || args.argv.length === 0) {
    return process.platform === "linux" ? `[${comm}]` : `(${comm})`;
  }
  const vis = process.platform === "linux" ? linuxVis : darwinVis;
  return [...args.argv, ...(environment ? args.env : [])].map(vis).join(" ");
};

/**
 * macOS: a process's command line as `ps` prints it (adv_cmds ps/print.c
 * `getproclline`): a zombie's is a single blank; the environment is added
 * only for a process whose real user is this one, or for root.
 */
const darwinCommand = (info: Kinfo, environment: boolean): string => {
  if (info.stat === SZOMB) {
    return " ";
  }
  const uid = process.getuid?.() ?? -1;
  return shownCommand(
    darwinArgs(info.pid),
    info.comm,
    environment && (uid === 0 || info.ruid === uid)
  );
};

/** procps's `VmLck` line in `/proc/<pid>/status`: locked memory, in kB. */
const VM_LOCKED = /^VmLck:\s+(\d+)/m;

/**
 * Linux: a process's state as procps prints `stat` (ps/output.c `pr_stat`):
 * its letter, then `<` or `N` by its nice value, `L` with locked memory, `s`
 * a session leader, `l` more than one thread, `+` in its terminal's
 * foreground process group.
 */
const linuxStatText = async (
  pid: number,
  fields: string[]
): Promise<string> => {
  const nice = Number(fields[16]);
  const locked = await readFile(`/proc/${pid}/status`, "utf8").then(
    (status) => Number(VM_LOCKED.exec(status)?.[1] ?? 0) > 0,
    () => false
  );
  const flags: [boolean, string][] = [
    [nice < 0, "<"],
    [nice > 0, "N"],
    [locked, "L"],
    [Number(fields[3]) === pid, "s"],
    [Number(fields[17]) > 1, "l"],
    [fields[2] === fields[5], "+"],
  ];
  return flags.reduce(
    (stat, [set, letter]) => (set ? stat + letter : stat),
    fields[0] ?? "?"
  );
};

/**
 * Seconds since a process started, as `ps -o etime` prints them on this
 * system. macOS (adv_cmds ps/print.c `get_etime`): `mm:ss`, then `hh:mm:ss`
 * past an hour, `dd-hh:mm:ss` past a day with two-digit days, and the days
 * unpadded past a hundred. Linux (procps `pr_etime`): `mm:ss`, with `hh:`
 * once there are hours and `d-` once there are days, the days unpadded.
 */
export const etimeText = (seconds: number): string => {
  const e = Math.max(0, Math.floor(seconds));
  const days = Math.floor(e / 86_400);
  const hoursOfDay = Math.floor(e / 3600) % 24;
  const clock = `${two(Math.floor(e / 60) % 60)}:${two(e % 60)}`;
  if (process.platform === "linux") {
    return `${days ? `${days}-` : ""}${days || hoursOfDay ? `${two(hoursOfDay)}:` : ""}${clock}`;
  }
  if (e > 100 * 86_400) {
    return `${days}-${two(hoursOfDay)}:${clock}`;
  }
  if (e > 86_400) {
    return `${two(days)}-${two(hoursOfDay)}:${clock}`;
  }
  return e > 3600 ? `${two(Math.floor(e / 3600))}:${clock}` : clock;
};

/**
 * CPU time as `ps -o time` prints it on this system. macOS (print.c
 * `cputime`): `%3ld:%02ld.%02ld`, minutes, seconds and hundredths, the
 * microseconds rounded to hundredths. Linux (procps `pr_time`):
 * `[d-]hh:mm:ss` of whole seconds.
 */
export const cpuTimeText = (microseconds: number): string => {
  if (process.platform === "linux") {
    const whole = Math.floor(microseconds / 1_000_000);
    const days = Math.floor(whole / 86_400);
    return `${days ? `${days}-` : ""}${two(Math.floor(whole / 3600) % 24)}:${two(Math.floor(whole / 60) % 60)}:${two(whole % 60)}`;
  }
  let seconds = Math.floor(microseconds / 1_000_000);
  let hundredths = Math.floor(((microseconds % 1_000_000) + 5000) / 10_000);
  seconds += Math.floor(hundredths / 100);
  hundredths %= 100;
  return `${String(Math.floor(seconds / 60)).padStart(3, " ")}:${two(seconds % 60)}.${two(hundredths)}`;
};

// ── The readings ─────────────────────────────────────────────────────────

/** One process, as `ps -A` lists it. */
export interface ProcessRow {
  /** CPU time used, user and system, in whole microseconds; undefined where the system will not say. */
  cpuMicroseconds?: number;
  /** Seconds since it started. */
  elapsed: number;
  pgid: number;
  pid: number;
  ppid: number;
  /** Its start, as `ps -o lstart=` prints it on both systems. */
  started: string;
  /** Its state, as `ps -o stat=` prints it on its system: the letter and its flags (`Ss`, `R+`, `I<`). */
  state: string;
}

/**
 * Every process on the machine that this process may read, as `ps -A`
 * lists it: pid, parent, process group, start, state, age and CPU time.
 */
export async function processTable(): Promise<ProcessRow[]> {
  const now = Date.now() / 1000;
  if (process.platform === "linux") {
    const boot = (await linuxBootSeconds()) ?? 0;
    const names = (await readdir("/proc")).filter((name) => NUMERIC.test(name));
    const rows = await Promise.all(
      names.map(async (name): Promise<ProcessRow | undefined> => {
        const stat = await linuxStat(Number(name));
        const fields = stat?.fields;
        if (!fields?.[19]) {
          return;
        }
        const started = linuxStartSeconds(boot, fields[19]);
        const pid = Number(name);
        return {
          pid,
          ppid: Number(fields[1]),
          pgid: Number(fields[2]),
          started: lstart(started),
          state: await linuxStatText(pid, fields),
          elapsed: Math.max(0, Math.floor(now - started)),
          cpuMicroseconds:
            ((Number(fields[11]) + Number(fields[12])) * 1_000_000) /
            LINUX_TICKS_PER_SECOND,
        };
      })
    );
    return rows.filter((row): row is ProcessRow => row !== undefined);
  }
  return darwinKinfos().map((info) => {
    const cpuMicroseconds = darwinCpuMicroseconds(info.pid);
    return {
      pid: info.pid,
      ppid: info.ppid,
      pgid: info.pgid,
      started: lstart(info.startSeconds),
      state: darwinStat(info),
      elapsed: Math.max(0, Math.floor(now - info.startSeconds)),
      ...(cpuMicroseconds === undefined ? {} : { cpuMicroseconds }),
    };
  });
}

/** A process's arguments and environment, or undefined when it is gone or not ours to read. */
export function processArgs(
  pid: number
): Promise<{ argv: string[]; env: string[] } | undefined> {
  return process.platform === "linux"
    ? linuxArgs(pid)
    : Promise.resolve(darwinArgs(pid));
}

/**
 * A process's command line as `ps -ww -o command= -p <pid>` prints it, with
 * its environment after it as `ps -E` adds it when asked; undefined when
 * there is no such process.
 */
export async function commandLine(
  pid: number,
  { environment = false }: { environment?: boolean } = {}
): Promise<string | undefined> {
  if (process.platform === "linux") {
    const stat = await linuxStat(pid);
    if (!stat) {
      return;
    }
    const shown = shownCommand(await linuxArgs(pid), stat.comm, environment);
    // procps marks a zombie's name: `[name] <defunct>`.
    return stat.fields[0] === "Z" ? `${shown} <defunct>` : shown;
  }
  const info = darwinKinfo(pid);
  return info ? darwinCommand(info, environment) : undefined;
}

/**
 * Every process's command line, as `ps -axww -o pid=,command=` lists them,
 * each with its environment after it when asked for (`ps -axwwE`).
 */
export async function commandLines({
  environment = false,
}: {
  environment?: boolean;
} = {}): Promise<{ command: string; pid: number }[]> {
  if (process.platform !== "linux") {
    return darwinKinfos().map((info) => ({
      pid: info.pid,
      command: darwinCommand(info, environment),
    }));
  }
  const pids = (await readdir("/proc"))
    .filter((name) => NUMERIC.test(name))
    .map(Number);
  const lines = await Promise.all(
    pids.map(async (pid) => {
      const command = await commandLine(pid, { environment });
      return command === undefined ? undefined : { pid, command };
    })
  );
  return lines.filter(
    (line): line is { command: string; pid: number } => line !== undefined
  );
}

/** When the process started, as the system reports it, or undefined when there is no such process. */
export function processStart(pid: number): Promise<string | undefined> {
  if (process.platform === "linux") {
    return linuxStartTicks(pid);
  }
  const seconds = darwinStartSeconds(pid);
  return Promise.resolve(seconds === undefined ? undefined : lstart(seconds));
}

/**
 * When the process started, in epoch milliseconds to the second, or
 * undefined when there is no such process: on Linux its ticks since boot
 * added to the boot time (`/proc/stat`'s `btime`).
 */
export async function processStartMs(pid: number): Promise<number | undefined> {
  if (process.platform !== "linux") {
    const seconds = darwinStartSeconds(pid);
    return seconds === undefined ? undefined : seconds * 1000;
  }
  const [ticks, boot] = await Promise.all([
    linuxStartTicks(pid),
    linuxBootSeconds(),
  ]);
  return ticks === undefined || boot === undefined
    ? undefined
    : linuxStartSeconds(boot, ticks) * 1000;
}

/**
 * What identifies this boot of the machine: Linux's boot id; on macOS
 * `kern.boottime` as `sysctl -n kern.boottime` prints it, which every marker
 * written before holds (`{ sec = …, usec = … } Thu Oct  1 20:26:06 2026`).
 */
export async function bootId(): Promise<string | undefined> {
  if (process.platform === "linux") {
    try {
      return (await readFile("/proc/sys/kernel/random/boot_id", "utf8")).trim();
    } catch {
      return;
    }
  }
  const ran = Bun.spawn(["sysctl", "-n", "kern.boottime"], {
    stdout: "pipe",
    stderr: "ignore",
  });
  const [text, code] = await Promise.all([
    new Response(ran.stdout).text(),
    ran.exited,
  ]);
  const trimmed = text.trim();
  return code === 0 && trimmed ? trimmed : undefined;
}

/** The identity of this very process, to be written into a marker. */
export async function ownIdentity(): Promise<{
  bootId?: string;
  pid: number;
  procStart?: string;
}> {
  const [start, boot] = await Promise.all([
    processStart(process.pid),
    bootId(),
  ]);
  return {
    pid: process.pid,
    ...(start ? { procStart: start } : {}),
    ...(boot ? { bootId: boot } : {}),
  };
}

/** Whether a marker's process is the one that wrote it and is still running. */
export async function markerIsLive(marker: {
  bootId?: string;
  pid?: number;
  procStart?: string;
}): Promise<boolean> {
  if (marker.pid === undefined || marker.procStart === undefined) {
    return false;
  }
  const [start, boot] = await Promise.all([processStart(marker.pid), bootId()]);
  return start === marker.procStart && boot === marker.bootId;
}
