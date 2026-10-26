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
