/**
 * A drag inside the dashboard's own UI (a session row, a task card) never
 * drops its payload into a text field as text. Only files and text the
 * person drags in from outside reach a composer (owner's composer filled
 * with the workspace's layout JSON while he opened a second pane).
 *
 * The browser fills a drag's `text/plain`, `text/uri-list` and `text/html`
 * itself when what is dragged is a link — every session row is one — and a
 * textarea's default drop inserts the `text/plain`. Pragmatic drag and drop
 * cancels that default only over one of its own drop targets
 * (lifecycle-manager: "We won't call `event.preventDefault()` in this call
 * path"), so a row let go over a composer typed its URL into it.
 *
 * So each internal drag source empties the browser's data as its drag
 * starts and carries {@link INTERNAL_DRAG} alone; and one guard, on the
 * window, refuses any drag carrying that type over every text field.
 */

/** The private type every internal drag carries, and nothing a field reads. */
export const INTERNAL_DRAG = "application/x-cawco-drag";

/** Whether a drag is one of the dashboard's own. Readable from `dragenter` on. */
export const isInternalDrag = (data: DataTransfer | null): boolean =>
  data?.types.includes(INTERNAL_DRAG) ?? false;

/**
 * For a Pragmatic `draggable`'s `getInitialDataForExternal`: the drag's only
 * native data, written after {@link bareDrag} has emptied the browser's.
 */
export const internalData = (): Record<string, string> => ({
  [INTERNAL_DRAG]: "",
});

/**
 * Empties what the browser put in a drag from `node` (a link's address, its
 * HTML) as it starts, before Pragmatic, listening on the document, writes
 * {@link internalData}. Returns the listener's removal.
 */
export function bareDrag(node: HTMLElement): () => void {
  const empty = (event: DragEvent) => {
    event.dataTransfer?.clearData();
  };
  node.addEventListener("dragstart", empty);
  return () => node.removeEventListener("dragstart", empty);
}

/** A field a default drop types into: a textarea, a text input, an editable host. */
const isTextField = (target: EventTarget | null): boolean =>
  target instanceof HTMLTextAreaElement ||
  (target instanceof HTMLInputElement && target.type !== "file") ||
  (target instanceof HTMLElement && target.isContentEditable);

/**
 * Over a text field, an internal drag finds no drop: the field's own
 * default (which would take it) is cancelled and the effect is "none"; and
 * a drop that still arrives inserts nothing. A hover one of Pragmatic's
 * targets has already taken (its window listeners capture, so they run
 * first and cancel it) keeps that target's effect. Installed once, for the
 * page's life; returns its removal.
 */
export function refuseInternalDrops(): () => void {
  const hover = (event: DragEvent) => {
    if (
      !event.defaultPrevented &&
      event.dataTransfer &&
      isInternalDrag(event.dataTransfer) &&
      isTextField(event.target)
    ) {
      event.preventDefault();
      event.dataTransfer.dropEffect = "none";
    }
  };
  const drop = (event: DragEvent) => {
    if (isInternalDrag(event.dataTransfer) && isTextField(event.target)) {
      event.preventDefault();
    }
  };
  window.addEventListener("dragover", hover);
  window.addEventListener("drop", drop, { capture: true });
  return () => {
    window.removeEventListener("dragover", hover);
    window.removeEventListener("drop", drop, { capture: true });
  };
}
