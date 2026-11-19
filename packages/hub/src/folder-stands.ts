/**
 * Whether a folder stands at a path on a machine, as the machine reads it
 * (core `CONTROL_FOLDERS_STAND`, which records each one standing as seen
 * there: agent seen-folders.ts). Read for a checkout at each register
 * (machine-commands.ts `learnCheckout`) and for Locate folder's old and new
 * folders (project-locate.ts).
 */
import { CONTROL_FOLDERS_STAND } from "@cawco/core/workspace/controls";
import type { AgentCall } from "./machine-answers";
import { READ_TIMEOUT_MS } from "./machine-read-timeouts";

/** Whether a folder stands at `path` on `machineId`; undefined when the machine did not say (away, silent, or an agent that predates the read). */
export const folderStandsOn = async (
  readAgent: AgentCall,
  machineId: string,
  path: string
): Promise<boolean | undefined> => {
  const answer = await readAgent(
    machineId,
    CONTROL_FOLDERS_STAND,
    [[path]],
    READ_TIMEOUT_MS
  );
  return answer.kind === "answered" && answer.value.ok
    ? answer.value.result[0]
    : undefined;
};
