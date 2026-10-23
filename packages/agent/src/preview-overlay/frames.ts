/**
 * Same-origin child frames, as Comment mode reaches into them (Projects spec
 * §5.7): a page whose content stands in a frame of its own origin (a dev
 * server's app hosting its routes in an `<iframe>`) is pointed at element by
 * element, not as one frame. The overlay runs in the top document; every
 * frame's document is read from here, recursively, and its boxes mapped to
 * the top viewport through each frame's content box: its offset, and the
 * scale it is drawn at (a frame shown smaller than its own size, by a
 * transform on it or on what holds it).
 *
 * A frame of another origin cannot be read (the browser's same-origin
 * policy): it stays one element, named by its origin.
 */

const FRAME_TAGS = new Set(["iframe", "frame"]);

export type FrameElement = HTMLIFrameElement | HTMLFrameElement;

export const isFrame = (el: Element | null): el is FrameElement =>
  !!el && FRAME_TAGS.has(el.localName);

/** The windows of every same-origin frame inside `doc`, at any depth. */
export function frameWindows(doc: Document): Window[] {
  return [...doc.querySelectorAll<FrameElement>("iframe, frame")].flatMap(
    (frame) => {
      const inner = frameDocument(frame);
      return inner?.defaultView
        ? [inner.defaultView, ...frameWindows(inner)]
        : [];
    }
  );
}

/**
 * Whether the address a frame was given is of its document's origin: none
 * (about:blank), `srcdoc`, `about:` and `javascript:` inherit it; a `data:`
 * address is an origin of its own. Decided without touching the frame's
 * document: WebKit says every reach into another origin's frame on the
 * console as an error ("Blocked a frame with origin …"), caught or not.
 */
const ownOrigin = (frame: FrameElement): boolean => {
  const src = frame.getAttribute("src");
  if (frame.hasAttribute("srcdoc") || !src) {
    return true;
  }
  try {
    const url = new URL(src, frame.ownerDocument.baseURI);
    return (
      url.protocol === "about:" ||
      url.protocol === "javascript:" ||
      url.origin === (frame.ownerDocument.defaultView ?? window).origin
    );
  } catch {
    return false;
  }
};

/** A frame's document when it is of this origin; null for another origin's. */
export const frameDocument = (frame: FrameElement): Document | null => {
  if (!ownOrigin(frame)) {
    return null;
  }
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

/**
 * A frame's viewport in its own document's viewport: where it starts, inside
 * its border and padding, its size there, and the scale its document is drawn
 * at, its drawn box over its layout box (a transform on the frame or on what
 * holds it; 1 where nothing scales it).
 */
export const contentBox = (frame: FrameElement) => {
  const r = frame.getBoundingClientRect();
  const sx = frame.offsetWidth > 0 ? r.width / frame.offsetWidth : 1;
  const sy = frame.offsetHeight > 0 ? r.height / frame.offsetHeight : 1;
  const style = (frame.ownerDocument.defaultView ?? window).getComputedStyle(
    frame
  );
  const left = Number.parseFloat(style.paddingLeft) || 0;
  const top = Number.parseFloat(style.paddingTop) || 0;
  const w =
    frame.clientWidth - left - (Number.parseFloat(style.paddingRight) || 0);
  const h =
    frame.clientHeight - top - (Number.parseFloat(style.paddingBottom) || 0);
  return {
    x: r.left + (frame.clientLeft + left) * sx,
    y: r.top + (frame.clientTop + top) * sy,
    w: w * sx,
    h: h * sy,
    sx,
    sy,
  };
};

/**
 * How a frame's document maps to the top viewport: a point `p` of its
 * viewport stands at `x + p * sx` (and `y + p * sy`) in the top one.
 */
interface Mapping {
  sx: number;
  sy: number;
  x: number;
  y: number;
}

const TOP: Mapping = { x: 0, y: 0, sx: 1, sy: 1 };

/** `box`, in the viewport `to` maps, in the top viewport. */
const mapped = (to: Mapping, box: DOMRect): DOMRect =>
  new DOMRect(
    to.x + box.x * to.sx,
    to.y + box.y * to.sy,
    box.width * to.sx,
    box.height * to.sy
  );

/** The mapping of `frame`'s document, `frame` standing in the document `to` maps. */
const into = (to: Mapping, frame: FrameElement): Mapping => {
  const box = contentBox(frame);
  return {
    x: to.x + box.x * to.sx,
    y: to.y + box.y * to.sy,
    sx: to.sx * box.sx,
    sy: to.sy * box.sy,
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

/** `el`'s box in the top viewport: its own, moved and scaled by each frame it stands in. */
export const rectOf = (el: Element): DOMRect =>
  mapped(framesOf(el).reduce(into, TOP), el.getBoundingClientRect());

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
  let to = TOP;
  for (const frame of framesOf(el)) {
    boxes.push(...clipsIn(frame).map((clip) => mapped(to, clip)));
    const box = contentBox(frame);
    boxes.push(mapped(to, new DOMRect(box.x, box.y, box.w, box.h)));
    to = into(to, frame);
  }
  boxes.push(...clipsIn(el).map((clip) => mapped(to, clip)));
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
 * point moved and scaled into that frame's viewport. A frame of another origin, or one
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
    px = (px - box.x) / box.sx;
    py = (py - box.y) / box.sy;
    const inner = doc.elementFromPoint(px, py);
    if (!inner || inner.closest("cawco-overlay")) {
      return el;
    }
    el = inner;
  }
  return el;
};

/** Each document's ResizeObserver, by what it calls. */
const sizeObservers = new WeakMap<Document, Map<() => void, ResizeObserver>>();

/**
 * A ResizeObserver of `doc`'s own window calling `changed`, one per
 * document and caller: an element in a frame (an ink group's anchor) is
 * observed from its own window, never the top one. Null for a document
 * with no window.
 */
export function sizesIn(
  doc: Document,
  changed: () => void
): ResizeObserver | null {
  const view = doc.defaultView as (Window & typeof globalThis) | null;
  if (!view) {
    return null;
  }
  const own = sizeObservers.get(doc) ?? new Map<() => void, ResizeObserver>();
  sizeObservers.set(doc, own);
  const known = own.get(changed);
  if (known) {
    return known;
  }
  const made = new view.ResizeObserver(() => changed());
  own.set(changed, made);
  return made;
}

/**
 * Calls `changed` whenever a same-origin frame's document scrolls, resizes,
 * goes back or forward, ends a transition or an animation, or loads
 * something (an image, its fonts, the frame itself on a navigation, a frame
 * added later), at any depth: the marks standing in it are placed again.
 * The top document's own scroll and size are the overlay's, and so is every
 * document's content changing (ink.ts). A frame's root is never observed
 * for its size: observed from either window, Chrome skipped its report on
 * every frame at rest ("ResizeObserver loop completed with undelivered
 * notifications", 60 a second, the probe's b2), and a document with no root
 * yet (a navigation before its first bytes, `document.open()`) threw
 * "parameter 1 is not of type 'Element'".
 */
export function watchFrames(changed: () => void): void {
  const docs = new WeakSet<Document>();
  const frames = new WeakSet<Element>();

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
    const view = doc.defaultView;
    if (docs.has(doc)) {
      return;
    }
    docs.add(doc);
    if (doc !== document && view) {
      view.addEventListener("scroll", changed, {
        capture: true,
        passive: true,
      });
      view.addEventListener("resize", changed);
      // Its history moving it in place; its pushes are told through its mark (boot.ts).
      view.addEventListener("popstate", changed);
      view.addEventListener("hashchange", changed);
      // A transition or an animation in it ended: what it moved stands where it ends.
      view.addEventListener("transitionend", changed, { capture: true });
      view.addEventListener("animationend", changed, { capture: true });
      // Something in it loaded (an image, a frame's page) or its fonts did: what that pushed stands where it is now.
      view.addEventListener("load", changed, { capture: true });
      doc.fonts?.addEventListener("loadingdone", changed);
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
