/**
 * A project deleted for good (`POST /api/projects/:id/delete`): after it,
 * nothing CawCo holds of the project remains. A live project and one in the
 * trash (project-trash.ts) are deleted alike, from what the hub and the
 * trash's records hold of it.
 *
 * Without `fromDisk` it removes: the project's rows, every one a forget
 * would keep (db forget.ts), and no record of them; its folder on the hub;
 * every trash entry of it; its browsers, their profiles (its sign-ins) with
 * them (browsers.ts `remove`); its workspaces' clones (`unlanded: "drop"`:
 * nothing read, nothing carried) and the carries earlier ones left; its work
 * items and workspace rows; and its sessions' hub records (a session's
 * `delete` end). With `fromDisk` it also removes its places on disk on
 * every machine, its checkouts and folders (core `CONTROL_REMOVE_FOLDER`),
 * and its sessions' transcripts (a session's `delete-transcript` end).
 *
 * What it refuses, in core's words (words/project-trash.ts), before anything
 * is removed:
 * - a session of it still running: they stop first, as a forget's do;
 * - with `fromDisk`, a place of it that is a live project's checkout too,
 *   or holds one, on the same machine: removing it would remove that
 *   project's files whole (core place-nesting.ts). A place inside a live
 *   project's wider checkout goes, and the files box names that project
 *   beside it, as losing those files too. Every path removed is one of the
 *   project's own recorded places, and its machine holds it to a floor of
 *   its own (agent remove-folder.ts);
 * - a machine that holds something of it to remove and is not connected.
 *   Of what a machine is told to remove, only a session's end has an owed
 *   rule: its end intent is kept on its row and delivered at the machine's
 *   next register (session-lifecycle.ts). A browser, a workspace's clone and
 *   a folder have none, and a removal owed past the project's own rows could
 *   no longer be held to its places. So sessions wait for their machine as
 *   every session's end does, and anything else on a machine that is away
 *   refuses the delete, naming the machine; nothing is removed, and the
 *   person deletes it again once the machine is back. A machine removed from
 *   the fleet holds nothing CawCo can reach and is passed over.
 *
 * Machines first, then the hub: a removal a machine refuses or fails stops
 * the delete there, in words naming it, the hub's rows kept, so deleting it
 * again finishes it (each removal finds nothing left of what went before).
 */

import type { BrowserKey } from "@cawco/core/browser";
import { projectTrashWords } from "@cawco/core/words/project-trash";
import {
  CONTROL_REMOVE_FOLDER,
  CONTROL_WORKSPACE_ARCHIVE,
  type RemoveFolder,
  type WorkspaceArchive,
} from "@cawco/core/workspace/controls";
import { ElysiaStatus } from "elysia";
import type { DbShape } from "./db";
import type { HeldSession, HeldWorkspace } from "./db/project-work";
import { deleteProjectFolder } from "./project-folder";
import { projectRefusalOf } from "./project-refusal";
import {
  type DiskPlace,
  diskPlaces,
  purgeTrash,
  recordedPlaces,
  trashedProject,
} from "./project-trash";
import { StatusRefusal } from "./refusal";

/** What a delete removed on one machine, by kind. */
export interface MachineRemoved {
  browsers: number;
  carries: number;
  places: number;
  sessions: number;
  workspaces: number;
}

/** What a delete removed, on the hub and on each machine (by its name). */
export interface ProjectDeleted {
  fromDisk: boolean;
  hub: {
    /** Its folder on the hub went. */
    folder: boolean;
    /** Its rows, every one a forget would have kept. */
    rows: number;
    /** Its trash entries. */
    trash: number;
  };
  id: string;
  machines: Record<string, MachineRemoved>;
  name: string;
}

/** A delete the hub turns down: its status, and the words the caller reads. */
export class DeleteRefusal extends StatusRefusal<404 | 409 | 502> {}

/** A machine kept a workspace's clone: its agent predates deleting one (`held`), so it is updated first. */
class AgentTooOld extends Error {
  constructor() {
    super("its agent predates deleting a project for good");
  }
}

/** One removal on a machine: what it removes, counted under `kind`. */
interface Removal {
  kind: Exclude<keyof MachineRemoved, "sessions">;
  machineId: string;
  run: () => Promise<unknown>;
  /** What it removes, as the refusal names it. */
  what: string;
}

export interface ProjectDeleteDeps {
  /** A machine call's answer, or its failure thrown in words. */
  call: (
    machineId: string,
    method: string,
    args: unknown[]
  ) => Promise<unknown>;
  db: Pick<
    DbShape,
    | "browsers"
    | "forgetProject"
    | "listAgents"
    | "listProjects"
    | "project"
    | "projectWork"
  >;
  /** A session's end, kept on its row until its machine confirms it (server.ts `endSession`). */
  endSession: (
    instanceId: string,
    intent: "delete" | "delete-transcript"
  ) => void;
  machineName: (machineId: string) => string;
  online: (machineId: string) => boolean;
  /** A browser removed on its machine, its profile with it (browsers.ts `remove`). */
  removeBrowser: (key: BrowserKey, machineId: string) => Promise<void>;
  /** How many of the project's sessions still run (project-stops.ts). */
  stillRunning: (projectId: string) => number;
}

/** Everything a delete removes of a project, read before anything goes. */
interface Plan {
  browsers: { key: BrowserKey; machineId: string }[];
  /** Its places on disk, removed with `fromDisk`. */
  places: DiskPlace[];
  sessions: HeldSession[];
  workspaces: HeldWorkspace[];
}

export const projectDelete = (deps: ProjectDeleteDeps) => {
  const { db } = deps;

  /** What project `id` holds, live and in the trash, on machines still in the fleet. */
  const planOf = (
    id: string,
    trashed: Awaited<ReturnType<typeof trashedProject>>
  ): Plan => {
    const joined = new Set(db.listAgents().map((agent) => agent.machineId));
    const recorded = recordedPlaces(db, id, trashed);
    const { sessions, workspaces } = db.projectWork.held(
      id,
      recorded.map((place) => place.id),
      trashed?.sessions ?? []
    );
    return {
      browsers: db.browsers
        .list()
        .filter((row) => row.key === `project:${id}`)
        .map(({ key, machineId }) => ({ key, machineId })),
      places: diskPlaces(db, id, trashed),
      sessions,
      workspaces: workspaces.filter((one) => joined.has(one.machineId)),
    };
  };

  /** The machines `plan` needs now: every one that holds a browser, a workspace's clone or carry, or (`fromDisk`) a place. */
  const needed = (plan: Plan, fromDisk: boolean): Set<string> =>
    new Set([
      ...plan.browsers.map((one) => one.machineId),
      ...plan.workspaces
        .filter((one) => !one.host && (one.state !== "archived" || one.carry))
        .map((one) => one.machineId),
      ...(fromDisk ? plan.places.map((one) => one.machineId) : []),
    ]);

  /** A clone removed on its machine, nothing read or carried. */
  const dropClone = async (workspace: HeldWorkspace): Promise<void> => {
    const answer = (await deps.call(
      workspace.machineId,
      CONTROL_WORKSPACE_ARCHIVE,
      [
        {
          id: workspace.id,
          path: workspace.path,
          unlanded: "drop",
        } satisfies WorkspaceArchive,
      ]
    )) as { held?: unknown } | null;
    if (answer?.held) {
      throw new AgentTooOld();
    }
  };

  /** A folder removed on its machine, held to its floor there. */
  const removeFolder = (machineId: string, folder: RemoveFolder) =>
    deps.call(machineId, CONTROL_REMOVE_FOLDER, [folder]);

  /** Every removal `plan` holds on a machine, in order: browsers, clones, carries, then (`fromDisk`) places. */
  const removalsOf = (plan: Plan, fromDisk: boolean): Removal[] => {
    const cut = plan.workspaces.filter((one) => !one.host);
    return [
      ...plan.browsers.map((browser): Removal => ({
        kind: "browsers",
        machineId: browser.machineId,
        what: "Its browser",
        run: () => deps.removeBrowser(browser.key, browser.machineId),
      })),
      ...cut
        .filter((one) => one.state !== "archived")
        .map((workspace): Removal => ({
          kind: "workspaces",
          machineId: workspace.machineId,
          what: `Workspace ${workspace.id}`,
          run: () => dropClone(workspace),
        })),
      ...cut.flatMap(({ carry, machineId }): Removal[] =>
        carry
          ? [
              {
                kind: "carries",
                machineId,
                what: `The carry ${carry}`,
                run: () =>
                  removeFolder(machineId, { kind: "carry", path: carry }),
              },
            ]
          : []
      ),
      ...(fromDisk ? plan.places : []).map((place): Removal => ({
        kind: "places",
        machineId: place.machineId,
        what: place.path,
        run: () =>
          removeFolder(place.machineId, { kind: "place", path: place.path }),
      })),
    ];
  };

  /** Each session's end recorded as a delete, owed to its machine as every session's end is, away or not. */
  const endSessions = (
    sessions: readonly HeldSession[],
    fromDisk: boolean,
    on: (machineId: string) => MachineRemoved
  ): void => {
    for (const session of sessions) {
      try {
        deps.endSession(session.id, fromDisk ? "delete-transcript" : "delete");
        on(session.machineId).sessions += 1;
      } catch (error) {
        console.warn(
          `[project-delete] session ${session.id}'s end was not recorded: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  };

  /** Each removal `plan` holds, on its machine, the first that fails the delete's refusal in words; what went, by machine. */
  const removeOnMachines = async (
    name: string,
    plan: Plan,
    fromDisk: boolean
  ): Promise<Map<string, MachineRemoved>> => {
    const removed = new Map<string, MachineRemoved>();
    const on = (machineId: string): MachineRemoved => {
      const counts = removed.get(machineId) ?? {
        browsers: 0,
        carries: 0,
        places: 0,
        sessions: 0,
        workspaces: 0,
      };
      removed.set(machineId, counts);
      return counts;
    };
    for (const removal of removalsOf(plan, fromDisk)) {
      try {
        await removal.run();
      } catch (error) {
        const machine = deps.machineName(removal.machineId);
        // biome-ignore lint/style/useErrorCause: the cause rides the refusal's options, its third argument.
        throw new DeleteRefusal(
          error instanceof AgentTooOld ? 409 : 502,
          error instanceof AgentTooOld
            ? projectTrashWords.agentTooOld(name, removal.what, machine)
            : projectTrashWords.notRemoved(
                name,
                removal.what,
                machine,
                error instanceof Error ? error.message : String(error)
              ),
          { cause: error }
        );
      }
      on(removal.machineId)[removal.kind] += 1;
    }
    endSessions(plan.sessions, fromDisk, on);
    return removed;
  };

  /** Project `id`'s rows (`live`: it has them), its workspaces' records, its folder and its trash, gone from the hub. */
  const forgetOnHub = async (
    id: string,
    live: boolean,
    plan: ReturnType<typeof planOf>
  ) => {
    const rows = live
      ? (db.forgetProject(id, () => undefined)?.tables ?? []).reduce(
          (sum, one) => sum + one.rows.length,
          0
        )
      : 0;
    db.projectWork.drop(
      id,
      plan.workspaces.map((one) => one.id)
    );
    const folder = await deleteProjectFolder(id);
    if (folder instanceof ElysiaStatus) {
      throw projectRefusalOf(folder);
    }
    const trash = await purgeTrash(id);
    return { folder, rows, trash };
  };

  return {
    /** Deletes project `id` for good, live or in the trash (`fromDisk`: its places and transcripts too). Throws a {@link DeleteRefusal}. */
    async delete(
      id: string,
      { fromDisk }: { fromDisk: boolean }
    ): Promise<ProjectDeleted> {
      const live = db.project(id);
      const trashed = await trashedProject(id);
      if (!(live || trashed)) {
        throw new DeleteRefusal(404, projectTrashWords.noProject(id));
      }
      const name = live?.name ?? trashed?.name ?? id;
      const running = live ? deps.stillRunning(id) : 0;
      if (running > 0) {
        throw new DeleteRefusal(
          409,
          projectTrashWords.stillRuns(name, running)
        );
      }
      const plan = planOf(id, trashed);
      const shared = fromDisk
        ? plan.places.find((place) => place.refusedBy)
        : undefined;
      if (shared?.refusedBy) {
        const { name: holder, path, same } = shared.refusedBy;
        const machine = deps.machineName(shared.machineId);
        throw new DeleteRefusal(
          409,
          same
            ? projectTrashWords.placeShared(name, shared.path, machine, holder)
            : projectTrashWords.placeHolds(
                name,
                shared.path,
                machine,
                holder,
                path
              )
        );
      }
      const away = [...needed(plan, fromDisk)].filter(
        (machineId) => !deps.online(machineId)
      );
      if (away.length > 0) {
        throw new DeleteRefusal(
          409,
          projectTrashWords.machinesAway(name, away.map(deps.machineName))
        );
      }
      const removed = await removeOnMachines(name, plan, fromDisk);
      // The hub's own, once nothing of it stands on a machine.
      const hub = await forgetOnHub(id, Boolean(live), plan);
      return {
        fromDisk,
        hub,
        id,
        machines: Object.fromEntries(
          [...removed].map(([machineId, counts]) => [
            deps.machineName(machineId),
            counts,
          ])
        ),
        name,
      };
    },
  };
};
