/**
 * The whole document as a capture's picture was taken, for naming what a
 * pixel difference the style snapshot cannot see came from: every
 * element's exact box (not the snapshot's half pixel), its opacity, its own
 * text, every attribute of an svg element (a ring's dash, a path's `d`),
 * its inline style, a canvas's drawing (a hash of its data URL) and any
 * scroll. A capture that is one of two pictures, each bit-identical
 * whenever it recurs, is a race in what the page paints; its dump beside a
 * dump of the other picture says which element differs.
 *
 * `pageDump` runs in the page (`page.evaluate`): self-contained.
 */

/** One element per entry: its key (`tag:n` steps from body) and what it paints. */
export type Dump = [string, string][];

export function pageDump(): Dump {
  const out: Dump = [];
  const hash = (text: string) => {
    let h = 0;
    for (let i = 0; i < text.length; i += 1) {
      h = (h * 31 + text.charCodeAt(i)) % 2_147_483_647;
    }
    return h;
  };
  /** Its own text, not its children's. */
  const textOf = (el: Element) => {
    const own = [...el.childNodes]
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent ?? "")
      .join("")
      .trim();
    return own ? [`text ${JSON.stringify(own)}`] : [];
  };
  /** An svg element's attributes: what it draws is in them, not in its style. */
  const svgOf = (el: Element) => {
    if (!(el instanceof SVGElement)) {
      return [];
    }
    const attrs = [...el.attributes]
      .filter((a) => a.name !== "class")
      .map((a) => `${a.name}=${a.value}`);
    return attrs.length > 0 ? [`svg ${attrs.join(" ")}`] : [];
  };
  /** A canvas's drawing, an image's source and size. */
  const mediaOf = (el: Element) => {
    if (el instanceof HTMLCanvasElement) {
      try {
        return [`canvas #${hash(el.toDataURL())}`];
      } catch {
        return ["canvas tainted"];
      }
    }
    if (el instanceof HTMLImageElement) {
      return [
        `img #${hash(el.currentSrc)} ${el.naturalWidth}x${el.naturalHeight} ${el.complete ? "complete" : "loading"}`,
      ];
    }
    return [];
  };
  const visit = (el: Element, key: string) => {
    const r = el.getBoundingClientRect();
    const style = el.getAttribute("style");
    const parts = [
      `${r.x},${r.y},${r.width},${r.height}`,
      `opacity ${getComputedStyle(el).opacity}`,
      ...textOf(el),
      ...svgOf(el),
      ...(style ? [`style ${style}`] : []),
      ...mediaOf(el),
      ...(el.scrollTop || el.scrollLeft
        ? [`scroll ${el.scrollTop},${el.scrollLeft}`]
        : []),
    ];
    out.push([key, parts.join(" · ")]);
    const counts = new Map<string, number>();
    for (const kid of el.children) {
      const tag = kid.tagName.toLowerCase();
      const n = (counts.get(tag) ?? 0) + 1;
      counts.set(tag, n);
      visit(kid, `${key} > ${tag}:${n}`);
    }
  };
  visit(document.body, "body");
  return out;
}
