/**
 * This machine's workspace clones, by the records the agent keeps for each
 * outside its clone (`~/.cawco/workspaces/<id>/`): `create.json`, written
 * before the clone is cut, and the running boundary's `boundary.json`.
 */
import { readdir, readFile, realpath } from "node:fs/promises";
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

/** `path` at its real path, links followed; as given when it does not exist. */
const realOf = (path: string): Promise<string> =>
  realpath(path).catch(() => path);

/**
 * The workspace whose clone holds `path`, if one does: the clone itself or
 * any directory inside it, both at their real paths, whole path segments
 * only (`/ws/abc` never holds `/ws/abcd`). Of clones inside one another,
 * the deepest. The bridge plugin's `workspaceOf` (harnesses/opencode.ts)
 * answers by the same rule inside OpenCode's server.
 */
export const workspaceHolding = async (
  path: string
): Promise<WorkspaceRef | undefined> => {
  const at = await realOf(path);
  const clones = await Promise.all(
    (await workspaceRefs()).map(async (ref) => ({
      ref,
      root: await realOf(ref.path),
    }))
  );
  return clones
    .filter(({ root }) => at === root || at.startsWith(`${root}/`))
    .sort((a, b) => b.root.length - a.root.length)[0]?.ref;
};
