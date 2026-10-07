import type { ProjectPlace, ProjectRow } from "./client.svelte";

interface Location {
  cwd: string;
  machineId: string;
  projectId?: string | null;
}

/** A folder on one machine. */
interface Spot {
  machineId: string;
  path: string;
}

const TRAILING_SLASH = /\/+$/;
const folder = (cwd: string): string => cwd.replace(TRAILING_SLASH, "") || "/";
const contains = (root: string, path: string): boolean =>
  root === path || path.startsWith(root === "/" ? "/" : `${root}/`);
const older = (a: ProjectRow, b: ProjectRow): boolean =>
  a.createdAt < b.createdAt || (a.createdAt === b.createdAt && a.id < b.id);

/** The project's primary checkout; undefined while it has none (only its folder on the hub). */
export const checkoutOf = (project: ProjectRow): ProjectPlace | undefined =>
  project.places.find((place) => place.id === project.primaryPlaceId);

/**
 * The folder a project is known by (its hue, its rail row): its primary
 * checkout's path, else its folder on the hub's (`projects/<id>`).
 */
export const folderOf = (project: ProjectRow): string =>
  checkoutOf(project)?.path ?? `projects/${project.id}`;

/**
 * Where an owned row counts from: the owner's place on the row's machine that
 * holds the row's folder (the deepest), else the owner's primary checkout,
 * else the row's own folder.
 */
function homeOf(owner: ProjectRow, row: Location): Spot {
  const cwd = folder(row.cwd);
  const primary = checkoutOf(owner);
  let home: Spot = primary
    ? { machineId: primary.machineId, path: folder(primary.path) }
    : { machineId: row.machineId, path: cwd };
  let depth = -1;
  for (const place of owner.places) {
    const path = folder(place.path);
    if (
      place.machineId === row.machineId &&
      contains(path, cwd) &&
      path.length > depth
    ) {
      home = { machineId: place.machineId, path };
      depth = path.length;
    }
  }
  return home;
}

/** Each folder on `machineId` that is a place, and the oldest project there. */
function oldestOn(
  projects: ProjectRow[],
  machineId: string
): Map<string, ProjectRow> {
  const oldest = new Map<string, ProjectRow>();
  for (const project of projects) {
    for (const place of project.places) {
      const path = folder(place.path);
      const previous = oldest.get(path);
      if (
        place.machineId === machineId &&
        (!previous || older(project, previous))
      ) {
        oldest.set(path, project);
      }
    }
  }
  return oldest;
}

/**
 * Explicit ownership wins; then every project with a place on the row's
 * machine whose folder holds the row's, deepest first. Ambiguous folders
 * belong to their oldest project.
 */
export function projectsFor(
  projects: ProjectRow[],
  row: Location
): ProjectRow[] {
  const owner = projects.find((project) => project.id === row.projectId);
  const at: Spot = owner
    ? homeOf(owner, row)
    : { machineId: row.machineId, path: folder(row.cwd) };
  // Each project once, at the deepest of its places that holds the folder.
  const depth = new Map<string, { project: ProjectRow; depth: number }>();
  for (const [path, project] of oldestOn(projects, at.machineId)) {
    if (
      !contains(path, at.path) ||
      (owner && (path === at.path || project.id === owner.id))
    ) {
      continue;
    }
    const held = depth.get(project.id);
    if (!held || path.length > held.depth) {
      depth.set(project.id, { project, depth: path.length });
    }
  }
  const claimed = [...depth.values()]
    .sort((a, b) => b.depth - a.depth)
    .map((held) => held.project);
  return owner ? [owner, ...claimed] : claimed;
}

/** Where a session on `machineId` starts in the project: its checkout there, the primary first. */
export function checkoutOn(
  project: ProjectRow,
  machineId: string
): ProjectPlace | undefined {
  const checkouts = project.places.filter(
    (place) => place.machineId === machineId && place.kind === "checkout"
  );
  return checkouts.find((place) => place.isPrimary) ?? checkouts[0];
}

/** Whether a session on `machineId` can be one of the project's: it has a place there. */
export const placedOn = (project: ProjectRow, machineId: string): boolean =>
  project.places.some((place) => place.machineId === machineId);
