/**
 * Where a kit submenu (the context menu's and the dropdown's) stands: beside
 * the row that opens it, on whichever side holds it whole (bits-ui flips it
 * to the other side when its own does not), or, where neither side does (a
 * phone's width), hung from that row's foot over its own menu, slid along
 * the row to stay inside the screen.
 *
 * bits-ui shifts a floating layer only along the side it stands on
 * (use-floating-layer.svelte.js: `shift({ crossAxis: false })`), so a
 * submenu beside its row moves up and down and never sideways. On a 390px
 * phone neither side held the Account submenu, and the flip's best fit stood
 * it at x −43…179, part off the screen. Hung below its row, the same shift
 * slides it along the row instead, inside the screen's gutter.
 *
 * Read once the submenu is drawn, before bits-ui has placed it: its width,
 * and the box of the row that opened it (the trigger bits-ui points at it
 * with `aria-controls`). `inset` is the gutter kept from the screen's edge.
 */
export function submenuSide(
  content: HTMLElement,
  inset: number
): "right" | "bottom" {
  const trigger = content.id
    ? content.ownerDocument.querySelector(
        `[aria-controls="${CSS.escape(content.id)}"]`
      )
    : null;
  if (!trigger) {
    throw new Error(
      "bits-ui no longer points an open submenu's trigger at it (`aria-controls`): re-read bits-ui's MenuSubTriggerState and update submenu-side.ts"
    );
  }
  const row = trigger.getBoundingClientRect();
  const width = content.offsetWidth;
  const screen = content.ownerDocument.documentElement.clientWidth;
  const beside =
    screen - row.right - inset >= width || row.left - inset >= width;
  return beside ? "right" : "bottom";
}
