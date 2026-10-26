/**
 * Where a card or a menu hanging from a folder tab stands (PaneTabs, and the
 * session card's states frame): the shape's own rule (`placeHang`), its top
 * edge running out of each foot's tip, level, to a corner (`radius-lg`) a
 * short run (`HANG_RUN`) past it, within the pane's leading edge (the
 * strip's box) and the room's margins. The room is the hang layer the card
 * stands in (hang-layer): the window in the app, a frame's box on a canvas.
 */
import { placeHang } from "#lib/cawco/motion/hang-shape.js";

/** Their corner (`radius-lg`) and the level run from a foot's tip to it. */
const HANG_CORNER = 12;
const HANG_RUN = 4;
/** Their margin to the room's edges. */
const HANG_MARGIN = 12;
/** The session card's width at most. */
const CARD_W = 416;

const flareOf = (anchor: HTMLElement) =>
  Number.parseFloat(
    getComputedStyle(
      anchor.querySelector('[data-slot="ff-tab"]') ?? anchor
    ).getPropertyValue("--flare")
  ) || 0;

/**
 * Where a hang `width` wide stands under `anchor` in `room`: its offset from
 * the tab's leading edge (the primitive's `alignOffset`), its width, and the
 * side it stands flush on, if any. `touch`: a finger's screen, which keeps
 * the margin on the leading side too.
 */
export function placeUnder(
  anchor: HTMLElement,
  width: number,
  room: DOMRect,
  touch: boolean
) {
  const box = anchor.getBoundingClientRect();
  const pane = anchor.closest("[data-session-tabs]")?.getBoundingClientRect();
  const place = placeHang({
    bounds: {
      left: Math.max(
        pane?.left ?? room.left,
        room.left + (touch ? HANG_MARGIN : 0)
      ),
      right: room.right - HANG_MARGIN,
    },
    corner: HANG_CORNER,
    flare: flareOf(anchor),
    run: HANG_RUN,
    tab: { left: box.left, right: box.right },
    width,
  });
  let flush: "start" | "end" | null = null;
  if (place.flush.start) {
    flush = "start";
  } else if (place.flush.end) {
    flush = "end";
  }
  return { offset: place.left - box.left, width: place.width, flush };
}

/** The session card's width: 416px, within the room less its margins. */
export const cardWidthIn = (room: DOMRect) =>
  Math.min(CARD_W, room.width - 2 * HANG_MARGIN);
