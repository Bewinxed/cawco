/**
 * A drawing's scroller cut only between lines (a decision page's drawing,
 * where a reader judges a frame and never scrolls it): its top stands at a
 * line's top or in a gap, never through a line, and its frame (`host`,
 * `base` px tall as the split or the sheet gives it) gives up the part of
 * the scroller that would show its last line in half, so its foot stands in
 * the gap after the last line it shows whole. A line is a run of words as
 * drawn, a tile, a button, a field or a progress line.
 *
 * Read again when what the scroller holds changes size or the fonts arrive,
 * each time from the frame's own height, never on a clock: a story's hold
 * on a row (focus.ts) moves on the same changes and goes first, so the cut
 * is made where the scroller stays once its runs end.
 */
import type { Attachment } from "svelte/attachments";
import { frameObserver } from "#lib/cawco/frame-observer.js";
import { drawnBox } from "#lib/cawco/motion/drawn.js";

/** A box drawn as a line: a tile and all it draws (its corner dot stands past its own box), a control, a field, a progress line. */
const BOXES =
  '[data-tile], [data-tile] *, button, input, textarea, [data-slot="progress-line"]';

/** Each line in the scroller, top and foot, in what scrolls. */
function linesIn(node: HTMLElement): [number, number][] {
  const box = drawnBox(node);
  const at = (r: DOMRect, zoom: number): [number, number] => [
    r.top / zoom - box.top + node.scrollTop,
    r.bottom / zoom - box.top + node.scrollTop,
  ];
  const shown = (el: Element) =>
    el.checkVisibility({ opacityProperty: true, visibilityProperty: true });
  const lines: [number, number][] = [];
  const range = document.createRange();
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  for (let text = walker.nextNode(); text; text = walker.nextNode()) {
    const holder = text.parentElement;
    if (!(holder && (text.textContent ?? "").trim() && shown(holder))) {
      continue;
    }
    range.selectNodeContents(text);
    const zoom = holder.currentCSSZoom;
    for (const r of range.getClientRects()) {
      if (r.height > 0) {
        lines.push(at(r, zoom));
      }
    }
  }
  for (const el of node.querySelectorAll(BOXES)) {
    const r = el.getBoundingClientRect();
    if (r.height > 0 && shown(el)) {
      lines.push(at(r, el.currentCSSZoom));
    }
  }
  return lines;
}

/** The nearest `y` past `from` in the direction `step` that no line runs through. */
function gapFrom(
  lines: [number, number][],
  from: number,
  step: 1 | -1
): number {
  let y = from;
  for (;;) {
    const through = lines.find(
      ([top, foot]) => top < y - 0.5 && foot > y + 0.5
    );
    if (!through) {
      return y;
    }
    y = step > 0 ? through[1] : through[0];
  }
}

export function cropWhole(
  host: () => HTMLElement | undefined,
  base: number
): Attachment<HTMLElement> {
  return (node) => {
    const crop = () => {
      const frameBox = host();
      if (!frameBox) {
        return;
      }
      frameBox.style.blockSize = `${base}px`;
      const lines = linesIn(node);
      const top = gapFrom(lines, node.scrollTop, 1);
      node.scrollTop = top;
      const shownTo = node.scrollTop + node.clientHeight;
      const cut = shownTo - gapFrom(lines, shownTo, -1);
      frameBox.style.blockSize = `${base - Math.max(0, cut)}px`;
    };
    // Each answer in the next frame, after a story's hold on a row has
    // moved the scroller on the same change (focus.ts: attached first, so
    // its answer runs first).
    const sizes = frameObserver(crop);
    for (const held of node.children) {
      sizes.observe(held);
    }
    document.fonts.ready.then(sizes.request, sizes.request);
    sizes.request();
    return () => sizes.disconnect();
  };
}
