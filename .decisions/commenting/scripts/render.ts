/**
 * Renders every drawn state of the commenting drawings (drawings/dist) in
 * playwright-core's cached Chromium, writes each option's picture beside
 * page.oui, and sweeps each state for overflow and overlap.
 *
 *   bun .decisions/commenting/scripts/render.ts
 *
 * Sweep, per scene (all must be 0):
 * - overflow: an element whose content runs past its box (scrollWidth or
 *   scrollHeight past clientWidth/Height by more than 1px) that is not a
 *   scroller of its own: clipped words, a field's value cut, the well's page
 *   running out of it;
 * - overlap: two children of one row (`data-sweep="row"`) intersecting; two
 *   pins' front markers intersecting; a pin on a name tag; a floating
 *   surface over its own pin;
 * - outside: a pin's marker past the well's edge (or its frame's), a figure
 *   past its marker, a floating surface past the panel.
 *
 * And per picture, against the region it crops:
 * - open outline: a dashed border or outline, or a frame (`data-frame`),
 *   that shows in the picture but whose box runs past the picture's edge or
 *   past the overflow edge of a box holding it, so it isn't closed;
 * - cut line: a line of text in the picture that another surface covers in
 *   part, read by hit-testing points along the line (`elementFromPoint`): a
 *   point that lands on neither the line's element nor one holding it is
 *   covered there, by a surface over it or by the overflow edge of a box
 *   holding it. A line covered whole is under a surface on purpose; one
 *   covered in part reads as a broken line. Text inside floating surfaces
 *   the kit portals out of the scene is read too, and a field's value (a
 *   textarea's, an input's, a select's), its lines laid out in a mirror of
 *   the field. A line the picture's top or bottom edge crosses is cut too;
 *   its sides may cut the page, as a picture of the panel's end does;
 * - crowded tag: a name tag within 3px of a drawn part other than its own
 *   element, floating surfaces included.
 */
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { chromium, type Page } from "playwright-core";

const HERE = join(import.meta.dirname, "..");
const DIST = join(HERE, "drawings/dist");

type Region =
  | { kind: "el"; sel: string; pad?: number; height?: number }
  | { kind: "right"; width: number; height?: number }
  | { kind: "union"; sels: string[]; pad: number };

const SHOTS: { scene: string; file: string; region: Region }[] = [
  { scene: "ctx-rail", file: "decided-rail.png", region: { kind: "right", width: 480 } },
  { scene: "ctx-whole", file: "decided-whole-page.png", region: { kind: "el", sel: "[data-side-well]" } },
  { scene: "ctx-empty", file: "decided-empty.png", region: { kind: "el", sel: "[data-board]", pad: 8 } },
  { scene: "ctx-attach", file: "decided-attach.png", region: { kind: "el", sel: "[data-board]", pad: 8 } },
  { scene: "p1-rail", file: "p1-rail-panel.png", region: { kind: "el", sel: "[data-panel]" } },
  { scene: "p1-rail", file: "p1-rail-thread.png", region: { kind: "right", width: 480 } },
  { scene: "p1-rail", file: "decided-attach-thread.png", region: { kind: "el", sel: "[data-rail]" } },
  { scene: "p1-card", file: "p1-card-panel.png", region: { kind: "el", sel: "[data-panel]" } },
  { scene: "p1-card", file: "p1-card-thread.png", region: { kind: "union", sels: ["[data-float]", "[data-pin='14'] [data-marker]", "[data-slot='commit']"], pad: 24 } },
  { scene: "p2-tail", file: "p2-tail-panel.png", region: { kind: "el", sel: "[data-panel]" } },
  { scene: "p2-tail-board", file: "p2-tail-close.png", region: { kind: "el", sel: "[data-board]" } },
  { scene: "p2-stem", file: "p2-stem-panel.png", region: { kind: "el", sel: "[data-panel]" } },
  { scene: "p2-stem-board", file: "p2-stem-close.png", region: { kind: "el", sel: "[data-board]" } },
  { scene: "p3-send-unsent", file: "p3-send-unsent.png", region: { kind: "right", width: 480 } },
  { scene: "p3-send-sent", file: "p3-send-sent.png", region: { kind: "right", width: 480 } },
  { scene: "p3-quiet-unsent", file: "p3-quiet-unsent.png", region: { kind: "right", width: 480 } },
  { scene: "p3-quiet-sent", file: "p3-quiet-sent.png", region: { kind: "right", width: 480 } },
  { scene: "p4-el-empty", file: "p4-element-empty.png", region: { kind: "right", width: 480 } },
  { scene: "p4-el-typed", file: "p4-element-typed.png", region: { kind: "right", width: 480 } },
  { scene: "p4-rail-empty", file: "p4-rail-empty.png", region: { kind: "right", width: 480 } },
  { scene: "p4-rail-typed", file: "p4-rail-typed.png", region: { kind: "right", width: 480 } },
  { scene: "p6-words", file: "p6-words.png", region: { kind: "el", sel: "[data-board]", pad: 8 } },
  { scene: "p6-alone", file: "p6-alone.png", region: { kind: "el", sel: "[data-board]", pad: 8 } },
  { scene: "p7-count", file: "p7-count.png", region: { kind: "right", width: 480 } },
  { scene: "p7-strip", file: "p7-strip.png", region: { kind: "right", width: 480 } },
];

const server = Bun.serve({
  port: 0,
  async fetch(request) {
    const path = new URL(request.url).pathname;
    const file = Bun.file(join(DIST, path === "/" ? "index.html" : path));
    return (await file.exists()) ? new Response(file) : new Response("Not found", { status: 404 });
  },
});

/** Every overflow, overlap and outside finding in the scene, in words. */
const sweep = (tab: Page) =>
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: the sweep runs in the page, so it is one function the browser is handed whole.
  tab.evaluate(() => {
    const found: string[] = [];
    const name = (el: Element) =>
      `${el.tagName.toLowerCase()}${[...el.attributes].filter((a) => a.name.startsWith("data-") && a.name !== "data-slot").map((a) => `[${a.name}=${a.value}]`).join("")} “${(el.textContent ?? "").trim().slice(0, 40)}”`;
    const box = (el: Element) => el.getBoundingClientRect();
    const meets = (a: DOMRect, b: DOMRect) =>
      Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0.5 &&
      Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0.5;
    const within = (a: DOMRect, b: DOMRect) =>
      a.left >= b.left - 0.5 && a.right <= b.right + 0.5 && a.top >= b.top - 0.5 && a.bottom <= b.bottom + 0.5;
    const scroller = (s: CSSStyleDeclaration) =>
      // biome-ignore lint/performance/useTopLevelRegex: this function is serialised into the page; nothing outside it reaches there.
      /(auto|scroll)/.test(s.overflowX + s.overflowY);
    // Pins, name tags and status dots stand outside their element by design
    // and are swept by their own rules below: hidden while boxes are read.
    const aside = [...document.querySelectorAll<HTMLElement>("[data-pin], [data-tag], [data-dot]")];
    for (const el of aside) { el.style.display = "none"; }
    for (const el of document.querySelectorAll("main *")) {
      const s = getComputedStyle(el);
      if (s.display === "none" || s.visibility === "hidden" || scroller(s) || el.closest("svg")) { continue; }
      // A screen reader's label (sr-only) is a 1px box by design.
      if (el.clientWidth <= 2) { continue; }
      // Content past a box that doesn't clip it isn't cut (a chip row's designed bleed, a
      // control's invisible hit area); a box that clips it, or a field, cuts it.
      const clips = s.overflowX !== "visible" || el.tagName === "INPUT";
      if (clips && el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0) {
        found.push(`overflow-x ${el.scrollWidth}>${el.clientWidth}: ${name(el)}`);
      }
      // A run the house trims to its x-height (design.css `mark-text`:
      // `text-box: trim-both ex alphabetic`, the trim given back as padding)
      // reads taller in scrollHeight than its 1lh box by construction; its
      // glyphs stand inside that box, so only an untrimmed run is read here.
      const trimmed = (s as CSSStyleDeclaration & { textBoxTrim?: string }).textBoxTrim;
      if (el.scrollHeight > el.clientHeight + 1 && el.clientHeight > 0 && s.overflowY !== "visible" && (!trimmed || trimmed === "none")) {
        found.push(`overflow-y ${el.scrollHeight}>${el.clientHeight}: ${name(el)}`);
      }
    }
    for (const el of aside) { el.style.display = ""; }
    for (const el of document.querySelectorAll("[data-float] *, [data-float]")) {
      const fs = getComputedStyle(el);
      if ((fs.overflowX !== "visible" || el.tagName === "INPUT") && el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0 && !scroller(fs)) {
        found.push(`overflow-x in float: ${name(el)}`);
      }
    }
    for (const row of document.querySelectorAll("[data-sweep='row']")) {
      const kids = [...row.children].filter((kid) => box(kid).width > 0);
      kids.forEach((a, i) => {
        for (const b of kids.slice(i + 1)) {
          if (meets(box(a), box(b))) { found.push(`overlap in row: ${name(a)} × ${name(b)}`); }
        }
      });
    }
    const fronts = [...document.querySelectorAll("[data-pin-front] [data-marker], [data-pin='13'] > [data-marker]")];
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one pass over the pins, in the page's own function.
    fronts.forEach((a, i) => {
      for (const b of fronts.slice(i + 1)) {
        if (meets(box(a), box(b))) { found.push(`pins overlap: ${name(a)} × ${name(b)}`); }
      }
      for (const tag of document.querySelectorAll("[data-tag]")) {
        if (meets(box(a), box(tag))) { found.push(`pin on name tag: ${name(a)} × ${name(tag)}`); }
      }
      for (const float of document.querySelectorAll("[data-float]")) {
        if (meets(box(a), box(float))) { found.push(`surface over pin: ${name(a)}`); }
      }
      const edge = a.closest("[data-cell], [data-frame], [data-well]");
      if (edge) {
        const r = box(a);
        const ring = new DOMRect(r.x - 2, r.y - 2, r.width + 4, r.height + 4);
        if (!within(ring, box(edge))) { found.push(`pin past its well's edge: ${name(a)}`); }
      }
    });
    for (const fig of document.querySelectorAll("[data-figure]")) {
      const marker = fig.closest("[data-marker]");
      if (marker && !within(box(fig), box(marker))) { found.push(`figure past its marker: ${name(marker)}`); }
    }
    const panel = document.querySelector("[data-panel]");
    for (const float of document.querySelectorAll("[data-float]")) {
      const frame = float.closest("[data-frame]") ?? panel;
      if (frame && !within(box(float), box(frame))) { found.push(`surface past the panel: ${name(float)}`); }
    }
    return found;
  });

interface Clip { height: number; width: number; x: number; y: number }

/** Every open outline and cut line inside the picture's region, in words. */
const cropSweep = (tab: Page, clip: Clip) =>
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: the sweep runs in the page, so it is one function the browser is handed whole.
  tab.evaluate((region) => {
    const found: string[] = [];
    const name = (el: Element) =>
      `${el.tagName.toLowerCase()}${[...el.attributes].filter((a) => a.name.startsWith("data-") && a.name !== "data-slot").map((a) => `[${a.name}=${a.value}]`).join("")} “${(el.textContent ?? "").trim().slice(0, 40)}”`;
    const picture = new DOMRect(region.x, region.y, region.width, region.height);
    const meets = (a: DOMRect, b: DOMRect) =>
      Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0.5 &&
      Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0.5;
    const within = (a: DOMRect, b: DOMRect) =>
      a.left >= b.left - 0.5 && a.right <= b.right + 0.5 && a.top >= b.top - 0.5 && a.bottom <= b.bottom + 0.5;
    const shown = (el: Element) => {
      for (let at: Element | null = el; at; at = at.parentElement) {
        const s = getComputedStyle(at);
        if (s.display === "none" || s.visibility === "hidden" || s.opacity === "0") { return false; }
      }
      return true;
    };
    /** Each box holding `el` that cuts what runs past it, with the edge it cuts at. */
    const clippers = (el: Element) => {
      const out: { el: Element; box: DOMRect }[] = [];
      for (let at = el.parentElement; at && at !== document.body; at = at.parentElement) {
        const s = getComputedStyle(at);
        if (s.overflowX !== "visible" || s.overflowY !== "visible") { out.push({ el: at, box: at.getBoundingClientRect() }); }
      }
      return out;
    };

    // Open outlines: a dashed edge or a frame must close inside the picture.
    for (const el of document.querySelectorAll("main *")) {
      if (el.closest("svg") || !shown(el)) { continue; }
      const s = getComputedStyle(el);
      const sides = [s.borderTopStyle, s.borderRightStyle, s.borderBottomStyle, s.borderLeftStyle];
      const dashedBorder = sides.some((side) => side === "dashed") && Number.parseFloat(s.borderTopWidth) + Number.parseFloat(s.borderLeftWidth) > 0;
      const dashedOutline = s.outlineStyle === "dashed" && Number.parseFloat(s.outlineWidth) > 0;
      if (!(dashedBorder || dashedOutline || el.matches("[data-frame]"))) { continue; }
      const r = el.getBoundingClientRect();
      const out = dashedOutline ? Number.parseFloat(s.outlineOffset) + Number.parseFloat(s.outlineWidth) : 0;
      const edge = new DOMRect(r.x - out, r.y - out, r.width + 2 * out, r.height + 2 * out);
      if (!meets(edge, picture)) { continue; }
      if (!within(edge, picture)) {
        found.push(`open outline, past the picture's edge: ${name(el)}`);
        continue;
      }
      const held = clippers(el).find((clipper) => !within(edge, clipper.box));
      if (held) { found.push(`open outline, past the edge of ${name(held.el)}: ${name(el)}`); }
    }

    // Cut lines: each line box of each text run, hit-tested along its length.
    // Every drawn part is made hit-testable while it's read (pins are
    // pointer-events: none on the page, so a press reaches the element under
    // them), except the decorations the drawings mark aria-hidden: outlines,
    // the well's and frames' edges, status dots; and the boxes that stand
    // over the form's elements to hold their pins (data-over-box), which are
    // geometry, not surfaces.
    const testable = document.createElement("style");
    testable.textContent = `:is(main, [data-float]) *:not([aria-hidden="true"], [aria-hidden="true"] *, [data-over-box]) { pointer-events: auto !important; }`;
    document.head.append(testable);
    /** A screen reader's label: clipped to nothing, or a 1px box, by design. */
    const unseen = (el: Element) => {
      for (let at: Element | null = el; at && at !== document.body; at = at.parentElement) {
        const s = getComputedStyle(at);
        if (s.clipPath !== "none" || (s.clip && s.clip !== "auto")) { return true; }
        if (s.position === "absolute" && at.getBoundingClientRect().width <= 2) { return true; }
      }
      return false;
    };
    // The scene, and the floating surfaces the kit portals out of it.
    const roots = [document.querySelector("main"), ...[...document.querySelectorAll("[data-float]")].filter((float) => !float.closest("main"))];
    const texts = roots.flatMap((root) => {
      const out: Node[] = [];
      if (!root) { return out; }
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) { out.push(node); }
      return out;
    });
    // Every line of words in the scene: each text run's line boxes, and each
    // field's value (a textarea's, an input's, a select's chosen option),
    // which no text node holds: its lines are read from a mirror laid out
    // with the field's own box and type, kept to the field's content box.
    const range = document.createRange();
    const lines: { host: Element; words: string; boxes: DOMRect[] }[] = [];
    for (const node of texts) {
      const host = node.parentElement;
      if (!(host && (node.textContent ?? "").trim()) || host.closest("svg, select") || !shown(host) || unseen(host)) { continue; }
      range.selectNodeContents(node);
      lines.push({ host, words: (node.textContent ?? "").trim(), boxes: [...range.getClientRects()] });
    }
    const fields = roots.flatMap((root) => (root ? [...root.querySelectorAll<HTMLElement>("textarea, select, input:not([type]), input[type='text'], input[type='search']")] : []));
    for (const field of fields) {
      if (!shown(field) || unseen(field)) { continue; }
      const value = field instanceof HTMLSelectElement ? (field.selectedOptions[0]?.text ?? "") : (field as HTMLInputElement | HTMLTextAreaElement).value || (field as HTMLInputElement).placeholder;
      if (!value.trim()) { continue; }
      const fs = getComputedStyle(field);
      const box = field.getBoundingClientRect();
      const mirror = document.createElement("div");
      for (const property of ["font", "letterSpacing", "wordSpacing", "lineHeight", "textIndent", "textAlign", "textTransform", "fontFeatureSettings", "fontVariantNumeric", "boxSizing", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft", "borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth", "overflowWrap", "wordBreak", "tabSize"] as const) {
        mirror.style[property] = fs[property];
      }
      Object.assign(mirror.style, {
        position: "fixed", left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px`,
        borderStyle: "solid", borderColor: "transparent", visibility: "hidden", pointerEvents: "none", overflow: "hidden",
        whiteSpace: field instanceof HTMLTextAreaElement ? "pre-wrap" : "pre",
      });
      mirror.textContent = value;
      document.body.append(mirror);
      const content = new DOMRect(
        box.left + field.clientLeft + Number.parseFloat(fs.paddingLeft), box.top + field.clientTop + Number.parseFloat(fs.paddingTop),
        field.clientWidth - Number.parseFloat(fs.paddingLeft) - Number.parseFloat(fs.paddingRight),
        field.clientHeight - Number.parseFloat(fs.paddingTop) - Number.parseFloat(fs.paddingBottom),
      );
      range.selectNodeContents(mirror);
      const boxes = [...range.getClientRects()].map((line) => {
        const l = Math.max(line.left, content.left);
        const t = Math.max(line.top, content.top);
        return new DOMRect(l, t, Math.min(line.right, content.right) - l, Math.min(line.bottom, content.bottom) - t);
      }).filter((line) => line.width > 1 && line.height > 1);
      mirror.remove();
      lines.push({ host: field, words: value.trim(), boxes });
    }
    for (const { host, words, boxes } of lines) {
      // A pin's stacked markers are one surface: the front one covers the deck by design.
      const pin = host.closest("[data-pin]");
      for (const line of boxes) {
        if (line.width < 2 || line.height < 2 || !meets(line, picture)) { continue; }
        // The picture's top and bottom edges cut no line: a crop stops between lines. (Its sides may cut
        // the page's lines: a picture of the panel's end shows the page's end, not its start.)
        if ((line.top < picture.top - 0.5 && line.bottom > picture.top + 0.5) || (line.top < picture.bottom - 0.5 && line.bottom > picture.bottom + 0.5)) {
          found.push(`cut line “${words.slice(0, 40)}”, cut by the picture's ${line.top < picture.top ? "top" : "bottom"} edge`);
          continue;
        }
        const left = Math.max(line.left, picture.left) + 1;
        const right = Math.min(line.right, picture.right) - 1;
        const top = Math.max(line.top, picture.top);
        const bottom = Math.min(line.bottom, picture.bottom);
        let own = 0;
        let covered = 0;
        const over = new Set<Element | null>();
        for (const y of [top + (bottom - top) * 0.2, (top + bottom) / 2, bottom - (bottom - top) * 0.2]) {
          for (let x = left; x <= right; x += 3) {
            const hit = document.elementFromPoint(x, y);
            // A part drawn invisible (a button's resting spinner cell, opacity 0) covers nothing.
            if (hit && !shown(hit)) { continue; }
            if (hit && (hit === host || host.contains(hit) || hit.contains(host) || pin?.contains(hit))) {
              own += 1;
            } else if (!hit?.closest("[data-pin][data-shape='stem']")) {
              // A stem's pill crosses the words under it by design (pick 2's stem option, its stated
              // cost); any other marker standing over words cuts them like any surface.
              covered += 1;
              over.add(hit);
            }
          }
        }
        if (own > 0 && covered > 0) {
          const by = [...over].map((el) => (el ? name(el) : "nothing")).join(" + ");
          found.push(`cut line “${words.slice(0, 40)}”, ${covered} of ${own + covered} points covered by ${by}`);
        }
      }
    }
    testable.remove();

    // Crowded tags: a name tag needs room of its own, `ROOM` clear of every
    // drawn part but the ones it stands on (its outline's element and what
    // holds it), floating surfaces included wherever the kit portals them.
    // The drawings place tags by the same room (drawings/src/parts/place-tag.ts).
    const ROOM = 3;
    // What a part paints, as place-tag.ts reads it: its box, or where its words stand when words are all it paints.
    const painted = (el: Element): DOMRect[] => {
      const s = getComputedStyle(el);
      const fill = s.backgroundColor !== "rgba(0, 0, 0, 0)" && s.backgroundColor !== "transparent";
      const edge = ["Top", "Right", "Bottom", "Left"].some((side) => Number.parseFloat(s.getPropertyValue(`border-${side.toLowerCase()}-width`)) > 0);
      if (fill || edge || el.tagName === "svg" || el.tagName === "TEXTAREA" || el.tagName === "INPUT") { return [el.getBoundingClientRect()]; }
      const words = document.createRange();
      return [...el.childNodes]
        .filter((child) => child.nodeType === Node.TEXT_NODE && (child.textContent ?? "").trim())
        .flatMap((child) => {
          words.selectNodeContents(child);
          return [...words.getClientRects()];
        });
    };
    for (const tag of document.querySelectorAll("main [data-tag]")) {
      if (!shown(tag)) { continue; }
      const t = tag.getBoundingClientRect();
      if (!meets(t, picture)) { continue; }
      const room = new DOMRect(t.x - ROOM, t.y - ROOM, t.width + 2 * ROOM, t.height + 2 * ROOM);
      const anchor = tag.parentElement;
      for (const el of document.querySelectorAll("main *, [data-float], [data-float] *")) {
        if (el === tag || el === anchor || tag.contains(el) || el.contains(tag) || el.closest("[aria-hidden='true'], [data-pin]") || !shown(el)) { continue; }
        if (painted(el).some((r) => meets(r, picture) && meets(room, r))) { found.push(`crowded tag ${name(tag)}: within ${ROOM}px of ${name(el)}`); }
      }
    }
    return found;
  }, clip);

const regionOf = async (tab: Page, region: Region) => {
  const rect = (sel: string) =>
    tab.locator(sel).first().evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    });
  if (region.kind === "el") {
    const r = await rect(region.sel);
    const pad = region.pad ?? 0;
    return { x: r.x - pad, y: r.y - pad, width: r.width + 2 * pad, height: region.height ?? r.height + 2 * pad };
  }
  if (region.kind === "right") {
    const r = await rect("[data-panel]");
    return { x: r.x + r.width - region.width, y: r.y, width: region.width, height: region.height ?? r.height };
  }
  const rects = await Promise.all(region.sels.map(rect));
  const panel = await rect("[data-panel]");
  const left = Math.max(panel.x, Math.min(...rects.map((r) => r.x)) - region.pad);
  const top = Math.max(panel.y, Math.min(...rects.map((r) => r.y)) - region.pad);
  const right = Math.min(panel.x + panel.width, Math.max(...rects.map((r) => r.x + r.width)) + region.pad);
  const bottom = Math.min(panel.y + panel.height, Math.max(...rects.map((r) => r.y + r.height)) + region.pad);
  return { x: left, y: top, width: right - left, height: bottom - top };
};

await mkdir(join(HERE, "captures"), { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1000, height: 1100 }, deviceScaleFactor: 2, reducedMotion: "reduce" });
const errors: string[] = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error") { errors.push(message.text()); }
});

let total = 0;
const swept = new Set<string>();
for (const shot of SHOTS) {
  // biome-ignore lint/performance/noAwaitInLoops: one tab draws one scene at a time.
  await page.goto(`http://127.0.0.1:${server.port}/?scene=${shot.scene}`);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  if (!swept.has(shot.scene)) {
    swept.add(shot.scene);
    const found = await sweep(page);
    total += found.length;
    console.log(`sweep ${shot.scene}: ${found.length}`);
    for (const line of found) { console.log(`  ${line}`); }
  }
  const clip = await regionOf(page, shot.region);
  const cropped = await cropSweep(page, clip);
  total += cropped.length;
  await page.screenshot({ path: join(HERE, shot.file), clip });
  console.log(`wrote ${shot.file} ${Math.round(clip.width)}x${Math.round(clip.height)}, picture sweep: ${cropped.length}`);
  for (const line of cropped) { console.log(`  ${line}`); }
}
console.log(`sweep total: ${total}`);
console.log(`page errors: ${errors.length}${errors.length ? `\n  ${errors.join("\n  ")}` : ""}`);
await browser.close();
server.stop();
