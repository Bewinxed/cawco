/**
 * A kit floating surface (dropdown, context menu, popover, select, HangCard)
 * gives the page back its pointer the moment it is dismissed, not when its
 * close has finished playing.
 *
 * While one is open, bits-ui sets `pointer-events: none` on the body, so a
 * press outside only shuts it (body-scroll-lock.svelte.js). That lock belongs
 * to the layer's `ScrollLock`, which bits-ui mounts for as long as the layer
 * is drawn, so without `forceMount` it held through the whole close (160ms of
 * `--dur-exit`, then bits-ui's 24ms clean-up), and the next click, in the page
 * or in a preview's iframe, was lost. With `forceMount` bits-ui mounts the lock
 * only while the layer is open (popper-layer-inner.svelte), and leaves drawing
 * the surface to the `child` snippet: these helpers draw it while bits-ui's
 * own presence says it should be, open or still closing (`shouldRender`, which
 * bits-ui hands a forceMount child among its props), so the close plays as
 * before. What is left is bits-ui's own 24ms before it clears the body.
 *
 * A dialog, alert dialog or sheet needs no forceMount: bits-ui's dialog
 * content mounts its lock only while open when it is drawn through `child`,
 * and takes `restoreScrollDelay`, which the kit sets to 0.
 */

/**
 * A surface's `pointer-events` while it closes: none, so a press on the
 * place it is leaving from lands on the page under it, as one anywhere else
 * does. bits-ui writes `pointer-events: auto` inline on every content and
 * overlay; a `style:` directive outranks that.
 */
export function pressable(open: boolean): "none" | undefined {
  return open ? undefined : "none";
}

/** What bits-ui hands a forceMount content's `child` snippet as `props`. */
type ContentProps = Record<string, unknown>;

/** Whether bits-ui's presence draws the surface: open, or closing. */
export function drawn(props: ContentProps): boolean {
  const { shouldRender } = props;
  if (typeof shouldRender !== "boolean") {
    throw new Error(
      "bits-ui no longer hands its presence (`shouldRender`) to a forceMount content's child snippet: re-read bits-ui's popper-layer-force-mount.svelte and update floating-presence.ts"
    );
  }
  return shouldRender;
}

/** The props to spread on the surface's element: bits-ui's, less its presence. */
export function own(props: ContentProps): ContentProps {
  const { shouldRender: _, ...rest } = props;
  return rest;
}
