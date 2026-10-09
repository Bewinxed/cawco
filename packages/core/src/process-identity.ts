/**
 * Who a process is, beyond its number: a process id is reused, so a record that
 * names one is only as good as the start time it was written with. A marker
 * naming a process counts as live only if that process is still running, was
 * started when the marker says, and the machine has not rebooted since.
 *
 * Every reading is asynchronous. On macOS the boot reading runs `sysctl`, and
 * a synchronous spawn under Bun waits on a private event loop whose handle
 * swap misplaces polls of the process's own loop (oven-sh/bun#34069, fix open
 * as oven-sh/bun#40078): the session keeper sat wedged on one for 35 minutes.
 * A start time is read from the kernel itself, with no spawn: `/proc` on
 * Linux, libproc on macOS, where setuid `/bin/ps` is refused inside a
 * sandbox (`posix_spawn 'ps'`: EPERM).
 */

import { dlopen, FFIType } from "bun:ffi";
import { readFile } from "node:fs/promises";

const output = async (argv: string[]): Promise<string | undefined> => {
  const ran = Bun.spawn(argv, { stdout: "pipe", stderr: "ignore" });
  const [text, code] = await Promise.all([
    new Response(ran.stdout).text(),
    ran.exited,
  ]);
  const trimmed = text.trim();
  return code === 0 && trimmed ? trimmed : undefined;
};

/**
 * macOS's `proc_pidinfo(pid, PROC_PIDTBSDINFO, 0, buffer, size)`, which fills
 * a `struct proc_bsdinfo` (<sys/proc_info.h>): 136 bytes, its
 * `pbi_start_tvsec` a uint64 at byte 120. Opened on first use.
 */
const PROC_PIDTBSDINFO = 3;
const BSDINFO_SIZE = 136;
const BSDINFO_START_TVSEC = 120;
let libproc:
  | ReturnType<
      typeof dlopen<{
        proc_pidinfo: {
          args: [
            FFIType.i32,
            FFIType.i32,
            FFIType.u64,
            FFIType.ptr,
            FFIType.i32,
          ];
          returns: FFIType.i32;
        };
      }>
    >
  | undefined;

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
 * A start second as `ps -o lstart=` prints it, which every marker written
 * before this reader holds: `strftime("%c")` in local time, C locale
 * (`Fri Oct  9 09:08:56 2026`, the day padded with a space).
 */
const lstart = (seconds: number): string => {
  const at = new Date(seconds * 1000);
  return `${WEEKDAYS[at.getDay()]} ${MONTHS[at.getMonth()]} ${String(at.getDate()).padStart(2, " ")} ${two(at.getHours())}:${two(at.getMinutes())}:${two(at.getSeconds())} ${at.getFullYear()}`;
};

/** macOS: the second the process started, from the kernel. */
const darwinStartSeconds = (pid: number): number | undefined => {
  libproc ??= dlopen("/usr/lib/libSystem.B.dylib", {
    proc_pidinfo: {
      args: [FFIType.i32, FFIType.i32, FFIType.u64, FFIType.ptr, FFIType.i32],
      returns: FFIType.i32,
    },
  });
  const info = new Uint8Array(BSDINFO_SIZE);
  const filled = libproc.symbols.proc_pidinfo(
    pid,
    PROC_PIDTBSDINFO,
    0,
    info,
    BSDINFO_SIZE
  );
  if (filled !== BSDINFO_SIZE) {
    return undefined;
  }
  return Number(
    new DataView(info.buffer).getBigUint64(BSDINFO_START_TVSEC, true)
  );
};

/**
 * Linux: `/proc/<pid>/stat`'s 22nd field, the start in clock ticks since
 * boot, the identity every Linux marker holds.
 */
const linuxStartTicks = async (pid: number): Promise<string | undefined> => {
  try {
    // After the parenthesised name, the fields run from the third; the start time is the 22nd.
    const stat = await readFile(`/proc/${pid}/stat`, "utf8");
    return stat.slice(stat.lastIndexOf(")") + 2).split(" ")[19];
  } catch {
    return undefined;
  }
};

/** Linux's `USER_HZ`, the unit of /proc's tick counts: 100 on every architecture CawCo runs on (`getconf CLK_TCK`). */
const LINUX_TICKS_PER_SECOND = 100;
/** `/proc/stat`'s boot time, in epoch seconds. */
const BTIME = /^btime (\d+)$/m;

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
  const ticks = await linuxStartTicks(pid);
  const boot = await readFile("/proc/stat", "utf8")
    .then((stat) => BTIME.exec(stat)?.[1])
    .catch(() => undefined);
  if (ticks === undefined || boot === undefined) {
    return undefined;
  }
  return (
    (Number(boot) + Math.floor(Number(ticks) / LINUX_TICKS_PER_SECOND)) * 1000
  );
}

/** What identifies this boot of the machine. */
export async function bootId(): Promise<string | undefined> {
  if (process.platform === "linux") {
    try {
      return (await readFile("/proc/sys/kernel/random/boot_id", "utf8")).trim();
    } catch {
      return undefined;
    }
  }
  return output(["sysctl", "-n", "kern.boottime"]);
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
