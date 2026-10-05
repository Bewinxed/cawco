/** Server-only install identity and durable update state of a binary install. */
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { BinaryUpdateState } from "./binary-updates";

export interface BinaryInstallation {
  hubUrl: string;
  installedVersion: string;
  /** Where releases come from, when not GitHub; recorded by the installer. */
  releaseHost?: string;
  role: "hub" | "agent";
  root: string;
  /** Version of the executable the session keeper's unit runs. */
  sessiondVersion: string;
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
