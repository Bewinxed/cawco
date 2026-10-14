/**
 * Locks that prove a process alive across pid namespaces: `flock(2)` on a
 * file every party opens by path. A workspace's processes run in a pid
 * namespace of their own, so a pid read from a file names nobody, or
 * someone else, in another workspace or on the host; a file's lock is the
 * same lock wherever it is opened, and the kernel frees it when its holder
 * ends, a SIGKILL included. Users: the heavy-run slots (heavy-run.ts) and a
 * scratch fleet's folders (scratch-fleet.ts `FleetDirs`).
 */
import { dlopen, FFIType } from "bun:ffi";
import { closeSync, constants, openSync } from "node:fs";

/** `LOCK_EX | LOCK_NB` (2 | 4, the same on Linux and macOS): take it now or not at all. */
const LOCK_EX_NOW = 6;
const LOCK_UN = 8;
/**
 * O_CLOEXEC, which node:fs does not name (Linux's 0o2000000, macOS's
 * 0x1000000): no child a holder starts, however it starts it, keeps the
 * lock past the holder.
 */
const CLOEXEC = process.platform === "darwin" ? 0x1_00_00_00 : 0o200_0000;

interface Libc {
  flock: (fd: number, operation: number) => number;
  getppid: () => number;
}
let libc: Libc | undefined;
const loadLibc = (): Libc => {
  libc ??= dlopen(
    process.platform === "darwin" ? "libSystem.B.dylib" : "libc.so.6",
    {
      flock: { args: [FFIType.i32, FFIType.i32], returns: FFIType.i32 },
      getppid: { args: [], returns: FFIType.i32 },
    }
  ).symbols as unknown as Libc;
  return libc;
};

/**
 * `path` opened read-write and close-on-exec, made when `create` and
 * missing (never truncated); flag bits apart, so summed.
 */
export const openLockFile = (path: string, create: boolean): number =>
  openSync(
    path,
    constants.O_RDWR + CLOEXEC + (create ? constants.O_CREAT : 0),
    0o666
  );

/** Takes `fd`'s file's lock now, or answers false: another holds it. */
export const tryLock = (fd: number): boolean =>
  loadLibc().flock(fd, LOCK_EX_NOW) === 0;

/** Lets `fd`'s lock go and closes it. */
export const unlock = (fd: number): void => {
  loadLibc().flock(fd, LOCK_UN);
  closeSync(fd);
};

/** This process's parent's pid, read live: it changes once the parent is gone. */
export const parentPid = (): number => loadLibc().getppid();
