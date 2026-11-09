/**
 * Installing, restarting, stopping and removing CawCo's services under the
 * machine's service manager, and reading their logs: systemd user units with
 * their sockets, or LaunchAgents in the user's GUI domain.
 */

import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { platform } from "node:os";
import type { ServiceId } from "@cawco/core/binary-installation";
import { CAWCO_ENV } from "@cawco/core/cawco-env";
import {
  forgetLaunchdStart,
  launchdLog,
  launchdLogsDir,
  removeLaunchdLog,
} from "@cawco/core/launchd";
import { hostEnvironment } from "@cawco/core/session-env";
import { writeStateFile } from "@cawco/core/state-file";
import { until } from "@cawco/core/until";
import { foreignIn, KeeperKept } from "./keeper-job";
import {
  guiDomain,
  label,
  launchAgentPath,
  socketName,
  socketPath,
  systemdPath,
  unitName,
} from "./names";
import {
  listenAddress,
  plist,
  type ServiceSpec,
  type SocketSpec,
  socketUnit,
  unit,
} from "./units";

/** Thrown for anything the caller can fix — a wrong platform, a failed launchctl. */
export class ServiceError extends Error {}

export const run = async (argv: string[]) =>
  Bun.$`${argv}`
    .env({
      ...hostEnvironment(),
      // logind owns this directory; su shells need not inherit its location.
      ...(platform() === "linux"
        ? {
            XDG_RUNTIME_DIR:
              process.env.XDG_RUNTIME_DIR ?? `/run/user/${process.getuid?.()}`,
          }
        : {}),
    })
    .quiet()
    .nothrow();

export const failed = (
  what: string,
  result: Awaited<ReturnType<typeof run>>
): ServiceError =>
  new ServiceError(
    `${what} failed: ${result.stderr.toString().trim() || `exit ${result.exitCode}`}`
  );

/**
 * A service definition someone else can rewrite is a service someone else can
 * run as you, so it is written owner-only, whole.
 */
export const writeUnit = (path: string, contents: string): Promise<void> =>
  writeStateFile(path, contents, { mode: 0o600 });

/** How long a booted-out LaunchAgent gets to finish exiting. */
const BOOTOUT_WAIT_MS = 60_000;

/**
 * Puts whatever the plist now says in front of launchd with `bootstrap`,
 * replacing whatever it was running under that label: what an install over a
 * running service means. `bootstrap`, `bootout` and `kickstart` are launchctl's
 * interface; a launchctl without them refuses in its own words.
 */
export const loadLaunchAgent = async (
  spec: ServiceSpec,
  note: (line: string) => void
): Promise<void> => {
  const path = launchAgentPath(spec.name);
  const target = `${guiDomain()}/${label(spec.name)}`;
  // launchd refuses to bootstrap a label it already knows.
  await run(["launchctl", "bootout", target]);
  // …and `bootout` returns before the label is gone: a service that drains on
  // SIGTERM (sessiond, taking its children down) is still being torn down,
  // and bootstrapping it then fails with "5: Input/output error" and leaves it
  // stopped. So the label is waited out first.
  const unloaded = await until(
    async () => (await run(["launchctl", "print", target])).exitCode !== 0,
    { deadline: Date.now() + BOOTOUT_WAIT_MS, every: 250 }
  );
  if (!unloaded) {
    throw new ServiceError(
      `${target} was still loaded ${BOOTOUT_WAIT_MS / 1000}s after launchctl bootout, so it was not started again from the new plist. Check it with \`launchctl print ${target}\`, then run this again.`
    );
  }

  // Its start record is the run this bootstrap starts, or none (launchd.ts).
  await forgetLaunchdStart(label(spec.name));
  const bootstrapped = await run(["launchctl", "bootstrap", guiDomain(), path]);
  if (bootstrapped.exitCode !== 0) {
    throw failed("launchctl bootstrap", bootstrapped);
  }
  note(`bootstrapped into ${guiDomain()}`);
};

/**
 * Writes and bootstraps LaunchAgents into the logged-in user's GUI domain.
 * Exported so a throwaway probe can go through this exact path to show what a
 * service the installer starts can do on a given Mac.
 */
export const installLaunchAgents = async (
  specs: ServiceSpec[],
  note: (line: string) => void
): Promise<void> => {
  // launchd opens stdout/stderr before any process can create its log folder.
  await mkdir(launchdLogsDir(), { recursive: true });

  for (const [index, spec] of specs.entries()) {
    if (index > 0) {
      note("");
    }
    const path = launchAgentPath(spec.name);
    const text = plist(spec);
    // A job launchd holds a socket for keeps it only while it stays loaded:
    // booting it out closes the socket, and a page load in that gap is refused.
    // So an unchanged, loaded one is left running — a deploy restarts it with
    // `kickstart -k`, which keeps the socket.
    if (
      spec.sockets &&
      (await Bun.file(path)
        .text()
        .catch(() => "")) === text &&
      (await run(["launchctl", "print", `${guiDomain()}/${label(spec.name)}`]))
        .exitCode === 0
    ) {
      note(`${path} is unchanged and loaded, so its socket stays open`);
      continue;
    }
    await writeUnit(path, text);
    note(`wrote ${path}`);

    await loadLaunchAgent(spec, note);

    note(`logs ${launchdLog(spec.name)}`);
    if (spec.launchAgentNote) {
      note("");
      for (const line of spec.launchAgentNote) {
        note(line);
      }
    }
  }
};

export const uninstallLaunchAgents = async (
  specs: ServiceSpec[],
  note: (line: string) => void
): Promise<void> => {
  for (const spec of specs) {
    const path = launchAgentPath(spec.name);
    await run(["launchctl", "bootout", `${guiDomain()}/${label(spec.name)}`]);
    await forgetLaunchdStart(label(spec.name));
    await Bun.file(path)
      .delete()
      .catch(() => {
        // best effort: the plist may already be gone
      });
    note(`removed ${path}`);
    // Its log goes with it (core launchd.ts `removeLaunchdLog`).
    await removeLaunchdLog(spec.name);
    note(`removed ${launchdLog(spec.name)}`);
  }
};

/**
 * Without lingering, systemd tears the user manager down at logout and takes the
 * services with it — the same "it dies when I disconnect" they are meant to
 * fix. Only worth saying when it is actually off.
 */
const lingerHint = async (note: (line: string) => void): Promise<void> => {
  const user = process.env.USER ?? "";
  const shown = await run(["loginctl", "show-user", user, "--property=Linger"]);
  if (shown.exitCode !== 0 || shown.stdout.toString().includes("Linger=yes")) {
    return;
  }
  note("");
  note(
    "This user has no persistent session, so the services stop at logout. Fix with:"
  );
  note(`  sudo loginctl enable-linger ${user}`);
};

/**
 * Lingering must already be on for this user: the installer turns it on before
 * placing anything, and a machine whose services stop at logout has not joined
 * anything, so this says exactly what is missing rather than guess.
 */
export const requireLinger = async (
  note: (line: string) => void
): Promise<void> => {
  // sd_booted(3): systemd as PID 1 is exactly when this directory exists.
  // Without it there is no user manager to linger and no unit to install, so
  // the answer is what the machine is missing, not a loginctl command that
  // cannot work there.
  note("checking for systemd…");
  if (!existsSync("/run/systemd/system")) {
    throw new ServiceError(
      "this machine is not running systemd (no /run/systemd/system), and cawco's services are systemd user units, so there is nothing here to install them into. Add a machine whose init is systemd."
    );
  }
  // The name comes from the system, never from an environment variable.
  const name = (await run(["id", "-un"])).stdout.toString().trim();
  const current = await run([
    "loginctl",
    "show-user",
    name,
    "--property=Linger",
    "--value",
  ]);
  if (current.exitCode !== 0 || current.stdout.toString().trim() !== "yes") {
    throw new ServiceError(
      `lingering is off for ${name}, so systemd would stop this machine's services when its last session closes. Turn it on, then run this again:\n  loginctl enable-linger ${name}\nIf that is refused, ask an administrator to run:\n  sudo loginctl enable-linger ${name}`
    );
  }
};

/**
 * Puts a service's listening socket in front of systemd, and says whether that
 * socket has to be (re)bound: it is not listening yet, or it is listening on an
 * address the unit no longer names. Called before the daemon-reload, so the
 * text on disk is still the one systemd is running.
 */
const writeSocketUnit = async (
  spec: ServiceSpec,
  socket: SocketSpec,
  note: (line: string) => void
): Promise<boolean> => {
  const path = socketPath(socket.unit);
  const text = socketUnit(spec, socket);
  const before = await Bun.file(path)
    .text()
    .catch(() => "");
  await writeUnit(path, text);
  note(`wrote ${path}`);
  const active = await run([
    "systemctl",
    "--user",
    "is-active",
    socketName(socket.unit),
  ]);
  return active.stdout.toString().trim() !== "active" || before !== text;
};

/**
 * Every socket of `spec` written ({@link writeSocketUnit}): those that have to
 * be (re)bound. A loopback socket unit an earlier install wrote and this one
 * names no longer (its port is the network's now) is stopped and removed.
 */
export const writeSocketUnits = async (
  spec: ServiceSpec,
  note: (line: string) => void
): Promise<SocketSpec[]> => {
  const sockets = spec.sockets ?? [];
  const moving: SocketSpec[] = [];
  for (const socket of sockets) {
    if (await writeSocketUnit(spec, socket, note)) {
      moving.push(socket);
    }
  }
  const stale = `${spec.id}-local`;
  if (
    sockets.length > 0 &&
    !sockets.some((socket) => socket.unit === stale) &&
    existsSync(socketPath(stale))
  ) {
    await run(["systemctl", "--user", "disable", "--now", socketName(stale)]);
    await Bun.file(socketPath(stale)).delete();
    note(`removed ${socketPath(stale)}`);
  }
  return moving;
};

/**
 * Binds `sockets` of `spec`. The service is stopped first: systemd opens no
 * socket while its service runs (src/core/socket.c: "Socket service %s
 * already active, refusing."), whatever holds a port while its socket is down
 * may be that service binding it itself (an install from before it was
 * socket-activated), and a socket cannot bind a port that is taken. A
 * required socket that does not open throws; a wanted one that does not is
 * said, and the service starts on the rest. Only ever run for sockets that
 * are down or moving, so a service already serving on them is never stopped
 * here.
 */
export const bindSockets = async (
  spec: ServiceSpec,
  sockets: readonly SocketSpec[],
  note: (line: string) => void
): Promise<void> => {
  const stopped = await run([
    "systemctl",
    "--user",
    "stop",
    unitName(spec.name),
  ]);
  if (stopped.exitCode !== 0) {
    throw failed("systemctl --user stop", stopped);
  }
  for (const socket of sockets) {
    const name = socketName(socket.unit);
    const bound = await run(["systemctl", "--user", "restart", name]);
    const enabled = await run(["systemctl", "--user", "enable", name]);
    if (socket.required && bound.exitCode !== 0) {
      throw failed("systemctl --user restart", bound);
    }
    if (enabled.exitCode !== 0) {
      throw failed("systemctl --user enable", enabled);
    }
    note(
      bound.exitCode === 0
        ? `listening on ${name}`
        : `${name} did not open (${socket.listens.map(listenAddress).join(", ")}): ${unitName(spec.name)} runs without it; journalctl --user -u ${name} says why`
    );
  }
};

export const installSystemdUnits = async (
  specs: ServiceSpec[],
  note: (line: string) => void
): Promise<void> => {
  const rebind = new Map<ServiceId, SocketSpec[]>();
  for (const spec of specs) {
    const moving = await writeSocketUnits(spec, note);
    if (moving.length > 0) {
      rebind.set(spec.id, moving);
    }
    await writeUnit(systemdPath(spec.name), unit(spec));
    note(`wrote ${systemdPath(spec.name)}`);
  }

  // Once for the set: systemd re-reads every file it was handed, and enabling a
  // unit it has not read yet is what makes an install look like it did nothing.
  const reloaded = await run(["systemctl", "--user", "daemon-reload"]);
  if (reloaded.exitCode !== 0) {
    throw failed("systemctl --user daemon-reload", reloaded);
  }

  for (const spec of specs) {
    const moving = rebind.get(spec.id);
    if (moving) {
      await bindSockets(spec, moving, note);
    }
    const enabled = await run([
      "systemctl",
      "--user",
      "enable",
      "--now",
      unitName(spec.name),
    ]);
    if (enabled.exitCode !== 0) {
      throw failed("systemctl --user enable --now", enabled);
    }
    note(`enabled and started ${unitName(spec.name)}`);
    note(`logs journalctl --user -u ${unitName(spec.name)} -f`);
  }

  await lingerHint(note);
};

/** A dial that found no keeper listening. */
const NOBODY_THERE = new Set(["ECONNREFUSED", "ENOENT"]);

/**
 * The pids of the live children the keeper at `endpoint` lists; none when
 * no keeper listens there. Throws when one listens and does not answer:
 * then what it holds is not known.
 */
const keeperChildren = async (endpoint: string): Promise<number[]> => {
  // Imported here rather than at the top so no other verb pays for the keeper's client.
  const { SessiondClient } = await import("../sessiond-client");
  let dialled: Awaited<ReturnType<typeof SessiondClient.connect>>;
  try {
    dialled = await SessiondClient.connect(endpoint);
  } catch (error) {
    if (NOBODY_THERE.has((error as NodeJS.ErrnoException).code ?? "")) {
      return [];
    }
    throw error;
  }
  if (dialled.kind === "unanswered") {
    throw new ServiceError(
      `the session keeper at ${endpoint} did not answer within ${dialled.after} ms, so what it holds is not known and it was left alone. Go ahead anyway with --force.`
    );
  }
  try {
    const listed = await dialled.value.list();
    return listed.procs.filter((proc) => proc.alive).map((proc) => proc.pid);
  } finally {
    dialled.value.close();
  }
};

/**
 * Before a session keeper's unit is stopped or restarted, unless `force`: it
 * goes only while it holds nothing but the keeper and the process trees of
 * the children the keeper lists (agent service-manager/keeper-job.ts `foreignIn`). Anything
 * else there was started by someone else, and the stop is refused, naming
 * each process. Every other unit stops as it is.
 */
const mayStopKeeper = async (
  spec: ServiceSpec,
  force: boolean
): Promise<void> => {
  if (spec.id !== "sessiond" || force) {
    return;
  }
  const stopping = unitName(spec.name);
  const foreign = await foreignIn(
    stopping,
    await keeperChildren(spec.environment[CAWCO_ENV.sessiondEndpoint])
  );
  if (foreign.length > 0) {
    throw new ServiceError(
      `${new KeeperKept(stopping, foreign).message}. Go ahead anyway with --force.`
    );
  }
};

export const uninstallSystemdUnits = async (
  specs: ServiceSpec[],
  force: boolean,
  note: (line: string) => void
): Promise<void> => {
  for (const spec of specs) {
    await mayStopKeeper(spec, force);
    await run(["systemctl", "--user", "disable", "--now", unitName(spec.name)]);
    await Bun.file(systemdPath(spec.name))
      .delete()
      .catch(() => {
        // best effort: the unit file may already be gone
      });
    note(`removed ${systemdPath(spec.name)}`);
    for (const socket of spec.sockets ?? []) {
      await run([
        "systemctl",
        "--user",
        "disable",
        "--now",
        socketName(socket.unit),
      ]);
      await Bun.file(socketPath(socket.unit))
        .delete()
        .catch(() => {
          // best effort: the socket unit may already be gone
        });
      note(`removed ${socketPath(socket.unit)}`);
    }
  }
  await run(["systemctl", "--user", "daemon-reload"]);
};

export const restartLaunchAgent = async (
  spec: ServiceSpec,
  note: (line: string) => void
): Promise<void> => {
  if (!existsSync(launchAgentPath(spec.name))) {
    throw new ServiceError(
      `${spec.id} is not installed — \`cawco service install ${spec.id}\` first.`
    );
  }
  // The run this starts writes its own start record (launchd.ts).
  await forgetLaunchdStart(label(spec.name));
  const kicked = await run([
    "launchctl",
    "kickstart",
    "-k",
    `${guiDomain()}/${label(spec.name)}`,
  ]);
  if (kicked.exitCode !== 0) {
    throw failed("launchctl kickstart -k", kicked);
  }
  note(`restarted ${label(spec.name)}`);
};

export const restartSystemdUnit = async (
  spec: ServiceSpec,
  force: boolean,
  note: (line: string) => void
): Promise<void> => {
  if (!existsSync(systemdPath(spec.name))) {
    throw new ServiceError(
      `${spec.id} is not installed — \`cawco service install ${spec.id}\` first.`
    );
  }
  await mayStopKeeper(spec, force);
  const restarted = await run([
    "systemctl",
    "--user",
    "restart",
    unitName(spec.name),
  ]);
  if (restarted.exitCode !== 0) {
    throw failed("systemctl --user restart", restarted);
  }
  note(`restarted ${unitName(spec.name)}`);
};

/** Whether systemd runs service `id` now (`systemctl --user is-active`). */
export const systemdActive = async (id: ServiceId): Promise<boolean> =>
  (await run(["systemctl", "--user", "is-active", unitName(id)])).stdout
    .toString()
    .trim() === "active";

/** Stops one installed service and leaves it stopped. */
export const stopService = async (id: ServiceId): Promise<void> => {
  const stopped =
    platform() === "darwin"
      ? await run(["launchctl", "bootout", `${guiDomain()}/${label(id)}`])
      : await run(["systemctl", "--user", "stop", unitName(id)]);
  if (stopped.exitCode !== 0) {
    throw failed(`stopping ${id}`, stopped);
  }
};

/** How many lines of a service's history are worth reading without asking for more. */
const LOG_TAIL_LINES = 200;

export const launchAgentLogs = async (
  spec: ServiceSpec,
  follow: boolean
): Promise<void> => {
  const path = launchdLog(spec.name);
  if (!(await Bun.file(path).exists())) {
    throw new ServiceError(`no log yet at ${path} — is the service installed?`);
  }
  const tail = follow
    ? ["tail", "-n", `${LOG_TAIL_LINES}`, "-f"]
    : ["tail", "-n", `${LOG_TAIL_LINES}`];
  await Bun.spawn([...tail, path], {
    env: process.env,
    stdio: ["inherit", "inherit", "inherit"],
  }).exited;
};

export const systemdLogs = async (
  spec: ServiceSpec,
  follow: boolean
): Promise<void> => {
  const journal = [
    "journalctl",
    "--user",
    "-u",
    unitName(spec.name),
    "-n",
    `${LOG_TAIL_LINES}`,
  ];
  if (follow) {
    journal.push("-f");
  }
  await Bun.spawn(journal, {
    env: process.env,
    stdio: ["inherit", "inherit", "inherit"],
  }).exited;
};
