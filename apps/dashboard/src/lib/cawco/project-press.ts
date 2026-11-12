/**
 * A press on a project's row in the sidebar (Projects' row, Recent's
 * project group): its body opens the project, its mark folds the rows
 * under it (TreeMark's switch, which keeps its own press). One rule for
 * every such row.
 */
import { createContext } from "svelte";
import { page } from "$app/state";
import { tabOfPath } from "./workspace/tabs";
import { workspace } from "./workspace/workspace.svelte";

/**
 * Whether the rail drawing the row is the phone's sheet (Sidebar `sheet`):
 * the sheet goes as a link out of it is followed, and a tab opened in place
 * would leave it standing over the project.
 */
const [railSheet, setRailSheet, hasRailSheet] = createContext<() => boolean>();

export { setRailSheet };

/** Whether the row's rail is the phone's sheet, read as its component starts (a context). */
export const inRailSheet = (): (() => boolean) =>
  hasRailSheet() ? railSheet() : () => false;

/**
 * A project's row pressed with the workspace in front (workspace/tabs.ts
 * `tabOfPath`, off the URL shown) opens its tab where it is, as it was left
 * (workspace `openProject`). A press with a key held, from another spoke,
 * or in the phone's sheet follows the row's link.
 *
 * Heard as the press bubbles up to the row, never on its way down: the
 * mark's switch stands inside the row and stops the press where it lands,
 * so a press on the mark only folds.
 */
export function openProjectPress(
  event: MouseEvent,
  projectId: string,
  inSheet: boolean
): void {
  if (
    inSheet ||
    tabOfPath((page.shallow?.url ?? page.url).pathname) === undefined ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  ) {
    return;
  }
  event.preventDefault();
  workspace.openProject(projectId);
}
