/**
 * The fleet's main memory as a session takes it at its launch: the file the
 * fleet sync writes (fleet.ts `syncMemory`, core `fleetMemoryFile`), a file
 * of CawCo's own that no harness reads of its own accord. Each harness hands
 * it to its sessions through its own channel: Claude Code's system prompt
 * (claude.ts `withInstructions`), OpenCode's instruction entries
 * (opencode-session.ts `instructionEntries`), pi's context files
 * (pi-runtime.ts `loaderSources`).
 */
import { fleetMemoryFile } from "@cawco/core/paths/fleet";

/** The fleet's main memory as the last sync wrote it; none when it keeps none, or when it cannot be read (said on the log). */
export const readFleetMemory = async (): Promise<string | undefined> => {
  const file = Bun.file(fleetMemoryFile());
  try {
    return (await file.exists()) ? await file.text() : undefined;
  } catch (error) {
    console.warn(
      `[fleet] ${fleetMemoryFile()} was not read, so sessions start without the fleet's memory: ${error instanceof Error ? error.message : String(error)}`
    );
  }
};
