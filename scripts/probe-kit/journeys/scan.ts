/**
 * The two rules every journey step is held to, read from the engine:
 *
 *  - nothing spills: no text or control shows past the screen's edge (the
 *    page itself never scrolls sideways), text inside a control stays inside
 *    it, and flowing text stays inside the box it is drawn in (the nearest
 *    ancestor with a fill or an edge);
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
    const left = r.left + el.clientLeft;
    const top = r.top + el.clientTop;
    const s = style(el);
    // A clip-path or a paint containment cuts at the border box.
    if (s.overflowX === "visible" && s.overflowY === "visible") {
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    }
    return {
      left: s.overflowX === "visible" ? r.left : left,
      top: s.overflowY === "visible" ? r.top : top,
      right: s.overflowX === "visible" ? r.right : left + el.clientWidth,
      bottom: s.overflowY === "visible" ? r.bottom : top + el.clientHeight,
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
    say(
      `the page scrolls sideways: ${root.scrollWidth}px of content in a ${width}px screen`
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
  return found;
}
