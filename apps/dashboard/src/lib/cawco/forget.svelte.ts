/**
 * Forget a project: one dialog for every place that offers it (the project
 * head's `⋯`, a folder's menu in the rail), mounted once in the shell
 * (ForgetProjectDialog), so it outlives the page and the rail row of the
 * project it forgets and can say "Forgotten" after the project is gone.
 *
 * The opener departs under `forget:<id>` (motion/share) as it is pressed,
 * so the dialog flies out of it.
 */
import type { ProjectRow } from "./client.svelte";

let asked = $state<ProjectRow | null>(null);

/** What the single dialog reads and answers through. */
export const forgetHost = {
  /** The project being forgotten, as it was when the forget was asked; null: none. */
  get project(): ProjectRow | null {
    return asked;
  },
  close(): void {
    asked = null;
  },
};

/** Asks to forget `project`; a forget already open gives way to it. */
export function forgetProject(project: ProjectRow): void {
  asked = { ...project, places: [...project.places] };
}
