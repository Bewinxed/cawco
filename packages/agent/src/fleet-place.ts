/**
 * A project's rows at its places on this machine. The hub sends each
 * project-bound row once, bound to no folder (core `FleetProjectRows`), with
 * the project's checkouts here; the clone of every workspace of the project
 * this agent cut is a place it knows itself. Placing is one pure step,
 * {@link place}: a project's rows as the copies one folder takes. It runs
 *
 * - as a workspace is cut, after its copy and before its boundary and its
 *   first session (workspace.ts `createWorkspace`, session.ts
 *   `placeClone`), over that copy alone, from the rows this agent holds: a
 *   copy of its own, never a Linux view of the person's folder;
 * - as a project-bound item moves, over every place of the project the
 *   agent has at that moment ({@link placedConfig}, the converge).
 *
 * An archive deletes the clone and nothing else: the next converge finds
 * the place gone and takes its records back. The rows are kept on disk
 * ({@link keepProjectRows}) as each delta that moves one lands, and a clone
 * is placed from there ({@link keptProjectRows}), so a workspace cut after
 * the agent started again, before the hub's welcome, still gets them.
 */
import { stat } from "node:fs/promises";
import {
  type FleetHarnessConfig,
  type FleetHook,
  type FleetMcpServer,
  type FleetPlacedMemoryDoc,
  type FleetProjectRows,
  type FleetSkillPayload,
  type MachineFleetConfig,
  type PlacedFleetConfig,
  placeKeyOf,
} from "@cawco/core";
import { fleetConfigOf } from "@cawco/core/fleet-items";
import { fleetProjectRowsFile, workspaceProjectFile } from "@cawco/core/paths";
import { readRecord, writeStateFile } from "@cawco/core/state-file";
import { isPlace } from "@cawco/core/workspace-policy";
import { ownFolderSync } from "./layer";
import { workspaceRefs } from "./workspace-records";

/** One place of a project on this machine: a checkout the hub named, or a clone this agent cut. */
export interface FleetPlace {
  path: string;
  projectId: string;
}

/** A project's rows as the copies one folder takes, each with that folder's `cwd` and `placeId`. */
export interface PlacedRows {
  harnessConfig: FleetHarnessConfig[];
  /** Each under `<hook id>@<place id>`, the id its script and records go by. */
  hooks: FleetHook[];
  mcp: FleetMcpServer[];
  memory: FleetPlacedMemoryDoc[];
  skills: FleetSkillPayload[];
}

/** A project's rows as the copies the folder `cwd` takes. Pure. */
export const place = (rows: FleetProjectRows, cwd: string): PlacedRows => {
  const placeId = placeKeyOf(cwd);
  const at = <T extends object>(
    row: T
  ): T & { cwd: string; placeId: string } => ({ ...row, cwd, placeId });
  return {
    harnessConfig: rows.harnessConfig.map(at),
    hooks: rows.hooks.map((hook) => ({
      ...hook,
      id: `${hook.id}@${placeId}`,
      cwd,
    })),
    mcp: rows.mcp.map(at),
    memory: rows.memory.map(at),
    skills: rows.skills.map(at),
  };
};

/** Whether `path` is a folder on this machine now. */
const isFolder = async (path: string): Promise<boolean> =>
  (await stat(path).catch(() => undefined))?.isDirectory() ?? false;

/**
 * Every place of the projects in `projects` on this machine now: each
 * checkout the hub named, and the clone of each workspace of one of them
 * this agent cut that is still here (an archive takes the clone and its
 * records away; a held one keeps both). Stage clones and places
 * (core `isPlace`) are none: no project's rows were ever placed there. Nor
 * is a Linux view (layer.ts `ownFolderSync`): its path is the person's
 * folder, which shows through it with what its own place holds, and which
 * nothing of CawCo's writes for the view.
 */
export const placesNow = async (
  projects: Readonly<Record<string, FleetProjectRows>>
): Promise<FleetPlace[]> => {
  const checkouts = Object.entries(projects).flatMap(([projectId, rows]) =>
    Object.values(rows.checkouts).map((path) => ({ path, projectId }))
  );
  const clones = await Promise.all(
    (await workspaceRefs())
      .filter((ref) => !isPlace(ref.id) && ownFolderSync(ref.id, ref.path))
      .map(async (ref): Promise<FleetPlace | undefined> => {
        const projectId = await readRecord<unknown>(
          workspaceProjectFile(ref.id)
        ).catch(() => undefined);
        return typeof projectId === "string" &&
          projects[projectId] &&
          (await isFolder(ref.path))
          ? { path: ref.path, projectId }
          : undefined;
      })
  );
  const seen = new Set<string>();
  return [...checkouts, ...clones].filter((one): one is FleetPlace => {
    if (!one || seen.has(one.path)) {
      return false;
    }
    seen.add(one.path);
    return true;
  });
};

/**
 * The config this machine's harnesses converge: `config` with each
 * project's rows placed at each of its `places` ({@link place}).
 */
export const placedConfig = (
  config: MachineFleetConfig,
  places: readonly FleetPlace[]
): PlacedFleetConfig => {
  const { projects, ...fleet } = config;
  const copies = places.flatMap((one) => {
    const rows = projects[one.projectId];
    return rows ? [place(rows, one.path)] : [];
  });
  return {
    ...fleet,
    hooks: [...fleet.hooks, ...copies.flatMap((one) => one.hooks)],
    harnessConfig: [
      ...fleet.harnessConfig,
      ...copies.flatMap((one) => one.harnessConfig),
    ],
    placedMcp: copies.flatMap((one) => one.mcp),
    placedMemory: copies.flatMap((one) => one.memory),
    placedSkills: copies.flatMap((one) => one.skills),
  };
};

/** The project items this agent holds, by id, as {@link keepProjectRows} keeps them. */
type ProjectItems = Record<string, unknown>;

/** The project rows the items `items` carry. */
export const projectRowsOf = (
  items: ProjectItems
): Record<string, FleetProjectRows> =>
  fleetConfigOf(new Map(Object.entries(items))).projects;

/** Each write of the rows, one after another, so the last delta's is the one on disk. */
let writing: Promise<void> = Promise.resolve();

/** The project items this agent holds, written to disk whole for the next start. */
export const keepProjectRows = (items: ProjectItems): Promise<void> => {
  const next = writing.then(() =>
    writeStateFile(fleetProjectRowsFile(), JSON.stringify(items))
  );
  writing = next.catch(() => undefined);
  return next;
};

/**
 * The project rows kept on disk, once every write begun before has landed:
 * the last delta's that moved one, in this run or the one before; none
 * before the first delta that carried any.
 */
export const keptProjectRows = async (): Promise<
  Record<string, FleetProjectRows>
> => {
  await writing;
  const items = await readRecord<ProjectItems>(fleetProjectRowsFile());
  return items && typeof items === "object" ? projectRowsOf(items) : {};
};
