/**
 * Which projects a session lists in: one rule, read by the rail (the
 * dashboard's project tree) and by the hub (the sessions it stops before a
 * project is forgotten, and the delete it refuses while one still runs), so
 * the two never disagree about whose a session is.
 */

/** A place a project has: a folder on one machine. */
export interface MemberPlace {
  id: string;
  machineId: string;
  path: string;
}

/** A project as the rule reads it. */
export interface MemberProject {
  createdAt: string | number | Date;
  id: string;
  places: MemberPlace[];
  /** Its primary checkout's id; null while it has none. */
  primaryPlaceId: string | null;
}

/** Where a session runs, and the project it was started under, if any. */
export interface MemberLocation {
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
const time = (at: string | number | Date): number =>
  at instanceof Date ? at.getTime() : new Date(at).getTime();
const older = (a: MemberProject, b: MemberProject): boolean =>
  time(a.createdAt) < time(b.createdAt) ||
  (time(a.createdAt) === time(b.createdAt) && a.id < b.id);

/** The project's primary checkout; undefined while it has none. */
export const primaryPlaceOf = <P extends MemberProject>(
  project: P
): P["places"][number] | undefined =>
  project.places.find((place) => place.id === project.primaryPlaceId);

/**
 * Where an owned row counts from: the owner's place on the row's machine that
 * holds the row's folder (the deepest), else the owner's primary checkout,
 * else the row's own folder.
 */
function homeOf(owner: MemberProject, row: MemberLocation): Spot {
  const cwd = folder(row.cwd);
  const primary = primaryPlaceOf(owner);
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

/** Each machine's folders that are places, and the oldest project at each. */
type PlaceIndex<P extends MemberProject> = Map<string, Map<string, P>>;

/**
 * The place index of each projects list, built the first time a list is
 * asked about. Both readers replace their list whole whenever a project or a
 * place changes, so a list's index never goes stale. Rebuilt per ask, the
 * index was a pass over every place of every project per row, which held the
 * page for hundreds of milliseconds at a time on a fleet with many sessions.
 */
const indexes = new WeakMap<readonly MemberProject[], PlaceIndex<never>>();

function placeIndex<P extends MemberProject>(
  projects: readonly P[]
): PlaceIndex<P> {
  const held = indexes.get(projects) as PlaceIndex<P> | undefined;
  if (held) {
    return held;
  }
  const index: PlaceIndex<P> = new Map();
  for (const project of projects) {
    for (const place of project.places) {
      let oldest = index.get(place.machineId);
      if (!oldest) {
        oldest = new Map();
        index.set(place.machineId, oldest);
      }
      const path = folder(place.path);
      const previous = oldest.get(path);
      if (!previous || older(project, previous)) {
        oldest.set(path, project);
      }
    }
  }
  indexes.set(projects, index as PlaceIndex<never>);
  return index;
}

/** Every folder that holds `path` (`contains`), the folder itself first, then outward. */
function holders(path: string): string[] {
  const out = [path];
  for (let i = path.length - 1; i > 0; i -= 1) {
    if (path[i] === "/") {
      out.push(path.slice(0, i));
    }
  }
  if (path.startsWith("/") && !out.includes("/")) {
    out.push("/");
  }
  return out;
}

/**
 * Explicit ownership wins; then every project with a place on the row's
 * machine whose folder holds the row's, deepest first. Ambiguous folders
 * belong to their oldest project.
 */
export function projectsFor<P extends MemberProject>(
  projects: readonly P[],
  row: MemberLocation
): P[] {
  const owner = projects.find((project) => project.id === row.projectId);
  const at: Spot = owner
    ? homeOf(owner, row)
    : { machineId: row.machineId, path: folder(row.cwd) };
  const oldest = placeIndex(projects).get(at.machineId);
  if (!oldest) {
    return owner ? [owner] : [];
  }
  // Each project once, at the deepest of its places that holds the folder.
  const depth = new Map<string, { project: P; depth: number }>();
  for (const path of holders(at.path)) {
    const project = oldest.get(path);
    if (!project || (owner && (path === at.path || project.id === owner.id))) {
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

/** A session row as the tree reads it: its id and the one it is a delegate of. */
export interface MemberTreeRow {
  id: string;
  parentInstanceId?: string | null;
}

/**
 * The session at the top of a row's chain of parents, over every row known
 * (a cycle stops where it closes). A row lists in the projects of its top,
 * whatever machine and folder it runs on itself: a delegate started on
 * another machine, in a worktree there, still lists with its parent.
 */
export function topsIn<T extends MemberTreeRow>(
  byId: ReadonlyMap<string, T>
): (row: T) => T {
  return (row) => {
    const seen = new Set<string>([row.id]);
    let at = row;
    for (
      let up = at.parentInstanceId ? byId.get(at.parentInstanceId) : undefined;
      up && !seen.has(up.id);
      up = at.parentInstanceId ? byId.get(at.parentInstanceId) : undefined
    ) {
      seen.add(up.id);
      at = up;
    }
    return at;
  };
}
