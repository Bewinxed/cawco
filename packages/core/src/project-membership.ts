/**
 * Whose a session is: one project, its own. The hub writes a session's
 * `projectId` as it starts (a delegate, Caw's work and a check take their
 * parent's), and every reader reads that one field: the rail, the home, the
 * hub's stops before a project is forgotten. Nothing walks outward from a
 * session's folder to find more projects, so a project whose checkout holds
 * another's (one at the home folder) never takes the other's sessions.
 *
 * What has no row to read a project from (a machine's stored transcript, a
 * session started with no project) is placed once, by its folder: the
 * deepest place on its machine that holds it ({@link projectAt}). The hub's
 * migration that gave every older row its project used the same rule.
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
 * The project whose place on `machineId` holds `cwd` most closely: the
 * deepest such place, the oldest project where two share it. Undefined when
 * no place holds it. A place at the home folder holds everything under it,
 * so it is chosen only where no deeper project's place does.
 */
export function projectAt<P extends MemberProject>(
  projects: readonly P[],
  at: { cwd: string; machineId: string }
): P | undefined {
  const cwd = folder(at.cwd);
  let best: { depth: number; project: P } | undefined;
  for (const project of projects) {
    for (const place of project.places) {
      if (place.machineId !== at.machineId) {
        continue;
      }
      const path = folder(place.path);
      if (!contains(path, cwd)) {
        continue;
      }
      if (
        !best ||
        path.length > best.depth ||
        (path.length === best.depth && older(project, best.project))
      ) {
        best = { project, depth: path.length };
      }
    }
  }
  return best?.project;
}

/** A session row as the tree reads it: its id and the one it is a delegate of. */
export interface MemberTreeRow {
  id: string;
  parentInstanceId?: string | null;
}

/**
 * The session at the top of a row's chain of parents, over every row known
 * (a cycle stops where it closes): the row a tree is listed by. One finder
 * per `byId`, which it reads as it stands: each chain is walked once, the
 * first time a row in it is asked, and every row on it is answered from
 * then on with no walk (a board of two thousand rows asks it of every row on
 * every change, most of them delegates). A cycle's rows all answer the row
 * the first walk into it closed at.
 */
export function topsIn<T extends MemberTreeRow>(
  byId: ReadonlyMap<string, T>
): (row: T) => T {
  /** Each walked row's top; null while its own walk is on it. */
  const tops = new Map<string, T | null>();
  const parentOf = (row: T): T | undefined =>
    row.parentInstanceId ? byId.get(row.parentInstanceId) : undefined;
  /** Up from `row` to a row with no parent here, one already answered, or the one the chain closes on. */
  const walk = (row: T): T => {
    const chain: T[] = [];
    let at = row;
    let top: T | undefined;
    while (top === undefined) {
      tops.set(at.id, null);
      chain.push(at);
      const parent = parentOf(at);
      const held = parent && tops.get(parent.id);
      if (!parent || held === null) {
        top = at;
      } else if (held) {
        top = held;
      } else {
        at = parent;
      }
    }
    for (const one of chain) {
      tops.set(one.id, top);
    }
    return top;
  };
  // A row with no parent here is its own top: answered with nothing held.
  return (row) =>
    tops.get(row.id) ??
    (row.parentInstanceId && byId.has(row.parentInstanceId) ? walk(row) : row);
}
