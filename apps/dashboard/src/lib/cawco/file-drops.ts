/**
 * A file let go on the page goes only where something takes it: a
 * composer's field does (Composer `ondrop`). The browser's default for a
 * file let go anywhere else opens it in the tab, and the session goes with
 * it, so that default is refused everywhere no one takes the file.
 *
 * The dashboard's own drags are pointer drags (drag/, on dnd kit), never the
 * browser's: nothing of them reaches a field as text.
 */

/** Whether a drag carries files: readable from `dragenter` on. */
export const carriesFiles = (data: DataTransfer | null): boolean =>
  data?.types.includes("Files") ?? false;

/** A file picker's own drop, which takes the files as its default does. */
const isFilePicker = (target: EventTarget | null): boolean =>
  target instanceof HTMLInputElement && target.type === "file";

/**
 * On the window, for the page's life: a file finds no drop anywhere no one
 * takes it. A hover something has already taken keeps its effect (the
 * composer's field cancels it itself, its own listener before the
 * window's). Returns the guard's removal.
 */
export function guardFileDrops(): () => void {
  const hover = (event: DragEvent) => {
    const data = event.dataTransfer;
    if (
      event.defaultPrevented ||
      !data ||
      isFilePicker(event.target) ||
      !carriesFiles(data)
    ) {
      return;
    }
    event.preventDefault();
    data.dropEffect = "none";
  };
  // Capture: before the field's own drop, which still hears it and takes
  // a file it wants (a cancelled drop is only one the browser leaves be).
  const drop = (event: DragEvent) => {
    if (carriesFiles(event.dataTransfer) && !isFilePicker(event.target)) {
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
