import { mkdir, readFile, rename } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { ClaudeFileWatermark } from "./types";

/**
 * Watermark persistence for the incremental scan (USAGE-SPEC.md §5.1). Lives
 * under the agent's data dir so a restart is cheap: if the file is missing,
 * corrupt, or its schema version differs, the caller does a full rebuild rather
 * than trusting stale offsets.
 */

const SCHEMA_VERSION = 1;
const FILE_NAME = "usage-index.json";

export interface UsageIndex {
  /** Absolute transcript path → watermark. */
  claude: Record<string, ClaudeFileWatermark>;
  /** opencode watermark: the highest `time_created` already consumed. */
  opencode: { maxTimeCreated: number } | null;
  schemaVersion: number;
}

export const emptyIndex = (): UsageIndex => ({
  schemaVersion: SCHEMA_VERSION,
  claude: {},
  opencode: null,
});

/**
 * The agent keeps no other per-machine state of its own, so the usage index
 * gets a fresh dir under the XDG data home (USAGE-SPEC.md §5.1's fallback).
 */
export const usageIndexPath = (): string =>
  join(
    process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share"),
    "cawco",
    FILE_NAME
  );

/** Loads the index, or null when it is missing/corrupt/from another version. */
export const loadIndex = async (): Promise<UsageIndex | null> => {
  let raw: string;
  try {
    raw = await readFile(usageIndexPath(), "utf8");
  } catch {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  const idx = parsed as Partial<UsageIndex>;
  if (
    idx.schemaVersion !== SCHEMA_VERSION ||
    typeof idx.claude !== "object" ||
    idx.claude === null ||
    Array.isArray(idx.claude)
  ) {
    return null;
  }

  const claude: Record<string, ClaudeFileWatermark> = {};
  for (const [path, wm] of Object.entries(
    idx.claude as Record<string, unknown>
  )) {
    const w = wm as Partial<ClaudeFileWatermark>;
    if (
      typeof w.mtimeMs !== "number" ||
      typeof w.size !== "number" ||
      typeof w.offset !== "number"
    ) {
      return null;
    }
    claude[path] = { mtimeMs: w.mtimeMs, size: w.size, offset: w.offset };
  }

  const o = idx.opencode as Partial<UsageIndex["opencode"]> | null | undefined;
  const opencode =
    o && typeof o.maxTimeCreated === "number"
      ? { maxTimeCreated: o.maxTimeCreated }
      : null;

  return { schemaVersion: SCHEMA_VERSION, claude, opencode };
};

/** Written whole and moved into place: a half-written index is a full rebuild. */
export const saveIndex = async (index: UsageIndex): Promise<void> => {
  const path = usageIndexPath();
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.cawco-${process.pid}`;
  await Bun.write(temp, JSON.stringify(index));
  await rename(temp, path);
};
