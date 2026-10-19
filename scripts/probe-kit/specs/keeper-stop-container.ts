/**
 * A keeper's unit is stopped only while it holds nothing but CawCo's own.
 * Host only: it runs keepers as systemd user units and podman, neither of
 * which a workspace reaches.
 *
 * On obelisk, 2026-10-19 09:28:30, an agent update retired the keeper
 * `cawco-sessiond-0.1.12-nightly.4034_…service`, and every container started
 * from a session's shell got SIGTERM in the same second. The keeper's
 * children inherited its unit's `INVOCATION_ID`; podman, run with it set,
 * leaves conmon in its caller's cgroup rather than a
 * `libpod-conmon-<id>.scope` of its own (libpod/oci_conmon_linux.go
 * `moveConmonToCgroupAndSignal`, podman 5.7.0); systemd's stop of the
 * keeper's unit signals every process in its cgroup, conmon included; and
 * conmon passes SIGTERM on to the container (conmon ctr_exit.c
 * `on_sig_exit`, 2.1.13).
 *
 * The rule now (agent keeper-jobs.ts): `remove()` and `restart()` read the
 * unit's cgroup and refuse, naming each process, while anything there is
 * neither the keeper nor in the process tree of a child its register lists;
 * `force` is the one override. Nothing is moved out at stop time.
 *
 * Three legs, each a scratch keeper unit of its own (keeper-unit.ts) whose
 * child runs `podman run -d` as the owner's `podman compose up -d` from a
 * session's shell: storage of the spec's own (`--root`, `--runroot`,
 * `--tmpdir`), a container whose PID 1 is a shell that exits on SIGTERM, on
 * a rootfs of the host's `/usr` read only. The child then stays, as a session
 * does. The keeper is then retired as an agent's update retires one: its
 * job's `remove()`, given the live children its register lists. The stopping
 * process (this spec) has the user bus out of its reach
 * (`DBUS_SESSION_BUS_ADDRESS` naming no socket; `systemctl --user` reaches
 * the manager on its private socket all the same), so no stop path can move
 * a process into a transient unit (0 proves the rig).
 *
 * - inherited: the child is given the unit's own `INVOCATION_ID`, as a
 *   session started by a keeper before session-env.ts dropped it had.
 *   (a) conmon starts inside the keeper's unit; `remove()` is refused with
 *   words naming conmon's pid; 3 s on the unit is still active, and the
 *   container's PID 1 is the same process and podman reads it running.
 * - forced: the same, retired with `force`. (b) `remove()` goes ahead and
 *   the unit is no longer active.
 * - clean: the child's environment as this build gives it (core
 *   session-env.ts gives no child the id). (c) conmon starts in a scope of
 *   its own outside the unit; `remove()` goes ahead and the unit is no
 *   longer active; 3 s on the container's PID 1 is the same process and
 *   podman reads it running.
 *
 * Main (2206a0efb, keep-detached) fails (a): with the bus out of reach its
 * move fails, the stop goes ahead and the container ends.
 *
 * Cleanup removes only what the spec made, by name: each unit (`systemctl
 * --user stop`), each container (`podman rm -f` on the spec's own storage),
 * the storage and the socket dirs. It signals no process itself.
 *
 *   bun scripts/probe-kit/run.ts keeper-stop-container
 */
import { mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  keeperJob,
  type UnitStop,
} from "../../../packages/agent/src/keeper-jobs";
import { until } from "../../scratch-fleet";
import {
  cgroupOf,
  endKeeperUnit,
  fateOf,
  hostRefusal,
  type KeeperUnit,
  keeperUnitOf,
  quoted,
  registerChildren,
  run,
  startChild,
  startedAt,
  startKeeperUnit,
  unitInvocation,
  unitState,
} from "../keeper-unit";
import type { Kit, Spec } from "../kit";

/** The container's PID 1: a shell that exits on SIGTERM and otherwise stays. */
const PID1 = 'trap "exit 0" TERM; while :; do sleep 1; done';

/** podman on the spec's own storage, under `out`. */
const podmanOn = (out: string): { argv: string[]; dirs: string[] } => {
  const dirs = ["storage", "runroot", "podman-tmp"].map((dir) =>
    join(out, dir)
  );
  const [root, runroot, tmp] = dirs as [string, string, string];
  return {
    dirs,
    argv: [
      Bun.which("podman") ?? "podman",
      "--root",
      root,
      "--runroot",
      runroot,
      "--tmpdir",
      tmp,
    ],
  };
};

/** A rootfs for the container: the host's /usr bound read only, its usrmerge links, an /etc with root in it. */
const makeRootfs = async (dir: string): Promise<void> => {
  await mkdir(join(dir, "usr"), { recursive: true });
  await mkdir(join(dir, "etc"), { recursive: true });
  await Promise.all(
    ["bin", "lib", "lib64", "sbin"].map((name) =>
      symlink(`usr/${name}`, join(dir, name))
    )
  );
  await writeFile(
    join(dir, "etc", "passwd"),
    "root:x:0:0:root:/root:/bin/sh\n"
  );
  await writeFile(join(dir, "etc", "group"), "root:x:0:\n");
};

/** What the keeper's child started: the container's PID 1 and its conmon, and the id the child read. */
interface Composed {
  conmon: number;
  inv: string;
  pid: number;
}

/**
 * The keeper's child runs `podman run -d` and stays; why not, when it fails.
 * podman run's options all come before `--rootfs <path>`: with `--rootfs`,
 * the first word after the path is the container's command.
 */
const compose = async (
  kit: Kit,
  keeper: KeeperUnit,
  podman: string[],
  rootfs: string,
  name: string,
  env: Record<string, string>
): Promise<Composed | string> => {
  const script = [
    `echo "PC|inv=\${INVOCATION_ID:-none}|end"`,
    `${podman.map(quoted).join(" ")} run -d --name ${quoted(name)} --network none -v /usr:/usr:ro --rootfs ${quoted(rootfs)} /bin/sh -c ${quoted(PID1)} >/dev/null 2>"$HOME/podman-run.err"`,
    `echo "PC|run=$?|end"`,
    "exec sleep 600",
  ].join("; ");
  const started = await startChild(kit, keeper, script, env);
  if (typeof started === "string") {
    return started;
  }
  const ran = await until(
    "podman run -d from the keeper's child",
    () => started.lines.find((line) => line.startsWith("PC|run=")),
    Boolean,
    120_000
  ).catch(() => undefined);
  started.client.close();
  if (ran !== "PC|run=0|end") {
    const err = await readFile(join(keeper.home, "podman-run.err"), "utf8")
      .then((text) => text.slice(-1500))
      .catch(() => "");
    return `podman run -d: ${ran ?? "no answer"}; ${err}`;
  }
  const inspected = await run([
    ...podman,
    "inspect",
    "-f",
    "{{.State.Pid}} {{.State.ConmonPid}}",
    name,
  ]);
  const [pid, conmon] = inspected.out.split(" ").map(Number);
  if (!(pid && conmon)) {
    return `podman inspect named no PID 1 and conmon: ${inspected.err || inspected.out}`;
  }
  return {
    pid,
    conmon,
    inv: started.lines.find((line) => line.startsWith("PC|inv=")) ?? "no line",
  };
};

/** Whether `group` is the unit's cgroup or one under it. */
const inUnit = (group: string, unit: string): boolean =>
  group.includes(`/${unit}/`) || group.endsWith(`/${unit}`);

interface Leg {
  /** What the leg proves, as its check says it. */
  check: string;
  /** Retired with `force`: the stop goes ahead whatever the unit holds. */
  forced: boolean;
  /** Whether the child is given the unit's own INVOCATION_ID (the old placement). */
  inherited: boolean;
  label: string;
}

const LEGS: readonly Leg[] = [
  {
    label: "inherited",
    inherited: true,
    forced: false,
    check:
      "(a) inherited: conmon starts inside the keeper's unit, its retirement is refused naming conmon's pid, the keeper stays, and the container runs on",
  },
  {
    label: "forced",
    inherited: true,
    forced: true,
    check:
      "(b) forced: with conmon inside the keeper's unit, a retirement with force goes ahead and the unit stops",
  },
  {
    label: "clean",
    inherited: false,
    forced: false,
    check:
      "(c) clean: conmon starts in a scope of its own, the retirement goes ahead, the unit stops, and the container runs on",
  },
];

/** A bus address that names no socket: what the stopping process is given, so nothing it runs reaches the user bus. */
const noBus = (kit: Kit): string => `unix:path=${join(kit.out, "no-user-bus")}`;

/** `work` with `DBUS_SESSION_BUS_ADDRESS` set to {@link noBus}, put back after. */
const withoutBus = async <T>(kit: Kit, work: () => Promise<T>): Promise<T> => {
  const before = process.env.DBUS_SESSION_BUS_ADDRESS;
  process.env.DBUS_SESSION_BUS_ADDRESS = noBus(kit);
  try {
    return await work();
  } finally {
    if (before === undefined) {
      delete process.env.DBUS_SESSION_BUS_ADDRESS;
    } else {
      process.env.DBUS_SESSION_BUS_ADDRESS = before;
    }
  }
};

/** 0: with the bus out of reach, busctl cannot reach the user manager and systemctl still can. */
const rigHolds = async (kit: Kit): Promise<boolean> => {
  const [bus, manager] = await withoutBus(kit, () =>
    Promise.all([
      run([
        "busctl",
        "--user",
        "get-property",
        "org.freedesktop.systemd1",
        "/org/freedesktop/systemd1",
        "org.freedesktop.systemd1.Manager",
        "Version",
      ]),
      run(["systemctl", "--user", "show", "-p", "Version", "--value"]),
    ])
  );
  const holds = bus.code !== 0 && manager.code === 0 && manager.out !== "";
  kit.check(
    "0: with DBUS_SESSION_BUS_ADDRESS naming no socket, busctl --user fails and systemctl --user still reaches the manager",
    holds,
    `busctl exited ${bus.code}: ${bus.err || bus.out}; systemctl exited ${manager.code}: ${manager.out || manager.err}`
  );
  return holds;
};

/** One leg: its keeper, its container, the keeper retired, the container after it. */
const runLeg = async (kit: Kit, leg: Leg): Promise<void> => {
  const out = join(kit.out, leg.label);
  const keeper = keeperUnitOf(kit, leg.label);
  const podman = podmanOn(out);
  const rootfs = join(out, "rootfs");
  const name = `cawco-probe-container-${keeper.tag}`;
  await makeRootfs(rootfs);
  try {
    const refused = await startKeeperUnit(kit, keeper);
    if (refused) {
      kit.check(
        leg.check,
        false,
        `the scratch keeper did not start: ${refused}`
      );
      return;
    }
    const env: Record<string, string> = leg.inherited
      ? { INVOCATION_ID: await unitInvocation(keeper) }
      : {};
    const composed = await compose(kit, keeper, podman.argv, rootfs, name, env);
    if (typeof composed === "string") {
      kit.check(
        leg.check,
        false,
        `the keeper's child started no container: ${composed}`
      );
      return;
    }
    const { pid, conmon, inv } = composed;
    const before = await startedAt(pid);
    const conmonGroup = await cgroupOf(conmon);
    const placed =
      conmonGroup !== "unreadable" &&
      inUnit(conmonGroup, keeper.unit) === leg.inherited;
    const children = await registerChildren(keeper);
    if (typeof children === "string") {
      kit.check(leg.check, false, children);
      return;
    }
    // Retired as an agent's update retires a keeper: its job's remove().
    const stop: UnitStop = leg.forced ? { force: true } : { children };
    const job = keeperJob(keeper.keeper);
    const removed = await withoutBus(kit, async () => {
      if (!job) {
        return "no keeper job on this platform";
      }
      try {
        await job.remove(stop);
        return "removed";
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
    });
    await Bun.sleep(3000);
    const state = await unitState(keeper);
    const after = await startedAt(pid);
    const status = await run([
      ...podman.argv,
      "inspect",
      "-f",
      "{{.State.Status}}",
      name,
    ]);
    const runsOn =
      before !== undefined && after === before && status.out === "running";
    const said = `the child read ${inv}; conmon ${conmon} was in ${conmonGroup}; the register listed ${children.join(", ") || "nothing"}; remove(${leg.forced ? "force" : "children"}): ${removed}; the unit is ${state}; PID 1 ${pid} ${fateOf(before, after)}, podman reads ${status.out || status.err}`;
    if (!leg.inherited) {
      kit.check(
        leg.check,
        placed && removed === "removed" && state !== "active" && runsOn,
        said
      );
    } else if (leg.forced) {
      kit.check(
        leg.check,
        placed && removed === "removed" && state !== "active",
        said
      );
    } else {
      kit.check(
        leg.check,
        placed &&
          removed !== "removed" &&
          removed.includes(`pid ${conmon} (`) &&
          removed.includes("conmon") &&
          state === "active" &&
          runsOn,
        said
      );
    }
  } finally {
    await endKeeperUnit(keeper);
    await run([...podman.argv, "rm", "-f", "-t", "0", name]);
    // The overlay's files are the user namespace's: removed from inside it.
    await run([...podman.argv, "unshare", "rm", "-rf", ...podman.dirs]);
  }
};

const spec: Spec = {
  name: "keeper-stop-container",
  host: "it runs keepers as systemd user units and starts podman containers from their children",
  run: async (kit: Kit) => {
    const refused = await hostRefusal(["podman", "systemd-run", "busctl"]);
    if (refused) {
      kit.check(
        "0: this machine has systemd's user manager, XDG_RUNTIME_DIR, podman, systemd-run and busctl",
        false,
        refused
      );
      return;
    }
    if (!(await rigHolds(kit))) {
      return;
    }
    for (const leg of LEGS) {
      // biome-ignore lint/performance/noAwaitInLoops: one keeper at a time, each leg its own unit and container
      await runLeg(kit, leg);
    }
  },
};

export default spec;
