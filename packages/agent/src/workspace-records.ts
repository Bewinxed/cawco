/**
 * This machine's workspace clones, by the records the agent keeps for each
 * outside its clone (`~/.cawco/workspaces/<id>/`): `create.json`, written
 * before the clone is cut, and the running boundary's `boundary.json`.
 */
import { readdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { WorkspaceRef } from "@cawco/core";

/** Every workspace this machine holds, with its clone's path. */
export const workspaceRefs = async (): Promise<WorkspaceRef[]> => {
  const state = join(homedir(), ".cawco", "workspaces");
  const ids = await readdir(state).catch(() => [] as string[]);
  const refs = await Promise.all(
    ids.map(async (id): Promise<WorkspaceRef | undefined> => {
      for (const name of ["create.json", "boundary.json"]) {
        // biome-ignore lint/performance/noAwaitInLoops: the first of two records that names the clone
        const text = await readFile(join(state, id, name), "utf8").catch(
          () => undefined
        );
        const path = text
          ? (JSON.parse(text) as { path?: unknown }).path
          : undefined;
        if (typeof path === "string") {
          return { id, path };
        }
      }
    })
  );
  return refs.filter((ref): ref is WorkspaceRef => Boolean(ref));
};

/** The workspace whose clone holds `path`, if one does. */
export const workspaceHolding = async (
  path: string
): Promise<WorkspaceRef | undefined> =>
  (await workspaceRefs()).find(
    (ref) => path === ref.path || path.startsWith(`${ref.path}/`)
  );
