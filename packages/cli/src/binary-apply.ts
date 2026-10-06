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
  readFile,
  rename,
  rm,
  symlink,
} from "node:fs/promises";
import { join } from "node:path";
import { machineId } from "@cawco/agent";
import { heldSessions, SessiondClient } from "@cawco/agent/sessiond-client";
import { probeHealth } from "@cawco/core/binary-health";
import {
  type BinaryInstallation,
  binaryRoot,
  installationPath,
  keeperPath,
  keeperTrialPath,
  lockFilePath,
  previousInstallationPath,
  prune,
  readInstallation,
  readKeeperVersion,
  readRunningManifest,
  readUpdateState,
  type TrialMarker,
  trialPath,
  updateStatePath,
  versionDirectory,
  writeJsonAtomic,
} from "@cawco/core/binary-installation";
import type { BinaryUpdateState } from "@cawco/core/binary-updates";
import { markerIsLive, ownIdentity } from "@cawco/core/process-identity";
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

const lockPath = lockFilePath;
const note = (line: string) =>
  appendFile(
    join(binaryRoot(), "apply.log"),
    `${new Date().toISOString()} ${process.pid} ${line}\n`
  );

/** Exclusive-create the lock; a lock whose process is gone is stale and taken over. The build being applied is named in it, so `prune` keeps it. */
async function takeLock(version: string): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      // biome-ignore lint/performance/noAwaitInLoops: at most one retry, after clearing a stale lock
      const handle = await open(lockPath(), "wx", 0o600);
      await handle.writeFile(
        JSON.stringify({ ...ownIdentity(), startedAt: Date.now(), version })
      );
      await handle.close();
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
        throw error;
      }
      const held = JSON.parse(
        await readFile(lockPath(), "utf8").catch(() => "{}")
      ) as Parameters<typeof markerIsLive>[0];
      // Live only if that very process is still running: a killed helper's pid may be reused.
      if (markerIsLive(held)) {
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

const svc = (action: "install" | "restart", ids: readonly ServiceId[]) =>
  withTimeout(
    service(action, {
      ids,
      mode: "prod",
      follow: false,
      // The fence has already answered; this is the service manager's turn.
      force: true,
      whenIdle: false,
      note: (line) => console.log(`update: ${line}`),
      binaryLayout: binaryLayout(),
    }),
    SERVICE_TIMEOUT_MS,
    `${action} ${ids.join(", ")}`
  );

/** Put a stopped service back: macOS reloads it, systemd restarts it. */
const startAgain = (ids: readonly ServiceId[]) =>
  process.platform === "darwin" ? svc("install", ids) : svc("restart", ids);

/** Points a link in the binary root at `versions/<version>`, atomically: relative, as the installer and the wrapper write it. */
async function pointLinkAt(link: string, version: string): Promise<void> {
  const temporary = `${link}.${process.pid}`;
  await rm(temporary, { force: true });
  await symlink(join("versions", version), temporary);
  await rename(temporary, link);
}
const pointCurrentAt = (version: string) =>
  pointLinkAt(join(binaryRoot(), "current"), version);

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
      held: heldSessions(client.procs),
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
  if (!(await takeLock(version))) {
    console.log("update: another update helper is running; nothing to do");
    return;
  }
  try {
    await note(`start ${version} held=${held} keeperOnly=${keeperOnly}`);
    await (keeperOnly ? moveKeeperAlone(version) : applyBuild(version));
    await note(`end ${version}`);
  } catch (error) {
    // Refused before anything changed: say so rather than leave the state at `installing`.
    await note(
      `failed ${error instanceof Error ? error.message : String(error)}`
    );
    await writeState({
      phase: "failed",
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    await rm(lockPath(), { force: true });
  }
}

/**
 * Lays `state` over the state as it stands now, read at the write, never over
 * a copy taken when the helper started: the agent writes the same file while
 * an install or a keeper move runs, and an acknowledgement it took meanwhile
 * must not be written back over.
 */
async function writeState(state: Partial<BinaryUpdateState>): Promise<void> {
  await writeJsonAtomic(updateStatePath(), {
    ...(await readUpdateState()),
    ...state,
    updatedAt: Date.now(),
  });
}

const KEEPER_TRIAL_S = 120;

type KeeperMove =
  | { outcome: "already" | "moved" | "unreachable" }
  | { held: number; outcome: "held" }
  | {
      custodyOnPrevious: boolean;
      error: string;
      outcome: "failed";
    };

/** Reads the keeper, three tries one second apart; undefined when it never answered. */
async function readKeeperWithRetry(): Promise<
  { epoch: string | undefined; held: number } | undefined
> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      // biome-ignore lint/performance/noAwaitInLoops: at most three tries, one second apart
      return await readKeeper();
    } catch {
      if (attempt < 2) {
        await Bun.sleep(1000);
      }
    }
  }
  return undefined;
}

/** Step 8: the keeper answers, and (unless any answer will do) as a new process. */
async function awaitKeeperAnswers(
  epochBefore: string | undefined,
  anyAnswer: boolean
): Promise<void> {
  const end = Date.now() + HEALTH_MS;
  while (Date.now() < end) {
    // biome-ignore lint/performance/noAwaitInLoops: a poll
    const now = await readKeeper().catch(() => undefined);
    if (now && (anyAnswer || (now.epoch && now.epoch !== epochBefore))) {
      return;
    }
    await Bun.sleep(500);
  }
  throw new Error(
    anyAnswer
      ? "The session keeper did not answer"
      : "The session keeper did not come back as a new process"
  );
}

/** Step 9: this machine's agent, started after `since`, registered on the running build and holding its keeper connection. */
async function awaitAgentWithKeeper(since: number): Promise<void> {
  const installation = await readInstallation();
  if (!installation) {
    throw new Error("This machine has no binary installation");
  }
  const id = await machineId();
  const deadline = Date.now() + HEALTH_MS;
  for (;;) {
    // biome-ignore lint/performance/noAwaitInLoops: a poll; each read must see the services after the previous one
    const problem = await probeHealth({
      installation: { ...installation, role: "agent" },
      machineId: id,
      sinceMs: since,
      agentStartedAfterMs: since,
      version: installation.installedVersion,
      requireCustody: true,
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

/**
 * The one place the keeper's pin (`<root>/keeper`) and `keeper-trial.json`
 * are written. Moves the keeper to `to` only if it holds nothing, proves the
 * keeper and the agent hold sessions on it, and otherwise puts the previous
 * build back. A keeper holding a live child is never restarted. A helper that
 * dies mid-move leaves the trial, and the wrapper puts `from` back at the
 * keeper's next start.
 */
async function moveKeeper(to: string): Promise<KeeperMove> {
  const from = await readKeeperVersion();
  if (!from) {
    throw new Error("The session keeper link is missing");
  }
  if (from === to) {
    return { outcome: "already" };
  }
  if (!(await Bun.file(join(versionDirectory(to), "cawco")).exists())) {
    throw new Error(`The build ${to} is not on this machine`);
  }
  const first = await readKeeperWithRetry();
  if (!first) {
    return { outcome: "unreachable" };
  }
  if (first.held > 0) {
    return { outcome: "held", held: first.held };
  }
  await writeJsonAtomic(keeperTrialPath(), {
    from,
    to,
    deadline: Math.floor(Date.now() / 1000) + KEEPER_TRIAL_S,
  });
  await pointLinkAt(keeperPath(), to);
  let firstError: string;
  try {
    const second = await readKeeper();
    if (second.held > 0) {
      await pointLinkAt(keeperPath(), from);
      await rm(keeperTrialPath(), { force: true });
      return { outcome: "held", held: second.held };
    }
    const started = Date.now();
    await startAgain(["sessiond"]);
    await startAgain(["agent"]);
    await awaitKeeperAnswers(first.epoch, false);
    await awaitAgentWithKeeper(started);
    await rm(keeperTrialPath(), { force: true });
    return { outcome: "moved" };
  } catch (error) {
    firstError = error instanceof Error ? error.message : String(error);
  }
  // It did not work: put it back. A keeper that answers and holds a child works as a keeper: it stays.
  const now = await readKeeper().catch(() => undefined);
  if (now && now.held > 0) {
    await rm(keeperTrialPath(), { force: true });
    return { outcome: "moved" };
  }
  await pointLinkAt(keeperPath(), from);
  let custodyOnPrevious = false;
  try {
    const started = Date.now();
    await startAgain(["sessiond"]);
    await startAgain(["agent"]);
    await awaitKeeperAnswers(undefined, true);
    await awaitAgentWithKeeper(started);
    custodyOnPrevious = true;
  } catch {
    custodyOnPrevious = false;
  }
  await rm(keeperTrialPath(), { force: true });
  return { outcome: "failed", error: firstError, custodyOnPrevious };
}

/** What the update state says about the keeper after a move: its link, and what became of the move. */
async function keeperState(
  move: KeeperMove,
  version: string
): Promise<Partial<BinaryUpdateState>> {
  const sessiondVersion = await readKeeperVersion();
  switch (move.outcome) {
    case "moved":
    case "already":
      return {
        phase: "installed",
        sessiondVersion,
        heldChildren: undefined,
        keeperFailedVersion: undefined,
        error: undefined,
      };
    case "held":
      return {
        phase: "waiting-sessions",
        sessiondVersion,
        heldChildren: move.held,
        error: undefined,
      };
    case "unreachable":
      return {
        phase: "waiting-sessions",
        sessiondVersion,
        heldChildren: undefined,
        error: undefined,
      };
    default:
      return {
        phase: "installed",
        sessiondVersion,
        heldChildren: undefined,
        keeperFailedVersion: version,
        error: move.error,
      };
  }
}

/**
 * The keeper by itself (`--keeper-only`): move it to the running build and
 * say what became of it. The move finishes an update already announced when
 * its build landed, so it announces nothing of its own.
 */
async function moveKeeperAlone(version: string): Promise<void> {
  const move = await moveKeeper(version);
  await prune();
  await writeState(await keeperState(move, version));
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

async function applyBuild(version: string): Promise<void> {
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
  const previous = installed.installedVersion;
  const keeperAtStart = await readKeeperVersion();
  if (!keeperAtStart) {
    throw new Error("The session keeper link is missing");
  }
  const ids: ServiceId[] =
    installed.role === "hub" ? ["hub", "dashboard", "agent"] : ["agent"];
  const db = installed.role === "hub" ? hubDbPath() : undefined;
  const schemaChange =
    db !== undefined && manifest.schemaVersion !== running.schemaVersion;
  const sinceMs = Date.now();
  let backup: string | undefined;
  await writeState({ phase: "installing", heldChildren: undefined });
  const marker = (): TrialMarker => ({
    deadline: Math.floor(Date.now() / 1000) + TRIAL_S,
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
    // The services start on the new build with the keeper untouched: it is the one piece that holds
    // sessions, so it moves only once the new build has shown itself healthy.
    await svc("restart", ids);
    await awaitHealthy(
      { ...installed, installedVersion: version },
      version,
      sinceMs,
      db,
      marker()
    );
    const move = await moveKeeper(version);
    if (move.outcome === "failed" && !move.custodyOnPrevious) {
      throw new Error(
        `The new build cannot hold sessions with either session keeper: ${move.error}`
      );
    }
    await writeJsonAtomic(trialPath(), marker());
    await prune();
    await writeState({
      ...(await keeperState(move, version)),
      installedVersion: version,
      availableVersion: version,
      channel: manifest.channel,
      notes: manifest.notes,
      landed: {
        at: Date.now(),
        outcome: "installed",
        version,
        notes: manifest.notes,
      },
    });
  } catch (error) {
    let message = error instanceof Error ? error.message : String(error);
    try {
      await rollBackBuild({
        installed,
        keeperAtStart,
        version,
        backup,
        db,
        ids,
      });
    } catch (rollbackError) {
      message += ` Putting the previous build back also failed: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`;
    }
    await writeState({
      phase: "failed-rolled-back",
      installedVersion: previous,
      sessiondVersion: await readKeeperVersion(),
      failedVersion: version,
      availableVersion: version,
      channel: manifest.channel,
      notes: manifest.notes,
      error: message,
      landed: { at: Date.now(), outcome: "rolled-back", version },
    });
  }
}

interface Rollback {
  backup: string | undefined;
  db: string | undefined;
  ids: ServiceId[];
  installed: BinaryInstallation;
  keeperAtStart: string;
  version: string;
}

/** The previous build back, and its database when the schema changed; then the keeper where it was (a keeper holding a child stays). */
async function rollBackBuild(r: Rollback): Promise<void> {
  await pointCurrentAt(r.installed.installedVersion);
  await writeJsonAtomic(installationPath(), r.installed);
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
      await startAgain(["hub"]);
    }
  }
  await svc("restart", r.ids);
  await rm(trialPath(), { force: true });
  await rm(previousInstallationPath(), { force: true });
  await moveKeeper(r.keeperAtStart);
}
