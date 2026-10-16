/**
 * Each of the keeper's children in a cgroup of its own, with its own task
 * ceiling, below one that holds them all short of the keeper's reserve
 * (Linux, cgroup v2, when the keeper's unit delegates the pids controller).
 * A runaway inside one child is refused its next fork there, or killed for
 * memory there, and every other child goes on. The user's process limit is
 * already closed by each child's own lower RLIMIT_NPROC (tasks.ts); a
 * cgroup's `pids.max` counts every task in it the same, so there the children
 * need cgroups of their own. macOS has no cgroups, and needs none: it limits
 * threads per process, so children cannot take the keeper's.
 *
 * Why per child (2026-10-13, obelisk, 188 GB): one OpenCode session's gate
 * check recursed until about 13,000 processes and 92,000 threads, 185 of
 * 188 GB, and a load of 14,800. Every child shared `children`, whose cap
 * (214,923) protected only the keeper: workspace boundaries stopped starting
 * and other sessions stalled. Measured across 139 children on that machine
 * the same day: the largest child tree was 469 tasks and 4.9 GB, the largest
 * Claude session 199 tasks and 1.7 GB, an OpenCode server 117 tasks and
 * 1.5 GB. {@link CHILD_TASKS} is sized from that.
 *
 * Memory and CPU limits are the operator's to set, on the hub, and off until
 * they are (core `SessionLimits`): with none set, nothing is written for
 * them, and neither controller is turned on below `children`. The cpu
 * controller is on in the delegated cgroup itself, for the keeper's weight
 * against the children's ({@link KEEPER_CPU_WEIGHT}).
 *
 * The rules this relies on, from the kernel's cgroup v2 document
 * (https://docs.kernel.org/admin-guide/cgroup-v2.html):
 * - "Non-root cgroups can distribute domain resources to their children only
 *   when they don't have any processes of their own … the cgroup must create
 *   children and transfer all its processes to the children before enabling
 *   controllers in its 'cgroup.subtree_control' file." So the keeper runs in a
 *   leaf (`keeper`) beside `children`, never in the delegated cgroup itself,
 *   and `children` holds only the children's own groups, never a process.
 * - "A process can be migrated into a cgroup by writing its PID to the target
 *   cgroup's 'cgroup.procs' file … writing the PID of any thread migrates all
 *   threads of the process", and "the writer must have write access to the
 *   'cgroup.procs' file of the common ancestor of the source and destination
 *   cgroups": the delegated cgroup is that ancestor, and it is the keeper's.
 * - "On creation, all processes are put in the cgroup that the parent process
 *   belongs to": a child that joins its group before it execs has nothing
 *   outside it, and everything it starts lands inside.
 * - pids.max: "it is not possible to violate a cgroup PID policy through
 *   fork() or clone(). These will return -EAGAIN"; "PIDs used in this
 *   controller refer to TIDs", so threads count. pids.events max: "The number
 *   of times the cgroup's total number of processes hit the pids.max limit".
 * - memory.max: "If a cgroup's memory usage reaches this limit and can't be
 *   reduced, the OOM killer is invoked in the cgroup"; memory.swap.max 0 makes
 *   that so with swap on the machine (see {@link openChildGroup}); memory.oom.group's
 *   default "0" leaves the OOM killer to pick one process, not the whole
 *   group, so the harness outlives the command that ran away and sees its
 *   tool fail; memory.events oom_kill: "The number of processes belonging to
 *   this cgroup killed by any kind of OOM killer".
 * - cpu.max: "$MAX $PERIOD … the group may consume up to $MAX in each $PERIOD
 *   duration".
 * - "A cgroup which doesn't have any children or live processes can be
 *   destroyed by removing the directory"; cgroup.events' "populated" says
 *   when.
 *
 * And from systemd (https://systemd.io/CGROUP_DELEGATION/): "systemd will
 * make the requested controllers available to your service … but won't
 * actually enable them … you have to do that manually by writing to
 * cgroup.subtree_control within your delegated cgroup (e.g. write +memory)".
 * The unit asks for `Delegate=pids memory cpu` and `DelegateSubgroup=keeper`
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
import { mkdir, readdir, readFile, rmdir, writeFile } from "node:fs/promises";
import { availableParallelism, totalmem } from "node:os";
import { basename, dirname, join } from "node:path";
import type { ChildLimit, SessionLimits } from "@cawco/core";
import { TASK_RESERVE } from "./tasks";

/** Where the keeper runs inside its delegated cgroup: the unit's `DelegateSubgroup=`. */
export const KEEPER_LEAF = "keeper";
/** Where its children's groups are. */
export const CHILDREN_GROUP = "children";
/**
 * Each child's task ceiling: about 17 times the largest child tree measured
 * on obelisk (469 tasks, 2026-10-13; the largest Claude session was 199, an
 * OpenCode server 117), and far below the 92,000 threads the runaway that day
 * reached. Threads count: the kernel's pids controller counts TIDs.
 */
export const CHILD_TASKS = 8192;
/**
 * The keeper leaf's `cpu.weight`, against the children's group at the
 * kernel's default 100: the kernel's cgroup v2 document, cpu.weight: "The
 * weight in the range [1, 10000]. The default is 100", shared among siblings
 * in proportion. Every session's welcome and every turn's bytes pass through
 * the keeper, and the unit itself yields to the person's apps
 * (`CPUWeight=20`, cli service.ts), so under contention the keeper must not
 * also queue behind the sessions it relays. Ten to one is our call: the
 * keeper uses little CPU, so it takes what it needs and the rest stays the
 * sessions'.
 */
export const KEEPER_CPU_WEIGHT = 1000;
/** cpu.max's period, the kernel's own default ("max 100000"), in µs. */
const CPU_PERIOD_US = 100_000;
const BLANKS = /\s+/;
/** What a cgroup's name keeps of a procId: the rest becomes `_`. */
const UNNAMEABLE = /[^A-Za-z0-9_-]/g;
/** A cgroup systemd made for a unit, by its directory name. */
const UNIT_CGROUP = /\.(service|scope)$/;
/** A unit under a user's manager: its cgroup is below that manager's `user@<uid>.service`. */
const USER_MANAGER = /\/user@\d+\.service\//;
/** The unit line every "isn't delegated" sentence names. */
const DELEGATE_LINE = "Delegate=pids memory cpu";

/** Where the keeper's children's groups go, and what the delegation lets it limit there. */
export interface Children {
  /** Whether the unit delegates the cpu controller: a CPU limit set on the hub is written. */
  cpu: boolean;
  /** The optional controllers already turned on for the children ({@link openChildGroup}). */
  enabled: Set<"memory" | "cpu">;
  /** `children`, which holds each child's group. */
  group: string;
  /** Its `pids.max`, the pool every child's tasks count against; undefined when no limit applies above it. */
  max?: number;
  /** Whether the unit delegates the memory controller: a memory limit set on the hub is written. */
  memory: boolean;
  /** The delegated cgroup above it. */
  top: string;
}

/** One child's cgroup, as {@link openChildGroup} made it. */
export interface ChildGroup {
  /** The limits it runs under: tasks always, memory in bytes when set. */
  limits: { tasks: number; memory?: number };
  /** Its name under `children`. */
  name: string;
  path: string;
  /** The `cgroup.procs` the child writes its own pid to before it execs ({@link JOIN_CHILDREN}). */
  procs: string;
  /** A limit set on the hub that this machine does not apply, said in the keeper's log. */
  unapplied: string[];
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
 * Groups a keeper before this one left under `children` (one that crashed,
 * restarted by its unit): each empty one goes. One still holding a process
 * stays, and is nobody's.
 */
async function sweepGroups(group: string): Promise<void> {
  const entries = await readdir(group, { withFileTypes: true }).catch(() => []);
  await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map((entry) =>
        rmdir(join(group, entry.name)).catch(() => {
          /* still populated */
        })
      )
  );
}

/** What the start-up line says of the optional controllers. */
const optionalSaid = (memory: boolean, cpu: boolean): string => {
  const missing = [memory ? "" : "memory", cpu ? "" : "CPU"].filter(Boolean);
  if (missing.length === 0) {
    return "memory and CPU limits apply when they are set on the hub";
  }
  const named = missing.join(" and ");
  return `${named} ${missing.length > 1 ? "aren't" : "isn't"} delegated here (the unit needs ${DELEGATE_LINE}), so a ${named} limit set on the hub isn't applied on this machine${missing.length < 2 ? `; ${memory ? "memory" : "CPU"} limits apply when they are set on the hub` : ""}`;
};

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
          ? `${unit} does not delegate its cgroup (the unit needs ${DELEGATE_LINE}): children share the keeper's task limit, and it refuses spawns by headroom alone`
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
      said: `${top} is delegated without the pids controller (the unit needs ${DELEGATE_LINE}): children share the keeper's task limit, and it refuses spawns by headroom alone`,
    };
  }
  const memory = controllers.includes("memory");
  const cpu = controllers.includes("cpu");
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
    const group = join(top, CHILDREN_GROUP);
    const max = limit === undefined ? undefined : limit - TASK_RESERVE;
    await mkdir(group, { recursive: true });
    await sweepGroups(group);
    if (max !== undefined) {
      await writeFile(join(group, "pids.max"), String(max));
    }
    // Each child's own pids.max needs the controller on below `children`,
    // which therefore holds no process of its own: only their groups.
    await writeFile(join(group, "cgroup.subtree_control"), "+pids");
    const pool =
      max === undefined
        ? "no task limit applies above them"
        : `all of them under pids.max ${max} (${limit}, less ${TASK_RESERVE} kept for the keeper)`;
    const weighed = await weighKeeper(top, cpu);
    return {
      children: {
        top,
        group,
        cpu,
        memory,
        enabled: new Set(),
        ...(max === undefined ? {} : { max }),
      },
      said: `each child runs in a cgroup of its own under ${group}, under pids.max ${CHILD_TASKS}, ${pool}; ${weighed}; ${optionalSaid(memory, cpu)}`,
    };
  } catch (error) {
    return {
      said: `${top} is delegated but its cgroups could not be set up (${error instanceof Error ? error.message : String(error)}): children share the keeper's task limit, and it refuses spawns by headroom alone`,
    };
  }
}

/**
 * Puts the keeper's leaf ahead of the children's group for CPU: the cpu
 * controller on in the delegated cgroup, and {@link KEEPER_CPU_WEIGHT} on the
 * leaf. What the start-up line says of it, including why it could not be.
 */
async function weighKeeper(top: string, cpu: boolean): Promise<string> {
  if (!cpu) {
    return `the keeper weighs as much as the children for CPU: cpu isn't delegated here (the unit needs ${DELEGATE_LINE})`;
  }
  try {
    await writeFile(join(top, "cgroup.subtree_control"), "+cpu");
    await writeFile(
      join(top, KEEPER_LEAF, "cpu.weight"),
      String(KEEPER_CPU_WEIGHT)
    );
    return `the keeper's cpu.weight is ${KEEPER_CPU_WEIGHT} against the children's 100`;
  } catch (error) {
    return `the keeper weighs as much as the children for CPU: its cpu.weight could not be written (${error instanceof Error ? error.message : String(error)})`;
  }
}

/** Turns an optional controller on for the children: in the delegated cgroup, then in `children`. Once. */
async function enable(
  children: Children,
  controller: "memory" | "cpu"
): Promise<void> {
  if (children.enabled.has(controller)) {
    return;
  }
  await writeFile(
    join(children.top, "cgroup.subtree_control"),
    `+${controller}`
  );
  await writeFile(
    join(children.group, "cgroup.subtree_control"),
    `+${controller}`
  );
  children.enabled.add(controller);
}

/** What the machine has to give, which the hub's percents are of. */
export interface Machine {
  cores: number;
  /** Bytes of RAM. */
  memory: number;
}

export const THIS_MACHINE: Machine = {
  cores: availableParallelism(),
  memory: totalmem(),
};

/**
 * Makes the cgroup a child starts in, with its limits written before the
 * child is in it: its task ceiling always ({@link CHILD_TASKS}), and the
 * memory and CPU the hub set, when it set them and the unit delegates them.
 * `serial` keeps the name unique: a relaunch reuses its procId while the
 * child before it may still be ending in its own group. Throws when the
 * group cannot be made: the child is then not started, rather than started
 * without its ceiling.
 */
export async function openChildGroup(
  children: Children,
  procId: string,
  serial: string,
  limits: SessionLimits | undefined,
  machine: Machine = THIS_MACHINE
): Promise<ChildGroup> {
  const name = `${procId.replace(UNNAMEABLE, "_")}-${serial}`;
  const path = join(children.group, name);
  await mkdir(path);
  const unapplied: string[] = [];
  try {
    await writeFile(join(path, "pids.max"), String(CHILD_TASKS));
    let memory: number | undefined;
    if (limits?.memoryPercent !== undefined) {
      if (children.memory) {
        memory = Math.floor((machine.memory * limits.memoryPercent) / 100);
        await enable(children, "memory");
        await writeFile(join(path, "memory.max"), String(memory));
        // Its memory is the limit, not the limit and the machine's swap: past
        // memory.max a cgroup's anonymous memory swaps out until memory.swap.max
        // ("If a cgroup's swap usage reaches this limit, anonymous memory of the
        // cgroup will not be swapped out"), whose default is "max", and a
        // runaway would then thrash the machine's swap rather than be killed.
        // Absent where the kernel accounts no swap, which needs nothing.
        await writeFile(join(path, "memory.swap.max"), "0").catch(
          (error: NodeJS.ErrnoException) => {
            if (error.code !== "ENOENT") {
              throw error;
            }
          }
        );
      } else {
        unapplied.push(
          `memory ${limits.memoryPercent}% (the unit does not delegate memory)`
        );
      }
    }
    if (limits?.cpuPercent !== undefined) {
      if (children.cpu) {
        const quota = Math.max(
          1000,
          Math.round((machine.cores * limits.cpuPercent * CPU_PERIOD_US) / 100)
        );
        await enable(children, "cpu");
        await writeFile(join(path, "cpu.max"), `${quota} ${CPU_PERIOD_US}`);
      } else {
        unapplied.push(
          `CPU ${limits.cpuPercent}% (the unit does not delegate cpu)`
        );
      }
    }
    return {
      name,
      path,
      procs: join(path, "cgroup.procs"),
      limits: {
        tasks: CHILD_TASKS,
        ...(memory === undefined ? {} : { memory }),
      },
      unapplied,
    };
  } catch (error) {
    await rmdir(path).catch(() => {
      /* nothing in it yet; a failed removal leaves an empty group the next keeper sweeps */
    });
    throw error;
  }
}

/** One key's count in a flat-keyed cgroup file (`pids.events`, `memory.events`); 0 when absent. */
const counter = (text: string, key: string): number => {
  for (const row of text.split("\n")) {
    const [name, value] = row.trim().split(BLANKS);
    if (name === key) {
      return Number(value) || 0;
    }
  }
  return 0;
};

/** What a child's group says now: how often each limit held, and whether anything is left in it. */
export interface GroupReading {
  /** Its tasks now (`pids.current`). */
  current: number;
  /** Processes in it the OOM killer ended (`memory.events` oom_kill); 0 when memory is not on for it. */
  memory: number;
  populated: boolean;
  /**
   * Forks and clones refused in it (`pids.events` max). Since Linux 6.13 a
   * refusal is counted where the limit was hit and above it; before, in the
   * forking task's own cgroup whichever limit refused it, so a rise here may
   * be the pool's (`children`) refusal, which {@link current} tells apart.
   */
  tasks: number;
}

/** Reads a child's group. A group gone reads as empty and unpopulated. */
export async function readGroup(path: string): Promise<GroupReading> {
  const read = (file: string): Promise<string> =>
    readFile(join(path, file), "utf8").catch(() => "");
  const [pids, current, memory, events] = await Promise.all([
    read("pids.events"),
    read("pids.current"),
    read("memory.events"),
    read("cgroup.events"),
  ]);
  return {
    tasks: counter(pids, "max"),
    current: Number(current.trim()) || 0,
    memory: counter(memory, "oom_kill"),
    populated: counter(events, "populated") === 1,
  };
}

/**
 * How full of its own task limit a child's group must read for a refused
 * fork in it to be its own limit's: a refusal by the pool above it leaves it
 * well short. Ours: a runaway held at its limit reads at it, and one tenth
 * is room for what ended between the refusal and the reading.
 */
export const OWN_LIMIT_SHARE = 0.9;

/** Removes a child's group; false while anything is still in it. */
export const removeGroup = (path: string): Promise<boolean> =>
  rmdir(path).then(
    () => true,
    () => false
  );

/** The limit a reading's counter belongs to. */
export const LIMITS: readonly ChildLimit[] = ["tasks", "memory"];

/**
 * The shell a child starts in when it has a cgroup to join: it writes its
 * own pid to its group's `cgroup.procs` (`$0`) and execs the child's command
 * in place, so the child is in the cgroup before its first instruction and
 * nothing it starts can be outside it. One it cannot join is not started
 * uncapped: it exits 125 and says why.
 */
export const JOIN_CHILDREN =
  'echo $$ > "$0" || { echo "cawco: the child could not join its cgroup ($0)" >&2; exit 125; }; exec "$@"';
