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
 * window, refuses any drag carrying that type over every text field, and
 * any file let go where nothing takes it ({@link guardDrops}).
 */

import { draggable } from "@atlaskit/pragmatic-drag-and-drop/adapter/element-adapter";
import { disableNativeDragPreview } from "@atlaskit/pragmatic-drag-and-drop/element/disable-native-drag-preview";
import { preventUnhandled } from "@atlaskit/pragmatic-drag-and-drop/prevent-unhandled";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/utils/combine";

/** The private type every internal drag carries, and nothing a field reads. */
const INTERNAL_DRAG = "application/x-cawco-drag";

/** Whether a drag is one of the dashboard's own. Readable from `dragenter` on. */
const isInternalDrag = (data: DataTransfer | null): boolean =>
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

/** Where the pointer is, in the viewport, at a step of a drag. */
export interface DragPoint {
  x: number;
  y: number;
}

/**
 * One of the dashboard's own drag sources (a task card, a kind's tile) on
 * Pragmatic drag and drop: the browser's data emptied ({@link bareDrag}),
 * {@link internalData} alone carried, and `data-dragging` on `node` while it
 * is in the air. A source that draws its own ghost passes `ghost`: the
 * browser's snapshot is turned off, every step of the pointer reaches
 * `onMove`, and `onEnd` hears where it was let go and the drop targets
 * under it, innermost first. Returns its removal.
 */
export function internalDraggable(
  node: HTMLElement,
  source: {
    canDrag?: () => boolean;
    data: () => Record<string, unknown>;
    ghost?: boolean;
    onEnd: (drop: {
      at: DragPoint;
      targets: { data: Record<string | symbol, unknown>; element: Element }[];
    }) => void;
    onMove?: (at: DragPoint) => void;
    onStart: (at: DragPoint) => void;
  }
): () => void {
  const point = (input: { clientX: number; clientY: number }): DragPoint => ({
    x: input.clientX,
    y: input.clientY,
  });
  return combine(
    bareDrag(node),
    draggable({
      element: node,
      canDrag: source.canDrag,
      getInitialData: source.data,
      getInitialDataForExternal: internalData,
      onGenerateDragPreview: ({ nativeSetDragImage }) => {
        if (source.ghost) {
          disableNativeDragPreview({ nativeSetDragImage });
        }
      },
      onDragStart: ({ location }) => {
        node.dataset.dragging = "";
        // A ghost the page draws lands where it is let go: the browser's
        // own put-back (a dragend held while its snapshot slides home) is
        // not drawn, so a drop anywhere is taken at once.
        if (source.ghost) {
          preventUnhandled.start();
        }
        source.onStart(point(location.current.input));
      },
      onDrag: ({ location }) => {
        source.onMove?.(point(location.current.input));
      },
      onDrop: ({ location }) => {
        delete node.dataset.dragging;
        if (source.ghost) {
          preventUnhandled.stop();
        }
        source.onEnd({
          at: point(location.current.input),
          targets: location.current.dropTargets.map(({ data, element }) => ({
            data,
            element,
          })),
        });
      },
    })
  );
}

/** A field a default drop types into: a textarea, a text input, an editable host. */
const isTextField = (target: EventTarget | null): boolean =>
  target instanceof HTMLTextAreaElement ||
  (target instanceof HTMLInputElement && target.type !== "file") ||
  (target instanceof HTMLElement && target.isContentEditable);

/** Whether a drag carries files: readable from `dragenter` on. */
export const carriesFiles = (data: DataTransfer | null): boolean =>
  data?.types.includes("Files") ?? false;

/** A file picker's own drop, which takes the files as its default does. */
const isFilePicker = (target: EventTarget | null): boolean =>
  target instanceof HTMLInputElement && target.type === "file";

/**
 * Two refusals, on the window, for the page's life:
 *
 * - Over a text field, an internal drag finds no drop: the field's own
 *   default (which would take it) is cancelled and the effect is "none";
 *   and a drop that still arrives inserts nothing.
 * - A file finds no drop anywhere no one takes it (a composer's field does,
 *   Composer `ondrop`): the browser's default for a file let go on a page
 *   opens it in the tab, and the session goes with it.
 *
 * A hover something has already taken keeps its effect: Pragmatic's
 * targets (its window listeners capture, so they run first) and the
 * composer's field (its own listener, before the window's) cancel it
 * themselves. Returns the guard's removal.
 */
export function guardDrops(): () => void {
  const hover = (event: DragEvent) => {
    const data = event.dataTransfer;
    if (
      event.defaultPrevented ||
      !data ||
      isFilePicker(event.target) ||
      !(
        carriesFiles(data) ||
        (isInternalDrag(data) && isTextField(event.target))
      )
    ) {
      return;
    }
    event.preventDefault();
    data.dropEffect = "none";
  };
  // Capture: before the field's own drop, which still hears it and takes
  // a file it wants (a cancelled drop is only one the browser leaves be).
  const drop = (event: DragEvent) => {
    const data = event.dataTransfer;
    if (
      (carriesFiles(data) && !isFilePicker(event.target)) ||
      (isInternalDrag(data) && isTextField(event.target))
    ) {
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
