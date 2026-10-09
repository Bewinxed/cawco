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
import { mkdir, rm, writeFile } from "node:fs/promises";
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

const LAUNCHD_PID = /^\s*pid = (\d+)$/m;

/** One keeper's job, as the service manager runs it. */
export interface KeeperJob {
  /** Enabled: it starts with the machine (systemd), or loads at login (its plist is there). */
  readonly enable: () => Promise<void>;
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
  /** Started, if it is not running. */
  readonly start: () => Promise<void>;
}

const systemdJob = (keeper: KeeperName): KeeperJob => {
  const unit = `cawco-${keeperService(keeper)}.service`;
  const file = join(systemdDir(), unit);
  const reload = () => must(["systemctl", "--user", "daemon-reload"]);
  return {
    name: `systemd (--user ${unit})`,
    file,
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
      if (keeper.kind === "legacy") {
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

const launchdJob = (keeper: KeeperName): KeeperJob => {
  const label = `dev.cawco.${keeperService(keeper)}`;
  const domain = `gui/${process.getuid?.() ?? 0}`;
  const target = `${domain}/${label}`;
  const plist = join(homedir(), "Library", "LaunchAgents", `${label}.plist`);
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
    pid,
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
      if (keeper.kind === "legacy") {
        await run(["launchctl", "kill", "SIGKILL", target]);
      }
      await run(["launchctl", "bootout", target]);
      await rm(plist, { force: true });
    },
  };
};

/** The keeper's job on this machine's service manager; none where there is no service manager CawCo installs into. */
export const keeperJob = (keeper: KeeperName): KeeperJob | undefined => {
  if (process.platform === "darwin") {
    return launchdJob(keeper);
  }
  if (process.platform === "linux") {
    return systemdJob(keeper);
  }
  return undefined;
};
