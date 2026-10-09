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
 */
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { type KeeperName, keeperService } from "@cawco/core/keepers";
import { hostEnvironment } from "@cawco/core/session-env";

interface Ran {
  code: number;
  stderr: string;
  stdout: string;
}

const run = async (argv: string[]): Promise<Ran> => {
  const child = Bun.spawn(argv, {
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...hostEnvironment(),
      LC_ALL: "C",
      ...(process.platform === "linux"
        ? {
            XDG_RUNTIME_DIR:
              process.env.XDG_RUNTIME_DIR ?? `/run/user/${process.getuid?.()}`,
          }
        : {}),
    },
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

const systemdDir = (): string =>
  join(
    process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"),
    "systemd",
    "user"
  );

const launchAgentsDir = (): string =>
  join(homedir(), "Library", "LaunchAgents");

const LAUNCHD_PID = /^\s*pid = (\d+)$/m;
const LAUNCHD_LAST_EXIT = /^\s*last exit code = (-?\d+)/m;
const LAUNCHD_LAST_SIGNAL = /^\s*last terminating signal = (.+)$/m;
/** A keeper's unit and its launchd label, and the service name each carries (core keepers.ts `keeperService`). */
const KEEPER_UNIT = /^cawco-(sessiond(?:-.+)?)\.service$/;
const KEEPER_PLIST = /^dev\.cawco\.(sessiond(?:-.+)?)\.plist$/;
const KEEPER_LABEL = /^dev\.cawco\.(sessiond(?:-.+)?)$/;
/** The service name of a keeper from before keepers ran side by side. */
const LEGACY_SERVICE = "sessiond";

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
  /** Its name in the service manager, for a log line: `systemd (--user cawco-sessiond-x.service)`. */
  readonly name: string;
  /** Its main process as the service manager knows it, or none when it is not running. */
  readonly pid: () => Promise<number | undefined>;
  /**
   * Ends it and takes it off the machine, unit or plist and all. Only for a
   * keeper that holds nothing, or one wedged past saving. A legacy keeper is
   * killed outright: one built before keepers ran side by side removes its
   * endpoint's path on a graceful stop, and that path now names the current
   * keeper.
   */
  readonly remove: () => Promise<void>;
  /** Restarts it in place, with everything it holds. */
  readonly restart: () => Promise<void>;
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
  return {
    name: `systemd (--user ${unit})`,
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
      const pid = Number(shown.stdout.trim());
      return shown.code === 0 && pid > 0 ? pid : undefined;
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
    async restart() {
      // The agent's unit is required by the current keeper's, so systemd
      // restarts the agent with it: everything to say is said before this.
      await must(["systemctl", "--user", "restart", unit]);
    },
    async remove() {
      if (service === LEGACY_SERVICE) {
        // SIGKILL to every process of the unit, and no restart of a unit
        // stopped by a signal: its drain never runs.
        const dropins = `${file}.d`;
        await mkdir(dropins, { recursive: true });
        await writeFile(
          join(dropins, "retired.conf"),
          "[Service]\nKillSignal=SIGKILL\nRestart=no\n"
        );
        await reload();
      }
      await run(["systemctl", "--user", "disable", unit]);
      await must(["systemctl", "--user", "stop", unit]);
      await rm(file, { force: true });
      await rm(`${file}.d`, { recursive: true, force: true });
      await reload();
    },
  };
};

const launchdJob = (service: string): KeeperJob => {
  const label = `dev.cawco.${service}`;
  const domain = `gui/${process.getuid?.() ?? 0}`;
  const target = `${domain}/${label}`;
  const plist = join(launchAgentsDir(), `${label}.plist`);
  /** The job's state as launchd prints it: undefined when launchd has no such job loaded. */
  const printed = async (): Promise<string | undefined> => {
    const ran = await run(["launchctl", "print", target]);
    return ran.code === 0 ? ran.stdout : undefined;
  };
  const pid = async (): Promise<number | undefined> => {
    const found = LAUNCHD_PID.exec((await printed()) ?? "")?.[1];
    return found ? Number(found) : undefined;
  };
  return {
    name: `launchd (${target})`,
    file: plist,
    service,
    pid,
    async exited() {
      // Loaded, with no process, and an exit code since it last ran: it ended
      // by itself (KeepAlive starts it again only after launchd's throttle).
      const shown = await printed();
      if (shown === undefined || LAUNCHD_PID.test(shown)) {
        return;
      }
      const code = LAUNCHD_LAST_EXIT.exec(shown)?.[1];
      const signal = LAUNCHD_LAST_SIGNAL.exec(shown)?.[1];
      if (signal !== undefined) {
        return `it was ended by ${signal.trim()}`;
      }
      return code === undefined ? undefined : `it exited with code ${code}`;
    },
    async start() {
      if ((await printed()) === undefined) {
        await must(["launchctl", "bootstrap", domain, plist]);
        return;
      }
      if ((await pid()) === undefined) {
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
      if (service === LEGACY_SERVICE) {
        // Killed by its own pid, and gone, before launchd is asked anything:
        // `bootout` would send it SIGTERM. Should launchd start it again
        // meanwhile (a kill is not a successful exit), what starts is a keeper
        // on the machine's endpoint, a symlink now, which exits by itself.
        const running = await pid();
        if (running !== undefined) {
          killNow(running);
          await gone(running);
        }
      }
      await run(["launchctl", "bootout", target]);
      await rm(plist, { force: true });
    },
  };
};

const killNow = (target: number): void => {
  try {
    process.kill(target, "SIGKILL");
  } catch {
    // already gone
  }
};

/** How long a killed keeper gets to be gone before its removal goes on. */
const GONE_MS = 10_000;

/** Resolves once `target` is no longer a process, or {@link GONE_MS} has passed. */
const gone = async (target: number): Promise<void> => {
  const deadline = Date.now() + GONE_MS;
  for (;;) {
    try {
      process.kill(target, 0);
    } catch {
      return;
    }
    if (Date.now() > deadline) {
      return;
    }
    // biome-ignore lint/performance/noAwaitInLoops: a poll for one process to be gone
    await Bun.sleep(100);
  }
};

/** The job of the keeper with this service name; none where there is no service manager CawCo installs into. */
const jobOf = (service: string): KeeperJob | undefined => {
  if (process.platform === "darwin") {
    return launchdJob(service);
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
    // `launchctl list`: one job a line, PID, status and label, tab-separated.
    const listed = await run(["launchctl", "list"]);
    for (const line of listed.stdout.split("\n")) {
      add(KEEPER_LABEL)(line.split("\t")[2]?.trim() ?? "");
    }
  }
  return [...services].flatMap((service) => jobOf(service) ?? []);
}
