/**
 * The design graph's kept state, in words (Projects spec §5.10, the owner's
 * pick "pins"): its machine, state and variation as the pane says them with
 * each ask (`cawco:stage`). A pin placed while a state is kept records this
 * path, shown under the person's words; none on a page with no graph.
 */
let kept = "";

/** The pane said the kept state's path: a pin placed from now records it. */
export function keepStagePath(path: string): void {
  kept = path;
}

/** The kept state's path, or "" when no design graph keeps one. */
export const stagePath = (): string => kept;
