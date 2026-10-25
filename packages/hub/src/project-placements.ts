/**
 * A project-bound fleet row reaches every place of its project (Projects spec
 * §5.1, D15): "Project skills and MCP servers reach every place of the
 * project". The hub sends each row once, bound to no folder, to every
 * machine that holds the project ({@link projectRowsFor}): one with a
 * checkout of it, or with a work item of it. The machine places it at each
 * of the project's places there itself (agent fleet-place.ts): the checkouts
 * the hub names with the rows, and the clone of every workspace of the
 * project it cuts, as it cuts it. A workspace opened or archived changes
 * nothing the hub sends.
 *
 * The machine says what each row came to at each place, by folder
 * (core `FleetSyncReport.placed`); the hub keeps one state per row per
 * machine, the worst of its places, naming the place ({@link foldPlaced}).
 *
 * The hub folder is a place too, but it is the hub's own git folder of
 * tasks, not a working tree a session runs in, so nothing is placed there.
 */
import type {
  FleetConfig,
  FleetItemState,
  FleetPlacement,
  FleetProjectRows,
  FleetSyncReport,
} from "@cawco/core";
import { PLACED_SECTIONS } from "@cawco/core";
import { noProjectRows } from "@cawco/core/fleet-items";

/** A place as the hub keeps it (`project_places`). */
export interface PlacementPlace {
  id: string;
  kind: string;
  machineId: string;
  path: string;
  projectId: string;
}

/** Whether a row is bound to a project rather than to every machine. */
const projectBound = (row: FleetPlacement): boolean =>
  !!row.projectId && !!row.scope && row.scope !== "user";

/** The rows that are every machine's: the ones bound to no project. */
export const unbound = <T extends FleetPlacement>(
  rows: readonly T[] | undefined
): T[] => (rows ?? []).filter((row) => !projectBound(row));

/** The rows of `projectId` among `rows`. */
const boundTo = <T extends FleetPlacement>(
  rows: readonly T[] | undefined,
  projectId: string
): T[] =>
  (rows ?? []).filter(
    (row) => projectBound(row) && row.projectId === projectId
  );

/**
 * The rows one machine is sent of each project it holds (`held`): each
 * project-bound row once, and the project's checkouts there (`places`), by
 * place id. A project with no rows is left out, so a checkout of it added
 * or removed sends nothing.
 */
export const projectRowsFor = (
  config: Pick<
    FleetConfig,
    "skills" | "mcp" | "placedMemory" | "hooks" | "harnessConfig"
  >,
  held: ReadonlySet<string>,
  places: readonly PlacementPlace[],
  machineId: string
): Record<string, FleetProjectRows> => {
  const projects: Record<string, FleetProjectRows> = {};
  for (const projectId of held) {
    const rows: FleetProjectRows = {
      ...noProjectRows(),
      skills: boundTo(config.skills, projectId),
      mcp: boundTo(config.mcp, projectId),
      memory: boundTo(config.placedMemory, projectId),
      hooks: boundTo(config.hooks, projectId),
      harnessConfig: boundTo(config.harnessConfig, projectId),
    };
    if (
      rows.skills.length +
        rows.mcp.length +
        rows.memory.length +
        rows.hooks.length +
        rows.harnessConfig.length ===
      0
    ) {
      continue;
    }
    for (const place of places) {
      if (
        place.projectId === projectId &&
        place.machineId === machineId &&
        place.kind === "checkout"
      ) {
        rows.checkouts[place.id] = place.path;
      }
    }
    projects[projectId] = rows;
  }
  return projects;
};

/** Worst first: the one state a row shows for a machine where its places differ. */
const SEVERITY: FleetItemState["state"][] = [
  "failed",
  "needs-auth",
  "pending",
  "unsupported",
  "disabled",
  "applied",
  "removed",
];

/**
 * A machine's report with each project row's places folded onto the row's
 * own key in its section: the worst state of its places, a detail naming
 * the place it is about. The per-place map itself is not kept.
 */
export const foldPlaced = (report: FleetSyncReport): FleetSyncReport => {
  const { placed, ...rest } = report;
  if (!placed) {
    return rest;
  }
  const folded: FleetSyncReport = { ...rest };
  for (const section of PLACED_SECTIONS) {
    const rows = placed[section];
    if (!rows) {
      continue;
    }
    const states: Record<string, FleetItemState> = { ...folded[section] };
    for (const [key, byPlace] of Object.entries(rows)) {
      for (const [where, state] of Object.entries(byPlace)) {
        const next: FleetItemState = state.detail
          ? { ...state, detail: `${where}: ${state.detail}` }
          : state;
        const held = states[key];
        if (
          !held ||
          SEVERITY.indexOf(next.state) < SEVERITY.indexOf(held.state)
        ) {
          states[key] = next;
        }
      }
    }
    folded[section] = states;
  }
  return folded;
};

// --- places changing -----------------------------------------------------------

type PlacesListener = (machineId: string, projectId?: string) => void;
const listeners = new Set<PlacesListener>();

/**
 * Says a machine's checkouts changed (one added, removed or moved), so the
 * hub sends that machine its fleet config again and the project's rows
 * reach the new checkout or leave the old one. A workspace is no place of
 * the hub's: its machine places the rows in its clone as it cuts it. The
 * hub listens ({@link onPlacesChanged}); anything that adds or removes a
 * checkout calls this after it does.
 */
export const placesChanged = (machineId: string, projectId?: string): void => {
  for (const listener of listeners) {
    listener(machineId, projectId);
  }
};

/** Listens for {@link placesChanged}; answers the way to stop. */
export const onPlacesChanged = (listener: PlacesListener): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
