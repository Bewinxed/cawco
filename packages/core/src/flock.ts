/**
 * Locks that prove a process alive across pid namespaces: `flock(2)` on a
 * file every party opens by path. A workspace's processes run in a pid
 * namespace of their own, so a pid read from a file names nobody, or
 * someone else, in another workspace or on the host; a file's lock is the
 * same lock wherever it is opened, and the kernel frees it when its holder
 * ends, a SIGKILL included. Users: a scratch fleet's folders
 * (scripts/scratch-fleet.ts `FleetDirs`), the fleet's browsers (agent
 * browser/), and a workspace's lock (agent workspace.ts).
 */
import { dlopen, FFIType } from "bun:ffi";
import { closeSync, constants, openSync } from "node:fs";

/** `LOCK_EX | LOCK_NB` (2 | 4, the same on Linux and macOS): take it now or not at all. */
const LOCK_EX_NOW = 6;
/** `LOCK_SH | LOCK_NB` (1 | 4): held with every other sharer, now or not at all. */
const LOCK_SH_NOW = 5;
const LOCK_UN = 8;
/**
 * O_CLOEXEC, which node:fs does not name (Linux's 0o2000000, macOS's
 * 0x1000000): no child a holder starts, however it starts it, keeps the
 * lock past the holder.
 */
const CLOEXEC = process.platform === "darwin" ? 0x1_00_00_00 : 0o200_0000;

interface Libc {
  flock: (fd: number, operation: number) => number;
}
let libc: Libc | undefined;
const loadLibc = (): Libc => {
  libc ??= dlopen(
    process.platform === "darwin" ? "libSystem.B.dylib" : "libc.so.6",
    {
      flock: { args: [FFIType.i32, FFIType.i32], returns: FFIType.i32 },
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

/**
 * Directory `path` opened read-only and close-on-exec, for its lock: every
 * process that opens the same directory meets the same lock, and nothing is
 * written into it.
 */
export const openDirLock = (path: string): number =>
  openSync(path, constants.O_RDONLY + constants.O_DIRECTORY + CLOEXEC);

/** Takes `fd`'s file's lock now, or answers false: another holds it. */
export const tryLock = (fd: number): boolean =>
  loadLibc().flock(fd, LOCK_EX_NOW) === 0;

/**
 * Takes `fd`'s file's lock shared now, or answers false: another holds it
 * alone. On a descriptor that holds it alone, it converts it.
 */
export const tryShare = (fd: number): boolean =>
  loadLibc().flock(fd, LOCK_SH_NOW) === 0;

/** Lets `fd`'s lock go, the descriptor kept for the next take. */
export const release = (fd: number): void => {
  loadLibc().flock(fd, LOCK_UN);
};

/** How often a wait for a lock another process holds looks again. */
const LOCK_POLL_MS = 100;

/**
 * Takes `fd`'s file's lock once whoever holds it lets it go, waiting at most
 * until `deadline` (epoch ms); answers false when it is still held then. The
 * kernel offers no wait that leaves the event loop running, so it looks every
 * {@link LOCK_POLL_MS}.
 */
export const lockBy = async (
  fd: number,
  deadline: number
): Promise<boolean> => {
  while (!tryLock(fd)) {
    if (Date.now() >= deadline) {
      return false;
    }
    // biome-ignore lint/performance/noAwaitInLoops: polling a lock another process holds.
    await Bun.sleep(LOCK_POLL_MS);
  }
  return true;
};

/** Lets `fd`'s lock go and closes it. */
export const unlock = (fd: number): void => {
  loadLibc().flock(fd, LOCK_UN);
  closeSync(fd);
};
