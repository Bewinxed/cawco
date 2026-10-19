/**
 * A container a session started outlives the keeper's stop. Host only: it
 * runs a keeper as a systemd user unit and podman, neither of which a
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
 * `on_sig_exit`, 2.1.13). Core session-env.ts now gives no child the id.
 *
 * The leg, as the owner's `podman compose up -d` from a session's shell:
 *
 * 1. A scratch keeper (this checkout's sessiond) runs as a transient user
 *    unit of its own, delegated as the real one is (`Delegate=pids memory
 *    cpu`, `DelegateSubgroup=keeper`), with a HOME, socket dir and nothing
 *    else of the machine's: systemd sets its `INVOCATION_ID`.
 * 2. A child of that keeper, started as a session's is (`inherit:
 *    "session"`), runs `podman run -d` against storage of the spec's own
 *    (`--root`, `--runroot`, `--tmpdir`): a container whose PID 1 is a shell
 *    that exits on SIGTERM, on a rootfs of the host's `/usr` read only.
 *    The child then stays, as a session does.
 * 3. (a) conmon is outside the keeper's unit: its cgroup is not under
 *    `<unit>/`. On main it is in the child's group under `<unit>/children/`.
 * 4. The keeper's unit is stopped (`systemctl --user stop`), as an agent's
 *    update retires a keeper.
 * 5. (b) 3 s on, the container's PID 1 is the same process, still running,
 *    and podman reads the container running. On main it is gone: conmon
 *    took the unit's SIGTERM and passed it on.
 *
 * Cleanup removes only what the spec made, by name: its unit
 * (`systemctl --user stop`), its container (`podman rm -f` on its own
 * storage), its storage and socket dir. It signals no process itself.
 *
 *   bun scripts/probe-kit/run.ts keeper-stop-container
 */
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { SessiondClient } from "../../../packages/agent/src/sessiond-client";
import { until } from "../../scratch-fleet";
import { type Kit, ROOT, type Spec } from "../kit";

/** One command's exit and words. */
interface Ran {
  code: number;
  err: string;
  out: string;
}

const run = async (argv: string[]): Promise<Ran> => {
  const child = Bun.spawn(argv, { stdout: "pipe", stderr: "pipe" });
  const [out, err, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { code, out: out.trim(), err: err.trim() };
};

/** `s` as one word to sh. */
const quoted = (s: string): string => `'${s.replaceAll("'", "'\\''")}'`;

/** A process's start time in clock ticks (`/proc/<pid>/stat` field 22); undefined once it is gone. */
const startedAt = async (pid: number): Promise<string | undefined> => {
  const stat = await readFile(`/proc/${pid}/stat`, "utf8").catch(() => "");
  // The command name (field 2) is in parentheses and may hold spaces: count from its end.
  return stat.slice(stat.lastIndexOf(")") + 2).split(" ")[19];
};

/** A process's cgroup v2 path (`/proc/<pid>/cgroup`'s `0::` line). */
const cgroupOf = async (pid: number): Promise<string> =>
  (await readFile(`/proc/${pid}/cgroup`, "utf8").catch(() => ""))
    .split("\n")
    .find((line) => line.startsWith("0::"))
    ?.slice(3) ?? "unreadable";

/** The container's PID 1: a shell that exits on SIGTERM and otherwise stays. */
const PID1 = 'trap "exit 0" TERM; while :; do sleep 1; done';

/** Everything one run of the leg names, all of it its own. */
interface Leg {
  home: string;
  name: string;
  /** podman on the leg's own storage. */
  podman: string[];
  rootfs: string;
  socket: string;
  sockets: string;
  storage: string[];
  tag: string;
  unit: string;
}

const legOf = (kit: Kit, runtime: string, podmanAt: string): Leg => {
  const tag = crypto.randomUUID().slice(0, 8);
  const sockets = join(runtime, `cawco-probe-${tag}`);
  const storage = ["storage", "runroot", "podman-tmp"].map((dir) =>
    join(kit.out, dir)
  );
  const [root, runroot, tmp] = storage as [string, string, string];
  return {
    tag,
    unit: `cawco-probe-keeper-${tag}.service`,
    name: `cawco-probe-container-${tag}`,
    sockets,
    socket: join(sockets, "sessiond.sock"),
    home: join(kit.out, "home"),
    rootfs: join(kit.out, "rootfs"),
    storage,
    podman: [podmanAt, "--root", root, "--runroot", runroot, "--tmpdir", tmp],
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

/** 1: the scratch keeper as a delegated user unit of its own; why not, when it does not listen. */
const startKeeper = async (kit: Kit, leg: Leg): Promise<string | undefined> => {
  const started = await run([
    "systemd-run",
    "--user",
    `--unit=${leg.unit}`,
    "--collect",
    "-p",
    "Delegate=pids memory cpu",
    "-p",
    "DelegateSubgroup=keeper",
    "-p",
    `WorkingDirectory=${kit.out}`,
    `--setenv=HOME=${leg.home}`,
    `--setenv=PATH=${process.env.PATH ?? "/usr/bin:/bin"}`,
    `--setenv=CAWCO_SESSIOND_ENDPOINT=${leg.socket}`,
    "--",
    process.execPath,
    join(ROOT, "packages", "sessiond", "src", "main.ts"),
  ]);
  if (started.code !== 0) {
    return `systemd-run exited ${started.code}: ${started.err}`;
  }
  const up = await until(
    "the scratch keeper listening",
    () => existsSync(leg.socket),
    Boolean,
    30_000
  ).catch(() => false);
  if (up) {
    return;
  }
  const log = await run([
    "journalctl",
    "--user",
    "-u",
    leg.unit,
    "-n",
    "30",
    "--no-pager",
  ]);
  return `it never listened on ${leg.socket}: ${log.out.slice(-1500)}`;
};

/** What the keeper's child said and started: its INVOCATION_ID, and the container's PID 1 and conmon. */
interface Composed {
  conmon: number;
  inv: string;
  pid: number;
}

/** 2: a child of the keeper, started as a session's, runs `podman run -d` and stays; why not, when it fails. */
const composeFromChild = async (
  kit: Kit,
  leg: Leg
): Promise<Composed | string> => {
  const dialled = await SessiondClient.connect(leg.socket);
  if (dialled.kind !== "answered") {
    return `the scratch keeper did not answer: ${dialled.reason}`;
  }
  const client = dialled.value;
  const lines: string[] = [];
  const procId = `probe-compose-${leg.tag}`;
  client.subscribe(procId, {
    line: (event) => {
      lines.push(event.data);
    },
  });
  const compose = [
    `echo "PC|inv=\${INVOCATION_ID:-none}|end"`,
    `${leg.podman.map(quoted).join(" ")} run -d --name ${quoted(leg.name)} --network none --rootfs ${quoted(leg.rootfs)} -v /usr:/usr:ro /bin/sh -c ${quoted(PID1)} >/dev/null 2>"$HOME/podman-run.err"`,
    `echo "PC|run=$?|end"`,
    "exec sleep 600",
  ].join("; ");
  try {
    await client.spawnProc(procId, {
      command: "/bin/sh",
      args: ["-c", compose],
      cwd: kit.out,
      inherit: "session",
    });
    const ran = await until(
      "podman run -d from the keeper's child",
      () => lines.find((line) => line.startsWith("PC|run=")),
      Boolean,
      120_000
    ).catch(() => undefined);
    if (ran !== "PC|run=0|end") {
      const err = await readFile(join(leg.home, "podman-run.err"), "utf8")
        .then((text) => text.slice(-1500))
        .catch(() => "");
      return `podman run -d: ${ran ?? "no answer"}; ${err}`;
    }
  } finally {
    client.close();
  }
  const inspected = await run([
    ...leg.podman,
    "inspect",
    "-f",
    "{{.State.Pid}} {{.State.ConmonPid}}",
    leg.name,
  ]);
  const [pid, conmon] = inspected.out.split(" ").map(Number);
  if (!(pid && conmon)) {
    return `podman inspect named no PID 1 and conmon: ${inspected.err || inspected.out}`;
  }
  return {
    pid,
    conmon,
    inv: lines.find((line) => line.startsWith("PC|inv=")) ?? "no line",
  };
};

/** What became of PID 1, in words. */
const fateOf = (before: string | undefined, after: string | undefined) => {
  if (after === undefined) {
    return "gone";
  }
  return after === before ? "the same process" : "a different process";
};

/** 3 to 5: where conmon runs, the keeper's unit stopped, and the container after it. */
const judge = async (kit: Kit, leg: Leg, composed: Composed) => {
  const { pid, conmon, inv } = composed;
  const before = await startedAt(pid);
  const conmonGroup = await cgroupOf(conmon);
  kit.check(
    "(a) the container's conmon runs outside the keeper's unit",
    conmonGroup !== "unreadable" && !conmonGroup.includes(`/${leg.unit}/`),
    `the child read ${inv}; conmon ${conmon} in ${conmonGroup}`
  );
  const stopped = await run(["systemctl", "--user", "stop", leg.unit]);
  await Bun.sleep(3000);
  const after = await startedAt(pid);
  const status = await run([
    ...leg.podman,
    "inspect",
    "-f",
    "{{.State.Status}}",
    leg.name,
  ]);
  kit.check(
    "(b) once the keeper's unit is stopped, the container's PID 1 is the same process and podman reads it running",
    stopped.code === 0 &&
      before !== undefined &&
      after === before &&
      status.out === "running",
    `systemctl --user stop exited ${stopped.code}${stopped.err ? ` (${stopped.err})` : ""}; PID 1 ${pid} ${fateOf(before, after)}; podman reads ${status.out || status.err}`
  );
};

/** Removes what the leg made, by name: its unit, its container, its storage and socket dir. */
const cleanUp = async (leg: Leg): Promise<void> => {
  await run(["systemctl", "--user", "stop", leg.unit]);
  await run([...leg.podman, "rm", "-f", "-t", "0", leg.name]);
  // The overlay's files are the user namespace's: removed from inside it.
  await run([...leg.podman, "unshare", "rm", "-rf", ...leg.storage]);
  await rm(leg.sockets, { recursive: true, force: true });
};

const spec: Spec = {
  name: "keeper-stop-container",
  host: "it runs a keeper as a systemd user unit and starts a podman container from its child",
  run: async (kit: Kit) => {
    const runtime = process.env.XDG_RUNTIME_DIR;
    const manager = await run(["systemctl", "--user", "is-system-running"]);
    const podmanAt = Bun.which("podman");
    if (!(process.platform === "linux" && runtime && podmanAt && manager.out)) {
      kit.check(
        "0: this machine has systemd's user manager, XDG_RUNTIME_DIR and podman",
        false,
        `platform ${process.platform}; XDG_RUNTIME_DIR ${runtime ?? "unset"}; podman ${podmanAt ?? "not on PATH"}; systemctl --user is-system-running: ${manager.out || manager.err}`
      );
      return;
    }
    const leg = legOf(kit, runtime, podmanAt);
    await mkdir(leg.home, { recursive: true });
    await mkdir(leg.sockets, { recursive: true, mode: 0o700 });
    await makeRootfs(leg.rootfs);
    try {
      const refused = await startKeeper(kit, leg);
      if (refused) {
        kit.check("1: the scratch keeper runs as a user unit", false, refused);
        return;
      }
      const composed = await composeFromChild(kit, leg);
      if (typeof composed === "string") {
        kit.check(
          "2: the keeper's child starts a container with podman run -d",
          false,
          composed
        );
        return;
      }
      await judge(kit, leg, composed);
    } finally {
      await cleanUp(leg);
    }
  },
};

export default spec;
