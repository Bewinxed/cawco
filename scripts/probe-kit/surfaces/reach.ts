/**
 * What a finger can reach on a page, read by the engine: every visible
 * control's drawn box and how far past each edge a press still lands on it
 * (`document.elementFromPoint`, which a `::after` hit area answers for its
 * element), held to DESIGN.md's 44 Touch Rule (L929): "On a coarse pointer
 * every control's tappable area reaches 44×44 through a transparent
 * `::after` (`.touch-hit`, WCAG 2.5.8), while its drawn size and the layout
 * stay the same. Where neighbours sit closer, `--hit-gap-x` and
 * `--hit-gap-y` stop each area at the midpoint … Menu items and nav rows
 * are 44px tall on touch."
 *
 * Each axis is read through the control's centre: a press 0.5px inside the
 * 44px box centred on it must land on it, and one 0.5px beyond must not.
 * Where a neighbouring control's drawn box is nearer than that, the
 * midpoint between them stands in for the box's edge. Menu items and nav
 * rows are also held to a 44px drawn height. Beside them, every element
 * that spills its own box sideways, or stands past the viewport's right
 * edge, for a layout's symptom: never what is no spill (an SVG's insides,
 * a visually hidden region, a box passed by a hit area's `::after` alone,
 * a scroller's content).
 *
 * `reachOf` runs in the page (`page.evaluate`): self-contained. Written by
 * capture.ts `--reach`, a TSV per capture.
 */
// biome-ignore-all lint/complexity/noExcessiveCognitiveComplexity: the page's reader is one function `page.evaluate` sends whole (it runs in the page and can import nothing), as read.ts's is, read in the order the page is pressed.
export function reachOf(): string {
  const CONTROLS =
    "button, a[href], input:not([type=hidden]), select, textarea, [role=button], [role=tab], [role=menuitem], [role=menuitemradio], [role=menuitemcheckbox], [role=option], [role=switch], [role=checkbox], [role=radio], [role=slider]";
  const HALF = 22;
  const STEP = 0.5;
  const visible = (el: Element) => {
    const r = el.getBoundingClientRect();
    return (
      r.width > 0 &&
      r.height > 0 &&
      r.bottom > 0 &&
      r.right > 0 &&
      r.top < innerHeight &&
      r.left < innerWidth &&
      el.checkVisibility({ opacityProperty: true, visibilityProperty: true })
    );
  };
  const nameOf = (el: Element) =>
    (
      el.getAttribute("aria-label") ??
      (el instanceof HTMLElement ? el.innerText : el.textContent) ??
      ""
    )
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 48);
  const controls = [...document.querySelectorAll(CONTROLS)].filter(
    (el) =>
      visible(el) &&
      // A control inside another control is the outer one's to answer for.
      !el.parentElement?.closest(CONTROLS)
  );
  const owns = (el: Element, hit: Element | null) =>
    hit !== null && (hit === el || el.contains(hit));
  const said = (el: Element | null) =>
    el
      ? `${el.localName}${el.getAttribute("data-slot") ? `[${el.getAttribute("data-slot")}]` : ""}${el.getAttribute("aria-label") ? ` "${el.getAttribute("aria-label")?.slice(0, 24)}"` : ""}`
      : "nothing";
  /** The nearest other control's drawn edge along one side, from `edge`, among those level with the centre. */
  const neighbour = (
    el: Element,
    side: "left" | "right" | "up" | "down",
    r: DOMRect
  ): number => {
    let nearest = Number.POSITIVE_INFINITY;
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    for (const other of controls) {
      if (other === el || other.contains(el) || el.contains(other)) {
        continue;
      }
      const o = other.getBoundingClientRect();
      const level =
        side === "left" || side === "right"
          ? o.top <= cy && o.bottom >= cy
          : o.left <= cx && o.right >= cx;
      if (!level) {
        continue;
      }
      const gap = {
        left: r.left - o.right,
        right: o.left - r.right,
        up: r.top - o.bottom,
        down: o.top - r.bottom,
      }[side];
      if (gap >= 0 && gap < nearest) {
        nearest = gap;
      }
    }
    return nearest;
  };
  // A colour as the screen draws it (any CSS colour, oklch included), in sRGB.
  const paint = document.createElement("canvas").getContext("2d", {
    willReadFrequently: true,
  });
  const rgba = (colour: string): [number, number, number, number] => {
    if (!paint) {
      return [0, 0, 0, 0];
    }
    paint.clearRect(0, 0, 1, 1);
    paint.fillStyle = colour;
    paint.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = paint.getImageData(0, 0, 1, 1).data;
    return [r ?? 0, g ?? 0, b ?? 0, (a ?? 0) / 255];
  };
  const luminance = ([r, g, b]: number[]) => {
    const lin = (c: number) => {
      const v = c / 255;
      return v <= 0.040_45 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * lin(r ?? 0) + 0.7152 * lin(g ?? 0) + 0.0722 * lin(b ?? 0);
  };
  /** The text's colour against the first painted ground under it (WCAG's ratio). */
  const contrast = (el: Element) => {
    const ink = rgba(getComputedStyle(el).color);
    let ground: [number, number, number, number] = [255, 255, 255, 1];
    for (let up: Element | null = el; up; up = up.parentElement) {
      const bg = rgba(getComputedStyle(up).backgroundColor);
      if (bg[3] > 0.5) {
        ground = bg;
        break;
      }
    }
    const [a, b] = [luminance(ink), luminance(ground)].sort((x, y) => y - x);
    return `contrast ${(((a ?? 0) + 0.05) / ((b ?? 0) + 0.05)).toFixed(2)}`;
  };
  const lines: string[] = [];
  for (const el of controls) {
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const sides = (["left", "right", "up", "down"] as const).map((side) => {
      const drawnHalf =
        side === "left" || side === "right" ? r.width / 2 : r.height / 2;
      const gap = neighbour(el, side, r);
      // Where its area must reach past its drawn edge: the 44 box's edge,
      // or the midpoint to a nearer neighbour.
      const need = Math.max(0, Math.min(HALF - drawnHalf, gap / 2));
      // A press `d` past its drawn edge on this side, through its centre.
      const at = (d: number) => {
        const [x, y] = {
          left: [r.left - d, cy],
          right: [r.right + d, cy],
          up: [cx, r.top - d],
          down: [cx, r.bottom + d],
        }[side] as [number, number];
        return x < 0 || y < 0 || x >= innerWidth || y >= innerHeight
          ? undefined
          : document.elementFromPoint(x, y);
      };
      // How far past the drawn edge a press still lands on it.
      let reach = 0;
      let stop: Element | null | undefined = null;
      for (let d = STEP; d <= HALF + STEP * 2; d += STEP) {
        const hit = at(d);
        if (hit === undefined) {
          stop = undefined;
          break;
        }
        if (!owns(el, hit)) {
          stop = hit;
          break;
        }
        reach = d;
      }
      // A press 0.5px inside where it must reach lands on it; the edge of
      // the page counts as reached (no finger presses past it).
      const inside =
        need <= STEP ? true : stop === undefined || reach >= need - STEP;
      return {
        side,
        need,
        reach,
        ok: inside,
        stop: stop === undefined ? "page edge" : said(stop),
      };
    });
    const row =
      el.matches("[role^=menuitem]") ||
      el.closest("nav, [data-sidebar=menu], [role=menu]") !== null;
    const after = getComputedStyle(el, "::after");
    // Its hit area as drawn (a `::after` that clips inside its own control,
    // or takes no presses, reaches nothing), and what of the control clips it.
    const own = getComputedStyle(el);
    // The nearest box above it that clips, where its 44px box would pass that box's edge.
    let clip = "";
    for (
      let up = el.parentElement;
      up && up !== document.body;
      up = up.parentElement
    ) {
      const s = getComputedStyle(up);
      if (s.overflowX === "visible" && s.overflowY === "visible") {
        continue;
      }
      const u = up.getBoundingClientRect();
      if (
        cx - HALF < u.left ||
        cx + HALF > u.right ||
        cy - HALF < u.top ||
        cy + HALF > u.bottom
      ) {
        clip = ` clipped by ${said(up)} (overflow ${s.overflowX}/${s.overflowY})`;
      }
      break;
    }
    const area =
      after.content !== "none" && after.content !== "normal"
        ? `::after ${after.width}x${after.height} at ${after.left},${after.top} pointer-events ${after.pointerEvents}; overflow ${own.overflowX}/${own.overflowY}`
        : `no ::after; overflow ${own.overflowX}/${own.overflowY}`;
    const areaRead = `${area}${clip}`;
    const ok = sides.every((s) => s.ok) && (!row || r.height >= 44 - STEP);
    lines.push(
      [
        ok ? "ok" : "short",
        el.localName,
        el.getAttribute("role") ?? "",
        el.getAttribute("data-slot") ?? "",
        JSON.stringify(nameOf(el)),
        `${Math.round(r.x * 2) / 2},${Math.round(r.y * 2) / 2}`,
        `${Math.round(r.width * 2) / 2}x${Math.round(r.height * 2) / 2}`,
        row ? "row" : "",
        areaRead,
        contrast(el),
        ...sides.map(
          (s) =>
            `${s.side} reach ${s.reach} need ${Math.round(s.need * 2) / 2}${s.ok ? "" : " SHORT"} (then ${s.stop})`
        ),
      ].join("\t")
    );
  }
  // What spills sideways: its content wider than its box where it shows
  // the spill, or its box past the viewport's right edge. Neither is a
  // layout's symptom where:
  // - it is drawn inside an SVG (a diagram's words, a glyph's paths): it
  //   has no CSS box, so its scroll and client widths say nothing of one
  //   (CSSOM View's `clientWidth` is a CSS layout box's); the `<svg>`
  //   itself is read;
  // - it is a visually hidden region (`sr-only`: a 1px box that clips),
  //   which holds its words wider than itself by design;
  // - what passes its edge is a pseudo-element alone (a control's
  //   transparent hit area, The 44 Touch Rule's `::after`): its contents,
  //   its text and its elements' boxes (a Range's rects, which never take
  //   generated content), stand inside it, or it has none;
  // - it stands past the window inside a box that clips and stands in the
  //   window (a scroller's content, under its edge fade): never past the page.
  const SVG = "http://www.w3.org/2000/svg";
  const inSvg = (el: Element) =>
    el.namespaceURI === SVG && el.localName !== "svg";
  const hidden = (el: Element, s: CSSStyleDeclaration) =>
    el.clientWidth <= 1 &&
    el.clientHeight <= 1 &&
    (s.overflowX === "hidden" || s.overflowX === "clip");
  const pseudoAlone = (el: Element, r: DOMRect) => {
    const contents = document.createRange();
    contents.selectNodeContents(el);
    if (contents.getClientRects().length === 0) {
      return true;
    }
    const c = contents.getBoundingClientRect();
    return c.left >= r.left - 1 && c.right <= r.right + 1;
  };
  const heldInWindow = (el: Element) => {
    for (let up = el.parentElement; up; up = up.parentElement) {
      if (
        getComputedStyle(up).overflowX !== "visible" &&
        up.getBoundingClientRect().right <= innerWidth + 0.5
      ) {
        return true;
      }
    }
    return false;
  };
  for (const el of document.body.getElementsByTagName("*")) {
    if (!visible(el) || inSvg(el)) {
      continue;
    }
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    const spills =
      el.scrollWidth > el.clientWidth + 1 &&
      el.clientWidth > 0 &&
      (s.overflowX === "visible" ||
        s.overflowX === "hidden" ||
        s.overflowX === "clip") &&
      !hidden(el, s) &&
      !pseudoAlone(el, r);
    const past =
      r.right > innerWidth + 0.5 && s.position !== "fixed" && !heldInWindow(el);
    if (spills || past) {
      lines.push(
        [
          spills ? "spill" : "past",
          el.localName,
          el.getAttribute("role") ?? "",
          el.getAttribute("data-slot") ?? "",
          JSON.stringify(nameOf(el)),
          `${Math.round(r.x)},${Math.round(r.y)}`,
          `${Math.round(r.width)}x${Math.round(r.height)}`,
          `scroll ${el.scrollWidth} client ${el.clientWidth} overflow-x ${s.overflowX} right ${Math.round(r.right)} of ${innerWidth}`,
        ].join("\t")
      );
    }
  }
  return lines.join("\n");
}
