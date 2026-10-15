/**
 * The files a session in a boundary shows the person (`show_image`'s `path`,
 * `send_to_user`'s `attachments`) that lie in a workspace's scratch dir or
 * clone on its machine: its own workspace's, or one its delegates run in,
 * at any depth, and no other. The workspace's judge hands these to the hub
 * (core workspace-judge.ts `handedToHub`), because only the hub knows a
 * session's delegates; the workspace's own policy never widens. A path in no
 * workspace area was judged by that policy alone, and a session outside any
 * boundary shows what it shows today.
 */
import { workspaceArea } from "@cawco/core/workspace-judge";

/** A work item as this check reads it: the session it runs and the session that delegated it. */
export interface ShownItem {
  readonly instanceId: string;
  readonly parentInstanceId: string | null;
}

export interface ShownDeps {
  /** The workspace a session runs in: its work item's, or a Caw's place; none outside any boundary (server.ts `sessionWorkspace`). */
  readonly boundaryOf: (instanceId: string) => string | undefined;
  /** The machine's home dir, as its daemon reported it. */
  readonly home: (machineId: string) => string | undefined;
  /** The work items a workspace has run. */
  readonly itemsIn: (workspaceId: string) => readonly ShownItem[];
  /** Whether `leadId` leads the project of the item `instanceId` runs (work-items.ts `ledBy`). */
  readonly ledBy: (instanceId: string, leadId: string) => boolean;
  /** The session that delegated the item `instanceId` runs; none for a session no item runs, or one nobody delegated. */
  readonly parentOf: (instanceId: string) => string | undefined;
  /** The workspaces whose id starts with `id8`, with their clone's path. */
  readonly workspaces: (
    id8: string
  ) => readonly { readonly id: string; readonly path: string }[];
}

/** Whether `ancestor` delegated `item`, or delegated the session that did, at any depth. */
const descends = (
  deps: ShownDeps,
  item: ShownItem,
  ancestor: string
): boolean => {
  const seen = new Set<string>();
  let parent = item.parentInstanceId ?? undefined;
  while (parent !== undefined && !seen.has(parent)) {
    if (parent === ancestor) {
      return true;
    }
    seen.add(parent);
    parent = deps.parentOf(parent);
  }
  return false;
};

/** Whether `instanceId` delegated work in `workspaceId`, directly or nested, or leads its project. */
const delegatedIn = (
  deps: ShownDeps,
  instanceId: string,
  workspaceId: string
): boolean =>
  deps
    .itemsIn(workspaceId)
    .some(
      (item) =>
        descends(deps, item, instanceId) ||
        deps.ledBy(item.instanceId, instanceId)
    );

const within = (path: string, root: string): boolean =>
  path === root || path.startsWith(`${root}/`);

/**
 * The refusal for the first of `paths` that `tool` may not show for session
 * `instanceId` on machine `machineId`, said for the model; none when it may
 * show them all.
 */
export const shownRefusal = (
  deps: ShownDeps,
  call: {
    readonly instanceId: string;
    readonly machineId: string;
    readonly paths: readonly string[];
    readonly tool: string;
  }
): string | undefined => {
  const own = deps.boundaryOf(call.instanceId);
  const home = deps.home(call.machineId);
  if (own === undefined || home === undefined) {
    return;
  }
  for (const path of call.paths) {
    const area = workspaceArea(path, home);
    if (!area) {
      continue;
    }
    const owners = deps
      .workspaces(area.id8)
      .filter(
        (workspace) => area.kind === "scratch" || within(path, workspace.path)
      );
    const mine = owners.some(
      (workspace) =>
        workspace.id === own || delegatedIn(deps, call.instanceId, workspace.id)
    );
    if (!mine) {
      const where = area.kind === "scratch" ? "scratch dir" : "clone";
      return `cawco: ${call.tool} was refused: reading ${path} lies in workspace ${area.id8}'s ${where}, which is neither this session's workspace nor one its delegates run in. It shows files it reads, and its delegates' scratch dirs and clones.`;
    }
  }
};
