/**
 * The keeper's children in a cgroup of their own, whose task limit stops
 * short of the keeper's reserve (Linux, cgroup v2, when the keeper's unit
 * delegates the pids controller). The user's process limit is already closed
 * by each child's own lower RLIMIT_NPROC (tasks.ts); a cgroup's `pids.max`
 * counts every task in it the same, so there the children need a cgroup of
 * their own. macOS has no cgroups, and needs none: it limits threads per
 * process, so children cannot take the keeper's.
 *
 * The rules this relies on, from the kernel's cgroup v2 document
 * (https://docs.kernel.org/admin-guide/cgroup-v2.html):
 * - "Non-root cgroups can distribute domain resources to their children only
 *   when they don't have any processes of their own … the cgroup must create
 *   children and transfer all its processes to the children before enabling
 *   controllers in its 'cgroup.subtree_control' file." So the keeper runs in a
 *   leaf (`keeper`) beside `children`, never in the delegated cgroup itself.
 * - "A process can be migrated into a cgroup by writing its PID to the target
 *   cgroup's 'cgroup.procs' file … writing the PID of any thread migrates all
 *   threads of the process", and "the writer must have write access to the
 *   'cgroup.procs' file of the common ancestor of the source and destination
 *   cgroups": the delegated cgroup is that ancestor, and it is the keeper's.
 * - "On creation, all processes are put in the cgroup that the parent process
 *   belongs to": a child that joins `children` before it execs has nothing
 *   outside it, and everything it starts lands inside.
 * - pids.max: "it is not possible to violate a cgroup PID policy through
 *   fork() or clone(). These will return -EAGAIN".
 *
 * And from systemd (https://systemd.io/CGROUP_DELEGATION/): "systemd will
 * make the requested controllers available to your service … but won't
 * actually enable them … you have to do that manually by writing to
 * cgroup.subtree_control within your delegated cgroup (e.g. write +memory)".
 * The unit asks for `Delegate=pids` and `DelegateSubgroup=keeper`
 * (systemd.resource-control(5): DelegateSubgroup= "has no effect unless
 * control group delegation is turned on via Delegate=", added in 254); on
 * systemd before 254 the keeper moves itself.
 *
 * Whether the unit delegates is asked of the manager that runs it
 * (`systemctl [--user] show --property=Delegate`), not read off the cgroup:
 * the `user.delegate` xattr is set by the system manager only. systemd's
 * src/core/cgroup.c, cgroup_xattr_apply: "if (!MANAGER_IS_SYSTEM(u->manager))
 * return;" comes before cgroup_delegate_xattr_apply, so the keeper's user unit
 * never carries it, delegated or not.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { TASK_RESERVE } from "./tasks";

/** Where the keeper runs inside its delegated cgroup: the unit's `DelegateSubgroup=`. */
export const KEEPER_LEAF = "keeper";
/** Where its children run. */
export const CHILDREN_GROUP = "children";
const BLANKS = /\s+/;
/** A cgroup systemd made for a unit, by its directory name. */
const UNIT_CGROUP = /\.(service|scope)$/;
/** A unit under a user's manager: its cgroup is below that manager's `user@<uid>.service`. */
const USER_MANAGER = /\/user@\d+\.service\//;

/** What the keeper's children join, and the limit they run under. */
export interface Children {
  group: string;
  max: number;
  /** The `cgroup.procs` a child writes its own pid to before it execs. */
  procs: string;
}

/** Where the children ended up, and the one line the keeper says about it at start. */
export interface Placement {
  children?: Children;
  said: string;
}

/** The parts of the system the placement reads and writes; a scratch tree stands in for them in a proof. */
export interface CgroupSystem {
  /** What the unit's manager says of its `Delegate=`: `yes`, `no`, or why it could not be asked. */
  delegation: (
    unit: string,
    manager: "user" | "system"
  ) => Promise<"yes" | "no" | { asked: string }>;
  pid: number;
  /** The cgroup v2 mount. */
  root: string;
  /** What `/proc/self/cgroup` says. */
  selfCgroup: () => Promise<string>;
}

/** `systemctl [--user] show --property=Delegate --value <unit>`. */
const askSystemd: CgroupSystem["delegation"] = async (unit, manager) => {
  const command = [
    "systemctl",
    ...(manager === "user" ? ["--user"] : []),
    "show",
    "--property=Delegate",
    "--value",
    unit,
  ];
  try {
    const asked = Bun.spawn(command, { stdout: "pipe", stderr: "pipe" });
    const [out, err, code] = await Promise.all([
      new Response(asked.stdout).text(),
      new Response(asked.stderr).text(),
      asked.exited,
    ]);
    if (code !== 0) {
      return { asked: `${command.join(" ")} exited ${code}: ${err.trim()}` };
    }
    return out.trim() === "yes" ? "yes" : "no";
  } catch (error) {
    return {
      asked: `${command.join(" ")}: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
};

/** This machine, as the keeper finds it. */
export const LINUX: CgroupSystem = {
  root: "/sys/fs/cgroup",
  pid: process.pid,
  selfCgroup: () => readFile("/proc/self/cgroup", "utf8"),
  delegation: askSystemd,
};

/** The tightest finite `pids.max` from `dir` up to the cgroup root; undefined when none is set. */
async function tightestLimit(
  root: string,
  dir: string
): Promise<number | undefined> {
  const levels: string[] = [];
  for (let at = dir; at.startsWith(root); at = dirname(at)) {
    levels.push(at);
    if (at === root) {
      break;
    }
  }
  const limits = await Promise.all(
    levels.map(async (at) =>
      Number(
        (await readFile(join(at, "pids.max"), "utf8").catch(() => "max")).trim()
      )
    )
  );
  const finite = limits.filter((max) => Number.isFinite(max));
  return finite.length > 0 ? Math.min(...finite) : undefined;
}

/**
 * Puts the keeper in its leaf and makes the children's cgroup, when the
 * keeper's cgroup is delegated with the pids controller. Never throws: where
 * it cannot (no cgroup v2, no delegation, no pids controller, a write
 * refused), the keeper says so and starts as before, refusing spawns by
 * headroom alone (tasks.ts).
 */
export async function placeChildren(
  system: CgroupSystem = LINUX
): Promise<Placement> {
  const line = (await system.selfCgroup().catch(() => ""))
    .split("\n")
    .find((entry) => entry.startsWith("0::"));
  if (!line) {
    return {
      said: "no cgroup v2 hierarchy here (cgroup v1 or hybrid): children share the keeper's task limit, and it refuses spawns by headroom alone",
    };
  }
  const own = join(system.root, line.slice(3).trim());
  // The unit's own cgroup: the keeper's, or the one above the subgroup
  // systemd placed it in (DelegateSubgroup=).
  const top =
    basename(own) === KEEPER_LEAF && UNIT_CGROUP.test(basename(dirname(own)))
      ? dirname(own)
      : own;
  if (!UNIT_CGROUP.test(basename(top))) {
    return {
      said: `${own} is not a systemd unit's cgroup: children share the keeper's task limit, and it refuses spawns by headroom alone`,
    };
  }
  const unit = basename(top);
  const delegation = await system.delegation(
    unit,
    USER_MANAGER.test(top) ? "user" : "system"
  );
  if (delegation !== "yes") {
    return {
      said:
        delegation === "no"
          ? `${unit} does not delegate its cgroup (the unit needs Delegate=pids): children share the keeper's task limit, and it refuses spawns by headroom alone`
          : `whether ${unit} delegates its cgroup could not be asked (${delegation.asked}): children share the keeper's task limit, and it refuses spawns by headroom alone`,
    };
  }
  const controllers = (
    await readFile(join(top, "cgroup.controllers"), "utf8").catch(() => "")
  )
    .trim()
    .split(BLANKS);
  if (!controllers.includes("pids")) {
    return {
      said: `${top} is delegated without the pids controller (the unit needs Delegate=pids): children share the keeper's task limit, and it refuses spawns by headroom alone`,
    };
  }
  try {
    if (own === top) {
      // systemd before 254 has no DelegateSubgroup=: the keeper moves itself.
      await mkdir(join(top, KEEPER_LEAF), { recursive: true });
      await writeFile(
        join(top, KEEPER_LEAF, "cgroup.procs"),
        String(system.pid)
      );
    }
    await writeFile(join(top, "cgroup.subtree_control"), "+pids");
    const limit = await tightestLimit(system.root, top);
    if (limit === undefined) {
      return {
        said: `${top} is delegated, and no task limit applies there or above it: the children are not capped, and need not be`,
      };
    }
    const group = join(top, CHILDREN_GROUP);
    const max = limit - TASK_RESERVE;
    await mkdir(group, { recursive: true });
    await writeFile(join(group, "pids.max"), String(max));
    return {
      children: { group, max, procs: join(group, "cgroup.procs") },
      said: `children run in ${group} under pids.max ${max} (${limit}, less ${TASK_RESERVE} kept for the keeper)`,
    };
  } catch (error) {
    return {
      said: `${top} is delegated but its cgroups could not be set up (${error instanceof Error ? error.message : String(error)}): children share the keeper's task limit, and it refuses spawns by headroom alone`,
    };
  }
}

/**
 * The shell a child starts in when it has a cgroup to join: it writes its
 * own pid to the children's `cgroup.procs` (`$0`) and execs the child's
 * command in place, so the child is in the cgroup before its first
 * instruction and nothing it starts can be outside it. One it cannot join is
 * not started uncapped: it exits 125 and says why.
 */
export const JOIN_CHILDREN =
  'echo $$ > "$0" || { echo "cawco: the child could not join the keeper\'s children cgroup ($0)" >&2; exit 125; }; exec "$@"';
