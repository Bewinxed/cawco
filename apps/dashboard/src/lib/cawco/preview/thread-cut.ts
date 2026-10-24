/**
 * Where a comment's thread is cut at its room's foot (PinCard). A long
 * thread runs on past the room's edge, and the house edge fade says so; but
 * a fade over a gap between blocks, or over a heading whose words lie below
 * the edge, lies over nothing, and the cut reads as the thread's end. So the
 * room's foot is cut on a line of the thread's words: where its own edge
 * falls in a gap, between two lines, or on or under a heading (a markdown
 * heading, a line all bold, a speaker line), the visible edge moves up by the
 * least that puts it inside a line of words above, and the fade lies over
 * that line.
 *
 * The cut is drawn by the room's mask alone (`--fade-inset-end`, the house
 * fade's own inset, edge-fade.css): the room's box, the reply under it and
 * the words in it stay where they stand, so nothing moves when it is set
 * and no observer of their sizes is woken by it. The words the cut hides
 * take no press and no selection: the room's band (its `::after`, as tall
 * as the cut, stuck to the room's foot and adding nothing to its scroll)
 * stands over them, and the scrollbar keeps its whole track beside it.
 *
 * The room is cut again whenever its scroll comes to rest (`scrollend`),
 * so the person's own scroll leaves the cut on words too, only the mask's
 * inset changing; at the thread's end nothing runs past the edge, so
 * nothing is cut and the last words stand on the reply.
 */

/** A heading, a speaker line among them (Who's `h2`). */
const HEADING = "h1, h2, h3, h4, h5, h6";
/** The share of a line's height that stands on each side of a cut through it. */
const HOLD = 0.25;
/** The most a cut moves up, as a share of the room's height: past that, the room keeps its own edge. */
const MOST = 0.5;

/** A line of the thread's words, or a picture in it, on screen, px. */
interface Line {
  bottom: number;
  top: number;
}

/** `el` stands in a heading: a heading element, or a paragraph or item all of whose words are bold. */
const inHeading = (el: Element): boolean => {
  if (el.closest(HEADING)) {
    return true;
  }
  const block = el.closest("p, li");
  const bold = block?.querySelector(":scope > :is(strong, b)");
  return (
    !!(block && bold) &&
    block.children.length === 1 &&
    block.textContent?.trim() === bold.textContent?.trim()
  );
};

/** The lines of words in `list` outside its headings, and its pictures, each by its box on screen. */
const linesIn = (list: Element): Line[] => {
  const lines: Line[] = [];
  const walk = document.createTreeWalker(list, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  for (let node = walk.nextNode(); node; node = walk.nextNode()) {
    const at = node.parentElement;
    if (!(at && node.textContent?.trim()) || inHeading(at)) {
      continue;
    }
    range.selectNodeContents(node);
    for (const box of range.getClientRects()) {
      if (box.width > 0 && box.height > 0) {
        lines.push({ top: box.top, bottom: box.bottom });
      }
    }
  }
  for (const picture of list.querySelectorAll("img, video, canvas")) {
    if (!inHeading(picture)) {
      const box = picture.getBoundingClientRect();
      if (box.height > 0) {
        lines.push({ top: box.top, bottom: box.bottom });
      }
    }
  }
  return lines;
};

/** `at` stands inside `line`, a fair share of the line on each side of it. */
const crosses = (line: Line, at: number) => {
  const hold = (line.bottom - line.top) * HOLD;
  return line.top + hold <= at && at <= line.bottom - hold;
};

/**
 * How far above `room`'s own edge its thread is cut, px: none where the
 * words end inside the room or its edge already crosses a line of them,
 * else the least that puts the cut inside a line above (none if that is
 * more than `MOST` of the room). Measured on screen, where the lines' boxes
 * are, and given in the room's own px: a card still scaling in (its open
 * from the pill) cuts where it will once it stands at its size.
 */
export const threadCut = (room: HTMLElement): number => {
  const list = room.querySelector('[data-slot="thread"]');
  const box = room.getBoundingClientRect();
  if (!(list && room.offsetHeight > 0 && box.height > 0)) {
    return 0;
  }
  const scale = box.height / room.offsetHeight;
  const edge = box.top + (room.clientTop + room.clientHeight) * scale;
  if (list.getBoundingClientRect().bottom <= edge + scale) {
    return 0;
  }
  const lines = linesIn(list);
  if (lines.some((line) => crosses(line, edge))) {
    return 0;
  }
  let at = Number.NEGATIVE_INFINITY;
  for (const line of lines) {
    const hold = (line.bottom - line.top) * HOLD;
    if (line.top + hold <= edge) {
      at = Math.max(at, Math.min(edge, line.bottom - hold));
    }
  }
  const cut = (edge - at) / scale;
  return cut <= room.clientHeight * MOST ? cut : 0;
};

/** Cuts `room`'s thread on its words (`threadCut`), its mask's inset written only when it changes. */
export const cutOnWords = (room: HTMLElement) => {
  const cut = Math.round(threadCut(room));
  const held = Number.parseFloat(
    room.style.getPropertyValue("--fade-inset-end")
  );
  if (cut === (Number.isNaN(held) ? 0 : held)) {
    return;
  }
  if (cut > 0) {
    room.style.setProperty("--fade-inset-end", `${cut}px`);
  } else {
    room.style.removeProperty("--fade-inset-end");
  }
};
