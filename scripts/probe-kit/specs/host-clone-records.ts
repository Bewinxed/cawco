/**
 * What a host-scope delegate's folder is refused for, as the machine's own
 * records say it (hub work-items.ts `hostFolderProblem` asks agent
 * workspace-records.ts `cloneHolding`), read in process under a scratch
 * HOME. The round trip through the hub is host-delegates' h8, on the host.
 *
 * - c1. A folder inside a clone the machine's records hold, at the path a
 *   clone is cut at (`~/.worktrees/<repo>-<id8>`, agent layer.ts
 *   `clonePath`), is that workspace's: a session there runs in its boundary,
 *   so host scope there is refused.
 * - c2. A folder under a recorded path anywhere else, with no layer, is a
 *   person's folder (3235d847b: a Linux view's path, once its layer is
 *   gone): no workspace holds it, and a host delegate may run there.
 *
 *   bun scripts/probe-kit/run.ts host-clone-records
 */
import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { cloneHolding } from "../../../packages/agent/src/workspace-records";
import type { Kit, Spec } from "../spec";

/** Workspace `id`'s records under the scratch HOME, its `create.json` naming `path`, and a folder inside `path`. */
const recorded = async (id: string, path: string): Promise<string> => {
  const records = join(homedir(), ".cawco", "workspaces", id);
  const deep = join(path, "deep");
  await mkdir(deep, { recursive: true });
  await mkdir(records, { recursive: true });
  await writeFile(
    join(records, "create.json"),
    `${JSON.stringify({ path })}\n`
  );
  return deep;
};

const spec: Spec = {
  group: "Workspaces and what agents may touch",
  name: "host-clone-records",
  ownHome: "the machine's records and clones go under its HOME",
  run: async ({ check }: Kit) => {
    const id = crypto.randomUUID();
    const clone = join(homedir(), ".worktrees", `recorded-${id.slice(0, 8)}`);
    const held = await cloneHolding(await recorded(id, clone));
    check(
      "c1: a folder inside a recorded clone at ~/.worktrees/<repo>-<id8> is that workspace's",
      held?.id === id && held.path === clone,
      JSON.stringify(held)
    );
    const free = await cloneHolding(
      await recorded(crypto.randomUUID(), join(homedir(), "projects", "mine"))
    );
    check(
      "c2: a folder under a recorded path elsewhere, with no layer, is no workspace's",
      free === undefined,
      JSON.stringify(free)
    );
    const another = crypto.randomUUID();
    const borrowed = await cloneHolding(
      await recorded(
        crypto.randomUUID(),
        join(homedir(), ".worktrees", `recorded-${another.slice(0, 8)}`)
      )
    );
    check(
      "c2: a recorded path under ~/.worktrees whose id8 is not its own workspace's is no workspace's",
      borrowed === undefined,
      JSON.stringify(borrowed)
    );
  },
};

export default spec;
