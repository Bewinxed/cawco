/**
 * The update helper, and the one process that decides an update's trial. The
 * service manager runs it (not the agent it replaces), so it outlives the
 * restarts it performs; only one runs at a time (an exclusive lock file).
 *
 * An apply: copy the hub's database when the schema changes, write the trial
 * (`trial.json`), swap `current`, restart every unit that runs from it; once
 * the new build answers, hand the session keeper over to it (its keeper
 * starts beside the one before, which keeps every session it holds), and say
 * installed (the hub keeps this machine's new session starts only while it
 * says installing); then decide. Healthy, unbroken, for a minute (the
 * hub, the dashboard and this machine's agent on the new build, started after
 * the swap, the agent holding its session keeper connection) confirms it; not
 * healthy by the trial's deadline, minutes after the swap and moved only by a
 * running migration, rolls it back. A rollback moves every link the apply
 * moved, restores the database copy, and restarts every unit, so the machine
 * runs one build when it ends. A confirmed build is never rolled back by
 * anything.
 *
 * The decision is written into the trial before it is carried out, and the
 * trial is removed only once it has been. A helper that dies leaves the trial
 * with no live lock; the next helper, `--resume`, finishes a decision already
 * written or decides again from now (the agent launches one within seconds,
 * the service wrapper at any unit's start). No session keeper is restarted or
 * signalled here: one is handed over to, beside the one before.
 */

import { Database } from "bun:sqlite";
import { existsSync, rmSync } from "node:fs";
import {
  appendFile,
  copyFile,
  readdir,
  readFile,
  rename,
  rm,
  symlink,
} from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { type KeeperJob, keeperJob } from "@cawco/agent/keeper-jobs";
import { forgetPins, runBinaryPins } from "@cawco/agent/pin-record";
import { SessiondClient } from "@cawco/agent/sessiond-client";
import { probeHealth } from "@cawco/core/binary-health";
import {
  binaryRoot,
  currentDirectory,
  installationPath,
  keeperPath,
  lockFilePath,
  prune,
  readInstallation,
  readKeeperVersion,
  readRunningManifest,
  readTrial,
  readUpdateState,
  recordInstall,
  type ServiceId,
  type TrialMarker,
  trialPath,
  trialUnits,
  updateStatePath,
  versionDirectory,
  versionExecutable,
  writeJsonAtomic,
} from "@cawco/core/binary-installation";
import {
  type BinaryUpdateState,
  UPDATE_TRIAL_MS,
} from "@cawco/core/binary-updates";
import { readWithin } from "@cawco/core/bounded";
import { failureSentence } from "@cawco/core/cli-failure";
import { timerMs } from "@cawco/core/clock";
import {
  DatabaseHeld,
  lockDatabase,
  releaseDatabase,
} from "@cawco/core/db-lock";
import {
  answers,
  currentKeeper,
  keeperEndpoint,
  keeperEndpoints,
  machineEndpoint,
  publishKeeper,
} from "@cawco/core/keepers";
import { machineId } from "@cawco/core/machine-id";
import { hubDbPath } from "@cawco/core/paths";
import {
  markerIsLive,
  ownIdentity,
  ProcessMarkerSchema,
} from "@cawco/core/process-identity";
import {
  type ReleaseManifest,
  verifyManifest,
} from "@cawco/core/release-manifest";
import { runtimeVersion } from "@cawco/core/runtime";
import {
  isDamagedRecord,
  parseRecord,
  readRecord,
  writeStateFile,
} from "@cawco/core/state-file";
import { unhandled } from "@cawco/core/unhandled";
import { z } from "zod";
import { recordApply } from "./apply-record";
import { binaryLayout } from "./binary-install";
import { service, stopService } from "./service";

/** How long a keeper handed over to gets to answer at its own endpoint. */
const HEALTH_MS = 45_000;
const MIGRATION_CAP_MS = 30 * 60_000;
const SERVICE_TIMEOUT_MS = 120_000;
/** How long a build has to become healthy, from the swap or from a resumed helper's start, before it is rolled back (core {@link UPDATE_TRIAL_MS}). */
const TRIAL_WINDOW_S = timerMs(UPDATE_TRIAL_MS) / 1000;
/** How long the build must stay healthy, unbroken, to be confirmed: a minute. */
const CONFIRM_MS = timerMs(60_000);

const lockPath = lockFilePath;
const note = (line: string) =>
  appendFile(
    join(binaryRoot(), "apply.log"),
    `${new Date().toISOString()} ${process.pid} ${line}\n`
  );
/** A line for both records: the apply unit's journal, and `apply.log`. */
const say = async (line: string): Promise<void> => {
  console.log(`update: ${line}`);
  await note(line);
};
/** How often an unchanged verification problem is said again while it is waited out. */
const VERIFY_REPEAT_MS = 10_000;
const message = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/** Exclusive-create the lock; a lock whose process is gone is stale and taken over. The build being applied is named in it, so `prune` keeps it. */
async function takeLock(version: string): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const identity = await ownIdentity();
      await writeStateFile(
        lockPath(),
        JSON.stringify({ ...identity, startedAt: Date.now(), version }),
        { exclusive: true, mode: 0o600 }
      );
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
        throw error;
      }
      const held = await readRecord(lockPath(), ProcessMarkerSchema).catch(
        async (damage: unknown) => {
          if (!isDamagedRecord(damage)) {
            throw damage;
          }
          // Every lock is written whole: a damaged one is from before a crash,
          // and names no process that could still hold it.
          await say(
            `${damage.message}: no process holds it, so it is taken over`
          );
        }
      );
      // Live only if that very process is still running: a killed helper's pid may be reused.
      if (held && (await markerIsLive(held))) {
        return false;
      }
      await rm(lockPath(), { force: true });
    }
  }
  return false;
}

/** What a service-manager call that did not answer says, from how long it was given. */
const unansweredService = (what: string, after: number): string =>
  `${what}: the service manager did not answer within ${Math.round(after / 1000)}s`;

/** A restart or install through the service manager; one it did not answer in time throws saying so. */
const svc = async (
  action: "install" | "restart",
  ids: readonly ServiceId[]
): Promise<void> => {
  const done = await readWithin(SERVICE_TIMEOUT_MS, () =>
    service(action, {
      ids,
      mode: "prod",
      follow: false,
      // The fence has already answered; this is the service manager's turn.
      force: true,
      whenIdle: false,
      note: (line) => console.log(`update: ${line}`),
      // The hub's, the dashboard's and the agent's units: no keeper's is touched through here.
      binaryLayout: binaryLayout(runtimeVersion),
    })
  );
  switch (done.kind) {
    case "answered":
      return;
    case "unanswered":
      throw new Error(
        unansweredService(`${action} ${ids.join(", ")}`, done.after)
      );
    default:
      unhandled("read", done);
  }
};

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
  pointLinkAt(currentDirectory(), version);

async function migrationRunning(db: string | undefined): Promise<boolean> {
  if (!db) {
    return false;
  }
  // Every marker is written whole: a damaged one is from before a crash, and
  // names no migration still running.
  const marker = await readRecord(`${db}.migrating`, ProcessMarkerSchema).catch(
    (error: unknown) => {
      if (!isDamagedRecord(error)) {
        throw error;
      }
    }
  );
  return marker ? await markerIsLive(marker) : false;
}

async function readStaged(version: string): Promise<ReleaseManifest> {
  const directory = versionDirectory(version);
  const signatureFile = join(directory, "release.signature.json");
  const { signature } = parseRecord(
    signatureFile,
    await readFile(signatureFile, "utf8"),
    z.object({ signature: z.string() })
  );
  // Checked over the file's own bytes, as the agent staged them: the signed
  // text and the line end its write adds.
  return verifyManifest(
    (await readFile(join(directory, "release.json"), "utf8")).trimEnd(),
    signature
  );
}

/**
 * Lays `state` over the state as it stands now, read at the write, never over
 * a copy taken when the helper started: the agent writes the same file while
 * an install or a keeper handover runs, and what it wrote meanwhile must not be
 * written back over.
 */
async function writeState(state: Partial<BinaryUpdateState>): Promise<void> {
  await writeJsonAtomic(updateStatePath(), {
    ...(await readUpdateState()),
    ...state,
    updatedAt: Date.now(),
  });
}

/** Applies a staged build, or (`keeperOnly`) hands the session keeper over to the running one. */
export async function applyBinary(
  version: string,
  keeperOnly: boolean
): Promise<void> {
  if (!(await takeLock(version))) {
    console.log("update: another update helper is running; nothing to do");
    return;
  }
  try {
    await say(`start ${version} keeperOnly=${keeperOnly}`);
    await recordApply({ kind: "start", keeperOnly, version });
    await (keeperOnly ? handOverKeeperAlone(version) : applyBuild(version));
    await say(`end ${version}`);
  } catch (error) {
    // Refused before anything changed: say so rather than leave the state at
    // `installing`. Nothing was swapped, so what went on for the build goes
    // back for the build that runs.
    await say(`failed ${message(error)}`);
    const back =
      keeperOnly || (await readTrial())
        ? undefined
        : await putBackPins(version, runtimeVersion);
    await writeState({
      phase: "failed",
      error: back ? `${message(error)}; ${back}` : message(error),
    });
  } finally {
    await rm(lockPath(), { force: true });
  }
}

/**
 * `--resume`: decides the open trial a helper left undecided (it died, or the
 * machine rebooted), or finishes the decision it had written.
 */
export async function resumeBinary(): Promise<void> {
  const found = await readTrial();
  if (!found) {
    console.log("update: no trial is open; nothing to do");
    return;
  }
  if (!(await takeLock(found.version))) {
    console.log("update: another update helper is running; nothing to do");
    return;
  }
  try {
    // Read again under the lock: the helper that held it may have decided meanwhile.
    const trial = await readTrial();
    if (!trial) {
      return;
    }
    await say(
      `resume ${trial.version}: the trial is open with no helper deciding it${trial.decision ? `; finishing its ${trial.decision}` : ""}`
    );
    await decide(trial, true);
    await say(`end ${trial.version}`);
  } catch (error) {
    await say(`resume failed ${message(error)}`);
  } finally {
    await rm(lockPath(), { force: true });
  }
}

type KeeperMove =
  { outcome: "already" | "moved" } | { error: string; outcome: "failed" };

/**
 * A keeper's welcome at `endpoint`, within {@link HEALTH_MS}: one that starts
 * and answers. One whose process exits first did not start, and is not waited
 * on while its service manager starts it again to fail again.
 */
async function awaitWelcome(endpoint: string, job: KeeperJob): Promise<void> {
  const end = Date.now() + HEALTH_MS;
  let last = "it never answered";
  while (Date.now() < end) {
    try {
      const read = await SessiondClient.connect(endpoint);
      switch (read.kind) {
        case "answered":
          read.value.close();
          return;
        case "unanswered":
          last =
            read.reason === "timeout"
              ? `no welcome within ${read.after} ms`
              : "its connection ended before its welcome";
          break;
        default:
          unhandled("read", read);
      }
    } catch (error) {
      last = message(error);
    }
    const exited = await job.exited();
    if (exited) {
      throw new Error(`its keeper did not answer at ${endpoint}: ${exited}`);
    }
    await Bun.sleep(500);
  }
  throw new Error(
    `no welcome at ${endpoint} within ${HEALTH_MS / 1000}s (${last})`
  );
}

/**
 * `cawco binary-units` (with `args`) from `version`'s own executable: units as
 * that build writes them, never as the build running this helper does. What
 * it said, on one line.
 */
async function binaryUnits(
  version: string,
  args: readonly string[] = []
): Promise<string> {
  const units = Bun.spawn(
    [versionExecutable(version), "binary-units", ...args],
    { stdout: "pipe", stderr: "pipe" }
  );
  const [out, err, code] = await Promise.all([
    new Response(units.stdout).text(),
    new Response(units.stderr).text(),
    units.exited,
  ]);
  if (code !== 0) {
    throw new Error(
      `binary-units exited ${code}: ${failureSentence(err) ?? out.trim()}`
    );
  }
  return out.trim().replaceAll("\n", "; ") || "the units are current";
}

/**
 * The build the keeper goes to writes its keeper's own unit (or plist) and
 * the agent's. A build from before keepers ran side by side writes no unit of
 * its own for its keeper, and is refused here: it has no keeper to hand over to.
 */
async function writeKeeperUnits(
  version: string,
  file: string
): Promise<string> {
  const said = await binaryUnits(version);
  if (!(await Bun.file(file).exists())) {
    throw new Error(
      `${version} wrote no ${file}: a build from before keepers ran side by side has no keeper of its own to hand over to`
    );
  }
  return said;
}

/**
 * The hub's, the dashboard's and the agent's units and the dashboard's socket
 * as `version` writes them (service.ts `refreshServices`), before the units
 * restart onto it, so they start on what it names. Never throws: a refresh
 * that failed is said, and the restart and the trial go on.
 */
async function refreshServiceUnits(version: string): Promise<void> {
  try {
    await say(
      `units ${version}: ${await binaryUnits(version, ["--services"])}`
    );
  } catch (error) {
    await say(`units ${version}: ${message(error)}`);
  }
}

/**
 * THE ONE KEEPER HANDOVER, and the one place the keeper's pin
 * (`<root>/keeper`) is written. The keeper of `to` starts beside the current
 * one, in a job of its own, from its own build's unit; once it answers at its
 * own endpoint it becomes the machine's: the `keeper` link names it, the
 * machine's endpoint names it (a checkout's keeper's own socket there moves to
 * its checkout name in the same instant), and its job starts with the machine where
 * the one before's no longer does. The keeper before is not signalled: it
 * runs on with every session it holds, each through its own connection, and
 * the agent removes it once it holds nothing (binary-update.ts
 * `#tendKeepers`). A keeper of `to` that does not answer is removed before
 * anything else changes, so the current keeper stays the machine's with
 * everything it holds; one that was already running (a retiring keeper of
 * `to`, made current again) is never removed here.
 */
async function handOverKeeper(to: string): Promise<KeeperMove> {
  const machine = machineEndpoint();
  const before = await currentKeeper(machine);
  if (
    before?.keeper.kind === "build" &&
    before.keeper.version === to &&
    (await readKeeperVersion()) === to
  ) {
    return { outcome: "already" };
  }
  if (!(await Bun.file(versionExecutable(to)).exists())) {
    throw new Error(`The build ${to} is not on this machine`);
  }
  const keeper = { kind: "build", version: to } as const;
  const endpoint = keeperEndpoint(keeper, machine);
  const job = keeperJob(keeper);
  if (!job) {
    throw new Error(
      `No service manager CawCo installs into runs here (${process.platform})`
    );
  }
  const listening = await answers(endpoint);
  // Whether a failed start may take this keeper's job away: only when the
  // endpoint answered that nothing listens on it.
  let keepJob: boolean;
  switch (listening.kind) {
    case "answered":
      keepJob = listening.value;
      break;
    case "unanswered":
      await say(
        `keeper ${to}: ${endpoint} did not answer a connect within ${listening.after} ms; its job is kept if this start fails`
      );
      keepJob = true;
      break;
    default:
      unhandled("read", listening);
  }
  try {
    await say(`keeper ${to}: units: ${await writeKeeperUnits(to, job.file)}`);
    await recordApply({ kind: "keeper-units", version: to });
    await job.start();
    await awaitWelcome(endpoint, job);
  } catch (error) {
    if (!keepJob) {
      // A keeper that never answered holds no session: nothing in its unit is a child of its.
      await job
        .remove({ children: [] })
        .catch((removing: unknown) =>
          say(
            `keeper ${to}: its job could not be removed: ${message(removing)}`
          )
        );
    }
    return {
      outcome: "failed",
      error: `${to}'s process that keeps this machine's sessions running did not start: ${message(error)}`,
    };
  }
  await say(
    `keeper ${to}: answers at ${endpoint}; the machine's endpoint names it now${before ? `, and ${before.keeper.version}'s keeper keeps what it holds` : ""}`
  );
  // The endpoint first, setting a checkout's keeper's socket aside under the
  // build the link names before it moves; then the link. A helper that stops
  // between the two leaves the endpoint naming this build's keeper with the
  // link on the one before, which the agent hands over again: `to`'s keeper,
  // answering already, is made the link's.
  await publishKeeper(
    endpoint,
    before?.keeper.kind === "checkout" ? before.keeper.version : undefined
  );
  await pointLinkAt(keeperPath(), to);
  await job.enable();
  // Every other keeper on the machine starts with it no more: the one before,
  // and one a handover that stopped half-way left enabled.
  for (const other of await keeperEndpoints(machine)) {
    if (other.endpoint === endpoint) {
      continue;
    }
    await keeperJob(other.keeper)
      ?.retire()
      .catch((error: unknown) =>
        say(
          `keeper ${other.keeper.version}: it still starts with the machine: ${message(error)}`
        )
      );
  }
  return { outcome: "moved" };
}

/** A handover that threw is a handover that failed: said, and the keeper before is the machine's. */
const handOver = (to: string): Promise<KeeperMove> =>
  handOverKeeper(to).catch((error): KeeperMove => ({
    outcome: "failed",
    error: message(error),
  }));

/**
 * What the update state says about the keeper after a handover: the build it
 * runs, and a keeper that could not start. A handover that went through
 * clears the error only when a keeper's failure was what it said: a handover
 * runs whatever else the state is saying (a newer build waiting, a download
 * that failed), and that keeps its words.
 */
async function keeperState(
  move: KeeperMove,
  version: string
): Promise<Partial<BinaryUpdateState>> {
  const sessiondVersion = await readKeeperVersion();
  if (move.outcome === "failed") {
    return { sessiondVersion, keeperFailedVersion: version, error: move.error };
  }
  const keeperSaid = (await readUpdateState())?.keeperFailedVersion;
  return {
    sessiondVersion,
    keeperFailedVersion: undefined,
    ...(keeperSaid ? { error: undefined } : {}),
  };
}

/**
 * The keeper by itself (`--keeper-only`): hand it over to the running build
 * and say what became of it. It finishes an update already announced when its
 * build landed, so it announces nothing of its own; a machine that waited on
 * its keeper the way builds before this one did waits no more.
 */
async function handOverKeeperAlone(version: string): Promise<void> {
  const move = await handOver(version);
  await say(
    `keeper ${version}: ${move.outcome}${move.outcome === "failed" ? ` (${move.error})` : ""}`
  );
  await prune();
  const waited = (await readUpdateState())?.phase === "waiting-sessions";
  await writeState({
    ...(await keeperState(move, version)),
    ...(waited ? { phase: "installed", heldChildren: undefined } : {}),
  });
}

/**
 * `VACUUM INTO` a copy of the hub database beside it, named for the build it
 * belongs to: one read transaction, so the copy is the database as one commit
 * left it while the hub goes on writing. The hub keeps its file in WAL (hub
 * db/wal.ts): the read sees every commit up to its start, in the WAL or the
 * file, never waits on the hub's writes, and the copy is one file in
 * rollback-journal mode, whole by itself. A copy SQLite does not check `ok`
 * throws, before anything is swapped. A journal left from a copy before is
 * removed with it: opened beside this one, SQLite would play it in.
 */
export function backUpDatabase(db: string, previous: string): string {
  const copy = `${db}.pre-${previous}.bak`;
  rmSync(copy, { force: true });
  rmSync(`${copy}-journal`, { force: true });
  const handle = new Database(db, { readonly: true });
  try {
    handle.run(`VACUUM INTO '${copy.replaceAll("'", "''")}'`);
  } finally {
    handle.close();
  }
  const copied = new Database(copy, { readonly: true });
  try {
    const check = copied
      .query<{ quick_check: string }, []>("PRAGMA quick_check")
      .all()
      .map((row) => row.quick_check)
      .join("; ");
    if (check !== "ok") {
      throw new Error(`The database copy ${copy} is not sound: ${check}`);
    }
  } finally {
    copied.close();
  }
  return copy;
}

async function applyBuild(version: string): Promise<void> {
  const installed = await readInstallation();
  if (!installed) {
    throw new Error("This machine has no binary installation");
  }
  if (await readTrial()) {
    throw new Error(
      "An update's trial is still open; it is decided before another build is applied"
    );
  }
  const manifest = await readStaged(version);
  const running = await readRunningManifest();
  if (manifest.sequence <= running.sequence) {
    throw new Error(
      `Refusing build ${version}: its sequence ${manifest.sequence} is not above the running ${running.sequence}`
    );
  }
  const previous = installed.installedVersion;
  const units = trialUnits(installed.role);
  const db = installed.role === "hub" ? hubDbPath() : undefined;
  const schemaChange =
    db !== undefined && manifest.schemaVersion !== running.schemaVersion;
  await writeState({ phase: "installing", heldChildren: undefined });
  const backup = schemaChange && db ? backUpDatabase(db, previous) : undefined;
  if (backup) {
    await say(`database copy ${backup}`);
  }
  const swappedAt = Math.floor(Date.now() / 1000);
  const trial: TrialMarker = {
    version,
    previous,
    role: installed.role,
    swappedAt,
    decideBy: swappedAt + TRIAL_WINDOW_S,
    ...(backup && db ? { dbBackup: backup, dbPath: db } : {}),
  };
  // From here the trial is open, and only a decision closes it.
  await writeJsonAtomic(trialPath(), trial);
  try {
    await pointCurrentAt(version);
    await writeJsonAtomic(installationPath(), {
      ...installed,
      installedVersion: version,
    });
    // The units as the new build writes them, then the restart onto them: a
    // socket whose addresses moved is rebound in the refresh (its dashboard
    // stopped), and the restart starts the dashboard on it.
    await refreshServiceUnits(version);
    await say(`swap ${previous} -> ${version}; restarting ${units.join(", ")}`);
    await recordApply({
      kind: "swap",
      error: null,
      from: previous,
      restarting: units,
      version,
    });
    // The keeper is left alone: it is the one piece that holds sessions, and
    // it is handed over only once the new build has answered.
    await svc("restart", units);
  } catch (error) {
    // What did not happen shows in the verification: the build is not healthy.
    await say(`swap ${version}: ${message(error)}`);
    await recordApply({
      kind: "swap",
      error: message(error),
      from: previous,
      restarting: [],
      version,
    });
  }
  await decide(trial, false);
}

/**
 * Carries the trial to its end: the decision it already holds, or the one the
 * verification makes now. A resumed helper gives the build a whole window from
 * its own start: the units it waits on are starting with it.
 */
async function decide(start: TrialMarker, resumed: boolean): Promise<void> {
  let trial = start;
  if (!trial.decision) {
    if (resumed) {
      trial = {
        ...trial,
        decideBy: Math.max(
          trial.decideBy ?? 0,
          Math.floor(Date.now() / 1000) + TRIAL_WINDOW_S
        ),
      };
      await writeJsonAtomic(trialPath(), trial);
    }
    const problem = await settle(trial);
    trial = (await readTrial()) ?? trial;
    trial = problem
      ? { ...trial, decision: "roll-back", reason: problem }
      : { ...trial, decision: "confirm" };
    await writeJsonAtomic(trialPath(), trial);
    await say(
      problem
        ? `decide ${trial.version}: roll back (${problem})`
        : `decide ${trial.version}: confirm`
    );
  }
  await (trial.decision === "confirm" ? confirm(trial) : rollBack(trial));
}

/**
 * The trial from the restart to its verdict, in the order the machine needs it.
 * The update is installing (the hub keeps this machine's new session starts)
 * only until the new build answers and its keeper has been handed over to;
 * then the state says installed, with what became of the keeper, and starts
 * go through while the build is watched for the rest of its trial. The
 * verdict is the problem that decides a rollback, or `undefined` to confirm.
 * A keeper that cannot start is no verdict on the build: the keeper before
 * stays the machine's, untouched, and the state says so.
 */
async function settle(start: TrialMarker): Promise<string | undefined> {
  const up = await verify(start, 0);
  if (up) {
    return up;
  }
  let trial = (await readTrial()) ?? start;
  if (!trial.keeperDone) {
    const move = await handOver(trial.version);
    await say(
      `keeper ${trial.version}: ${move.outcome}${move.outcome === "failed" ? ` (${move.error})` : ""}`
    );
    trial = { ...trial, keeperDone: true };
    await writeJsonAtomic(trialPath(), trial);
    const manifest = await readStaged(trial.version);
    await writeState({
      // A build that installed says no earlier failure; a keeper that could not start says its own.
      error: undefined,
      ...(await keeperState(move, trial.version)),
      phase: "installed",
      heldChildren: undefined,
      installedVersion: trial.version,
      availableVersion: trial.version,
      channel: manifest.channel,
      notes: manifest.notes,
      landed: {
        at: Date.now(),
        outcome: "installed",
        version: trial.version,
        notes: manifest.notes,
      },
    });
    await say(`installed ${trial.version}; the trial goes on to its verdict`);
  }
  return verify(trial, CONFIRM_MS);
}

/**
 * Whether the trial build is healthy (see probeHealth, with the agent holding
 * its keeper connection), unbroken for `holdMs` (0: the first time it answers):
 * `undefined` when it is, the problem that stood at the deadline when it is
 * not. A running migration moves the deadline, up to {@link MIGRATION_CAP_MS}.
 *
 * Every verification says what it waits on and how it ends, in the journal
 * and in `apply.log`: each new answer as it changes (and again every 10s while
 * it does not), each migration that moves the deadline, and the verdict with
 * its time and attempt count. A rollback's reason is then in the log of the
 * unit that decided it, not only in the update state.
 */
async function verify(
  start: TrialMarker,
  holdMs: number
): Promise<string | undefined> {
  const installation = await readInstallation();
  if (!installation) {
    return "This machine has no binary installation";
  }
  const id = await machineId();
  const watch = new TrialWatch(start, holdMs);
  await say(
    `verify ${start.version}: probing ${installation.hubUrl} every 1s; ${holdMs ? `healthy for ${holdMs / 1000}s confirms` : "waiting for it to answer"}, not healthy at ${new Date((start.decideBy ?? 0) * 1000).toISOString()} rolls back`
  );
  for (;;) {
    const stuck = await watch.followMigration();
    if (stuck) {
      return stuck;
    }
    const verdict = await watch.weigh(
      await probeHealth({
        installation: { ...installation, role: watch.trial.role },
        machineId: id,
        sinceMs: watch.trial.swappedAt * 1000,
        version: watch.trial.version,
        requireCustody: true,
      })
    );
    if (verdict.done) {
      return verdict.problem;
    }
    await Bun.sleep(1000);
  }
}

/** The timing inside a problem, which changes every attempt while what it says does not. */
const TIMING = / (?:after|in) \d+ms/gu;

/** One verification's running account: the trial as it stands, the streak, and what was last said. */
class TrialWatch {
  trial: TrialMarker;
  readonly #holdMs: number;
  readonly #started = Date.now();
  #attempts = 0;
  #healthySince: number | undefined;
  #lastSaid: { at: number; problem: string } | undefined;
  #migrating = false;

  constructor(trial: TrialMarker, holdMs: number) {
    this.trial = trial;
    this.#holdMs = holdMs;
  }

  #elapsed(): string {
    return `${((Date.now() - this.#started) / 1000).toFixed(1)}s`;
  }

  /** A running migration moves the deadline; one past its cap is the answer. */
  async followMigration(): Promise<string | undefined> {
    const running = await migrationRunning(this.trial.dbPath);
    if (running !== this.#migrating) {
      this.#migrating = running;
      await say(
        running
          ? `verify ${this.trial.version}: the hub is migrating its database; the deadline moves with it (at most ${MIGRATION_CAP_MS / 60_000} minutes)`
          : `verify ${this.trial.version}: the migration ended at ${this.#elapsed()}`
      );
    }
    if (!running) {
      return undefined;
    }
    if (Date.now() > this.#started + MIGRATION_CAP_MS) {
      return "The hub's migration did not end in 30 minutes";
    }
    const decideBy = Math.floor(Date.now() / 1000) + TRIAL_WINDOW_S;
    if (decideBy - (this.trial.decideBy ?? 0) >= 10) {
      this.trial = { ...this.trial, decideBy };
      await writeJsonAtomic(trialPath(), this.trial);
    }
    return undefined;
  }

  /** One probe's answer, weighed: done with the problem that decides it, or done healthy, or not done. */
  weigh(
    problem: string | undefined
  ): Promise<{ done: boolean; problem?: string }> {
    this.#attempts += 1;
    return problem ? this.#unhealthy(problem) : this.#healthy();
  }

  async #unhealthy(
    problem: string
  ): Promise<{ done: boolean; problem?: string }> {
    this.#healthySince = undefined;
    const { version } = this.trial;
    if (Date.now() / 1000 > (this.trial.decideBy ?? 0)) {
      await say(
        `verify ${version}: not healthy at its deadline, ${this.#elapsed()} after ${this.#attempts} attempts: ${problem}`
      );
      return { done: true, problem };
    }
    const gist = problem.replace(TIMING, "");
    const said = this.#lastSaid;
    if (
      !said ||
      said.problem !== gist ||
      Date.now() - said.at >= VERIFY_REPEAT_MS
    ) {
      this.#lastSaid = { at: Date.now(), problem: gist };
      await say(
        `verify ${version}: attempt ${this.#attempts} at ${this.#elapsed()}: ${problem}`
      );
    }
    return { done: false };
  }

  async #healthy(): Promise<{ done: boolean }> {
    const { version } = this.trial;
    if (this.#healthySince === undefined) {
      this.#healthySince = Date.now();
      this.#lastSaid = undefined;
      await say(
        `verify ${version}: healthy at ${this.#elapsed()}, attempt ${this.#attempts}${this.#holdMs ? `; confirming once it has held for ${this.#holdMs / 1000}s` : ""}`
      );
    }
    if (Date.now() - this.#healthySince < this.#holdMs) {
      return { done: false };
    }
    if (this.#holdMs) {
      await say(
        `verify ${version}: healthy for ${this.#holdMs / 1000}s at ${this.#elapsed()}, attempt ${this.#attempts}`
      );
    }
    return { done: true };
  }
}

/**
 * The build stays: its landing and its keeper's outcome were written when it
 * answered ({@link settle}); it joins the install order, the trial ends, and
 * the prune keeps it and the two installed before it (and on the hub's
 * machine, their archives), with every build a live process still runs from.
 */
async function confirm(trial: TrialMarker): Promise<void> {
  // In the install order before the trial goes: a helper that stops between
  // the two resumes the confirm and records it again, to the same order.
  await recordInstall(trial.version, trial.previous);
  await rm(trialPath(), { force: true });
  await say(`confirmed ${trial.version}`);
  // What went on for it before the swap stays on.
  await forgetPins();
  if (trial.dbPath && trial.dbBackup) {
    // Confirmed: this trial's copy is the newest one kept, older ones go.
    const prefix = `${basename(trial.dbPath)}.pre-`;
    const folder = dirname(trial.dbPath);
    const old = (await readdir(folder)).filter(
      (name) => name.startsWith(prefix) && join(folder, name) !== trial.dbBackup
    );
    await Promise.all(
      old.map((name) => rm(join(folder, name), { force: true }))
    );
  }
  await prune();
}

/**
 * The previous build back, on every unit: the update says installing again
 * while it restarts them (the hub keeps this machine's new starts), `current`
 * and the installation point at the previous build, the database copy replaces
 * the migrated file (which is kept beside it, with its journal or WAL, never deleted),
 * and every unit that runs from `current` is restarted, so none is left on the
 * build that failed. A keeper handed over to the build that failed is handed
 * over again, to the build rolled back to, which keeps the sessions the failed
 * build's keeper started where they run until each ends or sleeps: the keeper
 * follows the build the machine runs, and no session is cut for it.
 */
async function rollBack(start: TrialMarker): Promise<void> {
  let trial = start;
  const installed = await readInstallation();
  if (!installed) {
    throw new Error("This machine has no binary installation");
  }
  const units = trialUnits(trial.role);
  await writeState({ phase: "installing" });
  await pointCurrentAt(trial.previous);
  await writeJsonAtomic(installationPath(), {
    ...installed,
    installedVersion: trial.previous,
  });
  await say(`roll back ${trial.version} -> ${trial.previous}: current moved`);
  if (trial.dbBackup && trial.dbPath && !trial.dbRestored) {
    await restoreDatabase(trial.dbPath, trial.dbBackup, trial.version);
    trial = { ...trial, dbRestored: true };
    await writeJsonAtomic(trialPath(), trial);
  }
  // Before the units restart, so the agent rolled back to starts beside its own.
  const pinsBack = await putBackPins(trial.version, trial.previous);
  // The units as the build rolled back to writes them. A build from before
  // the refresh refuses `--services`, which is said, and its units stay as
  // the failed build wrote them.
  await refreshServiceUnits(trial.previous);
  try {
    await svc("restart", units);
    await say(`roll back ${trial.version}: restarted ${units.join(", ")}`);
  } catch (error) {
    await say(`roll back ${trial.version}: restart: ${message(error)}`);
  }
  if ((await readKeeperVersion()) === trial.version) {
    const back = await handOver(trial.previous);
    await say(
      `roll back ${trial.version}: keeper to ${trial.previous}: ${back.outcome}${back.outcome === "failed" ? ` (${back.error})` : ""}`
    );
  }
  const manifest = await readStaged(trial.version).catch(() => undefined);
  await writeState({
    phase: "failed-rolled-back",
    installedVersion: trial.previous,
    sessiondVersion: await readKeeperVersion(),
    failedVersion: trial.version,
    availableVersion: trial.version,
    ...(manifest ? { channel: manifest.channel, notes: manifest.notes } : {}),
    error: `${trial.reason ?? "The new build did not become healthy"}${pinsBack ? `; ${pinsBack}` : ""}`,
    landed: { at: Date.now(), outcome: "rolled-back", version: trial.version },
  });
  await rm(trialPath(), { force: true });
  await say(`rolled back ${trial.version}`);
  await prune();
}

/**
 * The harnesses that went on for `version` before the swap (binary-update.ts
 * `putOnPins`) put back for `runs`, the build that runs instead, which
 * refuses them: by `runs`'s own `binary-pins back` (pin-record.ts), never by
 * `version`, which may not start at all. Never throws: what calls it is on
 * its way out already. What did not go back is said in the log, and answered
 * for the state's error.
 */
async function putBackPins(
  version: string,
  runs: string
): Promise<string | undefined> {
  try {
    const said = await runBinaryPins(runs, version);
    if (said) {
      await say(`${version} does not run: ${said} went back on for ${runs}`);
    }
    return undefined;
  } catch (error) {
    const said = `what went on for ${version} did not go back: ${message(error)}`;
    await say(said);
    return said;
  }
}

/** One stop of the hub's unit, said; one that failed or did not answer is said and waited past by the lock. */
async function stopHub(version: string): Promise<void> {
  await readWithin(SERVICE_TIMEOUT_MS, () => stopService("hub"))
    .then((stopped) => {
      switch (stopped.kind) {
        case "answered":
          return say(`roll back ${version}: hub stopped for the database`);
        case "unanswered":
          return say(
            `roll back ${version}: ${unansweredService("stopping the hub", stopped.after)}`
          );
        default:
          unhandled("read", stopped);
      }
    })
    .catch((error) =>
      say(`roll back ${version}: stopping the hub: ${message(error)}`)
    );
}

/**
 * The hub stopped, and kept off its database: the helper takes the hub's own
 * lock (core db-lock.ts), which it gets only once no hub process holds it, so
 * the hub that was stopped is gone. While the helper holds it, a hub any unit
 * starts (the dashboard's and the agent's units want the hub's, so their
 * restarts start it again after a stop; launchd's KeepAlive) refuses the
 * database before it opens it. A hub still holding it is stopped again; one
 * still there after {@link SERVICE_TIMEOUT_MS} throws, and the database is
 * left as it is: the trial keeps its rollback, which a resumed helper finishes.
 */
async function holdDatabase(db: string, version: string): Promise<void> {
  const end = Date.now() + SERVICE_TIMEOUT_MS;
  for (;;) {
    await stopHub(version);
    try {
      await lockDatabase(db);
      return;
    } catch (error) {
      if (!(error instanceof DatabaseHeld)) {
        throw error;
      }
      if (Date.now() > end) {
        throw new Error(
          `the hub still holds ${db} ${SERVICE_TIMEOUT_MS / 1000}s after it was stopped, so its copy is not put back under it`,
          { cause: error }
        );
      }
      await say(
        `roll back ${version}: a hub process still holds the database; it is stopped again`
      );
    }
    await Bun.sleep(250);
  }
}

/**
 * The hub is stopped, gone and held off while its database is swapped
 * ({@link holdDatabase}); the copy goes in ({@link putBackup}); the hub's lock
 * is let go, and the restart that follows starts the hub on the copy.
 */
async function restoreDatabase(
  db: string,
  backup: string,
  version: string
): Promise<void> {
  await holdDatabase(db, version);
  try {
    await putBackup(db, backup, version);
  } finally {
    await releaseDatabase(db);
  }
  if (process.platform === "darwin") {
    await startAgain(["hub"]);
  }
}

/**
 * Every file SQLite keeps beside a database: the WAL and its shared-memory
 * index (the hub's own mode, hub db/wal.ts), and the rollback journal a build
 * before WAL left, or a hub of one killed mid-write. Each belongs to the one
 * file beside it; left beside another, SQLite plays it into that one
 * ("database disk image is malformed").
 */
const SIDECARS = ["-journal", "-wal", "-shm"] as const;

/**
 * The copy in place of the migrated file, with no file of the migrated one's
 * left beside it. The migrated file is moved aside whole: a hub its unit
 * killed mid-write (SIGTERM is the kernel's, hub lifetime.ts) leaves a hot
 * journal, a WAL holds committed writes not yet checkpointed, and either is
 * only good beside the file it belongs to. Its sidecars go first and the file
 * itself last, so a moved-aside file means every sidecar went with it, and
 * what a helper that died half-way left at `db` is a copy of ours. The hub
 * is held off the database while this runs ({@link holdDatabase}). The copy
 * goes in by a plain file copy: {@link backUpDatabase} wrote it as one file
 * in rollback-journal mode, with no WAL of its own to lose, and the hub
 * converts it to WAL as it opens it.
 */
export async function putBackup(
  db: string,
  backup: string,
  version: string
): Promise<void> {
  const aside = `${db}.migrated-${version}`;
  if (existsSync(aside)) {
    // A helper before this one moved it aside already: what is at `db` now is
    // no copy of ours, and goes.
    for (const suffix of [...SIDECARS, ""]) {
      await rm(`${db}${suffix}`, { force: true });
    }
  } else {
    for (const suffix of [...SIDECARS, ""]) {
      if (existsSync(`${db}${suffix}`)) {
        await rename(`${db}${suffix}`, `${aside}${suffix}`);
      }
    }
  }
  const restoring = `${db}.restoring`;
  await copyFile(backup, restoring);
  await rename(restoring, db);
  await say(
    `roll back ${version}: database restored from ${backup}; the migrated one is ${aside}`
  );
}
