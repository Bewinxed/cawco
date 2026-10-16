/**
 * A mark's picture: the page cropped round a box (the page's px), its ink
 * on it, at the screen's density up to 2 and inside {@link PICTURE_AREA}.
 *
 * The browser gives a page no screenshot of its own rect, so the crop is
 * drawn: only what stands in the box is. From the body down, each element
 * whose box meets the crop is either drawn whole by modern-screenshot (one
 * the crop holds, a replaced element, or one holding text of its own), or,
 * crossing the crop's edge with elements inside, its own background and
 * border are painted and its children are looked at the same way. So the
 * work grows with what the crop shows, never with the size of the element a
 * mark stands on: a crop over the page's top is the same work on a page of
 * ten cards as on one of two thousand. Every part shares one
 * modern-screenshot context (its default-style sandbox made once).
 *
 * Then the person's ink is filled over it from the ink layer's own paths,
 * which stand in the page's px.
 */
import { createContext, destroyContext, domToCanvas } from "modern-screenshot";

export interface Box {
  h: number;
  w: number;
  x: number;
  y: number;
}

/** The pixels a picture may hold, so its PNG stays inside a send's bound. Our call. */
const PICTURE_AREA = 1_200_000;
/** Parts drawn whole in one picture at most; past it, the rest are their boxes alone. Our call. */
const PARTS_MAX = 60;
const PNG_PREFIX = /^data:image\/png;base64,/;
/** What a picture never draws: the overlay's own UI and layers, and what has no box. */
const SKIPPED =
  "cawco-overlay, svg[data-cawco-ink], svg[data-cawco-pins], script, style, template, noscript, link, meta";
/** Elements drawn whole wherever the crop meets them: their insides are not boxes of their own. */
const WHOLE = new Set([
  "img",
  "svg",
  "canvas",
  "video",
  "iframe",
  "frame",
  "input",
  "textarea",
  "select",
  "button",
  "picture",
  "math",
  "object",
  "embed",
]);
/** A colour that paints nothing. */
const CLEAR = new Set(["transparent", "rgba(0, 0, 0, 0)"]);

const meets = (a: Box, b: Box) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

const holds = (outer: Box, inner: Box) =>
  inner.x >= outer.x &&
  inner.y >= outer.y &&
  inner.x + inner.w <= outer.x + outer.w &&
  inner.y + inner.h <= outer.y + outer.h;

const boxOf = (el: Element): Box => {
  const r = el.getBoundingClientRect();
  return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height };
};

/** Whether `el` holds words of its own, beside its child elements: drawn whole, so its text is. */
const ownText = (el: Element) => {
  for (const node of el.childNodes) {
    if (node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) {
      return true;
    }
  }
  return false;
};

/** One step of the picture, in document order: an element drawn whole, or one's own box alone. */
interface Step {
  box: Box;
  el: Element;
  whole: boolean;
}

/** Whether `el`, standing at `at`, is drawn whole in the crop `box`: the crop holds it, or its insides are no boxes of their own. */
const drawnWhole = (el: Element, at: Box, box: Box) =>
  holds(box, at) ||
  WHOLE.has(el.localName) ||
  el.childElementCount === 0 ||
  ownText(el);

/** What of the page the crop `box` shows, from the body down. */
function stepsIn(box: Box): Step[] {
  const steps: Step[] = [];
  let wholes = 0;
  const walk = (parent: Element) => {
    for (const child of parent.children) {
      if (child.matches(SKIPPED)) {
        continue;
      }
      const at = boxOf(child);
      // `display: contents` and its like: no box of its own, its children stand for it.
      const boxless = at.w === 0 && at.h === 0;
      if (boxless || !meets(at, box)) {
        if (boxless) {
          walk(child);
        }
        continue;
      }
      if (wholes < PARTS_MAX && drawnWhole(child, at, box)) {
        wholes += 1;
        steps.push({ el: child, box: at, whole: true });
        continue;
      }
      steps.push({ el: child, box: at, whole: false });
      walk(child);
    }
  };
  if (document.body) {
    walk(document.body);
  }
  return steps;
}

/** An element's own background and border, as its computed style has them, in the page's px. */
function paintBox(ctx: CanvasRenderingContext2D, el: Element, at: Box) {
  const style = getComputedStyle(el);
  const radius = Number.parseFloat(style.borderTopLeftRadius) || 0;
  const shape = () => {
    ctx.beginPath();
    ctx.roundRect(at.x, at.y, at.w, at.h, radius);
  };
  if (!CLEAR.has(style.backgroundColor)) {
    ctx.fillStyle = style.backgroundColor;
    shape();
    ctx.fill();
  }
  const width = Number.parseFloat(style.borderTopWidth) || 0;
  if (width > 0 && style.borderTopStyle !== "none") {
    ctx.strokeStyle = style.borderTopColor;
    ctx.lineWidth = width;
    shape();
    ctx.stroke();
  }
}

/** The canvas's own colour: the root's background, else the body's, else white. */
const groundOf = () => {
  for (const el of [document.documentElement, document.body]) {
    const colour = el ? getComputedStyle(el).backgroundColor : "";
    if (colour && !CLEAR.has(colour)) {
      return colour;
    }
  }
  return "#fff";
};

/** The person's ink as the ink layer draws it now, filled over the crop. */
function paintInk(ctx: CanvasRenderingContext2D) {
  for (const path of document.querySelectorAll<SVGPathElement>(
    "svg[data-cawco-ink] g[data-ink-group] path"
  )) {
    const d = path.getAttribute("d");
    if (d) {
      ctx.fillStyle = path.getAttribute("fill") ?? "currentColor";
      ctx.fill(new Path2D(d));
    }
  }
}

/** The crop `box` within the page's own extent. */
const onPage = (box: Box): Box => {
  const root = document.documentElement;
  const right = Math.max(root.scrollWidth, innerWidth);
  const bottom = Math.max(root.scrollHeight, innerHeight);
  const x = Math.max(0, box.x);
  const y = Math.max(0, box.y);
  return {
    x,
    y,
    w: Math.max(1, Math.min(right, box.x + box.w) - x),
    h: Math.max(1, Math.min(bottom, box.y + box.h) - y),
  };
};

/**
 * The page cropped to `box` (the page's px) with the person's ink, as a
 * base64 PNG; null when nothing could be drawn, `failed` hearing why.
 */
export async function cropPicture(
  wanted: Box,
  failed: (message: string) => void
): Promise<string | null> {
  const box = onPage(wanted);
  const scale = Math.min(
    2,
    devicePixelRatio || 1,
    Math.sqrt(PICTURE_AREA / (box.w * box.h))
  );
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(box.w * scale));
  canvas.height = Math.max(1, Math.round(box.h * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    failed("The browser gave no canvas to draw the mark's picture on.");
    return null;
  }
  ctx.setTransform(scale, 0, 0, scale, -box.x * scale, -box.y * scale);
  ctx.fillStyle = groundOf();
  ctx.fillRect(box.x, box.y, box.w, box.h);
  const steps = stepsIn(box);
  const first = steps.find((step) => step.whole);
  const context = first
    ? await createContext(first.el, {
        scale,
        filter: (node) => !(node instanceof Element && node.matches(SKIPPED)),
      })
    : null;
  try {
    for (const step of steps) {
      if (!step.whole) {
        paintBox(ctx, step.el, step.box);
        continue;
      }
      if (!context) {
        continue;
      }
      context.node = step.el;
      context.width = step.box.w;
      context.height = step.box.h;
      try {
        // biome-ignore lint/performance/noAwaitInLoops: one part at a time, in paint order, on one context
        const part = await domToCanvas(context);
        ctx.drawImage(part, step.box.x, step.box.y, step.box.w, step.box.h);
      } catch (reason) {
        failed(
          `A part of the mark's picture was not drawn: ${reason instanceof Error ? reason.message : String(reason)}`
        );
      }
    }
  } finally {
    if (context) {
      destroyContext(context);
    }
  }
  paintInk(ctx);
  const png = canvas.toDataURL("image/png");
  return PNG_PREFIX.test(png) ? png.replace(PNG_PREFIX, "") : null;
}
