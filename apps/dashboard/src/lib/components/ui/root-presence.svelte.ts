/**
 * Whether a kit overlay's portal is in the page: from the moment it opens
 * until it has closed, its exit played (bits-ui's `onOpenChangeComplete`).
 *
 * The dialog, the alert dialog and the sheet share `--layer-float` with the
 * drawer, and of two surfaces on one layer the later in the page is drawn
 * on top. A bits-ui Portal enters the page when it mounts, with its Root,
 * not when it opens: an overlay mounted at first paint (the Shell's) stood
 * before every surface opened since, and opened under them. Its kit Portal
 * mounts only while `present`, so it is the newest surface whenever it
 * opens.
 *
 *   // the Root wrapper
 *   const complete = rootPresence(() => shown);
 *   <X.Root onOpenChangeComplete={(value) => { complete(value); theirs?.(value); }}>
 *   // the Portal wrapper
 *   const root = presence();
 *   {#if root.present}<X.Portal … />{/if}
 */
import { createContext } from "svelte";
import { rootOpen } from "./root-open.svelte.js";

const [presence, providePresence] = createContext<{
  readonly present: boolean;
}>();

export { presence };

/** Provides the overlay's presence to its Portal; answers its Root's `onOpenChangeComplete`. */
export function rootPresence(shown: () => boolean): (open: boolean) => void {
  // Closed and its exit played: true until it first opens, and again once
  // each close completes.
  let settled = $state(true);
  $effect(() => {
    if (shown()) {
      settled = false;
    }
  });
  providePresence({
    get present() {
      return shown() || !settled;
    },
  });
  return (open) => {
    if (!open) {
      settled = true;
    }
  };
}

/**
 * A kit dialog Root wrapper's whole wiring (the dialog's, the alert
 * dialog's, the sheet's): its `open` handed to the Root once the wrapper
 * has mounted (root-open), and its presence provided to its Portal, then
 * `theirs`, the caller's own `onOpenChangeComplete`.
 *
 *   const root = overlayRoot(() => open, (value) => { open = value; }, () => onOpenChangeComplete);
 *   <X.Root bind:open={root.get, root.set} onOpenChangeComplete={root.complete} {...restProps} />
 */
export function overlayRoot(
  open: () => boolean,
  set: (open: boolean) => void,
  theirs: () => ((open: boolean) => void) | undefined
): {
  complete: (open: boolean) => void;
  get: () => boolean;
  set: (open: boolean) => void;
} {
  const root = rootOpen();
  const shown = $derived(root.ready && open());
  const complete = rootPresence(() => shown);
  return {
    get: () => shown,
    set,
    complete: (value) => {
      complete(value);
      theirs()?.(value);
    },
  };
}
