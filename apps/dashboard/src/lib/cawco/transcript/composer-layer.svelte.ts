/**
 * A pane's composer's floating layer standing open: the delegate tray's
 * shelf or the plan its ring opens. Both rise from the tray row to the same
 * place over the transcript's foot, so they stand one at a time, as a
 * popover family does: the one opened takes the layer, and the one that
 * held it shuts (its owner watches `holds`).
 *
 * Each pane has its own, by the conversation it shows: the plan names it
 * (PlanPane's `instanceId`) and so does the tray (DelegateTray's
 * `parentId`), which stand in different trees (a pane's SessionPane is
 * hosted apart from its group's lent composer: PaneHost, PaneLeaf). One
 * layer for the whole page shut one split pane's plan when the other
 * opened its shelf.
 */
class ComposerLayer {
  #open = $state<symbol | null>(null);

  /** `owner` opens: the layer is its, and whoever held it shuts. */
  take(owner: symbol): void {
    this.#open = owner;
  }

  /** Whether `owner` holds the layer. */
  holds(owner: symbol): boolean {
    return this.#open === owner;
  }

  /** `owner` shut: the layer is no one's, unless another took it since. */
  drop(owner: symbol): void {
    if (this.#open === owner) {
      this.#open = null;
    }
  }
}

/** Each pane's layer, by the conversation it shows: one small record for each conversation a page has shown. */
const layers = new Map<string, ComposerLayer>();

/** The layer of the pane showing conversation `paneId`. */
export const composerLayerOf = (paneId: string): ComposerLayer => {
  let layer = layers.get(paneId);
  if (!layer) {
    layer = new ComposerLayer();
    layers.set(paneId, layer);
  }
  return layer;
};
