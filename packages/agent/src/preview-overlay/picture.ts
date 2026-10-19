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
import { NON_INHERITED } from "./non-inherited";

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
/**
 * The styles a thumbnail's parts are drawn with: what lays a box out and
 * paints it at a glance. Copying every computed property (about 400 in
 * WebKit, each read and compared) of every element was 6 ms an element on
 * WebKit, on the dashboard's thread; modern-screenshot's own bound for it is
 * `includeStyleProperties` ("This can be useful for performance-critical
 * scenarios"). Our list.
 */
const THUMBNAIL_STYLES = [
  "display",
  "position",
  "top",
  "right",
  "bottom",
  "left",
  "z-index",
  "float",
  "box-sizing",
  "width",
  "height",
  "min-width",
  "min-height",
  "max-width",
  "max-height",
  "margin-top",
  "margin-right",
  "margin-bottom",
  "margin-left",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "flex-direction",
  "flex-wrap",
  "flex-grow",
  "flex-shrink",
  "flex-basis",
  "order",
  "align-items",
  "align-self",
  "align-content",
  "justify-content",
  "justify-items",
  "justify-self",
  "row-gap",
  "column-gap",
  "grid-template-columns",
  "grid-template-rows",
  "grid-template-areas",
  "grid-auto-flow",
  "grid-auto-columns",
  "grid-auto-rows",
  "grid-column-start",
  "grid-column-end",
  "grid-row-start",
  "grid-row-end",
  "overflow-x",
  "overflow-y",
  "visibility",
  "opacity",
  "transform",
  "transform-origin",
  "aspect-ratio",
  "object-fit",
  "color",
  "background-color",
  "background-image",
  "background-size",
  "background-position-x",
  "background-position-y",
  "background-repeat",
  "border-top-width",
  "border-right-width",
  "border-bottom-width",
  "border-left-width",
  "border-top-style",
  "border-right-style",
  "border-bottom-style",
  "border-left-style",
  "border-top-color",
  "border-right-color",
  "border-bottom-color",
  "border-left-color",
  "border-top-left-radius",
  "border-top-right-radius",
  "border-bottom-right-radius",
  "border-bottom-left-radius",
  "box-shadow",
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "line-height",
  "letter-spacing",
  "text-align",
  "text-transform",
  "text-decoration-line",
  "text-overflow",
  "white-space",
  "overflow-wrap",
  "word-break",
  "vertical-align",
  "list-style-type",
  "fill",
  "stroke",
  "stroke-width",
];
/**
 * The longest a picture's clone holds the page's thread before it lets it
 * go for a task. modern-screenshot clones a part as one chain of promises,
 * every element's computed style read and compared, and never yields: a part
 * holding a frame of 400 elements was 120 ms in one go, on the dashboard's
 * own thread under WebKit, which runs every frame there. Our call: half a
 * frame at 60 Hz.
 */
const SLICE_MS = 8;

/**
 * A breath for the clone to take at each node it copies (modern-screenshot
 * awaits `onCloneEachNode`): once `SLICE_MS` has run since the last, a
 * timer's task lets the thread go to the page and the dashboard. No worker
 * can take the work: it reads the page's live DOM and styles.
 */
const breather = () => {
  let from = performance.now();
  return async () => {
    if (performance.now() - from < SLICE_MS) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
    from = performance.now();
  };
};

/** A family name as fonts are matched: unquoted, in lower case. */
const familyKey = (name: string) =>
  name
    .trim()
    .replace(/^["']|["']$/g, "")
    .toLowerCase();

/** The families only `doc`'s own font faces give (its `@font-face`), by {@link familyKey}. */
const webFamilies = (doc: Document) =>
  new Set([...doc.fonts].map((face) => familyKey(face.family)));

/**
 * `el`'s copied `font-family` without the families in `web`. A thumbnail
 * embeds none of the page's web fonts, so its image never finds them, and
 * WebKit looks each one up and misses for every face the part sets: on a
 * phone page cloned whole that was half its image's load, 160 ms of the
 * dashboard's thread in one task. The face it falls to is the same.
 */
function dropWebFamilies(el: Node, web: Set<string>) {
  const { style } = el as HTMLElement;
  const value = style?.getPropertyValue("font-family");
  if (!value) {
    return;
  }
  const families = value.split(",");
  const kept = families.filter((name) => !web.has(familyKey(name)));
  // None left: the declaration stands, so the element never takes its parent's.
  if (kept.length > 0 && kept.length < families.length) {
    style.setProperty(
      "font-family",
      kept.map((name) => name.trim()).join(", "),
      style.getPropertyPriority("font-family")
    );
  }
}

const SVG_NS = "http://www.w3.org/2000/svg";
/**
 * What a copy's own box resolves: its size (modern-screenshot always copies
 * it, its defaults never hold it) and the origins whose default, 50% 50%, is
 * read back in px of the box ("The transform-origin property is a resolved
 * value special case property like height", drafts.csswg.org/css-transforms-1;
 * `perspective-origin` the same, css-transforms-2). A twin's box is not the
 * copy's, so its value would match only by chance: a frame's copy scaled from
 * `0px 0px` lost its origin to a twin's and drew off its place.
 */
const SIZES = new Set([
  "width",
  "height",
  "transform-origin",
  "perspective-origin",
]);

/** A name's group as modern-screenshot's diff counts it: the name up to its last hyphen, "" for none. */
const groupOf = (name: string) => {
  const at = name.lastIndexOf("-");
  return at > 0 ? name.slice(0, at) : "";
};

/** The attributes that change a tag's own style, carried by its twin. */
const twinAttributes = (el: Element) => {
  if (el.namespaceURI === SVG_NS) {
    return ["stroke", "fill"];
  }
  return el.localName === "input" ? ["type"] : [];
};

const twinKey = (el: Element) =>
  [
    el.namespaceURI === SVG_NS ? "svg" : "",
    el.localName,
    ...twinAttributes(el).map((name) => el.getAttribute(name) ?? ""),
  ].join(":");

/** `el`'s twin, placed in `blank`'s body: an SVG shape inside an `svg` of its own. */
function placeTwin(blank: Document, el: Element): Element {
  const svg = el.namespaceURI === SVG_NS;
  const made = svg
    ? blank.createElementNS(SVG_NS, el.localName)
    : blank.createElement(el.localName);
  for (const name of twinAttributes(el)) {
    const value = el.getAttribute(name);
    if (value !== null) {
      made.setAttribute(name, value);
    }
  }
  made.textContent = " ";
  if (svg && el.localName !== "svg") {
    const root = blank.createElementNS(SVG_NS, "svg");
    root.append(made);
    blank.body.append(root);
  } else {
    blank.body.append(made);
  }
  return made;
}

/**
 * The browser's own style for an element with no style of its own: a twin of
 * its tag (an input's type and an SVG shape's `stroke` and `fill` with it),
 * standing in a {@link blankFrame} of ours, read a property at a time as
 * asked; the frame goes with {@link UaDefaults.close}.
 */
interface UaDefaults {
  close: () => void;
  /** A property's value on `el`'s twin, or on its `pseudo` (`::before`) when given: the twin found once, each name read once. */
  of: (el: Element, pseudo?: string) => (name: string) => string;
}

/**
 * A hidden frame in `doc` holding a blank standards-mode document (as the
 * picture's SVG draws in), written at once: its body stands from the first
 * read, with no navigation to land later. It stands inside the overlay's host
 * when it has one, so none of the page's observers see it.
 */
function blankFrame(doc: Document): HTMLIFrameElement {
  const frame = doc.createElement("iframe");
  frame.width = "0";
  frame.height = "0";
  frame.style.cssText = "position:fixed;visibility:hidden;border:0";
  (
    doc.querySelector("cawco-overlay")?.shadowRoot ?? doc.documentElement
  ).append(frame);
  const blank = frame.contentDocument;
  blank?.open();
  blank?.write("<!DOCTYPE html><title></title><body>");
  blank?.close();
  return frame;
}

function uaDefaults(doc: Document): UaDefaults {
  let frame: HTMLIFrameElement | null = null;
  const twins = new Map<
    string,
    { read: Map<string, string>; style: CSSStyleDeclaration }
  >();
  const sandbox = () => {
    frame ??= blankFrame(doc);
    return frame;
  };
  const twinOf = (el: Element, pseudo: string | null) => {
    const key = `${twinKey(el)}:${pseudo ?? ""}`;
    let twin = twins.get(key);
    if (!twin) {
      const blank = sandbox().contentDocument;
      const view = blank?.defaultView;
      if (!(blank && view)) {
        return null;
      }
      twin = {
        read: new Map(),
        style: view.getComputedStyle(placeTwin(blank, el), pseudo),
      };
      twins.set(key, twin);
    }
    return twin;
  };
  return {
    of: (el, pseudo) => {
      const twin = twinOf(el, pseudo ?? null);
      if (!twin) {
        return () => "";
      }
      return (name) => {
        let value = twin.read.get(name);
        if (value === undefined) {
          value = twin.style.getPropertyValue(name);
          twin.read.set(name, value);
        }
        return value;
      };
    },
    close: () => {
      frame?.remove();
      frame = null;
      twins.clear();
    },
  };
}

/**
 * `el`'s copied style without what restates its tag's default. modern-screenshot
 * copies a property whenever the parent's copy declares it, inherited or not,
 * and a whole group (a name up to its last hyphen) when one member is copied,
 * so a page's copy grew to say every element's defaults over again: on the
 * heavy phone page 485 KB of declarations, an 864 KB SVG for the dashboard's
 * thread to decode. A non-inherited property ({@link NON_INHERITED}) takes its
 * tag's default whatever the parent says, so one equal to it is dropped, unless
 * a member of its group says something of its own (a `border-top-width` of 0
 * stays with a `solid` style). Inherited ones stay: the parent's copy may differ.
 * `parent` is the parent's copy, as modern-screenshot left it.
 */
function slim(
  el: Element,
  parent: CSSStyleDeclaration | null,
  defaults: UaDefaults
) {
  const { style } = el as HTMLElement;
  if (!style?.length) {
    return;
  }
  // Each a call into a copy's style, so the cheap tests go first and the
  // priority, which only a dropped name needs, last.
  const fallback = defaults.of(el);
  const says = (name: string) =>
    SIZES.has(name) ||
    (!NON_INHERITED.has(name) && parent?.getPropertyValue(name)) ||
    style.getPropertyValue(name) !== fallback(name) ||
    style.getPropertyPriority(name) !== "";
  for (const name of silent(Array.from(style), says)) {
    style.removeProperty(name);
  }
}

/**
 * Of `names`, the non-inherited ones that say nothing and share no group with
 * one that does: what {@link slim} drops. A name is asked only when its answer
 * can change that: a non-inherited one whose group no name has spoken for yet,
 * then an inherited one whose group holds a quiet name.
 */
function silent(names: string[], says: (name: string) => unknown) {
  const speaking = new Set<string>();
  const quiet: string[] = [];
  const inherited: string[] = [];
  for (const name of names) {
    const group = groupOf(name);
    if (!NON_INHERITED.has(name)) {
      inherited.push(name);
    } else if (!(group && speaking.has(group))) {
      if (says(name)) {
        speaking.add(group);
      } else {
        quiet.push(name);
      }
    }
  }
  const open = new Set(
    quiet.map(groupOf).filter((group) => group && !speaking.has(group))
  );
  for (const name of inherited) {
    const group = groupOf(name);
    if (open.has(group) && says(name)) {
      speaking.add(group);
      open.delete(group);
    }
  }
  return new Set(
    quiet.filter((name) => {
      const group = groupOf(name);
      return !(group && speaking.has(group));
    })
  );
}

/**
 * modern-screenshot's rule for a copied `::before` or `::after`, in the form
 * it writes into the picture's `<style>`: its selectors (`.u1a2b3::before`),
 * then a declaration a line.
 */
const PSEUDO_RULE = /([^{}]+)\{\n {2}([^{}]*)\n\}\n/g;
const DECLARATION = /^([-\w]+): (.*?)( !important)?;$/s;

/**
 * A copied pseudo-element's rule without what restates its default, by
 * {@link slim}'s measure (an inherited name always stays, as does its
 * `content`); null to leave it as it is, when nothing goes or any part of it
 * is not in the form above.
 */
function slimRule(
  svg: SVGSVGElement,
  selectors: string,
  body: string,
  defaults: UaDefaults
): string | null {
  const hosts: { host: Element; pseudo: string }[] = [];
  for (const selector of selectors.trim().split(",\n")) {
    const at = selector.indexOf("::");
    const host =
      at > 1 ? svg.getElementsByClassName(selector.slice(1, at))[0] : null;
    if (!host) {
      return null;
    }
    hosts.push({ host, pseudo: selector.slice(at) });
  }
  const lines = body.split("\n  ");
  const declared = new Map<string, { important: boolean; value: string }>();
  for (const line of lines) {
    const parts = DECLARATION.exec(line);
    if (!parts) {
      return null;
    }
    declared.set(parts[1], { value: parts[2], important: Boolean(parts[3]) });
  }
  const fallbacks = hosts.map(({ host, pseudo }) => defaults.of(host, pseudo));
  const says = (name: string) => {
    const { value, important } = declared.get(name) ?? {};
    return (
      name === "content" ||
      important ||
      SIZES.has(name) ||
      !NON_INHERITED.has(name) ||
      fallbacks.some((fallback) => fallback(name) !== value)
    );
  };
  const dropped = silent([...declared.keys()], says);
  if (dropped.size === 0) {
    return null;
  }
  const kept = lines.filter(
    (line) => !dropped.has(DECLARATION.exec(line)?.[1] ?? "")
  );
  return `${selectors}{\n  ${kept.join("\n  ")}\n}\n`;
}

/** {@link slimRule} for every rule of `svg`'s own `<style>`, a breath between rules. */
async function slimPseudoRules(
  svg: SVGSVGElement,
  defaults: UaDefaults,
  breathe: () => Promise<void>
) {
  const sheet = svg.querySelector(":scope > style");
  const text = sheet?.textContent;
  if (!(sheet && text)) {
    return;
  }
  const slimmed: (string | null)[] = [];
  for (const [, selectors, body] of text.matchAll(PSEUDO_RULE)) {
    slimmed.push(slimRule(svg, selectors, body, defaults));
    // biome-ignore lint/performance/noAwaitInLoops: a slice of the page's thread at a time
    await breathe();
  }
  let next = 0;
  sheet.textContent = text.replace(PSEUDO_RULE, (whole) => {
    const rule = slimmed[next] ?? whole;
    next += 1;
    return rule;
  });
}

/** {@link slim} for each element child of `node`, whose own copy still stands as made. */
function slimChildren(node: Node, defaults: UaDefaults) {
  if (node.nodeType !== Node.ELEMENT_NODE) {
    return;
  }
  const { style } = node as HTMLElement;
  for (const child of (node as Element).children) {
    slim(child, style ?? null, defaults);
  }
}

const PNG_PREFIX = /^data:image\/png;base64,/;
/** What a picture never draws: the overlay's own UI and layers, and what has no box. */
export const SKIPPED =
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

/** `el`'s box in its own document's px (its window's scroll added). */
const boxOf = (el: Element): Box => {
  const r = el.getBoundingClientRect();
  const view = el.ownerDocument.defaultView ?? window;
  return {
    x: r.left + view.scrollX,
    y: r.top + view.scrollY,
    w: r.width,
    h: r.height,
  };
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

/** What of the page in `doc` the crop `box` shows, from the body down. */
function stepsIn(doc: Document, box: Box): Step[] {
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
  if (doc.body) {
    walk(doc.body);
  }
  return steps;
}

/** An element's own background and border, as its computed style has them, in the page's px. */
function paintBox(
  ctx: CanvasRenderingContext2D,
  view: Window,
  el: Element,
  at: Box
) {
  const style = view.getComputedStyle(el);
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

/**
 * The canvas's own colour: the root's background, else the body's, else the
 * browser's own canvas in the scheme the root draws in (`Canvas`, dark under
 * a dark `color-scheme`), as the page is painted on it.
 */
export const groundOf = (view: Window) => {
  const doc = view.document;
  for (const el of [doc.documentElement, doc.body]) {
    const colour = el ? view.getComputedStyle(el).backgroundColor : "";
    if (colour && !CLEAR.has(colour)) {
      return colour;
    }
  }
  return canvasOf(view);
};

/**
 * The browser's `Canvas` colour in the scheme `view`'s root draws in, read
 * off a probe that takes the root's `color-scheme`; the probe stands for one
 * read and goes, inside `view`'s own overlay host when it has one (a mutation
 * there reaches none of the page's observers), else at its root.
 */
function canvasOf(view: Window): string {
  const doc = view.document;
  const root = doc.documentElement;
  const probe = doc.createElement("i");
  probe.style.cssText = `all:initial;position:fixed;inline-size:0;block-size:0;visibility:hidden;color-scheme:${view.getComputedStyle(root).colorScheme};background-color:Canvas`;
  const host = doc.querySelector("cawco-overlay")?.shadowRoot ?? root;
  host.append(probe);
  const colour = view.getComputedStyle(probe).backgroundColor;
  probe.remove();
  return colour && !CLEAR.has(colour) ? colour : "#fff";
}

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
const onPage = (view: Window, box: Box): Box => {
  const root = view.document.documentElement;
  const right = Math.max(root.scrollWidth, view.innerWidth);
  const bottom = Math.max(root.scrollHeight, view.innerHeight);
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
 * base64 PNG of at most `area` pixels; null when nothing could be drawn,
 * `failed` hearing why. `view` is the window drawn, this page's own unless
 * a copy of it in another scheme is (schemes.ts); the ink is always this
 * page's, which stands in the same px. A `thumbnail` is drawn for a glance: its parts
 * carry {@link THUMBNAIL_STYLES} alone, no scrollbar styles, and the
 * system's faces for the page's web fonts (each part's SVG stays small, and
 * decoding it runs on the page's thread: "the last step, decoding the
 * svg+xml into an image, can't be done in a Web Worker… the bigger it is,
 * the longer the decode", modern-screenshot's maintainer,
 * github.com/qq15725/modern-screenshot/issues/18), and asks it for none of
 * the page's web font families ({@link dropWebFamilies}). Every picture's
 * clone runs in slices ({@link breather}), so the page's thread, and on
 * WebKit the dashboard's, is never held for the whole of it, and says no
 * tag's default over again ({@link slim}).
 */
export async function cropPicture(
  wanted: Box,
  failed: (message: string) => void,
  {
    area,
    thumbnail,
    view = window,
  }: { area: number; thumbnail: boolean; view?: Window } = {
    area: PICTURE_AREA,
    thumbnail: false,
  }
): Promise<string | null> {
  const box = onPage(view, wanted);
  const scale = Math.min(
    2,
    view.devicePixelRatio || 1,
    Math.sqrt(area / (box.w * box.h))
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
  ctx.fillStyle = groundOf(view);
  ctx.fillRect(box.x, box.y, box.w, box.h);
  const steps = stepsIn(view.document, box);
  const first = steps.find((step) => step.whole);
  const breathe = breather();
  const web = thumbnail ? webFamilies(view.document) : null;
  const defaults = uaDefaults(view.document);
  const context = first
    ? await createContext(first.el, {
        scale,
        // Each node's children are copied before it: its own copy stands as
        // made while theirs are slimmed, and the part's root is slimmed last.
        onCloneEachNode: (node) => {
          if (web) {
            dropWebFamilies(node, web);
          }
          slimChildren(node, defaults);
          return breathe();
        },
        onCloneNode: (root) => {
          if (root.nodeType === Node.ELEMENT_NODE) {
            slim(root as Element, null, defaults);
          }
        },
        // The copied pseudo-elements' rules, before the SVG is serialized.
        onCreateForeignObjectSvg: (svg) =>
          slimPseudoRules(svg, defaults, breathe),
        // By node type, not `instanceof`: a copy's nodes are another window's.
        filter: (node) =>
          !(
            node.nodeType === Node.ELEMENT_NODE &&
            (node as Element).matches(SKIPPED)
          ),
        ...(thumbnail
          ? {
              font: false as const,
              features: { copyScrollbar: false },
              includeStyleProperties: THUMBNAIL_STYLES,
            }
          : {}),
      })
    : null;
  // modern-screenshot's own sandbox (its `Context.sandbox`) is a frame it
  // gives a `srcdoc` and reads at once; a slice's task lets that navigation
  // land mid-clone, and the next default it reads finds a document with no
  // body yet ("Cannot read properties of null (reading 'appendChild')", the
  // heavy page's mark on Chromium). One written whole has its body from the
  // start; `destroyContext` removes it.
  if (context) {
    context.sandbox = blankFrame(view.document);
  }
  try {
    for (const step of steps) {
      if (!step.whole) {
        paintBox(ctx, view, step.el, step.box);
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
    defaults.close();
    if (context) {
      destroyContext(context);
    }
  }
  paintInk(ctx);
  const png = canvas.toDataURL("image/png");
  return PNG_PREFIX.test(png) ? png.replace(PNG_PREFIX, "") : null;
}
