/**
 * "Open in split view", the menu's door to what dragging a session row onto
 * a pane's edge already does: `workspace.split` (dnd.svelte `paneDropTarget`).
 * The menu has no pointer position, so the edge is the one `mod+\` uses
 * (Shell): the new pane opens to the right of the focused group.
 *
 * Gated as the drag is: a drag is not offered under a coarse pointer
 * (`dragSession`), and `split` refuses at the layout's group limit or when
 * it would split a group against its only tab.
 */
import { tick } from "svelte";
import { MediaQuery } from "svelte/reactivity";
import { workingSet } from "../working-set.svelte";
import { layoutPolicy } from "./layout-policy.svelte";
import { workspace } from "./workspace.svelte";

const coarse = new MediaQuery("pointer: coarse");

interface Context {
  cwd?: string;
  harness?: string;
  machine?: string | null;
}

/**
 * The group the item put in front, waiting for the menu to finish closing:
 * a menu hands focus back to its trigger as it closes, which would take it
 * from the pane the item just opened. `focusAfterMenu` is the menu's
 * `onCloseAutoFocus`: it keeps the trigger from taking it and puts it in the
 * group's composer, where typing goes.
 */
let focusGroup: string | null = null;

export function focusAfterMenu(event: Event): void {
  const leafId = focusGroup;
  if (leafId === null) {
    return;
  }
  focusGroup = null;
  event.preventDefault();
  tick().then(() => {
    document
      .querySelector<HTMLElement>(
        // The pane's composer field (Composer.svelte), not its hidden mirror.
        `[data-leaf="${leafId}"] form.cin textarea:not([aria-hidden="true"])`
      )
      ?.focus();
  });
}

/** Whether the menu offers the item for this session right now. */
export function canOpenBeside(sessionId: string): boolean {
  if (coarse.current || workspace.activeSessionId === null) {
    return false;
  }
  const held = workspace.leafOf(sessionId);
  if (held) {
    // Held in another group: the item brings that group forward. Held in the
    // focused one: only a split of one of several tabs is possible.
    return (
      held.id !== workspace.focusedLeafId ||
      (held.tabs.length >= 2 &&
        workspace.leaves.length < layoutPolicy.maxLeaves)
    );
  }
  return workspace.leaves.length < layoutPolicy.maxLeaves;
}

/**
 * Open the session in a new group to the right of the focused one, or, when
 * another group already holds it, bring that group forward instead of making
 * a second copy.
 */
export function openBeside(sessionId: string, ctx?: Context | null): void {
  const held = workspace.leafOf(sessionId);
  if (held && held.id !== workspace.focusedLeafId) {
    workspace.activate(sessionId, held.id);
    focusGroup = held.id;
    return;
  }
  // As a drag from the board records it, before the session lands.
  if (ctx) {
    workingSet.visit(sessionId, ctx);
  }
  workspace.split(workspace.focusedLeafId, "right", sessionId);
  focusGroup = workspace.focusedLeafId;
}
