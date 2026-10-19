/**
 * Each session keeper's job under the machine's service manager (core
 * keepers.ts): a systemd user unit `cawco-<name>.service`, or a launchd job
 * `dev.cawco.<name>` from `~/Library/LaunchAgents/dev.cawco.<name>.plist`,
 * `<name>` its {@link keeperService}. The unit or plist itself is written by
 * the build it runs (`cawco binary-units`); this starts, enables, retires,
 * restarts and removes it.
 *
 * Enabled is what starts with the machine: the current keeper's unit is
 * enabled (`WantedBy=default.target`, `RequiredBy=cawco-agent.service`), and
 * a retiring keeper's is not; on macOS a job loads at login from its plist,
 * so a retiring keeper's plist is removed while its job runs on.
 *
 * A KEEPER'S UNIT IS STOPPED ONLY WHILE IT HOLDS NOTHING BUT CAWCO'S OWN.
 * systemd's stop of a unit signals every process in its cgroup
 * (`KillMode=control-group`). Before `restart()` or `remove()` stops one, its
 * cgroup is read (`ControlGroup`, every `cgroup.procs` beneath it): the stop
 * goes ahead only when every process there is the keeper itself or in the
 * process tree of a child its register lists ({@link UnitStop}). Anything
 * else was started by someone else and only placed here, and the stop is
 * refused ({@link KeeperKept}): the keeper is kept, each such pid is said
 * with its command line, and the caller tries again on its next look. A
 * process is never moved out at stop time. A tool that outlives its launcher
 * claims a unit of its own as it starts (podman's `libpod-conmon-<id>.scope`,
 * `systemd-run --scope`), and CawCo gives no session its keeper's
 * `INVOCATION_ID` (core session-env.ts), which is what keeps podman's conmon
 * in its caller's cgroup. `force` is the one override: the person asked for
 * the stop outright.
 *
 * macOS has no cgroups. launchd ends a job's process group as the job stops
 * (launchd.plist(5) `AbandonProcessGroup`: "When a job dies, launchd kills any
 * remaining processes with the same process group ID as the job"), and every
 * child the keeper starts is a process group of its own, so what a session
 * started is not reached by a keeper's stop there.
 */
import type { Dirent } from "node:fs";
import { readdir, readFile, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { KeptProcess } from "@cawco/core/binary-updates";
import { type KeeperName, keeperService } from "@cawco/core/keepers";
import {
  forgetLaunchdStart,
  launchdEnded,
  launchdJob,
  launchdJobs,
} from "@cawco/core/launchd";
import { commandLine, processLineage } from "@cawco/core/process-identity";
import { hostEnvironment } from "@cawco/core/session-env";
import { listedPid, type Pid } from "@cawco/core/signal";

interface Ran {
  code: number;
  stderr: string;
  stdout: string;
}

const run = async (argv: string[]): Promise<Ran> => {
  // systemd's user manager gives every unit it runs XDG_RUNTIME_DIR, the bus
  // `systemctl --user` reaches it on: without one there is no user manager.
  if (process.platform === "linux" && !process.env.XDG_RUNTIME_DIR) {
    throw new Error(
      `systemd required: ${argv.join(" ")} needs systemd's user manager, and this process has no XDG_RUNTIME_DIR, so none runs it`
    );
  }
  const child = Bun.spawn(argv, {
    stdout: "pipe",
    stderr: "pipe",
    env: { ...hostEnvironment(), LC_ALL: "C" },
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { code, stdout, stderr };
};

/** Runs `argv`, and throws its own words when it fails. */
const must = async (argv: string[]): Promise<Ran> => {
  const ran = await run(argv);
  if (ran.code !== 0) {
    throw new Error(
      `${argv.join(" ")} exited ${ran.code}: ${ran.stderr.trim() || ran.stdout.trim()}`
    );
  }
  return ran;
};

/** The cgroup v2 mount. */
const CGROUP_ROOT = "/sys/fs/cgroup";

/**
 * What a keeper's stop may reach. `children`: the pids of the live children
 * its register lists; the stop goes ahead only when its unit holds nothing
 * but the keeper and their process trees. `force`: the person asked for the
 * stop outright, and it reaches everything in the unit.
 */
export type UnitStop =
  { readonly force: true } | { readonly children: readonly number[] };

/** A keeper's stop refused: its unit holds processes CawCo did not start. Its message names each one. */
export class KeeperKept extends Error {
  readonly foreign: readonly KeptProcess[];

  constructor(unit: string, foreign: readonly KeptProcess[]) {
    super(
      `${unit} is kept, not stopped: it holds ${foreign.length === 1 ? "1 process" : `${foreign.length} processes`} that neither the keeper nor one of its sessions runs: ${foreign.map(({ pid, command }) => `pid ${pid} (${command})`).join(", ")}`
    );
    this.foreign = foreign;
  }
}

/** A read that found nothing there answers `none`; any other failure stands. */
const unlessGone =
  <T>(none: T) =>
  (error: NodeJS.ErrnoException): T => {
    if (error.code === "ENOENT") {
      return none;
    }
    throw error;
  };

/** Every pid in cgroup `dir` and every cgroup beneath it; none once it is gone. */
const pidsUnder = async (dir: string): Promise<number[]> => {
  const own = (
    await readFile(join(dir, "cgroup.procs"), "utf8").catch(unlessGone(""))
  )
    .split("\n")
    .filter(Boolean)
    .map(Number);
  const entries = await readdir(dir, { withFileTypes: true }).catch(
    unlessGone([] as Dirent[])
  );
  const below = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => pidsUnder(join(dir, entry.name)))
  );
  return [...own, ...below.flat()];
};

/**
 * What in systemd user unit `unit` is foreign to its keeper: every process in
 * its cgroup that is neither its main process nor `children`, nor descended
 * from one of them. Read as the cgroup, then the process table: a process
 * that ended between the two is not there to stop. A unit that does not run
 * holds nothing. Throws when the unit cannot be read: then nobody knows.
 */
export async function foreignIn(
  unit: string,
  children: readonly number[]
): Promise<KeptProcess[]> {
  const shown = await must([
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
    new RegExp(`^${name}=(.*)$`, "m").exec(shown.stdout)?.[1]?.trim() ?? "";
  const group = property("ControlGroup");
  if (group === "") {
    return [];
  }
  const main = Number(property("MainPID"));
  const inUnit = await pidsUnder(join(CGROUP_ROOT, group));
  const table = await processLineage();
  const listed = new Set(table.map((row) => row.pid));
  const byParent = new Map<number, number[]>();
  for (const row of table) {
    byParent.set(row.ppid, [...(byParent.get(row.ppid) ?? []), row.pid]);
  }
  const ours = new Set<number>();
  const queue = [...(main > 0 ? [main] : []), ...children];
  for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
    if (!ours.has(next)) {
      ours.add(next);
      queue.push(...(byParent.get(next) ?? []));
    }
  }
  const foreign = await Promise.all(
    inUnit
      .filter((pid) => listed.has(pid) && !ours.has(pid))
      .map(async (pid) => {
        const command = await commandLine(pid);
        return command === undefined ? [] : [{ pid, command }];
      })
  );
  return foreign.flat();
}

const systemdDir = (): string =>
  join(
    process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"),
    "systemd",
    "user"
  );

const launchAgentsDir = (): string =>
  join(homedir(), "Library", "LaunchAgents");

/** A keeper's unit and its launchd label, and the service name each carries (core keepers.ts `keeperService`). */
const KEEPER_UNIT = /^cawco-(sessiond(?:-.+)?)\.service$/;
const KEEPER_PLIST = /^dev\.cawco\.(sessiond(?:-.+)?)\.plist$/;
const KEEPER_LABEL = /^dev\.cawco\.(sessiond(?:-.+)?)$/;

/** One keeper's job, as the service manager runs it. */
export interface KeeperJob {
  /** Enabled: it starts with the machine (systemd), or loads at login (its plist is there). */
  readonly enable: () => Promise<void>;
  /**
   * How its keeper ended, when it is not running since it was last started:
   * a keeper that exits before it answers did not start, and a restart by
   * the service manager would only fail again. Undefined while it runs, or
   * starts.
   */
  readonly exited: () => Promise<string | undefined>;
  /** Its unit or plist, as its build writes it. */
  readonly file: string;
  /**
   * What its unit holds that is foreign to its keeper, given the live
   * children its register lists ({@link foreignIn}); none on macOS, where
   * there are no cgroups.
   */
  readonly foreign: (children: readonly number[]) => Promise<KeptProcess[]>;
  /** Its name in the service manager, for a log line: `systemd (--user cawco-sessiond-x.service)`. */
  readonly name: string;
  /** Its main process as the service manager knows it, or none when it is not running. */
  readonly pid: () => Promise<Pid | undefined>;
  /**
   * Ends it and takes it off the machine, unit or plist and all. Only for a
   * keeper that holds nothing, or one wedged past saving. Refused
   * ({@link KeeperKept}) while its unit holds a process that is not its own,
   * unless `force`.
   */
  readonly remove: (stop: UnitStop) => Promise<void>;
  /** Restarts it in place, with everything it holds. Refused as {@link remove} is. */
  readonly restart: (stop: UnitStop) => Promise<void>;
  /** Not started with the machine any more; left running. */
  readonly retire: () => Promise<void>;
  /** Its keeper's service name, as {@link keeperService} gives it. */
  readonly service: string;
  /** Started, if it is not running. */
  readonly start: () => Promise<void>;
}

const systemdJob = (service: string): KeeperJob => {
  const unit = `cawco-${service}.service`;
  const file = join(systemdDir(), unit);
  const reload = () => must(["systemctl", "--user", "daemon-reload"]);
  const foreign = (children: readonly number[]) => foreignIn(unit, children);
  /** Throws {@link KeeperKept} when the unit holds what its keeper does not. */
  const mayStop = async (stop: UnitStop): Promise<void> => {
    if ("force" in stop) {
      return;
    }
    const found = await foreign(stop.children);
    if (found.length > 0) {
      throw new KeeperKept(unit, found);
    }
  };
  return {
    name: `systemd (--user ${unit})`,
    foreign,
    file,
    service,
    async exited() {
      const shown = await run([
        "systemctl",
        "--user",
        "show",
        "-p",
        "ActiveState",
        "-p",
        "SubState",
        "-p",
        "ExecMainStatus",
        unit,
      ]);
      const property = (name: string): string | undefined =>
        new RegExp(`^${name}=(.*)$`, "m").exec(shown.stdout)?.[1];
      const active = property("ActiveState");
      // `failed`, or waiting out RestartSec= to start again (`activating
      // (auto-restart)`), or `inactive`: it exited, by itself, since it started.
      return active === "failed" ||
        active === "inactive" ||
        property("SubState") === "auto-restart"
        ? `it exited with status ${property("ExecMainStatus") ?? "unknown"} (${active}, ${property("SubState")})`
        : undefined;
    },
    async pid() {
      const shown = await run([
        "systemctl",
        "--user",
        "show",
        "-p",
        "MainPID",
        "--value",
        unit,
      ]);
      // `MainPID=0`: no process runs it.
      const pid = Number(shown.stdout.trim());
      return shown.code === 0 && pid > 0 ? listedPid(pid) : undefined;
    },
    async start() {
      await must(["systemctl", "--user", "start", unit]);
    },
    async enable() {
      await must(["systemctl", "--user", "enable", unit]);
    },
    async retire() {
      await must(["systemctl", "--user", "disable", unit]);
    },
    async restart(stop) {
      await mayStop(stop);
      // The agent's unit is required by the current keeper's, so systemd
      // restarts the agent with it: everything to say is said before this.
      await must(["systemctl", "--user", "restart", unit]);
    },
    async remove(stop) {
      await mayStop(stop);
      await run(["systemctl", "--user", "disable", unit]);
      await must(["systemctl", "--user", "stop", unit]);
      await rm(file, { force: true });
      await rm(`${file}.d`, { recursive: true, force: true });
      await reload();
    },
  };
};

const launchdKeeperJob = (service: string): KeeperJob => {
  const label = `dev.cawco.${service}`;
  const domain = `gui/${process.getuid?.() ?? 0}`;
  const target = `${domain}/${label}`;
  const plist = join(launchAgentsDir(), `${label}.plist`);
  const pid = async (): Promise<Pid | undefined> => {
    const shown = (await launchdJob(label))?.pid;
    return shown === undefined ? undefined : listedPid(shown);
  };
  return {
    name: `launchd (${target})`,
    file: plist,
    service,
    pid,
    foreign: async () => [],
    // Loaded, with no process, and ended since it last started (a failing
    // status, or 0 with its start record): it ended by itself (KeepAlive
    // starts it again only after launchd's throttle).
    exited: async () => {
      const state = await launchdJob(label);
      return state && launchdEnded(state);
    },
    async start() {
      const state = await launchdJob(label);
      if (state?.pid === undefined) {
        // Only the process this start runs writes the record read above.
        await forgetLaunchdStart(label);
      }
      if (state === undefined) {
        await must(["launchctl", "bootstrap", domain, plist]);
        return;
      }
      if (state.pid === undefined) {
        await must(["launchctl", "kickstart", target]);
      }
    },
    // Its plist, written by its build, is what loads it at login.
    enable: async () => undefined,
    async retire() {
      await rm(plist, { force: true });
    },
    async restart() {
      await must(["launchctl", "kickstart", "-k", target]);
    },
    async remove() {
      await run(["launchctl", "bootout", target]);
      await rm(plist, { force: true });
      await forgetLaunchdStart(label);
    },
  };
};

/** The job of the keeper with this service name; none where there is no service manager CawCo installs into. */
const jobOf = (service: string): KeeperJob | undefined => {
  if (process.platform === "darwin") {
    return launchdKeeperJob(service);
  }
  if (process.platform === "linux") {
    return systemdJob(service);
  }
  return undefined;
};

/** The keeper's job on this machine's service manager; none where there is no service manager CawCo installs into. */
export const keeperJob = (keeper: KeeperName): KeeperJob | undefined =>
  jobOf(keeperService(keeper));

/**
 * Every keeper job the service manager has on this machine, whether or not a
 * keeper runs from it: each keeper unit file (systemd), each keeper plist and
 * each keeper label launchd has loaded (a retiring keeper's job runs on with
 * its plist removed).
 */
export async function keeperJobsHere(): Promise<KeeperJob[]> {
  const services = new Set<string>();
  const add = (pattern: RegExp) => (name: string) => {
    const service = pattern.exec(name)?.[1];
    if (service) {
      services.add(service);
    }
  };
  if (process.platform === "linux") {
    (await readdir(systemdDir()).catch(() => [] as string[])).forEach(
      add(KEEPER_UNIT)
    );
  } else if (process.platform === "darwin") {
    (await readdir(launchAgentsDir()).catch(() => [] as string[])).forEach(
      add(KEEPER_PLIST)
    );
    [...(await launchdJobs()).keys()].forEach(add(KEEPER_LABEL));
  }
  return [...services].flatMap((service) => jobOf(service) ?? []);
}
