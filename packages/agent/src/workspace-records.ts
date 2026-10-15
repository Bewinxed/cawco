/**
 * This machine's workspace clones, by the records the agent keeps for each
 * outside its clone (`~/.cawco/workspaces/<id>/`): `create.json`, written
 * before the clone is cut, and the running boundary's `boundary.json`.
 */
import { readdir, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { join, relative, sep } from "node:path";
import type { WorkspaceRef } from "@cawco/core";
import { workspacesDir } from "@cawco/core/paths";
import {
  type DamagedRecord,
  isDamagedRecord,
  readRecord,
} from "@cawco/core/state-file";
import { isLeadPlace } from "@cawco/core/workspace-policy";
import { reportDamaged } from "./damaged-records";

interface Scan {
  refs: WorkspaceRef[];
  /** Workspaces neither of whose records names a clone because one is damaged, with that damage. */
  unread: { id: string; damage: DamagedRecord }[];
}

/**
 * One workspace's clone path: the first of its two records that names one.
 * A damaged record is reported ({@link reportDamaged}) and the other one
 * read; with no path from either, the damage is the answer.
 */
const pathOf = async (
  id: string
): Promise<string | DamagedRecord | undefined> => {
  let damage: DamagedRecord | undefined;
  for (const name of ["create.json", "boundary.json"]) {
    try {
      // biome-ignore lint/performance/noAwaitInLoops: the first of two records that names the clone
      const record = await readRecord<{ path?: unknown }>(
        join(workspacesDir(), id, name)
      );
      if (typeof record?.path === "string") {
        return record.path;
      }
    } catch (error) {
      if (!isDamagedRecord(error)) {
        console.warn(
          `[workspace] ${id}: its ${name} could not be read: ${error instanceof Error ? error.message : String(error)}`
        );
        continue;
      }
      await reportDamaged(error);
      damage ??= error;
    }
  }
  return damage;
};

const scan = async (): Promise<Scan> => {
  const ids = await readdir(workspacesDir()).catch(() => [] as string[]);
  const found = await Promise.all(
    ids.map(async (id) => ({ id, path: await pathOf(id) }))
  );
  const scanned: Scan = { refs: [], unread: [] };
  for (const { id, path } of found) {
    if (typeof path === "string") {
      scanned.refs.push({ id, path });
    } else if (path) {
      scanned.unread.push({ id, damage: path });
    }
  }
  return scanned;
};

/**
 * Every workspace this machine holds whose records name its clone. One whose
 * records are damaged is reported and left out: every other one is here.
 */
export const workspaceRefs = async (): Promise<WorkspaceRef[]> =>
  (await scan()).refs;

/** `path` at its real path, links followed; as given when it does not exist. */
const realOf = (path: string): Promise<string> =>
  realpath(path).catch(() => path);

/**
 * Whether `at` is inside a clone cut for workspace `id`: every clone is cut
 * at `~/.worktrees/<repo>-<id8>` (workspace.ts `createWorkspace`).
 */
const insideCloneOf = async (at: string, id: string): Promise<boolean> => {
  const rel = relative(await realOf(join(homedir(), ".worktrees")), at);
  const [top] = rel.split(sep);
  return (
    !rel.startsWith("..") &&
    Boolean(top) &&
    (top ?? "").endsWith(`-${id.slice(0, 8)}`)
  );
};

/**
 * The workspace whose clone holds `path`, if one does: the clone itself or
 * any directory inside it, both at their real paths, whole path segments
 * only (`/ws/abc` never holds `/ws/abcd`). Of clones inside one another,
 * the deepest. The bridge plugin's `workspaceOf` (harnesses/opencode.ts)
 * answers by the same rule inside OpenCode's server.
 *
 * A path inside the clone of a workspace whose records are damaged, so that
 * none names its clone, is that workspace's too: the damage is thrown, and
 * what asked does not run there outside its boundary.
 */
export const workspaceHolding = (
  path: string
): Promise<WorkspaceRef | undefined> => holding(path, () => true);

/**
 * The boundary a spawn that names none runs in: a delegation workspace's,
 * when `path` is inside its clone ({@link workspaceHolding}), and never a
 * project lead's place. A lead's place is a person's own folder (core
 * `isLeadPlace`), bounded only for the lead's own row, which the hub names
 * on every spawn of it (hub caw.ts `leadPlaceRef`); a person's session in
 * that folder runs on the host.
 */
export const cloneHolding = (path: string): Promise<WorkspaceRef | undefined> =>
  holding(path, (ref) => !isLeadPlace(ref.id));

/** {@link workspaceHolding} over the workspaces `take` keeps. */
const holding = async (
  path: string,
  take: (ref: WorkspaceRef) => boolean
): Promise<WorkspaceRef | undefined> => {
  const at = await realOf(path);
  const { refs, unread } = await scan();
  const clones = await Promise.all(
    refs
      .filter(take)
      .map(async (ref) => ({ ref, root: await realOf(ref.path) }))
  );
  const held = clones
    .filter(({ root }) => at === root || at.startsWith(`${root}/`))
    .sort((a, b) => b.root.length - a.root.length)[0]?.ref;
  if (held) {
    return held;
  }
  for (const { id, damage } of unread) {
    // biome-ignore lint/performance/noAwaitInLoops: none or a few damaged workspaces
    if (await insideCloneOf(at, id)) {
      throw damage;
    }
  }
};
