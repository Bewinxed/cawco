/**
 * A finger drawing a row to the left takes it off the list: the row follows
 * the finger, uncovering "Archive" behind it (`--swipe`, the distance), and a
 * release past a third of the row commits; short of it, the row slides back.
 * Only a finger: a pointer has the Archive button and the menu. A drag that
 * starts mostly up or down is the list scrolling, and is left to it (the
 * host sets `touch-action: pan-y`), as is the long-press that opens the menu.
 */
import type { Attachment } from "svelte/attachments";

/** How far a finger moves before the drag is read as a swipe or a scroll. */
const SLOP = 8;

export function swipeToArchive(onarchive: () => void): Attachment<HTMLElement> {
  return (node) => {
    let pointer: number | null = null;
    let x0 = 0;
    let y0 = 0;
    let swiping = false;
    let dx = 0;

    const reset = () => {
      pointer = null;
      swiping = false;
      dx = 0;
      node.removeAttribute("data-swiping");
      node.style.removeProperty("--swipe");
    };
    /** A committed swipe's tap must not open the row it just archived. */
    const swallowClick = () =>
      node.addEventListener(
        "click",
        (event) => {
          event.preventDefault();
          event.stopPropagation();
        },
        { capture: true, once: true }
      );

    const down = (event: PointerEvent) => {
      if (event.pointerType !== "touch" || pointer !== null) {
        return;
      }
      pointer = event.pointerId;
      x0 = event.clientX;
      y0 = event.clientY;
    };
    const move = (event: PointerEvent) => {
      if (event.pointerId !== pointer) {
        return;
      }
      dx = Math.min(0, event.clientX - x0);
      const dy = event.clientY - y0;
      if (!swiping) {
        if (Math.abs(dy) > SLOP && Math.abs(dy) > Math.abs(dx)) {
          reset();
          return;
        }
        if (-dx <= SLOP) {
          return;
        }
        swiping = true;
        node.setPointerCapture(event.pointerId);
        node.setAttribute("data-swiping", "");
      }
      node.style.setProperty("--swipe", `${-dx}px`);
    };
    const up = (event: PointerEvent) => {
      if (event.pointerId !== pointer) {
        return;
      }
      const commit = swiping && -dx > node.offsetWidth / 3;
      if (swiping) {
        swallowClick();
      }
      if (commit) {
        // It leaves from where the finger left it: the list's reflow takes
        // its copy from here, so it is not drawn back first.
        pointer = null;
        onarchive();
        return;
      }
      reset();
    };

    node.addEventListener("pointerdown", down);
    node.addEventListener("pointermove", move);
    node.addEventListener("pointerup", up);
    node.addEventListener("pointercancel", reset);
    return () => {
      node.removeEventListener("pointerdown", down);
      node.removeEventListener("pointermove", move);
      node.removeEventListener("pointerup", up);
      node.removeEventListener("pointercancel", reset);
    };
  };
}
