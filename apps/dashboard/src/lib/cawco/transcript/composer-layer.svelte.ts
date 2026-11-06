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
import { untrack } from "svelte";
import type { Attachment } from "svelte/attachments";

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

/**
 * A layer that stands open as long as the component that calls this does
 * (the plan, the list of what waits on the person): it takes its pane's
 * layer as it opens, shuts by `onclose` when another takes it, and lets it
 * go as it goes. Called while the component is made; `paneId` reads the
 * conversation its pane shows.
 */
export function holdComposerLayer(
  paneId: () => string,
  name: string,
  onclose: () => void
): void {
  const owner = Symbol(name);
  const layer = $derived(composerLayerOf(paneId()));
  $effect.pre(() => {
    const held = layer;
    untrack(() => held.take(owner));
    return () => held.drop(owner);
  });
  $effect(() => {
    if (!layer.holds(owner)) {
      untrack(onclose);
    }
  });
}

/**
 * The room a layer may rise into, set on it as CSS variable `property`:
 * from the tray row it stands on (its offset parent) up to the top of the
 * composer's dock, a step short of it, read once as it opens.
 */
export const roomOver =
  (property: `--${string}`): Attachment<HTMLElement> =>
  (node) => {
    const row = node.offsetParent;
    const dock = node.closest('[data-slot="dock"]');
    if (row && dock) {
      const over =
        row.getBoundingClientRect().top - dock.getBoundingClientRect().top;
      node.style.setProperty(property, `${Math.max(0, over - 16)}px`);
    }
  };
