/**
 * The server's read of the project a page was entered at (the project
 * route's load, project-page-data.ts), claimed once by the project's tab as
 * it mounts, as a conversation's server tail is (SessionSurface `entry`).
 * `page.data` stands until the next real navigation, so a tab mounted again
 * later would draw an old read as current: the read is handed over once
 * and the tab reads itself from then on. Held only in the browser; the
 * server hands each render its own `page.data` (PaneLeaf).
 */
import type { ProjectPageData } from "../project/project-page-data";

/** The read a project route's load gave, with the project it read. */
export type ProjectSeed = ProjectPageData & { id: string };

let held: ProjectSeed | null = null;

/** Keeps the entered page's read until its tab claims it. */
export function holdProjectSeed(seed: ProjectSeed | null | undefined): void {
  held = seed ?? null;
}

/** The read for `projectId`, once: null when none was held for it. */
export function takeProjectSeed(projectId: string): ProjectSeed | null {
  if (held?.id !== projectId) {
    return null;
  }
  const seed = held;
  held = null;
  return seed;
}
