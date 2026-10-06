/**
 * The machine's side of binary updates: learn of a build from the hub, verify
 * and stage it, and apply it through a service-manager-owned helper when
 * `mayReplaceMachineServices` allows. One code path, whether it runs on the
 * idle tick (auto-update on) or because a person pressed "Install now".
 *
 * Nothing here ever goes backwards: a build whose signed `sequence` is not
 * above the running one is never installed, a machine other than the hub's own
 * applies only the build its hub is running, and the hub's machine never
 * installs a build with fewer migrations than its database holds.
 */
import { readdir, rename, rm } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import type { AgentBusyReport, UpdateReport } from "@cawco/core";
import {
  archiveMatches,
  readAtMost,
  type SignedRelease,
} from "@cawco/core/binary-distribution";
import { hubProtocol, probeHealth } from "@cawco/core/binary-health";
import {
  type BinaryInstallation,
  binaryRoot,
  helperIsLive,
  keeperRecoveredPath,
  previousInstallationPath,
  prune,
  readInstallation,
  readKeeperRecovered,
  readKeeperVersion,
  readRunningManifest,
  readTrial,
  readUpdateState,
  recoveredPath,
  trialPath,
  updateStatePath,
  versionDirectory,
  writeJsonAtomic,
} from "@cawco/core/binary-installation";
import type {
  BinaryUpdatePolicy,
  BinaryUpdateState,
} from "@cawco/core/binary-updates";
import { verifyManifest } from "@cawco/core/release-manifest";
import { runtimeVersion } from "@cawco/core/runtime";
import { sessiondEndpoint } from "@cawco/core/sessiond";
import { machineId } from "./machine-id";
import { SessiondClient } from "./sessiond-client";

const POLL_MS = 60_000;
/** An update that says it is installing for longer than this has lost its helper. */
const INSTALL_STALE_MS = 10 * 60_000;
/** How long a new build must be healthy before it clears its trial marker. */
const TRIAL_CONFIRM_MS = 60_000;
/** Minutes to wait before trying a failed download or verification again; the last repeats. */
const RETRY_DELAYS_MIN = [1, 5, 30, 60];

/**
 * Whether this machine's services may be replaced right now. The retirement
 * fence replaces this one body when its reviewed branch lands.
 */
export async function mayReplaceMachineServices(
  readBusy: () => Promise<AgentBusyReport>
): Promise<boolean> {
  const busy = await readBusy();
  return busy.ready && busy.busy === 0;
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
      held: client.procs.filter((proc) => proc.alive).length,
      capabilities: client.capabilities,
    };
  } finally {
    client.close();
  }
}

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

/** The forwarded environment: CawCo's own settings, and a PATH and HOME a one-shot job would otherwise lack. */
function helperEnvironment(): [string, string][] {
  return Object.entries(process.env).filter(
    (entry): entry is [string, string] =>
      entry[1] !== undefined &&
      (entry[0].startsWith("CAWCO_") ||
        entry[0] === "PATH" ||
        entry[0] === "HOME")
  );
}

async function launchApplyHelper(
  version: string,
  held: number,
  keeperOnly: boolean
) {
  const executable = process.execPath;
  const args = [
    "binary-apply",
    version,
    "--held",
    String(held),
    ...(keeperOnly ? ["--keeper-only"] : []),
  ];
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
 * A finished one-shot macOS job and its file are removed the next time an agent
 * starts. The helper restarts the agent itself mid-update, so a helper that is
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
    unseen: false,
    hostsHub: false,
  };
  /** Whether this machine runs the hub: it then considers the channel's newest build, not its hub's. */
  #hostsHub = false;
  #policy: BinaryUpdatePolicy = { channel: "stable", autoUpdate: false };
  #staged: string | undefined;
  /** `commanded`: a person asked for this build, so it applies at the first moment allowed. */
  readonly #flags: { commanded: boolean } = { commanded: false };
  #running: Promise<void> | undefined;
  #timer: ReturnType<typeof setInterval> | undefined;
  #trialTimer: ReturnType<typeof setInterval> | undefined;
  #healthySince: number | undefined;
  readonly #readBusy: () => Promise<AgentBusyReport>;
  readonly #report: (state: BinaryUpdateState) => void;

  constructor(
    readBusy: () => Promise<AgentBusyReport>,
    report: (state: BinaryUpdateState) => void
  ) {
    this.#readBusy = readBusy;
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
    await removeFinishedHelpers();
    this.#hostsHub = (await readInstallation())?.role === "hub";
    await this.#load();
    await this.#noteRecovery();
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

  async acknowledge(): Promise<BinaryUpdateState> {
    await this.#load();
    await this.#set({ unseen: false });
    return this.#state;
  }

  /** Returns a machine waiting for the fence to `available`: the person changed their mind. */
  async cancel(): Promise<BinaryUpdateState> {
    this.#flags.commanded = false;
    await this.#load();
    if (this.#state.phase === "ready") {
      await this.#set({ phase: "available", waitingFor: undefined });
    }
    return this.#state;
  }

  /** The command behind "Install now": stage the offered build, then apply it. */
  async installNow(): Promise<UpdateReport> {
    const from = this.#state.installedVersion;
    this.#flags.commanded = true;
    // A pass already in flight began before the command: let it end, then run one that sees it.
    await this.#running;
    await this.tick();
    const to = this.#state.availableVersion;
    const waiting =
      this.#state.phase === "ready" && this.#state.waitingFor !== undefined
        ? `waiting for ${this.#state.waitingFor} working session${this.#state.waitingFor === 1 ? "" : "s"} to finish`
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

  /** A service wrapper that restored the previous build leaves a note; this records it. */
  async #noteRecovery(): Promise<void> {
    const note = (
      await Bun.file(recoveredPath())
        .text()
        .catch(() => undefined)
    )?.trim();
    if (!note) {
      return;
    }
    await this.#set({
      phase: "failed-rolled-back",
      failedVersion: note,
      availableVersion: note,
      error:
        "The new build did not become healthy and the helper never reported back; the previous build was restored on its next start",
      unseen: true,
    });
    await rm(recoveredPath(), { force: true });
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

  /** Every ten seconds: take up what the helper wrote, so the hub learns the phase has moved on, confirm the trial, and take up a keeper recovery. */
  async #watch(): Promise<void> {
    if (!this.#running) {
      await this.#load();
    }
    await this.#noteKeeperRecovery();
    await this.#confirmTrial();
  }

  /** Clears the trial marker once this build has been healthy for a minute. */
  async #confirmTrial(): Promise<void> {
    const trial = await readTrial();
    const installation = await readInstallation();
    if (!(trial && installation) || trial.version !== runtimeVersion) {
      this.#healthySince = undefined;
      return;
    }
    const problem = await probeHealth({
      installation,
      machineId: await machineId(),
      sinceMs: trial.swappedAt * 1000,
      version: runtimeVersion,
    });
    if (problem) {
      this.#healthySince = undefined;
      return;
    }
    this.#healthySince ??= Date.now();
    if (Date.now() - this.#healthySince < TRIAL_CONFIRM_MS) {
      return;
    }
    await rm(trialPath(), { force: true });
    await rm(previousInstallationPath(), { force: true });
    await prune();
    if (trial.dbPath && trial.dbBackup) {
      // Confirmed healthy: keep the newest copy, drop older ones.
      const prefix = `${basename(trial.dbPath)}.pre-`;
      const old = (await readdir(dirname(trial.dbPath))).filter(
        (name) =>
          name.startsWith(prefix) &&
          join(dirname(trial.dbPath ?? ""), name) !== trial.dbBackup
      );
      await Promise.all(
        old.map((name) =>
          rm(join(dirname(trial.dbPath ?? ""), name), { force: true })
        )
      );
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
      await this.#load();
      await this.#noteRecovery();
      await this.#check();
    } catch (error) {
      this.#flags.commanded = false;
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
    );
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
    if (
      this.#state.phase === "installing" &&
      Date.now() - this.#state.updatedAt > INSTALL_STALE_MS
    ) {
      await this.#set({
        phase: "failed",
        error: "The update helper did not report back",
      });
    }
    if (this.#state.phase === "installing") {
      // A helper is applying a build: nothing else stages, applies or counts anything now.
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

  /** Nothing is newer: say `none`, or that a channel change waits for that channel's next release. */
  async #settleNothingNewer(waitsForChannel: boolean): Promise<void> {
    this.#staged = undefined;
    this.#flags.commanded = false;
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
        waitingFor: undefined,
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
    if (!(await mayReplaceMachineServices(this.#readBusy))) {
      await this.#set({
        phase: "ready",
        waitingFor: (await this.#readBusy()).busy,
      });
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
        waitingFor: undefined,
      });
      return;
    }
    await this.#set({
      phase: "installing",
      heldChildren: undefined,
      waitingFor: undefined,
    });
    this.#flags.commanded = false;
    await this.#tellHub();
    await launchApplyHelper(release.manifest.version, keeper.held, false);
  }

  /**
   * The session keeper advances only once it holds nothing, and only under the
   * same policy as any update: auto-update on, or a person's Install now. Not
   * to a build it already could not start on.
   */
  async #advanceKeeper(): Promise<void> {
    const keeperVersion = await readKeeperVersion();
    if (keeperVersion === runtimeVersion) {
      if (this.#state.phase === "waiting-sessions") {
        await this.#set({ phase: "installed", heldChildren: undefined });
      }
      return;
    }
    if (this.#state.keeperFailedVersion === runtimeVersion) {
      return;
    }
    const keeper = await readKeeper();
    if (keeper.held > 0) {
      await this.#set({
        phase: "waiting-sessions",
        heldChildren: keeper.held,
        sessiondVersion: keeperVersion,
      });
      return;
    }
    if (!(this.#flags.commanded || this.#policy.autoUpdate)) {
      return;
    }
    if (await mayReplaceMachineServices(this.#readBusy)) {
      await this.#set({ phase: "installing", heldChildren: undefined });
      this.#flags.commanded = false;
      await this.#tellHub();
      await launchApplyHelper(runtimeVersion, 0, true);
    }
  }
}
