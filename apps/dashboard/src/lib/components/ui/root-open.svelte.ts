/**
 * The `open` a wrapper hands its bits-ui Root, so a Root opens whenever its
 * state is true, whenever that became true.
 *
 * bits-ui's presence (internal/presence-manager, 2.19.5) takes `open` as it
 * is when the Root is made, and lets the first run of its watch go by
 * unread, taking it for that same value. A Root whose `open` became true in
 * between was never drawn: the state said open and nothing was on screen.
 * That window is real whenever the state is a store opened from anywhere:
 * a route's onMount (`/motion/new-session` calling `newSession()`) runs
 * before the Shell's dialogs have run their effects, since Svelte runs
 * effects in the order it makes them and makes a component's own effects
 * when its template is done.
 *
 * So the Root is handed false until the wrapper's own onMount, and the
 * state from then on. The Root is in the wrapper's template, so the
 * wrapper's onMount is made, and runs, after every effect of the Root's:
 * its watch has had its first run by then, and a state already true
 * reaches it as the change it is, in the same flush. A dialog that opens
 * at mount opens the way it opens from a click.
 *
 *   const root = rootOpen();
 *   <X.Root bind:open={() => root.ready && open, (value) => { open = value; }}>
 */
import { onMount } from "svelte";

export function rootOpen(): { readonly ready: boolean } {
  let ready = $state(false);
  onMount(() => {
    ready = true;
  });
  return {
    get ready() {
      return ready;
    },
  };
}
