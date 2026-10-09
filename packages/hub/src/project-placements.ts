/**
 * A project-bound fleet row reaches every place of its project (Projects spec
 * §5.1, D15): "Project skills and MCP servers reach every place of the
 * project". A row stores only its project; the hub fills in the cwd as it
 * sends each machine its fleet config ({@link FleetPlacement}): one copy of
 * the row per checkout and per delegate workspace of that project on the
 * machine, each with that place's path. A machine with no place of the
 * project is not sent the row at all.
 *
 * Hooks, MCP servers and skills carry a placement. A daemon keys a hook by
 * its id, so each hook copy goes out under its own id, `<hook id>@<place
 * id>`. An MCP server's and a skill's name is what sessions see, so their
 * copies keep it and carry `placeId` instead ({@link placedCopies}); the
 * machine reports them under `<name>@<place id>`. Every report is folded back
 * onto the row's own key before the hub keeps it — the dashboard reads one
 * state per row per machine, the worst of its places.
 *
 * The hub folder is a place too, but it is the hub's own git folder of
 * tasks, not a working tree a session runs in, so nothing is placed there.
 */
import type { FleetHook, FleetItemState, FleetPlacement } from "@cawco/core";

/** A place as a placement needs it (`project_places`). */
export interface PlacementPlace {
  id: string;
  kind: string;
  machineId: string;
  path: string;
  projectId: string;
}

const PLACED = "@";

/** The id one copy of a project-bound row goes out under, for one place. */
export const placedId = (id: string, placeId: string): string =>
  `${id}${PLACED}${placeId}`;

/** Whether a row is bound to a project rather than to every machine. */
const projectBound = (row: FleetPlacement): boolean =>
  !!row.projectId && !!row.scope && row.scope !== "user";

/** The rows that are every machine's: the ones bound to no project. */
export const unbound = <T extends FleetPlacement>(
  rows: readonly T[] | undefined
): T[] => (rows ?? []).filter((row) => !projectBound(row));

/**
 * The copies of the project-bound rows one machine is sent: each once per
 * place of its project there, with that place's path and id. Their names
 * stay as they are, being what a session sees.
 */
export const placedCopies = <T extends FleetPlacement>(
  rows: readonly T[] | undefined,
  places: readonly PlacementPlace[],
  machineId: string
): T[] =>
  (rows ?? []).flatMap((row) =>
    projectBound(row)
      ? placesOn(places, row.projectId as string, machineId).map((place) => ({
          ...row,
          cwd: place.path,
          placeId: place.id,
        }))
      : []
  );

/** The places a row's copies go to on one machine: the project's checkouts and workspaces there. */
const placesOn = (
  places: readonly PlacementPlace[],
  projectId: string,
  machineId: string
): PlacementPlace[] =>
  places.filter(
    (place) =>
      place.projectId === projectId &&
      place.machineId === machineId &&
      (place.kind === "checkout" || place.kind === "workspace")
  );

/**
 * The hooks one machine is sent: every fleet-wide hook as it is, and each
 * project-bound hook once per place of its project on that machine, with
 * that place's path as its cwd. Undefined stays undefined — a hub that sends
 * no hooks means "converge nothing" to a daemon.
 */
export const placedHooks = (
  hooks: FleetHook[] | undefined,
  places: readonly PlacementPlace[],
  machineId: string
): FleetHook[] | undefined =>
  hooks?.flatMap((hook) =>
    projectBound(hook)
      ? placesOn(places, hook.projectId as string, machineId).map((place) => ({
          ...hook,
          id: placedId(hook.id, place.id),
          cwd: place.path,
        }))
      : [hook]
  );

/** Worst first: the one state a hook shows for a machine where its places differ. */
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
 * A machine's hook report with every placed copy folded onto its hook's id:
 * the worst state of its places, a failure's detail naming the place. Ids
 * that were not placed pass through.
 */
export const foldPlacedStates = (
  states: Record<string, FleetItemState> | undefined,
  pathOf: (placeId: string) => string | undefined
): Record<string, FleetItemState> | undefined => {
  if (!states) {
    return states;
  }
  const folded: Record<string, FleetItemState> = {};
  for (const [key, state] of Object.entries(states)) {
    const at = key.indexOf(PLACED);
    const id = at === -1 ? key : key.slice(0, at);
    const where = at === -1 ? undefined : pathOf(key.slice(at + 1));
    const next: FleetItemState =
      where && state.detail
        ? { ...state, detail: `${where}: ${state.detail}` }
        : state;
    const held = folded[id];
    if (!held || SEVERITY.indexOf(next.state) < SEVERITY.indexOf(held.state)) {
      folded[id] = next;
    }
  }
  return folded;
};

/** Whether any of these rows (hooks, MCP servers, skills) would be placed for this project. */
export const hasProjectRows = (
  rows: readonly FleetPlacement[],
  projectId: string
): boolean =>
  rows.some((row) => projectBound(row) && row.projectId === projectId);

// --- places changing -----------------------------------------------------------

type PlacesListener = (machineId: string, projectId?: string) => void;
const listeners = new Set<PlacesListener>();

/**
 * Says a machine's places changed (a place added or removed, a workspace
 * opened or archived), so the hub sends that machine its fleet config again
 * and project-bound rows reach the new place or leave the old one. The hub
 * listens ({@link onPlacesChanged}); anything that adds or removes a place
 * calls this after it does.
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
