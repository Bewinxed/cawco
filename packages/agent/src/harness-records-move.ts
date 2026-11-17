/**
 * CawCo's own records about each harness moved, once, out of the person's
 * agent config dirs into CawCo's data dir (core paths/harnesses.ts
 * `harnessRecordsDir`), as the agent starts:
 * - Claude Code's fleet sidecar, from the user layer (core paths/fleet.ts
 *   `earlierClaudeFleetSidecarFile`) to `claudeFleetSidecarFile`;
 * - pi's fleet sidecar, `cawco-fleet.json` in pi's agent dir, to
 *   `piFleetSidecarFile`;
 * - every `cawco-<name>` file in OpenCode's global config dir to
 *   `opencodeRecordFile(<name>)`.
 *
 * Each old file is read, written at its new path, then removed. When both
 * are there, the new one is what this or a later agent wrote, so it wins and
 * the old one only goes. It runs before anything reads a record, so from then
 * on only the new paths are read. A crash between the write and the removal
 * finds both at the next start, and the new one wins, which is the same file.
 */
import { readdir, readFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { isGone } from "@cawco/core/absent";
import {
  claudeFleetSidecarFile,
  earlierClaudeFleetSidecarFile,
} from "@cawco/core/paths/fleet";
import {
  opencodeRecordFile,
  piAgentDir,
  piFleetSidecarFile,
} from "@cawco/core/paths/harnesses";
import { writeStateFile } from "@cawco/core/state-file";
import { OPENCODE_DIR } from "./harnesses/opencode-plugin";

/** What earlier versions named each of their files in OpenCode's global config dir: `cawco-<name>`. */
const OPENCODE_RECORD_PREFIX = "cawco-";

/** One record's old path and its new one. */
interface RecordMove {
  from: string;
  to: string;
}

/** Whether anything is at `path`. */
const isThere = async (path: string): Promise<boolean> => {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (isGone(error)) {
      return false;
    }
    throw error;
  }
};

/** Each `cawco-<name>` regular file in OpenCode's global config dir, to its record of `<name>`. */
const opencodeMoves = async (): Promise<RecordMove[]> => {
  const entries = await readdir(OPENCODE_DIR, { withFileTypes: true }).catch(
    (error: unknown) => {
      if (isGone(error)) {
        return [];
      }
      throw error;
    }
  );
  return entries
    .filter(
      (entry) => entry.isFile() && entry.name.startsWith(OPENCODE_RECORD_PREFIX)
    )
    .map((entry) => ({
      from: join(OPENCODE_DIR, entry.name),
      to: opencodeRecordFile(entry.name.slice(OPENCODE_RECORD_PREFIX.length)),
    }));
};

/** One record moved: written at its new path when none is there yet, and the old one removed; said when it was there. */
const moveRecord = async ({ from, to }: RecordMove): Promise<void> => {
  let bytes: Buffer;
  try {
    bytes = await readFile(from);
  } catch (error) {
    if (isGone(error)) {
      return;
    }
    throw error;
  }
  const kept = await isThere(to);
  if (!kept) {
    await writeStateFile(to, bytes);
  }
  await rm(from, { force: true });
  console.info(
    kept
      ? `[records] ${from} removed: ${to} was already there`
      : `[records] ${from} moved to ${to}`
  );
};

/** Every harness record earlier versions kept in the person's agent config dirs, moved into CawCo's data dir. */
export const moveHarnessRecords = async (): Promise<void> => {
  const moves: RecordMove[] = [
    { from: earlierClaudeFleetSidecarFile(), to: claudeFleetSidecarFile() },
    { from: join(piAgentDir(), "cawco-fleet.json"), to: piFleetSidecarFile() },
    ...(await opencodeMoves()),
  ];
  for (const move of moves) {
    await moveRecord(move);
  }
};
