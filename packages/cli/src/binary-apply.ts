/**
 * The update helper, and the one process that decides an update's trial. The
 * service manager runs it (not the agent it replaces), so it outlives the
 * restarts it performs; only one runs at a time (an exclusive lock file).
 *
 * An apply: copy the hub's database when the schema changes, write the trial
 * (`trial.json`), swap `current`, restart every unit that runs from it; once
 * the new build answers, move the session keeper to it if it holds nothing,
 * and say installed (the hub keeps this machine's new session starts only
 * while it says installing); then decide. Healthy, unbroken, for a minute (the
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
 * the service wrapper at any unit's start). The session keeper is never
 * restarted while it holds a child.
 */

import { Database } from "bun:sqlite";
import { existsSync, rmSync } from "node:fs";
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
import { basename, dirname, join } from "node:path";
import { heldSessions, SessiondClient } from "@cawco/agent/sessiond-client";
import { probeHealth } from "@cawco/core/binary-health";
import {
  binaryRoot,
  installationPath,
  keeperPath,
  keeperTrialPath,
  lockFilePath,
  prune,
  readInstallation,
  readKeeperVersion,
  readRunningManifest,
  readTrial,
  readUpdateState,
  type TrialMarker,
  trialPath,
  trialUnits,
  updateStatePath,
  versionDirectory,
  writeJsonAtomic,
} from "@cawco/core/binary-installation";
import type { BinaryUpdateState } from "@cawco/core/binary-updates";
import { machineId } from "@cawco/core/machine-id";
import { markerIsLive, ownIdentity } from "@cawco/core/process-identity";
import {
  type ReleaseManifest,
  verifyManifest,
} from "@cawco/core/release-manifest";
import { sessiondEndpoint } from "@cawco/core/sessiond";
import { binaryLayout } from "./binary-install";
import { hubDbPath, type ServiceId, service, stopService } from "./service";

/** How long a restarted keeper or agent gets to answer during a keeper move. */
const HEALTH_MS = 45_000;
const MIGRATION_CAP_MS = 30 * 60_000;
const SERVICE_TIMEOUT_MS = 120_000;
/**
 * How long a build has to become healthy, from the swap or from a resumed
 * helper's start, before it is rolled back. Ours: a build that starts at all
 * answers in seconds (the hub's first 200 on obelisk's data is under a
 * second), and a migration moves the deadline for as long as it runs.
 */
const TRIAL_WINDOW_S = 180;
/** How long the build must stay healthy, unbroken, to be confirmed. */
const CONFIRM_MS = 60_000;

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
      // biome-ignore lint/performance/noAwaitInLoops: at most one retry, after clearing a stale lock
      const handle = await open(lockPath(), "wx", 0o600);
      await handle.writeFile(
        JSON.stringify({
          ...(await ownIdentity()),
          startedAt: Date.now(),
          version,
        })
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
      if (await markerIsLive(held)) {
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
  return await markerIsLive(marker);
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

/**
 * Lays `state` over the state as it stands now, read at the write, never over
 * a copy taken when the helper started: the agent writes the same file while
 * an install or a keeper move runs, and what it wrote meanwhile must not be
 * written back over.
 */
async function writeState(state: Partial<BinaryUpdateState>): Promise<void> {
  await writeJsonAtomic(updateStatePath(), {
    ...(await readUpdateState()),
    ...state,
    updatedAt: Date.now(),
  });
}

/** Applies a staged build, or (`keeperOnly`) moves the session keeper to the running one. */
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
    await say(`start ${version} held=${held} keeperOnly=${keeperOnly}`);
    await (keeperOnly ? moveKeeperAlone(version) : applyBuild(version));
    await say(`end ${version}`);
  } catch (error) {
    // Refused before anything changed: say so rather than leave the state at `installing`.
    await say(`failed ${message(error)}`);
    await writeState({ phase: "failed", error: message(error) });
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

/** The keeper answers, and (unless any answer will do) as a new process. */
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

/** This machine's agent, started after `since`, registered on the running build and holding its keeper connection. */
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
    firstError = message(error);
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
    keeper: await readKeeperVersion(),
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
    await say(`swap ${previous} -> ${version}; restarting ${units.join(", ")}`);
    // The keeper is left alone: it is the one piece that holds sessions, so it
    // moves only once the new build has answered.
    await svc("restart", units);
  } catch (error) {
    // What did not happen shows in the verification: the build is not healthy.
    await say(`swap ${version}: ${message(error)}`);
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
 * only until the new build answers and the keeper has followed it or kept its
 * children; then the state says installed, with what became of the keeper, and
 * starts go through while the build is watched for the rest of its trial. The
 * verdict is the problem that decides a rollback, or `undefined` to confirm.
 * A build whose agent can hold sessions with neither keeper is rolled back.
 */
async function settle(start: TrialMarker): Promise<string | undefined> {
  const up = await verify(start, 0);
  if (up) {
    return up;
  }
  let trial = (await readTrial()) ?? start;
  if (!trial.keeperDone) {
    const move = await moveKeeper(trial.version).catch(
      (error): KeeperMove => ({
        outcome: "failed",
        error: message(error),
        custodyOnPrevious: false,
      })
    );
    await say(`keeper ${trial.version}: ${move.outcome}`);
    if (move.outcome === "failed" && !move.custodyOnPrevious) {
      return `The new build cannot hold sessions with either session keeper: ${move.error}`;
    }
    trial = { ...trial, keeperDone: true };
    await writeJsonAtomic(trialPath(), trial);
    const manifest = await readStaged(trial.version);
    await writeState({
      ...(await keeperState(move, trial.version)),
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
    // biome-ignore lint/performance/noAwaitInLoops: a poll; each read must see the services after the previous one
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
const TIMING = / (?:after|in) \d+ms/g;

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
 * answered ({@link settle}); the trial ends, and what nothing needs is pruned.
 */
async function confirm(trial: TrialMarker): Promise<void> {
  await rm(trialPath(), { force: true });
  await say(`confirmed ${trial.version}`);
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
 * the migrated file (which is kept beside it, with its WAL, never deleted),
 * and every unit that runs from `current` is restarted, so none is left on the
 * build that failed. A keeper that moved in the trial goes back with it unless
 * it holds a child, as a keeper holding a child is never restarted.
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
  try {
    await svc("restart", units);
    await say(`roll back ${trial.version}: restarted ${units.join(", ")}`);
  } catch (error) {
    await say(`roll back ${trial.version}: restart: ${message(error)}`);
  }
  if (trial.keeper && (await readKeeperVersion()) !== trial.keeper) {
    const back = await moveKeeper(trial.keeper).catch(
      (error): KeeperMove => ({
        outcome: "failed",
        error: message(error),
        custodyOnPrevious: false,
      })
    );
    await say(
      `roll back ${trial.version}: keeper to ${trial.keeper}: ${back.outcome}`
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
    error: trial.reason ?? "The new build did not become healthy",
    landed: { at: Date.now(), outcome: "rolled-back", version: trial.version },
  });
  await rm(trialPath(), { force: true });
  await say(`rolled back ${trial.version}`);
  await prune();
}

/**
 * The hub is stopped while its database is swapped. The migrated file is
 * moved aside whole, with its WAL and shared-memory files: the WAL holds the
 * trial build's committed writes that were not yet checkpointed, and the file
 * beside it is the only place they still are.
 */
async function restoreDatabase(
  db: string,
  backup: string,
  version: string
): Promise<void> {
  await withTimeout(stopService("hub"), SERVICE_TIMEOUT_MS, "stopping the hub")
    .then(() => say(`roll back ${version}: hub stopped for the database`))
    .catch((error) =>
      say(`roll back ${version}: stopping the hub: ${message(error)}`)
    );
  const aside = `${db}.migrated-${version}`;
  if (existsSync(aside)) {
    // A helper before this one moved it aside already: what is at `db` now is
    // no copy of ours, and goes.
    for (const suffix of ["", "-wal", "-shm"]) {
      // biome-ignore lint/performance/noAwaitInLoops: three files, in order
      await rm(`${db}${suffix}`, { force: true });
    }
  } else {
    for (const suffix of ["", "-wal", "-shm"]) {
      if (existsSync(`${db}${suffix}`)) {
        // biome-ignore lint/performance/noAwaitInLoops: the main file first, then its WAL and shm with it
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
  if (process.platform === "darwin") {
    await startAgain(["hub"]);
  }
}
