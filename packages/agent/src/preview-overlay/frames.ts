/**
 * Same-origin child frames, as Comment mode reaches into them (Projects spec
 * §5.7): a page whose content stands in a frame of its own origin (a dev
 * server's app hosting its routes in an `<iframe>`) is pointed at element by
 * element, not as one frame. The overlay runs in the top document; every
 * frame's document is read from here, recursively, and its boxes mapped to
 * the top viewport by adding each frame's content-box offset.
 *
 * A frame of another origin cannot be read (the browser's same-origin
 * policy): it stays one element, named by its origin.
 */

const FRAME_TAGS = new Set(["iframe", "frame"]);

export type FrameElement = HTMLIFrameElement | HTMLFrameElement;

export const isFrame = (el: Element | null): el is FrameElement =>
  !!el && FRAME_TAGS.has(el.localName);

/** A frame's document when it is of this origin; null for another origin's. */
export const frameDocument = (frame: FrameElement): Document | null => {
  try {
    return frame.contentDocument;
  } catch {
    return null;
  }
};

/**
 * Whether a same-origin frame's document is still on its way: the browser's
 * first empty document before its own loads, or one still parsing.
 */
export const frameLoading = (frame: FrameElement): boolean => {
  const doc = frameDocument(frame);
  if (!doc) {
    return false;
  }
  const src = frame.getAttribute("src");
  return (
    doc.readyState === "loading" ||
    (doc.URL === "about:blank" && !!src && src !== "about:blank")
  );
};

/** The origin a frame of another origin shows, as its hover label names it. */
export const frameOrigin = (frame: FrameElement): string => {
  try {
    return new URL(frame.src, frame.ownerDocument.baseURI).origin;
  } catch {
    return "another origin";
  }
};

/** Where a frame's viewport starts in its own document's viewport: inside its border and padding. */
const contentBox = (frame: Element) => {
  const r = frame.getBoundingClientRect();
  const style = (frame.ownerDocument.defaultView ?? window).getComputedStyle(
    frame
  );
  const left = Number.parseFloat(style.paddingLeft) || 0;
  const top = Number.parseFloat(style.paddingTop) || 0;
  return {
    x: r.left + frame.clientLeft + left,
    y: r.top + frame.clientTop + top,
    w: frame.clientWidth - left - (Number.parseFloat(style.paddingRight) || 0),
    h: frame.clientHeight - top - (Number.parseFloat(style.paddingBottom) || 0),
  };
};

/** The frames `el` stands in, outermost first; none for the top document's own. */
export const framesOf = (el: Element): FrameElement[] => {
  const chain: FrameElement[] = [];
  let view = el.ownerDocument.defaultView;
  while (view && view !== window) {
    let frame: Element | null = null;
    try {
      frame = view.frameElement;
    } catch {
      frame = null;
    }
    if (!isFrame(frame)) {
      break;
    }
    chain.unshift(frame);
    view = frame.ownerDocument.defaultView;
  }
  return chain;
};

/** `el`'s box in the top viewport: its own, moved by each frame it stands in. */
export const rectOf = (el: Element): DOMRect => {
  const { x, y, width, height } = el.getBoundingClientRect();
  let dx = 0;
  let dy = 0;
  for (const frame of framesOf(el)) {
    const box = contentBox(frame);
    dx += box.x;
    dy += box.y;
  }
  return new DOMRect(x + dx, y + dy, width, height);
};

/** Displays whose box an `overflow` never clips to. */
const UNCLIPPED = new Set(["inline", "contents", "none"]);

/**
 * The boxes in `el`'s own document's viewport that clip it: each ancestor's
 * padding box whose `overflow` is not visible (a scroll container, a
 * transcript, a pane; overflow hidden or clip), up to the first fixed one,
 * which stands in the viewport, not in them. The root's overflow is the
 * viewport's, and so is the body's while the root's is visible.
 */
const clipsIn = (el: Element): DOMRect[] => {
  const doc = el.ownerDocument;
  const view = doc.defaultView ?? window;
  const root = doc.documentElement;
  const clips = (of: CSSStyleDeclaration) =>
    !UNCLIPPED.has(of.display) &&
    (of.overflowX !== "visible" || of.overflowY !== "visible");
  const bodyIsViewport = !clips(view.getComputedStyle(root));
  const boxes: DOMRect[] = [];
  let style = view.getComputedStyle(el);
  for (
    let up = el.parentElement;
    up && up !== root && style.position !== "fixed";
    up = up.parentElement
  ) {
    style = view.getComputedStyle(up);
    if (!(up === doc.body && bodyIsViewport) && clips(style)) {
      const r = up.getBoundingClientRect();
      boxes.push(
        new DOMRect(
          r.left + up.clientLeft,
          r.top + up.clientTop,
          up.clientWidth,
          up.clientHeight
        )
      );
    }
  }
  return boxes;
};

/**
 * The part of the top viewport where a mark on `el` may be seen: each
 * frame's viewport and each box clipping it in its own document (an inner
 * scroll container), mapped to the top one, intersected. Null for an element
 * of the top document nothing clips, which the whole page shows.
 */
export const clipOf = (el: Element): DOMRect | null => {
  const boxes: DOMRect[] = [];
  let dx = 0;
  let dy = 0;
  const moved = (box: DOMRect) =>
    new DOMRect(box.x + dx, box.y + dy, box.width, box.height);
  for (const frame of framesOf(el)) {
    boxes.push(...clipsIn(frame).map(moved));
    const box = contentBox(frame);
    dx += box.x;
    dy += box.y;
    boxes.push(new DOMRect(dx, dy, box.w, box.h));
  }
  boxes.push(...clipsIn(el).map(moved));
  if (boxes.length === 0) {
    return null;
  }
  let left = Number.NEGATIVE_INFINITY;
  let top = Number.NEGATIVE_INFINITY;
  let right = Number.POSITIVE_INFINITY;
  let bottom = Number.POSITIVE_INFINITY;
  for (const box of boxes) {
    left = Math.max(left, box.left);
    top = Math.max(top, box.top);
    right = Math.min(right, box.right);
    bottom = Math.min(bottom, box.bottom);
  }
  return new DOMRect(
    left,
    top,
    Math.max(0, right - left),
    Math.max(0, bottom - top)
  );
};

/**
 * The deepest element at the top viewport's `x`, `y`, starting from `hit`
 * (the top document's own): into each same-origin frame it lands on, the
 * point moved into that frame's viewport. A frame of another origin, or one
 * whose point lands on nothing, is the element.
 */
export const deepElementAt = (
  hit: Element | null,
  x: number,
  y: number
): Element | null => {
  let el = hit;
  let px = x;
  let py = y;
  while (isFrame(el)) {
    const doc = frameDocument(el);
    if (!doc) {
      return el;
    }
    const box = contentBox(el);
    px -= box.x;
    py -= box.y;
    const inner = doc.elementFromPoint(px, py);
    if (!inner || inner.closest("cawco-overlay")) {
      return el;
    }
    el = inner;
  }
  return el;
};

/**
 * Calls `changed` whenever a same-origin frame's document scrolls, resizes,
 * grows, goes back or forward, or a frame loads (a navigation, or a frame
 * added later), at any depth: the marks standing in it are placed again. The
 * top document's own scroll and size are the overlay's.
 */
export function watchFrames(changed: () => void): void {
  const docs = new WeakSet<Document>();
  const frames = new WeakSet<Element>();
  const grown = new ResizeObserver(() => changed());

  const watchFrame = (frame: FrameElement) => {
    if (!frames.has(frame)) {
      frames.add(frame);
      frame.addEventListener("load", () => {
        const doc = frameDocument(frame);
        if (doc) {
          watchDoc(doc);
        }
        changed();
      });
    }
    const doc = frameDocument(frame);
    if (doc) {
      watchDoc(doc);
    }
  };

  const hasFrame = (node: Node) =>
    node instanceof Element &&
    (isFrame(node) || !!node.querySelector("iframe, frame"));

  function watchDoc(doc: Document) {
    for (const frame of doc.querySelectorAll<FrameElement>("iframe, frame")) {
      watchFrame(frame);
    }
    if (docs.has(doc)) {
      return;
    }
    docs.add(doc);
    const view = doc.defaultView;
    if (doc !== document && view) {
      view.addEventListener("scroll", changed, {
        capture: true,
        passive: true,
      });
      view.addEventListener("resize", changed);
      // Its history moving it in place; its pushes are told through its mark (boot.ts).
      view.addEventListener("popstate", changed);
      view.addEventListener("hashchange", changed);
      grown.observe(doc.documentElement);
    }
    // A frame added after load (a route that mounts one) is watched as it comes.
    new MutationObserver((records) => {
      if (records.some((record) => [...record.addedNodes].some(hasFrame))) {
        watchDoc(doc);
        changed();
      }
    }).observe(doc, { childList: true, subtree: true });
  }

  watchDoc(document);
}
