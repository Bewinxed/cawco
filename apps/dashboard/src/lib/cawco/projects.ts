import type { ProjectRow } from "./client.svelte";

interface Location {
  cwd: string;
  machineId: string;
  projectId?: string | null;
}

const TRAILING_SLASH = /\/+$/;
const folder = (cwd: string): string => cwd.replace(TRAILING_SLASH, "") || "/";
const contains = (root: string, path: string): boolean =>
  root === path || path.startsWith(root === "/" ? "/" : `${root}/`);

/** Explicit ownership wins; ambiguous folders belong to their oldest project. */
export function projectsFor(
  projects: ProjectRow[],
  row: Location
): ProjectRow[] {
  const owner = projects.find((project) => project.id === row.projectId);
  const machineId = owner?.machineId ?? row.machineId;
  const cwd = folder(owner?.cwd ?? row.cwd);
  const oldest = new Map<string, ProjectRow>();
  for (const project of projects) {
    if (project.machineId !== machineId) {
      continue;
    }
    const path = folder(project.cwd);
    const previous = oldest.get(path);
    if (
      !previous ||
      project.createdAt < previous.createdAt ||
      (project.createdAt === previous.createdAt && project.id < previous.id)
    ) {
      oldest.set(path, project);
    }
  }
  const claimed = [...oldest.values()].filter((project) => {
    const path = folder(project.cwd);
    return contains(path, cwd) && (!owner || path !== cwd);
  });
  claimed.sort((a, b) => folder(b.cwd).length - folder(a.cwd).length);
  return owner ? [owner, ...claimed] : claimed;
}
