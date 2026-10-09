/** Server-only install identity and durable update state of a binary install. */
import {
  mkdir,
  readdir,
  readFile,
  readlink,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { BinaryUpdateState } from "./binary-updates";
import { versionsInUse } from "./live-processes";
import { markerIsLive } from "./process-identity";
import type { ReleaseManifest } from "./release-manifest";
import { runtimeVersion } from "./runtime";

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

export async function writeJsonAtomic(
  path: string,
  value: unknown
): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value)}\n`, { mode: 0o600 });
  await rename(temporary, path);
}

async function readJson<T>(path: string): Promise<T | undefined> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

export const readInstallation = (): Promise<BinaryInstallation | undefined> =>
  readJson<BinaryInstallation>(installationPath());
export const readUpdateState = (): Promise<BinaryUpdateState | undefined> =>
  readJson<BinaryUpdateState>(updateStatePath());

/** The signed manifest of the build this process is running, as the installer or the updater staged it. */
export async function readRunningManifest(): Promise<ReleaseManifest> {
  const manifest = await readJson<ReleaseManifest>(
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
  readJson<TrialMarker>(trialPath());
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
): ("hub" | "dashboard" | "agent")[] =>
  role === "hub" ? ["agent", "hub", "dashboard"] : ["agent"];

/**
 * Which build's session keeper is the machine's current one: a relative link
 * `<root>/keeper` -> `versions/<v>`, changed only by an atomic rename, like
 * `current`, and only by a keeper handover (`cawco binary-apply`). The keeper
 * of that build runs in a job of its own, from `versions/<v>/cawco`, and the
 * machine's endpoint names it (keepers.ts). A legacy keeper's unit runs
 * `<root>/run sessiond`, which execs through this link.
 */
const VERSIONS_PREFIX = /^versions\//;
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

/** Whether an update helper is running: the lock names a process that is still the one that wrote it. */
export async function helperIsLive(): Promise<boolean> {
  const lock = await readJson<Parameters<typeof markerIsLive>[0]>(
    lockFilePath()
  );
  return lock !== undefined && (await markerIsLive(lock));
}

/**
 * Deletes the directories under `versions/` nothing needs. Kept: what `current`
 * and `keeper` name, what a pending update trial would restore or has swapped
 * in (`trial.json`), the build a live helper is applying (named in
 * `apply.lock`), and every build a live process runs or names
 * ({@link versionsInUse}): a unit still on a build the links have left, a
 * retiring keeper and its children, and the hooks baked into their CLI
 * settings. The caller never supplies a keep-list.
 */
export async function prune(): Promise<void> {
  const keep = new Set<string>();
  const add = (version: string | undefined) => {
    if (version) {
      keep.add(version);
    }
  };
  add(await linkedVersion(join(binaryRoot(), "current")));
  add(await linkedVersion(keeperPath()));
  const trial = await readTrial();
  add(trial?.previous);
  add(trial?.version);
  const lock = await readJson<
    { version?: string } & Parameters<typeof markerIsLive>[0]
  >(lockFilePath());
  if (lock && (await helperIsLive())) {
    add(lock.version);
  }
  for (const version of await versionsInUse(binaryRoot())) {
    add(version);
  }
  const versions = join(binaryRoot(), "versions");
  const present = await readdir(versions).catch(() => [] as string[]);
  await Promise.all(
    present
      .filter((name) => !(keep.has(name) || name.includes(".partial")))
      .map((name) => rm(join(versions, name), { recursive: true, force: true }))
  );
}
