/**
 * How a project's folder on a machine stands to the checkouts of the other
 * live projects there, as a delete with its files reads it (hub
 * project-delete.ts) and as its files box says it (dashboard
 * FromDiskBox.svelte), in the live tray and in Forgotten projects alike.
 *
 * A folder another live project's checkout is too, or one that holds such
 * a checkout, is refused: removing it removes that project's files whole.
 * A folder inside another live project's wider checkout goes, and that
 * project loses those files with it: the box names it beside the folder.
 *
 * Browser-safe: no node built-ins, as the dashboard reads it too.
 */

/** A live project, as a folder's neighbour is named. */
export interface PlaceProject {
  id: string;
  name: string;
}

/** A place as both sides hold one: its kind, machine and absolute path. */
interface Place {
  kind: string;
  machineId: string;
  path: string;
}

/** What a delete with its files reads of one folder against the other live projects. */
export interface PlaceNesting {
  /** The first live project whose checkout is this folder or sits inside it: the delete is refused. */
  refusedBy: (PlaceProject & { path: string; same: boolean }) | null;
  /** Every live project whose checkout holds this folder: it loses these files too. */
  within: PlaceProject[];
}

const slash = (path: string): string =>
  path.endsWith("/") ? path : `${path}/`;

/**
 * Folder `place` of project `projectId`, read against the checkouts of
 * `projects` (every live project; `projectId`'s own are passed over) on its
 * machine.
 */
export const placeNesting = (
  projectId: string,
  place: Pick<Place, "machineId" | "path">,
  projects: readonly {
    id: string;
    name: string;
    places: readonly Place[];
  }[]
): PlaceNesting => {
  const mine = slash(place.path);
  let refusedBy: PlaceNesting["refusedBy"] = null;
  const within: PlaceProject[] = [];
  for (const other of projects) {
    if (other.id === projectId) {
      continue;
    }
    for (const theirs of other.places) {
      if (theirs.kind !== "checkout" || theirs.machineId !== place.machineId) {
        continue;
      }
      const path = slash(theirs.path);
      if (path.startsWith(mine)) {
        refusedBy ??= {
          id: other.id,
          name: other.name,
          path: theirs.path,
          same: path === mine,
        };
      } else if (
        mine.startsWith(path) &&
        !within.some((one) => one.id === other.id)
      ) {
        within.push({ id: other.id, name: other.name });
      }
    }
  }
  return { refusedBy, within };
};
