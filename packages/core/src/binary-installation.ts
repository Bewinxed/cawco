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

export const binaryRoot = (): string =>
  process.env.CAWCO_BINARY_ROOT ??
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
 * Written when a build is swapped in and cleared by that build once it has
 * been healthy for a minute. The service wrapper restores `previous` when a
 * start finds it past its deadline: the recovery for a helper that died after
 * the swap.
 */
export interface TrialMarker {
  /** The hub database copy to restore with `previous`, when the schema changed. */
  dbBackup?: string;
  dbPath?: string;
  /** Unix seconds after which a start that finds this marker puts `previous` back. */
  deadline: number;
  previous: string;
  role: BinaryInstallation["role"];
  swappedAt: number;
  version: string;
}
export const trialPath = (): string => join(binaryRoot(), "trial.json");
export const previousInstallationPath = (): string =>
  join(binaryRoot(), "installation.previous.json");
export const recoveredPath = (): string =>
  join(binaryRoot(), "trial.recovered");
export const readTrial = (): Promise<TrialMarker | undefined> =>
  readJson<TrialMarker>(trialPath());

/**
 * The session keeper's pin: a relative link `<root>/keeper` -> `versions/<v>`,
 * changed only by an atomic rename, like `current`. The keeper's unit runs
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

/** Present only while a keeper move is unconfirmed: what to put back, and when. */
export interface KeeperTrial {
  /** Unix seconds after which a keeper start that finds this puts `from` back. */
  deadline: number;
  from: string;
  to: string;
}
export const keeperTrialPath = (): string =>
  join(binaryRoot(), "keeper-trial.json");
/** The trial's content, left by the wrapper when it put the previous keeper back; the agent reads and removes it. */
export const keeperRecoveredPath = (): string =>
  join(binaryRoot(), "keeper-trial.recovered");
export const readKeeperTrial = (): Promise<KeeperTrial | undefined> =>
  readJson<KeeperTrial>(keeperTrialPath());
export const readKeeperRecovered = (): Promise<KeeperTrial | undefined> =>
  readJson<KeeperTrial>(keeperRecoveredPath());
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
  return lock !== undefined && markerIsLive(lock);
}

/**
 * The update trial of `running` when it is unresolved: its deadline has passed,
 * no keeper move is pending (a failing keeper is not the build's fault) and no
 * helper is live (a live helper owns the outcome). Undefined otherwise.
 */
export async function expiredTrial(
  running: string
): Promise<TrialMarker | undefined> {
  const trial = await readTrial();
  if (
    !trial ||
    trial.version !== running ||
    trial.deadline > Date.now() / 1000
  ) {
    return undefined;
  }
  if ((await readKeeperTrial()) || (await helperIsLive())) {
    return undefined;
  }
  return trial;
}

/**
 * Deletes the directories under `versions/` nothing needs. Kept: what `current`
 * and `keeper` name, what a pending update trial would restore or has swapped
 * in (`trial.json`), what a pending keeper trial names (`keeper-trial.json`),
 * and the build a live helper is applying (named in `apply.lock`). The caller
 * never supplies a keep-list.
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
  const keeperTrial = await readKeeperTrial();
  add(keeperTrial?.from);
  add(keeperTrial?.to);
  const lock = await readJson<
    { version?: string } & Parameters<typeof markerIsLive>[0]
  >(lockFilePath());
  if (lock && (await helperIsLive())) {
    add(lock.version);
  }
  const versions = join(binaryRoot(), "versions");
  const present = await readdir(versions).catch(() => [] as string[]);
  await Promise.all(
    present
      .filter((name) => !(keep.has(name) || name.includes(".partial")))
      .map((name) => rm(join(versions, name), { recursive: true, force: true }))
  );
}
