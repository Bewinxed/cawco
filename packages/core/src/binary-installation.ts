/** Server-only install identity and durable update state of a binary install. */
import type { Dirent } from "node:fs";
import { readdir, readlink, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import { z } from "zod";
import { AGENT_BUNDLE, AGENT_BUNDLE_EXECUTABLE } from "./agent-bundle";
import type { BinaryUpdateState } from "./binary-updates";
import { folderBytes } from "./folder-bytes";
import { makeFolder } from "./folders";
import { foldersHeldOpen, versionsInUse } from "./live-processes";
import { hubDbPath } from "./paths/hub";
import { markerIsLive, ProcessMarkerSchema } from "./process-identity";
import type { ReleaseManifest } from "./release-manifest";
import { runtimeRoot, runtimeVersion } from "./runtime";
import { readRecord, writeStateFile } from "./state-file";
import {
  BinaryUpdateStateSchema,
  ReleaseManifestSchema,
} from "./stored-shapes";
import { sizeWords } from "./words/workspace-holding";

const BinaryInstallationSchema = z.object({
  /** Where this machine's dashboard answers, when it runs one. */
  dashboardUrl: z.string().optional(),
  hubUrl: z.string(),
  installedVersion: z.string(),
  /** Where releases come from, when not GitHub; recorded by the installer. */
  releaseHost: z.string().optional(),
  role: z.enum(["hub", "agent"]),
  root: z.string(),
});
export type BinaryInstallation = z.infer<typeof BinaryInstallationSchema>;

/**
 * The binary install of the data dir this process runs with, and the only
 * derivation of it: every updater, helper, wrapper and installer read and
 * write goes through here. A unit is given its data dir as `XDG_DATA_HOME`
 * (agent service-manager/units.ts `environment`), so a process started with a scratch data dir
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
  await makeFolder(dirname(path), { mode: 0o700 });
  await writeStateFile(path, `${JSON.stringify(value)}\n`, { mode: 0o600 });
}

export const readInstallation = (): Promise<BinaryInstallation | undefined> =>
  readRecord(installationPath(), BinaryInstallationSchema);
export const readUpdateState = (): Promise<BinaryUpdateState | undefined> =>
  readRecord(updateStatePath(), BinaryUpdateStateSchema);

/** The signed manifest of the build this process is running, as the installer or the updater staged it. */
export async function readRunningManifest(): Promise<ReleaseManifest> {
  const manifest = await readRecord(
    join(versionDirectory(runtimeVersion), "release.json"),
    ReleaseManifestSchema
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
const TrialMarkerSchema = z.object({
  /** The hub database copy a rollback restores: made on every update of the hub's machine (cli binary-apply.ts `backUpDatabase`). */
  dbBackup: z.string().optional(),
  dbPath: z.string().optional(),
  /** A rollback has put the database copy in place: a resumed one does not do it again over the previous build's writes. */
  dbRestored: z.boolean().optional(),
  /** Unix seconds by which the build must be healthy, or it is rolled back. A migration moves it. */
  decideBy: z.number().optional(),
  /**
   * Written before either is carried out, so a decider that resumes finishes
   * the one already begun rather than deciding again.
   */
  decision: z.enum(["confirm", "roll-back"]).optional(),
  /** The keeper handover is done and the state says installed: a resumed helper does not hand it over again. */
  keeperDone: z.boolean().optional(),
  /** The rollback's reason is the hub's silence, not the build's own fault (cli binary-health.ts `HealthProblem`). */
  hubSilent: z.literal(true).optional(),
  previous: z.string(),
  /** Why a rollback was decided: the problem that stood at the deadline. */
  reason: z.string().optional(),
  /** How many resumed helpers in a row failed to decide it (cli binary-apply.ts `RESUME_TRIES` ends it). */
  resumesFailed: z.number().int().nonnegative().optional(),
  role: BinaryInstallationSchema.shape.role,
  /**
   * How long this machine slept during the trial, in milliseconds (core
   * awake-time.ts): each sleep moved `decideBy` out by its length. A rollback
   * on the hub's silence after any sleep is no trial of the build's at all
   * (core binary-updates.ts `rolledBack`).
   */
  sleptMs: z.number().nonnegative().optional(),
  /** Unix seconds: units started after this run the trial build. */
  swappedAt: z.number(),
  version: z.string(),
});
export type TrialMarker = z.infer<typeof TrialMarkerSchema>;
export const trialPath = (): string => join(binaryRoot(), "trial.json");
export const readTrial = (): Promise<TrialMarker | undefined> =>
  readRecord(trialPath(), TrialMarkerSchema);
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
 * (boundary/control.ts `rearmHooks`), and until it does, a CLI it holds runs the hook
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
  const lock = await readRecord(
    lockFilePath(),
    ProcessMarkerSchema.extend({ version: z.string().optional() })
  );
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
 * How many installed builds a machine keeps: the one installed and the one
 * installed before it, in `versions/`, in `runtime/` and, on the hub's
 * machine, in the hub's archive cache ({@link hubReleasesDir}).
 */
const KEPT_INSTALLS = 2;

/**
 * The builds this machine installed, in the order it installed them, newest
 * last, at most {@link KEPT_INSTALLS}: what {@link prune} keeps by install
 * order. Written only by {@link recordInstall}: by the installer's
 * `binary-install` for the build it installs, and by an update helper when it
 * confirms a build. Never read from version names: a nightly's and a
 * stable's do not sort by when they went on.
 */
const installOrderPath = (): string => join(binaryRoot(), "install-order.json");
const readInstallOrder = async (): Promise<string[]> =>
  ((await readRecord(installOrderPath(), z.array(z.string()))) ?? []).slice(
    -KEPT_INSTALLS
  );

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
 * (paths/hub.ts `hubUpdatePolicyPath`). Only on the hub's machine does it exist.
 */
export const hubReleasesDir = (): string =>
  join(dirname(hubDbPath()), "binary-releases");

/** One folder of builds a prune went through: what it held, by build, sorted into what goes and what stays. */
interface PrunedPlace {
  dir: string;
  kept: string[];
  removed: string[];
}

/** The folders in `dir`, sorted by `keep`; unfinished folders (`.partial`) are in neither, and stay. */
async function sortFolders(
  dir: string,
  keep: ReadonlySet<string>
): Promise<PrunedPlace> {
  const present = (
    await readdir(dir, { withFileTypes: true }).catch((): Dirent[] => [])
  )
    .filter((entry) => entry.isDirectory() && !entry.name.includes(".partial"))
    .map((entry) => entry.name)
    .sort();
  return {
    dir,
    kept: present.filter((name) => keep.has(name)),
    removed: present.filter((name) => !keep.has(name)),
  };
}

/** The folders that hold a build each, by its version: its executable's (`versions/`) and its runtime folder's ({@link runtimeRoot}). */
const buildFolders = (): string[] => [
  join(binaryRoot(), "versions"),
  runtimeRoot(),
];

/** The builds whose runtime folder a live process holds open (runtime.ts `holdRuntime`): every standalone process holds its own, wherever it was started from. */
async function runtimesHeld(): Promise<string[]> {
  const present = await readdir(runtimeRoot(), { withFileTypes: true }).catch(
    (): Dirent[] => []
  );
  const held = await foldersHeldOpen(
    present
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(runtimeRoot(), entry.name))
  );
  return [...held].map((folder) => basename(folder));
}

/**
 * The builds this machine keeps, in every folder of builds
 * ({@link buildFolders}) alike: a build's executable and its runtime folder
 * stay and go together, since a process of `versions/<v>/` reads
 * `runtime/<v>/` and publishes it again when it is missing. Kept: the builds
 * of the install order ({@link readInstallOrder}: the installed one and the
 * one installed before it), what `current` and `keeper` name, what a pending
 * update trial would restore or has swapped in (`trial.json`), the build a
 * live helper is applying (named in `apply.lock`), the build staged for an
 * install no helper has taken up yet ({@link STAGED_PHASES}: a prune while it
 * waits, a retiring keeper's removal among them, left its helper no build to
 * apply), and every build a live process runs from, names in either folder
 * ({@link versionsInUse}) or holds the runtime folder of ({@link runtimesHeld}):
 * a unit still on a build the links have left, a retiring keeper and its
 * sessions, the hooks baked into their CLI settings, a workspace's srt host
 * and its ripgrep, which run on from the runtime folder of the build that
 * started them, and a build run from outside `versions/`. Such a build stays
 * while its process lives: the agent prunes again when it removes a retiring
 * keeper that holds nothing (binary-update.ts `#tendKeepers`), and that
 * prune deletes it.
 */
async function keptBuilds(
  state: BinaryUpdateState | undefined,
  installed: readonly (string | undefined)[]
): Promise<Set<string>> {
  const trial = await readTrial();
  return new Set(
    [
      ...installed,
      await linkedVersion(keeperPath()),
      trial?.previous,
      trial?.version,
      (await liveHelper())?.version,
      state && STAGED_PHASES.has(state.phase)
        ? state.availableVersion
        : undefined,
      ...(await versionsInUse(buildFolders())),
      ...(await runtimesHeld()),
    ].filter((version): version is string => Boolean(version))
  );
}

/** What a {@link prune} removed and kept in each place, and the bytes on disk of each side, read before anything went. */
export interface PruneReport {
  keptBytes: number;
  places: PrunedPlace[];
  removedBytes: number;
}

/**
 * Deletes the builds nothing keeps, and says what it removed and kept
 * ({@link pruneLine}). In `versions/` and the runtime folders' root, every
 * build but those {@link keptBuilds} names: one rule for both, so a machine
 * that held hundreds of runtime folders is cleared by its next prune (the
 * agent's once at its start, binary-update.ts `#pruneAtStart`, and at a
 * confirmed or rolled-back trial, a keeper handed over alone, a retiring
 * keeper removed).
 *
 * In the hub's archive cache ({@link hubReleasesDir}), which no process runs
 * from (the hub reads an archive only to serve it, and fetches one it lacks
 * again), kept: the install order, what `current` names, and the update
 * state's `availableVersion` (the build this machine is fetching or holds
 * staged through the hub). The caller never supplies a keep-list.
 */
export async function prune(): Promise<PruneReport> {
  const state = await readUpdateState();
  const installed = [
    ...(await readInstallOrder()),
    await linkedVersion(currentDirectory()),
  ];
  const builds = await keptBuilds(state, installed);
  const archives = new Set(
    [...installed, state?.availableVersion].filter(
      (version): version is string => Boolean(version)
    )
  );
  const places = await Promise.all([
    ...buildFolders().map((folder) => sortFolders(folder, builds)),
    sortFolders(hubReleasesDir(), archives),
  ]);
  const paths = (pick: "kept" | "removed"): string[] =>
    places.flatMap((place) => place[pick].map((name) => join(place.dir, name)));
  const removed = paths("removed");
  const [keptBytes, removedBytes] = await Promise.all([
    folderBytes(paths("kept")),
    folderBytes(removed),
  ]);
  await Promise.all(
    removed.map((path) => rm(path, { recursive: true, force: true }))
  );
  return { keptBytes, places, removedBytes };
}

/** How many build names a {@link pruneLine} spells out on each side before it counts the rest. */
const NAMED_BUILDS = 8;

/**
 * A prune's journal line: on each side the folders by place, their bytes, and
 * the builds they belong to. "removed 80 folders (runtime/ 40, versions/ 40)
 * of 40 builds, 6.1 GB: 0.0.0-stale.1, … and 32 more; kept 3 folders
 * (runtime/ 2, versions/ 1) of 2 builds, 312 MB: 0.0.0-held-open,
 * 0.1.13-nightly.8241".
 */
export const pruneLine = (report: PruneReport): string => {
  const said = (pick: "kept" | "removed", bytes: number): string => {
    const counted = report.places.filter((place) => place[pick].length > 0);
    const folders = counted.reduce((sum, place) => sum + place[pick].length, 0);
    if (folders === 0) {
      return `${pick} nothing`;
    }
    const builds = [...new Set(counted.flatMap((place) => place[pick]))].sort();
    const named = builds.slice(0, NAMED_BUILDS).join(", ");
    const more =
      builds.length > NAMED_BUILDS
        ? ` and ${builds.length - NAMED_BUILDS} more`
        : "";
    const where = counted
      .map((place) => `${basename(place.dir)}/ ${place[pick].length}`)
      .join(", ");
    return `${pick} ${folders} folder${folders === 1 ? "" : "s"} (${where}) of ${builds.length} build${builds.length === 1 ? "" : "s"}, ${sizeWords(bytes)}: ${named}${more}`;
  };
  return `${said("removed", report.removedBytes)}; ${said("kept", report.keptBytes)}`;
};
