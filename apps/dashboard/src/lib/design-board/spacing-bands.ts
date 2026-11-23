/**
 * Every padding and gap inside a laid-out piece, as bands over it: where each
 * space sits relative to the piece, and its size. Read off the browser's
 * layout, so the board names the spaces the product really draws.
 */

/** A measured space: where it sits over the piece, and its size in px. */
export interface Band {
  h: number;
  px: number;
  w: number;
  x: number;
  y: number;
}

/** Hairlines are edges, not spaces; anything from 2px up was chosen. */
const chosen = (px: number) => px >= 2;

function paddings(
  box: DOMRect,
  style: CSSStyleDeclaration,
  origin: DOMRect
): Band[] {
  const x = box.left - origin.left;
  const y = box.top - origin.top;
  const top = Number.parseFloat(style.paddingTop);
  const right = Number.parseFloat(style.paddingRight);
  const bottom = Number.parseFloat(style.paddingBottom);
  const left = Number.parseFloat(style.paddingLeft);
  const bands: Band[] = [
    { x, y, w: box.width, h: top, px: top },
    { x, y: y + box.height - bottom, w: box.width, h: bottom, px: bottom },
    { x, y, w: left, h: box.height, px: left },
    { x: x + box.width - right, y, w: right, h: box.height, px: right },
  ];
  return bands.filter((band) => chosen(band.px));
}

function gaps(
  element: Element,
  box: DOMRect,
  style: CSSStyleDeclaration,
  origin: DOMRect
): Band[] {
  if (!(style.display.includes("flex") || style.display.includes("grid"))) {
    return [];
  }
  const column = Number.parseFloat(style.columnGap);
  const row = Number.parseFloat(style.rowGap);
  const children = [...element.children]
    .map((child) => child.getBoundingClientRect())
    .filter((rect) => rect.height > 0 && rect.width > 0);
  const bands: Band[] = [];
  for (let index = 1; index < children.length; index += 1) {
    const before = children[index - 1];
    const after = children[index];
    const sameLine = after.top < before.bottom && after.left >= before.right;
    if (sameLine && chosen(column)) {
      const top = Math.min(before.top, after.top);
      bands.push({
        x: after.left - column - origin.left,
        y: top - origin.top,
        w: column,
        h: Math.max(before.bottom, after.bottom) - top,
        px: column,
      });
    } else if (!sameLine && chosen(row) && after.top >= before.bottom) {
      bands.push({
        x: box.left - origin.left,
        y: after.top - row - origin.top,
        w: box.width,
        h: row,
        px: row,
      });
    }
  }
  return bands;
}

/** A space runs across (a padding at a side, a gap between columns) or down. */
export const across = (band: Band) => band.w === band.px;

function spacesOf(element: Element, origin: DOMRect): Band[] {
  const box = element.getBoundingClientRect();
  if (box.width === 0 || box.height === 0) {
    return [];
  }
  const style = getComputedStyle(element);
  return [
    ...paddings(box, style, origin),
    ...gaps(element, box, style, origin),
  ];
}

/**
 * The spaces that set a piece's rhythm, one of each: its own padding, the gap
 * between its parts, and the padding inside its first part. A space already
 * shown at its size and direction is not shown again.
 */
export function keySpacesIn(piece: HTMLElement): Band[] {
  const origin = piece.getBoundingClientRect();
  const root = piece.firstElementChild;
  if (!root) {
    return [];
  }
  const first = [...root.querySelectorAll("*")].find(
    (element) => spacesOf(element, origin).length > 0
  );
  const seen = new Set<string>();
  return [
    ...spacesOf(root, origin),
    ...(first ? spacesOf(first, origin) : []),
  ].filter((band) => {
    const key = `${across(band)}:${band.px}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}
