/** Server-only install identity and durable update state of a binary install. */
import type { Dirent } from "node:fs";
import { mkdir, readdir, readlink, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { AGENT_BUNDLE, AGENT_BUNDLE_EXECUTABLE } from "./agent-bundle";
import type { BinaryUpdateState } from "./binary-updates";
import { versionsInUse } from "./live-processes";
import { hubDbPath } from "./paths";
import { markerIsLive } from "./process-identity";
import type { ReleaseManifest } from "./release-manifest";
import { runtimeVersion } from "./runtime";
import { readRecord, writeStateFile } from "./state-file";

export interface BinaryInstallation {
  /** Where this machine's dashboard answers, when it runs one. */
  dashboardUrl?: string;
  hubUrl: string;
  installedVersion: string;
  /** Where releases come from, when not GitHub; recorded by the installer. */
  releaseHost?: string;
  role: "hub" | "agent";
  root: string;
}

/**
 * The binary install of the data dir this process runs with, and the only
 * derivation of it: every updater, helper, wrapper and installer read and
 * write goes through here. A unit is given its data dir as `XDG_DATA_HOME`
 * (service.ts `environment`), so a process started with a scratch data dir
 * (a rig, a proof) has a scratch install and never reaches the machine's.
 */
export const binaryRoot = (): string =>
  join(
    process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share"),
    "cawco",
    "binary"
  );
export const installationPath = (): string =>
  join(binaryRoot(), "installation.json");
export const updateStatePath = (): string =>
  join(binaryRoot(), "update-state.json");
export const versionDirectory = (version: string): string =>
  join(binaryRoot(), "versions", version);

/**
 * Where a build's executable sits in its folder: on macOS inside the signed
 * `CawCo Agent.app` the release ships (agent-bundle.ts), the only place macOS
 * lets it run; elsewhere the folder's `cawco`. The service wrapper's `EXE`
 * (binary-wrapper.ts) and the installer's (install-script.ts) are its shell
 * twins.
 */
export const EXECUTABLE_IN_VERSION =
  process.platform === "darwin" ? AGENT_BUNDLE_EXECUTABLE : "cawco";

/** What this platform's release archive holds, and what of it a build's folder keeps: the bundle, or the executable. */
export const ARCHIVE_ENTRY =
  process.platform === "darwin" ? AGENT_BUNDLE : "cawco";

/** The one way to name a build's executable. */
export const versionExecutable = (version: string): string =>
  join(versionDirectory(version), EXECUTABLE_IN_VERSION);

/** The folder of the build the `current` link names, through the link. */
export const currentDirectory = (): string => join(binaryRoot(), "current");

/** The executable of the build the `current` link names, through the link. */
export const currentExecutable = (): string =>
  join(currentDirectory(), EXECUTABLE_IN_VERSION);

export async function writeJsonAtomic(
  path: string,
  value: unknown
): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeStateFile(path, `${JSON.stringify(value)}\n`, { mode: 0o600 });
}

export const readInstallation = (): Promise<BinaryInstallation | undefined> =>
  readRecord<BinaryInstallation>(installationPath());
export const readUpdateState = (): Promise<BinaryUpdateState | undefined> =>
  readRecord<BinaryUpdateState>(updateStatePath());

/** The signed manifest of the build this process is running, as the installer or the updater staged it. */
export async function readRunningManifest(): Promise<ReleaseManifest> {
  const manifest = await readRecord<ReleaseManifest>(
    join(versionDirectory(runtimeVersion), "release.json")
  );
  if (!manifest) {
    throw new Error(
      `No signed manifest is stored for the running build ${runtimeVersion}`
    );
  }
  return manifest;
}

/**
 * An update's trial: the decider's whole state, on disk from before the swap
 * until the trial is decided. The decider is the update helper (`cawco
 * binary-apply`); it stays up through the trial and either confirms the build
 * (healthy for a minute) or rolls every unit back, within minutes. A helper
 * that dies leaves this file with no live lock, and the next decider resumes
 * from it: the agent launches one within seconds, and the service wrapper
 * launches one from the previous build at any unit's start (a reboot, a
 * crash loop). Nothing but a decider acts on it.
 */
export interface TrialMarker {
  /** The hub database copy a rollback restores, when the schema changed. */
  dbBackup?: string;
  dbPath?: string;
  /** A rollback has put the database copy in place: a resumed one does not do it again over the previous build's writes. */
  dbRestored?: boolean;
  /** Unix seconds by which the build must be healthy, or it is rolled back. A migration moves it. */
  decideBy?: number;
  /**
   * Written before either is carried out, so a decider that resumes finishes
   * the one already begun rather than deciding again.
   */
  decision?: "confirm" | "roll-back";
  /** The keeper handover is done and the state says installed: a resumed helper does not hand it over again. */
  keeperDone?: boolean;
  previous: string;
  /** Why a rollback was decided: the problem that stood at the deadline. */
  reason?: string;
  role: BinaryInstallation["role"];
  /** Unix seconds: units started after this run the trial build. */
  swappedAt: number;
  version: string;
}
export const trialPath = (): string => join(binaryRoot(), "trial.json");
export const readTrial = (): Promise<TrialMarker | undefined> =>
  readRecord<TrialMarker>(trialPath());
/**
 * The whole stack, as four services a machine can run, in the order they
 * come up (cli service.ts installs each). A machine runs whichever of them
 * it is for: a worker wants `sessiond` and `agent`, and the box you point a
 * browser at wants all four. `sessiond` sits before `agent` on purpose — it
 * owns the harness children, so the daemon that talks to it comes up second
 * (design §11).
 */
export const SERVICE_IDS = ["hub", "dashboard", "sessiond", "agent"] as const;
export type ServiceId = (typeof SERVICE_IDS)[number];

/**
 * The services an update restarts, and its rollback restarts again: every one
 * that runs from `current`, one at a time in this order. The agent first: it
 * writes every held workspace's boundary hook again as it starts
 * (boundary.ts `rearmHooks`), and until it does, a CLI it holds runs the hook
 * an earlier build wrote against the build `current` now names. The agent
 * meets the hub it had for a moment, then reconnects when the hub restarts.
 */
export const trialUnits = (
  role: BinaryInstallation["role"]
): Exclude<ServiceId, "sessiond">[] =>
  role === "hub" ? ["agent", "hub", "dashboard"] : ["agent"];

/**
 * Which build's session keeper is the machine's current one: a relative link
 * `<root>/keeper` -> `versions/<v>`, changed only by an atomic rename, like
 * `current`, and only by a keeper handover (`cawco binary-apply`). The keeper
 * of that build runs in a job of its own, from its build ({@link versionExecutable}), and the
 * machine's endpoint names it (keepers.ts).
 */
const VERSIONS_PREFIX = /^versions\//u;
export const keeperPath = (): string => join(binaryRoot(), "keeper");
export const readKeeperVersion = async (): Promise<string | undefined> => {
  try {
    return (await readlink(keeperPath())).replace(VERSIONS_PREFIX, "");
  } catch {
    return undefined;
  }
};

export const lockFilePath = (): string => join(binaryRoot(), "apply.lock");

const linkedVersion = async (path: string): Promise<string | undefined> => {
  try {
    return (await readlink(path)).replace(VERSIONS_PREFIX, "");
  } catch {
    return undefined;
  }
};

/**
 * The running update helper's lock, which names the build it applies (or
 * rolls back from), or `undefined` when none runs: a lock is a helper's only
 * while the process it names is still the one that wrote it.
 */
export async function liveHelper(): Promise<{ version?: string } | undefined> {
  const lock = await readRecord<
    { version?: string } & Parameters<typeof markerIsLive>[0]
  >(lockFilePath());
  return lock !== undefined && (await markerIsLive(lock)) ? lock : undefined;
}

/** Whether an update helper is running ({@link liveHelper}). */
export const helperIsLive = async (): Promise<boolean> =>
  (await liveHelper()) !== undefined;

/**
 * The phases in which the update state's `availableVersion` is a build staged
 * under `versions/` for an install that has not reached its helper's lock:
 * waiting for work in flight or for its moment (`ready`), for a keeper's
 * sessions (`waiting-sessions`), or handed to a helper that has yet to take
 * its lock (`installing`).
 */
const STAGED_PHASES: ReadonlySet<BinaryUpdateState["phase"]> = new Set([
  "ready",
  "waiting-sessions",
  "installing",
]);

/**
 * How many installed builds a machine keeps: the one installed and the two
 * installed before it, in `versions/` and, on the hub's machine, in the hub's
 * archive cache ({@link hubReleasesDir}).
 */
export const KEPT_INSTALLS = 3;

/**
 * The builds this machine installed, in the order it installed them, newest
 * last, at most {@link KEPT_INSTALLS}: what {@link prune} keeps by install
 * order. Written only by {@link recordInstall}: by the installer's
 * `binary-install` for the build it installs, and by an update helper when it
 * confirms a build. Never read from version names: a nightly's and a
 * stable's do not sort by when they went on.
 */
export const installOrderPath = (): string =>
  join(binaryRoot(), "install-order.json");
const readInstallOrder = async (): Promise<string[]> =>
  (await readRecord<string[]>(installOrderPath())) ?? [];

/**
 * `version` goes to the end of the install order, and the order keeps its
 * newest {@link KEPT_INSTALLS}. An update names the build it replaced
 * (`previous`), which goes just before it: the build that ran is the one
 * installed before, whether or not this machine's order holds it yet.
 */
export async function recordInstall(
  version: string,
  previous?: string
): Promise<void> {
  const before = (await readInstallOrder()).filter(
    (name) => name !== version && name !== previous
  );
  await writeJsonAtomic(
    installOrderPath(),
    [...before, ...(previous ? [previous] : []), version].slice(-KEPT_INSTALLS)
  );
}

/**
 * The hub's cache of the release archives it serves its machines
 * (`binary-releases/<version>/<archive>`, hub binary-updates.ts), beside the
 * hub's database. It holds archives only: everything in it is a build's, and
 * {@link prune} trims it. The update policy is not here
 * (paths.ts `hubUpdatePolicyPath`). Only on the hub's machine does it exist.
 */
export const hubReleasesDir = (): string =>
  join(dirname(hubDbPath()), "binary-releases");

/** Removes every folder in `dir` not named in `keep`; unfinished folders (`.partial`) stay. */
async function removeFoldersBut(
  dir: string,
  keep: ReadonlySet<string>
): Promise<void> {
  const present = await readdir(dir, { withFileTypes: true }).catch(
    () => [] as Dirent[]
  );
  await Promise.all(
    present
      .filter(
        (entry) =>
          entry.isDirectory() &&
          !(keep.has(entry.name) || entry.name.includes(".partial"))
      )
      .map((entry) =>
        rm(join(dir, entry.name), { recursive: true, force: true })
      )
  );
}

/**
 * Deletes the builds nothing keeps. In `versions/`, kept: the builds of the
 * install order ({@link readInstallOrder}: the installed one and the two
 * installed before it), what `current` and `keeper` name, what a pending
 * update trial would restore or has swapped in (`trial.json`), the build a
 * live helper is applying (named in `apply.lock`), the build staged for an
 * install no helper has taken up yet ({@link STAGED_PHASES}: a prune while it
 * waits, a retiring keeper's removal among them, left its helper no build to
 * apply), and every build a live process runs or names ({@link versionsInUse}):
 * a unit still on a build the links have left, a retiring keeper and its
 * children, and the hooks baked into their CLI settings. Such a build stays
 * while its process lives: the agent prunes again when it removes a retiring
 * keeper that holds nothing (binary-update.ts `#tendKeepers`), and that prune
 * deletes it.
 *
 * In the hub's archive cache ({@link hubReleasesDir}), which no process runs
 * from (the hub reads an archive only to serve it, and fetches one it lacks
 * again), kept: the install order, what `current` names, and the update
 * state's `availableVersion` (the build this machine is fetching or holds
 * staged through the hub). The caller never supplies a keep-list.
 */
export async function prune(): Promise<void> {
  const state = await readUpdateState();
  const trial = await readTrial();
  const installed = [
    ...(await readInstallOrder()),
    await linkedVersion(currentDirectory()),
  ];
  const builds = new Set(
    [
      ...installed,
      await linkedVersion(keeperPath()),
      trial?.previous,
      trial?.version,
      (await liveHelper())?.version,
      state && STAGED_PHASES.has(state.phase)
        ? state.availableVersion
        : undefined,
      ...(await versionsInUse(binaryRoot())),
    ].filter((version): version is string => Boolean(version))
  );
  const archives = new Set(
    [...installed, state?.availableVersion].filter(
      (version): version is string => Boolean(version)
    )
  );
  await Promise.all([
    removeFoldersBut(join(binaryRoot(), "versions"), builds),
    removeFoldersBut(hubReleasesDir(), archives),
  ]);
}
