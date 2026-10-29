/**
 * Change marks on the stage (the owner's pick "washes", Projects spec
 * §5.10): while a hover previews a state that differs from the kept one,
 * a wash behind every value that came in or changed, and one where a value
 * went, at its old box. A value is an element that says something of its
 * own (its own words, a field's value, a picture); two states' values are
 * matched by where they stand in their frame's tree, and a value that
 * matches with other words, another value or other classes changed. A
 * wash follows The One Target Rule: on an element that draws a box (a
 * fill, an edge or a shadow) exactly on that box; on a bare one
 * `--c-target-gap` outside it. A gone value whose place the preview fills
 * with something else is marked in the seam nearest where it stood, never
 * over what the preview shows; with no seam it is not marked.
 */

/** A value's box, in the world's own coordinates (before its transform). */
interface Box {
  h: number;
  w: number;
  x: number;
  y: number;
}

interface Value {
  box: Box;
  /** Whether the element draws a box of its own. */
  boxed: boolean;
  classes: string;
  key: string;
  radius: number;
  said: string;
}

/** The most elements a frame's values are read from. Ours: a screen's first screenful (measure.ts). */
const ELEMENTS_READ = 600;
/** A value's media: what it shows is its source, not words. */
const MEDIA = new Set(["img", "svg", "video", "canvas", "picture"]);
const FIELDS = new Set(["input", "textarea", "select"]);
/** Classes a build writes per module (Svelte's, CSS modules'): a state's tree is matched by the project's own. */
const HASH_CLASS = /^(svelte-[\w-]+|s-[\w-]{6,}|[\w-]+_[\w-]{5,})$/;

const CLEAR = /^(transparent|rgba\(0, 0, 0, 0\))$/;

const drawsBox = (style: CSSStyleDeclaration): boolean => {
  const fill = !CLEAR.test(style.backgroundColor);
  const edge = (["Top", "Right", "Bottom", "Left"] as const).some(
    (side) =>
      Number.parseFloat(style[`border${side}Width`]) > 0 &&
      style[`border${side}Style`] !== "none"
  );
  return fill || edge || style.boxShadow !== "none";
};

/** What an element says of its own: its own words, a field's value, a picture's source; null when it says nothing. */
function saidBy(el: Element): string | null {
  const tag = el.localName;
  if (FIELDS.has(tag)) {
    return `${tag}:${(el as HTMLInputElement).value}`;
  }
  if (MEDIA.has(tag)) {
    return `${tag}:${el.getAttribute("src") ?? el.getAttribute("href") ?? ""}`;
  }
  const own = [...el.childNodes]
    .filter((one) => one.nodeType === Node.TEXT_NODE)
    .map((one) => one.textContent ?? "")
    .join(" ")
    .replaceAll(/\s+/g, " ")
    .trim();
  return own || null;
}

/** An element's step in its frame's tree: its tag and the project's classes. */
const stepOf = (el: Element): string =>
  [
    el.localName,
    ...[...el.classList]
      .filter((one) => !(HASH_CLASS.test(one) || one.startsWith("cawco-")))
      .sort(),
  ].join(".");

/**
 * A frame body's values: each keyed by its steps down from the body and its
 * place among the values with the same steps, boxed relative to the body's
 * own corner (unscaled by the world's zoom).
 */
function valuesOf(body: HTMLElement, zoom: number): Map<string, Value> {
  const origin = body.getBoundingClientRect();
  const out = new Map<string, Value>();
  const seen = new Map<string, number>();
  const paths = new Map<Element, string>([[body, ""]]);
  const all = [...body.querySelectorAll("*")].slice(0, ELEMENTS_READ);
  for (const el of all) {
    const parent = el.parentElement;
    const path = `${(parent && paths.get(parent)) ?? ""}>${stepOf(el)}`;
    paths.set(el, path);
    const said = saidBy(el);
    if (said === null) {
      continue;
    }
    const rect = el.getBoundingClientRect();
    if (rect.width < 0.5 || rect.height < 0.5) {
      continue;
    }
    const style = getComputedStyle(el);
    if (style.visibility === "hidden" || Number(style.opacity) === 0) {
      continue;
    }
    const at = seen.get(path) ?? 0;
    seen.set(path, at + 1);
    out.set(`${path}#${at}`, {
      key: `${path}#${at}`,
      said,
      classes: [...el.classList].sort().join(" "),
      boxed: drawsBox(style),
      radius: Number.parseFloat(style.borderTopLeftRadius) || 0,
      box: {
        x: (rect.left - origin.left) / zoom,
        y: (rect.top - origin.top) / zoom,
        w: rect.width / zoom,
        h: rect.height / zoom,
      },
    });
  }
  return out;
}

const overlaps = (a: Box, b: Box): boolean =>
  Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 0.5 &&
  Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 0.5;

/** One wash as drawn: its kind, its box in the world and its radius. */
export interface Wash {
  box: Box;
  kind: "add" | "del";
  radius: number;
}

/** A value's wash box: on its own box where it draws one, else `gap` (and the wash's 1px edge) outside it (The One Target Rule). */
const padded = (value: Value, gap: number): { box: Box; pad: number } => {
  const pad = value.boxed ? 0 : gap + 1;
  return {
    pad,
    box: {
      x: value.box.x - pad,
      y: value.box.y - pad,
      w: value.box.w + 2 * pad,
      h: value.box.h + 2 * pad,
    },
  };
};

/**
 * Where a gone value is marked when the preview fills its place: the free
 * seam nearest its old top, within `room` of it, no taller than it was and
 * `gap` off both neighbours; null where no seam has 4px.
 */
function seamFor(
  value: Value,
  box: Box,
  live: readonly Box[],
  gap: number,
  room: number
): Box | null {
  const reach = room + value.box.h;
  const low = value.box.y - reach;
  const high = value.box.y + value.box.h + reach;
  const edges = [low, high];
  for (const one of live) {
    if (Math.min(box.x + box.w, one.x + one.w) - Math.max(box.x, one.x) > 0.5) {
      edges.push(one.y, one.y + one.h);
    }
  }
  const ys = [...new Set(edges)]
    .filter((y) => y >= low && y <= high)
    .sort((a, b) => a - b);
  let seam: Box | null = null;
  for (let k = 1; k < ys.length; k += 1) {
    const top = ys[k - 1] as number;
    const h = Math.min((ys[k] as number) - top, value.box.h) - 2 * gap;
    const candidate = { x: box.x, y: top + gap, w: box.w, h };
    const nearer =
      !seam || Math.abs(top - value.box.y) < Math.abs(seam.y - value.box.y);
    if (h >= 4 && !live.some((one) => overlaps(candidate, one)) && nearer) {
      seam = candidate;
    }
  }
  return seam;
}

/** One pair's washes in its body's own coordinates: what came in or changed, and where what went stood. */
function pairWashes(
  kept: HTMLElement,
  peek: HTMLElement,
  zoom: number,
  gap: number,
  room: number
): Wash[] {
  const was = valuesOf(kept, zoom);
  const now = valuesOf(peek, zoom);
  const came = [...now.values()].filter((value) => {
    const old = was.get(value.key);
    return !old || old.said !== value.said || old.classes !== value.classes;
  });
  const changed = new Set(came.map((one) => one.key));
  // What the preview shows that stays: a gone value's wash never covers it.
  const live = [...now.values()]
    .filter((one) => !changed.has(one.key))
    .map((one) => one.box);
  const marked: Wash[] = came.map((value) => {
    const { box, pad } = padded(value, gap);
    return { kind: "add", radius: value.radius + pad, box };
  });
  for (const value of was.values()) {
    if (now.has(value.key)) {
      continue;
    }
    const { box, pad } = padded(value, gap);
    const stands = live.some((one) => overlaps(box, one))
      ? seamFor(value, box, live, gap, room)
      : box;
    if (stands) {
      marked.push({
        kind: "del",
        radius: Math.min(value.radius + pad, stands.h / 2),
        box: stands,
      });
    }
  }
  return marked;
}

/**
 * The washes between a kept frame and a previewed one: `kept` and `peek`
 * pair up by their column (scheme and width); each pair's washes stand in
 * the world at the previewed body's place (`at`, its world corner).
 */
export function washesBetween(
  pairs: {
    at: { x: number; y: number };
    kept: HTMLElement;
    peek: HTMLElement;
  }[],
  zoom: number,
  gap: number,
  room: number
): Wash[] {
  return pairs.flatMap(({ at, kept, peek }) =>
    pairWashes(kept, peek, zoom, gap, room).map((one) => ({
      ...one,
      box: { ...one.box, x: one.box.x + at.x, y: one.box.y + at.y },
    }))
  );
}

/** The washes drawn into `layer` (the world's), each fading in on the next frame; none clears it. */
export function drawWashes(layer: HTMLElement, washes: readonly Wash[]): void {
  layer.replaceChildren(
    ...washes.map((one) => {
      const el = document.createElement("div");
      el.className = "cawco-wash";
      el.dataset.kind = one.kind;
      el.style.left = `${one.box.x}px`;
      el.style.top = `${one.box.y}px`;
      el.style.width = `${one.box.w}px`;
      el.style.height = `${one.box.h}px`;
      el.style.borderRadius = `${one.radius}px`;
      return el;
    })
  );
  requestAnimationFrame(() => {
    for (const el of layer.children) {
      el.toggleAttribute("data-in", true);
    }
  });
}
