/**
 * A plain press of the main button: no modifier held. A modified press
 * (open in a new tab, add to a selection) is the browser's own, so a
 * handler that acts in place leaves it alone.
 */
export const plainClick = (event: MouseEvent): boolean =>
  event.button === 0 &&
  !(event.metaKey || event.ctrlKey || event.shiftKey || event.altKey);
