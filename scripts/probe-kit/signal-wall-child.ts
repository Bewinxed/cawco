/**
 * The signal wall's leg (specs/signal-wall.ts), run as a process that leads a
 * throwaway process group of its own: it drives core's signalling module
 * (packages/core/src/signal.ts) directly and prints one JSON line of what
 * each attempt came to.
 *
 * A seatbelt goes on first. `process.kill` is wrapped, so every call that
 * reaches it is recorded, and one whose target is anything but a child this
 * program spawned and marked for that signal, or a group it started as its
 * leader, is recorded and never made: a wall that let -1, 0, 1, a negative
 * (whose negation is this program itself on a raw group kill) through shows
 * as a recorded call, and the kernel never sees it. So the leg is safe
 * anywhere, on the wall and on the raw calls it replaced (the stub the red
 * run puts in its place) alike, and never sends `kill(-1)`.
 *
 * The leg, in order:
 * - a sentinel `sleep` in this program's own group, which `kill(0)`, the
 *   group's own negative id or `kill(-1)` would reach;
 * - each value the wall refuses (-1, 0, 1, the group's own negative id, NaN,
 *   2.5) through every maker and sender: each must throw `SignalRefused`
 *   naming the value, with nothing reaching `process.kill`;
 * - `signalGroup` on a child that is no group's leader: refused, the child
 *   alive after;
 * - a real child, killed by `signal`; a group this program started
 *   (`detached`), killed with its member by `signalGroup`;
 * - the sentinel, still alive after all of it.
 *
 *   bun scripts/probe-kit/signal-wall-child.ts
 */
import { readFileSync } from "node:fs";
import { processGroup } from "../../packages/core/src/process-identity";
import {
  identifiedPid,
  isAlive,
  isSignalRefused,
  listedPid,
  type Pid,
  signal,
  signalGroup,
  spawnedPid,
} from "../../packages/core/src/signal";

/** One call that reached `process.kill`, and whether the seatbelt let it through. */
interface Call {
  made: boolean;
  sig: string;
  target: string;
}

const calls: Call[] = [];
/** The children this program spawned and means to signal, each marked just before: the only single targets let through. */
const mine = new Set<number>();
/** The groups this program started as their leader: the only negative targets let through. */
const ownGroups = new Set<number>();
const realKill = process.kill.bind(process);
const shown = (value: unknown): string => String(value);
process.kill = ((to: number, sig?: NodeJS.Signals | number) => {
  const made =
    typeof to === "number" &&
    Number.isSafeInteger(to) &&
    ((to > 1 && mine.has(to)) || (to < -1 && ownGroups.has(-to)));
  calls.push({ target: shown(to), sig: shown(sig), made });
  if (!made) {
    // Recorded, never made.
    return true;
  }
  return realKill(to, sig);
}) as typeof process.kill;

/** The value a forged Pid carries: what the wall must refuse at run time, past the type. */
const forged = (value: number): Pid => value as unknown as Pid;

/** Whether `pid` is a running process now, as /proc (or kinfo_proc) lists it, zombies aside. */
const runs = (pid: number): boolean => {
  if (processGroup(pid) === undefined) {
    return false;
  }
  if (process.platform !== "linux") {
    return true;
  }
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
    // The state, the field after the parenthesised name.
    return stat.charAt(stat.lastIndexOf(")") + 2) !== "Z";
  } catch {
    return false;
  }
};

const until = async (ok: () => boolean, ms: number): Promise<boolean> => {
  const deadline = Date.now() + ms;
  while (!ok()) {
    if (Date.now() > deadline) {
      return false;
    }
    await Bun.sleep(20);
  }
  return true;
};

const own = process.pid;
const group = processGroup(own);

const sentinel = Bun.spawn(["sleep", "600"], {
  stdin: "ignore",
  stdout: "ignore",
  stderr: "ignore",
});

/** One attempt the wall must refuse. */
interface Attempt {
  /** What `process.kill` was asked during it. */
  calls: Call[];
  message: string;
  refused: boolean;
  /** What it returned, when it returned at all. */
  returned?: string;
  value: string;
  what: string;
}

const attempt = async (
  what: string,
  value: number,
  act: () => unknown
): Promise<Attempt> => {
  const before = calls.length;
  try {
    const returned = await act();
    return {
      what,
      value: shown(value),
      refused: false,
      message: "",
      returned: shown(returned),
      calls: calls.slice(before),
    };
  } catch (error) {
    return {
      what,
      value: shown(value),
      refused: isSignalRefused(error),
      message: error instanceof Error ? error.message : String(error),
      calls: calls.slice(before),
    };
  }
};

const VALUES = [-1, 0, 1, -(group ?? own), Number.NaN, 2.5];
const attempts: Attempt[] = [];
for (const value of VALUES) {
  attempts.push(
    await attempt("signal", value, () => signal(forged(value), "SIGKILL")),
    await attempt("signal SIGTERM", value, () =>
      signal(forged(value), "SIGTERM")
    ),
    await attempt("isAlive", value, () => isAlive(forged(value))),
    await attempt("signalGroup", value, () =>
      signalGroup(forged(value), "SIGKILL")
    ),
    await attempt("listedPid", value, () => listedPid(value)),
    await attempt("spawnedPid", value, () =>
      spawnedPid({ pid: value, exitCode: null })
    ),
    await attempt("identifiedPid", value, () =>
      identifiedPid({ pid: value, procStart: "0" })
    )
  );
}

// signalGroup on a child in this program's group, not a leader of its own.
const member = Bun.spawn(["sleep", "600"], {
  stdin: "ignore",
  stdout: "ignore",
  stderr: "ignore",
});
const memberPid = spawnedPid(member);
const nonLeader = await attempt("signalGroup on no leader", member.pid, () =>
  memberPid === undefined ? "no pid" : signalGroup(memberPid, "SIGKILL")
);
const memberAlive = runs(member.pid);
mine.add(member.pid);
if (memberPid !== undefined) {
  signal(memberPid, "SIGKILL");
}
await member.exited;

// A real child, killed.
const target = Bun.spawn(["sleep", "600"], {
  stdin: "ignore",
  stdout: "ignore",
  stderr: "ignore",
});
const targetPid = spawnedPid(target);
mine.add(target.pid);
const sent = targetPid === undefined ? "no pid" : signal(targetPid, "SIGKILL");
await target.exited;
const killed = { pid: target.pid, sent, signalCode: target.signalCode };

// A group this program started as its leader, killed with its member.
const leader = Bun.spawn(["sh", "-c", "sleep 600 & echo $!; wait"], {
  stdin: "ignore",
  stdout: "pipe",
  stderr: "ignore",
  detached: true,
});
ownGroups.add(leader.pid);
const reader = leader.stdout.getReader();
const first = new TextDecoder().decode((await reader.read()).value).trim();
reader.releaseLock();
const grandchild = Number(first);
const leaderPid = spawnedPid(leader);
const groupSent =
  leaderPid === undefined ? "no pid" : signalGroup(leaderPid, "SIGKILL");
await leader.exited;
const groupKilled = {
  leader: leader.pid,
  member: grandchild,
  memberGroup: processGroup(grandchild) ?? null,
  sent: groupSent,
  signalCode: leader.signalCode,
  memberGone: await until(() => !runs(grandchild), 5000),
};

const sentinelAlive = runs(sentinel.pid);
const sentinelGroup = processGroup(sentinel.pid) ?? null;
const report = {
  own,
  group,
  sentinel: { pid: sentinel.pid, alive: sentinelAlive, group: sentinelGroup },
  attempts,
  nonLeader: { ...nonLeader, memberAlive },
  killed,
  groupKilled,
  blocked: calls.filter((call) => !call.made),
};
console.log(JSON.stringify(report));
// The sentinel's own end: a real child of this program.
mine.add(sentinel.pid);
const sentinelPid = spawnedPid(sentinel);
if (sentinelPid !== undefined) {
  signal(sentinelPid, "SIGKILL");
}
await sentinel.exited;
