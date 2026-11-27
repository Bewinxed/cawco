/**
 * Whether a folder stands at a path on a machine, as the machine reads it
 * (core `CONTROL_FOLDERS_STAND`, which records each one standing as seen
 * there: agent seen-folders.ts). Read for a checkout at each register
 * (machine-commands.ts `learnCheckout`) and for Locate folder's old and new
 * folders (project-locate.ts).
 */
import { CONTROL_FOLDERS_STAND } from "@cawco/core/workspace/controls";
import type { MachineRead } from "./machine-answers";

/** Whether a folder stands at `path` on `machineId`; undefined when the machine did not say (away, silent, or an agent that predates the read). */
export const folderStandsOn = async (
  read: MachineRead,
  machineId: string,
  path: string,
  /** Its asker's: the machine's read is let go once it aborts. */
  signal: AbortSignal
): Promise<boolean | undefined> => {
  const answer = await read(machineId, CONTROL_FOLDERS_STAND, [[path]], {
    caller: "whether a folder stands",
    signal,
  });
  return answer.kind === "answered" && answer.value.ok
    ? answer.value.result[0]
    : undefined;
};
