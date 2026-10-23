/**
 * THE WALL BETWEEN CawCo AND A CATASTROPHIC SIGNAL, the part of it that
 * sends: every signal CawCo sends, liveness probes (signal 0) included,
 * leaves through this file, and only to a {@link Pid}. signal.ts is the wall
 * as CawCo imports it (the makers that read the process table besides);
 * this file imports nothing at all, so a process that must not load core's
 * index (the srt host a workspace's boundary runs, boundary-host.ts) signals
 * through the same wall (`@cawco/core/signal-wall`).
 *
 * `kill(2)` reads its pid as a set of targets, not one process: -1 is every
 * process the caller may signal, 0 the caller's own process group, any other
 * negative a process group, and 1 is init. On 2026-10-18 09:01:48 on obelisk
 * a probe spec did `process.kill(tunnels()[0]?.pid ?? -1, "SIGKILL")` with no
 * tunnel there, and `kill(-1, SIGKILL)` ended every process of the user:
 * systemd --user, the hub and the agent, every Cloudflare tunnel, every
 * session. The hub was unreachable for over four hours.
 *
 * So a pid is a {@link Pid}, and a Pid is made only from a real source: a
 * child CawCo spawned, read once it exists ({@link spawnedPid}); a process
 * the system's own list shows at the moment of asking ({@link listedPid});
 * this process ({@link ownPid}); or a recorded pid whose process identity
 * was read back and matched (signal.ts `identifiedPid`). A missing pid is
 * `undefined` in the type, and a caller says "nothing to signal" in words;
 * no sentinel (`?? -1`, `?? 0`) stands in for one. A process group is
 * signalled only through {@link signalOwnGroup}, given its leader's group as
 * read (signal.ts `signalGroup`).
 *
 * Each maker, and each sender again at the moment of sending, refuses any
 * value that is not an integer above 1 with a {@link SignalRefused} naming
 * it, before anything is sent. This is a wall, not a fallback: a refused
 * signal goes nowhere, and nothing tries another target in its place.
 * `bun run signal:check` (scripts/signal-check.ts) fails on any
 * `process.kill(` or group kill outside this file, and on a cast to `Pid`.
 */
declare const PID: unique symbol;

/** A process this code identified (module doc): an integer above 1, from a real source. */
export type Pid = number & { readonly [PID]: true };

/** A value refused at the wall: it is not a process CawCo may signal, and nothing was sent. */
export class SignalRefused extends Error {
  /** The value refused, as it came. */
  readonly value: unknown;
  constructor(value: unknown, why: string) {
    super(`refused to signal ${shown(value)}: ${why}`);
    this.name = "SignalRefused";
    this.value = value;
  }
}

export const isSignalRefused = (error: unknown): error is SignalRefused =>
  error instanceof SignalRefused;

const shown = (value: unknown): string =>
  typeof value === "number"
    ? String(value)
    : `${typeof value} ${String(value)}`;

/** The one rule: an integer above 1, or a {@link SignalRefused} naming what it is. */
export const wall = (value: unknown, what: string): Pid => {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new SignalRefused(value, `${what} is not an integer`);
  }
  if (value <= 1) {
    throw new SignalRefused(
      value,
      `${what} is not above 1 (-1 is every process, 0 the caller's own group, 1 init)`
    );
  }
  return value as Pid;
};

// ── Where a Pid comes from ───────────────────────────────────────────────

/** A process handle a spawn answered: Bun's `Subprocess`, node's `ChildProcess`. */
export interface Spawned {
  readonly exitCode: number | null;
  readonly pid?: number | undefined;
}

/**
 * The pid of a child CawCo spawned, read once it exists; undefined when the
 * spawn never made a process (node leaves `pid` unset when the exec fails).
 */
export const spawnedPid = (child: Spawned): Pid | undefined =>
  child.pid === undefined
    ? undefined
    : wall(child.pid, "a spawned child's pid");

/**
 * A pid the system's own list of processes gives at the moment of asking:
 * the process reader's tables (process-identity.ts), a `/proc/<pid>` entry
 * read for what it runs, the service manager's job. Matched by the caller to
 * what it looked for.
 */
export const listedPid = (pid: number): Pid => wall(pid, "a listed pid");

/** This process's own pid. */
export const ownPid = (): Pid => wall(process.pid, "this process's pid");

// ── Sending ──────────────────────────────────────────────────────────────

/**
 * What a signal came to: delivered, no such process (`ESRCH`: it has
 * ended), or not this user's to signal (`EPERM`).
 */
export type Delivery = "sent" | "gone" | "denied";

const send = (target: number, sig: NodeJS.Signals | 0): Delivery => {
  try {
    process.kill(target, sig);
    return "sent";
  } catch (error) {
    const { code } = error as NodeJS.ErrnoException;
    if (code === "ESRCH") {
      return "gone";
    }
    if (code === "EPERM") {
      return "denied";
    }
    throw error;
  }
};

/** Sends `sig` to the one process `pid`. */
export const signal = (pid: Pid, sig: NodeJS.Signals): Delivery =>
  send(wall(pid, "the pid"), sig);

/**
 * Whether `pid` is a process now (signal 0): one that is not this user's to
 * signal is one all the same. A zombie not yet reaped still answers.
 */
export const isAlive = (pid: Pid): boolean =>
  send(wall(pid, "the pid"), 0) !== "gone";

/**
 * Sends `sig` to the process group `leader` leads, given the group `leader`
 * is in as the kernel said it a moment ago (`group`, undefined once it is
 * gone): only for a child CawCo spawned as its own group's leader
 * (`detached`, which is `setsid()`). A leader in any group but its own is
 * refused. A leader already ended and reaped has no group to read; its
 * group's id stays held while any member lives (the kernel hands out no pid
 * that is a live group's id), so that group is signalled as it stands, and
 * is `gone` once none of it runs.
 */
export const signalOwnGroup = (
  leader: Pid,
  group: number | undefined,
  sig: NodeJS.Signals
): Delivery => {
  const pid = wall(leader, "the group's leader");
  if (group !== undefined && group !== pid) {
    throw new SignalRefused(
      pid,
      `it does not lead its own process group (it is in group ${group})`
    );
  }
  return send(-pid, sig);
};
