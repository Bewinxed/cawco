/**
 * A container a session started outlives the keeper's stop. Host only: it
 * runs keepers as systemd user units and podman, neither of which a
 * workspace reaches.
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
 * Two legs, each a scratch keeper unit of its own (keeper-unit.ts) whose
 * child runs `podman run -d` as the owner's `podman compose up -d` from a
 * session's shell: storage of the spec's own (`--root`, `--runroot`,
 * `--tmpdir`), a container whose PID 1 is a shell that exits on SIGTERM, on
 * a rootfs of the host's `/usr` read only. The child then stays, as a session
 * does. The keeper is then retired as an agent's update retires one: its job's
 * `remove()` (agent keeper-jobs.ts).
 *
 * - fresh: the child's environment as this build gives it (core
 *   session-env.ts gives no child the id).
 *   (a) conmon is outside the keeper's unit before the stop;
 *   (b) 3 s after it, the container's PID 1 is the same process and podman
 *   reads it running.
 * - inherited: the child is given the unit's own `INVOCATION_ID`, as a
 *   session started by a keeper before session-env.ts dropped it still has.
 *   (c) conmon is inside the keeper's unit before the stop: the old
 *   placement;
 *   (d) after the stop, conmon is in a scope of its own outside the unit
 *   (core keep-detached.ts, run by `remove()` before `systemctl stop`);
 *   (e) 3 s after it, the container's PID 1 is the same process and podman
 *   reads it running.
 *
 * Main fails (b) and (e); 3c4793088 fails (e) alone.
 *
 * Cleanup removes only what the spec made, by name: each unit (`systemctl
 * --user stop`), each container (`podman rm -f` on the spec's own storage),
 * the storage and the socket dirs. It signals no process itself.
 *
 *   bun scripts/probe-kit/run.ts keeper-stop-container
 */
import { mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { keeperJob } from "../../../packages/agent/src/keeper-jobs";
import { until } from "../../scratch-fleet";
import {
  cgroupOf,
  endKeeperUnit,
  fateOf,
  hostRefusal,
  type KeeperUnit,
  keeperUnitOf,
  quoted,
  run,
  startChild,
  startedAt,
  startKeeperUnit,
  unitInvocation,
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
  /** The checks this leg makes, by letter: before the stop, after it. */
  checks: { after?: string; before: string; survives: string };
  /** Whether the child is given the unit's own INVOCATION_ID (the old behaviour). */
  inherited: boolean;
  label: string;
}

const LEGS: readonly Leg[] = [
  {
    label: "fresh",
    inherited: false,
    checks: {
      before:
        "(a) fresh: the container's conmon runs outside the keeper's unit",
      survives:
        "(b) fresh: once the keeper is retired, the container's PID 1 is the same process and podman reads it running",
    },
  },
  {
    label: "inherited",
    inherited: true,
    checks: {
      before:
        "(c) inherited: with the unit's INVOCATION_ID in the child, the container's conmon starts inside the keeper's unit",
      after:
        "(d) inherited: retiring the keeper moves conmon into a scope of its own, outside the unit",
      survives:
        "(e) inherited: once the keeper is retired, the container's PID 1 is the same process and podman reads it running",
    },
  },
];

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
        `${leg.label}: the scratch keeper runs as a user unit`,
        false,
        refused
      );
      return;
    }
    const env: Record<string, string> = leg.inherited
      ? { INVOCATION_ID: await unitInvocation(keeper) }
      : {};
    const composed = await compose(kit, keeper, podman.argv, rootfs, name, env);
    if (typeof composed === "string") {
      kit.check(
        `${leg.label}: the keeper's child starts a container with podman run -d`,
        false,
        composed
      );
      return;
    }
    const { pid, conmon, inv } = composed;
    const before = await startedAt(pid);
    const conmonBefore = await cgroupOf(conmon);
    kit.check(
      leg.checks.before,
      conmonBefore !== "unreadable" &&
        inUnit(conmonBefore, keeper.unit) === leg.inherited,
      `the child read ${inv}; conmon ${conmon} in ${conmonBefore}`
    );
    // Retired as an agent's update retires a keeper: its job's remove().
    const job = keeperJob(keeper.keeper);
    const removed = await (
      job
        ? job.remove()
        : Promise.reject(new Error("no keeper job on this platform"))
    ).then(
      () => "removed",
      (error: unknown) =>
        error instanceof Error ? error.message : String(error)
    );
    await Bun.sleep(3000);
    const conmonAfter = await cgroupOf(conmon);
    if (leg.checks.after) {
      kit.check(
        leg.checks.after,
        conmonAfter !== "unreadable" && !inUnit(conmonAfter, keeper.unit),
        `conmon ${conmon} in ${conmonAfter}`
      );
    }
    const after = await startedAt(pid);
    const status = await run([
      ...podman.argv,
      "inspect",
      "-f",
      "{{.State.Status}}",
      name,
    ]);
    kit.check(
      leg.checks.survives,
      removed === "removed" &&
        before !== undefined &&
        after === before &&
        status.out === "running",
      `the keeper's job: ${removed}; PID 1 ${pid} ${fateOf(before, after)}; podman reads ${status.out || status.err}; conmon then in ${conmonAfter}`
    );
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
    for (const leg of LEGS) {
      // biome-ignore lint/performance/noAwaitInLoops: one keeper at a time, each leg its own unit and container
      await runLeg(kit, leg);
    }
  },
};

export default spec;
