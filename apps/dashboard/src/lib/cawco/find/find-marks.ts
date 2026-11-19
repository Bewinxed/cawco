/**
 * Find's marks on the words in a transcript, with the platform's CSS Custom
 * Highlight API (`CSS.highlights`, `::highlight()`): every place washed,
 * the one stepped to solid, without wrapping a word of the rows in an
 * element. The transcript is virtualised (virtua mounts and takes down rows
 * as they scroll), so each transcript reads its drawn rows again once a
 * frame while find stands (Transcript), and hands its ranges here; the
 * page's two highlights are every transcript's ranges together.
 *
 * Styled in design.css: `::highlight(find-place)` and `::highlight(find-current)`,
 * matched only under a transcript's list while it holds marks
 * (`data-find-marks` on that list). Carried by the page's root instead, the
 * mark's arrival and its going each restyled every element on the page, the
 * strip, the rail and the composer's places with them: 12k elements, 67ms,
 * as the first word was typed with 29 tabs open.
 */

const PLACE = "find-place";
const CURRENT = "find-current";

/** Each transcript's marks, by its view id, and the list they are under. */
const marks = new Map<
  string,
  { root: Element; places: Range[]; current: Range | null }
>();

const supported = (): boolean =>
  typeof CSS !== "undefined" && "highlights" in CSS;

function draw(): void {
  if (!supported()) {
    return;
  }
  const places: Range[] = [];
  const current: Range[] = [];
  for (const each of marks.values()) {
    places.push(...each.places);
    if (each.current) {
      current.push(each.current);
    }
  }
  CSS.highlights.set(PLACE, new Highlight(...places));
  CSS.highlights.set(CURRENT, new Highlight(...current));
}

/** Transcript `viewId`'s marks gone, and their styles from its list. */
export function unmarkFind(viewId: string): void {
  const was = marks.get(viewId);
  if (was) {
    marks.delete(viewId);
    was.root.removeAttribute("data-find-marks");
    draw();
  }
}

/**
 * Transcript `viewId`'s marks now, under its list `root`: its places
 * washed, `current` solid. The marks' styles match only under a list that
 * holds marks (design.css): a ::highlight() rule standing over an element
 * costs it every style pass.
 */
export function markFind(
  viewId: string,
  root: Element,
  places: Range[],
  current: Range | null
): void {
  if (places.length === 0 && current === null) {
    unmarkFind(viewId);
    return;
  }
  const was = marks.get(viewId);
  if (was && was.root !== root) {
    was.root.removeAttribute("data-find-marks");
  }
  marks.set(viewId, { root, places, current });
  root.toggleAttribute("data-find-marks", true);
  draw();
}

/** Every case-blind run of `words` in the text under `root`, in document order. */
export function rangesOf(root: Element, words: string): Range[] {
  const needle = words.toLowerCase();
  const out: Range[] = [];
  if (!needle) {
    return out;
  }
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = (node.nodeValue ?? "").toLowerCase();
    let at = text.indexOf(needle);
    while (at >= 0) {
      const range = new Range();
      range.setStart(node, at);
      range.setEnd(node, at + needle.length);
      out.push(range);
      at = text.indexOf(needle, at + needle.length);
    }
  }
  return out;
}
