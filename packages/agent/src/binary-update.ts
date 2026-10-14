/**
 * The machine's side of binary updates: learn of a build from the hub, verify
 * and stage it, and apply it through a service-manager-owned helper once a
 * fence has drained what the restart would cut (`#drain`, below).
 * One code path, whether it runs on the update tick (auto-update on) or
 * because a person pressed "Install now".
 *
 * Nothing here ever goes backwards: a build whose signed `sequence` is not
 * above the running one is never installed, a machine other than the hub's own
 * applies only the build its hub is running, and the hub's machine never
 * installs a build with fewer migrations than its database holds.
 */
import { readFile, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import type { UpdateReport } from "@cawco/core";
import {
  archiveMatches,
  readAtMost,
  type SignedRelease,
} from "@cawco/core/binary-distribution";
import { hubProtocol } from "@cawco/core/binary-health";
import {
  ARCHIVE_ENTRY,
  type BinaryInstallation,
  binaryRoot,
  EXECUTABLE_IN_VERSION,
  helperIsLive,
  liveHelper,
  prune,
  readInstallation,
  readKeeperVersion,
  readRunningManifest,
  readTrial,
  readUpdateState,
  updateStatePath,
  versionDirectory,
  versionExecutable,
  writeJsonAtomic,
} from "@cawco/core/binary-installation";
import {
  type BinaryUpdatePolicy,
  type BinaryUpdateState,
  holdPhrases,
  mergeHolds,
  type RestartHold,
  type RestartReadiness,
  type RetiringKeeper,
  UPDATE_DRAIN_MS,
  UPDATE_WAIT_CAP_MS,
} from "@cawco/core/binary-updates";
import { BINARY_WRAPPER, writeWrapper } from "@cawco/core/binary-wrapper";
import {
  answers,
  currentKeeper,
  type KeeperName,
  keeperEndpoints,
  keeperService,
  publishKeeper,
} from "@cawco/core/keepers";
import { machineId } from "@cawco/core/machine-id";
import { verifyManifest } from "@cawco/core/release-manifest";
import { runtimeVersion } from "@cawco/core/runtime";
import { writeStateFile } from "@cawco/core/state-file";
import { leaveRetiringKeepers } from "./boundary";
import {
  HELPER_START_MS,
  type HelperJob,
  helperJobSays,
  launchHelper,
  removeFinishedHelpers,
} from "./helper-jobs";
import { keeperJob, keeperJobsHere } from "./keeper-jobs";
import { withKeepers } from "./keepers";
import { lowerFence, raiseFence, restartReadiness } from "./restart";
import { heldSessions } from "./sessiond-client";

const POLL_MS = 60_000;
/** The lease of the fence an install raises: the helper restarts the services well within it. */
const INSTALL_FENCE_MS = 10 * 60_000;
/** How many of the last commands' ids the state keeps, so one delivered again is not acted on twice. */
const COMMANDS_KEPT = 20;
/** Minutes to wait before trying a failed download or verification again; the last repeats. */
const RETRY_DELAYS_MIN = [1, 5, 30, 60];

/** How often a drain looks again. */
const DRAIN_POLL_MS = 1000;
/** How long the drain's fence outlives the drain, for the helper to be launched in. */
const DRAIN_GRACE_MS = 15_000;
/** The updater's name for its fence on this agent ({@link raiseFence}). */
const FENCE = "update";

/** Each hold's pieces, by kind: what tells one piece of work from another. */
const holdKeys = (holds: readonly RestartHold[]): string[] =>
  holds.flatMap(({ reason, ids }) => ids.map((id) => `${reason}:${id}`));

/**
 * What replacing this machine's services would cut now: this agent's own
 * work, and with a full build on the hub's machine the tool calls its hub is
 * answering, from every machine, for the hub restarts too. A hub that cannot
 * say is no answer: nothing is applied blind.
 */
async function readReadiness(
  hub: string | undefined
): Promise<RestartReadiness> {
  const local = restartReadiness();
  if (!hub) {
    return local;
  }
  const response = await fetch(`${hub}/api/binary-updates/hub-readiness`, {
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) {
    throw new Error(
      `The hub did not say what its restart would cut: ${response.status}`
    );
  }
  const holds = mergeHolds(
    local.holds,
    ((await response.json()) as RestartReadiness).holds
  );
  return { ready: holds.length === 0, holds };
}

/** The hub's fence, for `ms` from now; 0 lowers it. */
async function fenceHub(hub: string, ms: number): Promise<void> {
  const response = await fetch(`${hub}/api/binary-updates/hub-fence`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ms }),
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) {
    throw new Error(`The hub did not take its fence: ${response.status}`);
  }
}

let latest: BinaryUpdateState | undefined;
export const latestBinaryUpdate = (): BinaryUpdateState | undefined => latest;
export const reportBinaryUpdate = (state: BinaryUpdateState): void => {
  latest = state;
};

/** Each session keeper there, current and retiring: its held sessions, what it speaks, and every live child it holds. */
const readKeepers = (): Promise<
  {
    capabilities: readonly string[];
    current: boolean;
    endpoint: string;
    /** Its sessions: what an update the new agent cannot speak to it would wait on. */
    held: number;
    keeper: { kind: "build" | "legacy"; version: string };
    /** Every live child, a session, a workspace's boundary or an OpenCode server: what it must be rid of before it goes. */
    live: number;
  }[]
> =>
  withKeepers((keepers) =>
    Promise.resolve(
      keepers.map(({ client, current, endpoint, keeper }) => ({
        capabilities: client.capabilities,
        current,
        endpoint,
        held: heldSessions(client.procs),
        keeper,
        live: client.procs.filter((proc) => proc.alive).length,
      }))
    )
  );

/**
 * How long a retiring keeper must hold nothing, over two looks of the
 * updater's watch, before it is removed: past the two seconds a keeper gives
 * what an ended child started before it kills it.
 */
const RETIRING_EMPTY_MS = 20_000;

/**
 * A failed updater step, said in the log: a filesystem error's message names
 * its path. What runs on a timer ends here, never as an unhandled rejection.
 */
const logFailure = (error: unknown): void => {
  console.error(
    `[update] ${error instanceof Error ? error.message : String(error)}`
  );
};

/** The hub could not be reached at all: no answer, not an answer that refused. */
class HubUnreachable extends Error {}

/**
 * An attempt at an offered build failed (its download, its verification, the
 * drain, or its helper's start): recorded with its retry time, and the command
 * that asked for it stands, so the build is tried again on the retry schedule.
 */
class AttemptFailed extends Error {}

interface Failure {
  count: number;
  error: string;
  nextAt: number;
  version: string;
}
const failuresPath = () => join(binaryRoot(), "update-failures.json");
async function readFailure(version: string): Promise<Failure | undefined> {
  const saved = (await Bun.file(failuresPath())
    .json()
    .catch(() => undefined)) as Failure | undefined;
  return saved?.version === version ? saved : undefined;
}
async function recordFailure(version: string, error: string): Promise<void> {
  const before = await readFailure(version);
  const count = (before?.count ?? 0) + 1;
  const minutes =
    RETRY_DELAYS_MIN[Math.min(count, RETRY_DELAYS_MIN.length) - 1] ?? 60;
  await writeJsonAtomic(failuresPath(), {
    version,
    count,
    error,
    nextAt: Date.now() + minutes * 60_000,
  } satisfies Failure);
}

/**
 * The update helper (`cawco binary-apply`, given `args`), as a job of the
 * service manager so it outlives the restarts it performs. It is this build,
 * by its own folder, never through `current`, which the helper moves.
 */
const launchApplyHelper = (args: readonly string[]): Promise<HelperJob> =>
  launchHelper([versionExecutable(runtimeVersion), ...args]);

export class BinaryUpdater {
  #state: BinaryUpdateState = {
    phase: "none",
    installedVersion: runtimeVersion,
    channel: "stable",
    updatedAt: Date.now(),
    hostsHub: false,
  };
  /** Whether this machine runs the hub: it then considers the channel's newest build, not its hub's. */
  #hostsHub = false;
  #policy: BinaryUpdatePolicy = { channel: "stable", autoUpdate: false };
  #staged: string | undefined;
  /**
   * `commanded`: a person asked for a build, so it applies at the first moment
   * allowed; `version`, the build they were shown, when they named one. Held in
   * memory only: a command acts on this process's passes and on no other.
   */
  readonly #flags: { commanded: boolean; version?: string } = {
    commanded: false,
  };
  #running: Promise<void> | undefined;
  #timer: ReturnType<typeof setInterval> | undefined;
  #trialTimer: ReturnType<typeof setInterval> | undefined;
  /** When this agent last launched a helper to resume an open trial. */
  #resumedAt = 0;
  /** When this agent last launched a helper to hand the keeper to its build. */
  #handedAt = 0;
  /**
   * The fence this updater raised, while it stands: on this agent, and on the
   * hub when its restart is part of the update (the hub's url then). Lowered
   * on every way out but the restart it was raised for.
   */
  #fence: { hub: string | undefined } | undefined;
  /**
   * The helper this agent handed an install to, until it takes the lock or
   * the install says otherwise: when, its job, and the command that asked
   * for the install (`version`: the build it named), which stands again if
   * the helper never takes over ({@link #settleLostHelper}).
   */
  #launched:
    | { at: number; command?: { version?: string }; job: HelperJob }
    | undefined;
  /**
   * The work that outlasted the last drain auto-update ran, by {@link holdKeys}.
   * While any of it still runs, no fence goes up again for it: the work is
   * long, and a fence raised every tick would refuse every session's new tool
   * calls for most of each minute.
   */
  readonly #outlasted = new Set<string>();
  readonly #report: (state: BinaryUpdateState) => void;

  constructor(report: (state: BinaryUpdateState) => void) {
    this.#report = report;
  }

  get state(): BinaryUpdateState {
    return this.#state;
  }

  /** Starts only on a binary install; a source checkout has nothing to update. */
  async start(): Promise<void> {
    if (!(await readInstallation())) {
      return;
    }
    this.#hostsHub = (await readInstallation())?.role === "hub";
    console.info(`[update] updating the binary install at ${binaryRoot()}`);
    await this.#load();
    this.#timer = setInterval(() => this.tick(), POLL_MS);
    this.#timer.unref();
    this.#trialTimer = setInterval(
      () => this.#watch().catch(logFailure),
      10_000
    );
    this.#trialTimer.unref();
    await this.tick();
  }

  stop(): void {
    if (this.#timer) {
      clearInterval(this.#timer);
    }
    if (this.#trialTimer) {
      clearInterval(this.#trialTimer);
    }
  }

  /** The hub's push: act on the changed policy without holding the hub's call. */
  configure(): BinaryUpdateState {
    setTimeout(() => this.tick(), 0);
    return this.#state;
  }

  /**
   * Returns a machine waiting to install to `available`: the person changed
   * their mind. A drain under way sees it at its end and installs nothing.
   */
  async cancel(): Promise<BinaryUpdateState> {
    this.#flags.commanded = false;
    // Nor does the command stand again should the helper it went to never take over.
    if (this.#launched) {
      this.#launched = { ...this.#launched, command: undefined };
    }
    this.#outlasted.clear();
    if (this.#running) {
      // The drain's own state is in memory; the file says `ready` meanwhile.
      return this.#state;
    }
    await this.#load();
    if (this.#state.phase === "ready") {
      await this.#set({
        phase: "available",
        waitingOn: undefined,
        waitingSince: undefined,
      });
    }
    return this.#state;
  }

  /**
   * The command behind "Install now": stage the offered build, then apply it.
   * A command is acted on once: its id is kept in the state, on disk, and the
   * same command delivered again (a request a browser or proxy sent twice, or
   * one that reaches this machine after it restarted) is answered and not
   * acted on. A command that names a build applies that build only; one that
   * names none takes what is offered now. A build that failed and was rolled
   * back is applied again only this way.
   */
  async installNow(
    command: { commandId?: string; version?: string } = {}
  ): Promise<UpdateReport> {
    const from = this.#state.installedVersion;
    const id = command.commandId ?? crypto.randomUUID();
    if (this.#state.commands?.includes(id)) {
      return {
        from,
        to: this.#state.availableVersion,
        built: false,
        changed: [],
        installed: false,
        pulled: "nothing",
        restarted: [],
        skipped: `command ${id} was already acted on; it is not acted on again`,
      };
    }
    await this.#set({
      commands: [...(this.#state.commands ?? []), id].slice(-COMMANDS_KEPT),
    });
    this.#flags.commanded = true;
    this.#flags.version = command.version;
    // A pass already in flight began before the command: let it end, then run one that sees it.
    if (this.#running) {
      console.info(
        `[update] Install now (command ${id}) arrived during an update pass, which takes it; one more pass follows`
      );
    }
    await this.#running;
    await this.tick();
    const to = this.#state.availableVersion;
    const waiting = this.#state.waitingOn?.length
      ? `waiting for work in flight to end: ${holdPhrases(this.#state.waitingOn).join(", ")}`
      : `update is ${this.#state.phase}`;
    return {
      from,
      to,
      built: false,
      changed: ["hub", "dashboard", "agent"],
      installed: this.#state.phase === "installing",
      pulled: to ? `signed release ${to}` : "no newer release",
      restarted: [],
      ...(this.#state.phase === "installing" ? {} : { skipped: waiting }),
    };
  }

  async #load(): Promise<void> {
    // `keeperOwed`, written by builds whose keeper waited for its sessions to
    // end: no keeper move is owed now (#advanceKeeper), so it is not carried on.
    const { keeperOwed: _owed, ...saved } = ((await readUpdateState()) ??
      this.#state) as BinaryUpdateState & { keeperOwed?: string };
    this.#state = {
      ...saved,
      installedVersion: runtimeVersion,
      hostsHub: this.#hostsHub,
    };
    this.#report(this.#state);
  }

  async #set(update: Partial<BinaryUpdateState>): Promise<void> {
    this.#state = {
      ...this.#state,
      ...update,
      hostsHub: this.#hostsHub,
      updatedAt: Date.now(),
    };
    await writeJsonAtomic(updateStatePath(), this.#state);
    this.#report(this.#state);
  }

  /** {@link #set}, only when a value it names changes: every write moves `updatedAt`, which the board reads as news. */
  async #setChanged(update: Partial<BinaryUpdateState>): Promise<void> {
    const changed = Object.entries(update).some(
      ([key, value]) =>
        JSON.stringify(this.#state[key as keyof BinaryUpdateState]) !==
        JSON.stringify(value)
    );
    if (changed) {
      await this.#set(update);
    }
  }

  /** The keeper watchdog restarted a wedged keeper: the dashboard says so once. */
  async noteKeeperRestart(
    restart: NonNullable<BinaryUpdateState["keeperRestart"]>
  ): Promise<void> {
    await this.#set({ keeperRestart: restart });
  }

  /**
   * Every ten seconds: take up what the helper wrote, so the hub learns the
   * phase has moved on; see that an open trial has a decider; on a build no
   * trial is deciding, keep the service wrapper as this build writes it; hand
   * the session keeper to this build; and tend the retiring keepers.
   */
  async #watch(): Promise<void> {
    if (!this.#running) {
      await this.#load();
      if (this.#state.phase === "installing") {
        await this.#settleLostHelper();
      } else {
        // The install ended, or its helper gave up before it restarted this
        // agent and said so: the fence raised for it has nothing to wait for.
        this.#launched = undefined;
        if (this.#fence) {
          await this.#lowerFence();
        }
      }
    }
    await this.#keepDecider();
    await this.#ownWrapper();
    await this.#advanceKeeper();
    await this.#tendKeepers();
  }

  /**
   * AN INSTALL NO HELPER TOOK OVER HAS FAILED, AND IS TRIED AGAIN. The state
   * says installing, yet no helper holds the lock and no trial is open,
   * {@link HELPER_START_MS} after the install was handed to its helper (by
   * this agent; after a restart, since the state last moved): the helper never
   * ran, was ended before it took its lock, or found another's and left.
   * Nothing was applied. The state says failed, with what the service manager
   * says of the helper's job; the failure is recorded with its retry time, and
   * the command that asked for the install stands again, so the build is
   * tried again on the retry schedule. Nothing here asks the hub: a machine
   * whose hub does not answer says it all the same.
   */
  async #settleLostHelper(): Promise<void> {
    const launched = this.#launched;
    if (await helperIsLive()) {
      // It took over: from here the state is the helper's to move.
      this.#launched = undefined;
      return;
    }
    if (
      Date.now() - (launched?.at ?? this.#state.updatedAt) < HELPER_START_MS ||
      (await readTrial())
    ) {
      return;
    }
    const says = launched ? await helperJobSays(launched.job) : undefined;
    // A pass that began meanwhile owns the state; the next watch looks again.
    if (this.#running || this.#state.phase !== "installing") {
      return;
    }
    const version = this.#state.availableVersion;
    const error = `The update helper${launched ? ` (${launched.job.name})` : ""} did not take over the install of ${version ?? "the build"} within ${HELPER_START_MS / 1000} s${says ? `: ${says}` : ""}`;
    console.warn(`[update] ${error}; it is tried again`);
    this.#launched = undefined;
    await this.#lowerFence();
    if (version) {
      await recordFailure(version, error);
    }
    if (launched?.command) {
      this.#flags.commanded = true;
      this.#flags.version = launched.command.version;
    }
    await this.#set({ phase: "failed", error });
  }

  /** Each retiring keeper's first look at which it held nothing, by its endpoint. */
  readonly #emptySince = new Map<string, number>();
  /** Each keeper job's first look at which no keeper ran from it, by its service name. */
  readonly #idleJobSince = new Map<string, number>();

  /**
   * THE KEEPERS BESIDE THE CURRENT ONE GO WHEN THEY HOLD NOTHING
   * (#retireKeepers), AND THE STATE SAYS EACH ONE STILL RETIRING, with the
   * live children it holds (`retiringKeepers`), on every watch. While an
   * update helper runs nothing is done to any keeper, for keepers are its to
   * hand over then; what is retiring is said all the same, so from the moment
   * a handover makes the new keeper the machine's the state says the keeper
   * before is handing over with what it holds, not a trial later. The keeper
   * of the build the helper applies is not said to be retiring while it
   * runs: it answers before the machine's endpoint names it, arriving.
   */
  async #tendKeepers(): Promise<void> {
    const helper = await liveHelper();
    if (!helper) {
      await this.#retireKeepers();
    }
    await this.#sayRetiring(
      (await readKeepers())
        .filter(
          ({ current, keeper }) =>
            !(
              current ||
              (keeper.kind === "build" && keeper.version === helper?.version)
            )
        )
        .map(({ keeper, live }) => ({
          version: keeper.version,
          sessions: live,
        }))
    );
  }

  /**
   * Each retiring keeper that has held no live child for
   * {@link RETIRING_EMPTY_MS} is removed (its job ends and leaves the machine;
   * keeper-jobs.ts), and what no process runs any more is pruned. One holding
   * anything is never signalled. The machine's endpoint is made to name the
   * keeper the `keeper` link names, once that one answers, should a handover
   * have stopped between the two. Only while no update helper runs.
   */
  async #retireKeepers(): Promise<void> {
    const keepers = await readKeepers();
    const link = await readKeeperVersion();
    const named = keepers.find(
      ({ keeper }) => keeper.kind === "build" && keeper.version === link
    );
    // The machine's endpoint names no keeper that answers (a symlink left
    // dangling, a path removed): it names the link's again. One that names a
    // live keeper is left alone, even ahead of the link: that is a handover
    // half-done, which the next one finishes (#advanceKeeper).
    if (named && !keepers.some((keeper) => keeper.current)) {
      await publishKeeper(named.endpoint).then(
        () =>
          console.info(
            `[update] the machine's keeper endpoint names ${named.keeper.version}'s keeper again`
          ),
        logFailure
      );
    }
    const retiring = keepers.filter(
      (keeper) => !(keeper.current || keeper === named)
    );
    if (retiring.length > 0) {
      // Workspace boundaries a retiring keeper runs move to the current one as each is idle.
      await leaveRetiringKeepers().catch(logFailure);
    }
    let removed = false;
    for (const keeper of retiring) {
      if (keeper.live > 0) {
        this.#emptySince.delete(keeper.endpoint);
        continue;
      }
      const since = this.#emptySince.get(keeper.endpoint) ?? Date.now();
      this.#emptySince.set(keeper.endpoint, since);
      if (Date.now() - since < RETIRING_EMPTY_MS) {
        continue;
      }
      try {
        // biome-ignore lint/performance/noAwaitInLoops: one keeper at a time, each removal said in its order
        await keeperJob(keeper.keeper)?.remove();
        await rm(keeper.endpoint, { force: true });
        this.#emptySince.delete(keeper.endpoint);
        removed = true;
        console.info(
          `[update] the retiring session keeper ${keeper.keeper.version} holds nothing and is gone`
        );
      } catch (error) {
        logFailure(error);
      }
    }
    // What a keeper that is gone left: a file nothing answers on now. Asked at
    // the removal, not from the reading above: a keeper started since (by a
    // helper that began meanwhile) answers from the moment its file is there.
    await Promise.all(
      (await keeperEndpoints())
        .filter((found) => !found.current)
        .map(async (found) => {
          if (!(await answers(found.endpoint))) {
            await rm(found.endpoint, { force: true });
          }
        })
    );
    if (
      await this.#removeIdleJobs(
        keepers.map(({ keeper }) => keeper),
        link
      )
    ) {
      removed = true;
    }
    if (removed) {
      await prune().catch(logFailure);
    }
  }

  /**
   * A KEEPER'S JOB GOES WITH ITS KEEPER. A unit or plist no keeper runs from,
   * and not the machine's keeper's, says nothing true: one an earlier build's
   * update helper wrote (`cawco binary-units`) for a keeper it then left where
   * it was, a handover's whose keeper never started, or one whose keeper ended
   * by itself. It is removed once it has been so for {@link RETIRING_EMPTY_MS}.
   * Kept: every keeper that answers (`answering`), the build the `keeper` link
   * names, and the keeper the machine's endpoint names, answering or not (one
   * its service manager is starting again). Whether anything was removed.
   */
  async #removeIdleJobs(
    answering: KeeperName[],
    link: string | undefined
  ): Promise<boolean> {
    const machine = await currentKeeper();
    const kept = new Set(
      [
        ...answering,
        ...(link ? [{ kind: "build", version: link } as const] : []),
        ...(machine ? [machine.keeper] : []),
      ].map(keeperService)
    );
    let removed = false;
    for (const job of await keeperJobsHere()) {
      // biome-ignore lint/performance/noAwaitInLoops: keeper jobs are few, each removal said in its order
      if (kept.has(job.service) || (await job.pid()) !== undefined) {
        this.#idleJobSince.delete(job.service);
        continue;
      }
      const since = this.#idleJobSince.get(job.service) ?? Date.now();
      this.#idleJobSince.set(job.service, since);
      if (Date.now() - since < RETIRING_EMPTY_MS) {
        continue;
      }
      try {
        await job.remove();
        this.#idleJobSince.delete(job.service);
        removed = true;
        console.info(
          `[update] ${job.name}: no session keeper runs from it, and it is removed`
        );
      } catch (error) {
        logFailure(error);
      }
    }
    return removed;
  }

  /**
   * The retiring keepers in the state, written only when they changed, and
   * never over a pass's state that only memory holds. Laid over the state as
   * the file holds it at the write: an update helper writes the file while it
   * hands a keeper over and decides its trial (its `installed` among it), and
   * what it wrote is never written back over.
   */
  async #sayRetiring(retiring: RetiringKeeper[]): Promise<void> {
    const next = retiring.length > 0 ? retiring : undefined;
    if (this.#running) {
      return;
    }
    await this.#load();
    if (
      this.#running ||
      JSON.stringify(next) === JSON.stringify(this.#state.retiringKeepers)
    ) {
      return;
    }
    await this.#set({ retiringKeepers: next });
  }

  /**
   * An open trial with no live helper has lost its decider (killed, or the
   * machine went down mid-trial): this agent launches one, `--resume`, from its
   * own build, which is running and so can start. The service wrapper does the
   * same at any unit's start, for an agent that cannot stay up.
   */
  async #keepDecider(): Promise<void> {
    const trial = await readTrial();
    if (
      !trial ||
      (await helperIsLive()) ||
      Date.now() - this.#resumedAt < HELPER_START_MS
    ) {
      return;
    }
    this.#resumedAt = Date.now();
    console.warn(
      `[update] the trial of ${trial.version} is open and no helper is deciding it; starting one`
    );
    await launchApplyHelper(["binary-apply", "--resume"]).catch((error) =>
      console.error(
        `[update] ${error instanceof Error ? error.message : error}`
      )
    );
  }

  /**
   * The service wrapper is this build's own once no trial is open: the update
   * helper has confirmed it, so the script that will recover the next update's
   * trial is one a confirmed build wrote, never the build on trial.
   */
  async #ownWrapper(): Promise<void> {
    const installation = await readInstallation();
    if (
      !installation ||
      installation.installedVersion !== runtimeVersion ||
      (await readTrial())
    ) {
      return;
    }
    const path = join(binaryRoot(), "run");
    if ((await readFile(path, "utf8").catch(() => "")) !== BINARY_WRAPPER) {
      await writeWrapper(binaryRoot());
      console.info(`[update] ${path} is ${runtimeVersion}'s wrapper now`);
    }
  }

  /**
   * One pass of load, check and (when allowed) stage and apply; callers share
   * a pass in flight. Never rejects: a pass that fails, even to record its
   * failure, logs it and the next tick runs.
   */
  tick(): Promise<void> {
    this.#running ??= this.#pass().finally(() => {
      this.#running = undefined;
    });
    return this.#running;
  }

  async #pass(): Promise<void> {
    try {
      // Every pass, not only at start: the helper restarts this agent while it
      // still holds its lock, so the start-up sweep always skips the job of the
      // update that just landed.
      await removeFinishedHelpers();
      await this.#load();
      await this.#check();
    } catch (error) {
      // A command stands through a failed attempt, which is tried again on
      // the retry schedule, and through a hub that did not answer, before
      // which nothing was tried; a refusal of what the hub offers spends it.
      if (
        !(error instanceof AttemptFailed || error instanceof HubUnreachable)
      ) {
        this.#flags.commanded = false;
      }
      await this.#lowerFence();
      if (error instanceof HubUnreachable) {
        // Nothing was tried, and the state reaches a person only through the
        // hub that did not answer: what it says (a rollback and its reason,
        // after an update restarted this agent before its hub) stays.
        console.warn(`[update] ${error.message}`);
        return;
      }
      logFailure(error);
      await this.#set({
        phase: "failed",
        error: error instanceof Error ? error.message : String(error),
      }).catch(logFailure);
    }
  }

  /** What the hub offers this machine, signature checked, and what the hub's database holds. */
  async #offer(
    installation: BinaryInstallation
  ): Promise<{ dbSchemaVersion?: number; release: SignedRelease }> {
    const hub = installation.hubUrl;
    // The hub's machine considers the channel's newest; every other machine
    // takes the build its hub runs, so none is ever ahead of its hub.
    const path = installation.role === "hub" ? "latest" : "release";
    const response = await fetch(`${hub}/api/binary-updates/${path}`, {
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) {
      throw new Error(
        `The hub has no build to offer (${path}: ${response.status})`
      );
    }
    const body = (await response.json()) as SignedRelease & {
      dbSchemaVersion?: number;
    };
    verifyManifest(body.manifest, body.signature);
    if (installation.role === "hub") {
      if (body.manifest.channel !== this.#policy.channel) {
        throw new Error("The hub offered a build from another channel");
      }
    } else {
      const protocol = await hubProtocol(hub);
      const offered = body.manifest.protocol;
      if (
        !protocol ||
        offered.min > protocol.max ||
        offered.max < protocol.min
      ) {
        throw new Error(
          "This build's wire protocol does not overlap the hub's"
        );
      }
    }
    return { release: body, dbSchemaVersion: body.dbSchemaVersion };
  }

  async #check(): Promise<void> {
    const installation = await readInstallation();
    if (!installation) {
      return;
    }
    const settings = await fetch(
      `${installation.hubUrl}/api/binary-updates/settings`,
      { signal: AbortSignal.timeout(10_000) }
    ).catch((error: unknown) => {
      throw new HubUnreachable(
        `the hub at ${installation.hubUrl} did not answer: ${error instanceof Error ? error.message : String(error)}`
      );
    });
    if (!settings.ok) {
      throw new Error(`The hub's update settings answered ${settings.status}`);
    }
    this.#policy = (await settings.json()) as BinaryUpdatePolicy;
    const { release, dbSchemaVersion } = await this.#offer(installation);
    const running = await readRunningManifest();
    // Only a change is written: every write moves `updatedAt`, and the lost-helper rule (#settleLostHelper) reads it.
    if (this.#state.channel !== this.#policy.channel) {
      await this.#set({ channel: this.#policy.channel });
    }
    // A helper is applying a build, or deciding one whose state already says
    // installed: nothing else stages, applies, moves the keeper or counts
    // anything now. An install no helper took over is the watch's to settle
    // (#settleLostHelper).
    if (this.#state.phase === "installing" || (await readTrial())) {
      return;
    }
    const newer = release.manifest.sequence > running.sequence;
    const schemaOk =
      dbSchemaVersion === undefined ||
      release.manifest.schemaVersion >= dbSchemaVersion;
    if (!(newer && schemaOk)) {
      // Never a build that is not newer, and never one older than the data.
      await this.#settleNothingNewer(this.#policy.channel !== running.channel);
      return;
    }
    await this.#takeUp(release, installation);
  }

  /**
   * A newer build is offered: the state says it is available (or, while a
   * failed attempt at it waits out its delay, failed, and why), and a command
   * or auto-update attempts it: staged, then applied. An attempt that fails
   * is recorded with its retry time ({@link AttemptFailed}).
   */
  async #takeUp(
    release: SignedRelease,
    installation: BinaryInstallation
  ): Promise<void> {
    const { version, notes } = release.manifest;
    this.#spendCommandFor(version);
    const failedBefore = this.#state.failedVersion === version;
    const attempt =
      this.#flags.commanded || (this.#policy.autoUpdate && !failedBefore);
    const failure = attempt ? await readFailure(version) : undefined;
    const waiting = failure !== undefined && Date.now() < failure.nextAt;
    if (
      !["installing", "waiting-sessions", "ready"].includes(this.#state.phase)
    ) {
      let said: Partial<BinaryUpdateState> = {
        phase: failedBefore ? "failed-rolled-back" : "available",
      };
      if (waiting) {
        said = { phase: "failed", error: failure.error };
      }
      await this.#setChanged({ ...said, availableVersion: version, notes });
    }
    if (!attempt || waiting) {
      return;
    }
    try {
      await this.#stage(release, installation);
      await this.#apply(release);
    } catch (error) {
      const said = error instanceof Error ? error.message : String(error);
      await recordFailure(version, said);
      throw new AttemptFailed(said, { cause: error });
    }
  }

  /** A command for a build other than the one offered now is spent: it named that build only. */
  #spendCommandFor(offered: string): void {
    if (this.#flags.version !== undefined && this.#flags.version !== offered) {
      this.#flags.commanded = false;
      this.#flags.version = undefined;
    }
  }

  /** Nothing is newer: say `none`, or that a channel change waits for that channel's next release. */
  async #settleNothingNewer(waitsForChannel: boolean): Promise<void> {
    this.#staged = undefined;
    this.#flags.commanded = false;
    this.#outlasted.clear();
    const target = waitsForChannel ? "waiting-for-channel" : "none";
    // A finished install stays `installed` until the next update, except that a change of channel is what
    // the machine is now waiting on.
    const settles = [
      "failed",
      "available",
      "downloading",
      "ready",
      "waiting-for-channel",
      "none",
      ...(waitsForChannel ? (["installed"] as const) : []),
    ];
    if (this.#state.phase !== target && settles.includes(this.#state.phase)) {
      await this.#set({
        phase: target,
        availableVersion: undefined,
        notes: undefined,
        waitingOn: undefined,
        waitingSince: undefined,
        error: undefined,
      });
    }
  }

  /** Download through the hub, verify, extract into a partial folder of its own, then put it in place. */
  async #stage(
    release: SignedRelease,
    installation: BinaryInstallation
  ): Promise<void> {
    const { manifest } = release;
    if (this.#staged === manifest.version && this.#state.phase === "ready") {
      return;
    }
    if (
      manifest.version === runtimeVersion ||
      manifest.version === (await readKeeperVersion()) ||
      (await keeperEndpoints()).some(
        ({ keeper }) => keeper.version === manifest.version
      )
    ) {
      // A folder a running process was started from is never touched: this
      // agent's, and every keeper's, the current one and each retiring one.
      throw new Error("This version is one that is already running");
    }
    const target = `${process.platform}-${process.arch}`;
    const artifact = manifest.artifacts.find((row) => row.target === target);
    if (!artifact) {
      throw new Error(`This release has no build for ${target}`);
    }
    await this.#set({ phase: "downloading" });
    const response = await fetch(
      `${installation.hubUrl}/api/binary-updates/artifacts/${encodeURIComponent(manifest.version)}/${encodeURIComponent(artifact.archive)}`,
      { signal: AbortSignal.timeout(600_000) }
    );
    if (!response.ok) {
      throw new Error(`The hub could not supply the build: ${response.status}`);
    }
    const bytes = await readAtMost(response, artifact.size);
    if (!archiveMatches(manifest, target, bytes)) {
      throw new Error(
        "The downloaded build does not match the signed manifest"
      );
    }
    const directory = versionDirectory(manifest.version);
    const work = `${directory}.partial-${crypto.randomUUID()}`;
    const archive = `${work}.tar.gz`;
    try {
      await writeStateFile(archive, bytes);
      // On macOS the signed CawCo Agent.app, exactly as the release signed it.
      await Bun.$`mkdir -p ${work} && tar -xzf ${archive} -C ${work} ${ARCHIVE_ENTRY}`.quiet();
      const binary = join(work, EXECUTABLE_IN_VERSION);
      const extracted = await Bun.file(binary).bytes();
      if (
        extracted.byteLength !== artifact.binarySize ||
        new Bun.CryptoHasher("sha256").update(extracted).digest("hex") !==
          artifact.binarySha256
      ) {
        throw new Error(
          "The extracted binary does not match the signed manifest"
        );
      }
      await Bun.$`chmod 700 ${binary}`.quiet();
      await writeJsonAtomic(join(work, "release.json"), manifest);
      await writeJsonAtomic(join(work, "release.signature.json"), {
        signature: release.signature,
      });
      await rm(directory, { recursive: true, force: true });
      await rename(work, directory);
    } finally {
      await rm(work, { recursive: true, force: true });
      await rm(archive, { force: true });
    }
    this.#staged = manifest.version;
    await this.#set({ phase: "ready" });
  }

  /**
   * Says `installing` to the hub now, not at the next heartbeat: from this
   * moment the hub keeps new session starts for this machine instead of
   * sending them to an agent that is about to restart. If the hub cannot be
   * told, nothing is installed.
   */
  async #tellHub(): Promise<void> {
    const installation = await readInstallation();
    if (!installation) {
      return;
    }
    const response = await fetch(
      `${installation.hubUrl}/api/binary-updates/machines/${await machineId()}/state`,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(this.#state),
        signal: AbortSignal.timeout(10_000),
      }
    );
    if (!response.ok) {
      throw new Error(
        `The hub did not take the update state: ${response.status}`
      );
    }
  }

  /** Runs only from `ready`: the one state in which a build is staged and nothing is applying. */
  async #apply(release: SignedRelease): Promise<void> {
    if (this.#state.phase !== "ready") {
      return;
    }
    const unspoken = (await readKeepers()).filter(
      (keeper) =>
        keeper.held > 0 &&
        !keeper.capabilities.includes(release.manifest.sessiondProtocol)
    );
    if (unspoken.length > 0) {
      // The new agent could not speak to a keeper that holds sessions: the
      // whole machine's update waits, and nothing is ended to make room.
      await this.#set({
        phase: "waiting-sessions",
        heldChildren: unspoken.reduce((sum, keeper) => sum + keeper.held, 0),
        waitingOn: undefined,
        waitingSince: undefined,
      });
      return;
    }
    // On the hub's machine the update restarts the hub as well.
    const installation = await readInstallation();
    await this.#replace(
      installation?.role === "hub" ? installation.hubUrl : undefined,
      () => launchApplyHelper(["binary-apply", release.manifest.version])
    );
  }

  /**
   * Replaces this machine's services once {@link #drain} allows. The fence
   * stays up until the helper restarts them, and comes down if the helper
   * cannot be started, or gives up before restarting anything ({@link #watch});
   * its lease ends it in any case.
   */
  async #replace(
    hub: string | undefined,
    launch: () => Promise<HelperJob>
  ): Promise<void> {
    const cut = await this.#drain(hub);
    if (!cut) {
      return;
    }
    try {
      await this.#raiseFence(hub, INSTALL_FENCE_MS);
      await this.#set({
        phase: "installing",
        heldChildren: undefined,
        waitingOn: undefined,
        waitingSince: undefined,
        cut: cut.length > 0 ? cut : undefined,
      });
      await this.#tellHub();
      const job = await launch();
      console.info(
        `[update] the update helper for ${this.#state.availableVersion} is started: ${job.name}${this.#flags.commanded ? ", on Install now" : ""}`
      );
      // The command is the helper's now; it stands again only if the helper never takes over.
      this.#launched = {
        at: Date.now(),
        command: this.#flags.commanded
          ? { version: this.#flags.version }
          : undefined,
        job,
      };
      this.#flags.commanded = false;
      this.#outlasted.clear();
    } catch (error) {
      await this.#lowerFence();
      throw error;
    }
  }

  /**
   * THE GATE: whether this machine's services may be replaced now. Answers
   * what the restart will cut (empty: nothing), or undefined for not now, the
   * state then saying what it waits on. Turns are not work in flight: the
   * keeper runs them through the restart, and the next agent takes them over.
   *
   * Check, raise, check. The fence goes up first, on this agent and on the
   * hub when the hub restarts too, so nothing new that a restart would cut
   * starts from here, and the hub is told the machine is installing, so it
   * keeps new session starts. The work already in flight then gets
   * {@link UPDATE_DRAIN_MS} to end. Nothing left: replace. Something left: a
   * person's Install now, or an auto-update that has waited
   * {@link UPDATE_WAIT_CAP_MS}, replaces anyway and the state records what it cut;
   * otherwise the fence comes down and a later tick looks again. Work that
   * outlasted a drain gets no new fence until it has ended
   * ({@link #outlasted}): a long call is waited out, not fenced every minute.
   */
  async #drain(hub: string | undefined): Promise<RestartHold[] | undefined> {
    const before = this.#state.phase;
    const capped = (): boolean =>
      this.#state.waitingSince !== undefined &&
      Date.now() - this.#state.waitingSince >= UPDATE_WAIT_CAP_MS;
    if (await this.#cancelled(before)) {
      return undefined;
    }
    if (!(this.#flags.commanded || capped())) {
      const now = await readReadiness(hub);
      if (holdKeys(now.holds).some((key) => this.#outlasted.has(key))) {
        await this.#waitOn(before, now.holds);
        return undefined;
      }
    }
    this.#outlasted.clear();
    try {
      await this.#raiseFence(hub, UPDATE_DRAIN_MS + DRAIN_GRACE_MS);
      // Said in memory and to the hub, never written: an agent that dies
      // mid-drain comes back `ready`, not `installing` with no helper.
      this.#state = {
        ...this.#state,
        phase: "installing",
        updatedAt: Date.now(),
      };
      this.#report(this.#state);
      await this.#tellHub();
      let reading = await readReadiness(hub);
      const deadline = Date.now() + UPDATE_DRAIN_MS;
      while (!reading.ready && Date.now() < deadline) {
        // biome-ignore lint/performance/noAwaitInLoops: a poll; each look must see the work the previous one saw end
        await Bun.sleep(DRAIN_POLL_MS);
        reading = await readReadiness(hub);
      }
      if (await this.#cancelled(before)) {
        return undefined;
      }
      if (reading.ready || this.#flags.commanded || capped()) {
        return reading.holds;
      }
      for (const key of holdKeys(reading.holds)) {
        this.#outlasted.add(key);
      }
      await this.#lowerFence();
      await this.#waitOn(before, reading.holds);
      // The hub hears now, not at the next heartbeat, that the machine takes starts again.
      await this.#tellHub().catch(() => undefined);
      return undefined;
    } catch (error) {
      await this.#lowerFence();
      throw error;
    }
  }

  /**
   * A person's cancel came in during the pass (or the drain): nothing is
   * installed, a fence raised for it comes down, and a ready build goes back
   * to `available`. Never with auto-update on, which a cancel does not stop.
   */
  async #cancelled(before: BinaryUpdateState["phase"]): Promise<boolean> {
    if (this.#flags.commanded || this.#policy.autoUpdate) {
      return false;
    }
    const fenced = this.#fence !== undefined;
    await this.#lowerFence();
    await this.#set({
      phase: before === "ready" ? "available" : before,
      waitingOn: undefined,
      waitingSince: undefined,
    });
    if (fenced) {
      // The hub was told `installing`: it takes this machine's starts again now.
      await this.#tellHub().catch(() => undefined);
    }
    return true;
  }

  /** What the update waits on, written only when it changed: every write moves `updatedAt`, which the board reads as news. */
  async #waitOn(
    phase: BinaryUpdateState["phase"],
    holds: RestartHold[]
  ): Promise<void> {
    const waitingSince = this.#state.waitingSince ?? Date.now();
    if (
      this.#state.phase !== phase ||
      this.#state.waitingSince !== waitingSince ||
      JSON.stringify(this.#state.waitingOn) !== JSON.stringify(holds)
    ) {
      await this.#set({ phase, waitingOn: holds, waitingSince });
    }
  }

  async #raiseFence(hub: string | undefined, ms: number): Promise<void> {
    raiseFence(FENCE, ms);
    this.#fence = { hub };
    if (hub) {
      await fenceHub(hub, ms);
    }
  }

  /** Never throws: it runs on the way out of a failure. A hub fence it cannot lower lapses with its lease. */
  async #lowerFence(): Promise<void> {
    const raised = this.#fence;
    this.#fence = undefined;
    lowerFence(FENCE);
    if (raised?.hub) {
      await fenceHub(raised.hub, 0).catch(() => undefined);
    }
  }

  /**
   * THE KEEPER FOLLOWS THE BUILD THIS AGENT RUNS, AND WAITS ON NOTHING. When
   * the current keeper is not this build's own (a legacy keeper, or one of an
   * earlier build), the update helper hands it over (`binary-apply
   * <version> --keeper-only`): this build's keeper starts beside it and takes
   * every new session, and the one before keeps the sessions it holds until
   * each ends or sleeps (#tendKeepers). Nothing restarts, so nothing is
   * drained, fenced or cut, and no setting holds it back: the build it
   * follows was installed under the update policy already, and a newer one
   * on offer, or a hub that does not answer, holds nothing back: the keeper
   * follows the build that runs, and a handover asks nothing of the hub. Not
   * to a build whose keeper could not start (`keeperFailedVersion`), and not
   * while an update owns the machine: a pass deciding whether to apply one,
   * an install, or a trial (each hands the keeper to its own build), or any
   * helper.
   */
  async #advanceKeeper(): Promise<void> {
    if (
      this.#running ||
      this.#state.phase === "installing" ||
      (await readTrial())
    ) {
      return;
    }
    const current = await currentKeeper();
    const linked = await readKeeperVersion();
    if (
      current?.keeper.kind === "build" &&
      current.keeper.version === runtimeVersion &&
      linked === runtimeVersion
    ) {
      // Only a change is written: every write moves `updatedAt`, which the board reads as news.
      if (
        this.#state.phase === "waiting-sessions" ||
        this.#state.sessiondVersion !== runtimeVersion
      ) {
        await this.#set({
          ...(this.#state.phase === "waiting-sessions"
            ? { phase: "installed", heldChildren: undefined }
            : {}),
          sessiondVersion: runtimeVersion,
        });
      }
      return;
    }
    if (
      this.#state.keeperFailedVersion === runtimeVersion ||
      !current ||
      Date.now() - this.#handedAt < HELPER_START_MS ||
      (await helperIsLive())
    ) {
      return;
    }
    this.#handedAt = Date.now();
    console.info(
      `[update] the session keeper ${current.keeper.version}${current.keeper.kind === "legacy" ? " (from before keepers ran side by side)" : ""} is handed over to ${runtimeVersion}'s`
    );
    await launchApplyHelper(["binary-apply", runtimeVersion, "--keeper-only"]);
  }
}
