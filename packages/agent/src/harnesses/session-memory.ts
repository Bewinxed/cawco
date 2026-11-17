/**
 * What a session reads as its memory at its start, on a harness that takes
 * it as documents (pi's context files, Codex's developer instructions): the
 * fleet's memory file, the memory placed at its folder, and the hub's
 * documents for it, each with the path that names it. A clean session reads
 * none of them; the caller asks only for one that is not.
 */
import { fleetMemoryFile } from "@cawco/core/paths/fleet";
import type { SpawnPayload } from "@cawco/core/protocol";
import { readFleetMemory } from "../fleet-memory";
import { placedMemoryIn } from "../placed-memory";

export const sessionMemory = async (
  spec: Pick<SpawnPayload, "instructions">,
  cwd: string
): Promise<{ content: string; path: string }[]> => {
  const fleetMemory = await readFleetMemory();
  return [
    ...(fleetMemory?.trim()
      ? [{ path: fleetMemoryFile(), content: fleetMemory }]
      : []),
    ...(await placedMemoryIn(cwd)).map(({ file, content }) => ({
      path: file,
      content,
    })),
    ...(spec.instructions ?? []).map(({ path, content }) => ({
      path: `cawco memory: ${path}`,
      content,
    })),
  ];
};
