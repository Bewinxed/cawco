/**
 * What the tab strip benches share (folder-proof, head-tint): the group
 * they draw, and the clicks the bench takes from the strip.
 */
import type { LeafNode } from "#lib/cawco/workspace/tree.js";

/** The bench's group: every tab, the one `?at=` names (`at`, 1 by default) in front. */
export function benchLeaf(
  id: string,
  ids: string[],
  at: string | null
): LeafNode {
  const first = Math.min(ids.length - 1, Math.max(0, Number(at ?? 1) || 0));
  return { id, t: "l", tabs: ids, active: ids[first] };
}

/**
 * A click that would choose a tab (its link, its empty details slot) or
 * close one is the bench's: the strip's own would act on the workspace.
 * The chosen tab's own click (its details card) is left to the strip.
 */
export const benchClick = (group: LeafNode) => (event: MouseEvent) => {
  const target = event.target instanceof Element ? event.target : null;
  const tab = target?.closest<HTMLElement>('[data-slot="tab"]');
  const id = tab
    ?.querySelector<HTMLElement>("[data-session-tab]")
    ?.getAttribute("data-session-tab");
  if (!(tab && id)) {
    return;
  }
  if (target?.closest('[data-slot="tclose"]')) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  if (id === group.active) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  if (group.tabs.includes(id)) {
    group.active = id;
  }
};
