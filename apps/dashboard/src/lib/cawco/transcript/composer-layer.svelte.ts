/**
 * The composer's floating layer standing open: the delegate tray's shelf
 * or the plan its ring opens. Both rise from the tray row to the same
 * place over the transcript's foot, so they stand one at a time, as a
 * popover family does: the one opened takes the layer, and the one that
 * held it shuts (its owner watches `holds`).
 */
let open = $state<symbol | null>(null);

export const composerLayer = {
  /** `owner` opens: the layer is its, and whoever held it shuts. */
  take(owner: symbol): void {
    open = owner;
  },
  /** Whether `owner` holds the layer. */
  holds(owner: symbol): boolean {
    return open === owner;
  },
  /** `owner` shut: the layer is no one's, unless another took it since. */
  drop(owner: symbol): void {
    if (open === owner) {
      open = null;
    }
  },
};
