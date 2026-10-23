/**
 * What a finger or a mouse can reach on a page, read by the engine: every
 * visible control's drawn box and how far past each edge a press still
 * lands on it (`document.elementFromPoint`, which a `::after` hit area
 * answers for its element), held to the page's own pointer's rule
 * (DESIGN.md): on a coarse pointer The 44 Touch Rule, "every control's
 * tappable area reaches 44×44 through a transparent `::after` … Menu items
 * and nav rows are 44px tall on touch"; on a fine one The 24 Pointer Rule,
 * "a control drawn smaller than 24×24 reaches 24px through `.pointer-hit`,
 * with the same midpoint stops".
 *
 * Each axis is read through the control's centre: a press 0.5px inside the
 * target's box (44px or 24px) centred on it must land on it, and one 0.5px
 * beyond must not. Where a neighbouring control's drawn box is nearer than
 * that, the midpoint between them stands in for the box's edge. On a
 * coarse pointer menu items and nav rows are also held to a 44px drawn
 * height. A control a modal layer's overlay covers (an open dialog's,
 * drawer's or sheet's scrim stands over its centre) is out of reach by
 * design, and not read; nor is one visually hidden (`sr-only`, a skip
 * link until it takes the focus). Beside them, every element that spills
 * its own box sideways, or stands past the viewport's right edge, for a
 * layout's symptom: never what is no spill (an SVG's insides, a visually
 * hidden region, words cut on purpose with an ellipsis, a box passed only
 * by a part placed on purpose, as a hit area's `::after` or an absolutely
 * placed handle is, or by what a part of it clips, a scroller's content).
 *
 * `reachOf` runs in the page (`page.evaluate`): self-contained. Written by
 * capture.ts `--reach`, a TSV per capture.
 */
// biome-ignore-all lint/complexity/noExcessiveCognitiveComplexity: the page's reader is one function `page.evaluate` sends whole (it runs in the page and can import nothing), as read.ts's is, read in the order the page is pressed.
export function reachOf(): string {
  const CONTROLS =
    "button, a[href], input:not([type=hidden]), select, textarea, [role=button], [role=tab], [role=menuitem], [role=menuitemradio], [role=menuitemcheckbox], [role=option], [role=switch], [role=checkbox], [role=radio], [role=slider]";
  /** The pointer's target, half of it: The 44 Touch Rule on a coarse pointer, The 24 Pointer Rule on a fine one. */
  const coarse = matchMedia("(pointer: coarse)").matches;
  const HALF = coarse ? 22 : 12;
  /** An open modal layer's overlay: what stands over the page behind it. */
  const OVERLAY = "[data-slot$='-overlay'][data-state=open]";
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
  /**
   * Whether `el` is visually hidden (`sr-only`: clipped to nothing, by
   * `clip-path: inset(50%)` or `clip: rect(0 0 0 0)`, or a 1px box that
   * clips): words for a reader, shown to no eye and no finger.
   */
  const visuallyHidden = (el: Element, s = getComputedStyle(el)) =>
    s.clipPath.startsWith("inset(50%") ||
    s.clip === "rect(0px, 0px, 0px, 0px)" ||
    (el.clientWidth <= 1 &&
      el.clientHeight <= 1 &&
      (s.overflowX === "hidden" || s.overflowX === "clip"));
  /** Whether an open modal layer's overlay stands over `el`'s centre: out of reach behind it. */
  const underOverlay = (el: Element) => {
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(
      Math.min(innerWidth - 1, Math.max(0, r.left + r.width / 2)),
      Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2))
    );
    return Boolean(hit?.closest(OVERLAY));
  };
  const controls = [...document.querySelectorAll(CONTROLS)].filter(
    (el) =>
      visible(el) &&
      // A control inside another control is the outer one's to answer for.
      !el.parentElement?.closest(CONTROLS) &&
      !underOverlay(el) &&
      !visuallyHidden(el)
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
    // A row's 44px height is the touch rule's alone.
    const row =
      coarse &&
      (el.matches("[role^=menuitem]") ||
        el.closest("nav, [data-sidebar=menu], [role=menu]") !== null);
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
  // - it is a visually hidden region (`sr-only`, clipped to nothing), which
  //   holds its words wider than itself by design;
  // - it cuts its words on purpose (`text-overflow: ellipsis`);
  // - what passes its edge is placed there on purpose, not pushed out by
  //   its flow: a pseudo-element (a control's transparent hit area, The 44
  //   Touch Rule's `::after`), or a part placed absolutely or fixed (a graph
  //   node's port handles, half outside its card), or moved by its own
  //   transform, offsets or negative margin (a decision page's media well
  //   reaching a phone's screen edges, Well.svelte `well-bleed`). Its in-flow contents,
  //   its text and the boxes laid out in its flow, stand inside it, each
  //   read on screen as its box is, so a transform's scale (a zoomed
  //   canvas's viewport) moves both alike;
  // - it stands past the window inside a box that clips and stands in the
  //   window (a scroller's content, under its edge fade): never past the page.
  const SVG = "http://www.w3.org/2000/svg";
  const inSvg = (el: Element) =>
    el.namespaceURI === SVG && el.localName !== "svg";
  const cut = (s: CSSStyleDeclaration) =>
    s.overflowX === "hidden" || s.overflowX === "clip";
  /** Words cut on purpose: a box that ends them in an ellipsis. */
  const truncates = (s: CSSStyleDeclaration) =>
    cut(s) && s.textOverflow === "ellipsis";
  /** A part placed where it stands, not laid there by its flow: out of flow, or moved off its place by its own transform, offsets or negative margin. */
  const placedOnPurpose = (style: CSSStyleDeclaration) =>
    style.position === "absolute" ||
    style.position === "fixed" ||
    style.transform !== "none" ||
    style.translate !== "none" ||
    Number.parseFloat(style.marginLeft) < 0 ||
    Number.parseFloat(style.marginRight) < 0 ||
    (style.position === "relative" &&
      [style.left, style.right, style.top, style.bottom].some(
        (side) => side !== "auto" && side !== "0px"
      ));
  /** Whether `el`'s in-flow contents (its text, and every box laid out in its flow) stand inside its box `r`, both read on screen. */
  const flowInside = (el: Element, r: DOMRect) => {
    const within = (left: number, right: number) =>
      left >= r.left - 1 && right <= r.right + 1;
    const walk = (node: Node): boolean => {
      for (const kid of node.childNodes) {
        if (kid.nodeType === Node.TEXT_NODE) {
          const text = document.createRange();
          text.selectNodeContents(kid);
          for (const rect of text.getClientRects()) {
            if (!within(rect.left, rect.right)) {
              return false;
            }
          }
          continue;
        }
        if (!(kid instanceof Element)) {
          continue;
        }
        const style = getComputedStyle(kid);
        if (placedOnPurpose(style)) {
          continue;
        }
        const box = kid.getBoundingClientRect();
        if (box.width > 0 && !within(box.left, box.right)) {
          return false;
        }
        // What a part clips stays inside its own box: read no deeper.
        if (!(cut(style) || walk(kid))) {
          return false;
        }
      }
      return true;
    };
    return walk(el);
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
      !visuallyHidden(el, s) &&
      !truncates(s) &&
      !flowInside(el, r);
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
