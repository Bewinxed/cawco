/**
 * The three rules every journey step is held to, read from the engine:
 *
 *  - nothing spills: no text or control shows past the screen's edge (the
 *    page itself never scrolls sideways), text inside a control stays inside
 *    it, and flowing text stays inside the box it is drawn in (the nearest
 *    ancestor with a fill or an edge);
 *  - no control runs out of its row: a control's box stays inside the box
 *    it is laid out in (its nearest ancestor that clips, draws a fill or an
 *    edge, or is a flex or grid row), whether or not the page scrolls
 *    sideways; a negative margin's overhang is its own, a scroller's
 *    scrolling axis holds what scrolls, and a control placed absolutely or
 *    fixed is placed on purpose;
 *  - nothing overlaps: no interactive control's box intersects a text
 *    node's box in the same block (the control's nearest block ancestor).
 *    A control's box is what it paints: its own words and glyphs, and,
 *    when it draws a fill, an edge or a shadow, that edge. So text meets a
 *    control where it runs into the control's words or glyphs, or across
 *    its drawn edge; text wholly inside a drawn control (a count in its
 *    row's pill) or over the empty, undrawn part of one (a field's hint in
 *    an empty field, a row link's bare hit area) meets nothing.
 *
 * Every box is read as the person sees it: cut by each ancestor that clips
 * it (scrollers, `overflow: hidden`, `clip-path`, `contain: paint`; a text
 * node by its own element too), walked by containing block so a fixed or
 * absolutely placed box is cut only by what really holds it. What no clip
 * leaves showing, what lies wholly off the screen (a skip link parked
 * there), or what is hidden (display, visibility, a zero opacity, a 1px
 * visually-hidden box), is not read. A finding names the words or the
 * control, and what it measured.
 *
 * It runs inside the page (`page.evaluate(scan)`), so it is one function
 * with everything it needs inside it.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one function serialized into the page, so every helper it uses lives inside it
export function scan(): string[] {
  const TOLERANCE = 1;
  const MAX_FINDINGS = 6;
  // biome-ignore lint/performance/useTopLevelRegex: serialized into the page
  const PAINT = /paint|strict|content/;
  // biome-ignore lint/performance/useTopLevelRegex: serialized into the page
  const CONTAINS = /paint|layout|strict|content/;
  // biome-ignore lint/performance/useTopLevelRegex: serialized into the page
  const WILL_HOLD = /transform|filter|perspective/;
  // biome-ignore lint/performance/useTopLevelRegex: serialized into the page
  const INLINE = /^(inline|contents)$/;
  const found: string[] = [];
  const width = document.documentElement.clientWidth;
  const height = document.documentElement.clientHeight;
  const root = document.scrollingElement ?? document.documentElement;
  const rootScrollsDown =
    root.scrollHeight > root.clientHeight + TOLERANCE &&
    !["hidden", "clip"].includes(getComputedStyle(root).overflowY);

  interface Box {
    bottom: number;
    left: number;
    right: number;
    top: number;
  }
  const styles = new Map<Element, CSSStyleDeclaration>();
  const style = (el: Element) => {
    let known = styles.get(el);
    if (!known) {
      known = getComputedStyle(el);
      styles.set(el, known);
    }
    return known;
  };
  const shownCache = new Map<Element, boolean>();
  /** Drawn at all: no ancestor takes it out of view. */
  const shown = (el: Element): boolean => {
    const known = shownCache.get(el);
    if (known !== undefined) {
      return known;
    }
    const s = style(el);
    let result =
      s.display !== "none" &&
      s.visibility !== "hidden" &&
      s.visibility !== "collapse" &&
      Number(s.opacity) > 0 &&
      s.contentVisibility !== "hidden";
    if (result && el.parentElement) {
      result = shown(el.parentElement);
    }
    shownCache.set(el, result);
    return result;
  };
  const clipsOverflow = (s: CSSStyleDeclaration) =>
    s.overflowX !== "visible" ||
    s.overflowY !== "visible" ||
    s.clipPath !== "none" ||
    PAINT.test(s.contain);
  const holdsFixed = (s: CSSStyleDeclaration) =>
    s.transform !== "none" ||
    s.filter !== "none" ||
    s.perspective !== "none" ||
    (s.backdropFilter ?? "none") !== "none" ||
    CONTAINS.test(s.contain) ||
    WILL_HOLD.test(s.willChange);
  const holdsAbsolute = (s: CSSStyleDeclaration) =>
    s.position !== "static" || holdsFixed(s);
  /** Every ancestor that cuts `el`, by containing block. */
  const clippers = (el: Element): Element[] => {
    const list: Element[] = [];
    let { position } = style(el);
    for (
      let up = el.parentElement;
      up && up !== document.documentElement && up !== document.body;
      up = up.parentElement
    ) {
      const s = style(up);
      let holds = true;
      if (position === "fixed") {
        holds = holdsFixed(s);
      } else if (position === "absolute") {
        holds = holdsAbsolute(s);
      }
      if (holds) {
        if (clipsOverflow(s)) {
          list.push(up);
        }
        ({ position } = s);
      }
    }
    return list;
  };
  const inner = (el: Element): Box => {
    const r = el.getBoundingClientRect();
    // The client sizes are the element's own, before any transform scales
    // it; the box is read on the screen, so they are scaled as it is (a
    // drawing scaled to fit its column: design-previews/workflows).
    const own = el as HTMLElement;
    const sx = own.offsetWidth > 0 ? r.width / own.offsetWidth : 1;
    const sy = own.offsetHeight > 0 ? r.height / own.offsetHeight : 1;
    const left = r.left + el.clientLeft * sx;
    const top = r.top + el.clientTop * sy;
    const s = style(el);
    // A clip-path or a paint containment cuts at the border box.
    if (s.overflowX === "visible" && s.overflowY === "visible") {
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    }
    return {
      left: s.overflowX === "visible" ? r.left : left,
      top: s.overflowY === "visible" ? r.top : top,
      right: s.overflowX === "visible" ? r.right : left + el.clientWidth * sx,
      bottom: s.overflowY === "visible" ? r.bottom : top + el.clientHeight * sy,
    };
  };
  const cut = (box: Box, by: Box): Box => ({
    left: Math.max(box.left, by.left),
    top: Math.max(box.top, by.top),
    right: Math.min(box.right, by.right),
    bottom: Math.min(box.bottom, by.bottom),
  });
  const visible = (box: Box) =>
    box.right - box.left > TOLERANCE && box.bottom - box.top > TOLERANCE;
  /** `boxes` as seen: each cut by every clipper. */
  const seen = (boxes: Box[], clips: Element[]): Box[] =>
    boxes
      .map((box) => clips.reduce((at, clip) => cut(at, inner(clip)), box))
      .filter(visible);
  const plain = (r: DOMRect): Box => ({
    left: r.left,
    top: r.top,
    right: r.right,
    bottom: r.bottom,
  });
  const words = (text: string) => {
    const one = text.replace(/\s+/g, " ").trim();
    return one.length > 48 ? `${one.slice(0, 45)}…` : one;
  };
  const px = (box: Box) =>
    `${box.left.toFixed(0)}..${box.right.toFixed(0)}×${box.top.toFixed(0)}..${box.bottom.toFixed(0)}`;
  const say = (line: string) => {
    if (found.length < MAX_FINDINGS) {
      found.push(line);
    }
  };

  const CONTROL =
    'button, a[href], input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="link"], [role="tab"], [role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"], [role="option"], [role="checkbox"], [role="radio"], [role="switch"], [role="combobox"], [role="slider"], [contenteditable="true"]';
  const controlOf = (el: Element | null) => el?.closest(CONTROL) ?? null;
  const name = (el: Element) =>
    words(
      el.getAttribute("aria-label") ||
        el.textContent ||
        el.getAttribute("title") ||
        el.tagName.toLowerCase()
    );
  const blockOf = (el: Element): Element => {
    for (let up = el.parentElement; up; up = up.parentElement) {
      if (!INLINE.test(style(up).display)) {
        return up;
      }
    }
    return document.body;
  };
  /** The box flowing text is drawn in: its nearest ancestor with a fill or an edge. */
  const boxOf = (el: Element): Element | null => {
    for (let up: Element | null = el; up && up !== document.body;) {
      const s = style(up);
      if (s.position === "absolute" || s.position === "fixed") {
        return null;
      }
      const parent: Element | null = up.parentElement;
      if (!parent) {
        return null;
      }
      const p = style(parent);
      const filled =
        p.backgroundColor !== "rgba(0, 0, 0, 0)" &&
        p.backgroundColor !== "transparent";
      const edged =
        Number.parseFloat(p.borderTopWidth) > 0 &&
        p.borderTopStyle !== "none" &&
        Number.parseFloat(p.borderLeftWidth) > 0;
      if (
        (filled || edged) &&
        !INLINE.test(p.display) &&
        parent !== document.documentElement
      ) {
        return parent;
      }
      up = parent;
    }
    return null;
  };

  // The page never scrolls sideways.
  if (root.scrollWidth > width + TOLERANCE) {
    // What reaches past the screen's edge and past its own parent's box,
    // farthest first: the box to mend. A box that only fills a parent
    // something else widened (the body's every block, Sonner's region)
    // stands inside that parent, and a fixed box spanning the screen
    // (ScreenEdges' strips) only follows the page, so neither is named. A
    // box's positioned ::before or ::after (a `touch-hit` area) reaches with it: no
    // query finds a pseudo-element, and one past the edge widens the page
    // as its host would.
    const afterReach = (el: Element): number | null => {
      const reaches = (["::before", "::after"] as const).flatMap((which) => {
        const pseudo = getComputedStyle(el, which);
        if (pseudo.content === "none" || pseudo.position !== "absolute") {
          return [];
        }
        const inset = Number.parseFloat(pseudo.right);
        return Number.isNaN(inset)
          ? []
          : [el.getBoundingClientRect().right - inset];
      });
      return reaches.length > 0 ? Math.max(...reaches) : null;
    };
    const reach = (el: Element) =>
      Math.max(el.getBoundingClientRect().right, afterReach(el) ?? 0);
    const past = (el: Element) =>
      reach(el) > width + TOLERANCE &&
      !(style(el).position === "fixed" && el.getBoundingClientRect().left <= 0);
    const byAfter = (el: Element) =>
      (afterReach(el) ?? 0) > el.getBoundingClientRect().right;
    const outOfParent = (el: Element) =>
      reach(el) >
      (el.parentElement?.getBoundingClientRect().right ?? width) + TOLERANCE;
    const spills = [...document.body.querySelectorAll("*")]
      .filter((el) => past(el) && outOfParent(el))
      .sort(
        (a, b) => reach(b) - reach(a) || Number(byAfter(b)) - Number(byAfter(a))
      )
      .slice(0, 3)
      .map((el) => {
        const slot = el.getAttribute("data-slot");
        const cls = [...el.classList].slice(0, 2).join(".");
        const label = el.getAttribute("aria-label");
        return `${el.tagName.toLowerCase()}${slot ? `[data-slot=${slot}]` : ""}${cls ? `.${cls}` : ""}${label ? ` “${label.slice(0, 40)}”` : ""}${byAfter(el) ? ` (its ::before or ::after; its box ${Math.round(el.getBoundingClientRect().left)}–${Math.round(el.getBoundingClientRect().right)}px)` : ""} to ${Math.round(reach(el))}px`;
      });
    say(
      `the page scrolls sideways: ${root.scrollWidth}px of content in a ${width}px screen${spills.length ? ` (past the edge: ${spills.join(", ")})` : ""}`
    );
  }

  /** Whether any of `box` is on the screen at all. */
  const onScreen = (box: Box) =>
    box.right > 0 && box.left < width && box.bottom > 0 && box.top < height;
  /** `inside` lies within `outside`, to the tolerance. */
  const within = (inside: Box, outside: Box) =>
    inside.left >= outside.left - TOLERANCE &&
    inside.right <= outside.right + TOLERANCE &&
    inside.top >= outside.top - TOLERANCE &&
    inside.bottom <= outside.bottom + TOLERANCE;
  /** The box draws something of its own: a fill, an edge or a shadow. */
  const painted = (el: Element) => {
    const s = style(el);
    const fill =
      (s.backgroundColor !== "rgba(0, 0, 0, 0)" &&
        s.backgroundColor !== "transparent") ||
      s.backgroundImage !== "none";
    const edge = ["top", "right", "bottom", "left"].some(
      (side) =>
        Number.parseFloat(s.getPropertyValue(`border-${side}-width`)) > 0 &&
        s.getPropertyValue(`border-${side}-style`) !== "none" &&
        s.getPropertyValue(`border-${side}-color`) !== "rgba(0, 0, 0, 0)"
    );
    return fill || edge || s.boxShadow !== "none";
  };

  // Every text node: past the screen, out of its control, out of its box.
  const texts: { boxes: Box[]; node: Text; parent: Element }[] = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node as Text;
    const parent = text.parentElement;
    if (
      !(parent && text.data.trim()) ||
      parent.closest("script, style, noscript, template, svg") ||
      !shown(parent)
    ) {
      continue;
    }
    const range = document.createRange();
    range.selectNodeContents(text);
    // Its own element cuts it too (a label's ellipsis).
    const clips = clipsOverflow(style(parent))
      ? [parent, ...clippers(parent)]
      : clippers(parent);
    const boxes = seen([...range.getClientRects()].map(plain), clips);
    if (boxes.length === 0) {
      continue;
    }
    texts.push({ boxes, node: text, parent });
    for (const box of boxes.filter(onScreen)) {
      const pastSide = box.left < -TOLERANCE || box.right > width + TOLERANCE;
      const pastFoot = !rootScrollsDown && box.bottom > height + TOLERANCE;
      if (pastSide || pastFoot) {
        say(
          `“${words(text.data)}” runs past the screen's edge: ${px(box)} on a ${width}×${height} screen`
        );
        break;
      }
    }
    const control = controlOf(parent);
    if (control && !clipsOverflow(style(control))) {
      const frame = control.getBoundingClientRect();
      const out = boxes.find(
        (box) =>
          box.left < frame.left - TOLERANCE ||
          box.right > frame.right + TOLERANCE ||
          box.top < frame.top - TOLERANCE ||
          box.bottom > frame.bottom + TOLERANCE
      );
      if (out) {
        say(
          `“${words(text.data)}” runs out of its control “${name(control)}”: ${px(out)} past ${px(plain(frame))}`
        );
      }
    } else if (!control) {
      const holder = boxOf(parent);
      if (holder) {
        const frame = holder.getBoundingClientRect();
        const out = boxes.find(
          (box) =>
            box.left < frame.left - TOLERANCE ||
            box.right > frame.right + TOLERANCE
        );
        if (out) {
          say(
            `“${words(text.data)}” spills out of its box (${holder.tagName.toLowerCase()} “${words(holder.textContent ?? "")}”): ${px(out)} past ${px(plain(frame))}`
          );
        }
      }
    }
  }

  // Every control against the text of its own block.
  const controls = [...document.querySelectorAll(CONTROL)].filter(
    (el) => shown(el) && !el.closest("svg")
  );
  for (const control of controls) {
    const edges = painted(control)
      ? seen([...control.getClientRects()].map(plain), clippers(control))
      : [];
    // What the control draws inside itself: its words and its glyphs.
    const content = [
      ...texts
        .filter((text) => control.contains(text.node))
        .flatMap((text) => text.boxes),
      ...[...control.querySelectorAll("svg, img, canvas, video")]
        .filter((glyph) => shown(glyph) && !glyph.parentElement?.closest("svg"))
        .flatMap((glyph) =>
          seen([...glyph.getClientRects()].map(plain), clippers(glyph))
        ),
    ];
    if (edges.length === 0 && content.length === 0) {
      continue;
    }
    const block = blockOf(control);
    for (const text of texts) {
      if (
        control.contains(text.node) ||
        !block.contains(text.node) ||
        controlOf(text.parent)?.contains(control)
      ) {
        continue;
      }
      const intoContent = text.boxes.find((b) =>
        content.some((c) => visible(cut(c, b)))
      );
      const acrossEdge = text.boxes.find((b) =>
        edges.some((e) => visible(cut(e, b)) && !within(b, e))
      );
      const hit = intoContent ?? acrossEdge;
      if (hit) {
        say(
          `the words “${words(text.node.data)}” (${px(hit)}) run ${intoContent ? "into what the control draws" : "across the edge of the control"} “${name(control)}” (${px((intoContent ? content : edges)[0] as Box)})`
        );
        break;
      }
    }
  }

  // Every control inside the row, card or panel it is laid out in: its
  // nearest ancestor that clips, draws a fill or an edge, or lays out a row
  // (flex or grid). A button pushed past its row by its neighbours widens
  // nothing when a panel clips it, or when the screen still has room, and
  // its words stay inside its own box, so the rules above never meet it.
  // What a box declares it hangs out by (a negative margin, its own or a
  // wrapper's on the way up) is its own; past a scroller's edge along the
  // way it scrolls is content to scroll to; a control placed absolutely or
  // fixed, or inside a box so placed before any row, is placed on purpose;
  // and one no clip leaves showing (a carousel's next slide) is not read.
  // biome-ignore lint/performance/useTopLevelRegex: serialized into the page
  const SCROLLS = /^(auto|scroll)$/;
  // biome-ignore lint/performance/useTopLevelRegex: serialized into the page
  const ROW = /flex|grid/;
  const describe = (el: Element) => {
    const slot = el.getAttribute("data-slot");
    const cls = [...el.classList].slice(0, 2).join(".");
    return `${el.tagName.toLowerCase()}${slot ? `[data-slot=${slot}]` : ""}${cls ? `.${cls}` : ""}`;
  };
  for (const control of controls) {
    const placed = (el: Element) =>
      style(el).position === "absolute" || style(el).position === "fixed";
    if (placed(control)) {
      continue;
    }
    const own = plain(control.getBoundingClientRect());
    if (seen([own], clippers(control)).length === 0) {
      continue;
    }
    const hang = { left: 0, right: 0, top: 0, bottom: 0 };
    const declares = (el: Element) => {
      const s = style(el);
      hang.left += Math.max(0, -Number.parseFloat(s.marginLeft) || 0);
      hang.right += Math.max(0, -Number.parseFloat(s.marginRight) || 0);
      hang.top += Math.max(0, -Number.parseFloat(s.marginTop) || 0);
      hang.bottom += Math.max(0, -Number.parseFloat(s.marginBottom) || 0);
    };
    declares(control);
    let holder: Element | null = null;
    for (
      let up = control.parentElement;
      up && up !== document.body && up !== document.documentElement;
      up = up.parentElement
    ) {
      const s = style(up);
      if (INLINE.test(s.display)) {
        continue;
      }
      if (clipsOverflow(s) || painted(up) || ROW.test(s.display)) {
        holder = up;
        break;
      }
      if (placed(up)) {
        break;
      }
      declares(up);
    }
    if (!holder) {
      continue;
    }
    const frame = plain(holder.getBoundingClientRect());
    const s = style(holder);
    const sideways = !SCROLLS.test(s.overflowX);
    const down = !SCROLLS.test(s.overflowY);
    const past = [
      sideways && frame.left - hang.left - own.left > TOLERANCE
        ? `${(frame.left - own.left).toFixed(0)}px past its left`
        : "",
      sideways && own.right - frame.right - hang.right > TOLERANCE
        ? `${(own.right - frame.right).toFixed(0)}px past its right`
        : "",
      down && frame.top - hang.top - own.top > TOLERANCE
        ? `${(frame.top - own.top).toFixed(0)}px past its top`
        : "",
      down && own.bottom - frame.bottom - hang.bottom > TOLERANCE
        ? `${(own.bottom - frame.bottom).toFixed(0)}px past its foot`
        : "",
    ].filter(Boolean);
    if (past.length > 0) {
      say(
        `the control “${name(control)}” (${px(own)}) runs out of the box it is laid out in (${describe(holder)} ${px(frame)}): ${past.join(", ")}`
      );
    }
  }
  return found;
}
