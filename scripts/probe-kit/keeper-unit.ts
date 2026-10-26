/**
 * A scratch keeper as a systemd user unit of its own, for the host specs that
 * read what a keeper's stop or sweep does to what its children started, or
 * whether it is stopped at all (keeper-stop-container, keeper-sweep-scope).
 * Host only: a workspace reaches no service manager.
 *
 * The unit runs this checkout's sessiond, delegated as the real keeper's unit
 * is (`Delegate=pids memory cpu`, `DelegateSubgroup=keeper`), under a name
 * the agent's own keeper jobs take (`cawco-sessiond-probe-<tag>.service`,
 * agent keeper-jobs.ts `keeperJob` of a build `probe-<tag>`), so a spec can
 * stop it the way an agent's update retires a keeper. It has a HOME and a
 * socket dir of its own and nothing else of the machine's: its `keeper` link
 * is written in its own socket dir.
 *
 * Nothing here signals a process. A unit goes by `systemctl --user stop` of
 * its own name.
 */
import { existsSync } from "node:fs";
import { mkdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { SessiondClient } from "../../packages/agent/src/sessiond-client";
import type { KeeperName } from "../../packages/core/src/keepers";
import {
  startedPath,
  systemProgram,
} from "../../packages/core/src/workspace-needs";
import { until } from "../scratch-fleet";
import { type Kit, ROOT } from "./kit";

/** One command's exit and words. */
export interface Ran {
  code: number;
  err: string;
  out: string;
}

/**
 * Runs `argv` with this process's environment as it is now: Bun.spawn with
 * no `env` passes the one the process started with, and a spec that sets a
 * variable for what it runs (keeper-stop-container's bus) must be heard.
 */
export const run = async (argv: string[]): Promise<Ran> => {
  const child = Bun.spawn(argv, {
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env },
  });
  const [out, err, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { code, out: out.trim(), err: err.trim() };
};

/** `s` as one word to sh. */
export const quoted = (s: string): string => `'${s.replaceAll("'", "'\\''")}'`;

/** A process's start time in clock ticks (`/proc/<pid>/stat` field 22); undefined once it is gone. */
export const startedAt = async (pid: number): Promise<string | undefined> => {
  const stat = await readFile(`/proc/${pid}/stat`, "utf8").catch(() => "");
  // The command name (field 2) is in parentheses and may hold spaces: count from its end.
  return stat.slice(stat.lastIndexOf(")") + 2).split(" ")[19];
};

/** A process's cgroup v2 path (`/proc/<pid>/cgroup`'s `0::` line), or `unreadable`. */
export const cgroupOf = async (pid: number): Promise<string> =>
  (await readFile(`/proc/${pid}/cgroup`, "utf8").catch(() => ""))
    .split("\n")
    .find((line) => line.startsWith("0::"))
    ?.slice(3) ?? "unreadable";

/** What became of a process read before and after, in words. */
export const fateOf = (
  before: string | undefined,
  after: string | undefined
): string => {
  if (after === undefined) {
    return "gone";
  }
  return after === before ? "the same process" : "a different process";
};

/** Why this machine cannot run a keeper unit, or undefined when it can. */
export const hostRefusal = async (
  needs: readonly string[] = []
): Promise<string | undefined> => {
  const manager = await run(["systemctl", "--user", "is-system-running"]);
  const missing = needs.filter((tool) => !Bun.which(tool));
  if (
    process.platform === "linux" &&
    process.env.XDG_RUNTIME_DIR &&
    manager.out &&
    missing.length === 0
  ) {
    return;
  }
  return `platform ${process.platform}; XDG_RUNTIME_DIR ${process.env.XDG_RUNTIME_DIR ?? "unset"}; systemctl --user is-system-running: ${manager.out || manager.err}; not on PATH: ${missing.join(", ") || "none"}`;
};

/** One scratch keeper unit: its names and its own dirs. */
export interface KeeperUnit {
  /** Its own HOME. */
  home: string;
  /** The keeper as the agent's keeper jobs name it (agent keeper-jobs.ts `keeperJob`). */
  keeper: KeeperName;
  socket: string;
  /** Its own socket dir, under XDG_RUNTIME_DIR. */
  sockets: string;
  tag: string;
  unit: string;
}

/** A keeper unit's names, for leg `label` of a spec: nothing made yet. */
export const keeperUnitOf = (kit: Kit, label: string): KeeperUnit => {
  const tag = crypto.randomUUID().slice(0, 8);
  const sockets = join(
    process.env.XDG_RUNTIME_DIR ?? kit.out,
    `cawco-probe-${tag}`
  );
  return {
    tag,
    keeper: { kind: "build", version: `probe-${tag}` },
    unit: `cawco-sessiond-probe-${tag}.service`,
    home: join(kit.out, label, "home"),
    sockets,
    socket: join(sockets, "sessiond.sock"),
  };
};

/** Starts the keeper unit and waits for it to listen; why not, when it does not. */
export const startKeeperUnit = async (
  kit: Kit,
  keeper: KeeperUnit
): Promise<string | undefined> => {
  await mkdir(keeper.home, { recursive: true });
  await mkdir(keeper.sockets, { recursive: true, mode: 0o700 });
  const started = await run([
    "systemd-run",
    "--user",
    `--unit=${keeper.unit}`,
    "--collect",
    "-p",
    "Delegate=pids memory cpu",
    "-p",
    "DelegateSubgroup=keeper",
    "-p",
    `WorkingDirectory=${kit.out}`,
    `--setenv=HOME=${keeper.home}`,
    `--setenv=PATH=${startedPath()}`,
    `--setenv=CAWCO_SESSIOND_ENDPOINT=${keeper.socket}`,
    "--",
    process.execPath,
    join(ROOT, "packages", "sessiond", "src", "main.ts"),
  ]);
  if (started.code !== 0) {
    return `systemd-run exited ${started.code}: ${started.err}`;
  }
  const up = await until(
    "the scratch keeper listening",
    () => existsSync(keeper.socket),
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
    keeper.unit,
    "-n",
    "30",
    "--no-pager",
  ]);
  return `it never listened on ${keeper.socket}: ${log.out.slice(-1500)}`;
};

/** The unit's own `INVOCATION_ID`, as systemd set it for the keeper. */
export const unitInvocation = async (keeper: KeeperUnit): Promise<string> =>
  (
    await run([
      "systemctl",
      "--user",
      "show",
      "-p",
      "InvocationID",
      "--value",
      keeper.unit,
    ])
  ).out;

/** A child the keeper started, its output so far, and the connection that follows it. */
export interface Started {
  client: SessiondClient;
  /** Resolves when the child exits. */
  exited: Promise<void>;
  lines: string[];
  procId: string;
}

/** Starts `script` under sh as a session's child of the keeper (`inherit: "session"`), `env` over what it gets. */
export const startChild = async (
  kit: Kit,
  keeper: KeeperUnit,
  script: string,
  env: Record<string, string> = {}
): Promise<Started | string> => {
  const dialled = await SessiondClient.connect(keeper.socket);
  if (dialled.kind !== "answered") {
    return `the scratch keeper did not answer: ${dialled.reason}`;
  }
  const client = dialled.value;
  const lines: string[] = [];
  const procId = `probe-child-${keeper.tag}`;
  const exited = new Promise<void>((resolve) => {
    client.subscribe(procId, {
      line: (event) => {
        lines.push(event.data);
      },
      exit: () => resolve(),
    });
  });
  await client.spawnProc(procId, {
    command: systemProgram("sh"),
    args: ["-c", script],
    cwd: kit.out,
    env,
    inherit: "session",
  });
  return { client, exited, lines, procId };
};

/** The pids of the live children the keeper's register lists, as an agent's update reads them (agent binary-update.ts `readKeepers`). */
export const registerChildren = async (
  keeper: KeeperUnit
): Promise<number[] | string> => {
  const dialled = await SessiondClient.connect(keeper.socket);
  if (dialled.kind !== "answered") {
    return `the scratch keeper did not answer: ${dialled.reason}`;
  }
  try {
    const listed = await dialled.value.list();
    return listed.procs.filter((proc) => proc.alive).map((proc) => proc.pid);
  } finally {
    dialled.value.close();
  }
};

/** systemd's word for the unit: `active`, `inactive`, `failed`, … */
export const unitState = async (keeper: KeeperUnit): Promise<string> => {
  const shown = await run(["systemctl", "--user", "is-active", keeper.unit]);
  return shown.out || shown.err;
};

/** Stops the keeper unit, if it still runs, and removes its socket dir. */
export const endKeeperUnit = async (keeper: KeeperUnit): Promise<void> => {
  await run(["systemctl", "--user", "stop", keeper.unit]);
  await rm(keeper.sockets, { recursive: true, force: true });
};
