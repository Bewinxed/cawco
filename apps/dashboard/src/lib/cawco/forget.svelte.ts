/**
 * Forget a project: one ask for every place that offers it (the project
 * head's `⋯`, a folder's menu in the rail), answered in the page where it
 * was asked (DESIGN.md, The Open Page Rule). Each place draws a
 * `<ForgetProjectTray at=…>`; the one whose `at` the ask names draws the
 * tray, under its control, and the rest of the page stays live.
 */
import type { ProjectRow } from "./client.svelte";

let asked = $state<{ at: string; project: ProjectRow } | null>(null);

/** What the tray reads and answers through. */
export const forgetHost = {
  /** Where the forget was asked: the tray stands there. */
  get at(): string | null {
    return asked?.at ?? null;
  },
  /** The project being forgotten, as it was when the forget was asked; null: none. */
  get project(): ProjectRow | null {
    return asked?.project ?? null;
  },
  close(): void {
    asked = null;
  },
};

/** The rail's place for a project's forget: under its folder row. */
export const forgetAtRail = (projectId: string): string => `rail:${projectId}`;

/**
 * Asks to forget `project` from the place `at` (`head:<id>`, `rail:<id>`);
 * a forget already standing gives way to it.
 */
export function forgetProject(project: ProjectRow, at: string): void {
  asked = { at, project: { ...project, places: [...project.places] } };
}
