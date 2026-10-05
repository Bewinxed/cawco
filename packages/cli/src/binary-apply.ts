/**
 * The update helper, run by the service manager (not by the agent it replaces)
 * so it outlives the restart it performs. Only one runs at a time (an
 * exclusive lock file). It writes a trial marker, swaps the `current` pointer
 * atomically, restarts what may be restarted, waits for the new build to be
 * healthy, and puts the old build (and, when the schema changed, the old
 * database) back if it is not. It never restarts the session keeper while the
 * keeper holds a child, and never in a rollback.
 */

import { Database } from "bun:sqlite";
import { rmSync } from "node:fs";
import {
  appendFile,
  copyFile,
  open,
  readdir,
  readFile,
  rename,
  rm,
  symlink,
} from "node:fs/promises";
import { join } from "node:path";
import { machineId } from "@cawco/agent";
import { SessiondClient } from "@cawco/agent/sessiond-client";
import { probeHealth } from "@cawco/core/binary-health";
import {
  type BinaryInstallation,
  binaryRoot,
  installationPath,
  previousInstallationPath,
  readInstallation,
  readRunningManifest,
  readUpdateState,
  type TrialMarker,
  trialPath,
  updateStatePath,
  versionDirectory,
  writeJsonAtomic,
} from "@cawco/core/binary-installation";
import type { BinaryUpdateState } from "@cawco/core/binary-updates";
import { markerIsLive } from "@cawco/core/process-identity";
import {
  type ReleaseManifest,
  verifyManifest,
} from "@cawco/core/release-manifest";
import { sessiondEndpoint } from "@cawco/core/sessiond";
import { binaryLayout } from "./binary-install";
import { hubDbPath, type ServiceId, service, stopService } from "./service";

const HEALTH_MS = 45_000;
const MIGRATION_CAP_MS = 30 * 60_000;
const SERVICE_TIMEOUT_MS = 120_000;
/** How long a start may find an unconfirmed trial before the wrapper restores the previous build. */
const TRIAL_S = 150;

const lockPath = () => join(binaryRoot(), "apply.lock");
const note = (line: string) =>
  appendFile(
    join(binaryRoot(), "apply.log"),
    `${new Date().toISOString()} ${process.pid} ${line}\n`
  );

const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
};

/** Exclusive-create the lock; a lock whose process is gone is stale and taken over. */
async function takeLock(): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      // biome-ignore lint/performance/noAwaitInLoops: at most one retry, after clearing a stale lock
      const handle = await open(lockPath(), "wx", 0o600);
      await handle.writeFile(
        JSON.stringify({ pid: process.pid, startedAt: Date.now() })
      );
      await handle.close();
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
        throw error;
      }
      const held = JSON.parse(
        await readFile(lockPath(), "utf8").catch(() => "{}")
      ) as { pid?: number };
      if (held.pid && alive(held.pid)) {
        return false;
      }
      await rm(lockPath(), { force: true });
    }
  }
  return false;
}

function withTimeout<T>(
  work: Promise<T>,
  ms: number,
  what: string
): Promise<T> {
  return Promise.race([
    work,
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`${what} did not finish in ${ms / 1000}s`)),
        ms
      ).unref()
    ),
  ]);
}

const svc = (
  action: "install" | "restart",
  ids: readonly ServiceId[],
  keeper: string
) =>
  withTimeout(
    service(action, {
      ids,
      mode: "prod",
      follow: false,
      // The fence has already answered; this is the service manager's turn.
      force: true,
      whenIdle: false,
      note: (line) => console.log(`update: ${line}`),
      binaryLayout: binaryLayout(keeper),
    }),
    SERVICE_TIMEOUT_MS,
    `${action} ${ids.join(", ")}`
  );

/** Put a stopped service back: macOS reloads it, systemd restarts it. */
const startAgain = (ids: readonly ServiceId[], keeper: string) =>
  process.platform === "darwin"
    ? svc("install", ids, keeper)
    : svc("restart", ids, keeper);

async function pointCurrentAt(version: string): Promise<void> {
  const temporary = join(binaryRoot(), `current.${process.pid}`);
  await rm(temporary, { force: true });
  // Relative, as the installer and the service wrapper write it: `versions/<version>` inside the binary root.
  await symlink(join("versions", version), temporary);
  await rename(temporary, join(binaryRoot(), "current"));
}

/** Held children and epoch of the keeper, read now. */
async function readKeeper(): Promise<{
  epoch: string | undefined;
  held: number;
}> {
  const client = await SessiondClient.connect(
    process.env.CAWCO_SESSIOND_ENDPOINT ?? sessiondEndpoint()
  );
  try {
    return {
      held: client.procs.filter((proc) => proc.alive).length,
      epoch: client.epoch,
    };
  } finally {
    client.close();
  }
}

async function migrationRunning(db: string | undefined): Promise<boolean> {
  if (!db) {
    return false;
  }
  const marker = JSON.parse(
    await readFile(`${db}.migrating`, "utf8").catch(() => "{}")
  );
  return markerIsLive(marker);
}

/**
 * Healthy means all of it (see probeHealth) after the swap. A hub that is
 * migrating is given as long as it takes: the wait counts from the end of the
 * migration, and the trial marker's deadline moves with it.
 */
async function awaitHealthy(
  installation: BinaryInstallation,
  version: string,
  sinceMs: number,
  db: string | undefined,
  trial?: TrialMarker
): Promise<void> {
  const id = await machineId();
  const cap = Date.now() + MIGRATION_CAP_MS;
  let deadline = Date.now() + HEALTH_MS;
  for (;;) {
    // biome-ignore lint/performance/noAwaitInLoops: a poll; each read must see the services after the previous one
    if (await migrationRunning(db)) {
      if (Date.now() > cap) {
        throw new Error("The hub's migration did not end in 30 minutes");
      }
      deadline = Date.now() + HEALTH_MS;
      if (trial) {
        await writeJsonAtomic(trialPath(), {
          ...trial,
          deadline: Math.floor(Date.now() / 1000) + TRIAL_S,
        });
      }
    }
    const problem = await probeHealth({
      installation,
      machineId: id,
      sinceMs,
      version,
    });
    if (!problem) {
      return;
    }
    if (Date.now() > deadline) {
      throw new Error(problem);
    }
    await Bun.sleep(1000);
  }
}

/** Keeps the running build and the keeper's; skips anything partial. */
async function prune(keep: readonly string[]): Promise<void> {
  const versions = join(binaryRoot(), "versions");
  const stale = (await readdir(versions)).filter(
    (name) => !(keep.includes(name) || name.includes(".partial"))
  );
  await Promise.all(
    stale.map((name) =>
      rm(join(versions, name), { recursive: true, force: true })
    )
  );
}

async function readStaged(version: string): Promise<ReleaseManifest> {
  const directory = versionDirectory(version);
  const manifest = JSON.parse(
    await readFile(join(directory, "release.json"), "utf8")
  ) as ReleaseManifest;
  const { signature } = JSON.parse(
    await readFile(join(directory, "release.signature.json"), "utf8")
  ) as { signature: string };
  verifyManifest(manifest, signature);
  return manifest;
}

export async function applyBinary(
  version: string,
  held: number,
  keeperOnly: boolean
): Promise<void> {
  if (!(await takeLock())) {
    console.log("update: another update helper is running; nothing to do");
    return;
  }
  try {
    await note(`start ${version} held=${held} keeperOnly=${keeperOnly}`);
    await (keeperOnly ? advanceKeeper(version) : applyBuild(version, held));
    await note(`end ${version}`);
  } catch (error) {
    // Refused before anything changed: say so rather than leave the state at `installing`.
    await note(
      `failed ${error instanceof Error ? error.message : String(error)}`
    );
    await writeState(await readUpdateState(), {
      phase: "failed",
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    await rm(lockPath(), { force: true });
  }
}

async function writeState(
  before: BinaryUpdateState | undefined,
  state: Partial<BinaryUpdateState>
): Promise<void> {
  await writeJsonAtomic(updateStatePath(), {
    ...before,
    ...state,
    updatedAt: Date.now(),
  });
}

/** Advances only the session keeper, under the same policy as any update, and only if it holds nothing. */
async function advanceKeeper(version: string): Promise<void> {
  const installed = await readInstallation();
  if (!installed || installed.sessiondVersion === version) {
    return;
  }
  const before = await readUpdateState();
  const old = installed.sessiondVersion;
  const sinceMs = Date.now();
  const first = await readKeeper();
  if (first.held > 0) {
    await writeState(before, {
      phase: "waiting-sessions",
      heldChildren: first.held,
    });
    return;
  }
  await writeState(before, { phase: "installing", heldChildren: undefined });
  try {
    await svc("install", ["sessiond"], version);
    // The count, once more, immediately before the restart that would end any child it held.
    const second = await readKeeper();
    if (second.held > 0) {
      await svc("install", ["sessiond"], old);
      await writeState(before, {
        phase: "waiting-sessions",
        heldChildren: second.held,
      });
      return;
    }
    if (process.platform !== "darwin") {
      await svc("restart", ["sessiond"], version);
    }
    // The agent needs the keeper: restarting one restarts the other, so it is asked outright.
    await svc("restart", ["agent"], version);
    await awaitKeeperEpoch(second.epoch);
    // Only the keeper and the agent were restarted: on a hub's machine the hub and dashboard keep running
    // from before the swap, so what must have started after it is the agent's registration, which is
    // what probing as an agent-only machine checks.
    await awaitHealthy(
      { ...installed, role: "agent" },
      installed.installedVersion,
      sinceMs,
      undefined
    );
    await writeJsonAtomic(installationPath(), {
      ...installed,
      sessiondVersion: version,
    });
    await prune([installed.installedVersion, version]);
    await writeState(before, {
      phase: "installed",
      sessiondVersion: version,
      heldChildren: undefined,
      error: undefined,
      unseen: true,
    });
  } catch (error) {
    // The keeper stays as it is: a rollback never restarts it.
    await writeJsonAtomic(installationPath(), {
      ...installed,
      sessiondVersion: version,
    });
    await writeState(before, {
      phase: "failed",
      sessiondVersion: version,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function awaitKeeperEpoch(
  epochBefore: string | undefined
): Promise<void> {
  const end = Date.now() + HEALTH_MS;
  while (Date.now() < end) {
    // biome-ignore lint/performance/noAwaitInLoops: a poll
    const now = await readKeeper().catch(() => undefined);
    if (now?.epoch && now.epoch !== epochBefore) {
      return;
    }
    await Bun.sleep(500);
  }
  throw new Error("The session keeper did not come back as a new process");
}

/**
 * The keeper moves to the new build only if it holds nothing, counted
 * immediately before the restart that would end any child it held. Returns the
 * version the keeper ends on.
 */
async function moveKeeper(
  installed: BinaryInstallation,
  version: string,
  held: number
): Promise<string> {
  const stay = installed.sessiondVersion;
  if (held !== 0 || stay === version || (await readKeeper()).held !== 0) {
    return stay;
  }
  await svc("install", ["sessiond"], version);
  if ((await readKeeper()).held !== 0) {
    await svc("install", ["sessiond"], stay);
    return stay;
  }
  if (process.platform !== "darwin") {
    await svc("restart", ["sessiond"], version);
  }
  return version;
}

/** `VACUUM INTO` a copy of the hub database beside it, named for the build it belongs to. */
function backUpDatabase(db: string, previous: string): string {
  const copy = `${db}.pre-${previous}.bak`;
  rmSync(copy, { force: true });
  const handle = new Database(db, { readonly: true });
  try {
    handle.run(`VACUUM INTO '${copy.replaceAll("'", "''")}'`);
  } finally {
    handle.close();
  }
  return copy;
}

/** After the new build is healthy: the keeper follows it if it holds nothing, and the services are healthy again with it. */
async function moveKeeperWhenProven(o: {
  db: string | undefined;
  held: number;
  installed: BinaryInstallation;
  marker: () => TrialMarker;
  onMoved: (keeper: string) => void;
  proven: BinaryInstallation;
  sinceMs: number;
}): Promise<void> {
  const version = o.proven.installedVersion;
  const epochBefore = (await readKeeper().catch(() => undefined))?.epoch;
  const keeper = await moveKeeper(o.installed, version, o.held);
  if (keeper === o.installed.sessiondVersion) {
    return;
  }
  o.onMoved(keeper);
  await writeJsonAtomic(installationPath(), {
    ...o.proven,
    sessiondVersion: keeper,
  });
  await awaitKeeperEpoch(epochBefore);
  await awaitHealthy(o.proven, version, o.sinceMs, o.db, o.marker());
}

async function applyBuild(version: string, held: number): Promise<void> {
  const installed = await readInstallation();
  if (!installed) {
    throw new Error("This machine has no binary installation");
  }
  const manifest = await readStaged(version);
  const running = await readRunningManifest();
  if (manifest.sequence <= running.sequence) {
    throw new Error(
      `Refusing build ${version}: its sequence ${manifest.sequence} is not above the running ${running.sequence}`
    );
  }
  const before = await readUpdateState();
  const previous = installed.installedVersion;
  const keeperBefore = installed.sessiondVersion;
  const ids: ServiceId[] =
    installed.role === "hub" ? ["hub", "dashboard", "agent"] : ["agent"];
  const db = installed.role === "hub" ? hubDbPath() : undefined;
  const schemaChange =
    db !== undefined && manifest.schemaVersion !== running.schemaVersion;
  const sinceMs = Date.now();
  let keeperAfter = keeperBefore;
  let backup: string | undefined;
  await writeState(before, { phase: "installing", heldChildren: undefined });
  const marker = (): TrialMarker => ({
    deadline: Math.floor(Date.now() / 1000) + TRIAL_S,
    keeperBefore,
    previous,
    role: installed.role,
    swappedAt: Math.floor(sinceMs / 1000),
    version,
    ...(backup && db ? { dbBackup: backup, dbPath: db } : {}),
  });
  try {
    if (schemaChange && db) {
      backup = backUpDatabase(db, previous);
      await note(`database copy ${backup}`);
    }
    await copyFile(installationPath(), previousInstallationPath());
    await writeJsonAtomic(trialPath(), marker());
    await pointCurrentAt(version);
    await writeJsonAtomic(installationPath(), {
      ...installed,
      installedVersion: version,
    });
    await writeJsonAtomic(previousInstallationPath(), installed);
    // The services start on the new build with the keeper still on the old one: the keeper is the one
    // piece that holds sessions, so it moves only once the new build has shown itself healthy.
    await svc("restart", ids, keeperBefore);
    const proven = { ...installed, installedVersion: version };
    await awaitHealthy(proven, version, sinceMs, db, marker());
    await moveKeeperWhenProven({
      proven,
      installed,
      held,
      sinceMs,
      db,
      marker,
      onMoved: (to) => {
        keeperAfter = to;
      },
    });
    await writeJsonAtomic(trialPath(), {
      ...marker(),
      deadline: Math.floor(Date.now() / 1000) + TRIAL_S,
    });
    await prune([version, keeperAfter]);
    const heldNow = keeperAfter === version ? 0 : held;
    await writeState(before, {
      phase: keeperAfter === version ? "installed" : "waiting-sessions",
      installedVersion: version,
      sessiondVersion: keeperAfter,
      heldChildren: heldNow || undefined,
      availableVersion: version,
      channel: manifest.channel,
      notes: manifest.notes,
      error: undefined,
      unseen: true,
    });
  } catch (error) {
    let message = error instanceof Error ? error.message : String(error);
    try {
      keeperAfter = await rollBackBuild({
        installed,
        previous,
        version,
        keeperBefore,
        keeperAfter,
        backup,
        db,
        ids,
      });
    } catch (rollbackError) {
      message += ` Putting the previous build back also failed: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`;
    }
    await writeState(before, {
      phase: "failed-rolled-back",
      installedVersion: previous,
      sessiondVersion: keeperAfter,
      failedVersion: version,
      availableVersion: version,
      channel: manifest.channel,
      notes: manifest.notes,
      error:
        keeperAfter === keeperBefore
          ? message
          : `${message} The session keeper had already advanced and stays on the new build.`,
      unseen: true,
    });
  }
}

interface Rollback {
  backup: string | undefined;
  db: string | undefined;
  ids: ServiceId[];
  installed: BinaryInstallation;
  keeperAfter: string;
  keeperBefore: string;
  previous: string;
  version: string;
}

/**
 * The previous build back, and its database when the schema changed. Returns the version the keeper ends on.
 * A keeper that moved to the build being rolled back goes back to the old one when it holds nothing (or cannot
 * be reached, as when the new build cannot run it); a keeper that holds a child is never restarted here.
 */
async function rollBackBuild(r: Rollback): Promise<string> {
  let keeper = r.keeperAfter;
  if (keeper !== r.keeperBefore) {
    const held = await readKeeper()
      .then((now) => now.held)
      .catch(() => 0);
    if (held === 0) {
      await svc("install", ["sessiond"], r.keeperBefore);
      if (process.platform !== "darwin") {
        await svc("restart", ["sessiond"], r.keeperBefore);
      }
      keeper = r.keeperBefore;
    }
  }
  await pointCurrentAt(r.previous);
  await writeJsonAtomic(installationPath(), {
    ...r.installed,
    sessiondVersion: keeper,
  });
  if (r.backup && r.db) {
    // The hub is stopped while its database is swapped; the migrated file is moved aside, not deleted.
    await withTimeout(
      stopService("hub"),
      SERVICE_TIMEOUT_MS,
      "stopping the hub"
    ).catch(() => undefined);
    await rename(r.db, `${r.db}.migrated-${r.version}`);
    await rm(`${r.db}-wal`, { force: true });
    await rm(`${r.db}-shm`, { force: true });
    await copyFile(r.backup, r.db);
    if (process.platform === "darwin") {
      await startAgain(["hub"], keeper);
    }
  }
  await svc("restart", r.ids, keeper);
  await rm(trialPath(), { force: true });
  await rm(previousInstallationPath(), { force: true });
  return keeper;
}
