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
import { readdir, readFile, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import type { UpdateReport } from "@cawco/core";
import {
  archiveMatches,
  readAtMost,
  type SignedRelease,
} from "@cawco/core/binary-distribution";
import { hubProtocol } from "@cawco/core/binary-health";
import {
  type BinaryInstallation,
  binaryRoot,
  helperIsLive,
  keeperRecoveredPath,
  readInstallation,
  readKeeperRecovered,
  readKeeperVersion,
  readRunningManifest,
  readTrial,
  readUpdateState,
  updateStatePath,
  versionDirectory,
  writeJsonAtomic,
} from "@cawco/core/binary-installation";
import {
  type BinaryUpdatePolicy,
  type BinaryUpdateState,
  holdPhrases,
  mergeHolds,
  type RestartHold,
  type RestartReadiness,
  UPDATE_DRAIN_MS,
  UPDATE_WAIT_CAP_MS,
} from "@cawco/core/binary-updates";
import { BINARY_WRAPPER, writeWrapper } from "@cawco/core/binary-wrapper";
import { machineId } from "@cawco/core/machine-id";
import { verifyManifest } from "@cawco/core/release-manifest";
import { runtimeVersion } from "@cawco/core/runtime";
import { sessiondEndpoint } from "@cawco/core/sessiond";
import { lowerFence, raiseFence, restartReadiness } from "./restart";
import { heldSessions, SessiondClient } from "./sessiond-client";

const POLL_MS = 60_000;
/** An update that says it is installing for longer than this, with no helper and no trial, has lost its helper. */
const INSTALL_STALE_MS = 10 * 60_000;
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
/** How long a launched helper has to take its lock; one that holds none after it has gone. */
const HELPER_START_MS = 10_000;

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

/** The session keeper's held children, what it speaks and its epoch, read now. */
async function readKeeper(): Promise<{
  capabilities: readonly string[];
  held: number;
}> {
  const client = await SessiondClient.connect(
    process.env.CAWCO_SESSIOND_ENDPOINT ?? sessiondEndpoint()
  );
  try {
    return {
      held: heldSessions(client.procs),
      capabilities: client.capabilities,
    };
  } finally {
    client.close();
  }
}

/** The hub could not be reached at all: no answer, not an answer that refused. */
class HubUnreachable extends Error {}

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
 * The forwarded environment: CawCo's own settings, and the PATH, HOME and XDG
 * directories a one-shot job would otherwise lack. The same set the wrapper's
 * resume path forwards (binary-wrapper.ts `forwarded`): the helper rewrites
 * the keeper's unit (`cawco binary-units`), whose path and text come from
 * XDG_CONFIG_HOME, XDG_DATA_HOME and PATH as the installer saw them.
 */
function helperEnvironment(): [string, string][] {
  return Object.entries(process.env).filter(
    (entry): entry is [string, string] =>
      entry[1] !== undefined &&
      (entry[0].startsWith("CAWCO_") ||
        entry[0].startsWith("XDG_") ||
        entry[0] === "PATH" ||
        entry[0] === "HOME")
  );
}

/** The update helper (`cawco binary-apply`, given `args`), as a job of the service manager so it outlives the restarts it performs. */
async function launchApplyHelper(args: readonly string[]) {
  const executable = process.execPath;
  const forwarded = helperEnvironment();
  if (process.platform === "linux") {
    const child = Bun.spawn(
      [
        "systemd-run",
        "--user",
        "--collect",
        `--unit=cawco-binary-apply-${Date.now()}`,
        "--property=Type=exec",
        ...forwarded.map(([key, value]) => `--setenv=${key}=${value}`),
        executable,
        ...args,
      ],
      { stdout: "pipe", stderr: "pipe" }
    );
    if ((await child.exited) !== 0) {
      throw new Error(
        `The update helper could not start: ${(await new Response(child.stderr).text()).trim()}`
      );
    }
    return;
  }
  const label = `dev.cawco.binary-apply.${Date.now()}`;
  const plist = join(binaryRoot(), `${label}.plist`);
  const text = (value: string) =>
    `<string>${value.replaceAll("&", "&amp;").replaceAll("<", "&lt;")}</string>`;
  await Bun.write(
    plist,
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key>${text(label)}
<key>ProgramArguments</key><array>${[executable, ...args].map(text).join("")}</array>
<key>EnvironmentVariables</key><dict>${forwarded.map(([key, value]) => `<key>${key}</key>${text(value)}`).join("")}</dict>
<key>RunAtLoad</key><true/>
</dict></plist>
`
  );
  const child = Bun.spawn(
    ["launchctl", "bootstrap", `gui/${process.getuid?.()}`, plist],
    { stdout: "pipe", stderr: "pipe" }
  );
  if ((await child.exited) !== 0) {
    throw new Error(
      `The update helper could not start: ${(await new Response(child.stderr).text()).trim()}`
    );
  }
}

/**
 * A finished one-shot macOS job and its file are removed on the updater's next
 * pass. The helper restarts the agent itself mid-update, so a helper that is
 * still running is left alone: booting its job out would kill it half-way.
 */
async function removeFinishedHelpers(): Promise<void> {
  if (process.platform !== "darwin" || (await helperIsLive())) {
    return;
  }
  const files = (await readdir(binaryRoot())).filter(
    (name) =>
      name.startsWith("dev.cawco.binary-apply.") && name.endsWith(".plist")
  );
  await Promise.all(
    files.map(async (name) => {
      const label = name.slice(0, -".plist".length);
      await Bun.spawn(
        ["launchctl", "bootout", `gui/${process.getuid?.()}/${label}`],
        { stdout: "ignore", stderr: "ignore" }
      ).exited;
      await rm(join(binaryRoot(), name), { force: true });
    })
  );
}

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
  /**
   * The fence this updater raised, while it stands: on this agent, and on the
   * hub when its restart is part of the update (the hub's url then). Lowered
   * on every way out but the restart it was raised for.
   */
  #fence: { hub: string | undefined; launchedAt?: number } | undefined;
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
    await this.#load();
    await this.#noteKeeperRecovery();
    this.#timer = setInterval(() => this.tick(), POLL_MS);
    this.#timer.unref();
    this.#trialTimer = setInterval(() => this.#watch(), 10_000);
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
    const saved = await readUpdateState();
    this.#state = {
      ...(saved ?? this.#state),
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

  /** The keeper's wrapper put the previous keeper back after a move whose helper died; this records it and does not retry that build. */
  async #noteKeeperRecovery(): Promise<void> {
    const trial = await readKeeperRecovered();
    if (!trial) {
      return;
    }
    await this.#set({
      error: `The session keeper could not start on ${trial.to} and runs ${trial.from} again.`,
      keeperFailedVersion: trial.to,
      sessiondVersion: trial.from,
      // The move is over (the wrapper writes this only when no helper is live): an `installing` left by a helper
      // that died mid-move is not an update in flight.
      ...(this.#state.phase === "installing" ? { phase: "installed" } : {}),
    });
    await rm(keeperRecoveredPath(), { force: true });
  }

  /** The keeper watchdog restarted a wedged keeper: the dashboard says so once. */
  async noteKeeperRestart(
    restart: NonNullable<BinaryUpdateState["keeperRestart"]>
  ): Promise<void> {
    await this.#set({ keeperRestart: restart });
  }

  /**
   * Every ten seconds: take up what the helper wrote, so the hub learns the
   * phase has moved on; see that an open trial has a decider; take up a keeper
   * recovery; and, on a build no trial is deciding, keep the service wrapper as
   * this build writes it.
   */
  async #watch(): Promise<void> {
    if (!this.#running) {
      await this.#load();
      // The helper gave up before it restarted this agent (it says so in the
      // state), or it is gone without a word (it found another helper's lock):
      // the fence it was raised for has nothing left to wait for.
      const launched = this.#fence?.launchedAt;
      if (
        this.#fence &&
        (this.#state.phase !== "installing" ||
          (launched !== undefined &&
            Date.now() - launched > HELPER_START_MS &&
            !(await helperIsLive())))
      ) {
        await this.#lowerFence();
      }
    }
    await this.#noteKeeperRecovery();
    await this.#keepDecider();
    await this.#ownWrapper();
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

  /** One pass of load, check and (when allowed) stage and apply; callers share a pass in flight. */
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
      this.#flags.commanded = false;
      await this.#lowerFence();
      if (error instanceof HubUnreachable) {
        // Nothing was tried, and the state reaches a person only through the
        // hub that did not answer: what it says (a rollback and its reason,
        // after an update restarted this agent before its hub) stays.
        console.warn(`[update] ${error.message}`);
        return;
      }
      await this.#set({
        phase: "failed",
        error: error instanceof Error ? error.message : String(error),
      });
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
    // Only a change is written: every write moves `updatedAt`, and the lost-helper rule below reads it.
    if (this.#state.channel !== this.#policy.channel) {
      await this.#set({ channel: this.#policy.channel });
    }
    // A live helper, or an open trial (which #keepDecider gives a helper), owns an install.
    if (
      this.#state.phase === "installing" &&
      Date.now() - this.#state.updatedAt > INSTALL_STALE_MS &&
      !(await helperIsLive()) &&
      !(await readTrial())
    ) {
      await this.#set({
        phase: "failed",
        error: "The update helper did not report back",
      });
    }
    // A helper is applying a build, or deciding one whose state already says
    // installed: nothing else stages, applies, moves the keeper or counts anything now.
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
      await this.#advanceKeeper();
      return;
    }
    this.#spendCommandFor(release.manifest.version);
    const failedBefore = this.#state.failedVersion === release.manifest.version;
    if (
      !["installing", "waiting-sessions", "ready"].includes(this.#state.phase)
    ) {
      await this.#set({
        phase: failedBefore ? "failed-rolled-back" : "available",
        availableVersion: release.manifest.version,
        notes: release.manifest.notes,
      });
    }
    if (
      !(this.#flags.commanded || (this.#policy.autoUpdate && !failedBefore))
    ) {
      return;
    }
    if (!(await this.#retryAllowed(release.manifest.version))) {
      return;
    }
    try {
      await this.#stage(release, installation);
    } catch (error) {
      await recordFailure(
        release.manifest.version,
        error instanceof Error ? error.message : String(error)
      );
      throw error;
    }
    await this.#apply(release);
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

  /** A failed download or verification waits out a growing delay; the state keeps saying why. */
  async #retryAllowed(version: string): Promise<boolean> {
    const failure = await readFailure(version);
    if (!failure || Date.now() >= failure.nextAt) {
      return true;
    }
    if (this.#state.phase !== "failed") {
      await this.#set({ phase: "failed", error: failure.error });
    }
    return false;
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
      manifest.version === (await readKeeperVersion())
    ) {
      // A folder a running process was started from is never touched.
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
      await Bun.write(archive, bytes);
      await Bun.$`mkdir -p ${work} && tar -xzf ${archive} -C ${work} cawco`.quiet();
      const binary = join(work, "cawco");
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
    const keeper = await readKeeper();
    if (
      keeper.held > 0 &&
      !keeper.capabilities.includes(release.manifest.sessiondProtocol)
    ) {
      // The new agent could not speak to the keeper that holds the sessions:
      // the whole machine's update waits, and nothing is ended to make room.
      await this.#set({
        phase: "waiting-sessions",
        heldChildren: keeper.held,
        waitingOn: undefined,
        waitingSince: undefined,
      });
      return;
    }
    // On the hub's machine the update restarts the hub as well. Read before
    // the replace, which spends the command: the helper hears whether a person
    // asked for this build, and so whether its keeper is owed the move.
    const installation = await readInstallation();
    const { commanded } = this.#flags;
    await this.#replace(
      installation?.role === "hub" ? installation.hubUrl : undefined,
      () =>
        launchApplyHelper([
          "binary-apply",
          release.manifest.version,
          "--held",
          String(keeper.held),
          ...(commanded ? ["--commanded"] : []),
        ])
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
    launch: () => Promise<void>,
    owed = false
  ): Promise<void> {
    const cut = await this.#drain(hub, owed);
    if (!cut) {
      return;
    }
    try {
      await this.#raiseFence(hub, INSTALL_STALE_MS);
      await this.#set({
        phase: "installing",
        heldChildren: undefined,
        waitingOn: undefined,
        waitingSince: undefined,
        cut: cut.length > 0 ? cut : undefined,
      });
      this.#flags.commanded = false;
      this.#outlasted.clear();
      await this.#tellHub();
      await launch();
      this.#fence = { hub, launchedAt: Date.now() };
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
  async #drain(
    hub: string | undefined,
    owed: boolean
  ): Promise<RestartHold[] | undefined> {
    const before = this.#state.phase;
    const capped = (): boolean =>
      this.#state.waitingSince !== undefined &&
      Date.now() - this.#state.waitingSince >= UPDATE_WAIT_CAP_MS;
    if (await this.#cancelled(before, owed)) {
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
      if (await this.#cancelled(before, owed)) {
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
   * to `available`. Never with auto-update on, which a cancel does not stop,
   * nor for a keeper move a confirmed install is owed (`owed`): a cancel takes
   * back an install not yet applied, and that one was.
   */
  async #cancelled(
    before: BinaryUpdateState["phase"],
    owed: boolean
  ): Promise<boolean> {
    if (owed || this.#flags.commanded || this.#policy.autoUpdate) {
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
   * The session keeper advances only once it holds nothing, and only under the
   * same policy as any update: auto-update on, or a person's Install now. Not
   * to a build it already could not start on.
   *
   * A person's Install now reaches the keeper after the agent that heard it is
   * gone (the trial restarts it): the confirmed install leaves `keeperOwed`,
   * the build, never the command. It moves the keeper to that build only, the
   * one this agent runs, and is cleared as the move starts, so it is acted on
   * once; a keeper that cannot start there is not moved there again
   * (`keeperFailedVersion`, checked first).
   */
  async #advanceKeeper(): Promise<void> {
    const keeperVersion = await readKeeperVersion();
    if (keeperVersion === runtimeVersion) {
      if (
        this.#state.phase === "waiting-sessions" ||
        this.#state.keeperOwed !== undefined
      ) {
        await this.#set({
          ...(this.#state.phase === "waiting-sessions"
            ? { phase: "installed", heldChildren: undefined }
            : {}),
          keeperOwed: undefined,
        });
      }
      return;
    }
    if (this.#state.keeperFailedVersion === runtimeVersion) {
      if (this.#state.keeperOwed !== undefined) {
        await this.#set({ keeperOwed: undefined });
      }
      return;
    }
    const keeper = await readKeeper();
    if (keeper.held > 0) {
      // Only a change is written: every write moves `updatedAt`, which the board reads as news.
      if (
        this.#state.phase !== "waiting-sessions" ||
        this.#state.heldChildren !== keeper.held ||
        this.#state.sessiondVersion !== keeperVersion
      ) {
        await this.#set({
          phase: "waiting-sessions",
          heldChildren: keeper.held,
          sessiondVersion: keeperVersion,
        });
      }
      return;
    }
    const owed = this.#state.keeperOwed === runtimeVersion;
    if (!(this.#flags.commanded || this.#policy.autoUpdate || owed)) {
      return;
    }
    // The keeper moves with this agent alone; the hub stays up.
    await this.#replace(
      undefined,
      async () => {
        await launchApplyHelper([
          "binary-apply",
          runtimeVersion,
          "--held",
          "0",
          "--keeper-only",
        ]);
        if (this.#state.keeperOwed !== undefined) {
          await this.#set({ keeperOwed: undefined });
        }
      },
      owed
    );
  }
}
