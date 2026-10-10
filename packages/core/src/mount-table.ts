/**
 * Whether a path is a mount point anywhere on this machine, read from the
 * kernel's own tables. Dependency-free (`node:fs` alone), so the boundary's
 * srt host, a plain Bun script, imports it as the agent does.
 */
import { readdirSync, readFileSync, readlinkSync } from "node:fs";

/** A process's entry in `/proc`. */
const PID = /^\d+$/;
const OCTAL_ESCAPE = /\\([0-7]{3})/g;

const readOr = <T>(read: () => T, otherwise: T): T => {
  try {
    return read();
  } catch {
    // Gone, or another user's: nothing of it to read.
    return otherwise;
  }
};

/** The mount points of `pid`'s mount namespace, as `/proc/<pid>/mountinfo` spells them (octal escapes read). */
export const mountPointsOf = (pid: number | string): Set<string> | undefined =>
  readOr<Set<string> | undefined>(
    () =>
      new Set(
        readFileSync(`/proc/${pid}/mountinfo`, "utf8")
          .split("\n")
          .map((line) =>
            (line.split(" ")[4] ?? "").replace(
              OCTAL_ESCAPE,
              (_, code: string) => String.fromCharCode(Number.parseInt(code, 8))
            )
          )
          .filter(Boolean)
      ),
    undefined
  );

/**
 * Whether any mount namespace this user's processes are in holds a mount at
 * `path`, a real path: one table read per namespace. A sandbox's root is the
 * host's (`--ro-bind / /`), so its mount points read as host paths. On the
 * host, unlinking or renaming a path a sandbox has a bind on detaches that
 * bind in the sandbox, and the deny it held is gone there (REPORT.md §5d).
 */
export const mountedAnywhere = (path: string): boolean => {
  const spaces = new Set<string>();
  for (const pid of readOr(() => readdirSync("/proc"), [] as string[])) {
    if (!PID.test(pid)) {
      continue;
    }
    const space = readOr(() => readlinkSync(`/proc/${pid}/ns/mnt`), "");
    if (!space || spaces.has(space)) {
      continue;
    }
    spaces.add(space);
    if (mountPointsOf(pid)?.has(path)) {
      return true;
    }
  }
  return false;
};
