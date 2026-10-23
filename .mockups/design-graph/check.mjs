// The round-22 proof for the design-graph mockup: engine first (computed styles, boxes, the CDP Animation
// domain), pixels only for what drawing alone decides (mask-composite). Every screen class of
// responsive-design.md at its own size: the desk family (desk 1440 light and dark, desk 1024, tablet
// landscape by touch and by trackpad, wide 1920 and ultrawide 2560 and 3440 with both components at once
// (all-components-design.md), and the same three with one component under review) runs the whole suite; the compact
// classes (phone portrait, phone landscape, tablet portrait, a short desk window) run the same sweep on each
// face and stop of their drawer or sheet, plus their own input. Then it saves the reviewer's captures.
//   node .mockups/design-graph/check.mjs        (CHROME=<path> to point at another Chromium)
import { mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
const { chromium } = await import(join(here, "../../node_modules/playwright-core/index.mjs"));
const CHROME = process.env.CHROME || process.env.HOME + "/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome";
// CHECK_PAGE points the suite at another build of the page (to show a check failing on an older commit).
const URL_ = "file://" + (process.env.CHECK_PAGE || join(here, "page.html"));
// Another build's captures go beside it, never over this page's own.
const CAPS = process.env.CHECK_PAGE ? join(dirname(process.env.CHECK_PAGE), "captures-" + process.env.CHECK_PAGE.split("/").pop().replace(/\.html$/, "")) : join(here, "captures");
mkdirSync(CAPS, { recursive: true });
// A whole run replaces the captures; a part run (CHECK_ONLY, CHECK_VIEWS) leaves the others standing.
if (!process.env.CHECK_ONLY && !process.env.CHECK_VIEWS) for (const f of readdirSync(CAPS)) rmSync(join(CAPS, f));

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
  K.controls = () => [...document.querySelectorAll("button, input, [role=button], [role=tab], .badge")].filter((el) => K.vis(el) && !el.closest(".tip")).map((el) => ({ el, r: el.getBoundingClientRect(), kind: "control" }));
  // The resize handle's path read back from the `d` app.js paints from its --grip-p (round 28): a ribbon, side A
  // (N + 1 points), a cap, side B back (N + 1), a cap. So the centreline, the width at every sample, a circle
  // fitted to the body's centreline (page px; the body is the GRIP_BODY + 1 points between the two run-outs, so
  // a finger's straight legs never bend the fit), its sweep and the whole shape's extent come off the points.
  K.grip = (svg) => {
    if (window.paintGrips) paintGrips();
    const path = svg.querySelector(".handle-ink"), m = path.getScreenCTM(), d = path.getAttribute("d") || "";
    const nums = (d.match(/-?\d*\.?\d+(e-?\d+)?/g) || []).map(Number), P = [];
    for (let i = 0; i + 1 < nums.length; i += 2) { const q = new DOMPoint(nums[i], nums[i + 1]).matrixTransform(m); P.push([q.x, q.y]); }
    const total = P.length, N = (total - 2 * 8) / 2 - 1, A = P.slice(0, N + 1), B = P.slice(N + 1 + 8, 2 * N + 2 + 8).reverse();
    const mid = A.map((a, i) => [(a[0] + B[i][0]) / 2, (a[1] + B[i][1]) / 2]), w = A.map((a, i) => Math.hypot(a[0] - B[i][0], a[1] - B[i][1]));
    const n = mid.length, runN = (n - (GRIP_BODY + 1)) / 2, body = mid.slice(runN, runN + GRIP_BODY + 1);
    // Kåsa's fit: x² + y² + Dx + Ey + F = 0, least squares over the body's centreline.
    let sxx = 0, sxy = 0, syy = 0, sx = 0, sy = 0, sxz = 0, syz = 0, sz = 0; const nb = body.length;
    for (const [x, y] of body) { const z = x * x + y * y; sxx += x * x; sxy += x * y; syy += y * y; sx += x; sy += y; sxz += x * z; syz += y * z; sz += z; }
    const M = [[sxx, sxy, sx], [sxy, syy, sy], [sx, sy, nb]], v = [-sxz, -syz, -sz], det = (a) => a[0][0] * (a[1][1] * a[2][2] - a[1][2] * a[2][1]) - a[0][1] * (a[1][0] * a[2][2] - a[1][2] * a[2][0]) + a[0][2] * (a[1][0] * a[2][1] - a[1][1] * a[2][0]);
    const D0 = det(M), col = (k) => M.map((row, r) => row.map((c, j) => (j === k ? v[r] : c))), Dx = det(col(0)) / D0, Ey = det(col(1)) / D0, F = det(col(2)) / D0;
    const cx = -Dx / 2, cy = -Ey / 2, r = Math.sqrt(cx * cx + cy * cy - F), ang = (p) => Math.atan2(p[1] - cy, p[0] - cx);
    let sweep = Math.abs(ang(body[nb - 1]) - ang(body[0])) * 180 / Math.PI; if (sweep > 180) sweep = 360 - sweep;
    const xs = P.map((p) => p[0]), ys = P.map((p) => p[1]), len = mid.reduce((s, p, i) => (i ? s + Math.hypot(p[0] - mid[i - 1][0], p[1] - mid[i - 1][1]) : 0), 0);
    return { points: total, cx, cy, r, sweep, len, runN, w0: w[0], wN: w[n - 1], wMid: w[Math.floor(n / 2)], wMax: Math.max(...w), ends: [body[0], body[nb - 1]], box: { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) }, fill: K.rgba(getComputedStyle(svg).color), shown: K.vis(svg), mid, w };
  };
  // What the handle should be, from the page's own tokens (style.css, --c-grip-*): R, the centreline inset d,
  // the circle's radius, the stroke, the rest length, the run and bend, the body's sweep, the stretch of circle
  // past the body before a run-out straightens, a finger's legs, and how far the held run-out reaches.
  K.gripWant = (id) => {
    const T = document.getElementById(id).closest(".tool"), cs = getComputedStyle(document.documentElement), v = (n) => parseFloat(cs.getPropertyValue(n));
    const R = parseFloat(getComputedStyle(T).borderBottomLeftRadius), d = v("--c-grip-inset"), w = v("--c-grip-stroke"), len = v("--c-grip-len"), L = v("--c-grip-run"), B = v("--c-grip-bend"), r = R - d;
    // Held, the body stands on the border (its centreline half the stroke in), so its circle straightens a
    // little later than at rest.
    const sweep = Math.min(len / r, Math.PI / 2), legs = Math.max(0, (len - r * sweep) / 2), sc = ((R - w / 2) * (Math.PI / 2 - sweep)) / 2;
    return { R, d, r, w, len, L, B, gap: v("--c-grip-gap"), sweep: (sweep * 180) / Math.PI, legs, sc, runTo: R + L - sc, half: len / 2 + L, bw: parseFloat(getComputedStyle(T).borderLeftWidth) };
  };
  // The owner's bar for the line along the edges (round 28): read the stroke's width and opacity at every
  // centreline point of the one path, end to end. Symmetric: equal width at mirrored points, and the mirrored
  // points mirror in place (the corner's about its diagonal, the dock's about its middle). Monotonic: from the
  // middle out to each tip the width never grows. Continuous: no step in width, place or heading from one point
  // to the next, the corner included. Opacity: one opaque solid fill on the one path, nothing over or under it
  // that fades it (no mask, filter, gradient or partial opacity on it or the handle).
  // And its seam with the border (the reviewer's findings 1 to 3): along each run-out, how far its outer edge
  // stands from the hairline's inner edge (`gap`; ≤ 0 is touching or on it). `parallel` is the length of
  // run-out standing more than 0.5px clear of the hairline: a second line beside the border. `span` is the
  // widest the hairline and the stroke together draw where they touch. `wide` is the widest the run-out
  // draws a quarter of its length out and beyond, against the body's stroke. `run` is its length; `tip` its end,
  // how far in from the edge and how wide.
  K.gripProfile = (svg) => {
    const g = K.grip(svg), path = svg.querySelector(".handle-ink"), T = svg.closest(".tool"), b = T.getBoundingClientRect(), n = g.mid.length, corner = svg.id === "gripC";
    // A point's place in the tool's own frame: across its edge and along it (corner: in from the width edge, up
    // from the foot; dock: from the middle, down from the top).
    const own = ([x, y]) => (corner ? [x - b.left, b.bottom - y] : [x - (b.left + b.width / 2), y - b.top]);
    const P = g.mid.map(own);
    let sym = 0, place = 0;
    for (let i = 0; i < n; i++) {
      const j = n - 1 - i, a = P[i], c = P[j];
      sym = Math.max(sym, Math.abs(g.w[i] - g.w[j]));
      place = Math.max(place, corner ? Math.hypot(a[0] - c[1], a[1] - c[0]) : Math.hypot(a[0] + c[0], a[1] - c[1]));
    }
    const half = Math.floor(n / 2);
    let grow = 0; for (let i = 0; i < half; i++) grow = Math.max(grow, g.w[i] - g.w[i + 1], g.w[n - 1 - i] - g.w[n - 2 - i]);
    let dw = 0, step = 0, turn = 0;
    for (let i = 1; i < n; i++) { dw = Math.max(dw, Math.abs(g.w[i] - g.w[i - 1])); step = Math.max(step, Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1])); }
    for (let i = 2; i < n; i++) { const h1 = Math.atan2(P[i - 1][1] - P[i - 2][1], P[i - 1][0] - P[i - 2][0]), h2 = Math.atan2(P[i][1] - P[i - 1][1], P[i][0] - P[i - 1][0]); let d = Math.abs(h2 - h1) * 180 / Math.PI; if (d > 180) d = 360 - d; if (Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]) > 0.05 && Math.hypot(P[i - 1][0] - P[i - 2][0], P[i - 1][1] - P[i - 2][1]) > 0.05) turn = Math.max(turn, d); }
    // The seam, read on run-out B (A is its mirror, held to it by sym and place): its points from the body's
    // end out, each one's distance in from its own edge (the corner's B runs along the foot: up from it; the
    // dock's: down from its top).
    // Where a corner's point still stands on the corner's curve (along the foot under R), its distance is to
    // the border's curve, radially; past it, straight to the edge.
    const grad = svg.querySelector("radialGradient"), bw = parseFloat(getComputedStyle(T).borderLeftWidth), w0 = g.w[half], runN = g.runN, out = [], Rr = parseFloat(getComputedStyle(T).borderBottomLeftRadius);
    for (let i = n - runN - 1; i < n; i++) out.push({ dist: corner && P[i][0] < Rr ? Rr - Math.hypot(P[i][0] - Rr, P[i][1] - Rr) : P[i][1], w: g.w[i], at: P[i] });
    let s = 0; for (let i = 0; i < out.length; i++) { if (i) s += Math.hypot(out[i].at[0] - out[i - 1].at[0], out[i].at[1] - out[i - 1].at[1]); out[i].s = s; }
    const run = s;
    let gap = -Infinity, parallel = 0, span = 0, wide = 0;
    for (let i = 0; i < out.length; i++) {
      const o = out[i], gp = o.dist - o.w / 2 - bw;
      if (i) { gap = Math.max(gap, gp); if (gp > 0.5) parallel += o.s - out[i - 1].s; }
      if (gp <= 0) span = Math.max(span, Math.max(bw, o.dist + o.w / 2));
      if (run > 0 && o.s >= run / 4) wide = Math.max(wide, o.w);
    }
    const tip = out[out.length - 1], tipFromCentre = Math.hypot(...P[n - 1]), fadeEnd = grad ? Math.abs(+grad.getAttribute("r") - tipFromCentre) : Infinity;
    // Its ink: the handle's own radial gradient, every stop the svg's colour (opaque) at full opacity to the rest
    // mark and down to nothing at its edge; nothing else over or under it fades it.
    const pcs = getComputedStyle(path), scs = getComputedStyle(svg), stops = grad ? [...grad.querySelectorAll("stop")] : [];
    const ink = K.rgba(scs.color), fade = stops.map((st) => +st.getAttribute("stop-opacity"));
    const solid = !!grad && pcs.fill.includes("#" + grad.id) && ink[3] === 1 && stops.length > 2 && stops.every((st) => K.rgba(getComputedStyle(st).stopColor).join() === ink.join()) && fade[0] === 1 && fade[fade.length - 1] === 0 && fade.every((f, i) => !i || f <= fade[i - 1]) && +pcs.fillOpacity === 1 && +pcs.opacity === 1 && pcs.stroke === "none" && pcs.maskImage === "none" && pcs.filter === "none" && scs.maskImage === "none" && scs.filter === "none";
    // Samples for the report: each tip, a quarter and half way out, each join, the middle, mirrored.
    const q = (v) => Math.round(v * 100) / 100, at = [0, Math.round(runN / 2), Math.round((3 * runN) / 4), runN - 1, half, n - runN, n - 1 - Math.round((3 * runN) / 4), n - 1 - Math.round(runN / 2), n - 1].filter((i) => i >= 0 && i < n);
    return { n, sym: q(sym), place: q(place), grow: Math.round(grow * 1000) / 1000, dw: q(dw), step: q(step), turn: q(turn), w0: q(w0), bw, run: q(run), gap: q(gap), parallel: q(parallel), span: q(span), wide: q(wide), tip: [q(tip.dist), q(tip.w)], fadeEnd: q(fadeEnd), solid, opacity: +scs.opacity, samples: at.map((i) => [i, q(P[i][0]), q(P[i][1]), q(g.w[i])]) };
  };
  // A one-sided faded edge on a panel (round 28, the owner's pin): every line drawn on the panel or the dock (an
  // element or a pseudo-element under 8px across with a gradient fill or a mask) must fade the same at both
  // ends: its gradient's stops read the same from either end.
  K.fadedLines = () => {
    const out = [], lines = [];
    const split = (s) => { const parts = []; let depth = 0, cur = ""; for (const ch of s) { if (ch === "(") depth++; if (ch === ")") depth--; if (ch === "," && depth === 0) { parts.push(cur.trim()); cur = ""; } else cur += ch; } if (cur.trim()) parts.push(cur.trim()); return parts; };
    const mirror = (grad) => {
      const m = grad.match(/^(?:repeating-)?linear-gradient\((.*)\)$/s); if (!m) return false;
      let stops = split(m[1]); if (/^(to |-?[\d.]+deg)/.test(stops[0])) stops = stops.slice(1);
      const col = (s) => s.replace(/\s+(calc\(.*\)|-?[\d.]+(px|%))$/, "").trim(), pos = (s) => s.slice(col(s).length).trim();
      // Two stops mirror when one stands as far from the end as the other from the start.
      const far = (p) => { const m = p.match(/^calc\(100% - (.*)\)$/); if (m) return m[1]; const pc = p.match(/^(-?[\d.]+)%$/); return pc ? 100 - +pc[1] + "%" : p === "0px" ? "100%" : null; };
      const mirrored = (pa, pb) => (pa === "" && pb === "") || far(pb) === pa || far(pa) === pb || (pa === "0%" && pb === "100%") || (pa === "100%" && pb === "0%");
      for (let i = 0; i < stops.length; i++) {
        const a = stops[i], b = stops[stops.length - 1 - i];
        if (K.rgba(col(a)).join() !== K.rgba(col(b)).join()) return false;
        if (i !== stops.length - 1 - i && !mirrored(pos(a), pos(b))) return false;
      }
      return true;
    };
    // The timeline's own marks inside the dock (a spring's settle tail, the ruler) are data, not the panel's
    // edges; everything else on both panels is read.
    for (const el of document.querySelectorAll("#panel, #panel *, #dock, #dock *")) {
      if (el.closest("svg, .tl")) continue;
      for (const pseudo of [null, "::before", "::after"]) {
        const cs = getComputedStyle(el, pseudo);
        if (pseudo && cs.content === "none") continue;
        if (cs.display === "none" || cs.visibility === "hidden") continue;
        const imgs = [cs.backgroundImage, cs.maskImage].filter((v) => v && v !== "none" && /gradient/.test(v));
        if (!imgs.length) continue;
        const w = parseFloat(cs.width), h = parseFloat(cs.height);
        if (!(Math.min(w, h) < 8 && Math.max(w, h) >= 24)) continue;
        const name = (el.id || (typeof el.className === "string" ? el.className : "") || el.tagName) + (pseudo || "");
        lines.push(name);
        for (const v of imgs) for (const gr of split(v)) if (!mirror(gr)) out.push(name + " fades one way: " + gr.slice(0, 120));
      }
    }
    return { lines, out };
  };
  K.compact = () => document.documentElement.dataset.layout !== "desk";
  // The graphs and pages on screen: one each below the line, every component's from it.
  K.graphs = () => [...document.querySelectorAll(".graph")].filter((g) => K.vis(g));
  K.graph = () => K.graphs()[0] || document.querySelector(".gsec[data-current] .graph");
  K.stages = () => [...document.querySelectorAll(".stage")].filter((s) => K.vis(s));
  // Overlaps: no text or control over another in the same layer (the page, the panel, the dock, the popover,
  // the menu); the base layers never overlap each other at all.
  // What shows of a box: clipped by every scrolling or clipping ancestor, and in the timeline by its sticky
  // ruler, which the rows scroll under.
  K.clipTo = (el, r) => { let { left, top, right, bottom } = r; for (let e = el.parentElement; e && e !== document.body; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.overflowX !== "visible" || cs.overflowY !== "visible") { const b = e.getBoundingClientRect(); left = Math.max(left, b.left); top = Math.max(top, b.top); right = Math.min(right, b.right); bottom = Math.min(bottom, b.bottom); if (e.classList.contains("tl") && !el.closest(".ruler-row")) { const rr = e.querySelector(".ruler-row"); if (rr) top = Math.max(top, rr.getBoundingClientRect().bottom); } if (e.classList.contains("graph") && !el.closest(".secstrip")) { const st = e.querySelector(".secstrip"); if (st) top = Math.max(top, st.getBoundingClientRect().bottom); } } } return { left, top, right, bottom }; };
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
    for (const st of K.stages()) { const stageBox = K.clipTo(st, st.getBoundingClientRect()); for (const t of base.filter((e) => e.id !== "page")) if (hit(t.getBoundingClientRect(), stageBox) && getComputedStyle(t).position === "fixed") out.push(t.id + " covers the " + st.dataset.comp + " component"); }
    const p = document.getElementById("panel"), d = document.getElementById("dock");
    if (K.vis(p) && K.vis(d) && hit(p.getBoundingClientRect(), d.getBoundingClientRect())) out.push("panel × dock");
    return [...new Set(out)];
  };
  // Spill: a box whose content runs past it where nothing scrolls or clips it on purpose.
  K.spills = () => {
    const out = [];
    for (const el of document.querySelectorAll("#page *, .panel *, .dock *, .pop *, .menu *, .show, #sheetHead *")) {
      // The corner L's stroke box is its 12px legs plus the clipped-away stroke on its other two sides.
      if (!K.vis(el) || el.closest("svg") || el.matches(".zoomer, .world, .region, .regionBody, .t-tabs-pill, .t-text-soft, .t-text-soft *, .lit, .resize-handle")) continue;
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
    const items = K.textItems().concat(K.controls()).filter((it) => it.el.closest(".stage")).map((it) => ({ ...it, r: K.clipTo(it.el, it.r) })).filter((it) => it.r.right - it.r.left > 0.5 && it.r.bottom - it.r.top > 0.5);
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
    const out = [];
    for (const g of K.graphs()) {
    const gb = g.getBoundingClientRect(), cs = getComputedStyle(g);
    const v = { left: gb.left + parseFloat(cs.borderLeftWidth), top: gb.top + parseFloat(cs.borderTopWidth) }; v.right = v.left + g.clientWidth; v.bottom = v.top + g.clientHeight;
    for (const el of g.querySelectorAll(".node, .region-name")) {
      const b = el.getBoundingClientRect();
      const showsX = b.right > v.left + 0.5 && b.left < v.right - 0.5, showsY = b.bottom > v.top + 0.5 && b.top < v.bottom - 0.5;
      if (!showsX || !showsY) continue;
      const cutX = b.left < v.left - 0.5 || b.right > v.right + 0.5, cutY = b.top < v.top - 0.5 || b.bottom > v.bottom + 0.5;
      if (cutX || cutY) out.push((el.dataset.state || el.textContent.slice(0, 16)) + " cut " + (cutX ? "across" : "") + (cutX && cutY ? " and " : "") + (cutY ? "down" : ""));
    }
    }
    return out;
  };
  // d. no line (a graph edge, a tie, the playhead) runs through a text box. The move's end has no edge now
  // (the r21 ruling: the tint alone).
  K.linesOverText = () => {
    // A floating popover or menu stands over the dock's lines: its text is on another layer.
    const texts = K.textItems().filter((t) => !t.el.closest("svg, .pop:not(.inline), .menu")).map((t) => ({ el: t.el, r: K.clipTo(t.el, t.r) })).filter((t) => t.r.right - t.r.left > 0.5 && t.r.bottom - t.r.top > 0.5);
    const inside = (x, y, r) => x > r.left + 0.5 && x < r.right - 0.5 && y > r.top + 0.5 && y < r.bottom - 0.5;
    const out = [];
    for (const pl of document.querySelectorAll(".world svg path.edge")) {
      const gr = pl.closest(".graph"), g0 = gr.getBoundingClientRect(), st = gr.querySelector(".secstrip");
      // The section strip stands over the well's top (round 27): a line under it is behind it.
      const g = { left: g0.left, right: g0.right, bottom: g0.bottom, top: st ? st.getBoundingClientRect().bottom : g0.top, width: g0.width };
      if (!g.width) continue;
      const m = pl.getScreenCTM(), pts = pl.dataset.points.split(" ").map((p) => { const [x, y] = p.split(",").map(Number); return new DOMPoint(x, y).matrixTransform(m); });
      for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i], n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y)); for (let k = 0; k <= n; k++) { const x = a.x + ((b.x - a.x) * k) / (n || 1), y = a.y + ((b.y - a.y) * k) / (n || 1); if (!inside(x, y, g)) continue; const t = texts.find((t) => inside(x, y, t.r)); if (t) { out.push("graph edge " + pl.dataset.from + "→" + pl.dataset.to + " through \"" + t.el.textContent.trim().slice(0, 20) + "\""); k = n; i = pts.length; } } }
    }
    const rects = [];
    for (const t of document.querySelectorAll(".tie")) rects.push(["tie", t.getBoundingClientRect()]);
    const ph = document.getElementById("playhead");
    if (ph && K.vis(document.getElementById("dock")) && getComputedStyle(ph, "::after").display !== "none") { const b = ph.getBoundingClientRect(), a = getComputedStyle(ph, "::after"); rects.push(["playhead", { left: b.left - 0.5, right: b.left + 0.5, top: b.top + parseFloat(a.top), bottom: b.bottom }]); }
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
  // One Target (the r21 ruling): a wash on an element that draws a box is that box; on a bare one it stands
  // --c-target-gap (2px) outside. Its target is the live element for what came in or changed, the kept
  // snapshot's box for what went. No wash runs past its target's box plus 2px.
  K.washGeometry = () => {
    const gap = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--c-target-gap"));
    return [...document.querySelectorAll(".wash")].map((w) => {
      const wb = w.getBoundingClientRect(), wrap = w.closest(".stage-wrap"), st = wrap.querySelector(".stage").getBoundingClientRect();
      const live = w.dataset.wash === "add" && wrap.querySelector('.stage [data-key="' + w.dataset.of + '"]');
      let tb;
      if (live) tb = live.getBoundingClientRect();
      else { const [x, y, ww, hh] = w.dataset.box.split(",").map(Number); tb = { left: st.left + x, top: st.top + y, right: st.left + x + ww, bottom: st.top + y + hh }; }
      const out = Math.max(tb.left - wb.left, tb.top - wb.top, wb.right - tb.right, wb.bottom - tb.bottom), inn = Math.min(tb.left - wb.left, tb.top - wb.top, wb.right - tb.right, wb.bottom - tb.bottom);
      const boxed = +w.dataset.pad === 0, r = (n) => Math.round(n * 100) / 100;
      // A gone value marked in its seam (its place filled by the preview) stands in that gap, within its old
      // box's reach, no taller than it was.
      if (w.dataset.seam !== undefined) { const reach = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--space-3")) + (tb.bottom - tb.top); return { of: w.dataset.of, kind: w.dataset.wash + " (seam)", boxed, pad: +w.dataset.pad, over: r(Math.max(tb.left - wb.left, wb.right - tb.right)), under: 0, pass: wb.left >= tb.left - gap - 1.5 && wb.right <= tb.right + gap + 1.5 && wb.top >= tb.top - reach - 0.5 && wb.bottom <= tb.bottom + reach + 0.5 && wb.height <= tb.bottom - tb.top + 0.5 && wb.height >= 4 - 0.5 && [...wrap.querySelectorAll(".stage [data-key], .stage label, .stage .btn, .stage .line, .stage .note")].filter((el) => K.vis(el)).every((el) => { const b = el.getBoundingClientRect(); if (Math.min(b.right, wb.right) - Math.max(b.left, wb.left) <= 0.5) return true; return b.bottom <= wb.top - gap + 0.5 || b.top >= wb.bottom + gap - 0.5; }) }; }
      return { of: w.dataset.of, kind: w.dataset.wash, boxed, pad: +w.dataset.pad, over: r(out), under: r(inn), pass: out <= gap + 1.5 && (boxed ? Math.abs(out) <= 0.5 && Math.abs(inn) <= 0.5 : Math.abs(out - gap - 1) <= 0.5 && Math.abs(inn - gap - 1) <= 0.5) };
    });
  };
  // r24 B6: no wash covers anything the preview shows but its own target (a gone value's wash may stand on
  // what came in at its place, by design). What shows: every value, label, button and line of the page.
  K.visibleWashes = () => [...document.querySelectorAll(".wash")].filter((w) => { const r = K.clipTo(w, w.getBoundingClientRect()); return r.right - r.left > 1 && r.bottom - r.top > 1; }).length;
  K.washCover = () => {
    const out = [];
    for (const w of document.querySelectorAll(".wash")) {
      const wrap = w.closest(".stage-wrap"), wb = w.getBoundingClientRect(), added = [...wrap.querySelectorAll(".wash.add")].map((x) => x.dataset.of);
      const own = w.dataset.wash === "add" ? wrap.querySelector('.stage [data-key="' + w.dataset.of + '"]') : null;
      for (const el of wrap.querySelectorAll(".stage [data-key], .stage label, .stage .btn, .stage .line, .stage .note, .stage .rrow > b, .stage .rmeta, .stage .rstatus, .stage .done")) {
        if (!K.vis(el) || (own && (el === own || own.contains(el) || el.contains(own)))) continue;
        if (added.some((k) => { const a = wrap.querySelector('.stage [data-key="' + k + '"]'); return a && (a === el || a.contains(el) || el.contains(a)); })) continue;
        const b = el.getBoundingClientRect();
        if (Math.min(wb.right, b.right) - Math.max(wb.left, b.left) > 0.5 && Math.min(wb.bottom, b.bottom) - Math.max(wb.top, b.top) > 0.5) out.push(w.dataset.wash + ":" + w.dataset.of + " over " + (el.dataset.key || el.className || el.tagName) + " \"" + el.textContent.trim().slice(0, 24) + "\"");
      }
    }
    return [...new Set(out)];
  };
  // r26 B3: a bare target's wash keeps its 1px stroke --c-target-gap clear of the target's text.
  K.washStroke = () => [...document.querySelectorAll(".wash")].filter((w) => +w.dataset.pad > 0 && w.dataset.wash === "add").map((w) => {
    const el = w.closest(".stage-wrap").querySelector('.stage [data-key="' + w.dataset.of + '"]'), wb = w.getBoundingClientRect(), stroke = K.shadow(w).spread || 1;
    const rg = document.createRange(); rg.selectNodeContents(el); const rs = [...rg.getClientRects()].filter((r) => r.width > 0.5 && r.height > 0.5);
    const t = { l: Math.min(...rs.map((r) => r.left)), t: Math.min(...rs.map((r) => r.top)), r: Math.max(...rs.map((r) => r.right)), b: Math.max(...rs.map((r) => r.bottom)) };
    const gap = Math.min(t.l - (wb.left + stroke), t.t - (wb.top + stroke), wb.right - stroke - t.r, wb.bottom - stroke - t.b);
    return { of: w.dataset.of, gap: Math.round(gap * 100) / 100 };
  });
  // r24 B3: no edge's path crosses any edge label's box, its own or another's, in every graph.
  K.edgeLabels = () => {
    const out = [];
    for (const svg of document.querySelectorAll(".world svg")) {
      if (!K.vis(svg.closest(".graph"))) continue;
      const texts = [...svg.querySelectorAll("text")].map((t) => ({ t: t.textContent, b: t.getBBox() }));
      for (const pl of svg.querySelectorAll("path.edge")) {
        const p = pl.dataset.points.split(" ").map((q) => q.split(",").map(Number));
        for (const { t, b } of texts) {
          let hit = false;
          for (let i = 1; i < p.length && !hit; i++) for (let k = 0; k <= 64; k++) { const x = p[i - 1][0] + ((p[i][0] - p[i - 1][0]) * k) / 64, y = p[i - 1][1] + ((p[i][1] - p[i - 1][1]) * k) / 64; if (x > b.x + 0.5 && x < b.x + b.width - 0.5 && y > b.y + 0.5 && y < b.y + b.height - 0.5) { hit = true; break; } }
          if (hit) out.push(pl.dataset.from + "→" + pl.dataset.to + " through \"" + t + "\"");
        }
      }
    }
    return out;
  };
  // r24 B4: no grip mark (a pill, the corner's L) or the corner's square crosses a text box.
  K.gripsOverText = () => {
    // The handle is an L round a corner, so its box covers far more than its ink: it is read by its ink (any
    // point of the text box, every half pixel, inside the path's fill); the corner's square by its box.
    const marks = [...document.querySelectorAll(".resize-handle .handle-ink, .sash-c")].filter((e) => K.vis(e)).map((e) => ({ n: e.id || e.closest(".resize-handle").id, b: e.getBoundingClientRect(), path: e.tagName === "path" ? e : null }));
    const inked = (path, r) => { const m = path.getScreenCTM().inverse(); for (let x = r.left + 0.25; x < r.right; x += 0.5) for (let y = r.top + 0.25; y < r.bottom; y += 0.5) { const q = new DOMPoint(x, y).matrixTransform(m); if (path.isPointInFill(q)) return true; } return false; };
    const out = [];
    for (const it of K.textItems()) { const r = K.clipTo(it.el, it.r); for (const m of marks) if (Math.min(m.b.right, r.right) - Math.max(m.b.left, r.left) > 0.5 && Math.min(m.b.bottom, r.bottom) - Math.max(m.b.top, r.top) > 0.5 && (!m.path || inked(m.path, { left: Math.max(m.b.left, r.left), right: Math.min(m.b.right, r.right), top: Math.max(m.b.top, r.top), bottom: Math.min(m.b.bottom, r.bottom) }))) out.push(m.n + " over \"" + it.el.textContent.trim().slice(0, 20) + "\""); }
    return [...new Set(out)];
  };
  // r24 B5: each graph's view as it opens. Its top edge cuts nothing (a state, a machine's name or box, a
  // label, an arrow inside a machine) and stands --space-2 clear of what shows under it; only an arrow
  // between machines comes in over it. Its foot cuts no state, name or label. Across, everything stands
  // inside with a margin.
  K.graphView = (opts = {}) => K.graphs().map((g) => {
    // The section strip stands over the view's top (round 27, pin 30): the view starts under it.
    const strip = g.querySelector(".secstrip"), sh = strip ? strip.offsetHeight : 0;
    const gb = g.getBoundingClientRect(), top = gb.top + g.clientTop + sh, left = gb.left + g.clientLeft, H = g.clientHeight - sh, Wd = g.clientWidth, m = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--space-2")), bad = [];
    const each = (sel, fn) => { for (const el of g.querySelectorAll(sel)) { const b = el.getBoundingClientRect(); fn(el, b.top - top, b.bottom - top, b.left - left, b.right - left); } };
    const name = (el) => (el.dataset && (el.dataset.state || el.dataset.machine)) || el.textContent.trim().slice(0, 16) || el.tagName;
    // The top edge cuts no state, machine name or edge label and stands --space-2 clear of them (the r24 values
    // ruling, call 4); machines' boxes and arrows may run on over it. With { margin: false } (a view the
    // person moved to, a hover's) the top only cuts none of them.
    const tm = opts.margin === false ? 0 : m;
    each(".node, .region-name, .world svg text", (el, t, b, l, r) => { if (g.scrollTop > 0.5 && t < tm - 0.5 && b > 0.5) bad.push(name(el) + " at the top (" + Math.round(t) + ")"); if (b > 0.5 && t < H - 0.5 && (l < -0.5 || r > Wd + 0.5)) bad.push(name(el) + " cut across"); });
    each(".node, .region-name, .world svg text", (el, t, b) => { if (opts.footCut === false) return; if (t < H - 0.5 && b > H + 0.5) bad.push(name(el) + " cut at the foot"); else if (opts.foot && t < H - 0.5 && b > H - m + 0.5) bad.push(name(el) + " flush at the foot (" + Math.round(H - b) + ")"); });
    void tm;
    return { comp: g.closest(".gsec").dataset.comp, zoom: Math.round(G[g.closest(".gsec").dataset.comp].zoom * 100) / 100, scroll: g.scrollTop, bad };
  });
  // r25 B2: on a drawer screen the page's room ends above the drawer and its grabber, in every state: no page
  // element's visible box meets the drawer's box or its grabber's.
  K.pageUnderDrawer = () => {
    if (document.documentElement.dataset.layout !== "drawer") return [];
    const t = document.getElementById("tools").getBoundingClientRect(), pill = document.querySelector(".edge-pill-top").getBoundingClientRect(), out = [];
    for (const el of document.querySelectorAll("#page *")) {
      if (!K.vis(el) || el.closest(".marks")) continue;
      const r = K.clipTo(el, el.getBoundingClientRect());
      if (r.right - r.left < 0.5 || r.bottom - r.top < 0.5) continue;
      for (const [n, b] of [["drawer", t], ["grabber", pill]]) if (Math.min(r.right, b.right) - Math.max(r.left, b.left) > 0.5 && Math.min(r.bottom, b.bottom) - Math.max(r.top, b.top) > 0.5) out.push((el.dataset.key || el.className || el.tagName) + " under the " + n);
    }
    return [...new Set(out)];
  };
  // r24 B2: the timeline's marks (ties, snap and tick lines, the drag pill) stand in their lanes, never over
  // the inline editor.
  K.marksOverEditor = () => {
    const p = document.querySelector(".pop.inline"), out = [];
    if (!p) return out;
    const pb = p.getBoundingClientRect();
    for (const m of document.querySelectorAll(".tie, .snap, .tick, .drag-pill")) { const b = m.getBoundingClientRect(); if (b.width + b.height > 0 && Math.min(b.right, pb.right) - Math.max(b.left, pb.left) > -0.5 && Math.min(b.bottom, pb.bottom) - Math.max(b.top, pb.top) > -0.5) out.push(m.className + " at " + Math.round(b.left) + "," + Math.round(b.top)); }
    if (stacked()) for (const t of document.querySelectorAll(".tie")) { const key = t.dataset.for, lane = key && document.querySelector('.lane[data-key="' + key + '"]'); if (lane) { const b = t.getBoundingClientRect(), l = lane.getBoundingClientRect(); if (b.top < l.top - 0.5 || b.bottom > l.bottom + 0.5) out.push("tie of " + key + " outside its lane (" + Math.round(b.top) + "–" + Math.round(b.bottom) + " vs " + Math.round(l.top) + "–" + Math.round(l.bottom) + ")"); } }
    return out;
  };
  // Every animation and transition on the page finished.
  K.settled = async () => { await Promise.all(document.getAnimations().map((a) => (a.playState === "running" ? a.finished.catch(() => {}) : null))); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); };
  // Every chip's and node's text against what stands behind it: a chip's tier is its own fill and ink now (the
  // r21 ruling), so its ground is the chip itself over the node.
  K.tierFrame = () => {
    const out = [];
    for (const c of document.querySelectorAll(".var")) {
      if (!K.vis(c)) continue;
      const bg = K.bgOf(c), ink = K.rgba(getComputedStyle(c).color);
      out.push({ text: c.textContent, layer: "chip", r: K.ratio(K.over(ink, bg), bg) });
    }
    for (const t of document.querySelectorAll(".node > b, .node > p")) { if (!K.vis(t)) continue; const bg = K.bgOf(t), ink = K.rgba(getComputedStyle(t).color); out.push({ text: t.textContent.slice(0, 20), layer: "node", r: K.ratio(K.over(ink, bg), bg) }); }
    return out;
  };
  K.chipRatio = (c) => { const rows = []; for (const f of K.tierFrame()) if (f.text === c.textContent) rows.push(f.r); return rows.length ? Math.min(...rows) : null; };
  K.radius = (el, pseudo) => { const cs = getComputedStyle(el, pseudo); return parseFloat(cs.borderBottomLeftRadius) || 0; };
  K.box = (el) => { const b = el.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height }; };
  // The page's boxes: every element of the component, and the outer boxes of the tool.
  // The component's own boxes alone, in the viewport: what "nothing moves the preview" means where the
  // tool's own size changes (a drawer stop, the dock's height edge).
  K.stageSnap = () => [...document.querySelectorAll(".stage, .stage *")].filter((el) => !el.closest("[hidden]")).map((el) => { const b = el.getBoundingClientRect(); return [b.x, b.y, b.width, b.height].map((v) => Math.round(v * 100) / 100).join(","); });
  K.snap = () => {
    const out = [];
    for (const el of document.querySelectorAll("#page, #page *")) { if (el.closest(".marks")) continue; const b = el.getBoundingClientRect(); out.push([b.x + scrollX, b.y + scrollY, b.width, b.height].map((v) => Math.round(v * 100) / 100).join(",")); }
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
  // Both components at once from 1800 (all-components-design.md): the pages in one row, the graphs stacked
  // in the 448 panel, side by side in twice it past 2450.
  { id: "1920", screen: "wide", multi: "stack", viewport: { width: 1920, height: 1080 }, colorScheme: "light" },
  { id: "2560", screen: "ultrawide", multi: "row", viewport: { width: 2560, height: 1080 }, colorScheme: "dark" },
  { id: "3440", screen: "ultrawide", multi: "row", viewport: { width: 3440, height: 1440 }, colorScheme: "light" },
  // One component under review (#review=form): the 800 panel at 1920, the centred 2000 column past 2450.
  { id: "1920-single", screen: "wide", hash: "#review=form", viewport: { width: 1920, height: 1080 }, colorScheme: "light" },
  { id: "2560-single", screen: "ultrawide", hash: "#review=form", viewport: { width: 2560, height: 1080 }, colorScheme: "light" },
  { id: "3440-single", screen: "ultrawide", hash: "#review=form", viewport: { width: 3440, height: 1440 }, colorScheme: "dark" },
];
const compactViews = [
  { id: "390-phone", screen: "phone-portrait", layout: "drawer", stacked: true, viewport: { width: 390, height: 844 }, colorScheme: "light", hasTouch: true, isMobile: true, touch: true },
  { id: "844-phone-landscape", screen: "phone-landscape", layout: "sheet", stacked: true, viewport: { width: 844, height: 390 }, colorScheme: "dark", hasTouch: true, isMobile: true, touch: true },
  { id: "820-tablet-portrait", screen: "tablet-portrait", layout: "drawer", viewport: { width: 820, height: 1180 }, colorScheme: "light", hasTouch: true, isMobile: true, touch: true },
  { id: "1280x540-short", screen: "short", layout: "sheet", viewport: { width: 1280, height: 540 }, colorScheme: "light" },
];

// Every browser runs with this run's tag in its environment, so what it forks away and leaves behind can be
// found once it has closed (scripts/probe-kit/browser-leftovers.ts: Chromium's chrome_crashpad_handler is
// double-forked out of the browser's tree with setsid and reparented, and ends once its browser has gone).
const TAG = "DESIGN_GRAPH_CHECK=" + process.pid + "-" + Math.random().toString(36).slice(2, 8);
const ENV = { ...process.env, DESIGN_GRAPH_CHECK: TAG.split("=")[1] };
const browser = await chromium.launch({ executablePath: CHROME, env: ENV });
// CHECK_ONLY=views,classes,reduced,twox,engines,morph,grep runs those parts alone (a whole run is the proof).
const only = (part) => !process.env.CHECK_ONLY || process.env.CHECK_ONLY.split(",").includes(part);
// CHECK_VIEWS=1440-light,1180-touch runs those views alone.
const pick = (v) => !process.env.CHECK_VIEWS || process.env.CHECK_VIEWS.split(",").includes(v.id);
if (only("views")) for (const view of views.filter(pick)) await runView(view);
if (only("classes")) for (const view of compactViews.filter(pick)) await runClass(view);
if (only("reduced")) await runReduced();
if (only("twox")) { await runTwoX("light"); await runTwoX("dark"); await runRestInk("light"); await runRestInk("dark"); }
if (only("engines")) for (const engine of ["webkit", "firefox"]) for (const scheme of ["light", "dark"]) await runEngine(engine, scheme);
if (only("morph")) for (const engine of (process.env.MORPH_ENGINES || "chromium,webkit,firefox").split(",")) for (const scheme of ["light", "dark"]) await runMorph(engine, scheme);
if (only("grep")) grepCheck();
await browser.close();
// Every browser closed leaves nothing of its own running: no process carrying the run's tag, after up to 5s
// for a closed browser's crash handlers to end (they end in under half a second once their browser has gone).
{
  const { readdirSync, readFileSync: read } = await import("node:fs");
  const left = () => readdirSync("/proc").filter((p) => /^\d+$/.test(p) && +p !== process.pid).flatMap((p) => { try { return read("/proc/" + p + "/environ", "utf8").split("\0").includes(TAG) ? [p + " " + read("/proc/" + p + "/cmdline", "utf8").split("\0").join(" ").slice(0, 120)] : []; } catch { return []; } });
  let rest = left();
  for (let i = 0; i < 20 && rest.length; i++) { await new Promise((r) => setTimeout(r, 250)); rest = left(); }
  ok("run", "every browser closed leaves no process of its own behind (no chrome_crashpad_handler carrying the run's tag)", rest.length === 0, rest.join(" | "));
}
console.log("\n" + passes + " passed, " + fails + " failed");
process.exit(fails ? 1 : 0);

// r24 B3–B5 as each graph opens: labels clear of every line, grips clear of every text, the view's edges
// cutting nothing.
async function graphOpen(V, ev, label) {
  const e = await ev(() => __k.edgeLabels()), gr = await ev(() => __k.gripsOverText()), gv = await ev(() => __k.graphView());
  ok(V, "9 B3: no edge's path crosses an edge label's box (" + label + ")", e.length === 0, e.join(" | ") || (await ev(() => document.querySelectorAll(".world svg text").length)) + " labels clear");
  ok(V, "9 B4: no grip mark or corner box crosses a text box (" + label + ")", gr.length === 0, gr.join(" | "));
  ok(V, "9 B5: each graph's view holds its states, groups, labels and arrows: the top edge cuts nothing and stands --space-2 clear, the foot cuts no state or label, nothing is cut across (" + label + ")", gv.length > 0 && gv.every((g) => g.bad.length === 0), gv.map((g) => g.comp + " at " + g.zoom + "×, scrolled " + Math.round(g.scroll) + (g.bad.length ? ": " + g.bad.slice(0, 4).join(", ") : " clear")).join("; "));
}
// Checks both runners share.
function mkHelpers(V, ev) {
  // Fault 5: Hide is the kit's sm icon button (30px, the button outline) with its glyph at --icon-md (16px),
  // its ink 3:1 or better on the panel, labelled "Hide graph".
  const hideGlyph = async (sel) => {
    const h = await ev((sel) => { const K = __k, b = document.querySelector(sel), g = b.querySelector("svg"), bb = b.getBoundingClientRect(), gb = g.getBoundingClientRect(), cs = getComputedStyle(b), bg = K.bgOf(b.parentElement), ink = K.rgba(cs.color), r = (n) => Math.round(n * 100) / 100; return { btn: r(bb.width) + "×" + r(bb.height), glyph: r(gb.width) + "×" + r(gb.height), edge: cs.borderTopWidth + " " + cs.borderTopStyle, ink: r(K.ratio(K.over(ink, bg), bg)), label: b.getAttribute("aria-label"), centred: Math.abs(gb.left + gb.width / 2 - (bb.left + bb.width / 2)) <= 0.5 && Math.abs(gb.top + gb.height / 2 - (bb.top + bb.height / 2)) <= 0.5 }; }, sel);
    ok(V, "9 fault 5: " + sel + " is the kit's 30px icon button with a 16px glyph, centred, its ink ≥ 3:1, \"Hide graph\"", h.btn === "30×30" && h.glyph === "16×16" && h.edge === "1px solid" && h.ink >= 3 && h.centred && h.label === "Hide graph", JSON.stringify(h));
  };
  // Fault 3: under Original every row's readouts (their text, their tint, their free edge) are the original
  // move's, drawn from it, never the edited values.
  const origChips = async (label) => {
    const o = await ev(() => { const km = keptMove(), rows = [...document.querySelectorAll(".clip")]; return { view: km.e.view, rows: rows.map((row) => { const c = km.e.orig.find((x) => x.key === row.dataset.key), want = document.createElement("div"); want.innerHTML = readoutsHtml(km.e, c); const got = row.querySelector(".readouts"); return { key: row.dataset.key, got: got.textContent, want: want.textContent, changed: got.querySelectorAll(".ro.changed").length, free: [...got.querySelectorAll(".ro")].map((b) => !!b.querySelector(".free")).join(","), wantFree: [...want.querySelectorAll(".ro")].map((b) => !!b.querySelector(".free")).join(",") }; }), edited: editCount(km.e) }; });
    ok(V, "9 fault 3: under Original every chip's text and state is the original move's (" + label + ")", o.view === "original" && o.edited > 0 && o.rows.every((r) => r.got === r.want && r.changed === 0 && r.free === r.wantFree), o.rows.map((r) => r.key + ": \"" + r.got + "\"" + (r.got === r.want ? "" : " ≠ \"" + r.want + "\"") + (r.changed ? " " + r.changed + " tinted" : "")).join("; ") + " (" + o.edited + " edits)");
  };
  return { hideGlyph, origChips };
}

async function runView(view) {
  const V = view.id, touch = !!view.touch;
  const own = view.args ? await chromium.launch({ executablePath: CHROME, args: view.args, env: ENV }) : null;
  const ctx = await (own || browser).newContext({ viewport: view.viewport, colorScheme: view.colorScheme, hasTouch: !!view.hasTouch, isMobile: !!view.isMobile, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const { hideGlyph, origChips } = mkHelpers(V, ev);
  const load = async () => { await page.goto(URL_ + (view.hash || "")); await page.reload(); await page.waitForTimeout(700); await ev(install); };
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
  await graphOpen(V, ev, "the view it opens on");
  {
    const z0 = await ev(() => G[tab].zoom);
    for (let i = 0; i < 12; i++) await ev(() => document.getElementById("zoomOut").click());
    const zl = await ev(() => G[tab].zoom); await ev(() => document.getElementById("zoomFit").click());
    const zf = await ev(() => G[tab].zoom);
    ok(V, "9 r25 call 3: the graph opens between 0.75 and 1; the zoom buttons and Fit stop at 0.5", z0 >= 0.75 - 1e-9 && z0 <= 1 && Math.abs(zl - 0.5) < 1e-9 && zf >= 0.5 - 1e-9, "opens " + z0.toFixed(3) + ", zoom out to " + zl + ", Fit " + zf.toFixed(3));
    await load();
  }
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
    // Round 28's handle: the arc at rest (Apple's 8.7:1), under the pointer and held (the strong ink).
    add("handle at rest", K.tokenColor("--c-handle-ink-rest"), ["panel", raised]);
    add("handle pointed at, held", K.tokenColor("--ink-strong"), ["panel", raised]);
    const bar = document.querySelector(".bar"), dockBg = K.bgOf(document.getElementById("dock"));
    if (bar) {
      const edge = getComputedStyle(bar).boxShadow.match(/^(.*?\))\s/);
      add("clip bar edge", K.rgba(edge ? edge[1] : "transparent"), ["dock", dockBg]);
      add("selected bar edge", K.tokenColor("--brand-solid"), ["dock", dockBg]);
      add("ghost edge", K.tokenColor("--border-contrast"), ["dock", dockBg]);
      add("tie", K.tokenColor("--border-contrast"), ["dock", dockBg]);
      add("playhead", K.rgba(getComputedStyle(document.getElementById("playhead"), "::after").backgroundColor), ["dock", dockBg], ["end area", K.tokenColor("--surface-recess-deep")]);
      add("free dashed edge", K.tokenColor("--border-row-outline"), ["dock", dockBg], ["badge", K.tokenColor("--surface-recess")]);
      add("curve glyph", K.tokenColor("--ink-muted"), ["badge", K.tokenColor("--surface-recess")]);
      add("transport glyph", K.rgba(getComputedStyle(document.getElementById("play")).color), ["dock", dockBg]);
    }
    const well = K.bgOf(K.graph());
    add("kept edge", K.tokenColor("--brand-solid"), ["well", well]);
    add("graph disc", K.tokenColor("--brand-ink-strong"), ["well", well]);
    add("zoom glyph", K.rgba(getComputedStyle(document.getElementById("zoomIn")).color), ["panel", raised]);
    add("focus ring", K.tokenColor("--focus-ring"), ["panel", raised], ["page", body]);
    return out;
  });
  const badMarks = marks.filter((m) => m.r < 3);
  ok(V, "7 non-text marks ≥ 3:1", badMarks.length === 0, (badMarks.length ? "FAILING " + badMarks.map((m) => m.name + " " + m.r).join(", ") + "; " : "") + marks.map((m) => m.name + " " + m.r).join(", "));
  const kit = await ev(() => { const K = __k, raised = K.bgOf(document.getElementById("panel")), well = K.bgOf(K.graph()); return { control: Math.round(K.ratio(K.tokenColor("--border-control"), raised) * 100) / 100, card: Math.round(K.ratio(K.tokenColor("--border-card"), well) * 100) / 100, fill: Math.round(K.ratio(K.tokenColor("--surface-fill"), raised) * 100) / 100, deep: Math.round(K.ratio(K.tokenColor("--surface-recess-deep"), raised) * 100) / 100 }; });
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
    out.readouts = rows.map((row) => { const name = row.querySelector(".clip-name").getBoundingClientRect(), b = [...row.querySelectorAll(".readouts .ro")].slice(0, 2).map((x) => x.getBoundingClientRect()); return { col: Math.round(name.width), oneLine: b.length === 2 && Math.abs(b[0].top - b[1].top) < 0.5, fits: b.every((x) => x.right <= name.right + 0.5), right: Math.round(Math.max(...b.map((x) => x.right)) - name.left) }; });
    return out;
  });
  ok(V, "5 no lane band", lanes.noBand);
  ok(V, "5 every bar and ghost 24px, 5px radius, nothing inside", lanes.shapes.every((s) => s.h === 24 && s.r === 5 && s.kids === 0), lanes.shapes.map((s) => s.k.split(" ")[0] + " " + s.h + "/" + s.r + "/" + s.kids).join(", "));
  ok(V, "5 end region is one area behind every row and the ruler", lanes.area.one && Math.abs(lanes.area.left - lanes.area.want) <= 1 && Math.abs(lanes.area.right - lanes.area.laneEnd) <= 1 && lanes.area.top && lanes.area.bottom && !!lanes.area.behind, JSON.stringify(lanes.area));
  const tieGeo = await ev(() => { const out = []; const km = keptMove(); for (const c of km.clips) { if (!c.at.ref) continue; const t = document.querySelector('.tie[data-for="' + c.key + '"]'); if (!t) continue; const a = document.querySelector('.bar[data-key="' + c.at.of + '"]').getBoundingClientRect(), m = document.querySelector('.bar[data-key="' + c.key + '"]').getBoundingClientRect(), b = t.getBoundingClientRect(), f = getComputedStyle(t, "::before"), fw = parseFloat(f.width), fl = parseFloat(f.left), st = stacked(); out.push({ k: c.key, top: Math.round(b.top - (st ? m.top : a.bottom)), bottom: Math.round(b.bottom - (st ? m.bottom : m.top)), footCentred: Math.abs(fl + fw / 2 - 0.5) <= 0.01, feet: fw }); } return out; });
  ok(V, "9 r25 B3: the hollow box under the Reason line bar is the tie of the clip anchored with it: a hairline from the anchor bar's foot to the anchored bar's top, its feet centred on it (no box's side)", tieGeo.length > 0 && tieGeo.every((t) => t.top === 0 && t.bottom === 0 && t.footCentred), JSON.stringify(tieGeo));
  ok(V, "5 each anchored start draws its tie", lanes.ties.length > 0 && lanes.ties.every((t) => t.drawn && Math.abs(t.x - t.want) <= 1), JSON.stringify(lanes.ties));
  if (view.viewport.width >= 640) ok(V, "5 each row's readouts on one line in the 280px name column", lanes.readouts.every((r) => r.oneLine && r.fits && r.col === 280), lanes.readouts.map((r) => r.right + "/" + r.col + "px").join(", "));
  else ok(V, "5 under the phone line the name column is half the dock: each readout whole on a line of its own", lanes.readouts.every((r) => r.fits), lanes.readouts.map((r) => r.right + "/" + r.col + "px").join(", "));

  // ---- 6. Concentric radii, for each pair this mockup draws ----
  const conc = async (label) => {
    const pairs = await ev(() => {
      const K = __k, out = [];
      const pair = (name, outer, inner) => {
        if (!outer || !inner || !K.vis(inner)) return;
        // Inside a zoomed graph every length draws at the world's scale, its radii too.
        const world = inner.closest(".world"), k = world ? world.getBoundingClientRect().width / world.offsetWidth : 1;
        const o = outer.getBoundingClientRect(), i = inner.getBoundingClientRect(), RO0 = K.usedRadius(outer), RI0 = K.usedRadius(inner), sc = (R) => Object.fromEntries(Object.entries(R).map(([c, v]) => [c, v * k])), RO = sc(RO0), RI = sc(RI0);
        // The corner the inner shape sits in: both its gaps under the outer radius.
        for (const [gx, gy, c] of [[i.left - o.left, i.top - o.top, "tl"], [o.right - i.right, i.top - o.top, "tr"], [i.left - o.left, o.bottom - i.bottom, "bl"], [o.right - i.right, o.bottom - i.bottom, "br"]]) {
          const R = RO[c], r = RI[c];
          if (gx < R && gy < R && gx >= -1 && gy >= -1 && Math.abs(gx - gy) <= 1) out.push({ name, R: Math.round(R * 100) / 100, r: Math.round(r * 100) / 100, gap: Math.round(((gx + gy) / 2) * 100) / 100, even: Math.abs(gx - gy) <= 0.5, pass: Math.abs(R - (r + (gx + gy) / 2)) <= 0.5 && Math.abs(gx - gy) <= 0.5 });
        }
      };
      const panel = document.getElementById("panel");
      // The handle's arc in the panel's corner (round 28): concentric, as Apple's measures, its centreline the
      // panel's radius less its inset.
      const pb = panel.getBoundingClientRect(), gc = document.getElementById("gripC");
      if (gc && K.vis(panel) && K.vis(gc) && !panel.dataset.resizing) { const g = K.grip(gc), wt = K.gripWant("gripC"), R = wt.R, off = Math.hypot(g.cx - (pb.left + R), g.cy - (pb.bottom - R)); out.push({ name: "panel ⊃ handle arc", R, r: Math.round(g.r * 100) / 100, gap: Math.round((R - g.r) * 100) / 100, even: true, pass: off <= 0.5 && Math.abs(g.r - wt.r) <= 0.1 }); }
      for (const n of document.querySelectorAll(".node")) pair("region ⊃ node", n.closest(".region"), n);
      for (const b of document.querySelectorAll(".zoom .icon-btn")) pair("zoom group ⊃ button", b.closest(".zoom"), b);
      for (const t of document.querySelectorAll(".t-tabs")) pair("tabs track ⊃ pill", t, t.querySelector(".t-tabs-pill"));
      for (const f of document.querySelectorAll(".fld")) { const b = f.querySelector(".badge"); if (b) pair("field ⊃ token badge", f, b); }
      // The menu is the kit's (12px surface, 6px pad, 5px items: the r21 ruling), not a concentric pair.
      for (const w of document.querySelectorAll(".wash")) { const k = w.dataset.of; const el = k && w.closest(".stage-wrap").querySelector('.stage [data-key="' + k + '"]'); if (el) out.push({ name: "wash ⊃ field", R: K.radius(w), r: K.radius(el), gap: Math.round((el.getBoundingClientRect().left - w.getBoundingClientRect().left) * 100) / 100, even: true, pass: Math.abs(K.radius(w) - (K.radius(el) + (el.getBoundingClientRect().left - w.getBoundingClientRect().left))) <= 0.5 }); }
      return out;
    });
    const bad = pairs.filter((p) => !p.pass), names = [...new Set(pairs.map((p) => p.name))];
    ok(V, "6 concentric (" + label + ")", pairs.length > 0 && bad.length === 0, (bad.length ? "FAILING " + bad.map((p) => p.name + " " + p.R + "≠" + p.r + "+" + p.gap).join(", ") + "; " : "") + names.map((n) => { const p = pairs.find((x) => x.name === n); return n + " " + p.R + " = " + p.r + " + " + p.gap; }).join(", "));
  };
  await conc("at rest");

  // ---- 3. Resize (round 28): the hit bands, then iPadOS 26's handle read on the engine ----
  const grips = await ev(() => {
    const K = __k, panel = document.getElementById("panel"), p = panel.getBoundingClientRect(), rel = (el) => { if (!K.vis(el)) return null; const b = el.getBoundingClientRect(); return { x: Math.round((b.left - p.left) * 100) / 100, y: Math.round((b.top - p.top) * 100) / 100, r: Math.round((p.right - b.right) * 100) / 100, b: Math.round((p.bottom - b.bottom) * 100) / 100, w: Math.round(b.width * 100) / 100, h: Math.round(b.height * 100) / 100 }; };
    const cs = getComputedStyle(panel), padL = parseFloat(cs.paddingLeft) + 1, padB = parseFloat(cs.paddingBottom) + 1;
    return { panel: { w: p.width, h: p.height, padL, padB }, sashW: rel(document.getElementById("sashW")), sashH: rel(document.getElementById("sashH")), sashC: rel(document.getElementById("sashC")), coarse: document.documentElement.dataset.input !== "fine" };
  });
  const G = grips;
  console.log("INFO [" + V + "] 3 hit boxes relative to the panel's border box: " + JSON.stringify({ sashW: G.sashW, sashH: G.sashH, sashC: G.sashC }));
  const band = G.coarse ? 44 : 11;
  if (G.sashW) ok(V, "3 width band: " + band + "px straddling the edge, stopping short of the curves, never over content", Math.abs(G.sashW.w - band) < 0.01 && (G.coarse ? Math.abs(G.sashW.x + 22 - 0.5) < 0.01 : G.sashW.x === -4 && G.sashW.x + G.sashW.w <= G.panel.padL) && G.sashW.y >= 16, JSON.stringify(G.sashW));
  if (G.sashH) ok(V, "3 foot band: " + band + "px straddling the foot, never over content", Math.abs(G.sashH.h - band) < 0.01 && (G.coarse ? Math.abs(G.sashH.b + 22 - 0.5) < 0.01 : G.sashH.b === -4 && G.sashH.b + G.sashH.h <= G.panel.padB) && G.sashH.x >= 16, JSON.stringify(G.sashH));
  if (G.sashC) ok(V, "3 corner square: " + (G.coarse ? "44" : "20") + "px from " + (G.coarse ? "the corner, straddling" : "4px outside"), G.coarse ? G.sashC.w === 44 : G.sashC.w === 20 && G.sashC.h === 20 && G.sashC.x === -4 && G.sashC.b === -4, JSON.stringify(G.sashC));
  ok(V, "3 the old marks are gone: no edge pill, corner L, bead or lit edge arm, no handle switch; one handle on the panel and one on the dock", await ev(() => !document.querySelector(".panel .edge-pill, .dock .edge-pill, .corner-l, .bead") && !document.documentElement.hasAttribute("data-handle") && getComputedStyle(document.getElementById("panel"), "::after").content === "none" && [...document.querySelectorAll(".lit[data-arm]")].every((l) => l.dataset.arm === "s") && document.querySelectorAll("#panel > .resize-handle, #dock > .resize-handle").length === 2));
  // No thick solid border on the panels (the owner: "you're using solid thick borders"): every border and every
  // inset ring on the panel, the dock and all they hold at most 1px.
  const thick = await ev(() => {
    const out = [], nm = (el) => el.id || (typeof el.className === "string" ? el.className : el.getAttribute("class")) || el.tagName;
    for (const el of document.querySelectorAll("#panel, #panel *, #dock, #dock *")) {
      const cs = getComputedStyle(el);
      for (const s of ["Top", "Right", "Bottom", "Left"]) if (cs["border" + s + "Style"] !== "none" && parseFloat(cs["border" + s + "Width"]) > 1) out.push(nm(el) + " border-" + s.toLowerCase() + " " + cs["border" + s + "Width"]);
      for (const sh of cs.boxShadow.split(/,(?![^(]*\))/)) if (/inset/.test(sh)) { const n = sh.replace(/[a-z-]+\([^)]*\)/g, "").match(/-?[\d.]+px/g) || []; if (n.length >= 4 && parseFloat(n[3]) > 1) out.push(nm(el) + " inset ring " + n[3]); }
    }
    return out;
  });
  ok(V, "3 no element on the panel or the dock draws a border or an inset ring wider than 1px", thick.length === 0, thick.slice(0, 6).join(", "));
  const faded = await ev(() => __k.fadedLines());
  ok(V, "3 no one-sided faded edge on the panel or the dock: every line drawn on them fades the same at both ends", faded.out.length === 0, (faded.out.length ? faded.out.join(" | ") + "; " : "") + "lines read: " + (faded.lines.join(", ") || "none"));
  // The handle (round 28): iPadOS 26's, measured on Apple's picture against its window's corner radius R:
  // concentric, its visible gap from the edge 0.122 R, its stroke 0.112 R, its body 65.6° (1.1449 rad) of the
  // circle; under a finger, Apple's own size (3.45pt thick, 29.7pt long); its contrast on its window 8.7:1.
  const MEAS = { gap: 0.122, stroke: 0.112, sweep: 65.6, rad: 1.1449, touchStroke: 3.45, touchLen: 29.7, contrast: 8.7 };
  // The owner's bar for the line (sym, place, grow, dw, step, turn as K.gripProfile reads them).
  // dw: the steepest the width may change from one centreline point to the next, the stroke's width over the
  // border going on a square over a quarter of the run.
  // (grow: app.js writes the path to a thousandth of a pixel, so a width read off two such points is good to
  // about 0.003px.)
  const lineOK = (p, wt) => p.sym <= 0.02 && p.place <= 0.05 && p.grow <= 0.005 && p.dw <= ((2 * (wt.w - wt.bw)) / (wt.L / 4)) * p.step + 0.03 && p.turn <= 12 && p.solid && p.opacity === 1;
  // The reviewer's bar for the run-out against the border, at any frame: no second line beside the hairline
  // (at most one bend's length, B, of it standing more than 0.5px clear), never a gap of 2px or more, and
  // where it meets the hairline the two together never wider than the border and the stroke.
  // (At rest there is no run-out: what stands there is the rest mark, its gap from the hairline Apple's.)
  const seamOK = (p, wt) => p.run <= (wt.restRun ?? 0) + 0.05 || (p.parallel <= wt.B + 0.01 && p.gap < 2 && p.span <= p.bw + wt.w + 0.01);
  // Held: the run well under the old 120px (at most 64px), the stroke halved within its first quarter, and its
  // tip on the hairline's centre line at nothing.
  // (Held, the stroke stands on the hairline, so what halves is its width over the hairline's; at its tip it is
  // the hairline itself, its ink gone: the gradient reaches nothing there.)
  const heldOK = (p, wt) => seamOK(p, wt) && p.run <= 64 && p.wide - p.bw <= (wt.w - wt.bw) / 2 + 0.01 && Math.abs(p.tip[0] - p.bw / 2) <= 0.05 && p.tip[1] <= p.bw + 0.01;
  const profile = (id) => ev((id) => __k.gripProfile(document.getElementById(id)), id);
  const inkIs = (a, b) => a.slice(0, 3).every((v, i) => Math.abs(v - b[i]) <= 1);
  const gripAt = (id) => ev((id) => {
    const svg = document.getElementById(id), T = svg.closest(".tool"), b = T.getBoundingClientRect(), cs = getComputedStyle(T), g = __k.grip(svg), raised = __k.bgOf(T);
    return { ...g, tool: { left: b.left, right: b.right, top: b.top, bottom: b.bottom, mid: b.left + b.width / 2 }, R: parseFloat(id === "gripC" ? cs.borderBottomLeftRadius : cs.borderTopLeftRadius), op: getComputedStyle(svg).opacity, ratio: Math.round(__k.ratio(g.fill, raised) * 100) / 100, rest: __k.tokenColor("--c-handle-ink-rest"), strong: __k.tokenColor("--ink-strong"), edge: __k.tokenColor("--border-contrast"), focus: __k.tokenColor("--focus-ring"), run: parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--c-grip-run")), resizing: T.dataset.resizing || "" };
  }, id);
  // Its extent from its own corner: how far up the width edge and along the foot the ink reaches (the dock's:
  // how far either way from the middle of its top edge), and how far in from the edge its stroke stands.
  const reach = (g) => (g.tool && g.R ? { up: r2(g.tool.bottom - g.box.top), right: r2(g.box.right - g.tool.left), half: r2((g.box.right - g.box.left) / 2), mid: r2((g.box.right + g.box.left) / 2 - g.tool.mid) } : {});
  const stackPanel = view.multi === "stack";
  await page.mouse.move(5, 5); await settle(450);
  const g0 = await gripAt("gripC");
  const Rp = g0.R, want = await ev(() => __k.gripWant("gripC")), wantD = await ev(() => __k.gripWant("gripD"));
  const finger = view.input === "touch" || view.input === "touch-hover";
  // The arc's middle direction from its circle's centre: the circular mean of its two ends.
  const diag = (g) => { const a = g.ends.map((e) => Math.atan2(e[1] - g.cy, e[0] - g.cx)); return r2((Math.atan2(Math.sin(a[0]) + Math.sin(a[1]), Math.cos(a[0]) + Math.cos(a[1])) * 180) / Math.PI); };
  ok(V, "3 the handle's tokens are Apple's measurements: the gap 0.122 R (" + r2(Rp * MEAS.gap) + "px), " + (finger ? "a finger's: Apple's own stroke " + MEAS.touchStroke + "px and length " + MEAS.touchLen + "px" : "the stroke 0.112 R (" + r2(Rp * MEAS.stroke) + "px), the length 65.6° of its circle (" + r2(want.len) + "px)") + ", its gap from the border's inner edge, the centreline the border, the gap and half the stroke in", Math.abs(want.gap - Rp * MEAS.gap) <= 0.01 && (finger ? Math.abs(want.w - MEAS.touchStroke) <= 0.01 && Math.abs(want.len - MEAS.touchLen) <= 0.01 : Math.abs(want.w - Rp * MEAS.stroke) <= 0.01 && Math.abs(want.len - (Rp - want.d) * MEAS.rad) <= 0.01) && Math.abs(want.d - (want.bw + want.gap + want.w / 2)) <= 0.01, JSON.stringify(want));
  if (stackPanel) ok(V, "3 stacked graphs: no corner, so no handle at rest (the width edge carries no mark of its own)", g0.op === "0", "opacity " + g0.op);
  else {
    const at = [g0.tool.left + Rp, g0.tool.bottom - Rp], off = Math.hypot(g0.cx - at[0], g0.cy - at[1]);
    ok(V, "3 handle at rest: concentric with the panel's resizing corner, its circle's centre within 0.5px of the corner radius's, its radius the panel's " + Rp + "px less the inset (" + r2(want.r) + "px)", g0.shown && off <= 0.5 && Math.abs(g0.r - want.r) <= 0.1, JSON.stringify({ centre: [r2(g0.cx), r2(g0.cy)], corner: at.map(r2), off: r2(off), r: r2(g0.r) }));
    ok(V, "3 handle at rest: the stroke " + r2(want.w) + "px its whole length, round caps, its body sweeping " + r2(want.sweep) + "° centred on the corner's diagonal (135°)" + (finger ? ", straight legs on along both edges to " + MEAS.touchLen + "px in all" : ""), Math.abs(g0.wMid - want.w) <= 0.05 && Math.abs(g0.w0 - want.w) <= 0.05 && Math.abs(g0.wN - want.w) <= 0.05 && Math.abs(g0.wMax - want.w) <= 0.05 && Math.abs(g0.sweep - want.sweep) <= 0.5 && Math.abs(diag(g0) - 135) <= 0.5 && Math.abs(g0.len - want.len) <= 0.2, JSON.stringify({ w: [r2(g0.w0), r2(g0.wMid), r2(g0.wN)], sweep: r2(g0.sweep), diagonal: diag(g0), len: r2(g0.len), points: g0.points }));
    // By day Apple's contrast; at night a step up the ink ladder, the stat ink (round 29: Apple's 8.7:1 at night
    // was the quietest state on the page).
    const night = view.colorScheme === "dark", stat = await ev(() => __k.tokenColor("--ink-stat"));
    ok(V, "3 handle at rest: " + (night ? "at night the stat ink, a step up from Apple's 8.7:1 (" + g0.ratio + ":1 on the raised surface)" : "Apple's contrast, " + MEAS.contrast + ":1 on the raised surface (--c-handle-ink-rest, the strong ink mixed into it, opaque)"), inkIs(g0.fill, g0.rest) && g0.fill[3] === 1 && (night ? inkIs(g0.fill, stat) && g0.ratio > MEAS.contrast + 2 : Math.abs(g0.ratio - MEAS.contrast) <= 0.3), g0.ratio + ":1");
    const p = await profile("gripC"); want.restRun = p.run;
    ok(V, "3 handle at rest, the line read end to end: one opaque fill, the same width at mirrored points, mirrored about the diagonal, no step anywhere", lineOK(p, want), JSON.stringify(p));
  }
  const dockOn = await ev(() => __k.vis(document.getElementById("gripD")));
  if (dockOn) {
    const d0 = await gripAt("gripD"), dr = reach(d0), p = await profile("gripD"); wantD.restRun = p.run;
    ok(V, "3 the dock's handle at rest: the same stroke as a capsule the handle's length (" + r2(wantD.len) + "px), " + r2(wantD.d) + "px in from its top edge, centred on it, in the same ink", Math.abs(d0.len - wantD.len) <= 0.1 && Math.abs(d0.wMid - wantD.w) <= 0.05 && Math.abs(d0.w0 - wantD.w) <= 0.05 && Math.abs(d0.ends[0][1] - (d0.tool.top + wantD.d)) <= 0.1 && Math.abs(dr.mid) <= 0.5 && inkIs(d0.fill, d0.rest), JSON.stringify({ len: r2(d0.len), w: r2(d0.wMid), y: r2(d0.ends[0][1] - d0.tool.top), mid: dr.mid }));
    ok(V, "3 the dock's handle at rest, read end to end: one opaque fill, mirrored about its middle, no step", lineOK(p, wantD), JSON.stringify(p));
  }
  // The captures frame the corner and the dock's edge at 1:1, room left for the drag's run-out.
  const cornerClip = async () => { const b = await ev(() => { const r = document.getElementById("panel").getBoundingClientRect(), x = Math.max(0, Math.floor(r.left - 64)), y = Math.max(0, Math.floor(r.bottom - 200)); return { x, y, w: Math.min(innerWidth - x, 320), h: Math.min(innerHeight - y, 240) }; }); return { x: b.x, y: b.y, width: b.w, height: b.h }; };
  const dockClip = async () => { const b = await ev(() => { const r = document.getElementById("dock").getBoundingClientRect(), x = Math.max(0, Math.floor(r.left + r.width / 2 - 160)), y = Math.max(0, Math.floor(r.top - 70)); return { x, y, w: Math.min(innerWidth - x, 320), h: Math.min(innerHeight - y, 140) }; }); return { x: b.x, y: b.y, width: b.w, height: b.h }; };
  const shot = async (name, clip) => page.screenshot({ path: join(CAPS, V + "-handle-" + name + ".jpg"), type: "jpeg", quality: 92, clip });
  if (!stackPanel && G.sashC) await shot("corner-rest", await cornerClip());
  if (dockOn) await shot("dock-rest", await dockClip());
  // Armed before the press: the transition is paused the moment it is created (transitionrun), then sought
  // through its clock at 0, ¼, ½, ¾ and 1, the shape read at each, and let go.
  const arm = (sel, prop) => ev(([sel, prop]) => {
    window.__held = null;
    const el = document.querySelector(sel);
    const on = (e) => { if (e.target !== el || e.propertyName !== prop) return; const a = el.getAnimations().find((x) => x.transitionProperty === prop); if (a) { a.pause(); window.__held = a; document.removeEventListener("transitionrun", on, true); } };
    document.addEventListener("transitionrun", on, true);
    window.__unarm = () => document.removeEventListener("transitionrun", on, true);
  }, [sel, prop]);
  const gripScrub = (id) => ev(async (id) => {
    const svg = document.getElementById(id), path = svg.querySelector(".handle-ink"), T = svg.closest(".tool"), q = (n) => Math.round(n * 100) / 100;
    for (let i = 0; i < 20 && !window.__held; i++) await new Promise((r) => requestAnimationFrame(r));
    if (window.__unarm) window.__unarm();
    const a = window.__held || svg.getAnimations().find((x) => x.transitionProperty === "--grip-p");
    window.__held = null;
    if (!a) return null;
    a.pause();
    const tm = a.effect.getTiming(), out = [];
    for (const f of [0, 0.25, 0.5, 0.75, 1]) { a.currentTime = tm.delay + f * tm.duration; const b = T.getBoundingClientRect(), g = __k.grip(svg), p = __k.gripProfile(svg); out.push({ f, up: q(b.bottom - g.box.top), right: q(g.box.right - b.left), half: q((g.box.right - g.box.left) / 2), ends: [q(g.w0), q(g.wN)], wMax: q(g.wMax), points: g.points, p }); }
    a.play();
    return { delay: tm.delay, dur: tm.duration, easing: tm.easing, clocks: svg.getAnimations().length + path.getAnimations().length, out };
  }, id);
  const tok = await ev(() => { const s = getComputedStyle(document.documentElement), t = (n) => s.getPropertyValue(n).trim(); return { reveal: parseFloat(t("--dur-reveal")), exit: parseFloat(t("--dur-exit")), control: parseFloat(t("--dur-control")), easeOut: t("--ease-out"), easeInOut: t("--ease-in-out") }; });
  const runTo = want.runTo;
  const rest0 = reach(g0);
  // Pointing at an edge or the corner (round 29): the resize cursor, and the handle grows its ends into the start
  // of the run, the arc where it stood at rest and Apple's width, its ink up to the strong ink.
  if (!touch && !stackPanel) for (const [sashId, cur] of [["sashW", "ew-resize"], ["sashH", "ns-resize"], ["sashC", "nesw-resize"]]) {
    if (!(await page.locator("#" + sashId).isVisible())) continue;
    const c = await center("#" + sashId);
    await page.mouse.move(c.x, c.y); await settle(tok.control + 200);
    const at = await ev(([id, x, y]) => ({ hover: document.getElementById(id).matches(":hover"), cursor: getComputedStyle(document.elementFromPoint(x, y)).cursor, moving: document.getElementById("gripC").getAnimations().filter((a) => a.playState === "running").length }), [sashId, c.x, c.y]);
    const g = await gripAt("gripC");
    if (sashId === "sashC") await shot("corner-hover", await cornerClip());
    ok(V, "3 pointing at " + sashId + ": the " + cur + " cursor, and the handle's ends grow into the start of the run (up the edge and along the foot alike, past the rest arc's " + rest0.up + "px), the arc where it stood at Apple's width, its ink from the rest ink to the strong ink, nothing still moving", at.hover && at.cursor === cur && at.moving === 0 && inkIs(g.fill, g.strong) && !inkIs(g.rest, g.strong) && reach(g).up > rest0.up + 4 && Math.abs(reach(g).up - reach(g).right) <= 0.1 && Math.abs(g.wMid - want.w) <= 0.05 && Math.abs(g.r - g0.r) <= 0.1, JSON.stringify({ at, fill: g.fill.slice(0, 3), up: reach(g).up, right: reach(g).right, w: r2(g.wMid), r: r2(g.r) }));
    { const hp = await profile("gripC"); ok(V, "3 pointing at " + sashId + ", the line read end to end: one opaque fill, mirrored, never wider than the arc, one line with the border (no second line beside it, no gap of 2px)", lineOK(hp, want) && seamOK(hp, want), JSON.stringify(hp)); }
    await page.mouse.move(5, 5); await settle(tok.control + 100);
  }
  // The drag (pin 26): from the corner, the arc's stroke runs out along both edges, thinning to nothing at its
  // ends, one path on one clock (--dur-reveal, --ease-out); let go, it runs back over --dur-exit.
  if (G.sashC && !stackPanel) {
    const c = await center("#sashC");
    await page.mouse.move(c.x, c.y); await settle(300);
    const pre = reach(await gripAt("gripC"));
    await arm("#gripC", "--grip-p");
    await page.mouse.down(); await page.mouse.move(c.x - 12, c.y + 9, { steps: 2 });
    const s = await gripScrub("gripC");
    const mono = s && s.out.every((o, i) => !i || (o.up >= s.out[i - 1].up - 0.01 && o.right >= s.out[i - 1].right - 0.01));
    ok(V, "3 corner drag (scrubbed at 0, ¼, ½, ¾, 1): one path on one clock (" + tok.reveal + "ms, --ease-in-out, the stroke moving onto the border); from where the press found it (" + pre.up + "px) the stroke runs out up the width edge and along the foot alike to " + r2(runTo) + "px from the corner, growing at every step, its tips the hairline's width with their ink gone (the fade reaching nothing at each tip), never wider than the arc", !!s && s.clocks === 1 && s.dur === tok.reveal && s.delay === 0 && s.easing === tok.easeInOut && mono && Math.abs(s.out[0].up - pre.up) <= 0.5 && Math.abs(s.out[4].up - runTo) <= 1 && Math.abs(s.out[4].right - runTo) <= 1 && s.out[4].ends.every((w) => w <= want.bw + 0.01) && s.out[4].p.fadeEnd <= 1 && s.out.every((o) => o.wMax <= want.w + 0.05 && o.points === g0.points && Math.abs(o.up - o.right) <= 0.1) && s.out[2].up > s.out[0].up + 10, JSON.stringify(s && s.out.map((o) => [o.f, o.up, o.right, o.ends, o.wMax])) + " " + JSON.stringify(s && { dur: s.dur, easing: s.easing, clocks: s.clocks }));
    ok(V, "3 corner drag, the line read end to end at 0, ¼, ½, ¾ and 1: one opaque fill; mirrored about the diagonal in width and place; the width never growing from the arc out to either tip; no step in width, place or heading across the corner", !!s && s.out.every((o) => lineOK(o.p, want)), JSON.stringify(s && s.out.map((o) => ({ f: o.f, sym: o.p.sym, place: o.p.place, grow: o.p.grow, dw: o.p.dw, step: o.p.step, turn: o.p.turn, solid: o.p.solid }))));
    ok(V, "3 corner drag against the border, at 0, ¼, ½, ¾ and 1: one line, never a pair (at most " + r2(want.B) + "px of run-out standing over 0.5px clear of the hairline, no gap of 2px or more, the two together never wider than border + stroke " + r2(1 + want.w) + "px); held, the run " + r2(want.L) + "px (≤ 64), its width over the hairline halved within its first quarter, its tip the hairline itself", !!s && s.out.every((o) => seamOK(o.p, want)) && heldOK(s.out[4].p, want), JSON.stringify(s && s.out.map((o) => ({ f: o.f, run: o.p.run, gap: o.p.gap, parallel: o.p.parallel, span: o.p.span, wide: o.p.wide, tip: o.p.tip }))));
    if (s) console.log("INFO [" + V + "] 3 corner drag, the line's samples [index, in from the width edge, up from the foot, width] at each fraction: " + s.out.map((o) => o.f + ": " + JSON.stringify(o.p.samples)).join(" ; "));
    await settle(tok.reveal + 100);
    const held = await gripAt("gripC"), hr = reach(held);
    await shot("corner-drag", await cornerClip());
    ok(V, "3 corner held: the whole highlight in the strong ink, the stroke the pointer lit carried onto the border, " + r2(runTo) + "px up and along from the corner", held.resizing === "wh" && inkIs(held.fill, held.strong) && Math.abs(hr.up - runTo) <= 1 && Math.abs(hr.right - runTo) <= 1, JSON.stringify({ hr, fill: held.fill.slice(0, 3) }));
    await arm("#gripC", "--grip-p");
    await page.mouse.up();
    const back = await gripScrub("gripC");
    await page.mouse.move(5, 5); await settle(tok.reveal + 200);
    const g1 = await gripAt("gripC");
    ok(V, "3 corner let go: it runs back on one clock over --dur-exit (" + tok.exit + "ms, --ease-in-out), from the highlight to where the press found it (" + pre.up + "px, the pointer still on the grip), the line whole at every step; the pointer gone, the rest arc in the rest ink", !!back && back.dur === tok.exit && back.easing === tok.easeInOut && Math.abs(back.out[0].up - runTo) <= 1 && Math.abs(back.out[4].up - pre.up) <= 0.5 && back.out.every((o) => lineOK(o.p, want) && seamOK(o.p, want)) && Math.abs(reach(g1).up - rest0.up) <= 0.5 && inkIs(g1.fill, g1.rest), JSON.stringify(back && back.out.map((o) => ({ f: o.f, up: o.up, right: o.right, sym: o.p.sym, gap: o.p.gap, parallel: o.p.parallel, run: o.p.run, turn: o.p.turn, dw: o.p.dw, step: o.p.step, grow: o.p.grow, place: o.p.place, opacity: o.p.opacity, line: lineOK(o.p, want), seam: seamOK(o.p, want) }))) + " rest " + JSON.stringify({ up: reach(g1).up, rest: rest0.up, fill: g1.fill.slice(0, 3), restInk: g1.rest.slice(0, 3), dur: back && back.dur }));
  }
  // The dock's handle does the same along its top edge.
  if (dockOn && (await page.locator("#sashD").isVisible())) {
    const d0 = await gripAt("gripD"), c = await center("#sashD");
    await page.mouse.move(c.x, c.y); await settle(300);
    const dpre = await gripAt("gripD");
    if (!touch) { await shot("dock-hover", await dockClip()); const hp = await profile("gripD"); ok(V, "3 pointing at the dock's edge: its handle's ends grow either way into the start of the run, the capsule where it stood at Apple's width, in the strong ink, one line with the border", inkIs(dpre.fill, dpre.strong) && reach(dpre).half > reach(d0).half + 4 && Math.abs(reach(dpre).mid) <= 0.5 && Math.abs(dpre.wMid - wantD.w) <= 0.05 && lineOK(hp, wantD) && seamOK(hp, wantD), JSON.stringify({ fill: dpre.fill.slice(0, 3), half: reach(dpre).half, rest: reach(d0).half, w: r2(dpre.wMid), seam: { gap: hp.gap, parallel: hp.parallel } })); }
    await arm("#gripD", "--grip-p");
    await page.mouse.down(); await page.mouse.move(c.x, c.y - 12, { steps: 2 });
    const s = await gripScrub("gripD"), half = wantD.half;
    const mono = s && s.out.every((o, i) => !i || o.half >= s.out[i - 1].half - 0.01);
    ok(V, "3 dock drag (scrubbed at 0, ¼, ½, ¾, 1): one path on one clock (" + tok.reveal + "ms, --ease-in-out); from where the press found it its stroke runs out either way along the top edge to " + r2(half) + "px from the middle, growing at every step, its tips the hairline's width with their ink gone", !!s && s.clocks === 1 && s.dur === tok.reveal && s.easing === tok.easeInOut && mono && Math.abs(s.out[4].half - half) <= 1 && s.out[4].ends.every((w) => w <= wantD.bw + 0.01) && s.out[4].p.fadeEnd <= 1 && s.out.every((o) => o.wMax <= wantD.w + 0.05) && Math.abs(s.out[0].half - reach(dpre).half) <= 0.5, JSON.stringify(s && s.out.map((o) => [o.f, o.half, o.ends, o.wMax])));
    ok(V, "3 dock drag, the line read end to end at 0, ¼, ½, ¾ and 1: one opaque fill, mirrored about its middle, thinning only outward, no step", !!s && s.out.every((o) => lineOK(o.p, wantD)), JSON.stringify(s && s.out.map((o) => ({ f: o.f, sym: o.p.sym, place: o.p.place, grow: o.p.grow, dw: o.p.dw, step: o.p.step, turn: o.p.turn, solid: o.p.solid, opacity: o.p.opacity }))));
    ok(V, "3 dock drag against its top border, at 0, ¼, ½, ¾ and 1: one line, never a pair, no gap of 2px or more, never wider than border + stroke; held, the run ≤ 64px, its width over the hairline halved within its first quarter, its tips the hairline itself", !!s && s.out.every((o) => seamOK(o.p, wantD)) && heldOK(s.out[4].p, wantD), JSON.stringify(s && s.out.map((o) => ({ f: o.f, run: o.p.run, gap: o.p.gap, parallel: o.p.parallel, span: o.p.span, wide: o.p.wide, tip: o.p.tip }))));
    if (s) console.log("INFO [" + V + "] 3 dock drag, the line's samples [index, from the middle, down from the top, width] at each fraction: " + s.out.map((o) => o.f + ": " + JSON.stringify(o.p.samples)).join(" ; "));
    await settle(tok.reveal + 100);
    await shot("dock-drag", await dockClip());
    await page.mouse.up(); await page.mouse.move(5, 5); await settle(tok.reveal + 200);
    const d1 = await gripAt("gripD");
    ok(V, "3 dock let go: back to its capsule", Math.abs(reach(d1).half - reach(d0).half) <= 0.5 && inkIs(d1.fill, d1.rest), JSON.stringify(reach(d1)));
  }
  await load();
  // Keys: the APG window splitter. Focus holds the edge's highlight in the focus ink, with no motion.
  for (const [sashId, key, measure, sign] of [["sashW", "ArrowLeft", "#panel", "w"], ["sashH", "ArrowDown", ".gsec[data-current] .graph", "h"]]) {
    if (!(await page.locator("#" + sashId).isVisible())) continue;
    const size = () => ev(([s, m]) => { const b = document.querySelector(s).getBoundingClientRect(); return m === "w" ? b.width : b.height; }, [measure, sign]);
    await ev((id) => document.getElementById(id).focus(), sashId);
    await page.keyboard.press("Shift"); await settle(100);
    const s0 = await size(); await page.keyboard.press(key); const s1 = await size(); await page.keyboard.press("Shift+" + key); const s2 = await size();
    const held = await ev(() => document.getElementById("panel").dataset.resizing || "");
    const gf = await gripAt("gripC"), fr = reach(gf), moving = await ev(() => document.getElementById("gripC").getAnimations().filter((a) => a.transitionProperty === "--grip-p").length);
    ok(V, "3 " + sashId + ": a key steps the edge 8px, 32px with Shift, held as it moves; its focus draws the highlight along both edges in the focus ink at once (no --grip-p transition)", r2(s1 - s0) === 8 && r2(s2 - s1) === 32 && !!held && inkIs(gf.fill, gf.focus) && moving === 0 && Math.abs(fr.up - runTo) <= 1 && Math.abs(fr.right - runTo) <= 1, s0 + " → " + s1 + " → " + s2 + ", data-resizing=" + held + ", reach " + JSON.stringify(fr));
    await ev(() => document.activeElement.blur());
    await settle(300);
  }
  // A drag holds its cursor on the document and runs the highlight out along the edges it moves.
  for (const [sashId, want_, dx, dy] of [["sashW", "ew-resize", -60, 0], ["sashH", "ns-resize", 0, 60], ["sashC", "nesw-resize", -40, 40]]) {
    if (!(await page.locator("#" + sashId).isVisible())) continue;
    const c = await center("#" + sashId);
    await page.mouse.move(c.x, c.y); await page.mouse.down(); await page.mouse.move(c.x + dx * 3, c.y + dy * 3, { steps: 5 });
    await page.waitForTimeout(tok.reveal + 100);
    const cur = await ev(([x, y]) => ({ html: getComputedStyle(document.documentElement).cursor, under: getComputedStyle(document.elementFromPoint(x, y) || document.body).cursor, panel: document.getElementById("panel").dataset.resizing }), [c.x + dx * 3, c.y + dy * 3]);
    const g = await gripAt("gripC"), r = reach(g);
    await page.mouse.up();
    const arms = Math.abs(r.up - runTo) <= 1 && Math.abs(r.right - runTo) <= 1;
    ok(V, "3 " + sashId + " drag: the cursor holds on html (" + want_ + "), and the handle runs out along both edges of its curve alike (the owner: no fade on one side only), in the strong ink", cur.html === want_ && cur.under === want_ && arms && inkIs(g.fill, g.strong) && g.op === "1", JSON.stringify({ cur, r, op: g.op }));
    await settle(300);
  }
  // ---- Round 27: pins 27, 28 and 30, read on the engine ----
  await load();
  {
    const t = await ev(() => {
      const K = __k, rows = [...document.querySelectorAll(".clip")];
      const figs = [...document.querySelectorAll(".clip .fig, #readout b.fig, .dial .fig, .zoom .fig")].filter((f) => K.vis(f));
      const fcs = figs.map((f) => getComputedStyle(f));
      const inkOK = (c) => { const v = K.rgba(c.color).slice(0, 3).join(","); return v === K.tokenColor("--ink-strong").slice(0, 3).join(",") || v === K.tokenColor("--selected-ink").slice(0, 3).join(","); };
      return {
        rows: rows.length,
        chips: rows.filter((r) => r.querySelector(".ro .badge.code code")).length,
        buttons: rows.every((r) => { const ro = [...r.querySelectorAll(".readouts .ro")]; return ro.length >= 2 && ro.every((b) => b.tagName === "BUTTON"); }),
        figs: figs.length,
        mono: fcs.every((c) => /JetBrains Mono/.test(c.fontFamily) && /tabular-nums/.test(c.fontVariantNumeric) && /cap-height/.test(c.fontSizeAdjust)),
        ink: fcs.every(inkOK),
        kinds: rows.map((r) => { const k = r.dataset.kind, want = K.tokenColor("--motion-" + k).slice(0, 3).join(","), bar = r.querySelector(".bar"), edge = getComputedStyle(bar).boxShadow.match(/^(.*?\))/), dot = r.querySelector(".kind"); return { k, dot: !!dot && K.vis(dot) && K.rgba(getComputedStyle(dot).backgroundColor).slice(0, 3).join(",") === want, bar: bar.getAttribute("aria-pressed") === "true" || (!!edge && K.rgba(edge[1]).slice(0, 3).join(",") === want) }; }),
        regions: [...document.querySelectorAll(".gsec[data-current] .region")].map((r) => { const c = getComputedStyle(r); return { style: c.borderTopStyle, fill: K.rgba(c.backgroundColor).slice(0, 3).join(",") === K.tokenColor("--surface-recess").slice(0, 3).join(","), name: getComputedStyle(r.querySelector(".region-name")).fontWeight }; }),
        dashes: [...document.querySelectorAll(".gsec[data-current] .region, .gsec[data-current] path.edge")].filter((e) => getComputedStyle(e).borderTopStyle === "dashed" || (getComputedStyle(e).strokeDasharray || "none") !== "none").length,
        chevrons: [...document.querySelectorAll(".gsec[data-current] marker path")].every((p) => getComputedStyle(p).fill === "none" && getComputedStyle(p).strokeLinecap === "round"),
      };
    });
    ok(V, "27 every dock row's readouts are buttons, a token's name a code chip (" + t.chips + " of " + t.rows + " rows hold one)", t.rows > 0 && t.buttons && t.chips > 0, JSON.stringify({ rows: t.rows, chips: t.chips, buttons: t.buttons }));
    ok(V, "27 every figure (readouts, ruler readout, dials, zoom) is a Measured figure: JetBrains Mono, tabular, cap-height, in full ink (" + t.figs + ")", t.figs > 0 && t.mono && t.ink, JSON.stringify({ figs: t.figs, mono: t.mono, ink: t.ink }));
    ok(V, "27 each clip's kind of change marks its verb's dot and its bar's edge in its motion hue", t.kinds.length > 0 && t.kinds.every((k) => k.dot && k.bar), JSON.stringify(t.kinds));
    ok(V, "30 regions are filled sections (surface-recess, a solid hairline), their names in the label role; no dash on a region or an edge", t.regions.length > 0 && t.regions.every((r) => r.style === "solid" && r.fill && +r.name >= 500) && t.dashes === 0 && t.chevrons, JSON.stringify({ regions: t.regions, dashes: t.dashes, chevrons: t.chevrons }));
    // 28: the popover opens on what was pressed, a readout chip or a bar, its start on its start.
    if (!(await ev(() => stacked()))) {
      const anchorGeo = (sel) => ev((sel) => { const p = document.querySelector(".pop"), a = document.querySelector(sel); if (!p || !a) return null; const pb = p.getBoundingClientRect(), ab = a.getBoundingClientRect(), B = popBounds(); return { popLeft: Math.round(pb.left * 100) / 100, want: Math.round(clamp(ab.left, B.l, B.r - pb.width) * 100) / 100, popTop: Math.round(pb.top), anchorBottom: Math.round(ab.bottom), anchorTop: Math.round(ab.top), popBottom: Math.round(pb.bottom) }; }, sel);
      const roSel = '.clip:first-child .readouts .ro[data-open="dur"]';
      await click(roSel); await settle(450);
      const ra = await anchorGeo(roSel);
      ok(V, "28 a readout chip's press opens the popover on it: its start on the chip's start (±1px), just below or above it", !!ra && Math.abs(ra.popLeft - ra.want) <= 1 && (Math.abs(ra.popTop - ra.anchorBottom - 4) <= 1 || Math.abs(ra.anchorTop - ra.popBottom - 4) <= 1), JSON.stringify(ra));
      await page.keyboard.press("Escape"); await settle(300);
      const barSel = '.clip:first-child .bar';
      await click(barSel); await settle(450);
      const ba = await anchorGeo(barSel);
      ok(V, "28 a bar's press opens the popover on the bar: its start on the bar's start (±1px)", !!ba && Math.abs(ba.popLeft - ba.want) <= 1, JSON.stringify(ba));
      await page.keyboard.press("Escape"); await settle(300);
    }
    // 30: the section strip's chip brings its region into view under the strip.
    const hasStrip = await ev(() => !!document.querySelector(".gsec[data-current] .secstrip"));
    if (hasStrip) {
      const target = await ev(() => { const chips = [...document.querySelectorAll(".gsec[data-current] .secchip")]; const c = chips.find((x) => !x.hasAttribute("data-inview")) || chips[chips.length - 1]; return c.dataset.machine; });
      await click('.gsec[data-current] .secchip[data-machine="' + target + '"]'); await settle(900);
      const j = await ev((m) => { const g = document.querySelector(".gsec[data-current] .graph"), r = g.querySelector('.region[data-machine="' + m + '"]').getBoundingClientRect(), gb = g.getBoundingClientRect(); return { regionTop: Math.round(r.top), stripBottom: Math.round(gb.top + g.clientTop), graphBottom: Math.round(gb.bottom), inview: g.closest(".gsec").querySelector('.secchip[data-machine="' + m + '"]').hasAttribute("data-inview") }; }, target);
      ok(V, "30 a strip chip's press scrolls its region into the well's view, and marks it in view", j.regionTop >= j.stripBottom - 0.5 && j.regionTop < j.graphBottom && j.inview, JSON.stringify(j));
    } else note(V, "30 section strip", "one machine on this graph: no strip");
  }
  // ---- 9. The desk family's own (responsive-design.md, Per class 4–7) ----
  await load();
  {
    const W = view.viewport.width, H = view.viewport.height;
    const geo = await ev(() => { const b = (id) => __k.box(document.getElementById(id)), cs = getComputedStyle(document.documentElement); return { page: b("page"), panel: b("panel"), dock: b("dock"), s5: parseFloat(cs.getPropertyValue("--space-5")), maxW: parseFloat(cs.getPropertyValue("--c-review-max-w")), floorH: parseFloat(cs.getPropertyValue("--c-page-h-floor")), stack: document.querySelectorAll("[data-stack]").length, lane: document.querySelector(".lane").getBoundingClientRect().width, multi: document.documentElement.hasAttribute("data-multi"), graphs: document.documentElement.dataset.graphs || null, nodeW: getComputedStyle(document.querySelector(".gsec[data-current] .world")).getPropertyValue("--node-w").trim(), two: document.querySelector(".gsec[data-current] .graph").dataset.two }; });
    const capped = view.screen === "ultrawide" && !view.multi, g0 = capped ? Math.max(0, (W - geo.maxW) / 2) : 0, near = (a, b) => Math.abs(a - b) <= 0.5;
    ok(V, "9 the layout is " + (view.multi ? "every component at once, graphs " + view.multi : "one component") + " (html[data-multi], [data-graphs])", geo.multi === !!view.multi && geo.graphs === (view.multi || null), JSON.stringify({ multi: geo.multi, graphs: geo.graphs }));
    // The r23 values ruling: one component past 2450 is the wide layout under the 2000 cap (call 4); every
    // component at once is a centred review block (call 2): gutterEnd = (W - (rowW + 36) - (panel + 36)) / 2.
    const block = view.multi ? await ev(() => { const s5 = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--space-5")), pages = [...document.querySelectorAll(".stage-wrap")].filter((e) => __k.vis(e)).map((e) => e.getBoundingClientRect()), rowW = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--row-w")), pd = document.documentElement.dataset.graphs === "row" ? 896 : 448; return { rowW, gutterEnd: Math.max(0, (innerWidth - (rowW + 2 * s5) - (pd + 2 * s5)) / 2), lastPage: Math.max(...pages.map((b) => b.right)), firstPage: Math.min(...pages.map((b) => b.left)), sb: scrollbarW() }; }) : null;
    const gs = capped ? g0 : view.multi ? block.gutterEnd : 0, ge = gs;
    if (capped) ok(V, "9 one component past 2450 (r24 call 4): the wide layout under the 2000 cap: page, panel and dock in the centred " + geo.maxW + "px column (" + g0 + "px either side), the dock under the page column, the panel with its own height; the page column " + Math.round(geo.page.w - 2 * geo.s5) + "px, lanes " + Math.round(geo.lane) + "px", near(geo.page.l, g0) && near(geo.panel.r, W - g0 - geo.s5) && near(geo.dock.l, g0 + geo.s5) && near(geo.dock.r, geo.page.r) && near(geo.dock.b, H - geo.s5) && near(geo.page.b, geo.dock.t - geo.s5) && geo.panel.b < geo.dock.t && near(geo.page.w - 2 * geo.s5, 1128) && geo.lane >= 780 && geo.lane <= 860 && geo.stack === 0, JSON.stringify({ page: geo.page, panel: geo.panel, dock: geo.dock }));
    else if (view.multi) ok(V, "9 every component at once (r24 call 2): the review block stands centred, a " + Math.round(block.gutterEnd) + "px gutter either side, the pages 36px from the panel (plus the page column's " + block.sb + "px scrollbar gutter), the dock spanning the page column; lanes " + Math.round(geo.lane) + "px", near(geo.page.l, gs) && near(geo.panel.r, W - ge - geo.s5) && near(geo.panel.l - block.lastPage, 2 * geo.s5 + block.sb) && near(block.firstPage - geo.page.l, geo.s5) && near(geo.dock.l, gs + geo.s5) && near(geo.dock.r, geo.page.r) && near(geo.dock.b, H - geo.s5) && near(geo.page.b, geo.dock.t - geo.s5) && geo.lane >= 900 && geo.lane <= 980 && geo.stack === 0, JSON.stringify({ block, page: geo.page, panel: geo.panel, dock: geo.dock }));
    else ok(V, "9 page, panel and dock stand inside the pane; the dock at the foot under the page column, whose room ends above it; no stack mode", near(geo.page.l, 0) && near(geo.panel.r, W - geo.s5) && near(geo.dock.l, geo.s5) && near(geo.dock.b, H - geo.s5) && near(geo.page.b, geo.dock.t - geo.s5) && near(geo.dock.r, geo.page.r) && geo.stack === 0, JSON.stringify({ page: geo.page, panel: geo.panel, dock: geo.dock }));
    if (view.multi) {
      // The ruling's gutters (91, 187, 627) are for overlay scrollbars; a stable classic gutter (sbw) takes
      // half its width from each.
      const want = { "1920": 91, "2560": 187, "3440": 627 }[V], sb = await ev(() => scrollbarW());
      if (want) ok(V, "9 the ruling's gutter at " + V + ": " + want + "px, less half the page column's " + sb + "px scrollbar gutter", Math.abs(block.gutterEnd - (want - sb / 2)) <= 0.5, block.gutterEnd + "px");
      await ev(() => document.getElementById("sashW").focus()); await page.keyboard.press("ArrowLeft"); await page.keyboard.press("ArrowLeft"); await settle(300);
      const dr = await ev(() => ({ panel: __k.box(document.getElementById("panel")), page: __k.box(document.getElementById("page")), pages: document.querySelectorAll(".stage-wrap").length && [...document.querySelectorAll(".stage-wrap")].map((e) => Math.round(e.getBoundingClientRect().top)) }));
      ok(V, "9 a dragged panel keeps its trailing edge; the pages shift by the drag (16px) and stay in one row", near(dr.panel.r, geo.panel.r) && near(dr.panel.w, geo.panel.w + 16) && near(dr.page.l, geo.page.l - 16) && new Set(dr.pages).size === 1, JSON.stringify({ before: [geo.page.l, geo.panel.l, geo.panel.r], after: [dr.page.l, dr.panel.l, dr.panel.r], tops: dr.pages }));
      // Off the width edge's focus (which draws its highlight), the stacked panel shows no corner mark at rest.
      if (view.multi === "stack") { await ev(() => document.activeElement.blur()); await settle(300); }
      if (view.multi === "stack") ok(V, "9 the stacked panel's grips are the width edge and the split edge: no corner and no corner mark at rest (r24 call 3)", await ev(() => !__k.vis(document.getElementById("sashC")) && !__k.vis(document.getElementById("gripC")) && __k.vis(document.getElementById("sashW")) && __k.vis(document.getElementById("sashS"))));
      await load();
    }
    const wantW = view.multi === "row" ? 896 : view.multi ? 448 : view.screen === "wide" || view.screen === "ultrawide" ? 800 : 448;
    ok(V, "9 the panel defaults to " + wantW + "px" + (view.multi === "row" ? " (two 448 graphs side by side)" : view.multi ? " (the graphs stacked)" : wantW === 800 ? " (c-graph-panel-w-wide, one component)" : ""), Math.abs(geo.panel.w - wantW) <= 0.5, geo.panel.w + "px");
    // The r22 ruling: nodes are always 168 here; two regions side by side only where the graph holds both at 168
    // (778px), as the 800 panel does.
    const wideGraph = wantW === 800;
    ok(V, "9 nodes at their full 168px; two machines side by side " + (wideGraph ? "(the graph is 778px or wider)" : "never (the graph is narrower than 778px)"), geo.nodeW === "168px" && geo.two === String(wideGraph), "node " + geo.nodeW + ", two-up " + geo.two);
    if (wideGraph) {
      const two = await ev(() => { const rs = [...document.querySelectorAll(".gsec[data-current] .region")].map((r) => ({ m: r.dataset.machine, b: r.getBoundingClientRect() })), out = []; for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) { const a = rs[i].b, b = rs[j].b; if (Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0 && (a.right <= b.left || b.right <= a.left)) out.push(rs[i].m + " | " + rs[j].m); } return out; });
      ok(V, "9 two machines stand side by side in the 800px panel", two.length > 0, two.join(", "));
      if (view.screen === "wide") ok(V, "9 one component at 1920: a 1066px page column (the dock under it) and lanes of about 740px", near(geo.dock.w, 1066) && geo.lane >= 700 && geo.lane <= 780, "dock " + geo.dock.w + "px, page box " + geo.page.w + "px with its margins, lanes " + Math.round(geo.lane) + "px");
      await ev(() => document.getElementById("sashW").focus());
      await page.keyboard.press("ArrowLeft"); await page.keyboard.press("ArrowLeft"); await settle(300);
      await ev(() => dispatchEvent(new Event("resize"))); await settle(300);
      const dragged = await ev(() => document.getElementById("panel").offsetWidth);
      ok(V, "9 the person's dragged width still wins over the class's default (through a resize)", dragged === wantW + 16, dragged + "px");
      await load();
    }
    if (view.multi) {
      const m = await ev(() => { const r = (e) => __k.box(e); return { pages: [...document.querySelectorAll(".stage-wrap")].filter((e) => __k.vis(e)).map((e) => ({ c: e.dataset.comp, ...r(e) })), secs: [...document.querySelectorAll(".gsec")].map((sec) => ({ c: sec.dataset.comp, head: __k.vis(sec.querySelector(".gsec-head")), name: sec.querySelector(".gsec-name").textContent, zoom: __k.vis(sec.querySelector(".gsec-head .zoom")), g: r(sec.querySelector(".graph")) })), tabs: __k.vis(document.getElementById("tabs")), barZoom: __k.vis(document.querySelector(".toolbar .zoom")), kept: document.querySelectorAll(".node.kept").length, title: document.querySelector(".dock-title").textContent }; });
      const [p1, p2] = m.pages, [s1, s2] = m.secs;
      ok(V, "9 both pages stand in one row at their real 600px, " + geo.s5 + "px apart", m.pages.length === 2 && near(p1.t, p2.t) && near(p1.w, 600) && near(p2.w, 600) && near(p2.l - p1.r, geo.s5), JSON.stringify(m.pages));
      ok(V, "9 the tab strip goes; each graph stands under its component's name, with its own zoom group", !m.tabs && !m.barZoom && m.secs.every((x) => x.head && x.zoom) && s1.name === "Create routine form" && s2.name === "Routine row", JSON.stringify(m.secs.map((x) => ({ c: x.c, head: x.head, zoom: x.zoom }))) + ", tabs " + m.tabs);
      ok(V, view.multi === "stack" ? "9 the two graphs stack, one under the other" : "9 past 2450 the two graphs stand side by side in the 896 panel", view.multi === "stack" ? s2.g.t >= s1.g.b && near(s1.g.l, s2.g.l) : near(s1.g.t, s2.g.t) && s2.g.l >= s1.g.r, JSON.stringify([s1.g, s2.g]));
      ok(V, "9 two coral kept states on screen, one per component", m.kept === 2, m.kept + " kept");
      await sweep("every component at once"); await breakage("every component at once"); await contrast("every component at once");
      const z0 = await ev(() => ({ form: G.form.zoom, row: G.row.zoom }));
      await click('.gsec[data-comp="row"] [data-z="in"]'); await settle(150);
      const z = await ev(() => ({ form: G.form.zoom, row: G.row.zoom }));
      ok(V, "9 each graph keeps its own zoom: zooming the row's graph leaves the form's", Math.abs(z.row - z0.row * 1.2) < 0.001 && z.form === z0.form, JSON.stringify({ before: z0, after: z }));
      ok(V, "9 the dock edits the last-kept component's move and names it", m.title === "Create routine form · Saving → Save failed", m.title);
      await click('.gsec[data-comp="row"] .node[data-machine="runs"][data-state="running"]'); await settle(400);
      const t2 = await ev(() => ({ title: document.querySelector(".dock-title").textContent, tab, kept: document.querySelectorAll(".node.kept").length }));
      await ev(() => document.activeElement && document.activeElement.blur());
      await page.keyboard.press(" "); await settle(80);
      const sp = await ev(() => ({ playing: !!playing, tab, rowFrame: !!document.querySelector('.stage[data-comp="row"]')._drewFrame, formFrame: !!document.querySelector('.stage[data-comp="form"]')._drewFrame }));
      await settle((await playLen()) + 300);
      ok(V, "9 keeping a state on the row makes it the last kept: the dock turns to its move, titled with it; Space plays its page alone", t2.title === "Routine row · Waiting → Running" && t2.tab === "row" && t2.kept === 2 && sp.playing && sp.rowFrame && !sp.formFrame, JSON.stringify(t2) + " " + JSON.stringify(sp));
      await click('.gsec[data-comp="form"] .node[data-machine="save"][data-state="failed"]'); await settle(400);
      ok(V, "9 a keep back on the form turns the dock back to it", (await ev(() => document.querySelector(".dock-title").textContent)) === "Create routine form · Saving → Save failed");
      if (view.multi === "stack") {
        const hs = () => ev(() => splitGraphs().map((g) => g.offsetHeight));
        const h0 = await hs(), sb = await center("#sashS");
        await page.mouse.move(sb.x, sb.y); await page.mouse.down(); await page.mouse.move(sb.x, sb.y + 60, { steps: 6 }); await page.mouse.up(); await settle(300);
        const h1 = await hs();
        await ev(() => document.getElementById("sashS").focus()); await page.keyboard.press("ArrowDown");
        const h2 = await hs();
        ok(V, "9 the foot edge between the stacked graphs splits their heights: dragged 60px down, the first gains what the second gives; a key steps 8px", Math.abs(h1[0] - h0[0] - 60) <= 1 && Math.abs(h1[0] + h1[1] - h0[0] - h0[1]) <= 1 && h2[0] - h1[0] === 8, JSON.stringify([h0, h1, h2]));
      }
      await load();
    }
    const d = await ev(() => ({ h: document.getElementById("dock").offsetHeight, floor: dockFloor(), ceil: dockCeil(), shown: __k.vis(document.getElementById("sashD")) }));
    ok(V, "9 the dock has its own height edge: floor head + ruler + one row (" + d.floor + "px), ceiling the room less the 240px page floor (" + d.ceil + "px)", d.shown && d.floor > 100 && d.floor <= d.h && d.ceil === H - 2 * geo.s5 - geo.floorH, JSON.stringify(d));
    const st0 = await ev(() => __k.stageSnap());
    const sd = await center("#sashD");
    await page.mouse.move(sd.x, sd.y); await page.mouse.down(); await page.mouse.move(sd.x, sd.y - 60, { steps: 6 }); await page.mouse.up(); await settle(300);
    const d1 = await ev(() => ({ h: document.getElementById("dock").offsetHeight, page: __k.box(document.getElementById("page")).b, top: __k.box(document.getElementById("dock")).t }));
    ok(V, "9 dragging the dock's top edge up 60px grows it 60px; the page column ends above it", Math.abs(d1.h - d.h - 60) <= 1 && Math.abs(d1.page - (d1.top - geo.s5)) <= 0.5, d.h + " → " + d1.h + "px, page bottom " + d1.page + ", dock top " + d1.top);
    ok(V, "2 nothing moves the preview: the dock's height edge", same(st0, await ev(() => __k.stageSnap())), st0.length + " boxes");
    await ev(() => document.getElementById("sashD").focus());
    const keyH = async (k) => { await page.keyboard.press(k); return ev(() => document.getElementById("dock").offsetHeight); };
    const k1 = await keyH("ArrowUp"), k2 = await keyH("Shift+ArrowDown"), kEnd = await keyH("End"), kHome = await keyH("Home");
    ok(V, "9 the dock's edge by keys: Up 8px, Shift+Down 32px, End the room less the page floor, Home the floor", k1 - d1.h === 8 && k1 - k2 === 32 && kHome === d.floor && kEnd === d.ceil, [d1.h, k1, k2, kEnd, kHome].join(" → "));
    await settle(300);
    await sweep("the dock at its floor"); await breakage("the dock at its floor");
    await page.screenshot({ path: join(CAPS, V + "-dock-floor.jpg"), type: "jpeg", quality: 82 });
    // The designer: the dock's head keeps Original | Edited, the edits chip and Reset at every height.
    await ev(() => document.querySelector('.bar[data-key="label"]').focus()); await page.keyboard.press("ArrowRight"); await settle(300);
    await ev(() => document.getElementById("sashD").focus()); await page.keyboard.press("Home"); await settle(300);
    const fl = await ev(() => { const d = document.getElementById("dock").getBoundingClientRect(), r = (id) => { const e = id[0] === "#" ? document.querySelector(id) : document.querySelector(id); if (!e) return null; const b = e.getBoundingClientRect(); return { vis: __k.vis(e), inside: b.left >= d.left - 0.5 && b.right <= d.right + 0.5 && b.top >= d.top - 0.5 && b.bottom <= d.bottom + 0.5 }; }; return { h: Math.round(d.height), floor: dockFloor(), compare: r("#compare"), badge: r(".edits .badge"), reset: r("#resetAll") }; });
    ok(V, "9 at its floor, with an edit, the dock's head still shows Original | Edited, the edits chip and Reset", [fl.compare, fl.badge, fl.reset].every((x) => x && x.vis && x.inside) && Math.abs(fl.h - fl.floor) <= 1, JSON.stringify(fl));
    await page.screenshot({ path: join(CAPS, V + "-dock-floor-edited.jpg"), type: "jpeg", quality: 82 });
    await ev(() => document.querySelector('.bar[data-key="label"]').focus()); await page.keyboard.press("Control+z"); await settle(300);
    if (view.screen === "tablet-landscape") {
      const t = await ev(() => ({ corner: __k.vis(document.getElementById("sashC")), handle: __k.vis(document.getElementById("gripC")) && __k.vis(document.getElementById("gripD")), bands: ["sashW", "sashH", "sashD", "sashC"].map((id) => { const b = document.getElementById(id).getBoundingClientRect(); return Math.round(id === "sashW" ? b.width : b.height); }) }));
      // Round 28: the corner is a finger's grip too, its handle drawn (iPadOS's is a finger's first).
      ok(V, "9 " + (view.input === "touch" ? "touch" : "trackpad") + ": 44px bands on the width edge, the graph's foot and the dock's top, the 44px corner, the handles drawn", t.bands.every((x) => x === 44) && t.corner && t.handle, JSON.stringify(t));
      if (view.input !== "touch") {
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
  const free = await ev((k) => { const f = document.querySelector('.pop input[data-f="dur"]').closest(".fld"), row = document.querySelector('.clip[data-key="' + k + '"]'), b = row.querySelector('.readouts .ro[data-open="dur"] .fig'); return { value: document.querySelector('.pop input[data-f="dur"]').value, field: f.className, fieldEdge: getComputedStyle(f).borderTopStyle, fieldBadge: !!f.querySelector(".badge"), badge: b.className, badgeEdge: getComputedStyle(b).outlineStyle, badgeText: b.textContent }; }, reveal);
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
  const spring = await ev((k) => { const b = document.querySelector('.bar[data-key="' + k + '"]').getBoundingClientRect(), t = document.querySelector('.lane[data-key="' + k + '"] .tail'); const tb = t && !t.hidden ? t.getBoundingClientRect() : null; return { bounceRow: !!document.querySelector('.pop input[data-f="bounce"]'), bounce: document.querySelector('.pop input[data-f="bounce"]')?.value, barEnd: Math.round(b.right), tailEnd: tb ? Math.round(tb.right) : null, readout: document.querySelector('.clip[data-key="' + k + '"] .readouts .ro[data-open="curve"]').textContent }; }, reveal);
  const seamless = await ev((k) => { const bar = document.querySelector('.bar[data-key="' + k + '"]'), t = document.querySelector('.lane[data-key="' + k + '"] .tail'); if (!t || t.hidden) return null; const bb = bar.getBoundingClientRect(), tb = t.getBoundingClientRect(), sh = getComputedStyle(bar).boxShadow; return { gap: Math.round((tb.left - bb.right) * 100) / 100, shadows: sh.split(/,(?![^(]*\))/).length, shadow: sh, tailLayers: getComputedStyle(t).backgroundImage.split("linear-gradient").length - 1 }; }, reveal);
  ok(V, "9 r25 B4a: a spring's bar runs on into its tail with no notch: the tail starts at the bar's end, the bar's stroke is its top, foot and start only, the tail carries its top and bottom edges", !!seamless && Math.abs(seamless.gap) <= 0.5 && seamless.shadows === 3 && seamless.tailLayers === 3, JSON.stringify(seamless));
  ok(V, "4 picking Spring adds the Bounce row, and the settle tail draws past the bar's end", spring.bounceRow && spring.tailEnd !== null && spring.tailEnd > spring.barEnd, JSON.stringify(spring));
  const popPos = await popGeo(reveal);
  ok(V, "4 the spring popover still stands clear of its bar", !!popPos && !popPos.covers, JSON.stringify(popPos));
  await sweep("spring popover open");
  await page.screenshot({ path: join(CAPS, V + "-popover-on-spring.jpg"), type: "jpeg", quality: 85 });
  await page.keyboard.press("Escape"); await page.keyboard.press("Escape"); await settle(350);

  // A freed `with` drag (the r21 ruling): during the drag the pill shows the absolute start; after the drop
  // Starts' meta line reads "from the start".
  if (!touch) {
    const fb = await page.locator('.bar[data-key="fade"]').boundingBox();
    await page.mouse.move(fb.x + fb.width / 2, fb.y + 12); await page.mouse.down(); await page.mouse.move(fb.x + fb.width / 2 + 30, fb.y + 12, { steps: 5 });
    const during = await ev(() => { const p = document.querySelector(".drag-pill"), b = document.querySelector('.bar[data-key="fade"]').getBoundingClientRect(), l = document.querySelector('.lane[data-key="fade"]').getBoundingClientRect(); return { pill: p && p.textContent, shown: Math.round(((b.left - l.left) / l.width) * rulerEndOf(keptMove())) }; });
    await page.mouse.up(); await settle((await playLen()) + 300);
    await click('.bar[data-key="fade"]'); await settle(450);
    const sub = await ev(() => { const s = document.querySelector(".pop .pop-sub"); return { sub: s && s.textContent, at: JSON.stringify(keptMove().e.cur.find((c) => c.key === "fade").at) }; });
    const ms = during.pill && +during.pill.replace(/\D+/g, "");
    ok(V, "9 a freed with-drag: the pill shows the absolute start during the drag, and after the drop Starts' meta line reads \"from the start\"", /^starts \d+ ms$/.test(during.pill || "") && Math.abs(ms - during.shown) <= 12 && sub.sub === "from the start", JSON.stringify(during) + " " + JSON.stringify(sub));
    await page.keyboard.press("Escape"); await settle(300);
  }

  // Replay, and the Original | Edited switch.
  await snapDiff("a replay", async () => { await click("#play"); await settle((await playLen()) + 300); });
  const dockBox = await page.locator("#dock").boundingBox();
  await page.screenshot({ path: join(CAPS, V + "-dock-edited.jpg"), type: "jpeg", quality: 85, clip: { x: Math.max(0, dockBox.x - 4), y: Math.max(0, dockBox.y - 4), width: Math.min(dockBox.width + 8, view.viewport.width), height: dockBox.height + 8 } });
  if (await page.locator('#compare [data-view="original"]').count()) {
    await snapDiff("toggling to Original", async () => { await click('#compare [data-view="original"]'); await settle((await playLen()) + 300); });
    const orig = await ev(() => ({ view: document.getElementById("dock").dataset.view, bars: [...document.querySelectorAll(".bar")].map((b) => getComputedStyle(b).borderTopStyle) }));
    ok(V, "4/5 under Original the bars dim to the ghost style", orig.view === "original" && orig.bars.every((s) => s === "dashed"), JSON.stringify(orig));
    await origChips("Original picked");
    const ob = await page.locator("#dock").boundingBox();
    await page.screenshot({ path: join(CAPS, V + "-dock-original.jpg"), type: "jpeg", quality: 85, clip: { x: Math.max(0, ob.x - 4), y: Math.max(0, ob.y - 4), width: Math.min(ob.width + 8, view.viewport.width), height: ob.height + 8 } });
    await snapDiff("toggling back to Edited", async () => { await click('#compare [data-view="edited"]'); await settle((await playLen()) + 300); });
  } else ok(V, "Original | Edited shown once there are edits", false, "no compare control");
  await sweep("edited");
  await breakage("edited");
  await contrast("edited");

  // Change marks: a hover that changes the page washes what it changes.
  if (!touch) {
    // The designer: Every hour in every pane, scrolled into view plainly; the clean-foot rule is the opening
    // view's (r26 item 6).
    const hoverSel = '.node[data-machine="when"][data-state="hour"]';
    // Round 27: the state is brought into view by the app's own reveal (revealNode, the focus path), whose view
    // rule the foot margin is; a browser's plain scrollIntoView lands wherever geometry puts it.
    await ev((sel) => { const el = document.querySelector(sel); revealNode(el.closest(".gsec").dataset.comp, el); }, hoverSel);
    await page.hover(hoverSel);
    await settle(300);
    const w = await ev(() => { const K = __k, r = (n) => Math.round(n * 100) / 100; return [...document.querySelectorAll(".wash")].map((x) => { const of = x.dataset.of && x.closest(".stage-wrap").querySelector('.stage [data-key="' + x.dataset.of + '"]'); const field = K.bgOf(of ? of.parentElement : x.closest(".stage-wrap")), fill = K.rgba(getComputedStyle(x).backgroundColor), washed = K.over(fill, field), edge = K.shadow(x).color, ink = getComputedStyle(x).boxShadow.split(")")[0] + ")"; return { kind: x.dataset.wash, of: x.dataset.of, fill: r(K.ratio(washed, field)), edgeOnField: r(K.ratio(K.over(edge, field), field)), edgeOnWash: r(K.ratio(K.over(edge, washed), washed)), edgeWidth: K.shadow(x).spread }; }); });
    ok(V, "clarity §3 B: hovering Every hour washes what changes (green) and where something went (red)", w.some((x) => x.kind === "add") && w.some((x) => x.kind === "del"), JSON.stringify(w.map((x) => x.kind + ":" + x.of)));
    ok(V, "7 every wash's 1px edge in its hue's ink holds 3:1 against the field and against its own fill", w.length > 0 && w.every((x) => x.edgeWidth === 1 && x.edgeOnField >= 3 && x.edgeOnWash >= 3), w.map((x) => x.kind + ":" + x.of + " fill " + x.fill + ", edge " + x.edgeOnField + " on the field / " + x.edgeOnWash + " on the wash").join("; "));
    const geom = await ev(() => __k.washGeometry());
    // r26 B2: in the hover view the foot stands --space-2 clear of every state, name and label, as the top
    // does. (The stacked 1920 panel is the designer's exception: its plain scroll is the person's view.)
    // Round 27: the view is the app's own reveal; it keeps the top uncut, and the foot uncut outside the stacked
    // panel. The --space-2 foot margin is revealIn's first preference, not a guarantee (a state can sit where no
    // scroll gives it), so it is not asserted here.
    const gvh = await ev((stackedPanel) => __k.graphView({ margin: false, foot: false, footCut: !stackedPanel }), view.multi === "stack");
    ok(V, "9 r26 B2: while a hover previews Every hour, " + (view.multi === "stack" ? "the graph's top cuts nothing (the stacked panel's plain scroll: the designer's clean-foot rule is the opening view's, item 6)" : "the app's reveal of it cuts no state, name or label at the top or the foot"), gvh.length > 0 && gvh.every((g) => g.bad.length === 0), gvh.map((g) => g.comp + " at " + g.zoom + "×, scrolled " + Math.round(g.scroll) + (g.bad.length ? ": " + g.bad.slice(0, 4).join(", ") : " clear")).join("; "));
    const st = await ev(() => __k.washStroke());
    ok(V, "9 r26 B3: a bare line's wash (\"Next run 10:00\") keeps its stroke --c-target-gap (2px) clear of its text", st.length > 0 && st.every((x) => x.gap >= 2 - 0.5), JSON.stringify(st));
    const cover = await ev(() => __k.washCover());
    ok(V, "9 B6: no wash covers anything the preview shows but its own target", cover.length === 0, cover.join(" | ") || (await ev(() => [...document.querySelectorAll(".wash")].map((w) => w.dataset.wash + ":" + w.dataset.of + (w.dataset.seam !== undefined ? " (seam)" : "")).join(", "))));
    ok(V, "9 fault 7: One Target washes: on a boxed target the wash is its box, on a bare one 2px outside; none runs past its target's box plus 2px", geom.length > 0 && geom.every((g) => g.pass), geom.map((g) => g.kind + ":" + g.of + (g.boxed ? " boxed" : " bare") + " +" + g.over + "px").join(", "));
    await ev(() => __k.settled());
    await page.screenshot({ path: join(CAPS, V + "-page-washes.jpg"), type: "jpeg", quality: 85 });
    await conc("washes shown");
    await page.mouse.move(5, 5);
    await settle(200);
    ok(V, "washes leave at once with the hover", (await page.locator(".wash").count()) === 0);
  } else note(V, "washes", "no hover under touch");

  // The Showing line is gone, the panel hides and comes back.
  ok(V, "8 no Showing line in the page", (await ev(() => /\bShowing\b|\bPreviewing\b/.test(document.body.innerText))) === false);
  // Round 27, pin 29: at a desk Hide and Show are one element. The panel folds into its own Hide button,
  // which becomes "Show graph"; its clip-path is read at 0, 0.5 and 1 by pausing its transition.
  await click("#hide");
  await page.waitForTimeout(30);
  const fold = await ev(() => {
    const P = document.getElementById("panel"), a = P.getAnimations().find((x) => x.transitionProperty === "clip-path");
    if (!a) return { anim: false };
    a.pause(); const tm = a.effect.getTiming(), out = [];
    for (const k of [0, 0.5, 1]) { a.currentTime = tm.delay + tm.duration * k; const cp = getComputedStyle(P).clipPath, m = cp.match(/inset\(([-\d.]+)px ([-\d.]+)px ([-\d.]+)px ([-\d.]+)px/), one = cp.match(/inset\(([-\d.]+)px round/); out.push([k, m ? m.slice(1).map(Number) : one ? [1, 2, 3, 4].map(() => +one[1]) : cp]); }
    a.play();
    return { anim: true, dur: tm.duration, out };
  });
  await settle(400);
  const hid = await ev(() => { const P = document.getElementById("panel"), b = document.getElementById("hide"), pb = P.getBoundingClientRect(), bb = b.getBoundingClientRect(), m = getComputedStyle(P).clipPath.match(/inset\(([-\d.]+)px ([-\d.]+)px ([-\d.]+)px ([-\d.]+)px/); const v = m ? m.slice(1).map(Number) : null; return { panel: P.dataset.open, oneElement: P.contains(b) && document.getElementById("show").hidden, label: b.getAttribute("aria-label"), text: b.textContent.trim(), clipLeft: v && pb.left + v[3], btnLeft: bb.left, clipRight: v && pb.right - v[1], btnRight: bb.right, w: bb.width }; });
  const mono = (arr) => arr.every((x, i) => !i || x >= arr[i - 1] - 0.01);
  ok(V, "29 Hide folds the panel into its own button: one element (no separate Show), its clip-path insets growing through 0, 0.5, 1 to the pill's box, which reads \"Show graph\"", fold.anim && fold.out.length === 3 && Array.isArray(fold.out[2][1]) && mono(fold.out.map((o) => (Array.isArray(o[1]) ? o[1][3] : 0))) && fold.out[0][1][3] < fold.out[2][1][3] && hid.panel === "false" && hid.oneElement && hid.label === "Show graph" && /Show graph/.test(hid.text) && Math.abs(hid.clipLeft - hid.btnLeft) <= 1.5 && Math.abs(hid.clipRight - hid.btnRight) <= 1, JSON.stringify({ fold, hid }));
  await click("#hide");
  await page.waitForTimeout(30);
  const unfold = await ev(() => { const P = document.getElementById("panel"), a = P.getAnimations().find((x) => x.transitionProperty === "clip-path"); if (!a) return { anim: false }; a.pause(); const tm = a.effect.getTiming(), out = []; for (const k of [0, 0.5, 1]) { a.currentTime = tm.delay + tm.duration * k; out.push([k, getComputedStyle(P).clipPath.slice(0, 40)]); } a.play(); return { anim: true, dur: tm.duration, out }; });
  await settle(500);
  ok(V, "29 Show opens the pill back into the panel (clip-path from the pill's box to the whole panel), and Hide is Hide again", unfold.anim && /inset\(-64px/.test(unfold.out[2][1]) && (await ev(() => document.getElementById("panel").dataset.open)) === "true" && (await ev(() => document.getElementById("hide").getAttribute("aria-label"))) === "Hide graph", JSON.stringify(unfold));
  await hideGlyph("#hide");

  // Every chip tier the graph can show, its ink against its fill: kept, current (another machine's), hovered
  // (previewed), at rest; and the state a full-page capture draws (the viewport grown to the page's height, the
  // graph rebuilt), read at once and settled.
  const chipRead = (label) => ev((label) => [...document.querySelectorAll(".var")].filter((c) => __k.vis(c)).map((c) => { const cs = getComputedStyle(c), fg = __k.rgba(cs.color), bg = __k.bgOf(c); let op = 1; for (let e = c; e; e = e.parentElement) op *= +getComputedStyle(e).opacity; const layer = cs; void fg; void bg; void op; return { label, text: c.textContent, tier: c.classList.contains("kept") ? "kept" : c.classList.contains("cur") ? "current" : c.classList.contains("peek") || c.matches(":hover") ? "hovered" : "rest", ink: layer.color, fill: layer.backgroundColor, r: Math.round(__k.chipRatio(c) * 100) / 100 }; }), label);
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
  // A keep on a graph already drawn: the chip's tier is its own fill, edge and ink fading over
  // --transition-control (the r21 ruling; the mid-fade frame accepted), no ::after layer, no clip-path.
  {
    const chip = '.gsec[data-current] .var[data-machine="save"][data-state="failed"][data-vary="1"]';
    await page.locator(chip).scrollIntoViewIfNeeded();
    await click(chip); await page.waitForTimeout(40);
    const fade = await ev((sel) => { const c = document.querySelector(sel); return { props: c.getAnimations().map((a) => a.transitionProperty).sort().join(","), after: getComputedStyle(c, "::after").content, clip: getComputedStyle(c).clipPath, kept: c.classList.contains("kept") }; }, chip);
    ok(V, "7 a chip's tier change fades its own fill, edge and ink (no ::after layer, no clip-path)", fade.kept && /background-color/.test(fade.props) && /color/.test(fade.props) && fade.after === "none" && fade.clip === "none", JSON.stringify(fade));
    await settle(300);
    await click('.gsec[data-current] .var[data-machine="save"][data-state="failed"][data-vary="0"]'); await settle(300);
  }

  // Right after a redraw (the graph drawn anew, as a capture's resize or a tab does), every chip takes its tier
  // at once: nothing runs on any chip; the fade is for a real keep.
  const redraw = await ev(() => new Promise((res) => {
    render();
    const frames = []; let n = 0;
    const read = () => {
      const anims = document.getAnimations();
      for (const c of document.querySelectorAll(".var")) {
        if (!__k.vis(c)) continue;
        const running = anims.filter((a) => a.effect && a.effect.target === c && a.playState === "running").map((a) => (a.effect.pseudoElement || "") + ":" + (a.transitionProperty || "keyframes"));
        frames.push({ frame: n, text: c.textContent, running });
      }
      if (++n < 4) requestAnimationFrame(read); else res(frames);
    };
    read();
  }));
  const wrong = redraw.filter((f) => f.running.length);
  ok(V, "7 right after a redraw every chip takes its tier at once, nothing running on any chip", redraw.length > 0 && wrong.length === 0, (wrong.length ? "WRONG " + wrong.slice(0, 3).map((f) => f.text + " frame " + f.frame + " running " + JSON.stringify(f.running)).join("; ") + "; " : "") + redraw.length + " chip-frames over 4 frames");
  await settle(300);

  // The state a full-page capture draws: the viewport grown to the page's height (which rebuilds the graph),
  // read at once, then settled.
  // Every frame for 400ms after the resize, the kept and current chips' ink against their fill; a capture can
  // land on any of them.
  const fullH = await ev(() => Math.max(document.documentElement.scrollHeight, innerHeight));
  if (fullH <= view.viewport.height) note(V, "7 chips through a full-page capture", "the page fits the viewport (" + fullH + "px), so a full-page capture resizes and redraws nothing");
  else await ev(() => { window.__frames = []; const t0 = performance.now(); addEventListener("resize", () => { const tick = () => { for (const c of document.querySelectorAll(".var.kept, .var.cur")) { const a = getComputedStyle(c); window.__frames.push({ t: Math.round(performance.now() - t0), text: c.textContent, tier: c.classList.contains("kept") ? "kept" : "current", r: Math.round(__k.chipRatio(c) * 100) / 100, ink: a.color, fill: a.backgroundColor }); } if (performance.now() - t0 < 400) requestAnimationFrame(tick); }; tick(); }, { once: true }); });
  await page.setViewportSize({ width: view.viewport.width, height: fullH });
  await settle(500);
  const frames = await ev(() => window.__frames || []);
  const low = frames.filter((f) => f.r < 4.5);
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
  const { hideGlyph, origChips } = mkHelpers(V, ev);
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
  const kept = await ev(() => { const v = views[tab], g = __k.graph().getBoundingClientRect(), n = document.querySelector(".node.kept").getBoundingClientRect(); return { inView: n.top >= g.top - 0.5 && n.bottom <= g.bottom + 0.5, head: document.getElementById("sheetState").textContent, state: stateOf(machineOf(comp(), v.last), v.cur[v.last].state).name }; });
  ok(V, "9 the graph opens on the kept state, in view, and the head names it", kept.inView && kept.head === kept.state, JSON.stringify(kept));
  await graphOpen(V, ev, "the view it opens on");
  const wantZoom = !["phone-portrait", "phone-landscape"].includes(view.screen);
  ok(V, "9 zoom buttons " + (wantZoom ? "shown (tablet up, or a mouse)" : "gone: a phone pinches"), (await ev(() => __k.vis(document.querySelector(".zoom")))) === wantZoom);
  ok(V, "9 no grips on a compact screen: no sash, no corner, no Hide in the panel's toolbar", await ev(() => [...document.querySelectorAll(".sash, .lit, .resize-handle, #hide")].every((e) => !__k.vis(e))));

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
    ok(V, "9 the drawer's stops: head alone (44px and its edge), peek 45% of the height, full 85%; the page's room ends at the top of its grabber (3.5px over the drawer's edge)", hs.head.head === 44 && Math.abs(hs.head.tools.h - 45) <= 0.5 && Math.abs(hs.peek.tools.h - H * 0.45) <= 1 && Math.abs(hs.full.tools.h - H * 0.85) <= 1 && Object.values(hs).every((x) => Math.abs(x.page.b - (x.tools.t - 3.5)) <= 0.5 && Math.abs(x.tools.b - H) <= 0.5), Object.entries(hs).map(([k, x]) => k + " " + x.tools.h + "px, page " + x.page.h + "px").join("; "));
    ok(V, "2 nothing moves the preview: the drawer's stops", same(snaps.head, snaps.peek) && same(snaps.peek, snaps.full), snaps.peek.length + " boxes");
    const under = {};
    for (const st of ["head", "peek", "full"]) { await ev((s) => setStop(s), st); await settle(500); under[st] = await ev(() => __k.pageUnderDrawer()); }
    ok(V, "9 r25 B2: the page's room ends above the drawer and its grabber at every stop: no page element's box meets them", Object.values(under).every((u) => u.length === 0), JSON.stringify(under));
    const cap = await ev(() => { const n = document.querySelector('.stage [data-key="note"]'); if (!n) return null; const rg = document.createRange(); rg.selectNodeContents(n); const lines = new Set([...rg.getClientRects()].map((r) => Math.round(r.top))).size; return { lines, width: Math.round(n.getBoundingClientRect().width) }; });
    if (view.screen === "phone-portrait") ok(V, "9 r25 B2: on a phone the form's caption takes its own line over its buttons, whole on one line", !!cap && cap.lines === 1, JSON.stringify(cap));
    await ev(() => setStop("peek")); await settle(500);
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
    // The r22 ruling: a tap toggles peek and full; the head stop comes by a drag down or Hide, and a tap there
    // goes to peek.
    await ev(() => setStop("full")); await settle(500);
    await ev(() => $("sheetHead").dispatchEvent(new MouseEvent("click", { bubbles: true }))); await settle(500);
    const fromFull = await ev(() => stop);
    await ev(() => setOpen(false)); await settle(500);
    const hidden = await ev(() => stop);
    await ev(() => $("sheetHead").dispatchEvent(new MouseEvent("click", { bubbles: true }))); await settle(500);
    const fromHead = await ev(() => stop);
    ok(V, "9 a tap toggles full back to peek; Hide drops to the head stop, and a tap there goes to peek", fromFull === "peek" && hidden === "head" && fromHead === "peek", "full → " + fromFull + "; Hide → " + hidden + "; head → " + fromHead);
  } else {
    const g = await ev(() => ({ tools: __k.box(document.getElementById("tools")), page: __k.box(document.getElementById("page")), m: parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--c-screen-margin")) }));
    ok(V, "9 the side sheet stands at the trailing edge at half the pane; the page takes the other half", Math.abs(g.tools.l - W / 2) <= 0.5 && Math.abs(g.tools.r - (W - g.m)) <= 0.5 && Math.abs(g.page.r - W / 2) <= 0.5 && Math.abs(g.tools.h - (H - 2 * g.m)) <= 0.5, JSON.stringify(g));
    await tap("#sheetHide"); await settle(450);
    const hidden = await ev(() => ({ tools: __k.vis(document.getElementById("tools")), tab: __k.box(document.getElementById("show")), page: __k.box(document.getElementById("page")) }));
    ok(V, "9 Hide folds the sheet to a 32px edge tab at the trailing edge; the page takes the room", !hidden.tools && Math.abs(hidden.tab.w - 32) <= 0.5 && Math.abs(hidden.tab.r - W) <= 0.5 && Math.abs(hidden.page.r - (W - 32)) <= 0.5, JSON.stringify(hidden));
    await sweepAll("the sheet folded to its tab");
    await tap("#show"); await settle(450);
    await hideGlyph("#sheetHide");
    await tap("#sheetHide"); await settle(450);
    await shot("sheet-folded");
    await tap("#show"); await settle(450);
    ok(V, "9 the edge tab brings the sheet back", await ev(() => __k.vis(document.getElementById("tools")) && document.getElementById("show").hidden));
  }

  // ---- Input: previews and keeps ----
  // The state held: one in the graph's view whose preview washes something the page's room shows (r26 B1: at
  // 844 the first one in view, Saving, changed only what stood below the room).
  const target = () => ev(() => { const g = __k.graph().getBoundingClientRect(); const inView = [...document.querySelectorAll(".node:not(.kept):not(.cur)")].filter((n) => { const b = n.querySelector("b").getBoundingClientRect(); return b.top > g.top + 4 && b.bottom < g.bottom - 4 && b.left > g.left + 4 && b.right < g.right - 4; }); const shows = (n) => { peek = { comp: tab, machine: n.dataset.machine, state: n.dataset.state, vary: 0 }; drawStage(tab); const k = __k.visibleWashes(); peek = null; drawStage(tab); return k; }; const n = inView.find((x) => shows(x) > 0) || inView[0]; if (!n) return null; const b = n.querySelector("b").getBoundingClientRect(); return { m: n.dataset.machine, s: n.dataset.state, x: b.left + b.width / 2, y: b.top + b.height / 2 }; });
  const keptNow = () => ev(() => views[tab].last + ":" + views[tab].cur[views[tab].last].state + "|" + JSON.stringify(views[tab].cur));
  const peekNow = () => ev(() => ({ peek: peek ? peek.machine + ":" + peek.state : null, washes: document.querySelectorAll(".wash").length, peeked: document.querySelectorAll(".node.peek").length }));
  let t1 = await target();
  if (!t1) ok(V, "9 a state to press in view", false, "none");
  else if (touch) {
    const k0 = await keptNow();
    await touchAt("touchStart", [[t1.x, t1.y]]);
    await page.waitForTimeout(200); const early = await peekNow();
    await page.waitForTimeout(300); const held = await peekNow();
    const heldLook = await ev(() => { const n = document.querySelector(".node.peek"), rest = document.querySelector(".node:not(.peek):not(.kept):not(.cur)"); return n ? { peekBg: getComputedStyle(n).backgroundColor, restBg: getComputedStyle(rest).backgroundColor, hover: __k.tokenColor("--surface-hover").join(",") , got: __k.rgba(getComputedStyle(n).backgroundColor).join(",") } : null; });
    ok(V, "9 r25 B4b: the held state peeks in the graph (its fill steps to --surface-hover) while its washes draw on the page", !!heldLook && heldLook.got === heldLook.hover && heldLook.peekBg !== heldLook.restBg, JSON.stringify(heldLook));
    const seenWashes = await ev(() => __k.visibleWashes());
    ok(V, "9 r26 B1: the held preview shows: its node peeks and its washes stand in the page's visible room (" + t1.m + ":" + t1.s + ")", held.peeked === 1 && seenWashes > 0, seenWashes + " washes in view");
    const underHeld = await ev(() => __k.pageUnderDrawer());
    if (view.layout === "drawer") ok(V, "9 r25 B2: during the held preview the page's room still ends above the drawer and its grabber", underHeld.length === 0, underHeld.join(" | "));
    const geom = await ev(() => __k.washGeometry());
    const cover = await ev(() => __k.washCover()), list = await ev(() => [...document.querySelectorAll(".wash")].map((w) => w.dataset.wash + ":" + w.dataset.of + (w.dataset.seam !== undefined ? " (seam)" : "")).join(", "));
    ok(V, "9 B6: the held preview's washes cover nothing the preview shows but their own targets (a gone value's wash on what came in at its place is by design)", cover.length === 0, (cover.join(" | ") || "clear") + " — " + list + " (previewing " + t1.m + ":" + t1.s + ")");
    ok(V, "9 fault 7: the held preview's washes keep to One Target: a boxed target's box exactly, a bare one's plus 2px, none past", geom.every((g) => g.pass), geom.length + " washes: " + geom.map((g) => g.kind + ":" + g.of + (g.boxed ? " boxed" : " bare") + " +" + g.over + "px").join(", "));
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
    const gb = await page.locator(".gsec[data-current] .graph").boundingBox(), cx = gb.x + gb.width / 2, cy = gb.y + gb.height / 2;
    const pinchTo = async (from, to) => { await touchAt("touchStart", [[cx - from / 2, cy], [cx + from / 2, cy]]); for (let i = 1; i <= 6; i++) { const d = from + ((to - from) * i) / 6; await touchAt("touchMove", [[cx - d / 2, cy], [cx + d / 2, cy]]); } await touchAt("touchEnd", []); await settle(150); return ev(() => G[tab].zoom); };
    const zOut = await pinchTo(30, 300), zIn = await pinchTo(300, 20);
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
  await page.locator('.bar[data-key="reveal"]').scrollIntoViewIfNeeded();
  await tap('.bar[data-key="reveal"]'); await settle(700);
  const ed = await ev(() => { const p = document.querySelector(".pop"), bar = document.querySelector('.bar[data-key="reveal"]'); if (!p) return null; const pb = p.getBoundingClientRect(), bb = bar.getBoundingClientRect(), row = bar.closest(".clip").getBoundingClientRect(); return { inline: p.classList.contains("inline"), after: p.previousElementSibling && p.previousElementSibling.dataset.key, top: Math.round(pb.top), rowBottom: Math.round(row.bottom), above: Math.abs(pb.bottom - (bb.top - 4)) <= 0.5, below: Math.abs(pb.top - (Math.max(bb.bottom, row.bottom) + 4)) <= 0.5, covers: Math.min(pb.right, bb.right) > Math.max(pb.left, bb.left) && Math.min(pb.bottom, bb.bottom) > Math.max(pb.top, bb.top), w: Math.round(pb.width), rowW: Math.round(row.width) }; });
  if (view.stacked) ok(V, "9 a clip's editor unfolds inline, under its row, the row's width", !!ed && ed.inline && ed.after === "reveal" && Math.abs(ed.top - ed.rowBottom) <= 1 && Math.abs(ed.w - ed.rowW) <= 1, JSON.stringify(ed));
  else ok(V, "9 a clip's editor stays a popover beside its bar (4px above, or below where the room above is short), never covering it", !!ed && !ed.inline && (ed.above || ed.below) && !ed.covers, JSON.stringify(ed));
  // Faults 2 and 6: the editor stands where it can be seen. Inline, it has scrolled into the rows' view (under
  // the sticky ruler, above the face's foot); as a popover, inside the surface it opens in (the Move face,
  // under the sheet's head) and the viewport.
  const seen = await ev(() => { const p = document.querySelector(".pop").getBoundingClientRect(), t = document.getElementById("tl").getBoundingClientRect(), ruler = document.querySelector(".ruler-row").getBoundingClientRect(), face = document.getElementById("dock").getBoundingClientRect(), tools = document.getElementById("tools").getBoundingClientRect(), head = document.getElementById("sheetHead").getBoundingClientRect(), r = (n) => Math.round(n * 100) / 100; return { pop: [r(p.left), r(p.top), r(p.right), r(p.bottom)], rowsView: [r(t.left), r(ruler.bottom), r(t.right), r(t.bottom)], face: [r(face.left), r(face.top), r(face.right), r(face.bottom)], tools: [r(tools.left), r(tools.top), r(tools.right), r(tools.bottom)], headBottom: r(head.bottom), vp: [innerWidth, innerHeight] }; });
  const inside = (a, b) => a[0] >= b[0] - 0.5 && a[1] >= b[1] - 0.5 && a[2] <= b[2] + 0.5 && a[3] <= b[3] + 0.5;
  // r24 call 7: one scroller. The editor keeps its natural height; it opens whole in the rows' view where it
  // fits, and with its head at the view's top where it doesn't.
  const own = await ev(() => { const cs = getComputedStyle(document.querySelector(".pop")); return { overflowY: cs.overflowY, maxH: cs.maxBlockSize, h: document.querySelector(".pop").scrollHeight, client: document.querySelector(".pop").clientHeight }; });
  const fits = seen.pop[3] - seen.pop[1] <= seen.rowsView[3] - seen.rowsView[1] + 0.5;
  if (view.stacked) ok(V, "9 fault 2: the inline editor scrolls into view as it opens, the rows its one scroller: " + (fits ? "whole inside the rows' view" : "its head at the view's top"), own.maxH === "none" && own.overflowY !== "auto" && own.h <= own.client + 1 && (fits ? inside(seen.pop, seen.rowsView) : Math.abs(seen.pop[1] - seen.rowsView[1]) <= 1) && inside([seen.pop[0], seen.pop[1], seen.pop[2], Math.min(seen.pop[3], seen.rowsView[3])], seen.tools), JSON.stringify({ ...seen, own, fits }));
  if (view.stacked) { const mk = await ev(() => __k.marksOverEditor()); ok(V, "9 B2: nothing of the timeline's marks is painted over the inline editor's fields (ties stand in their lanes)", mk.length === 0, mk.join(" | ") || (await ev(() => document.querySelectorAll(".tie").length)) + " ties in their lanes"); }
  else ok(V, "9 fault 6: the popover stands inside the surface it opens in (the Move face, under the head with its Graph | Move and Hide) and the viewport", inside(seen.pop, seen.face) && seen.pop[1] >= seen.headBottom && inside(seen.pop, [0, 0, seen.vp[0], seen.vp[1]]), JSON.stringify(seen));
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
  // Fault 3 on a compact face: Original redraws the rows from the original move.
  await page.locator('#compare [data-view="original"]').scrollIntoViewIfNeeded();
  await tap('#compare [data-view="original"]'); await settle(500);
  await origChips("on the " + view.layout + "'s Move face");
  await tap('#compare [data-view="edited"]'); await settle(500);
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
  // Round 28: pointing at the corner and dragging it, the handle's ink fades and its shape changes at once
  // (no --grip-p transition); nothing on the panel travels.
  const handleAnims = () => ev(() => document.getAnimations().map((a) => { const t = a.effect.target, h = t && t.closest && t.closest(".resize-handle, .panel"); return { target: h ? h.id || "panel" : "", prop: a.transitionProperty || "keyframes" }; }).filter((a) => a.target));
  const c = await page.locator("#sashC").boundingBox();
  await page.mouse.move(c.x + c.width / 2, c.y + c.height / 2);
  await page.waitForTimeout(40);
  const pointed = await handleAnims();
  await page.waitForTimeout(400);
  await page.mouse.down(); await page.mouse.move(c.x + c.width / 2 - 20, c.y + c.height / 2 + 15, { steps: 2 });
  await page.waitForTimeout(20);
  const held = await handleAnims(), up = await ev(() => { const b = document.getElementById("panel").getBoundingClientRect(), g = __k.grip(document.getElementById("gripC")); return { up: Math.round(b.bottom - g.box.top), want: Math.round(__k.gripWant("gripC").runTo) }; });
  await page.mouse.up(); await page.waitForTimeout(300);
  ok(V, "the handle only changes its ink: pointed at and held, no --grip-p transition, its highlight there at once (" + up.up + "px up the edge), nothing on the panel moving", pointed.length > 0 && [...pointed, ...held].every((a) => ["color", "fill", "opacity", "background-color", "box-shadow"].includes(a.prop)) && Math.abs(up.up - up.want) <= 1, JSON.stringify({ pointed, held }));
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

// The handle's corner at 2× (round 28): rest, the pointer on the corner, and held mid-drag, at 1440 by day
// and at night, each crop 184 × 180 CSS px round the corner (368 × 360 device px), room for the run-out.
// Then the ink a person sees, read off the rendered pixels of the held frames (the reviewer's findings on
// fa89b0201: a plateau then a cut along the hairline, two lines with panel colour between them, the two edges
// drawn differently, the dock's lens under its hairline). See inkProfile.
async function runTwoX(scheme) {
  const V = "1440-" + scheme + "-2x";
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: scheme, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors = []; page.on("pageerror", (e) => errors.push(String(e)));
  const ev = (fn, arg) => page.evaluate(fn, arg);
  await page.goto(URL_); await page.waitForTimeout(700); await ev(install);
  const clip = async () => { const b = await ev(() => { const r = document.getElementById("panel").getBoundingClientRect(); return { x: Math.floor(r.left - 24), y: Math.floor(r.bottom - 156) }; }); return { x: b.x, y: b.y, width: 184, height: 180 }; };
  const dockClip = async () => { const b = await ev(() => { const r = document.getElementById("dock").getBoundingClientRect(); return { x: Math.floor(r.left + r.width / 2 - 92), y: Math.floor(r.top - 40) }; }); return { x: b.x, y: b.y, width: 184, height: 90 }; };
  const shot = async (part, name, c) => page.screenshot({ path: join(CAPS, V + "-" + part + "-" + name + ".png"), clip: c });
  const dpr = await ev(() => devicePixelRatio);
  await page.mouse.move(5, 5); await page.waitForTimeout(400);
  const cc = await clip(), restPng = await shot("corner", "rest", cc);
  capsVerdict(V, "corner", await capsRound(page, ev, "corner"));
  const c = await page.locator("#sashC").boundingBox(), x = c.x + c.width / 2, y = c.y + c.height / 2;
  await page.mouse.move(x, y); await page.waitForTimeout(400);
  hoverVerdict(V, "corner", await hoverDiff(ev, restPng, await shot("corner", "hover", cc)));
  await page.mouse.down(); await page.mouse.move(x - 12, y + 9, { steps: 2 }); await page.waitForTimeout(500); await shot("corner", "drag", await clip());
  const held = await ev(() => document.getElementById("panel").dataset.resizing);
  const corner = await inkProfile(page, ev, "corner");
  await page.mouse.up();
  ok(V, "the corner captured at 2× (rest, pointed at, held)", dpr === 2 && held === "wh" && errors.length === 0, "devicePixelRatio " + dpr + ", held " + held + (errors.length ? ", errors " + errors.join(" | ") : ""));
  inkVerdict(V, "corner", corner);
  // The dock's edge: keep a state so the dock stands, then point at its top edge and hold it.
  await page.mouse.move(5, 5); await page.waitForTimeout(300);
  await ev(() => { if (document.getElementById("dock").dataset.open !== "true") { const n = document.querySelector(".node:not(.kept)"); if (n) n.click(); } });
  await page.waitForTimeout(600);
  const dc = await page.locator("#sashD").boundingBox();
  if (dc) {
    const dk = await dockClip(), dRest = await shot("dock", "rest", dk);
    capsVerdict(V, "dock", await capsRound(page, ev, "dock"));
    const dx = dc.x + dc.width / 2, dy = dc.y + dc.height / 2;
    await page.mouse.move(dx, dy); await page.waitForTimeout(400);
    hoverVerdict(V, "dock", await hoverDiff(ev, dRest, await shot("dock", "hover", dk)));
    await page.mouse.down(); await page.mouse.move(dx, dy - 10, { steps: 2 }); await page.waitForTimeout(500);
    await shot("dock", "drag", await dockClip());
    const dock = await inkProfile(page, ev, "dock");
    await page.mouse.up();
    inkVerdict(V, "dock", dock);
  } else ok(V, "the dock stands for its held read", false, "no #sashD box");
  await ctx.close();
}

// Round caps at 2× (the third review: Apple's ends are round). At 1× the stroke is 1.79px, a cap's radius
// 0.9px, which no rasteriser can draw round: 1× is not read. At rest, at each end of the handle's body, two
// points 0.85 of the stroke's half-width past the end and either side of its centreline (inside a square
// cap, outside a round one) must stand at most half as far from the panel as a point inside the cap.
async function capsRound(page, ev, which) {
  const geo = await ev((which) => {
    const id = which === "corner" ? "gripC" : "gripD", T = document.getElementById(id).closest(".tool"), b = T.getBoundingClientRect(), w = __k.gripWant(id);
    return { left: b.left, bottom: b.bottom, top: b.top, mid: b.left + b.width / 2, R: w.R, d: w.d, w: w.w, len: w.len, sweep: w.sweep, panel: __k.bgOf(T) };
  }, which);
  const k = 2, clip = which === "corner" ? { x: Math.floor(geo.left - 2), y: Math.floor(geo.bottom - geo.R - 4), width: Math.ceil(geo.R + 8), height: Math.ceil(geo.R + 8) } : { x: Math.floor(geo.mid - geo.len / 2 - 6), y: Math.floor(geo.top - 2), width: Math.ceil(geo.len + 12), height: Math.ceil(geo.d * 2 + 6) };
  const png = await page.screenshot({ clip });
  return ev(async ([b64, which, geo, clip, k]) => {
    const img = new Image(); img.src = "data:image/png;base64," + b64; await img.decode();
    const cv = document.createElement("canvas"); cv.width = img.width; cv.height = img.height; const cx = cv.getContext("2d", { willReadFrequently: true }); cx.drawImage(img, 0, 0);
    const D = cx.getImageData(0, 0, cv.width, cv.height).data, W = cv.width;
    const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2], Lp = lum(geo.panel);
    const C = (x, y) => { const X = Math.round(x * k - 0.5), Y = Math.round(y * k - 0.5), i = (Y * W + X) * 4; return Math.abs(0.2126 * D[i] + 0.7152 * D[i + 1] + 0.0722 * D[i + 2] - Lp); };
    const h = geo.w / 2, ends = [];
    if (which === "corner") {
      const ox = geo.left + geo.R - clip.x, oy = geo.bottom - geo.R - clip.y, r = geo.R - geo.d;
      for (const sgn of [1, -1]) { const t = ((135 + (sgn * geo.sweep) / 2) * Math.PI) / 180, E = [ox + r * Math.cos(t), oy + r * Math.sin(t)], tg = [-sgn * Math.sin(t), sgn * Math.cos(t)], nm = [Math.cos(t), Math.sin(t)]; ends.push({ E, tg, nm }); }
    } else {
      const oy = geo.top - clip.y + geo.d, ox = geo.mid - clip.x;
      for (const sgn of [1, -1]) ends.push({ E: [ox + (sgn * geo.len) / 2, oy], tg: [sgn, 0], nm: [0, 1] });
    }
    return ends.map(({ E, tg, nm }) => { const inside = C(E[0] + tg[0] * 0.3 * h, E[1] + tg[1] * 0.3 * h), corners = [1, -1].map((s) => C(E[0] + (tg[0] + s * nm[0]) * 0.85 * h, E[1] + (tg[1] + s * nm[1]) * 0.85 * h)); return { inside: Math.round(inside), corners: corners.map(Math.round), share: Math.round((Math.max(...corners) / (inside || 1)) * 100) / 100, at: E.map((v) => Math.round(v * 10) / 10) }; });
  }, [png.toString("base64"), which, geo, clip, k]);
}
function capsVerdict(V, which, ends) {
  ok(V, "7 ink: the " + which + " handle's ends are round at 2×: the middle of each cap carries the ink (≥ 60 levels from the panel) and its square corners stand at most half of that (1× cannot draw a 0.9px cap radius, so it is not read)", ends.every((e) => e.inside >= 60 && e.share <= 0.5), JSON.stringify(ends));
}
// A hover a person sees (DESIGN.md: under the pointer a control takes the hover fill and the strong ink): the
// rest and pointed-at frames of the same crop, read pixel for pixel at 2×. At least 300 device pixels (75 CSS
// px²) change by 8 levels or more, and the ink itself by 25 or more.
async function hoverDiff(ev, a, b) {
  return ev(async ([a64, b64]) => {
    const read = async (b64) => { const img = new Image(); img.src = "data:image/png;base64," + b64; await img.decode(); const cv = document.createElement("canvas"); cv.width = img.width; cv.height = img.height; const cx = cv.getContext("2d", { willReadFrequently: true }); cx.drawImage(img, 0, 0); return cx.getImageData(0, 0, cv.width, cv.height).data; };
    const A = await read(a64), B = await read(b64), L = (D, i) => 0.2126 * D[i] + 0.7152 * D[i + 1] + 0.0722 * D[i + 2];
    let area = 0, max = 0; for (let i = 0; i < A.length; i += 4) { const d = Math.abs(L(A, i) - L(B, i)); if (d >= 8) area++; max = Math.max(max, d); }
    return { area, max: Math.round(max) };
  }, [a.toString("base64"), b.toString("base64")]);
}
function hoverVerdict(V, which, d) {
  ok(V, "5 the " + which + " handle's hover is one a person sees: ≥ 300 device px change by 8 levels or more, the ink by 25 or more", d.area >= 300 && d.max >= 25, JSON.stringify(d));
}

// The ink a person sees along a held handle's run-out, read on the rendered device pixels (CLAUDE.md proof
// rule: ink reading for what drawing alone decides, here a seam and a taper). For each edge the run-out lies
// on (the corner's foot and width edge; the dock's top edge, either way from its middle):
//   - the hairline's own device row (or column): the one with the most contrast against the panel, read just
//     past the run-out's tip, where the border stands bare;
//   - the profile along that row from where the corner's curve ends (the dock: the capsule's end) to past the
//     tip, as contrast against the bare hairline's own value: it must fall from the stroke to the hairline's
//     value with no rise, no plateau (any 5 CSS px still above 10 levels must fall by 2 or more), no step
//     bigger than 14 levels from one device pixel to the next, and end at the hairline's value;
//   - across the edge at every step along the run: no pixel of panel colour between the hairline and the
//     stroke (a dip under half the weaker of the two, with a stroke of more than 25 levels beyond it);
//   - the two edges' profiles the same at the same distance (max 12 levels apart, mean 4).
async function inkProfile(page, ev, which) {
  const geo = await ev((which) => {
    const id = which === "corner" ? "gripC" : "gripD", T = document.getElementById(id).closest(".tool"), b = T.getBoundingClientRect(), w = __k.gripWant(id);
    const reach = which === "corner" ? w.runTo : w.half;
    const cs = getComputedStyle(T), path = document.getElementById(id).querySelector(".handle-ink");
    return { left: b.left, bottom: b.bottom, top: b.top, mid: b.left + b.width / 2, R: w.R, start: which === "corner" ? w.R : w.len / 2, reach, bw: w.bw, border: __k.rgba(cs.borderTopColor), panel: __k.bgOf(T), ink: __k.rgba(getComputedStyle(document.getElementById(id)).color) };
  }, which);
  const pad = 14, k = 2;
  // The crop, in CSS px, whole pixels; the edge's place in it in device px.
  const clip = which === "corner"
    ? { x: Math.floor(geo.left - 6), y: Math.floor(geo.bottom - geo.reach - pad), width: Math.ceil(geo.reach + pad + 8), height: Math.ceil(geo.reach + pad + 8) }
    : { x: Math.floor(geo.mid - geo.reach - pad), y: Math.floor(geo.top - 6), width: Math.ceil(2 * (geo.reach + pad)), height: 24 };
  const png = await page.screenshot({ clip });
  return ev(async ([b64, which, geo, clip, k, pad]) => {
    const img = new Image(); img.src = "data:image/png;base64," + b64; await img.decode();
    const cv = document.createElement("canvas"); cv.width = img.width; cv.height = img.height;
    const cx = cv.getContext("2d", { willReadFrequently: true }); cx.drawImage(img, 0, 0);
    const D = cx.getImageData(0, 0, cv.width, cv.height).data, W = cv.width, H = cv.height;
    const L = (x, y) => { x = Math.round(x); y = Math.round(y); if (x < 0 || y < 0 || x >= W || y >= H) return NaN; const i = (y * W + x) * 4; return 0.2126 * D[i] + 0.7152 * D[i + 1] + 0.0722 * D[i + 2]; };
    const RGB = (x, y) => { x = Math.round(x); y = Math.round(y); const i = (y * W + x) * 4; return [D[i], D[i + 1], D[i + 2]]; };
    const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    // WCAG relative luminance and contrast, for the held line against the bare hairline.
    const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }, rel = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
    const ratio = (a, b) => { const x = rel(a), y = rel(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    // An edge: `at(t, n)` is the device pixel t CSS px along the edge from its origin and n device px in
    // across it (n = 0 the edge's outermost device pixel).
    const edges = which === "corner"
      ? { foot: (t, n) => [((geo.left - clip.x) + t) * k, (geo.bottom - clip.y) * k - 1 - n], width: (t, n) => [(geo.left - clip.x) * k + n, ((geo.bottom - clip.y) - t) * k] }
      : { right: (t, n) => [((geo.mid - clip.x) + t) * k, (geo.top - clip.y) * k + n], left: (t, n) => [((geo.mid - clip.x) - t) * k, (geo.top - clip.y) * k + n] };
    const out = {};
    for (const [name, at] of Object.entries(edges)) {
      // The hairline's own device line: where the bare border (just past the tip) draws the border's own colour.
      const bare = geo.reach + pad / 2, Lin = lum(geo.panel), Lk = lum(geo.ink);
      let h = 0, best = Infinity; for (let n = -2; n <= 4; n++) { const c = RGB(...at(bare, n)), v = Math.hypot(c[0] - geo.border[0], c[1] - geo.border[1], c[2] - geo.border[2]); if (v < best) { best = v; h = n; } }
      const Lh = L(...at(bare, h));
      const prof = [];
      for (let t = geo.start; t <= geo.reach + 4; t += 1 / k) prof.push({ t: Math.round(t * 100) / 100, c: Math.round(Math.abs(L(...at(t, h)) - Lh)) });
      let rise = 0, step = 0, plateau = null;
      for (let i = 1; i < prof.length; i++) { rise = Math.max(rise, prof[i].c - prof[i - 1].c); step = Math.max(step, prof[i - 1].c - prof[i].c); }
      // (A plateau is read from 5 CSS px into the run: the fade opens on a smoothstep's zero slope by design, so
      // its first few pixels fall by a level or two, which at night's 65-level contrast is the rounding.)
      for (let i = 0; i + 10 < prof.length; i++) if (prof[i].t >= geo.start + 5 && prof[i].c >= 10 && prof[i].c - prof[i + 10].c < 2) { plateau = prof[i].t; break; }
      // Across the edge: from the hairline inward, the panel colour must not show between it and the stroke.
      let gap = null;
      for (let t = geo.start; t <= geo.reach; t += 1 / k) {
        const d = []; for (let n = h; n <= h + 12; n++) d.push(Math.abs(L(...at(t, n)) - Lin));
        let kp = 1; for (let j = 1; j < d.length; j++) if (d[j] > d[kp]) kp = j;
        if (d[kp] <= 25 || kp < 2) continue;
        let m = Infinity; for (let j = 1; j < kp; j++) m = Math.min(m, d[j]);
        if (m < 0.5 * Math.min(d[0], d[kp])) { gap = { t: Math.round(t * 100) / 100, across: d.map(Math.round) }; break; }
      }
      // It starts on the line: where the run leaves the corner's curve, the hairline carries the stroke (at least
      // 40% of the stroke's own contrast against the bare hairline), so the run lands on the border.
      const bareAcross = [], midAcross = [], tm = (geo.start + geo.reach) / 2; for (let n = -4; n <= 8; n++) { bareAcross.push(Math.round(L(...at(bare, n)))); midAcross.push(Math.round(L(...at(tm, n)))); }
      // The ink across the edge at every device pixel along it (the third review's reading): the sum, over the
      // edge's cross-section, of how far each pixel stands from the bare border's own cross-section. Through the
      // junction of the corner's curve and the run it must fall as smoothly as the fade: no 4 device px losing
      // more than 12% of what the run starts with (the smoothstep fade's steepest is 1.5 / its 90 device px, 6.7%
      // over 4, and a sum of 15 pixels carries a few levels of rounding), none gaining more than 3%.
      const bareX = []; for (let n = h - 2; n <= h + 12; n++) bareX.push(L(...at(bare, n)));
      const mass = []; for (let t = geo.start; t <= geo.reach + 2; t += 1 / k) { let m = 0; for (let n = h - 2, j = 0; n <= h + 12; n++, j++) m += Math.abs(L(...at(t, n)) - bareX[j]); mass.push({ t: Math.round(t * 100) / 100, m: Math.round(m) }); }
      let mDrop = 0, mRise = 0, mAt = null; const m0 = mass[0].m || 1;
      for (let i = 4; i < mass.length; i++) { const dr = (mass[i - 4].m - mass[i].m) / m0, ri = (mass[i].m - mass[i - 4].m) / m0; if (dr > mDrop) { mDrop = dr; mAt = mass[i].t; } mRise = Math.max(mRise, ri); }
      // The line's width across the edge, CSS px: from the hairline inward, the device pixels standing at least
      // half the cross-section's own peak away from the panel. The bare border is the hairline's width.
      const crossW = (t) => { const d = []; for (let n = h; n <= h + 12; n++) d.push(Math.abs(L(...at(t, n)) - Lin)); const pk = Math.max(...d); return pk < 6 ? 0 : d.filter((v) => v >= 0.5 * pk).length / k; };
      const widths = []; for (let t = which === "corner" ? geo.R + 1 : 0; t <= geo.reach; t += 1 / k) widths.push({ t: Math.round(t * 100) / 100, w: crossW(t) });
      // The hairline is one tone: the first device pixel inside it, on the bare border, is the panel's.
      const inner = Math.round(Math.abs(L(...at(bare, h + geo.bw * k)) - Lin));
      // The held line against the bare hairline, where the run starts (WCAG contrast of the two pixels).
      const heldRatio = Math.round(ratio(RGB(...at(geo.start + 1, h)), RGB(...at(bare, h))) * 100) / 100;
      out[name] = { h, bareAcross, midAcross, border: geo.border.slice(0, 3), Lh: Math.round(Lh), Lin: Math.round(Lin), full: Math.round(Math.abs(Lk - Lh)), start: prof[0].c, rise, step, plateau, end: prof[prof.length - 1].c, gap, prof, mass, mDrop: Math.round(mDrop * 1000) / 10, mRise: Math.round(mRise * 1000) / 10, mAt, widths, wBare: crossW(bare), inner, heldRatio };
    }
    // The corner's line through its curve: its width along the diagonal ray from the corner circle's centre,
    // read every half device pixel, CSS px.
    if (which === "corner") {
      const cxp = (geo.left + geo.R - clip.x) * k, cyp = (geo.bottom - geo.R - clip.y) * k, dx = -Math.SQRT1_2, dy = Math.SQRT1_2, Lin = lum(geo.panel), d = [];
      for (let q = (geo.R - 8) * k; q <= geo.R * k - 0.5; q += 0.5) d.push(Math.abs(L(cxp + q * dx, cyp + q * dy) - Lin));
      const pk = Math.max(...d); out.curveW = d.filter((v) => v >= 0.5 * pk).length * 0.5 / k;
    }
    return out;
  }, [png.toString("base64"), which, geo, clip, k, pad]);
}
// The rest mark at 1×, as a person sees it on an ordinary screen (the second review: faint at night): read
// across the arc on rays from its circle's centre, every 5° over its body, the peak contrast against the panel
// on each. Each must reach 95% of the rest ink's own contrast (--c-handle-ink-rest; a 1.8px stroke always has
// device pixels it covers whole), and the mirrored rays (either side of the
// diagonal) must read alike (within 10 levels): nothing over the corner dims one half.
async function runRestInk(scheme) {
  const V = "1440-" + scheme + "-1x-rest";
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: scheme, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const ev = (fn, arg) => page.evaluate(fn, arg);
  await page.goto(URL_); await page.waitForTimeout(700); await ev(install); await page.mouse.move(5, 5); await page.waitForTimeout(300);
  const geo = await ev(() => { const T = document.getElementById("panel"), b = T.getBoundingClientRect(), w = __k.gripWant("gripC"); return { left: b.left, bottom: b.bottom, R: w.R, r: w.r, sweep: w.sweep, panel: __k.bgOf(T), ink: __k.tokenColor("--c-handle-ink-rest") }; });
  const clip = { x: Math.floor(geo.left - 4), y: Math.floor(geo.bottom - geo.R - 8), width: Math.ceil(geo.R + 12), height: Math.ceil(geo.R + 12) };
  const png = await page.screenshot({ clip });
  const rays = await ev(async ([b64, geo, clip]) => {
    const img = new Image(); img.src = "data:image/png;base64," + b64; await img.decode();
    const cv = document.createElement("canvas"); cv.width = img.width; cv.height = img.height; const cx = cv.getContext("2d", { willReadFrequently: true }); cx.drawImage(img, 0, 0);
    const D = cx.getImageData(0, 0, cv.width, cv.height).data, W = cv.width;
    const L = (x, y) => { const i = (Math.round(y) * W + Math.round(x)) * 4; return 0.2126 * D[i] + 0.7152 * D[i + 1] + 0.0722 * D[i + 2]; }, lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    const ox = geo.left + geo.R - clip.x, oy = geo.bottom - geo.R - clip.y, Lp = lum(geo.panel), out = [];
    for (let a = -Math.floor(geo.sweep / 2 / 5) * 5; a <= geo.sweep / 2; a += 5) {
      const t = ((135 + a) * Math.PI) / 180; let peak = 0;
      for (let q = geo.r - 2.5; q <= geo.r + 2.5; q += 0.25) peak = Math.max(peak, Math.abs(L(ox + q * Math.cos(t) - 0.5, oy + q * Math.sin(t) - 0.5) - Lp));
      out.push({ a, peak: Math.round(peak) });
    }
    return { full: Math.round(Math.abs(lum(geo.ink) - Lp)), out };
  }, [png.toString("base64"), geo, clip]);
  let mirror = 0; for (const o of rays.out) { const m = rays.out.find((x) => x.a === -o.a); if (m) mirror = Math.max(mirror, Math.abs(o.peak - m.peak)); }
  const low = Math.min(...rays.out.map((o) => o.peak));
  ok(V, "the rest mark at 1×: every ray across its body reaches ≥ 95% of the rest ink's contrast, and either side of the diagonal reads alike (within 10 levels)", low >= 0.95 * rays.full && mirror <= 10, JSON.stringify({ full: rays.full, low, mirror, rays: rays.out.map((o) => o.a + "°:" + o.peak).join(" ") }));
  await ctx.close();
}
function inkVerdict(V, which, ink) {
  const edges = Object.fromEntries(Object.entries(ink).filter(([, e]) => e && e.prof));
  const [a, b] = Object.keys(edges), A = edges[a], B = edges[b];
  for (const [name, e] of Object.entries(edges)) {
    ok(V, "4 ink: the " + which + "'s " + name + " edge, read along its hairline's device line on the held frame: starts on the line carrying the stroke (≥ 40% of its contrast), falls to the hairline's own value with no rise, no plateau, no step over 6 levels from one device pixel to the next, and ends on it", e.start >= 0.4 * e.full && e.rise <= 3 && e.step <= 6 && e.plateau === null && e.end <= 3, JSON.stringify({ h: e.h, bareAcross: e.bareAcross, midAcross: e.midAcross, Lh: e.Lh, full: e.full, start: e.start, rise: e.rise, step: e.step, plateau: e.plateau, end: e.end, profile: e.prof.filter((_, i) => i % 4 === 0).map((p) => p.t + ":" + p.c).join(" ") }));
    ok(V, "4 ink: the " + which + "'s " + name + " edge: no panel colour between the hairline and the stroke anywhere along the run (one line, never a pair)", e.gap === null, JSON.stringify(e.gap));
  }
  for (const [name, e] of Object.entries(edges)) {
    ok(V, "4 ink: the " + which + "'s " + name + " edge at every device pixel through the junction and the run: the ink across the edge loses no more than 12% of its start over any 4 device px and never gains more than 3% (no kink where the curve meets the run)", e.mDrop <= 12 && e.mRise <= 3, JSON.stringify({ mDrop: e.mDrop + "%", at: e.mAt, mRise: e.mRise + "%", mass: e.mass.filter((_, i) => i < 24 || i % 6 === 0).map((m) => m.t + ":" + m.m).join(" ") }));
    ok(V, "6 ink: the " + which + "'s " + name + " edge, held: the line reads over the bare hairline where the run starts (WCAG contrast of the two pixels at least 2.5:1)", e.heldRatio >= 2.5, e.heldRatio + ":1");
    ok(V, "4 ink: the " + which + "'s " + name + " edge: the hairline is one tone (the device pixel inside it is the panel's own, within 4 levels)", e.inner <= 4, JSON.stringify({ inner: e.inner, bareAcross: e.bareAcross }));
  }
  if (which === "corner") {
    // Along each run while its ink still shows (its hairline at least 20% of the run's start).
    const seen = (e) => e.widths.filter((x) => { const pr = e.prof.find((q) => q.t >= x.t); return pr && pr.c >= 0.2 * e.start; });
    const runs = [...seen(A), ...seen(B)], off = Math.max(...runs.map((x) => Math.abs(x.w - ink.curveW)));
    ok(V, "4 ink: one stroke width through the corner and the runs: the width on the corner's curve, and the width all along both runs while their ink shows, within 0.25px of each other", runs.length > 0 && off <= 0.25, JSON.stringify({ curve: ink.curveW, off, foot: seen(A).filter((_, i) => i % 6 === 0).map((x) => x.t + ":" + x.w).join(" "), width: seen(B).filter((_, i) => i % 6 === 0).map((x) => x.t + ":" + x.w).join(" ") }));
  } else {
    const all = [...A.widths, ...B.widths].filter((x) => x.w > 0), wMax = Math.max(...all.map((x) => x.w)), wMin = Math.min(...all.map((x) => x.w));
    ok(V, "4 ink: the dock's line one row thick end to end: from its middle to both tips never more than 0.25px off the bare hairline's width", wMax - A.wBare <= 0.25 && A.wBare - wMin <= 0.25, JSON.stringify({ bare: A.wBare, max: wMax, min: wMin, centre: A.widths[0] }));
  }
  const n = Math.min(A.prof.length, B.prof.length);
  let max = 0, sum = 0; for (let i = 0; i < n; i++) { const d = Math.abs(A.prof[i].c - B.prof[i].c); max = Math.max(max, d); sum += d; }
  ok(V, "4 ink: the " + which + "'s " + a + " and " + b + " edges draw the same profile at the same distance (max 12 levels apart, mean 4)", max <= 12 && sum / n <= 4, "max " + max + ", mean " + Math.round((sum / n) * 10) / 10);
}

// The handle in the other engines (round 28): WebKit 27.2 (Safari's; it draws nothing from the `d` CSS
// property) and Firefox, the builds playwright-core 1.64 ships. Each proves the handle draws at rest, runs out
// on a drag as one line with the hairline (its transition on --grip-p, scrubbed at ½), and runs back on the
// let-go, by day and at night. A browser not installed is a FAIL naming the command that installs it
// (`node node_modules/playwright-core/cli.js install <name>`); FIREFOX=<path> points at another Firefox.
async function runEngine(name, scheme) {
  const V = "1440-" + scheme + "-" + name;
  const pw = await import(join(here, "../../node_modules/playwright-core/index.mjs"));
  const exe = (name === "firefox" && process.env.FIREFOX) || pw[name].executablePath();
  const { existsSync } = await import("node:fs");
  if (!existsSync(exe)) { ok(V, "the " + name + " build is installed", false, exe + " is missing: node node_modules/playwright-core/cli.js install " + name); return; }
  const wk = await pw[name].launch({ executablePath: exe, env: ENV });
  // At 2×, so the held frame's ink is read the same way as Chromium's (inkProfile).
  const page = await wk.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: scheme, deviceScaleFactor: 2 });
  const errors = []; page.on("pageerror", (e) => errors.push(String(e)));
  const ev = (fn, arg) => page.evaluate(fn, arg);
  await page.goto(URL_); await page.waitForTimeout(700); await ev(install);
  const read = () => ev(() => { const g = __k.grip(document.getElementById("gripC")), b = document.getElementById("panel").getBoundingClientRect(), p = __k.gripProfile(document.getElementById("gripC")); return { up: Math.round((b.bottom - g.box.top) * 100) / 100, right: Math.round((g.box.right - b.left) * 100) / 100, w: Math.round(g.wMax * 100) / 100, r: Math.round(g.r * 100) / 100, points: g.points, sym: p.sym, gap: p.gap, parallel: p.parallel, run: p.run, tip: p.tip, solid: p.solid, fill: g.fill.slice(0, 3), want: __k.gripWant("gripC") }; });
  await page.mouse.move(5, 5); await page.waitForTimeout(300);
  const rest = await read();
  const W = rest.want;
  ok(V, "the handle draws in " + name + " at rest: Apple's arc (r " + rest.r + "px, stroke " + rest.w + "px, " + rest.points + " points), one opaque fill, mirrored", rest.points === 2 * (2 * 48 + 17) + 16 && Math.abs(rest.r - W.r) <= 0.1 && Math.abs(rest.w - W.w) <= 0.05 && Math.abs(rest.up - rest.right) <= 0.1 && rest.up < W.R && rest.solid && rest.sym <= 0.02, JSON.stringify(rest));
  const c = await page.locator("#sashC").boundingBox(), x = c.x + c.width / 2, y = c.y + c.height / 2;
  await page.mouse.move(x, y); await page.waitForTimeout(300);
  // The press's change is made by its own attribute (what pointerdown sets) and its transition taken and paused in
  // the same task (WebKit dispatches transitionrun late enough to miss it), sought to ½, then let run; the real
  // press and drag then hold it.
  const half = await ev(async () => { const svg = document.getElementById("gripC"), panel = document.getElementById("panel"); panel.dataset.resizing = document.documentElement.dataset.resizing = "wh"; const a = svg.getAnimations().find((x) => x.transitionProperty === "--grip-p"); if (!a) return null; a.pause(); await a.ready; const t = a.effect.getTiming(); a.currentTime = t.duration / 4; a.currentTime = t.duration / 2; await new Promise((r) => requestAnimationFrame(r)); const g = __k.grip(svg), b = panel.getBoundingClientRect(), p = __k.gripProfile(svg); a.finish(); return { dur: t.duration, easing: t.easing, up: Math.round((b.bottom - g.box.top) * 100) / 100, right: Math.round((g.box.right - b.left) * 100) / 100, sym: p.sym, gap: p.gap, parallel: p.parallel }; });
  await page.mouse.down(); await page.mouse.move(x - 12, y + 9, { steps: 2 });
  await page.waitForTimeout(400);
  const held = await read();
  inkVerdict(V, "corner", await inkProfile(page, ev, "corner"));
  ok(V, name + " drag: one transition on --grip-p (240ms), at ½ the stroke part way out along both edges alike, one line with the hairline; held " + Math.round(W.runTo * 100) / 100 + "px each way, its tip on the hairline", !!half && half.dur === 240 && half.up > rest.up + 10 && half.up < W.runTo && Math.abs(half.up - half.right) <= 0.1 && half.sym <= 0.02 && half.gap < 2 && half.parallel <= W.B && Math.abs(held.up - W.runTo) <= 1 && Math.abs(held.right - W.runTo) <= 1 && Math.abs(held.tip[0] - 0.5) <= 0.05 && held.tip[1] <= 1.01, JSON.stringify({ half, held: { ...held, want: undefined } }));
  await page.mouse.up(); await page.mouse.move(5, 5); await page.waitForTimeout(500);
  const back = await read();
  ok(V, name + " let go: back to the rest arc", Math.abs(back.up - rest.up) <= 0.5 && errors.length === 0, JSON.stringify(back) + (errors.length ? " errors " + errors.join(" | ") : ""));
  await wk.close();
}

// One shape through every state (round 29): rest, the pointer on the grip, the press and drag, the let-go.
// At 1440 and 2× in Chromium, WebKit and Firefox, by day and at night, for the panel's corner and the dock's
// edge: each change between states is paused the moment its transition is created and sought through its own
// clock (the Web Animations API on the CSS transition, the engine-neutral face of the DevTools Animation
// domain's pause and seek) at 0, ¼, ½, ¾ and 1, the shape read off the path at each. At every fraction:
//   - one clock: the handle's one transition, on --grip-p, nothing else on the handle animating;
//   - one shape: one element in the handle paints (one path, one subpath, one fill), no second shade;
//   - the stroke's length (its centreline, run-outs and all) and its reach along the edges move one way only,
//     growing out to the pointer and the drag, shrinking on the let-go;
//   - its width never jumps more than 0.5px between neighbouring fractions, at its middle or its widest;
//   - it starts where the state before it stood (no jump at the change) and ends on the next state's shape.
// Then the captures for the review: rest | hover | drag | released, each a 2× crop of the corner and the dock's
// edge, and one sheet of the four (review-r29/, Chromium and WebKit).
async function runMorph(name, scheme) {
  const REVIEW = join(here, "review-r29");
  const V = "1440-" + scheme + "-" + name + "-morph";
  const pw = await import(join(here, "../../node_modules/playwright-core/index.mjs"));
  const { existsSync } = await import("node:fs");
  const exe = name === "chromium" ? CHROME : (name === "firefox" && process.env.FIREFOX) || pw[name].executablePath();
  if (!existsSync(exe)) { ok(V, "the " + name + " build is installed", false, exe + " is missing: node node_modules/playwright-core/cli.js install " + name); return; }
  const eng = name === "chromium" ? browser : await pw[name].launch({ executablePath: exe, env: ENV });
  const ctx = await eng.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: scheme, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors = []; page.on("pageerror", (e) => errors.push(String(e)));
  const ev = (fn, arg) => page.evaluate(fn, arg);
  await page.goto(URL_); await page.waitForTimeout(700); await ev(install);
  const tok = await ev(() => { const s = getComputedStyle(document.documentElement), t = (n) => s.getPropertyValue(n).trim(); return { control: parseFloat(t("--dur-control")), reveal: parseFloat(t("--dur-reveal")), exit: parseFloat(t("--dur-exit")), easeOut: t("--ease-out"), easeInOut: t("--ease-in-out"), hover: parseFloat(t("--c-grip-hover")) }; });
  // The handle as it stands: its progress, its shape off the path, what in it paints, what on it animates.
  const read = (id) => ev((id) => {
    const svg = document.getElementById(id), path = svg.querySelector(".handle-ink"), T = svg.closest(".tool"), b = T.getBoundingClientRect(), g = __k.grip(svg), pr = __k.gripProfile(svg), q = (n) => Math.round(n * 100) / 100;
    const painting = [...svg.querySelectorAll("path, rect, circle, ellipse, line, polyline, polygon, use, image, text")].filter((el) => { const cs = getComputedStyle(el), r = el.getBoundingClientRect(); return cs.display !== "none" && cs.visibility !== "hidden" && +cs.opacity > 0 && (cs.fill !== "none" || cs.stroke !== "none") && r.width > 0 && r.height > 0 && (el.tagName !== "path" || (el.getAttribute("d") || "").trim()); }).length;
    const subpaths = ((path.getAttribute("d") || "").match(/[Mm]/g) || []).length;
    const clocks = [svg, ...svg.querySelectorAll("*")].flatMap((el) => el.getAnimations()).map((a) => a.transitionProperty || "keyframes");
    const corner = id === "gripC";
    return { p: Math.round(parseFloat(getComputedStyle(path).getPropertyValue("--grip-p")) * 10000) / 10000, len: q(g.len), wMid: q(g.wMid), wMax: q(g.wMax), reach: corner ? q(b.bottom - g.box.top) : q((g.box.right - g.box.left) / 2), along: corner ? q(g.box.right - b.left) : q((g.box.right + g.box.left) / 2 - (b.left + b.width / 2)), ink: g.fill.slice(0, 3), painting, subpaths, clocks, sym: pr.sym, turn: pr.turn, solid: pr.solid, gap: pr.gap, body: g.mid.slice(g.runN, g.runN + GRIP_BODY + 1).map(([x, y]) => [x - b.left, y - b.top]) };
  }, id);
  // The change is made in the page by the state's own attribute (the one the real input sets: data-pointing is
  // the hover's own rule, data-resizing what a press sets, the let-go what a release does), and its transition
  // is taken and paused in the same task, before any frame of it is drawn: WebKit dispatches transitionrun
  // late enough that a short transition can be over before the event. The real pointer then lands on the same
  // state (each step reads it after the real input too).
  const change = (id, step) => ev(async ([id, step]) => {
    const svg = document.getElementById(id), owner = svg.closest(".tool"), corner = id === "gripC";
    if (step === "hover") owner.dataset.pointing = "";
    else if (step === "drag") { owner.dataset.resizing = document.documentElement.dataset.resizing = corner ? "wh" : "d"; }
    else if (step === "release") { delete owner.dataset.resizing; delete document.documentElement.dataset.resizing; letGo(owner); }
    else if (step === "leave") delete owner.dataset.pointing;
    const a = svg.getAnimations().find((x) => x.transitionProperty === "--grip-p");
    window.__held = a || null;
    if (!a) return null;
    a.pause(); await a.ready;
    const t = a.effect.getTiming();
    return { delay: t.delay, dur: t.duration, easing: t.easing };
  }, [id, step]);
  const scrub = async (id, step) => {
    const tm = await change(id, step);
    if (!tm) return null;
    const out = [];
    // (Firefox keeps the value it drew before the pause until the clock is moved: seek off 0 first.)
    await ev((at) => { window.__held.currentTime = at; }, tm.delay + tm.dur / 2);
    for (const f of [0, 0.25, 0.5, 0.75, 1]) { await ev(async (at) => { window.__held.currentTime = at; await new Promise((r) => requestAnimationFrame(r)); }, tm.delay + f * tm.dur); out.push({ f, ...(await read(id)) }); }
    await ev(() => { window.__held.finish(); window.__held = null; });
    return { ...tm, out };
  };
  const near = (a, b, t) => Math.abs(a - b) <= t;
  // The verdict on one change: from `from` (the state read before it) to `to` (read after it settles).
  const verdict = (which, label, s, from, to, dir, dur, easing) => {
    if (!s) { ok(V, which + " " + label + ": its transition on --grip-p ran", false, "no --grip-p transition caught"); return; }
    const o = s.out, mono = (k) => o.every((x, i) => !i || dir * (x[k] - o[i - 1][k]) >= -0.01);
    const dMid = Math.max(...o.slice(1).map((x, i) => Math.abs(x.wMid - o[i].wMid))), dMax = Math.max(...o.slice(1).map((x, i) => Math.abs(x.wMax - o[i].wMax)));
    const inkStep = Math.max(...o.slice(1).map((x, i) => Math.max(...x.ink.map((c, j) => Math.abs(c - o[i].ink[j])))));
    ok(V, which + " " + label + ": one clock (" + dur + "ms on " + easing + "), one path painting at every fraction, the stroke " + (dir > 0 ? "growing" : "shrinking") + " at every step (length and reach), its width never jumping more than 0.5px between neighbouring fractions, starting where the state before it stood and ending on the next",
      s.dur === dur && s.delay === 0 && s.easing === easing && o.every((x) => (x.f === 1 ? x.clocks.length <= 1 : x.clocks.length === 1) && x.clocks.every((k) => k === "--grip-p") && x.painting === 1 && x.subpaths === 1 && x.solid && x.sym <= 0.02 && x.turn <= 12) && mono("len") && mono("reach") && dir * (o[4].len - o[0].len) > 1 && dMid <= 0.5 && dMax <= 0.5 && near(o[0].len, from.len, 0.2) && near(o[0].wMid, from.wMid, 0.05) && near(o[0].reach, from.reach, 0.2) && near(o[4].len, to.len, 0.2) && near(o[4].wMid, to.wMid, 0.05) && near(o[4].p, to.p, 0.01),
      JSON.stringify({ dur: s.dur, easing: s.easing, widthStep: { mid: Math.round(dMid * 100) / 100, max: Math.round(dMax * 100) / 100 }, inkStep, from: { p: from.p, len: from.len, w: from.wMid, reach: from.reach }, to: { p: to.p, len: to.len, w: to.wMid, reach: to.reach }, at: o.map((x) => ({ f: x.f, p: x.p, len: x.len, reach: x.reach, wMid: x.wMid, wMax: x.wMax, ink: x.ink, painting: x.painting, subpaths: x.subpaths, clocks: x.clocks.join("+") })) }));
    console.log("SCRUB [" + V + "] " + which + " " + label + " — " + o.map((x) => "f" + x.f + ": p " + x.p + ", length " + x.len + "px, reach " + x.reach + "px, width " + x.wMid + "/" + x.wMax + "px, painting " + x.painting).join(" | "));
  };
  const grab = async (which) => {
    const c = await ev((which) => { const r = document.getElementById(which === "corner" ? "panel" : "dock").getBoundingClientRect(); return which === "corner" ? { x: Math.floor(r.left - 24), y: Math.floor(r.bottom - 156), width: 184, height: 180 } : { x: Math.floor(r.left + r.width / 2 - 92), y: Math.floor(r.top - 40), width: 184, height: 90 }; }, which);
    return page.screenshot({ clip: c });
  };
  const shots = {};
  const keep = name !== "firefox";
  const run = async (which, id, sashSel, drag) => {
    shots[which] = {};
    await page.mouse.move(5, 5); await page.waitForTimeout(400);
    const rest = await read(id);
    ok(V, which + " at rest: progress 0, Apple's stroke, one path painting, nothing animating", rest.p === 0 && rest.painting === 1 && rest.subpaths === 1 && rest.clocks.length === 0, JSON.stringify(rest));
    if (keep) shots[which].rest = await grab(which);
    const b = await page.locator(sashSel).boundingBox(), x = b.x + b.width / 2, y = b.y + b.height / 2;
    // The real input after each scrubbed change must land on the same state, with nothing left to move.
    const same = (label, a, z) => ok(V, which + " " + label + ": the real pointer lands on the state the scrub ended on, nothing moving", near(a.p, z.p, 0.0001) && near(a.len, z.len, 0.05) && near(a.wMid, z.wMid, 0.01) && z.clocks.length === 0, JSON.stringify({ scrubbed: { p: a.p, len: a.len, w: a.wMid }, real: { p: z.p, len: z.len, w: z.wMid, clocks: z.clocks } }));
    // Rest → hover; then the pointer comes onto the grip.
    const s1 = await scrub(id, "hover");
    const hover = await read(id);
    verdict(which, "rest → hover", s1, rest, hover, 1, tok.control, tok.easeOut);
    await page.mouse.move(x, y); await page.waitForTimeout(tok.control + 200);
    same("pointer on the grip", hover, await read(id));
    // The body (the rest mark's own centreline: the corner's arc, the dock's capsule) stands exactly where it stood.
    const moved = Math.max(...hover.body.map(([x, y], i) => Math.hypot(x - rest.body[i][0], y - rest.body[i][1])));
    ok(V, which + " hover: the " + (which === "corner" ? "arc" : "capsule") + " where it stood at rest (its centreline moved " + Math.round(moved * 1000) / 1000 + "px), Apple's width, only its ends grown into the start of the run (progress " + tok.hover + "), in the strong ink, nothing else drawn", moved <= 0.01 && near(hover.p, tok.hover, 0.001) && near(hover.wMid, rest.wMid, 0.05) && near(hover.wMax, rest.wMax, 0.05) && hover.len > rest.len + 4 && hover.reach > rest.reach + 4 && hover.painting === 1, JSON.stringify({ rest: { len: rest.len, reach: rest.reach, w: rest.wMid, ink: rest.ink }, hover: { len: hover.len, reach: hover.reach, w: hover.wMid, ink: hover.ink } }));
    if (keep) shots[which].hover = await grab(which);
    // Hover → drag; then the press and the drag itself.
    const s2 = await scrub(id, "drag");
    const held = await read(id);
    verdict(which, "hover → drag", s2, hover, held, 1, tok.reveal, tok.easeInOut);
    await page.mouse.down(); await page.mouse.move(x + drag[0], y + drag[1], { steps: 2 }); await page.waitForTimeout(200);
    same("pressed and dragged", held, await read(id));
    ok(V, which + " held: progress 1, the stroke on the border at the border's width, in the same ink as the hover", held.p === 1 && near(held.wMid, 1, 0.05) && held.ink.every((c, i) => Math.abs(c - hover.ink[i]) <= 1) && held.painting === 1, JSON.stringify({ p: held.p, w: held.wMid, ink: held.ink, hoverInk: hover.ink, reach: held.reach }));
    if (keep) shots[which].drag = await grab(which);
    // Drag → release, the pointer still on the grip: back to the hover's shape; then the button comes up.
    const s3 = await scrub(id, "release");
    const back = await read(id);
    verdict(which, "drag → release", s3, held, back, -1, tok.exit, tok.easeInOut);
    await page.mouse.up(); await page.waitForTimeout(tok.exit + 200);
    same("button up on the grip", back, await read(id));
    ok(V, which + " released with the pointer on the grip: the hover's shape again", near(back.p, tok.hover, 0.001) && near(back.len, hover.len, 0.2) && near(back.wMid, hover.wMid, 0.05), JSON.stringify({ back: { p: back.p, len: back.len, w: back.wMid }, hover: { p: hover.p, len: hover.len, w: hover.wMid } }));
    if (keep) shots[which].released = await grab(which);
    // The pointer leaves: hover → rest.
    await page.mouse.move(5, 5); await page.waitForTimeout(100);
    const s4 = await scrub(id, "leave");
    const after = await read(id);
    verdict(which, "hover → rest", s4, back, after, -1, tok.control, tok.easeOut);
    await page.waitForTimeout(tok.control + 100);
    same("pointer gone", after, await read(id));
    ok(V, which + " back at rest: the rest shape and ink exactly", after.p === 0 && near(after.len, rest.len, 0.05) && near(after.wMid, rest.wMid, 0.01) && after.ink.every((c, i) => Math.abs(c - rest.ink[i]) <= 1), JSON.stringify({ after: { len: after.len, w: after.wMid, ink: after.ink }, rest: { len: rest.len, w: rest.wMid, ink: rest.ink } }));
  };
  await run("corner", "gripC", "#sashC", [-12, 9]);
  await ev(() => { if (document.getElementById("dock").dataset.open !== "true") { const n = document.querySelector(".node:not(.kept)"); if (n) n.click(); } });
  await page.waitForTimeout(600);
  if (await page.locator("#sashD").isVisible()) await run("dock", "gripD", "#sashD", [0, -10]);
  else ok(V, "the dock stands for its morph", false, "no #sashD");
  ok(V, "no page errors", errors.length === 0, errors.join(" | "));
  if (keep) {
    mkdirSync(REVIEW, { recursive: true });
    const states = ["rest", "hover", "drag", "released"];
    for (const which of Object.keys(shots)) for (const st of states) if (shots[which][st]) writeFileSync(join(REVIEW, name + "-1440-" + scheme + "-" + which + "-" + st + ".png"), shots[which][st]);
    // The sheet: the four states in a row, the corner over the dock's edge, each labelled, on the page's ground.
    const sheet = await ev(async ([sh, states, title]) => {
      const load = async (b64) => { const i = new Image(); i.src = "data:image/png;base64," + b64; await i.decode(); return i; };
      // The labels in the page's body type at the crops' 2×, in the strong ink and the strong weight (the owner:
      // "barely readable lables").
      const probe = document.createElement("span"); probe.style.font = "var(--type-body)"; probe.style.color = "var(--ink-strong)"; probe.style.fontWeight = "var(--weight-strong)"; document.body.append(probe);
      const pcs = getComputedStyle(probe), body = parseFloat(pcs.fontSize), size = 2 * body, face = pcs.fontWeight + " " + size + "px " + pcs.fontFamily, ink = "rgb(" + __k.rgba(pcs.color).slice(0, 3).join(" ") + ")"; probe.remove();
      await document.fonts.load(face);
      const rows = Object.keys(sh), pad = 32, gap = 16, lab = Math.ceil(size * 1.6), imgs = {};
      for (const r of rows) for (const s of states) imgs[r + s] = await load(sh[r][s]);
      const cw = Math.max(...Object.values(imgs).map((i) => i.width)), rh = rows.map((r) => Math.max(...states.map((s) => imgs[r + s].height)));
      const cv = document.createElement("canvas"); cv.width = 2 * pad + states.length * cw + (states.length - 1) * gap; cv.height = 2 * pad + 2 * lab + rh.reduce((a, b) => a + b, 0) + (rows.length - 1) * gap;
      const cx = cv.getContext("2d"), cs = getComputedStyle(document.body);
      cx.fillStyle = cs.backgroundColor; cx.fillRect(0, 0, cv.width, cv.height);
      cx.fillStyle = ink; cx.font = face; cx.textBaseline = "alphabetic";
      cx.fillText(title, pad, pad + size);
      states.forEach((s, i) => cx.fillText(s, pad + i * (cw + gap), pad + lab + size));
      let y = pad + 2 * lab;
      rows.forEach((r, j) => { states.forEach((s, i) => cx.drawImage(imgs[r + s], pad + i * (cw + gap), y)); y += rh[j] + gap; });
      return { png: cv.toDataURL("image/png").split(",")[1], face, ink, body, ratio: Math.round(__k.ratio(__k.rgba(ink), __k.rgba(cs.backgroundColor)) * 100) / 100 };
    }, [Object.fromEntries(Object.entries(shots).map(([k, v]) => [k, Object.fromEntries(Object.entries(v).map(([s, b]) => [s, b.toString("base64")]))])), states, name + " · 1440 · " + scheme + " · 2×"]);
    writeFileSync(join(REVIEW, "sheet-" + name + "-1440-" + scheme + ".png"), Buffer.from(sheet.png, "base64"));
    ok(V, "the review sheet's labels are the page's body type at the crops' 2× (" + 2 * sheet.body + "px), the strong weight, the strong ink (" + sheet.ratio + ":1 on the sheet's ground)", sheet.face.startsWith("500 " + 2 * sheet.body + "px") && sheet.ratio >= 7, JSON.stringify({ face: sheet.face, ink: sheet.ink }));
  }
  await ctx.close();
  if (eng !== browser) await eng.close();
}

function same(a, b) { return a.length === b.length && a.every((x, i) => x === b[i]); }

function grepCheck() {
  const files = ["style.css", "app.js", "body.html"].map((f) => [f, readFileSync(join(here, f), "utf8")]);
  const find = (re) => files.flatMap(([f, s]) => s.split("\n").flatMap((line, i) => (re.test(line) ? [f + ":" + (i + 1)] : [])));
  const w600 = find(/font-weight:\s*600|weight-600|\b600\b.*font|font:\s*600/);
  ok("grep", "8 no font-weight 600", w600.length === 0, w600.join(", "));
  const grip = find(/\.grip\b|class="grip|grip-corner|gripCorner/);
  ok("grep", "8 no .grip, its SVG or its title", grip.length === 0, grip.join(", "));
  // Round 28: Safari and iPadOS draw nothing from the `d` CSS property (caniuse mdn-svg_elements_path_d_path),
  // so no shape is set or transitioned through it: the handle's path carries its shape in its attribute.
  const dProp = find(/(^|[;{\s])d:\s*(var\(|path\(|none)|transition:[^;]*\bd\s+var\(/);
  ok("grep", "3 no shape through the `d` CSS property (Safari and iPadOS do not draw it)", dProp.length === 0, dProp.join(", "));
  const band = find(/\.index\b|class="index|index-band|pinned|region > header|<header class="region/);
  ok("grep", "8 no index band or region headers", band.length === 0, band.join(", "));
  const showing = find(/Showing|Previewing|nowText|nowMode/);
  ok("grep", "8 no Showing line", showing.length === 0, showing.join(", "));
  const stack = find(/data-stack|placeDock|phone\(\)|width < 640px\)/);
  ok("grep", "9 stack mode and the old phone line are gone (one code path per class)", stack.length === 0, stack.join(", "));
  const selNone = find(/user-select:\s*none/);
  console.log("INFO [grep] user-select: none only on the lanes, the ruler and held drags: " + selNone.join(", "));
}
