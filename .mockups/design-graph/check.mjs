// The round-22 proof for the design-graph mockup: engine first (computed styles, boxes, the CDP Animation
// domain), pixels only for what drawing alone decides (mask-composite). Every screen class of
// responsive-design.md at its own size: the desk family (desk 1440 light and dark, desk 1024, tablet
// landscape by touch and by trackpad, wide 1920, ultrawide 2560 and 3440) runs the whole suite; the compact
// classes (phone portrait, phone landscape, tablet portrait, a short desk window) run the same sweep on each
// face and stop of their drawer or sheet, plus their own input. Then it saves the reviewer's captures.
//   node .mockups/design-graph/check.mjs        (CHROME=<path> to point at another Chromium)
import { mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
const { chromium } = await import(join(here, "../../node_modules/playwright-core/index.mjs"));
const CHROME = process.env.CHROME || process.env.HOME + "/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome";
const URL_ = "file://" + join(here, "page.html");
const CAPS = join(here, "captures");
mkdirSync(CAPS, { recursive: true });
for (const f of readdirSync(CAPS)) rmSync(join(CAPS, f));

let fails = 0, passes = 0;
const ok = (view, name, pass, detail = "") => { pass ? passes++ : fails++; console.log((pass ? "PASS" : "FAIL") + " [" + view + "] " + name + (detail ? " — " + detail : "")); };
const note = (view, name, detail) => console.log("NOTE [" + view + "] " + name + " — " + detail);
const r2 = (n) => Math.round(n * 100) / 100;

// ---- In-page helpers ----
function install() {
  const K = (window.__k = {});
  const cv = document.createElement("canvas"); cv.width = cv.height = 1; const cx = cv.getContext("2d", { willReadFrequently: true });
  K.rgba = (css) => { cx.clearRect(0, 0, 1, 1); cx.fillStyle = "#000"; cx.fillStyle = css; cx.fillRect(0, 0, 1, 1); const d = cx.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255]; };
  K.tokenColor = (name) => { const p = document.createElement("span"); p.style.color = "var(" + name + ")"; document.body.append(p); const c = getComputedStyle(p).color; p.remove(); return K.rgba(c); };
  K.over = (top, bot) => { const a = top[3] + bot[3] * (1 - top[3]); if (!a) return [0, 0, 0, 0]; return [0, 1, 2].map((i) => (top[i] * top[3] + bot[i] * bot[3] * (1 - top[3])) / a).concat([a]); };
  const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  K.lum = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
  K.ratio = (a, b) => { const x = K.lum(a), y = K.lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  K.vis = (el) => { for (let e = el; e && e !== document.documentElement; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.display === "none" || cs.visibility === "hidden" || +cs.opacity === 0) return false; if (e.hidden) return false; } const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  // The colour behind an element: its own and its ancestors' fills composited down to the body; inside the
  // timeline, the end area stands behind what sits over it.
  K.bgOf = (el, x) => {
    const stack = [];
    for (let e = el; e; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (e.classList && e.classList.contains("tl")) {
        const area = document.getElementById("endArea"), ar = area && area.getBoundingClientRect();
        const px = x ?? (el.getBoundingClientRect().left + el.getBoundingClientRect().width / 2);
        // Stacked rows draw the end area inside each lane and the ruler (::before, from --end-x).
        if (getComputedStyle(e).getPropertyValue("--rows").trim() === "stacked") {
          const host = el.closest(".ruler, .lane");
          if (host && px >= host.getBoundingClientRect().left + parseFloat(getComputedStyle(e).getPropertyValue("--end-x")) + 1) { stack.push(K.rgba(getComputedStyle(host, "::before").backgroundColor)); break; }
        } else if (ar && K.vis(area) && px >= ar.left + 1) { stack.push(K.rgba(getComputedStyle(area).backgroundColor)); break; }
      }
      const c = K.rgba(cs.backgroundColor);
      if (c[3] > 0) stack.push(c);
      if (c[3] >= 1) break;
      if (e === document.body) break;
    }
    let out = K.rgba(getComputedStyle(document.body).backgroundColor);
    for (let i = stack.length - 1; i >= 0; i--) out = K.over(stack[i], out);
    return out;
  };
  // A compact screen's drawer or sheet is one surface: its head and both faces are one layer.
  K.layer = (el) => { const f = el.closest(".pop:not(.inline), .menu, .tip"); if (f) return f.className.split(" ")[0]; if (el.closest("#tools") && document.documentElement.dataset.layout !== "desk") return "tools"; const t = el.closest(".panel, .dock, .show"); return t ? t.id || t.className.split(" ")[0] : "page"; };
  K.textItems = () => {
    const out = [], walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n; (n = walker.nextNode()); ) {
      if (!n.textContent.trim()) continue;
      const el = n.parentElement;
      if (!el || el.closest("script, style, .tip, svg, .marks, .t-text-soft-old") || !K.vis(el)) continue;
      const rg = document.createRange(); rg.selectNodeContents(n);
      for (const r of rg.getClientRects()) if (r.width > 0.5 && r.height > 0.5) out.push({ el, r, kind: "text" });
    }
    return out;
  };
  K.controls = () => [...document.querySelectorAll("button, input, [role=button], [role=tab], .edge-pill, .corner-l, .badge")].filter((el) => K.vis(el) && !el.closest(".tip")).map((el) => ({ el, r: el.getBoundingClientRect(), kind: "control" }));
  K.compact = () => document.documentElement.dataset.layout !== "desk";
  // Overlaps: no text or control over another in the same layer (the page, the panel, the dock, the popover,
  // the menu); the base layers never overlap each other at all.
  K.clipTo = (el, r) => { let { left, top, right, bottom } = r; for (let e = el.parentElement; e && e !== document.body; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.overflowX !== "visible" || cs.overflowY !== "visible") { const b = e.getBoundingClientRect(); left = Math.max(left, b.left); top = Math.max(top, b.top); right = Math.min(right, b.right); bottom = Math.min(bottom, b.bottom); } } return { left, top, right, bottom }; };
  K.overlaps = () => {
    const items = K.textItems().concat(K.controls()).map((it) => ({ ...it, r: K.clipTo(it.el, it.r) })).filter((it) => it.r.right - it.r.left > 0.5 && it.r.bottom - it.r.top > 0.5), out = [];
    const hit = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0.5 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0.5;
    const name = (it) => (it.el.className && it.el.className.baseVal === undefined ? it.el.className : it.el.tagName) + ":" + (it.el.textContent || "").trim().slice(0, 24);
    for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
      const a = items[i], b = items[j];
      if (a.el === b.el || a.el.contains(b.el) || b.el.contains(a.el)) continue;
      if (K.layer(a.el) !== K.layer(b.el)) continue;
      if (a.el.closest(".t-text-soft") && a.el.closest(".t-text-soft") === b.el.closest(".t-text-soft")) continue;
      if (hit(a.r, b.r)) out.push(name(a) + " × " + name(b));
    }
    const base = ["panel", "dock", "page", "tools"].map((id) => document.getElementById(id)).filter((e) => e && K.vis(e) && getComputedStyle(e).display !== "contents");
    const stageBox = K.clipTo(document.getElementById("stage"), document.getElementById("stage").getBoundingClientRect());
    for (const t of base.filter((e) => e.id !== "page")) if (hit(t.getBoundingClientRect(), stageBox) && getComputedStyle(t).position === "fixed") out.push(t.id + " covers the component");
    const p = document.getElementById("panel"), d = document.getElementById("dock");
    if (K.vis(p) && K.vis(d) && hit(p.getBoundingClientRect(), d.getBoundingClientRect())) out.push("panel × dock");
    return [...new Set(out)];
  };
  // Spill: a box whose content runs past it where nothing scrolls or clips it on purpose.
  K.spills = () => {
    const out = [];
    for (const el of document.querySelectorAll("#page *, .panel *, .dock *, .pop *, .menu *, .show, #sheetHead *")) {
      // The corner L's stroke box is its 12px legs plus the clipped-away stroke on its other two sides.
      if (!K.vis(el) || el.closest("svg") || el.matches(".zoomer, .world, .region, .regionBody, .t-tabs-pill, .t-text-soft, .t-text-soft *, .corner-l")) continue;
      const cs = getComputedStyle(el);
      if (cs.display === "inline" || cs.position === "absolute" && el.matches(".bar, .ghost, .tail, .tie, .playhead, .snap, .tick, .end-area")) continue;
      if (el.tagName === "INPUT") { if (el.type !== "range" && el.scrollWidth > el.clientWidth + 1) out.push("input " + (el.dataset.f || "") + " cuts its value"); continue; }
      if (cs.overflowX !== "visible" && cs.overflowY !== "visible") continue;
      // Under touch every target grows a transparent hit layer (::before, absolute) past its box on purpose,
      // which every ancestor's scroll size counts: there a box is measured by what it draws, its children's
      // boxes and its own text.
      if (document.documentElement.dataset.input !== "fine") {
        const b = el.getBoundingClientRect(), rs = [...el.children].filter((k) => K.vis(k) && !k.matches(".t-tabs-pill, .bar, .ghost, .tail, .tie, .playhead, .snap, .tick, .end-area")).map((k) => k.getBoundingClientRect());
        // Text is measured across only: a run's ink box stands taller than a line-height-1 line box by design.
        for (const n of el.childNodes) if (n.nodeType === 3 && n.textContent.trim()) { const rg = document.createRange(); rg.selectNodeContents(n); for (const r of rg.getClientRects()) rs.push({ left: r.left, right: r.right, top: b.top, bottom: b.bottom, width: r.width, height: 1 }); }
        const bad = rs.filter((k) => k.width > 0.5 && k.height > 0.5 && (k.right > b.right + 1 || k.bottom > b.bottom + 1 || k.left < b.left - 1 || k.top < b.top - 1));
        if (bad.length) out.push((el.id || el.className || el.tagName) + " draws past its box by " + Math.round(Math.max(...bad.map((k) => Math.max(k.right - b.right, k.bottom - b.bottom, b.left - k.left, b.top - k.top)))) + "px");
        continue;
      }
      if (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1) out.push((el.id || el.className || el.tagName) + " " + el.scrollWidth + "/" + el.clientWidth + " × " + el.scrollHeight + "/" + el.clientHeight);
    }
    return out;
  };
  // Text contrast: every visible run against what is behind it. Disabled controls are exempt (WCAG 1.4.3).
  K.textContrast = (min = 4.5) => {
    const out = [], seen = new Set();
    for (const it of K.textItems()) {
      const el = it.el;
      if (seen.has(el)) continue; seen.add(el);
      if (el.closest(":disabled, .fld:has(input:disabled), .rrow[style*='opacity: 0.45']")) continue;
      let op = 1; for (let e = el; e; e = e.parentElement) op *= +getComputedStyle(e).opacity;
      const bg = K.bgOf(el, it.r.left + it.r.width / 2), fg0 = K.rgba(getComputedStyle(el).color);
      const fg = K.over([fg0[0], fg0[1], fg0[2], fg0[3] * op], bg);
      const r = K.ratio(fg, bg);
      out.push({ text: el.textContent.trim().slice(0, 28), r: Math.round(r * 100) / 100, pass: r >= min - 0.005 });
    }
    return out;
  };
  K.shadow = (el, pseudo) => { const v = getComputedStyle(el, pseudo).boxShadow; const m = v.match(/^(.*\))\s+(-?[\d.]+)px\s+(-?[\d.]+)px\s+(-?[\d.]+)px\s+(-?[\d.]+)px/); return m ? { color: K.rgba(m[1]), spread: parseFloat(m[5]) } : { color: [0, 0, 0, 0], spread: 0 }; };
  // A corner's used radius: CSS scales every radius down by one factor when two on a side outgrow it.
  K.usedRadius = (el, pseudo) => { const cs = getComputedStyle(el, pseudo), b = el.getBoundingClientRect(); const [tl, tr, br, bl] = ["borderTopLeftRadius", "borderTopRightRadius", "borderBottomRightRadius", "borderBottomLeftRadius"].map((k) => parseFloat(cs[k]) || 0); const f = Math.min(1, b.width / (tl + tr || 1), b.width / (bl + br || 1), b.height / (tl + bl || 1), b.height / (tr + br || 1)); return { tl: tl * f, tr: tr * f, br: br * f, bl: bl * f }; };
  // Breakage the eye catches (the review of round 21):
  // a. the tool never sits over the component's text or controls, scrolled out of its room or not;
  K.underTool = () => {
    const tools = ["dock", "panel", "show", "tools"].map((id) => document.getElementById(id)).filter((t) => t && K.vis(t) && getComputedStyle(t).position === "fixed" && getComputedStyle(t).display !== "contents");
    // What the page column clips (scrolled out of its room) is not under the tool: only what shows.
    const items = K.textItems().concat(K.controls()).filter((it) => it.el.closest("#stage")).map((it) => ({ ...it, r: K.clipTo(it.el, it.r) })).filter((it) => it.r.right - it.r.left > 0.5 && it.r.bottom - it.r.top > 0.5);
    const hit = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0.5 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0.5;
    const out = [];
    for (const t of tools) { const tb = t.getBoundingClientRect(); for (const it of items) if (hit(it.r, tb)) out.push(t.id + " over \"" + (it.el.textContent || it.el.tagName).trim().slice(0, 24) + "\""); }
    return [...new Set(out)];
  };
  // b. no tab label cut by its strip without the edge fade, and the strip clear of the zoom group;
  K.tabStrips = () => {
    const out = [];
    for (const s of document.querySelectorAll(".t-tabs")) {
      if (!K.vis(s)) continue;
      const sb = s.getBoundingClientRect();
      if (s.scrollWidth > s.clientWidth + 1) out.push("the strip " + (s.id || "") + " cuts its tabs at rest (" + s.scrollWidth + " of " + s.clientWidth + "px shown)");
      for (const t of s.querySelectorAll(".t-tab")) { const b = t.getBoundingClientRect(); const end = b.right > sb.right + 0.5 && b.left < sb.right, start = b.left < sb.left - 0.5 && b.right > sb.left; const f = s.dataset.fade || ""; if ((end && !/end|both/.test(f)) || (start && !/start|both/.test(f))) out.push("\"" + t.textContent + "\" cut at the strip's " + (end ? "end" : "start") + " with no fade"); }
      for (const z of document.querySelectorAll(".zoom, .bar-end")) { if (s.closest(".dock") || !K.vis(z)) continue; const zb = z.getBoundingClientRect(); if (Math.min(sb.right, zb.right) - Math.max(sb.left, zb.left) > 0 && Math.min(sb.bottom, zb.bottom) - Math.max(sb.top, zb.top) > 0) out.push("tab strip runs into ." + z.className.split(" ")[0] + " (" + Math.round(sb.right) + " > " + Math.round(zb.left) + ")"); }
    }
    return [...new Set(out)];
  };
  // c. no state's text cut by the graph's edge at the view it opens on;
  K.graphCuts = () => {
    const g = document.getElementById("graph"), gb = g.getBoundingClientRect(), cs = getComputedStyle(g);
    const v = { left: gb.left + parseFloat(cs.borderLeftWidth), top: gb.top + parseFloat(cs.borderTopWidth) }; v.right = v.left + g.clientWidth; v.bottom = v.top + g.clientHeight;
    const out = [];
    for (const el of g.querySelectorAll(".node, .region-name")) {
      const b = el.getBoundingClientRect();
      const showsX = b.right > v.left + 0.5 && b.left < v.right - 0.5, showsY = b.bottom > v.top + 0.5 && b.top < v.bottom - 0.5;
      if (!showsX || !showsY) continue;
      const cutX = b.left < v.left - 0.5 || b.right > v.right + 0.5, cutY = b.top < v.top - 0.5 || b.bottom > v.bottom + 0.5;
      if (cutX || cutY) out.push((el.dataset.state || el.textContent.slice(0, 16)) + " cut " + (cutX ? "across" : "") + (cutX && cutY ? " and " : "") + (cutY ? "down" : ""));
    }
    return out;
  };
  // d. no line (a graph edge, a tie, the playhead, the move's end edge) runs through a text box.
  K.linesOverText = () => {
    // A floating popover or menu stands over the dock's lines: its text is on another layer.
    const texts = K.textItems().filter((t) => !t.el.closest("svg, .pop:not(.inline), .menu")).map((t) => ({ el: t.el, r: K.clipTo(t.el, t.r) })).filter((t) => t.r.right - t.r.left > 0.5 && t.r.bottom - t.r.top > 0.5);
    const inside = (x, y, r) => x > r.left + 0.5 && x < r.right - 0.5 && y > r.top + 0.5 && y < r.bottom - 0.5;
    const out = [];
    const g = document.getElementById("graph").getBoundingClientRect();
    for (const pl of document.querySelectorAll(".world svg polyline")) {
      const m = pl.getScreenCTM(), pts = pl.getAttribute("points").split(" ").map((p) => { const [x, y] = p.split(",").map(Number); return new DOMPoint(x, y).matrixTransform(m); });
      for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i], n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y)); for (let k = 0; k <= n; k++) { const x = a.x + ((b.x - a.x) * k) / (n || 1), y = a.y + ((b.y - a.y) * k) / (n || 1); if (!inside(x, y, g)) continue; const t = texts.find((t) => inside(x, y, t.r)); if (t) { out.push("graph edge " + pl.dataset.from + "→" + pl.dataset.to + " through \"" + t.el.textContent.trim().slice(0, 20) + "\""); k = n; i = pts.length; } } }
    }
    const rects = [];
    for (const t of document.querySelectorAll(".tie")) rects.push(["tie", t.getBoundingClientRect()]);
    const ph = document.getElementById("playhead");
    if (ph && K.vis(document.getElementById("dock")) && getComputedStyle(ph, "::after").display !== "none") { const b = ph.getBoundingClientRect(), a = getComputedStyle(ph, "::after"); rects.push(["playhead", { left: b.left - 0.5, right: b.left + 0.5, top: b.top + parseFloat(a.top), bottom: b.bottom }]); }
    const area = document.getElementById("endArea");
    if (area && K.vis(document.getElementById("dock")) && K.vis(area)) { const b = area.getBoundingClientRect(), tl = document.getElementById("tl").getBoundingClientRect(); const rr = document.querySelector(".ruler-row").getBoundingClientRect(); rects.push(["move's end edge", { left: b.left, right: b.left + 1, top: Math.max(b.top, tl.top, rr.bottom), bottom: Math.min(b.bottom, tl.bottom) }]); }
    for (const s of document.querySelectorAll(".snap")) rects.push(["snap line", s.getBoundingClientRect()]);
    const ruler = document.querySelector(".ruler-row") && document.querySelector(".ruler-row").getBoundingClientRect();
    for (const [name, r] of rects) for (const t of texts) {
      const x0 = Math.max(r.left, t.r.left), x1 = Math.min(r.right, t.r.right), y0 = Math.max(r.top, t.r.top), y1 = Math.min(r.bottom, t.r.bottom);
      if (x1 - x0 > 0.25 && y1 - y0 > 0.5) out.push(name + " through \"" + t.el.textContent.trim().slice(0, 20) + "\"");
    }
    void ruler;
    return [...new Set(out)];
  };
  // The ruler's labels: no two boxes overlap, whatever the track's length.
  K.rulerOverlaps = () => {
    const ls = [...document.querySelectorAll(".ruler span")].filter((s) => K.vis(s)).map((s) => ({ t: s.textContent, b: s.getBoundingClientRect() }));
    const out = [];
    for (let i = 0; i < ls.length; i++) for (let j = i + 1; j < ls.length; j++) { const a = ls[i].b, b = ls[j].b; if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0) out.push(ls[i].t + "×" + ls[j].t); }
    return { labels: ls.map((l) => l.t).join(" "), overlaps: out };
  };
  // A wash and its 1px edge stand --space-1 clear of the text they mark.
  K.washGaps = () => {
    const pad = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--space-1")), wrap = document.getElementById("stage").getBoundingClientRect();
    return [...document.querySelectorAll(".wash")].map((w) => {
      const wb = w.getBoundingClientRect(), edge = K.shadow(w).spread || 0;
      const inner = { left: wb.left + edge, top: wb.top + edge, right: wb.right - edge, bottom: wb.bottom - edge };
      let tb = null;
      const el = w.dataset.wash === "add" && document.querySelector('#stage [data-key="' + w.dataset.of + '"]');
      if (el) { const rg = document.createRange(); rg.selectNodeContents(el); const rs = [...rg.getClientRects()].filter((r) => r.width > 0.5 && r.height > 0.5); if (rs.length) tb = { left: Math.min(...rs.map((r) => r.left)), top: Math.min(...rs.map((r) => r.top)), right: Math.max(...rs.map((r) => r.right)), bottom: Math.max(...rs.map((r) => r.bottom)) }; }
      else if (w.dataset.tx) { const [x, y, ww, hh] = w.dataset.tx.split(",").map(Number); tb = { left: wrap.left + x, top: wrap.top + y, right: wrap.left + x + ww, bottom: wrap.top + y + hh }; }
      if (!tb) return { of: w.dataset.of, kind: w.dataset.wash, gap: null };
      const gap = Math.min(tb.left - inner.left, tb.top - inner.top, inner.right - tb.right, inner.bottom - tb.bottom);
      return { of: w.dataset.of, kind: w.dataset.wash, gap: Math.round(gap * 100) / 100, pass: gap >= pad - 0.5 };
    });
  };
  // Every animation and transition on the page finished.
  K.settled = async () => { await Promise.all(document.getAnimations().map((a) => (a.playState === "running" ? a.finished.catch(() => {}) : null))); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); };
  // Per frame, every chip's and node's text against what stands behind it: a chip's base layer where its tier
  // layer (::after) doesn't cover it, and the tier layer where it does.
  K.tierFrame = () => {
    const out = [];
    for (const c of document.querySelectorAll(".var")) {
      if (!K.vis(c)) continue;
      const w = c.getBoundingClientRect().width, cs = getComputedStyle(c), base = K.bgOf(c), a = getComputedStyle(c, "::after");
      let cover = 0;
      if (a.content && a.content !== "none" && a.content !== "normal") {
        const m = (a.clipPath || "").match(/inset\(([^)]*)\)/);
        const v = m ? m[1].split(/\s+/).map((x) => (x.endsWith("%") ? (parseFloat(x) / 100) * w : parseFloat(x) || 0)) : [0, 0, 0, 0];
        const [t, r, b, l] = v.length === 1 ? [v[0], v[0], v[0], v[0]] : v.length === 2 ? [v[0], v[1], v[0], v[1]] : v.length === 3 ? [v[0], v[1], v[2], v[1]] : v;
        cover = a.clipPath === "none" ? w : Math.max(0, w - l - r);
        void t; void b;
        if (cover > 0.5) { const fill = K.over(K.rgba(a.backgroundColor), base), ink = K.rgba(a.color); out.push({ text: c.textContent, layer: "tier", r: K.ratio(K.over(ink, fill), fill) }); }
      }
      if (cover < w - 0.5) { const ink = K.rgba(cs.color); out.push({ text: c.textContent, layer: "base", r: K.ratio(K.over(ink, base), base) }); }
    }
    for (const t of document.querySelectorAll(".node > b, .node > p")) { if (!K.vis(t)) continue; const bg = K.bgOf(t), ink = K.rgba(getComputedStyle(t).color); out.push({ text: t.textContent.slice(0, 20), layer: "node", r: K.ratio(K.over(ink, bg), bg) }); }
    return out;
  };
  K.chipRatio = (c) => { const rows = []; for (const f of K.tierFrame()) if (f.text === c.textContent) rows.push(f.r); return rows.length ? Math.min(...rows) : null; };
  K.sampleTiers = (ms) => new Promise((res) => { const t0 = performance.now(), frames = []; const tick = () => { const t = Math.round(performance.now() - t0); for (const f of K.tierFrame()) frames.push({ t, ...f, r: Math.round(f.r * 100) / 100 }); if (performance.now() - t0 < ms) requestAnimationFrame(tick); else res(frames); }; tick(); });
  K.radius = (el, pseudo) => { const cs = getComputedStyle(el, pseudo); return parseFloat(cs.borderBottomLeftRadius) || 0; };
  K.box = (el) => { const b = el.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height }; };
  // The page's boxes: every element of the component, and the outer boxes of the tool.
  // The component's own boxes alone, in the viewport: what "nothing moves the preview" means where the
  // tool's own size changes (a drawer stop, the dock's height edge).
  K.stageSnap = () => [...document.querySelectorAll("#stage, #stage *")].map((el) => { const b = el.getBoundingClientRect(); return [b.x, b.y, b.width, b.height].map((v) => Math.round(v * 100) / 100).join(","); });
  K.snap = () => {
    const out = [];
    for (const el of document.querySelectorAll("#page, #page *")) { if (el.closest("#marks")) continue; const b = el.getBoundingClientRect(); out.push([b.x + scrollX, b.y + scrollY, b.width, b.height].map((v) => Math.round(v * 100) / 100).join(",")); }
    for (const s of ["#panel", ".graph", "#dock"]) { const e = document.querySelector(s); const b = e.getBoundingClientRect(); let fixed = false; for (let x = e; x; x = x.parentElement) if (getComputedStyle(x).position === "fixed") fixed = true; out.push(s + ":" + [b.x + (fixed ? 0 : scrollX), b.y + (fixed ? 0 : scrollY), b.width, b.height].map((v) => Math.round(v * 100) / 100).join(",")); }
    return out;
  };
}

// `screen` is the class app.js must set; `touch` drives the views by finger, `hasTouch` without `isMobile`
// is a trackpad iPad (any-pointer: coarse with hover).
const views = [
  { id: "1440-light", screen: "desk", viewport: { width: 1440, height: 900 }, colorScheme: "light" },
  { id: "1440-dark", screen: "desk", viewport: { width: 1440, height: 900 }, colorScheme: "dark" },
  { id: "1024", screen: "desk", viewport: { width: 1024, height: 768 }, colorScheme: "light" },
  { id: "1180-touch", screen: "tablet-landscape", input: "touch", viewport: { width: 1180, height: 820 }, colorScheme: "light", hasTouch: true, isMobile: true, touch: true },
  // An iPad with a trackpad: a fine, hovering primary pointer and a coarse one beside it. Playwright's touch
  // emulation reports no hover, so this browser is started with Blink's pointer settings (ui::PointerType
  // fine 4, coarse|fine 6; HoverType hover 2).
  { id: "1180-trackpad", screen: "tablet-landscape", input: "touch-hover", viewport: { width: 1180, height: 820 }, colorScheme: "light", args: ["--blink-settings=primaryPointerType=4,availablePointerTypes=6,primaryHoverType=2,availableHoverTypes=2"] },
  { id: "1920", screen: "wide", viewport: { width: 1920, height: 1080 }, colorScheme: "light" },
  { id: "2560", screen: "ultrawide", viewport: { width: 2560, height: 1080 }, colorScheme: "dark" },
  { id: "3440", screen: "ultrawide", viewport: { width: 3440, height: 1440 }, colorScheme: "light" },
];
const compactViews = [
  { id: "390-phone", screen: "phone-portrait", layout: "drawer", stacked: true, viewport: { width: 390, height: 844 }, colorScheme: "light", hasTouch: true, isMobile: true, touch: true },
  { id: "844-phone-landscape", screen: "phone-landscape", layout: "sheet", stacked: true, viewport: { width: 844, height: 390 }, colorScheme: "dark", hasTouch: true, isMobile: true, touch: true },
  { id: "820-tablet-portrait", screen: "tablet-portrait", layout: "drawer", viewport: { width: 820, height: 1180 }, colorScheme: "light", hasTouch: true, isMobile: true, touch: true },
  { id: "1280x540-short", screen: "short", layout: "sheet", viewport: { width: 1280, height: 540 }, colorScheme: "light" },
];

const browser = await chromium.launch({ executablePath: CHROME });
for (const view of views) await runView(view);
for (const view of compactViews) await runClass(view);
await runReduced();
grepCheck();
await browser.close();
console.log("\n" + passes + " passed, " + fails + " failed");
process.exit(fails ? 1 : 0);

async function runView(view) {
  const V = view.id, touch = !!view.touch;
  const own = view.args ? await chromium.launch({ executablePath: CHROME, args: view.args }) : null;
  const ctx = await (own || browser).newContext({ viewport: view.viewport, colorScheme: view.colorScheme, hasTouch: !!view.hasTouch, isMobile: !!view.isMobile, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const load = async () => { await page.goto(URL_); await page.waitForTimeout(700); await ev(install); };
  const settle = (ms = 450) => page.waitForTimeout(ms);
  const center = async (sel) => { const b = await page.locator(sel).first().boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2, b }; };
  const click = async (sel) => { await page.locator(sel).first().scrollIntoViewIfNeeded(); const c = await center(sel); if (touch) await page.touchscreen.tap(c.x, c.y); else await page.mouse.click(c.x, c.y); };
  const snapDiff = async (label, action, wait = 450) => {
    const a = await ev(() => __k.snap());
    await action();
    await settle(wait);
    const b = await ev(() => __k.snap());
    const moved = a.length !== b.length ? ["element count " + a.length + "→" + b.length] : a.flatMap((x, i) => (x === b[i] ? [] : [i + ": " + x + " → " + b[i]]));
    ok(V, "2 nothing moves the preview: " + label, moved.length === 0, moved.length ? moved.slice(0, 3).join("; ") : a.length + " boxes identical");
  };
  const playLen = () => ev(() => { const km = keptMove(); return km ? playLengthOf(km.r) : 0; });
  await load();
  if (touch) await page.evaluate(() => scrollTo(0, 0));

  // ---- 9. Its class (responsive-design.md): the pane measured, the layout and the input it sets ----
  const cls = await ev(() => ({ screen: document.documentElement.dataset.screen, layout: document.documentElement.dataset.layout, input: document.documentElement.dataset.input }));
  ok(V, "9 the pane is the " + view.screen + " class, the desk layout, input " + (view.input || "fine"), cls.screen === view.screen && cls.layout === "desk" && cls.input === (view.input || "fine"), JSON.stringify(cls));

  // ---- 1. No page errors; nothing overlaps or spills ----
  const sweep = async (label) => {
    const o = await ev(() => __k.overlaps()), s = await ev(() => __k.spills());
    ok(V, "1 no overlaps (" + label + ")", o.length === 0, o.length ? o.slice(0, 4).join(" | ") : "");
    ok(V, "1 nothing spills its box (" + label + ")", s.length === 0, s.length ? s.slice(0, 4).join(" | ") : "");
  };
  await sweep("at rest");
  const breakage = async (label) => {
    const a = await ev(() => __k.underTool()), b = await ev(() => __k.tabStrips()), c = await ev(() => __k.graphCuts()), d = await ev(() => __k.linesOverText());
    ok(V, "1 the dock and the panel sit over none of the component's text or controls (" + label + ")", a.length === 0, a.slice(0, 5).join(" | "));
    ok(V, "1 every tab shown whole at rest (and never cut without its edge fade), the tab strip clear of the zoom group (" + label + ")", b.length === 0, b.join(" | "));
    ok(V, "1 no state's text cut by the graph's edge (" + label + ")", c.length === 0, c.slice(0, 6).join(" | "));
    ok(V, "1 no line runs through a text box (" + label + ")", d.length === 0, d.slice(0, 5).join(" | "));
  };
  await breakage("the view it opens on");
  const rulerAt = async (label) => { const r = await ev(() => __k.rulerOverlaps()); ok(V, "1 no two ruler labels overlap (" + label + ")", r.overlaps.length === 0, (r.overlaps.length ? "OVERLAP " + r.overlaps.slice(0, 4).join(", ") + "; " : "") + "labels " + r.labels); };
  await rulerAt("320 ms track");

  // ---- 7. Contrast at rest ----
  const contrast = async (label) => {
    const t = await ev(() => __k.textContrast());
    const bad = t.filter((x) => !x.pass);
    ok(V, "7 text ≥ 4.5:1 (" + label + ")", bad.length === 0, bad.length ? bad.slice(0, 4).map((x) => x.text + " " + x.r).join(" | ") : t.length + " runs, lowest " + Math.min(...t.map((x) => x.r)));
  };
  await contrast("at rest");
  // Non-text marks this round draws, each against what it stands on.
  const marks = await ev(() => {
    const K = __k, out = [];
    const add = (name, ink, ...bgs) => { for (const [bn, bg] of bgs) out.push({ name: name + " on " + bn, r: Math.round(K.ratio(K.over(ink, bg), bg) * 100) / 100 }); };
    const panel = document.getElementById("panel"), body = K.rgba(getComputedStyle(document.body).backgroundColor), raised = K.bgOf(panel);
    const pill = document.querySelector(".edge-pill-h");
    if (K.vis(pill)) add("edge pill at rest", K.rgba(getComputedStyle(pill).backgroundColor), ["panel", raised], ["page", body]);
    const L = document.querySelector(".corner-l");
    if (K.vis(L)) add("corner L at rest", K.shadow(L, "::before").color, ["panel", raised]);
    add("lit edge, hovered", K.shadow(panel, "::after").color, ["panel", raised], ["page", body]);
    add("lit edge, held", K.tokenColor("--ink-muted"), ["panel", raised], ["page", body]);
    const bar = document.querySelector(".bar"), dockBg = K.bgOf(document.getElementById("dock"));
    if (bar) {
      const edge = getComputedStyle(bar).boxShadow.match(/^(.*?\))\s/);
      add("clip bar edge", K.rgba(edge ? edge[1] : "transparent"), ["dock", dockBg]);
      add("selected bar edge", K.tokenColor("--brand-solid"), ["dock", dockBg]);
      add("ghost edge", K.tokenColor("--border-contrast"), ["dock", dockBg]);
      add("tie", K.tokenColor("--border-contrast"), ["dock", dockBg]);
      add("playhead", K.rgba(getComputedStyle(document.getElementById("playhead"), "::after").backgroundColor), ["dock", dockBg], ["end area", K.tokenColor("--surface-recess-deep")]);
      add("move's end edge", K.rgba(getComputedStyle(document.getElementById("endArea")).borderLeftColor), ["dock", dockBg]);
      add("free dashed edge", K.tokenColor("--border-row-outline"), ["dock", dockBg], ["badge", K.tokenColor("--surface-recess")]);
      add("curve glyph", K.tokenColor("--ink-muted"), ["badge", K.tokenColor("--surface-recess")]);
      add("transport glyph", K.rgba(getComputedStyle(document.getElementById("play")).color), ["dock", dockBg]);
    }
    const well = K.bgOf(document.getElementById("graph"));
    add("kept edge", K.tokenColor("--brand-solid"), ["well", well]);
    add("graph disc", K.tokenColor("--brand-ink-strong"), ["well", well]);
    add("zoom glyph", K.rgba(getComputedStyle(document.getElementById("zoomIn")).color), ["panel", raised]);
    add("focus ring", K.tokenColor("--focus-ring"), ["panel", raised], ["page", body]);
    return out;
  });
  const badMarks = marks.filter((m) => m.r < 3);
  ok(V, "7 non-text marks ≥ 3:1", badMarks.length === 0, (badMarks.length ? "FAILING " + badMarks.map((m) => m.name + " " + m.r).join(", ") + "; " : "") + marks.map((m) => m.name + " " + m.r).join(", "));
  const kit = await ev(() => { const K = __k, raised = K.bgOf(document.getElementById("panel")), well = K.bgOf(document.getElementById("graph")); return { control: Math.round(K.ratio(K.tokenColor("--border-control"), raised) * 100) / 100, card: Math.round(K.ratio(K.tokenColor("--border-card"), well) * 100) / 100, fill: Math.round(K.ratio(K.tokenColor("--surface-fill"), raised) * 100) / 100, deep: Math.round(K.ratio(K.tokenColor("--surface-recess-deep"), raised) * 100) / 100 }; });
  note(V, "7 measured, not this round's marks", "kit control edge (fields, nodes) " + kit.control + ":1, region dashed edge (border-card on the well) " + kit.card + ":1, bar fill alone " + kit.fill + ":1 (hence its 3:1 edge), end-area fill alone " + kit.deep + ":1 (hence its 3:1 start edge)");

  // ---- 5. The lane and the bar ----
  const lanes = await ev(() => {
    const K = __k, out = {};
    const lanes = [...document.querySelectorAll(".lane")];
    out.noBand = lanes.every((l) => { const cs = getComputedStyle(l); return K.rgba(cs.backgroundColor)[3] === 0 && cs.borderTopStyle === "none" && cs.backgroundImage === "none"; });
    const shapes = [...document.querySelectorAll(".bar, .ghost:not([hidden])")];
    out.shapes = shapes.map((s) => { const b = s.getBoundingClientRect(); return { k: s.className + ":" + (s.dataset.key || s.parentNode.dataset.key), h: Math.round(b.height * 100) / 100, r: K.radius(s), kids: s.childElementCount }; });
    const area = document.getElementById("endArea"), ab = area.getBoundingClientRect(), rows = [...document.querySelectorAll(".clip")], ruler = document.querySelector(".ruler-row").getBoundingClientRect();
    const tl = document.getElementById("tl").getBoundingClientRect(), km = keptMove(), g = laneGeo();
    out.area = { one: document.querySelectorAll(".end-area").length === 1, left: Math.round(ab.left * 100) / 100, want: Math.round((tl.left + xOf(g, lengthOf(km.r))) * 100) / 100, right: Math.round(ab.right), laneEnd: Math.round(tl.left + g.x0 + g.w), top: ab.top <= ruler.top + 0.5, bottom: ab.bottom >= rows[rows.length - 1].getBoundingClientRect().bottom - 0.5, behind: getComputedStyle(area).pointerEvents === "none" && area.compareDocumentPosition(document.getElementById("rows")) & Node.DOCUMENT_POSITION_FOLLOWING };
    out.ties = km.clips.filter((c) => c.at.ref).map((c) => { const t = document.querySelector('.tie[data-for="' + c.key + '"]'); const a = km.r[c.at.of]; const x = tl.left + xOf(g, c.at.ref === "after" ? a.end : a.start); return { k: c.key, drawn: !!t, x: t ? Math.round(t.getBoundingClientRect().left * 100) / 100 : null, want: Math.round(x * 100) / 100 }; });
    out.readouts = rows.map((row) => { const name = row.querySelector(".clip-name").getBoundingClientRect(), b = [...row.querySelectorAll(".readouts .badge")].slice(0, 2).map((x) => x.getBoundingClientRect()); return { col: Math.round(name.width), oneLine: b.length === 2 && Math.abs(b[0].top - b[1].top) < 0.5, fits: b.every((x) => x.right <= name.right + 0.5), right: Math.round(Math.max(...b.map((x) => x.right)) - name.left) }; });
    return out;
  });
  ok(V, "5 no lane band", lanes.noBand);
  ok(V, "5 every bar and ghost 24px, 5px radius, nothing inside", lanes.shapes.every((s) => s.h === 24 && s.r === 5 && s.kids === 0), lanes.shapes.map((s) => s.k.split(" ")[0] + " " + s.h + "/" + s.r + "/" + s.kids).join(", "));
  ok(V, "5 end region is one area behind every row and the ruler", lanes.area.one && Math.abs(lanes.area.left - lanes.area.want) <= 1 && Math.abs(lanes.area.right - lanes.area.laneEnd) <= 1 && lanes.area.top && lanes.area.bottom && !!lanes.area.behind, JSON.stringify(lanes.area));
  ok(V, "5 each anchored start draws its tie", lanes.ties.length > 0 && lanes.ties.every((t) => t.drawn && Math.abs(t.x - t.want) <= 1), JSON.stringify(lanes.ties));
  if (view.viewport.width >= 640) ok(V, "5 each row's readouts on one line in the 280px name column", lanes.readouts.every((r) => r.oneLine && r.fits && r.col === 280), lanes.readouts.map((r) => r.right + "/" + r.col + "px").join(", "));
  else ok(V, "5 under the phone line the name column is half the dock: each readout whole on a line of its own", lanes.readouts.every((r) => r.fits), lanes.readouts.map((r) => r.right + "/" + r.col + "px").join(", "));

  // ---- 6. Concentric radii, for each pair this mockup draws ----
  const conc = async (label) => {
    const pairs = await ev(() => {
      const K = __k, out = [];
      const pair = (name, outer, inner) => {
        if (!outer || !inner || !K.vis(inner)) return;
        const o = outer.getBoundingClientRect(), i = inner.getBoundingClientRect(), RO = K.usedRadius(outer), RI = K.usedRadius(inner);
        // The corner the inner shape sits in: both its gaps under the outer radius.
        for (const [gx, gy, c] of [[i.left - o.left, i.top - o.top, "tl"], [o.right - i.right, i.top - o.top, "tr"], [i.left - o.left, o.bottom - i.bottom, "bl"], [o.right - i.right, o.bottom - i.bottom, "br"]]) {
          const R = RO[c], r = RI[c];
          if (gx < R && gy < R && gx >= -1 && gy >= -1 && Math.abs(gx - gy) <= 1) out.push({ name, R: Math.round(R * 100) / 100, r: Math.round(r * 100) / 100, gap: Math.round(((gx + gy) / 2) * 100) / 100, even: Math.abs(gx - gy) <= 0.5, pass: Math.abs(R - (r + (gx + gy) / 2)) <= 0.5 && Math.abs(gx - gy) <= 0.5 });
        }
      };
      const panel = document.getElementById("panel");
      pair("panel ⊃ corner L", panel, document.querySelector(".corner-l"));
      const pb = panel.getBoundingClientRect(), a = getComputedStyle(panel, "::after"), ins = -parseFloat(a.top);
      const ab = { left: pb.left + 1 - ins, top: pb.top + 1 - ins, right: pb.right - 1 + ins, bottom: pb.bottom - 1 + ins };
      if (a.display !== "none" && K.vis(panel)) out.push({ name: "lit edge ⊃ panel", R: parseFloat(a.borderTopLeftRadius), r: K.radius(panel), gap: Math.round((pb.left - ab.left) * 100) / 100, even: true, pass: Math.abs(parseFloat(a.borderTopLeftRadius) - (K.radius(panel) + (pb.left - ab.left))) <= 0.5 });
      for (const n of document.querySelectorAll(".node")) pair("region ⊃ node", n.closest(".region"), n);
      for (const b of document.querySelectorAll(".zoom .icon-btn")) pair("zoom group ⊃ button", b.closest(".zoom"), b);
      for (const t of document.querySelectorAll(".t-tabs")) pair("tabs track ⊃ pill", t, t.querySelector(".t-tabs-pill"));
      for (const f of document.querySelectorAll(".fld")) { const b = f.querySelector(".badge"); if (b) pair("field ⊃ token badge", f, b); }
      for (const m of document.querySelectorAll(".menu .mi")) pair("menu ⊃ item", m.closest(".menu"), m);
      for (const w of document.querySelectorAll(".wash")) { const k = w.dataset.of; const el = k && document.querySelector('#stage [data-key="' + k + '"]'); if (el) out.push({ name: "wash ⊃ field", R: K.radius(w), r: K.radius(el), gap: Math.round((el.getBoundingClientRect().left - w.getBoundingClientRect().left) * 100) / 100, even: true, pass: Math.abs(K.radius(w) - (K.radius(el) + (el.getBoundingClientRect().left - w.getBoundingClientRect().left))) <= 0.5 }); }
      return out;
    });
    const bad = pairs.filter((p) => !p.pass), names = [...new Set(pairs.map((p) => p.name))];
    ok(V, "6 concentric (" + label + ")", pairs.length > 0 && bad.length === 0, (bad.length ? "FAILING " + bad.map((p) => p.name + " " + p.R + "≠" + p.r + "+" + p.gap).join(", ") + "; " : "") + names.map((n) => { const p = pairs.find((x) => x.name === n); return n + " " + p.R + " = " + p.r + " + " + p.gap; }).join(", "));
  };
  await conc("at rest");

  // ---- 3. Resize: the marks, the hit bands, the lit edge ----
  const grips = await ev(() => {
    const K = __k, panel = document.getElementById("panel"), p = panel.getBoundingClientRect(), rel = (el) => { if (!K.vis(el)) return null; const b = el.getBoundingClientRect(); return { x: Math.round((b.left - p.left) * 100) / 100, y: Math.round((b.top - p.top) * 100) / 100, r: Math.round((p.right - b.right) * 100) / 100, b: Math.round((p.bottom - b.bottom) * 100) / 100, w: Math.round(b.width * 100) / 100, h: Math.round(b.height * 100) / 100 }; };
    const cs = getComputedStyle(panel), padL = parseFloat(cs.paddingLeft) + 1, padB = parseFloat(cs.paddingBottom) + 1;
    return { panel: { w: p.width, h: p.height, padL, padB }, pillW: rel(document.querySelector(".edge-pill-w")), pillH: rel(document.querySelector(".edge-pill-h")), L: rel(document.querySelector(".corner-l")), sashW: rel(document.getElementById("sashW")), sashH: rel(document.getElementById("sashH")), sashC: rel(document.getElementById("sashC")), coarse: document.documentElement.dataset.input !== "fine" };
  });
  const G = grips;
  console.log("INFO [" + V + "] 3 grips, drawn and hit boxes relative to the panel's border box: " + JSON.stringify({ pillW: G.pillW, pillH: G.pillH, L: G.L, sashW: G.sashW, sashH: G.sashH, sashC: G.sashC }));
  if (G.pillW) ok(V, "3 width pill: 6×36, centred on the left border and on the run", G.pillW.w === 6 && G.pillW.h === 36 && Math.abs(G.pillW.x + 3 - 0.5) <= 0.01 && Math.abs(G.pillW.y + 18 - G.panel.h / 2) <= 0.5, JSON.stringify(G.pillW));
  ok(V, "3 foot pill: 36×6, centred on the bottom border and on the run", G.pillH.w === 36 && G.pillH.h === 6 && Math.abs(G.pillH.b + 3 - 0.5) <= 0.01 && Math.abs(G.pillH.x + 18 - G.panel.w / 2) <= 0.5, JSON.stringify(G.pillH));
  if (G.L) ok(V, "3 corner L: 12×12, 6px in from the corner", G.L.w === 12 && G.L.h === 12 && G.L.x === 6 && G.L.b === 6, JSON.stringify(G.L));
  const band = G.coarse ? 44 : 11;
  if (G.sashW) ok(V, "3 width band: " + band + "px straddling the edge, stopping short of the curves, never over content", Math.abs(G.sashW.w - band) < 0.01 && (G.coarse ? Math.abs(G.sashW.x + 22 - 0.5) < 0.01 : G.sashW.x === -4 && G.sashW.x + G.sashW.w <= G.panel.padL) && G.sashW.y >= 16, JSON.stringify(G.sashW));
  ok(V, "3 foot band: " + band + "px straddling the foot, never over content", Math.abs(G.sashH.h - band) < 0.01 && (G.coarse ? Math.abs(G.sashH.b + 22 - 0.5) < 0.01 : G.sashH.b === -4 && G.sashH.b + G.sashH.h <= G.panel.padB) && G.sashH.x >= 16, JSON.stringify(G.sashH));
  if (G.sashC) ok(V, "3 corner square: " + (G.coarse ? "44" : "20") + "px from " + (G.coarse ? "the corner, straddling" : "4px outside"), G.coarse ? G.sashC.w === 44 : G.sashC.w === 20 && G.sashC.h === 20 && G.sashC.x === -4 && G.sashC.b === -4, JSON.stringify(G.sashC));
  const lit = await ev(() => { const P = document.getElementById("panel"), a = getComputedStyle(P, "::after"), p = getComputedStyle(P); return { radius: a.borderTopLeftRadius, panelRadius: p.borderTopLeftRadius, inset: a.top, stroke: __k.shadow(P, "::after").spread, opacity: a.opacity }; });
  ok(V, "3 lit edge: a 1.5px stroke centred on the 1px border, on the panel's own radius (+0.25), invisible at rest", parseFloat(lit.radius) === parseFloat(lit.panelRadius) + 0.25 && parseFloat(lit.inset) === -1.25 && lit.stroke === 1.5 && lit.opacity === "0", JSON.stringify(lit));
  const brandInks = await ev(() => ["--brand-solid", "--brand-ink", "--brand-ink-strong", "--brand-wash", "--action-solid", "--action-hover", "--coral-9", "--coral-10", "--coral-11", "--selected-bg"].map((n) => __k.tokenColor(n).slice(0, 3).join(",")));
  const inks = () => ev(() => { const P = document.getElementById("panel"), a = getComputedStyle(P, "::after"); return { lit: __k.shadow(P, "::after").color.slice(0, 3).join(","), opacity: +a.opacity, mask: a.maskImage.slice(0, 60), composite: a.maskComposite, pillW: __k.rgba(getComputedStyle(document.querySelector(".edge-pill-w")).backgroundColor).slice(0, 3).join(","), pillH: __k.rgba(getComputedStyle(document.querySelector(".edge-pill-h")).backgroundColor).slice(0, 3).join(","), L: __k.shadow(document.querySelector(".corner-l"), "::before").color.slice(0, 3).join(","), muted: __k.tokenColor("--ink-muted").slice(0, 3).join(","), html: getComputedStyle(document.documentElement).cursor }; });
  const rest = await inks();
  ok(V, "3 the marks' and the lit edge's ink is never brand-* or action-* (at rest)", ![rest.lit, rest.pillW, rest.pillH, rest.L].some((c) => brandInks.includes(c)), JSON.stringify(rest));

  // Pixel proof of mask-composite: what the lit edge lights, and what it leaves dark.
  const shot = async () => (await page.screenshot({ type: "png" })).toString("base64");
  const sample = (b64, pts) => ev(async ({ b64, pts }) => { const img = new Image(); img.src = "data:image/png;base64," + b64; await img.decode(); const c = document.createElement("canvas"); c.width = img.width; c.height = img.height; const x = c.getContext("2d"); x.drawImage(img, 0, 0); return pts.map(([px, py]) => [...x.getImageData(Math.floor(px), Math.floor(py), 1, 1).data.slice(0, 3)]); }, { b64, pts });
  const dist = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Animation.enable");
  const anims = [];
  cdp.on("Animation.animationStarted", (e) => anims.push(e.animation));
  const hoverable = !touch;
  for (const [edge, sashId] of [["w", "sashW"], ["h", "sashH"], ["wh", "sashC"]]) {
    if (!(await page.locator("#" + sashId).isVisible())) { note(V, "3 " + edge + " grip", "not drawn on this class (touch without hover has no corner)"); continue; }
    if (!hoverable) { note(V, "3 " + edge + " hover", "no hover under touch: the mark tints on touch-down (drag below)"); continue; }
    const pb = await ev(() => { const b = document.getElementById("panel").getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height }; });
    const c = await center("#" + sashId);
    await page.mouse.move(pb.l - 200, pb.t + 40);
    await settle(300);
    if (edge === "w") await page.screenshot({ path: join(CAPS, V + "-grip-width-rest.jpg"), type: "jpeg", quality: 85, clip: { x: pb.l - 30, y: pb.t, width: 80, height: pb.h } });
    if (edge === "h") await page.screenshot({ path: join(CAPS, V + "-grip-foot-rest.jpg"), type: "jpeg", quality: 85, clip: { x: pb.l, y: pb.b - 60, width: pb.w, height: 80 } });
    if (edge === "wh") await page.screenshot({ path: join(CAPS, V + "-grip-corner-rest.jpg"), type: "jpeg", quality: 85, clip: { x: pb.l - 30, y: pb.b - 130, width: 160, height: 150 } });
    const restShot = await shot();
    const before = await ev(() => __k.snap());
    anims.length = 0;
    await page.mouse.move(c.x, c.y);
    // Scrub the lit edge's fade-in on the CDP Animation domain (the event can land a few frames late).
    let tr = null;
    for (let i = 0; i < 20 && !tr; i++) { await page.waitForTimeout(15); tr = anims.find((a) => a.type === "CSSTransition" && a.name === "opacity"); }
    if (tr) {
      await cdp.send("Animation.setPaused", { animations: [tr.id], paused: true });
      const delay = tr.source.delay, dur = tr.source.duration, readings = [];
      for (const t of [0, delay - 1, delay, delay + dur / 2, delay + dur]) { await cdp.send("Animation.seekAnimations", { animations: [tr.id], currentTime: t }); await ev(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))); readings.push([t, Number(await ev(() => getComputedStyle(document.getElementById("panel"), "::after").opacity)).toFixed(3)]); }
      await cdp.send("Animation.setPaused", { animations: [tr.id], paused: false });
      ok(V, "3 " + edge + ": lit edge 0 at rest, through the --dur-pop delay, 1 at its end (CDP scrub)", delay === 260 && dur === 120 && +readings[0][1] === 0 && +readings[1][1] === 0 && +readings[4][1] === 1, "delay " + delay + "ms, duration " + dur + "ms, opacity at " + readings.map(([t, o]) => t + "ms=" + o).join(", "));
    } else ok(V, "3 " + edge + ": lit edge transition caught on the CDP Animation domain", false, "no CSSTransition on opacity started; got " + anims.map((a) => a.type + ":" + a.name).join(","));
    await settle(500);
    const on = await inks();
    const want = edge === "w" ? [on.pillW] : edge === "h" ? [on.pillH] : [on.pillW, on.pillH, on.L];
    ok(V, "3 " + edge + " hovered: its marks step to ink-muted, the lit edge shows in the grey ramp, never coral", want.every((x) => x === on.muted) && on.opacity === 1 && ![on.lit, on.pillW, on.pillH, on.L].some((x) => brandInks.includes(x)), "lit " + on.lit + " opacity " + on.opacity + " composite " + on.composite + " mask " + on.mask);
    const after = await ev(() => __k.snap());
    ok(V, "2 nothing moves the preview: hovering the " + edge + " grip", same(before, after));
    const litShot = await shot();
    // Points: the stroke runs on the border's column/row; compare lit with rest.
    const L = pb.l + 0.5, B = pb.b - 0.5;
    // Points on the outline, clear of the pills: mid-runs at a third, the curves' fade, the far edges.
    const pts = { leftMid: [L, pb.t + pb.h / 3], leftNearTop: [L, pb.t + 20], topMid: [pb.l + pb.w / 2, pb.t + 0.5], footMid: [pb.l + pb.w * 0.7, B], leftNearCorner: [L, pb.b - 24], footNearCorner: [pb.l + 24, B], rightMid: [pb.r - 0.5, pb.t + pb.h / 2] };
    const keys = Object.keys(pts), r0 = await sample(restShot, keys.map((k) => pts[k])), r1 = await sample(litShot, keys.map((k) => pts[k]));
    const d = Object.fromEntries(keys.map((k, i) => [k, dist(r0[i], r1[i])]));
    const litAt = (k) => d[k] > 12, darkAt = (k) => d[k] <= 3;
    const expect = edge === "w" ? litAt("leftMid") && darkAt("topMid") && darkAt("footMid") && darkAt("rightMid") && d.leftNearTop < d.leftMid
      : edge === "h" ? litAt("footMid") && darkAt("leftMid") && darkAt("topMid") && darkAt("rightMid")
      : litAt("leftNearCorner") && litAt("footNearCorner") && darkAt("topMid") && darkAt("rightMid") && d.leftMid < d.leftNearCorner;
    ok(V, "3 mask-composite live in Chromium (" + edge + "): lights its arm round the curve and fades, leaves the rest", expect, "pixel change by point: " + JSON.stringify(d));
    if (edge === "w") await page.screenshot({ path: join(CAPS, V + "-grip-width-lit.jpg"), type: "jpeg", quality: 85, clip: { x: pb.l - 30, y: pb.t, width: 80, height: pb.h } });
    if (edge === "h") await page.screenshot({ path: join(CAPS, V + "-grip-foot-lit.jpg"), type: "jpeg", quality: 85, clip: { x: pb.l, y: pb.b - 60, width: pb.w, height: 80 } });
    if (edge === "wh") await page.screenshot({ path: join(CAPS, V + "-grip-corner-lit.jpg"), type: "jpeg", quality: 85, clip: { x: pb.l - 30, y: pb.b - 130, width: 160, height: 150 } });
    await page.mouse.move(pb.l - 200, pb.t + 40);
    await settle(250);
  }
  // Keys: the APG window splitter.
  for (const [sashId, key, measure, sign] of [["sashW", "ArrowLeft", "#panel", "w"], ["sashH", "ArrowDown", ".graph", "h"]]) {
    if (!(await page.locator("#" + sashId).isVisible())) continue;
    const size = () => ev(([s, m]) => { const b = document.querySelector(s).getBoundingClientRect(); return m === "w" ? b.width : b.height; }, [measure, sign]);
    await ev((id) => document.getElementById(id).focus(), sashId);
    const s0 = await size(); await page.keyboard.press(key); const s1 = await size(); await page.keyboard.press("Shift+" + key); const s2 = await size();
    const held = await ev(() => document.getElementById("panel").dataset.resizing || "");
    ok(V, "3 " + sashId + ": a key steps the edge 8px, 32px with Shift, and lights it as held", r2(s1 - s0) === 8 && r2(s2 - s1) === 32 && !!held, s0 + " → " + s1 + " → " + s2 + ", data-resizing=" + held);
    await settle(300);
  }
  // A drag holds its cursor on the document.
  for (const [sashId, want, dx, dy] of [["sashW", "ew-resize", -60, 0], ["sashH", "ns-resize", 0, 60], ["sashC", "nesw-resize", -40, 40]]) {
    if (!(await page.locator("#" + sashId).isVisible())) continue;
    const c = await center("#" + sashId);
    await page.mouse.move(c.x, c.y); await page.mouse.down(); await page.mouse.move(c.x + dx * 3, c.y + dy * 3, { steps: 5 });
    const cur = await ev(([x, y]) => ({ html: getComputedStyle(document.documentElement).cursor, under: getComputedStyle(document.elementFromPoint(x, y) || document.body).cursor, panel: document.getElementById("panel").dataset.resizing, lit: getComputedStyle(document.getElementById("panel"), "::after").opacity, ink: __k.shadow(document.getElementById("panel"), "::after").color.slice(0, 3).join(","), muted: __k.tokenColor("--ink-muted").slice(0, 3).join(",") }), [c.x + dx * 3, c.y + dy * 3]);
    await page.mouse.up();
    ok(V, "3 " + sashId + " drag: the cursor holds on html (" + want + "), the edge lit at once in ink-muted", cur.html === want && cur.under === want && cur.lit === "1" && cur.ink === cur.muted, JSON.stringify(cur));
    await settle(300);
  }

  // ---- 9. The desk family's own (responsive-design.md, Per class 4–7) ----
  await load();
  {
    const W = view.viewport.width, H = view.viewport.height;
    const geo = await ev(() => { const b = (id) => __k.box(document.getElementById(id)), cs = getComputedStyle(document.documentElement); return { page: b("page"), panel: b("panel"), dock: b("dock"), s5: parseFloat(cs.getPropertyValue("--space-5")), maxW: parseFloat(cs.getPropertyValue("--c-review-max-w")), stack: document.querySelectorAll("[data-stack]").length, lane: document.querySelector(".lane").getBoundingClientRect().width }; });
    const g0 = Math.max(0, (W - geo.maxW) / 2);
    ok(V, "9 page, panel and dock stand inside " + (g0 ? "the centred " + geo.maxW + "px column (" + g0 + "px either side)" : "the pane") + "; the dock at the foot under the page column, whose room ends above it; no stack mode", Math.abs(geo.page.l - g0) <= 0.5 && Math.abs(geo.panel.r - (W - g0 - geo.s5)) <= 0.5 && Math.abs(geo.dock.l - (g0 + geo.s5)) <= 0.5 && Math.abs(geo.dock.b - (H - geo.s5)) <= 0.5 && Math.abs(geo.page.b - (geo.dock.t - geo.s5)) <= 0.5 && Math.abs(geo.dock.r - geo.page.r) <= 0.5 && geo.stack === 0, JSON.stringify(geo));
    const wantW = view.screen === "wide" || view.screen === "ultrawide" ? 640 : 448;
    ok(V, "9 the panel defaults to " + wantW + "px", Math.abs(geo.panel.w - wantW) <= 0.5, geo.panel.w + "px");
    if (wantW === 640) {
      const two = await ev(() => { const rs = [...document.querySelectorAll(".region")].map((r) => ({ m: r.dataset.machine, b: r.getBoundingClientRect() })), out = []; for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) { const a = rs[i].b, b = rs[j].b; if (Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0 && (a.right <= b.left || b.right <= a.left)) out.push(rs[i].m + " | " + rs[j].m); } return out; });
      ok(V, "9 two machines stand side by side in the 640px panel", two.length > 0, two.join(", "));
      ok(V, "9 the lanes grow to about 900px", geo.lane >= 850, Math.round(geo.lane) + "px");
      await ev(() => document.getElementById("sashW").focus());
      await page.keyboard.press("ArrowLeft"); await page.keyboard.press("ArrowLeft"); await settle(300);
      await ev(() => dispatchEvent(new Event("resize"))); await settle(300);
      const dragged = await ev(() => document.getElementById("panel").offsetWidth);
      ok(V, "9 the person's dragged width still wins over the class's default (through a resize)", dragged === 656, dragged + "px");
    }
    const d = await ev(() => ({ h: document.getElementById("dock").offsetHeight, floor: dockFloor(), ceil: dockCeil(), shown: __k.vis(document.getElementById("sashD")) }));
    ok(V, "9 the dock has its own height edge: floor head + ruler + one row (" + d.floor + "px), ceiling the room (" + d.ceil + "px)", d.shown && d.floor > 100 && d.floor <= d.h && d.ceil === H - 2 * geo.s5, JSON.stringify(d));
    const st0 = await ev(() => __k.stageSnap());
    const sd = await center("#sashD");
    await page.mouse.move(sd.x, sd.y); await page.mouse.down(); await page.mouse.move(sd.x, sd.y - 60, { steps: 6 }); await page.mouse.up(); await settle(300);
    const d1 = await ev(() => ({ h: document.getElementById("dock").offsetHeight, page: __k.box(document.getElementById("page")).b, top: __k.box(document.getElementById("dock")).t }));
    ok(V, "9 dragging the dock's top edge up 60px grows it 60px; the page column ends above it", Math.abs(d1.h - d.h - 60) <= 1 && Math.abs(d1.page - (d1.top - geo.s5)) <= 0.5, d.h + " → " + d1.h + "px, page bottom " + d1.page + ", dock top " + d1.top);
    ok(V, "2 nothing moves the preview: the dock's height edge", same(st0, await ev(() => __k.stageSnap())), st0.length + " boxes");
    await ev(() => document.getElementById("sashD").focus());
    const keyH = async (k) => { await page.keyboard.press(k); return ev(() => document.getElementById("dock").offsetHeight); };
    const k1 = await keyH("ArrowUp"), k2 = await keyH("Shift+ArrowDown"), kEnd = await keyH("End"), kHome = await keyH("Home");
    ok(V, "9 the dock's edge by keys: Up 8px, Shift+Down 32px, End the room, Home the floor", k1 - d1.h === 8 && k1 - k2 === 32 && kHome === d.floor && kEnd === d.ceil, [d1.h, k1, k2, kEnd, kHome].join(" → "));
    await settle(300);
    await sweep("the dock at its floor"); await breakage("the dock at its floor");
    await page.screenshot({ path: join(CAPS, V + "-dock-floor.jpg"), type: "jpeg", quality: 82 });
    if (view.screen === "tablet-landscape") {
      const t = await ev(() => ({ corner: __k.vis(document.getElementById("sashC")), L: __k.vis(document.querySelector(".corner-l")), lit: getComputedStyle(document.getElementById("panel"), "::after").display, bands: ["sashW", "sashH", "sashD"].map((id) => { const b = document.getElementById(id).getBoundingClientRect(); return Math.round(id === "sashW" ? b.width : b.height); }) }));
      if (view.input === "touch") ok(V, "9 touch: 44px bands on the width edge, the graph's foot and the dock's top; no corner, no lit edge", t.bands.every((x) => x === 44) && !t.corner && !t.L && t.lit === "none", JSON.stringify(t));
      else {
        ok(V, "9 trackpad: the corner and the lit edges come back, the bands stay 44px", t.bands.every((x) => x === 44) && t.corner && t.L && t.lit !== "none", JSON.stringify(t));
        await page.mouse.move(5, 5); await settle(200);
        const z = await center("#zoomIn"); await page.mouse.move(z.x, z.y); await settle(700);
        const tip = await ev(() => ({ on: document.getElementById("tip").hasAttribute("data-on"), text: document.getElementById("tip").textContent }));
        ok(V, "9 trackpad: tooltips come back", tip.on && /Zoom in/.test(tip.text), JSON.stringify(tip));
        await page.mouse.move(5, 5); await settle(200);
      }
    }
  }
  await load();
  if (touch) await page.evaluate(() => scrollTo(0, 0));

  // ---- 4. The popover ----
  const popGeo = (key) => ev((key) => { const p = document.querySelector(".pop"), b = document.querySelector('.bar[data-key="' + key + '"]'); if (!p || !b) return null; const pr = p.getBoundingClientRect(), br = b.getBoundingClientRect(); const hit = Math.min(pr.right, br.right) > Math.max(pr.left, br.left) && Math.min(pr.bottom, br.bottom) > Math.max(pr.top, br.top); return { popL: r(pr.left), popB: r(pr.bottom), popT: r(pr.top), popR: r(pr.right), barL: r(br.left), barT: r(br.top), barB: r(br.bottom), covers: hit, inView: pr.left >= 0 && pr.right <= innerWidth && pr.top >= 0 && pr.bottom <= innerHeight }; function r(n) { return Math.round(n * 100) / 100; } }, key);
  const keys = await ev(() => [...document.querySelectorAll(".bar")].map((b) => ({ k: b.dataset.key, l: b.getBoundingClientRect().left })));
  const first = keys[0].k, middle = keys[1].k, right = keys.slice().sort((a, b) => b.l - a.l)[0].k;
  for (const [label, key] of [["first row", first], ["middle row", middle], ["bar nearest the right edge", right]]) {
    await page.locator('.bar[data-key="' + key + '"]').scrollIntoViewIfNeeded();
    const before = await ev(() => __k.snap());
    await click('.bar[data-key="' + key + '"]');
    await settle(450);
    const g = await popGeo(key);
    const anchored = g && (Math.abs(g.popB - (g.barT - 4)) <= 0.5 || Math.abs(g.popT - (g.barB + 4)) <= 30) && (Math.abs(g.popL - g.barL) <= 0.5 || g.popR <= (await ev(() => innerWidth)) - 11);
    ok(V, "4 popover over the " + label + ": 4px above its bar, its start on the bar's start (or slid inside the viewport), never covering it", !!g && anchored && !g.covers && g.inView, JSON.stringify(g));
    const after = await ev(() => __k.snap());
    ok(V, "2 nothing moves the preview: opening the popover (" + label + ")", same(before, after));
    if (label === "first row") { await sweep("popover open"); await contrast("popover open"); }
    if (label === "first row") await page.screenshot({ path: join(CAPS, V + "-popover-on-token.jpg"), type: "jpeg", quality: 85 });
    if (label === "middle row") {
      // An outside press closes it and still acts: a press on the dock's own padding, which does nothing else.
      const db = await page.locator("#dock").boundingBox();
      if (touch) await page.touchscreen.tap(db.x + 5, db.y + db.height - 5); else await page.mouse.click(db.x + 5, db.y + db.height - 5);
      await settle(350);
      ok(V, "4 an outside press closes the popover", (await page.locator(".pop").count()) === 0);
    } else {
      await page.keyboard.press("Escape");
      await settle(350);
      ok(V, "4 Esc closes the popover (" + label + ")", (await page.locator(".pop").count()) === 0);
    }
    const closed = await ev(() => __k.snap());
    ok(V, "2 nothing moves the preview: closing the popover (" + label + ")", same(before, closed));
  }
  // Enter on a focused bar opens it with focus in Starts.
  await ev((k) => document.querySelector('.bar[data-key="' + k + '"]').focus(), first);
  await page.keyboard.press("Enter");
  await settle(400);
  const foc = await ev(() => ({ open: !!document.querySelector(".pop"), f: document.activeElement && document.activeElement.dataset.f, selected: document.activeElement && document.activeElement.selectionEnd - document.activeElement.selectionStart }));
  ok(V, "4 Enter opens the popover from a focused bar, focus in Starts with its number selected", foc.open && foc.f === "at" && foc.selected > 0, JSON.stringify(foc));
  await page.keyboard.press("Escape"); await page.keyboard.press("Escape"); await settle(300);

  // A bar near the dock's right end: Starts typed to 4000 ms (the ruler rescales), then its popover.
  await click('.bar[data-key="' + first + '"]');
  await settle(400);
  await page.locator('.pop input[data-f="at"]').fill("4000");
  await page.keyboard.press("Enter");
  await settle(600);
  await page.locator('.bar[data-key="' + first + '"]').scrollIntoViewIfNeeded();
  await settle(200);
  const edge = await ev((k) => { const p = document.querySelector(".pop").getBoundingClientRect(), b = document.querySelector('.bar[data-key="' + k + '"]').getBoundingClientRect(), d = document.getElementById("dock").getBoundingClientRect(), lane = document.querySelector('.lane[data-key="' + k + '"]').getBoundingClientRect(), inset = popInset(), r = (n) => Math.round(n * 100) / 100; const hit = Math.min(p.right, b.right) > Math.max(p.left, b.left) && Math.min(p.bottom, b.bottom) > Math.max(p.top, b.top); const fits = b.left + p.width <= innerWidth - inset; return { barL: r(b.left), barAt: r((b.left - lane.left) / lane.width * 100) + "% of the lane", dockR: r(d.right), popL: r(p.left), popR: r(p.right), limitR: innerWidth - inset, inset, slid: !fits, onStart: Math.abs(p.left - b.left) <= 0.5, atLimit: Math.abs(p.right - (innerWidth - inset)) <= 0.5, insideInset: p.left >= inset - 0.5 && p.right <= innerWidth - inset + 0.5, covers: hit, inView: p.top >= 0 && p.bottom <= innerHeight, gap: r(b.top - p.bottom) }; }, first);
  ok(V, "4 a bar at the dock's right end: the popover stands inside the viewport less the inset (on the bar's start where it fits, slid to the inset where it doesn't), never covers its bar, stays in view", edge.insideInset && (edge.slid ? edge.atLimit : edge.onStart) && !edge.covers && edge.inView && Math.abs(edge.gap - 4) <= 0.5, JSON.stringify(edge));
  await ev(() => stopPlay());
  await rulerAt("4200 ms track");
  await page.screenshot({ path: join(CAPS, V + "-popover-right-edge.jpg"), type: "jpeg", quality: 85 });
  await page.locator('.pop input[data-f="at"]').fill("19800");
  await page.keyboard.press("Enter");
  await settle(400);
  await ev(() => stopPlay());
  await rulerAt("20 s track");
  await page.keyboard.press("Escape"); await settle(300);
  await ev((k) => document.querySelector('.bar[data-key="' + k + '"]').focus(), first);
  await page.keyboard.press("Control+z");
  await settle(200);
  await ev((k) => document.querySelector('.bar[data-key="' + k + '"]').focus(), first);
  await page.keyboard.press("Control+z");
  await settle(300);
  ok(V, "undo puts the bar back", await ev((k) => { const km = keptMove(); return JSON.stringify(km.e.cur.find((c) => c.key === k).at) === JSON.stringify(km.e.orig.find((c) => c.key === k).at); }, first));

  // A free value: ⌥-drag the reveal clip's end off the ladder, then a drop replays without moving the page.
  const reveal = keys.find((k) => k.k === "reveal") ? "reveal" : middle;
  const bb = await page.locator('.bar[data-key="' + reveal + '"]').boundingBox();
  await snapDiff("a clip drag and drop (and its replay)", async () => {
    await page.mouse.move(bb.x + bb.width - 3, bb.y + 12);
    await page.keyboard.down("Alt");
    await page.mouse.down(); await page.mouse.move(bb.x + bb.width + 9, bb.y + 12, { steps: 6 }); await page.mouse.move(bb.x + bb.width + 17, bb.y + 12, { steps: 4 }); await page.mouse.up();
    await page.keyboard.up("Alt");
    await settle((await playLen()) + 500);
  });
  await click('.bar[data-key="' + reveal + '"]');
  await settle(450);
  const free = await ev((k) => { const f = document.querySelector('.pop input[data-f="dur"]').closest(".fld"), row = document.querySelector('.clip[data-key="' + k + '"]'), b = row.querySelector(".readouts .badge"); return { value: document.querySelector('.pop input[data-f="dur"]').value, field: f.className, fieldEdge: getComputedStyle(f).borderTopStyle, fieldBadge: !!f.querySelector(".badge"), badge: b.className, badgeEdge: getComputedStyle(b).outlineStyle, badgeText: b.textContent }; }, reveal);
  ok(V, "4 a free value: its field and its readout badge take the dashed edge, and the field drops the token badge", free.fieldEdge === "dashed" && free.badgeEdge === "dashed" && !free.fieldBadge && /free/.test(free.field) && /free/.test(free.badge), JSON.stringify(free));
  await page.screenshot({ path: join(CAPS, V + "-popover-off-token.jpg"), type: "jpeg", quality: 85 });
  await conc("popover open");
  // Spring: the Bounce row, and the settle tail past the bar's end.
  await click('.pop [data-menu="curve"]');
  await settle(250);
  await conc("curve menu open");
  await sweep("curve menu open");
  const springItem = page.locator(".menu .mi", { hasText: "Spring" });
  if (touch) { const sb = await springItem.boundingBox(); await page.touchscreen.tap(sb.x + sb.width / 2, sb.y + sb.height / 2); } else await springItem.click();
  await settle(150);
  await ev(() => { const i = document.querySelector('.pop input[data-f="bounce"]'); if (i) i.focus(); });
  for (let i = 0; i < 6; i++) await page.keyboard.press("ArrowUp");
  await settle((await playLen()) + 400);
  const spring = await ev((k) => { const b = document.querySelector('.bar[data-key="' + k + '"]').getBoundingClientRect(), t = document.querySelector('.lane[data-key="' + k + '"] .tail'); const tb = t && !t.hidden ? t.getBoundingClientRect() : null; return { bounceRow: !!document.querySelector('.pop input[data-f="bounce"]'), bounce: document.querySelector('.pop input[data-f="bounce"]')?.value, barEnd: Math.round(b.right), tailEnd: tb ? Math.round(tb.right) : null, readout: document.querySelector('.clip[data-key="' + k + '"] .readouts .badge:nth-child(2)').textContent }; }, reveal);
  ok(V, "4 picking Spring adds the Bounce row, and the settle tail draws past the bar's end", spring.bounceRow && spring.tailEnd !== null && spring.tailEnd > spring.barEnd, JSON.stringify(spring));
  const popPos = await popGeo(reveal);
  ok(V, "4 the spring popover still stands clear of its bar", !!popPos && !popPos.covers, JSON.stringify(popPos));
  await sweep("spring popover open");
  await page.screenshot({ path: join(CAPS, V + "-popover-on-spring.jpg"), type: "jpeg", quality: 85 });
  await page.keyboard.press("Escape"); await page.keyboard.press("Escape"); await settle(350);

  // Replay, and the Original | Edited switch.
  await snapDiff("a replay", async () => { await click("#play"); await settle((await playLen()) + 300); });
  const dockBox = await page.locator("#dock").boundingBox();
  await page.screenshot({ path: join(CAPS, V + "-dock-edited.jpg"), type: "jpeg", quality: 85, clip: { x: Math.max(0, dockBox.x - 4), y: Math.max(0, dockBox.y - 4), width: Math.min(dockBox.width + 8, view.viewport.width), height: dockBox.height + 8 } });
  if (await page.locator('#compare [data-view="original"]').count()) {
    await snapDiff("toggling to Original", async () => { await click('#compare [data-view="original"]'); await settle((await playLen()) + 300); });
    const orig = await ev(() => ({ view: document.getElementById("dock").dataset.view, bars: [...document.querySelectorAll(".bar")].map((b) => getComputedStyle(b).borderTopStyle) }));
    ok(V, "4/5 under Original the bars dim to the ghost style", orig.view === "original" && orig.bars.every((s) => s === "dashed"), JSON.stringify(orig));
    const ob = await page.locator("#dock").boundingBox();
    await page.screenshot({ path: join(CAPS, V + "-dock-original.jpg"), type: "jpeg", quality: 85, clip: { x: Math.max(0, ob.x - 4), y: Math.max(0, ob.y - 4), width: Math.min(ob.width + 8, view.viewport.width), height: ob.height + 8 } });
    await snapDiff("toggling back to Edited", async () => { await click('#compare [data-view="edited"]'); await settle((await playLen()) + 300); });
  } else ok(V, "Original | Edited shown once there are edits", false, "no compare control");
  await sweep("edited");
  await breakage("edited");
  await contrast("edited");

  // Change marks: a hover that changes the page washes what it changes.
  if (!touch) {
    await page.locator('.node[data-machine="when"][data-state="hour"]').scrollIntoViewIfNeeded();
    await page.hover('.node[data-machine="when"][data-state="hour"]');
    await settle(300);
    const w = await ev(() => { const K = __k, r = (n) => Math.round(n * 100) / 100; return [...document.querySelectorAll(".wash")].map((x) => { const of = x.dataset.of && document.querySelector('#stage [data-key="' + x.dataset.of + '"]'); const field = K.bgOf(of ? of.parentElement : document.getElementById("stage")), fill = K.rgba(getComputedStyle(x).backgroundColor), washed = K.over(fill, field), edge = K.shadow(x).color, ink = getComputedStyle(x).boxShadow.split(")")[0] + ")"; return { kind: x.dataset.wash, of: x.dataset.of, fill: r(K.ratio(washed, field)), edgeOnField: r(K.ratio(K.over(edge, field), field)), edgeOnWash: r(K.ratio(K.over(edge, washed), washed)), edgeWidth: K.shadow(x).spread }; }); });
    ok(V, "clarity §3 B: hovering Every hour washes what changes (green) and where something went (red)", w.some((x) => x.kind === "add") && w.some((x) => x.kind === "del"), JSON.stringify(w.map((x) => x.kind + ":" + x.of)));
    ok(V, "7 every wash's 1px edge in its hue's ink holds 3:1 against the field and against its own fill", w.length > 0 && w.every((x) => x.edgeWidth === 1 && x.edgeOnField >= 3 && x.edgeOnWash >= 3), w.map((x) => x.kind + ":" + x.of + " fill " + x.fill + ", edge " + x.edgeOnField + " on the field / " + x.edgeOnWash + " on the wash").join("; "));
    const gaps = await ev(() => __k.washGaps());
    ok(V, "every wash and its edge stand --space-1 clear of the text they mark", gaps.length > 0 && gaps.every((g) => g.pass), gaps.map((g) => g.kind + ":" + g.of + " " + g.gap + "px").join(", "));
    await ev(() => __k.settled());
    await page.screenshot({ path: join(CAPS, V + "-page-washes.jpg"), type: "jpeg", quality: 85 });
    await conc("washes shown");
    await page.mouse.move(5, 5);
    await settle(200);
    ok(V, "washes leave at once with the hover", (await page.locator(".wash").count()) === 0);
  } else note(V, "washes", "no hover under touch");

  // The Showing line is gone, the panel hides and comes back.
  ok(V, "8 no Showing line in the page", (await ev(() => /\bShowing\b|\bPreviewing\b/.test(document.body.innerText))) === false);
  await click("#hide");
  await settle(400);
  const hid = await ev(() => ({ panel: document.getElementById("panel").dataset.open, show: !document.getElementById("show").hidden }));
  await click("#show");
  await settle(400);
  ok(V, "Hide hides the panel and Show brings it back", hid.panel === "false" && hid.show && (await ev(() => document.getElementById("panel").dataset.open)) === "true", JSON.stringify(hid));

  // Every chip tier the graph can show, its ink against its fill: kept, current (another machine's), hovered
  // (previewed), at rest; and the state a full-page capture draws (the viewport grown to the page's height, the
  // graph rebuilt), read at once and settled.
  const chipRead = (label) => ev((label) => [...document.querySelectorAll(".var")].filter((c) => __k.vis(c)).map((c) => { const cs = getComputedStyle(c), fg = __k.rgba(cs.color), bg = __k.bgOf(c); let op = 1; for (let e = c; e; e = e.parentElement) op *= +getComputedStyle(e).opacity; const layer = c.matches(".kept, .cur") ? getComputedStyle(c, "::after") : cs; void fg; void bg; void op; return { label, text: c.textContent, tier: c.classList.contains("kept") ? "kept" : c.classList.contains("cur") ? "current" : c.classList.contains("peek") || c.matches(":hover") ? "hovered" : "rest", ink: layer.color, fill: layer.backgroundColor, r: Math.round(__k.chipRatio(c) * 100) / 100 }; }), label);
  const chipOk = (name, rows, tiers) => { const bad = rows.filter((c) => c.r < 4.5); const seen = [...new Set(rows.map((c) => c.tier))]; ok(V, "7 chips read 4.5:1 or better: " + name, bad.length === 0 && tiers.every((t) => seen.includes(t)), (bad.length ? "UNDER 4.5 " + bad.map((c) => c.text + " (" + c.tier + ") " + c.r + " ink " + c.ink + " on " + c.fill).join("; ") + "; " : "") + rows.filter((c) => c.tier !== "rest").map((c) => c.text + " (" + c.tier + ") " + c.r).join(", ") + "; lowest " + Math.min(...rows.map((c) => c.r))); };
  await ev(() => __k.settled());
  chipOk("kept and at rest, settled", await chipRead("rest"), ["kept", "rest"]);
  // A current chip: When it runs kept on Custom › Readable, then Save failed › The hub didn't answer kept again.
  await click('.var[data-machine="when"][data-vary="0"]'); await settle(350);
  await click('.var[data-machine="save"][data-state="failed"][data-vary="0"]'); await settle(350);
  await ev(() => __k.settled());
  chipOk("with another machine's current chip", await chipRead("current"), ["kept", "current"]);
  if (!touch) {
    await page.locator('.var[data-machine="save"][data-state="filled"][data-vary="1"]').hover(); await settle(250);
    await ev(() => __k.settled());
    chipOk("a hovered (previewed) chip", await chipRead("hovered"), ["kept", "hovered"]);
    await page.mouse.move(5, 5); await settle(250);
  }
  // A keep and a hover on a graph already drawn: every frame of their tier fades, the lowest reading.
  if (!touch) {
    const sampleDuring = async (name, act) => {
      await ev(() => { window.__tiers = null; __k.sampleTiers(450).then((f) => { window.__tiers = f; }); });
      await act();
      await page.waitForFunction(() => window.__tiers !== null, null, { timeout: 3000 });
      const f = await ev(() => window.__tiers);
      const low = f.slice().sort((a, b) => a.r - b.r)[0];
      const frames = new Set(f.map((x) => x.t)).size;
      ok(V, "7 every frame of " + name + " reads 4.5:1 or better (chips and states)", frames > 5 && low.r >= 4.5, frames + " frames, lowest " + low.r + " (" + low.text + ", " + low.layer + " layer, at " + low.t + "ms)");
    };
    await page.locator('.var[data-machine="save"][data-state="failed"][data-vary="1"]').scrollIntoViewIfNeeded();
    await sampleDuring("a keep (one chip to its sibling)", () => page.locator('.var[data-machine="save"][data-state="failed"][data-vary="1"]').click());
    await settle(300);
    await sampleDuring("a keep on another machine (kept to current)", () => page.locator('.var[data-machine="when"][data-vary="0"]').click());
    await settle(300);
    await sampleDuring("a keep back (current to kept)", () => page.locator('.var[data-machine="save"][data-state="failed"][data-vary="0"]').click());
    await settle(300);
    await sampleDuring("a hover on a chip", () => page.locator('.var[data-machine="save"][data-state="filled"][data-vary="2"]').hover());
    await sampleDuring("a hover on a state", () => page.locator('.node[data-machine="save"][data-state="empty"]').hover());
    await page.mouse.move(5, 5); await settle(300);
  }

  // Right after a redraw (the graph drawn anew, as a capture's resize or a tab does), every chip's tier layer
  // stands at its final clip and nothing on the chip or its pseudo-elements runs: the wipe is for a real keep.
  const redraw = await ev(() => new Promise((res) => {
    render();
    const frames = []; let n = 0;
    const read = () => {
      const anims = document.getAnimations();
      for (const c of document.querySelectorAll(".var")) {
        if (!__k.vis(c)) continue;
        const clip = getComputedStyle(c, "::after").clipPath, want = c.matches(".kept, .cur") ? "inset(0px)" : "inset(0px 100% 0px 0px)";
        const running = anims.filter((a) => a.effect && a.effect.target === c && a.playState === "running").map((a) => (a.effect.pseudoElement || "") + ":" + (a.transitionProperty || "keyframes"));
        frames.push({ frame: n, text: c.textContent, clip, want, running });
      }
      if (++n < 4) requestAnimationFrame(read); else res(frames);
    };
    read();
  }));
  const wrong = redraw.filter((f) => f.clip !== f.want || f.running.length);
  ok(V, "7 right after a redraw every chip's tier layer stands at its final clip, nothing running on the chip or its ::after", redraw.length > 0 && wrong.length === 0, (wrong.length ? "WRONG " + wrong.slice(0, 3).map((f) => f.text + " frame " + f.frame + " clip " + f.clip + " (want " + f.want + ") running " + JSON.stringify(f.running)).join("; ") + "; " : "") + redraw.length + " chip-frames over 4 frames");
  await settle(300);

  // The state a full-page capture draws: the viewport grown to the page's height (which rebuilds the graph),
  // read at once, then settled.
  // Every frame for 400ms after the resize, the kept and current chips' ink against their fill; a capture can
  // land on any of them.
  const fullH = await ev(() => Math.max(document.documentElement.scrollHeight, innerHeight));
  if (fullH <= view.viewport.height) note(V, "7 chips through a full-page capture", "the page fits the viewport (" + fullH + "px), so a full-page capture resizes and redraws nothing");
  else await ev(() => { window.__frames = []; const t0 = performance.now(); addEventListener("resize", () => { const tick = () => { for (const c of document.querySelectorAll(".var.kept, .var.cur")) { const a = getComputedStyle(c, "::after"); window.__frames.push({ t: Math.round(performance.now() - t0), text: c.textContent, tier: c.classList.contains("kept") ? "kept" : "current", r: Math.round(__k.chipRatio(c) * 100) / 100, ink: a.color, fill: a.backgroundColor, clip: a.clipPath }); } if (performance.now() - t0 < 400) requestAnimationFrame(tick); }; tick(); }, { once: true }); });
  await page.setViewportSize({ width: view.viewport.width, height: fullH });
  await settle(500);
  const frames = await ev(() => window.__frames || []);
  const low = frames.filter((f) => f.r < 4.5);
  if (fullH > view.viewport.height) { const split = frames.filter((f) => f.clip !== "inset(0px)"); ok(V, "7 on every frame of the redraw a full-page capture causes, each kept and current chip is whole (no wipe mid-way)", frames.length > 0 && split.length === 0, (split.length ? "MID-WIPE " + split.slice(0, 3).map((f) => f.text + " at " + f.t + "ms clip " + f.clip).join("; ") + "; " : "") + frames.length + " readings"); }
  if (fullH > view.viewport.height) ok(V, "7 chips read 4.5:1 or better on every frame of the redraw a full-page capture causes (" + view.viewport.width + "×" + fullH + ")", frames.length > 0 && low.length === 0, (low.length ? "UNDER 4.5 " + low.slice(0, 3).map((f) => f.text + " (" + f.tier + ") at " + f.t + "ms " + f.r + " ink " + f.ink + " on " + f.fill).join("; ") + "; " : "") + frames.length + " readings, lowest " + Math.min(...frames.map((f) => f.r)));
  chipOk("as a full-page capture draws them, settled", await chipRead("capture settled"), ["kept"]);
  await page.setViewportSize(view.viewport); await settle(300);

  // Whole-page captures, once every animation has finished; the kept chip's ink at rest.
  await page.mouse.move(5, 5); await settle(300);
  await ev(() => __k.settled());
  const chips = await ev(() => [...document.querySelectorAll(".var")].filter((c) => __k.vis(c)).map((c) => ({ text: c.textContent, tier: c.classList.contains("kept") ? "kept" : c.classList.contains("cur") ? "current" : "rest", r: Math.round(__k.chipRatio(c) * 100) / 100, running: c.getAnimations({ subtree: true }).length })));
  const keptChip = chips.filter((c) => c.tier === "kept");
  ok(V, "7 the kept chip (\"The hub didn't answer\") reads 4.5:1 or better at rest, every chip settled", keptChip.length > 0 && chips.every((c) => c.r >= 4.5 && c.running === 0), chips.map((c) => c.text + " (" + c.tier + ") " + c.r).join(", "));
  const full = await page.screenshot({ type: "jpeg", quality: 82, fullPage: true });
  const fh = await ev(() => document.documentElement.scrollHeight);
  if (fh <= view.viewport.height * 1.5) writeFileSync(join(CAPS, V + "-page.jpg"), full);
  else for (let y = 0, n = 1; y < fh; y += view.viewport.height, n++) await page.screenshot({ path: join(CAPS, V + "-page-" + n + ".jpg"), type: "jpeg", quality: 82, fullPage: true, clip: { x: 0, y, width: view.viewport.width, height: Math.min(view.viewport.height, fh - y) } });
  ok(V, "1 no page errors", errors.length === 0, errors.join(" | "));
  await ctx.close();
  if (own) await own.close();
}

// The compact classes: the drawer (phone portrait, tablet portrait) and the side sheet (phone landscape, a
// short desk window). The sweep runs on each face at each stop; then each class's own input.
async function runClass(view) {
  const V = view.id, touch = !!view.touch, W = view.viewport.width, H = view.viewport.height;
  const ctx = await browser.newContext({ viewport: view.viewport, colorScheme: view.colorScheme, hasTouch: !!view.hasTouch, isMobile: !!view.isMobile, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const settle = (ms = 450) => page.waitForTimeout(ms);
  const load = async () => { await page.goto(URL_); await page.waitForTimeout(700); await ev(install); };
  const cdp = await ctx.newCDPSession(page);
  const touchAt = (type, pts) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: pts.map(([x, y], i) => ({ x, y, id: i + 1 })) });
  const tapAt = async (x, y) => { if (touch) await page.touchscreen.tap(x, y); else await page.mouse.click(x, y); };
  const tap = async (sel) => { const b = await page.locator(sel).first().boundingBox(); await tapAt(b.x + b.width / 2, b.y + b.height / 2); };
  const shot = (name) => page.screenshot({ path: join(CAPS, V + "-" + name + ".jpg"), type: "jpeg", quality: 82 });
  const sweepAll = async (label) => {
    const o = await ev(() => __k.overlaps()), sp = await ev(() => __k.spills()), a = await ev(() => __k.underTool()), b = await ev(() => __k.tabStrips()), c = await ev(() => __k.graphCuts()), d = await ev(() => __k.linesOverText()), r = await ev(() => __k.rulerOverlaps());
    const t = await ev(() => __k.textContrast()), bad = t.filter((x) => !x.pass);
    ok(V, "1 no overlaps (" + label + ")", o.length === 0, o.slice(0, 4).join(" | "));
    ok(V, "1 nothing spills its box (" + label + ")", sp.length === 0, sp.slice(0, 4).join(" | "));
    ok(V, "1 the drawer or sheet sits over none of the component's text or controls (" + label + ")", a.length === 0, a.slice(0, 5).join(" | "));
    ok(V, "1 every tab shown whole at rest (" + label + ")", b.length === 0, b.join(" | "));
    ok(V, "1 no state's text cut by the graph's edge (" + label + ")", c.length === 0, c.slice(0, 6).join(" | "));
    ok(V, "1 no line runs through a text box (" + label + ")", d.length === 0, d.slice(0, 5).join(" | "));
    ok(V, "1 no two ruler labels overlap (" + label + ")", r.overlaps.length === 0, r.overlaps.slice(0, 4).join(", "));
    ok(V, "7 text ≥ 4.5:1 (" + label + ")", t.length > 0 && bad.length === 0, bad.length ? bad.slice(0, 4).map((x) => x.text + " " + x.r).join(" | ") : t.length + " runs, lowest " + Math.min(...t.map((x) => x.r)));
  };
  await load();

  // ---- 9. Its class ----
  const cls = await ev(() => ({ screen: document.documentElement.dataset.screen, layout: document.documentElement.dataset.layout, input: document.documentElement.dataset.input, face: document.getElementById("tools").dataset.face }));
  ok(V, "9 the pane is the " + view.screen + " class, the " + view.layout + " layout, input " + (touch ? "touch" : "fine") + "; it opens on the Graph face", cls.screen === view.screen && cls.layout === view.layout && cls.input === (touch ? "touch" : "fine") && cls.face === "graph", JSON.stringify(cls));
  const kept = await ev(() => { const v = views[tab], g = document.getElementById("graph").getBoundingClientRect(), n = document.querySelector(".node.kept").getBoundingClientRect(); return { inView: n.top >= g.top - 0.5 && n.bottom <= g.bottom + 0.5, head: document.getElementById("sheetState").textContent, state: stateOf(machineOf(comp(), v.last), v.cur[v.last].state).name }; });
  ok(V, "9 the graph opens on the kept state, in view, and the head names it", kept.inView && kept.head === kept.state, JSON.stringify(kept));
  const wantZoom = !["phone-portrait", "phone-landscape"].includes(view.screen);
  ok(V, "9 zoom buttons " + (wantZoom ? "shown (tablet up, or a mouse)" : "gone: a phone pinches"), (await ev(() => __k.vis(document.querySelector(".zoom")))) === wantZoom);
  ok(V, "9 no grips on a compact screen: no sash, no corner, no Hide in the panel's toolbar", await ev(() => [...document.querySelectorAll(".sash, .corner-l, .edge-pill-w, .edge-pill-h, .edge-pill-d, #hide")].every((e) => !__k.vis(e))));

  // ---- The sweep: each face, each stop ----
  const stops = view.layout === "drawer" ? ["peek", "full", "head"] : [null];
  for (const f of ["graph", "move"]) {
    await ev((f) => setFace(f), f); await settle(400);
    for (const st of stops) {
      if (st) { await ev((s) => setStop(s), st); await settle(500); }
      await sweepAll(f + " face" + (st ? " at " + st : ""));
      if (st !== "head") await shot(f + (st ? "-" + st : ""));
    }
    if (view.layout === "drawer") { await ev(() => setStop("peek")); await settle(500); }
  }
  await ev(() => setFace("graph")); await settle(400);

  if (view.layout === "drawer") {
    // The stops, measured; the page's room ends at the drawer's top; the component never moves.
    const hs = {}, snaps = {};
    for (const st of ["head", "peek", "full"]) { await ev((s) => setStop(s), st); await settle(500); hs[st] = await ev(() => ({ tools: __k.box(document.getElementById("tools")), page: __k.box(document.getElementById("page")), head: document.getElementById("sheetHead").offsetHeight })); snaps[st] = await ev(() => __k.stageSnap()); }
    ok(V, "9 the drawer's stops: head alone (44px and its edge), peek 45% of the height, full 85%; the page's room ends at its top", hs.head.head === 44 && Math.abs(hs.head.tools.h - 45) <= 0.5 && Math.abs(hs.peek.tools.h - H * 0.45) <= 1 && Math.abs(hs.full.tools.h - H * 0.85) <= 1 && Object.values(hs).every((x) => Math.abs(x.page.b - x.tools.t) <= 0.5 && Math.abs(x.tools.b - H) <= 0.5), Object.entries(hs).map(([k, x]) => k + " " + x.tools.h + "px, page " + x.page.h + "px").join("; "));
    ok(V, "2 nothing moves the preview: the drawer's stops", same(snaps.head, snaps.peek) && same(snaps.peek, snaps.full), snaps.peek.length + " boxes");
    // Play at full drops the drawer to peek. (Before the drag below: Chromium's touch emulation drops the
    // click of the next tap after a dispatched touch drag.)
    await ev(() => { setFace("move"); setStop("full"); }); await settle(500);
    await tap("#play"); await settle(120);
    const dropped = await ev(() => stop + (playing ? " (playing)" : " (not playing)"));
    await settle((await ev(() => playLengthOf(keptMove().r))) + 300);
    ok(V, "9 Play at full drops the drawer to peek, so the page is seen playing", dropped === "peek (playing)", "stop " + dropped);
    await ev(() => setFace("graph")); await settle(400);
    await ev(() => setStop("peek")); await settle(500);
    await tap("#sheetTitle"); await settle(500);
    const afterTap = await ev(() => stop);
    // A drag on the head follows the finger and settles on the nearest stop: from full, down by 30% of the
    // height, lands on peek.
    const hb = await page.locator("#sheetHead").boundingBox(), x = hb.x + 40, y = hb.y + hb.height / 2;
    if (touch) { await touchAt("touchStart", [[x, y]]); for (let i = 1; i <= 6; i++) await touchAt("touchMove", [[x, y + (H * 0.3 * i) / 6]]); await touchAt("touchEnd", []); }
    else { await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x, y + H * 0.3, { steps: 6 }); await page.mouse.up(); }
    await settle(500);
    const afterDrag = await ev(() => ({ stop, h: __k.box(document.getElementById("tools")).h }));
    ok(V, "9 a tap on the head steps peek to full; a drag down from full settles on peek", afterTap === "full" && afterDrag.stop === "peek" && Math.abs(afterDrag.h - H * 0.45) <= 1, "tap → " + afterTap + ", drag → " + JSON.stringify(afterDrag));
  } else {
    const g = await ev(() => ({ tools: __k.box(document.getElementById("tools")), page: __k.box(document.getElementById("page")), m: parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--c-screen-margin")) }));
    ok(V, "9 the side sheet stands at the trailing edge at half the pane; the page takes the other half", Math.abs(g.tools.l - W / 2) <= 0.5 && Math.abs(g.tools.r - (W - g.m)) <= 0.5 && Math.abs(g.page.r - W / 2) <= 0.5 && Math.abs(g.tools.h - (H - 2 * g.m)) <= 0.5, JSON.stringify(g));
    await tap("#sheetHide"); await settle(450);
    const hidden = await ev(() => ({ tools: __k.vis(document.getElementById("tools")), tab: __k.box(document.getElementById("show")), page: __k.box(document.getElementById("page")) }));
    ok(V, "9 Hide folds the sheet to a 32px edge tab at the trailing edge; the page takes the room", !hidden.tools && Math.abs(hidden.tab.w - 32) <= 0.5 && Math.abs(hidden.tab.r - W) <= 0.5 && Math.abs(hidden.page.r - (W - 32)) <= 0.5, JSON.stringify(hidden));
    await sweepAll("the sheet folded to its tab");
    await shot("sheet-folded");
    await tap("#show"); await settle(450);
    ok(V, "9 the edge tab brings the sheet back", await ev(() => __k.vis(document.getElementById("tools")) && document.getElementById("show").hidden));
  }

  // ---- Input: previews and keeps ----
  const target = () => ev(() => { const g = document.getElementById("graph").getBoundingClientRect(); const n = [...document.querySelectorAll(".node:not(.kept):not(.cur)")].find((n) => { const b = n.querySelector("b").getBoundingClientRect(); return b.top > g.top + 4 && b.bottom < g.bottom - 4 && b.left > g.left + 4 && b.right < g.right - 4; }); if (!n) return null; const b = n.querySelector("b").getBoundingClientRect(); return { m: n.dataset.machine, s: n.dataset.state, x: b.left + b.width / 2, y: b.top + b.height / 2 }; });
  const keptNow = () => ev(() => views[tab].last + ":" + views[tab].cur[views[tab].last].state + "|" + JSON.stringify(views[tab].cur));
  const peekNow = () => ev(() => ({ peek: peek ? peek.machine + ":" + peek.state : null, washes: document.querySelectorAll(".wash").length, peeked: document.querySelectorAll(".node.peek").length }));
  let t1 = await target();
  if (!t1) ok(V, "9 a state to press in view", false, "none");
  else if (touch) {
    const k0 = await keptNow();
    await touchAt("touchStart", [[t1.x, t1.y]]);
    await page.waitForTimeout(200); const early = await peekNow();
    await page.waitForTimeout(300); const held = await peekNow();
    await shot("hold-preview");
    await touchAt("touchEnd", []); await settle(300);
    const after = await peekNow(), k1 = await keptNow();
    ok(V, "9 touch: a press held past --dur-press-hold (380ms) previews the state (its node peeks, the page washes), release ends it and keeps nothing", early.peek === null && held.peek === t1.m + ":" + t1.s && held.peeked === 1 && after.peek === null && after.washes === 0 && k1 === k0, "at 200ms " + JSON.stringify(early) + ", at 500ms " + JSON.stringify(held) + ", released " + JSON.stringify(after));
    await touchAt("touchStart", [[t1.x, t1.y]]);
    for (let i = 1; i <= 4; i++) await touchAt("touchMove", [[t1.x + 4 * i, t1.y]]);
    await page.waitForTimeout(500); const dragged = await peekNow();
    await touchAt("touchEnd", []); await settle(300);
    ok(V, "9 touch: a press that moves past 10px previews nothing and keeps nothing", dragged.peek === null && (await keptNow()) === k0, JSON.stringify(dragged));
    await page.touchscreen.tap(t1.x, t1.y); await settle(500);
    const k2 = await ev(() => views[tab].last + ":" + views[tab].cur[views[tab].last].state);
    ok(V, "9 touch: a tap keeps the state", k2 === t1.m + ":" + t1.s, k2 + " (tapped " + t1.m + ":" + t1.s + ")");
    // Pinch: out to the 1.6 ceiling, in to the 0.5 floor.
    const gb = await page.locator("#graph").boundingBox(), cx = gb.x + gb.width / 2, cy = gb.y + gb.height / 2;
    const pinchTo = async (from, to) => { await touchAt("touchStart", [[cx - from / 2, cy], [cx + from / 2, cy]]); for (let i = 1; i <= 6; i++) { const d = from + ((to - from) * i) / 6; await touchAt("touchMove", [[cx - d / 2, cy], [cx + d / 2, cy]]); } await touchAt("touchEnd", []); await settle(150); return ev(() => zoom); };
    const zOut = await pinchTo(80, 200), zIn = await pinchTo(200, 20);
    ok(V, "9 a pinch zooms the graph, from the 0.5 floor to the 1.6 ceiling", zOut === 1.6 && zIn === 0.5, "out → " + zOut + ", in → " + zIn);
    await load();
  } else {
    await page.mouse.move(t1.x, t1.y); await settle(300);
    const held = await peekNow();
    ok(V, "9 a mouse: hover previews", held.peek === t1.m + ":" + t1.s, JSON.stringify(held));
    await page.mouse.click(t1.x, t1.y); await settle(400);
    ok(V, "9 a mouse: a click keeps", (await ev(() => views[tab].last + ":" + views[tab].cur[views[tab].last].state)) === t1.m + ":" + t1.s);
    await load();
  }

  // ---- The Move face: its rows and the clip's editor ----
  await tap('#faces [data-face="move"]'); await settle(500);
  const rows = await ev(() => ({ stacked: stacked(), rows: [...document.querySelectorAll(".clip")].map((r) => { const n = r.querySelector(".clip-name").getBoundingClientRect(), l = r.querySelector(".lane").getBoundingClientRect(), rb = r.getBoundingClientRect(); return { name: Math.round(n.width), lane: Math.round(l.width), below: l.top >= n.bottom - 0.5, full: Math.abs(l.width - rb.width) <= 1 }; }) }));
  if (view.stacked) ok(V, "9 rows stack: the name and readouts, then a lane across the face (about 340px)", rows.stacked && rows.rows.every((r) => r.below && r.full && r.lane >= 320), JSON.stringify(rows));
  else ok(V, "9 rows keep the desk's two columns: name 280, the lanes beside", !rows.stacked && rows.rows.every((r) => r.name === 280 && !r.below), JSON.stringify(rows));
  const st0 = await ev(() => __k.stageSnap());
  await tap('.bar[data-key="reveal"]'); await settle(600);
  const ed = await ev(() => { const p = document.querySelector(".pop"), bar = document.querySelector('.bar[data-key="reveal"]'); if (!p) return null; const pb = p.getBoundingClientRect(), bb = bar.getBoundingClientRect(), row = bar.closest(".clip").getBoundingClientRect(); return { inline: p.classList.contains("inline"), after: p.previousElementSibling && p.previousElementSibling.dataset.key, top: Math.round(pb.top), rowBottom: Math.round(row.bottom), above: Math.abs(pb.bottom - (bb.top - 4)) <= 0.5, w: Math.round(pb.width), rowW: Math.round(row.width) }; });
  if (view.stacked) ok(V, "9 a clip's editor unfolds inline, under its row, the row's width", !!ed && ed.inline && ed.after === "reveal" && Math.abs(ed.top - ed.rowBottom) <= 1 && Math.abs(ed.w - ed.rowW) <= 1, JSON.stringify(ed));
  else ok(V, "9 a clip's editor stays a popover, 4px above its bar", !!ed && !ed.inline && ed.above, JSON.stringify(ed));
  ok(V, "2 nothing moves the preview: opening the clip's editor", same(st0, await ev(() => __k.stageSnap())));
  await sweepAll("the clip's editor open");
  await shot("editor");
  await page.locator('.pop input[data-f="dur"]').fill("300"); await page.keyboard.press("Enter"); await settle(500);
  const typed = await ev(() => ({ dur: keptMove().e.cur.find((c) => c.key === "reveal").dur, still: !!document.querySelector(".pop"), inline: !!pop && pop.inline, after: pop && pop.el.previousElementSibling && pop.el.previousElementSibling.dataset.key }));
  ok(V, "9 a typed value commits (touch frees a value by typing it), and the editor stays with its row", typed.dur === 300 && typed.still && (!view.stacked || (typed.inline && typed.after === "reveal")), JSON.stringify(typed));
  await ev(() => stopPlay());
  await sweepAll("after a typed edit");
  await page.keyboard.press("Escape"); await settle(500);
  ok(V, "9 Esc closes the editor", (await page.locator(".pop").count()) === 0);
  if (touch) {
    // The selected bar's 44px end handle: a press 15px past its end, on the bare lane, drags the end.
    const b = await page.locator('.bar[data-key="reveal"]').boundingBox(), y = b.y + b.height / 2;
    const d0 = await ev(() => resolve(keptMove().e.cur).reveal.dur);
    await touchAt("touchStart", [[b.x + b.width + 15, y]]);
    for (let i = 1; i <= 6; i++) await touchAt("touchMove", [[b.x + b.width + 15 + 8 * i, y]]);
    await touchAt("touchEnd", []); await settle((await ev(() => playLengthOf(keptMove().r))) + 400);
    const d1 = await ev(() => resolve(keptMove().e.cur).reveal.dur);
    ok(V, "9 touch: the selected bar's transparent 44px end handle drags its end, from beside the bar", d1 > d0, d0 + " → " + d1 + " ms");
  }
  const before = await ev(() => __k.snap());
  await tap("#play"); await settle((await ev(() => playLengthOf(keptMove().r))) + 400);
  const after = await ev(() => __k.snap());
  ok(V, "2 nothing moves the preview: a replay", same(before, after), before.length + " boxes");
  await sweepAll("edited");
  await shot("move-edited");
  ok(V, "1 no page errors", errors.length === 0, errors.join(" | "));
  await ctx.close();
}

// Reduced motion (prefers-reduced-motion: reduce): the paths the designs give.
async function runReduced() {
  const V = "1440-reduced";
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce", deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = []; page.on("pageerror", (e) => errors.push(String(e)));
  const ev = (fn, arg) => page.evaluate(fn, arg);
  await page.goto(URL_); await page.waitForTimeout(700); await ev(install);
  ok(V, "the page reads reduce", await ev(() => matchMedia("(prefers-reduced-motion: reduce)").matches));
  // What an element's running animations move: every property their keyframes or transitions name.
  const props = () => `(el) => el ? el.getAnimations().flatMap((a) => a.transitionProperty ? [a.transitionProperty] : a.effect.getKeyframes().flatMap((k) => Object.keys(k).filter((p) => !["offset", "easing", "composite", "computedOffset"].includes(p)))) : null`;
  // The popover: fade only, opening and closing.
  await page.locator('.bar[data-key="label"]').click();
  const open = await ev(`(${props()})(document.querySelector(".pop"))`);
  await page.waitForTimeout(400);
  await page.keyboard.press("Escape");
  const close = await ev(`(${props()})(document.querySelector(".pop"))`);
  await page.waitForTimeout(400);
  const gone = await ev(() => !document.querySelector(".pop"));
  ok(V, "the popover fades only, opening and closing", !!open && open.length > 0 && open.every((p) => p === "opacity") && !!close && close.length > 0 && close.every((p) => p === "opacity") && gone, "open " + JSON.stringify(open) + ", close " + JSON.stringify(close) + ", gone " + gone);
  // The lit edge: opacity alone; the marks only change colour; nothing on the panel travels.
  const c = await page.locator("#sashW").boundingBox();
  await page.mouse.move(c.x + c.width / 2, c.y + c.height / 2);
  await page.waitForTimeout(40);
  const lit = await ev(() => document.getAnimations().map((a) => ({ target: (a.effect.target && (a.effect.target.id || a.effect.target.className)) + (a.effect.pseudoElement || ""), prop: a.transitionProperty || "keyframes" })).filter((a) => /panel|edge-pill|corner-l/.test(a.target)));
  await page.waitForTimeout(500);
  const litAfter = await ev(() => +getComputedStyle(document.getElementById("panel"), "::after").opacity);
  const afterAnims = lit.filter((a) => a.target.endsWith("::after"));
  ok(V, "the lit edge changes only opacity, and nothing on the panel moves", afterAnims.length > 0 && afterAnims.every((a) => a.prop === "opacity") && lit.every((a) => ["opacity", "background-color", "box-shadow"].includes(a.prop)) && litAfter === 1, JSON.stringify(lit) + ", opacity after " + litAfter);
  await page.mouse.move(40, 40); await page.waitForTimeout(300);
  // A key's step lands at once: the panel's width and a bar's start, with nothing animating them.
  await ev(() => document.getElementById("sashW").focus());
  const w0 = await ev(() => document.getElementById("panel").getBoundingClientRect().width);
  await page.keyboard.press("ArrowLeft");
  const step = await ev(() => ({ w: document.getElementById("panel").getBoundingClientRect().width, anims: document.getElementById("panel").getAnimations().map((a) => a.transitionProperty || "keyframes").filter((p) => !["opacity", "box-shadow", "background-color"].includes(p)) }));
  ok(V, "a key's step on the edge lands at once", step.w - w0 === 8 && step.anims.length === 0, w0 + " → " + step.w + ", moving animations " + JSON.stringify(step.anims));
  await page.waitForTimeout(300);
  await ev(() => document.querySelector('.bar[data-key="label"]').focus());
  const l0 = await ev(() => document.querySelector('.bar[data-key="label"]').getBoundingClientRect().left);
  await page.keyboard.press("ArrowRight");
  const nudge = await ev(() => { const b = document.querySelector('.bar[data-key="label"]'); return { l: b.getBoundingClientRect().left, anims: b.getAnimations().map((a) => a.transitionProperty || "keyframes").filter((p) => !["background-color", "box-shadow", "opacity"].includes(p)) }; });
  ok(V, "a key's nudge on a clip lands at once", nudge.l > l0 && nudge.anims.length === 0, l0 + " → " + nudge.l + ", moving animations " + JSON.stringify(nudge.anims));
  await page.keyboard.press("Control+z"); await page.waitForTimeout(200);
  // The replay still runs: the playhead and the page move through the move, then rest at its end.
  const total = await ev(() => playLengthOf(keptMove().r));
  await page.locator("#play").click();
  const mid = [];
  for (let i = 0; i < 4; i++) { await page.waitForTimeout(Math.max(30, total / 6)); mid.push(await ev(() => (time === null ? null : Math.round(time)))); }
  await page.waitForTimeout(total + 300);
  const end = await ev(() => ({ time, readout: document.getElementById("readout").textContent }));
  const ran = mid.filter((t) => t !== null);
  ok(V, "the replay still runs under reduced motion", ran.length >= 2 && ran.every((t, i) => !i || t >= ran[i - 1]) && ran.some((t) => t > 0 && t < total) && end.time === null, "playhead at " + JSON.stringify(mid) + " of " + total + " ms, then " + JSON.stringify(end));
  ok(V, "no page errors", errors.length === 0, errors.join(" | "));
  await ctx.close();
}

function same(a, b) { return a.length === b.length && a.every((x, i) => x === b[i]); }

function grepCheck() {
  const files = ["style.css", "app.js", "body.html"].map((f) => [f, readFileSync(join(here, f), "utf8")]);
  const find = (re) => files.flatMap(([f, s]) => s.split("\n").flatMap((line, i) => (re.test(line) ? [f + ":" + (i + 1)] : [])));
  const w600 = find(/font-weight:\s*600|weight-600|\b600\b.*font|font:\s*600/);
  ok("grep", "8 no font-weight 600", w600.length === 0, w600.join(", "));
  const grip = find(/\.grip\b|class="grip|grip-corner|gripCorner/);
  ok("grep", "8 no .grip, its SVG or its title", grip.length === 0, grip.join(", "));
  const band = find(/\.index\b|class="index|index-band|pinned|region > header|<header class="region/);
  ok("grep", "8 no index band or region headers", band.length === 0, band.join(", "));
  const showing = find(/Showing|Previewing|nowText|nowMode/);
  ok("grep", "8 no Showing line", showing.length === 0, showing.join(", "));
  const stack = find(/data-stack|placeDock|phone\(\)|width < 640px\)/);
  ok("grep", "9 stack mode and the old phone line are gone (one code path per class)", stack.length === 0, stack.join(", "));
  const selNone = find(/user-select:\s*none/);
  console.log("INFO [grep] user-select: none only on the lanes, the ruler and held drags: " + selNone.join(", "));
}
