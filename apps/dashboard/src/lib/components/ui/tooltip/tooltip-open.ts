/**
 * Whether the tooltip a content belongs to is open, said by its root
 * (tooltip.svelte) to its content (tooltip-content.svelte).
 *
 * The content's portal is mounted only while it is open. bits-ui's `Portal`
 * mounts into `document.body` as it is created, whatever it holds
 * (portal.svelte: `mount(PortalConsumer, { target })` on any target), so a
 * closed tooltip still put its anchors in the body: every row with a tooltip
 * that a hub message drew again added nodes to the body and took them away,
 * and the body's children changing laid out the whole page (live-perf idle:
 * `other body nodes` ×195 a minute at rest). A tooltip leaves at once (its
 * content has no exit), so nothing is drawn differently.
 */
import { getContext, setContext } from "svelte";

const KEY = Symbol("tooltip-open");

/** The root says whether it is open. */
export const tellOpen = (open: () => boolean): void => {
  setContext(KEY, open);
};

/** Whether the root above is open; true where no root says (a content of its own). */
export const isOpen = (): (() => boolean) =>
  getContext<(() => boolean) | undefined>(KEY) ?? (() => true);
