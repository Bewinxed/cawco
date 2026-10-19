/**
 * Before CawCo stops or restarts a keeper's unit, what runs in that unit but
 * has detached from CawCo's own process trees is moved into a transient scope
 * of its own, which the stop does not reach. CawCo signals no process it did
 * not start.
 *
 * WHY. systemd's stop of a unit signals every process in its cgroup. A
 * session's shell that still carries its keeper unit's `INVOCATION_ID` (every
 * session started before core session-env.ts dropped it, until it ends)
 * runs podman, which leaves conmon in that cgroup instead of a
 * `libpod-conmon-<id>.scope` of its own; conmon passes SIGTERM on to its
 * container. An agent update that retired a keeper stopped every such
 * container on obelisk (2026-10-19 09:28:30). A running process's environment
 * cannot be changed, so the stop path moves them out first. It runs in the
 * stopping agent or CLI, so it covers a keeper of any build.
 *
 * WHAT IS DETACHED. A process in the unit is detached when both hold:
 *
 * - It is in a session CawCo did not start. setsid(2): "The calling process
 *   is the leader of the new session (i.e., its session ID is made the same
 *   as its process ID)"; credentials(7): "A child created via fork(2) inherits
 *   its parent's session ID and process group ID. A process's session ID and
 *   process group ID are preserved across an execve(2)", and "all of the
 *   members of a process group always belong to the same session". CawCo's
 *   sessions are the keeper's own and each one a live keeper child leads
 *   (the keeper starts every child `detached`, which calls setsid). A process
 *   that only set a new process group (setpgid) is still in its session, and
 *   stays CawCo's. A container's conmon left behind by a session that has
 *   ended is in no session of CawCo's, and is kept; so is anything a keeper
 *   that crashed left running, whose children no keeper leads any more.
 * - Its parent is not in the unit: it was reparented when its parent ended
 *   (PR_SET_CHILD_SUBREAPER(2const): an orphan "will be reparented to the
 *   nearest still living ancestor subreaper"; for a keeper's children that is
 *   the user's service manager). conmon is both: podman's double fork and
 *   conmon's `setsid()` (conmon.c).
 *
 * Each such process moves with every process in the unit descended from it.
 *
 * HOW. systemd's own mechanism, the one podman makes `libpod-conmon-<id>.scope`
 * with: `StartTransientUnit` on the user manager, a scope whose `PIDs` are
 * the ones to move (https://systemd.io/CONTROL_GROUP_INTERFACE/: "you may set
 * … PIDs for scope units"; "the PIDs field of scope units … specifies the
 * initial PIDs to add to the scope object"), through `busctl`.
 */
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { type ProcessSession, processSession } from "./process-identity";
import { hostEnvironment } from "./session-env";

/** The cgroup v2 mount. */
const CGROUP_ROOT = "/sys/fs/cgroup";
/** How long a move is waited for, checked every {@link MOVE_POLL_MS}. Our choice: systemd starts a scope in milliseconds. */
const MOVE_WAIT_MS = 2000;
const MOVE_POLL_MS = 50;

interface Ran {
  code: number;
  err: string;
  out: string;
}

const run = async (argv: string[]): Promise<Ran> => {
  try {
    const child = Bun.spawn(argv, {
      stdout: "pipe",
      stderr: "pipe",
      env: { ...hostEnvironment(), LC_ALL: "C" },
    });
    const [out, err, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    return { code, out: out.trim(), err: err.trim() };
  } catch (error) {
    return {
      code: -1,
      out: "",
      err: error instanceof Error ? error.message : String(error),
    };
  }
};

/** Every cgroup at and under `dir`, each with the pids its `cgroup.procs` lists. */
const groupsUnder = async (
  dir: string
): Promise<{ group: string; pids: number[] }[]> => {
  const pids = (
    await readFile(join(dir, "cgroup.procs"), "utf8").catch(() => "")
  )
    .split("\n")
    .filter(Boolean)
    .map(Number);
  const below = await Promise.all(
    (await readdir(dir, { withFileTypes: true }).catch(() => []))
      .filter((entry) => entry.isDirectory())
      .map((entry) => groupsUnder(join(dir, entry.name)))
  );
  return [{ group: dir, pids }, ...below.flat()];
};

/**
 * The detached processes among `rows`, every process of a unit whose main
 * process is `main`, each with every process of the unit descended from it
 * (the rule is in this module's header): root first.
 */
export function detachedOf(
  main: number,
  rows: readonly ProcessSession[]
): ProcessSession[][] {
  const inUnit = new Set(rows.map((row) => row.pid));
  const own = new Set(
    rows
      .filter((row) => row.pid === main || row.ppid === main)
      .map((row) => row.sid)
  );
  const byParent = new Map<number, ProcessSession[]>();
  for (const row of rows) {
    byParent.set(row.ppid, [...(byParent.get(row.ppid) ?? []), row]);
  }
  const withDescendants = (root: ProcessSession): ProcessSession[] => {
    const all: ProcessSession[] = [];
    const queue = [root];
    for (let next = queue.shift(); next; next = queue.shift()) {
      all.push(next);
      queue.push(...(byParent.get(next.pid) ?? []));
    }
    return all;
  };
  return rows
    .filter(
      (row) => row.pid !== main && !own.has(row.sid) && !inUnit.has(row.ppid)
    )
    .map(withDescendants);
}

/** `pid`'s cgroup v2 path, as `/proc/<pid>/cgroup` names it. */
const cgroupOf = async (pid: number): Promise<string | undefined> =>
  (await readFile(`/proc/${pid}/cgroup`, "utf8").catch(() => ""))
    .split("\n")
    .find((line) => line.startsWith("0::"))
    ?.slice(3)
    .trim();

/** Whether `pid` has left `unitGroup` (or ended) within {@link MOVE_WAIT_MS}. */
const leftUnit = async (pid: number, unitGroup: string): Promise<boolean> => {
  for (let waited = 0; waited <= MOVE_WAIT_MS; waited += MOVE_POLL_MS) {
    // biome-ignore lint/performance/noAwaitInLoops: one reading at a time until the move shows
    const at = await cgroupOf(pid);
    if (
      at === undefined ||
      !(at === unitGroup || at.startsWith(`${unitGroup}/`))
    ) {
      return true;
    }
    await Bun.sleep(MOVE_POLL_MS);
  }
  return false;
};

/** Moves `pids` into a new scope of the user's service manager; its name, or why not. */
const moveToScope = async (
  unit: string,
  root: ProcessSession,
  pids: readonly number[]
): Promise<{ scope: string } | { refused: string }> => {
  const scope = `cawco-kept-${root.pid}-${randomUUID().slice(0, 8)}.scope`;
  const started = await run([
    "busctl",
    "--user",
    "call",
    "org.freedesktop.systemd1",
    "/org/freedesktop/systemd1",
    "org.freedesktop.systemd1.Manager",
    "StartTransientUnit",
    "ssa(sv)a(sa(sv))",
    scope,
    "fail",
    "2",
    "PIDs",
    "au",
    String(pids.length),
    ...pids.map(String),
    "Description",
    "s",
    `Kept from ${unit}: ${root.comm} (${root.pid})`,
    "0",
  ]);
  return started.code === 0
    ? { scope }
    : {
        refused: `busctl exited ${started.code}: ${started.err || started.out}`,
      };
};

/**
 * Moves every detached process of systemd user unit `unit` into a scope of
 * its own, before the unit is stopped or restarted. Never throws: what it
 * did, and what it could not, is said in the lines it returns, and the stop
 * goes on either way. Linux only; elsewhere there are no units and nothing
 * to say.
 */
export async function keepDetached(unit: string): Promise<string[]> {
  if (process.platform !== "linux") {
    return [];
  }
  const shown = await run([
    "systemctl",
    "--user",
    "show",
    "-p",
    "ControlGroup",
    "-p",
    "MainPID",
    unit,
  ]);
  const property = (name: string): string =>
    new RegExp(`^${name}=(.*)$`, "m").exec(shown.out)?.[1] ?? "";
  const unitGroup = property("ControlGroup");
  const main = Number(property("MainPID"));
  if (shown.code !== 0 || unitGroup === "") {
    return [];
  }
  // With no main process there is no keeper to tell its children by, and
  // nothing is moved: what is left in the unit is the stop's.
  if (!(main > 0)) {
    return [
      `${unit} has no main process, so nothing in it is told apart as detached; the stop ends all of it`,
    ];
  }
  const pids = (await groupsUnder(join(CGROUP_ROOT, unitGroup))).flatMap(
    (group) => group.pids
  );
  const rows = (await Promise.all(pids.map(processSession))).filter(
    (row): row is ProcessSession => row !== undefined
  );
  const said: string[] = [];
  for (const moving of detachedOf(main, rows)) {
    const [root] = moving;
    if (!root) {
      continue;
    }
    const movingPids = moving.map((row) => row.pid);
    // biome-ignore lint/performance/noAwaitInLoops: one scope at a time, each said in order
    const moved = await moveToScope(unit, root, movingPids);
    if ("refused" in moved) {
      said.push(
        `${root.comm} (${root.pid}) detached from ${unit} and could not be kept out of its stop: ${moved.refused}`
      );
      continue;
    }
    said.push(
      (await leftUnit(root.pid, unitGroup))
        ? `${root.comm} (${root.pid})${movingPids.length > 1 ? ` and ${movingPids.length - 1} more` : ""} detached from ${unit}: kept in ${moved.scope}`
        : `${root.comm} (${root.pid}) detached from ${unit}: ${moved.scope} started, and it is still in ${unitGroup} after ${MOVE_WAIT_MS} ms`
    );
  }
  return said;
}
