// The round-29 proof for the design-graph mockup, read from the engine, never the picture: boxes, computed
// values and the animation clock. Motion is scrubbed, never filmed: in Chromium through the DevTools
// protocol's Animation domain (Animation.setPaused, Animation.seekAnimations), in WebKit through the same
// clock by document.getAnimations(), each animation paused and seeked to 0, ½ and 1 of its run.
//   node .mockups/design-graph/check.mjs        (CHROME=<path> to point at another Chromium)
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
const here = dirname(fileURLToPath(import.meta.url));
const pw = await import(join(here, "../../node_modules/playwright-core/index.mjs"));
const CHROME = process.env.CHROME || process.env.HOME + "/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome";
const URL_ = "file://" + join(here, "page.html");
let fails = 0, passes = 0;
const ok = (view, name, pass, detail = "") => { pass ? passes++ : fails++; console.log((pass ? "PASS" : "FAIL") + " [" + view + "] " + name + (detail ? " — " + detail : "")); };
const r1 = (n) => Math.round(n * 10) / 10;
const near = (a, b, tol = 1) => Math.abs(a - b) <= tol;
const boxNear = (a, b, tol = 1) => near(a.x, b.x, tol) && near(a.y, b.y, tol) && near(a.w, b.w, tol) && near(a.h, b.h, tol);

// ---- In-page helpers ----
function install() {
  const K = (window.__k = {});
  K.box = (el) => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; };
  // Contrast between two CSS colours (WCAG 2), each resolved on a 1px canvas.
  { const cv = document.createElement("canvas").getContext("2d", { willReadFrequently: true }); const rgba = (c) => { cv.clearRect(0, 0, 1, 1); cv.fillStyle = "#000"; cv.fillStyle = c; cv.fillRect(0, 0, 1, 1); return [...cv.getImageData(0, 0, 1, 1).data]; }; const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }, L = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]); K.ratio = (a, b) => { const x = L(rgba(a)), y = L(rgba(b)); return Math.round(((Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)) * 100) / 100; }; K.over = (...cs) => { cv.clearRect(0, 0, 1, 1); for (const c of cs) { cv.fillStyle = "#000"; cv.fillStyle = c; cv.fillRect(0, 0, 1, 1); } const d = cv.getImageData(0, 0, 1, 1).data; return "rgb(" + d[0] + ", " + d[1] + ", " + d[2] + ")"; }; }
  // A door's drawn box: its face's border box less the positive part of its clip-path inset (inset(t r b l)).
  K.drawn = (face) => {
    const r = face.getBoundingClientRect(), m = getComputedStyle(face).clipPath.match(/inset\(([^)]*)\)/);
    let [t, rt, b, l] = [0, 0, 0, 0];
    if (m) { const v = m[1].split(" round ")[0].trim().split(/\s+/).map(parseFloat); [t, rt, b, l] = [v[0], v[1] ?? v[0], v[2] ?? v[0], v[3] ?? v[1] ?? v[0]]; }
    // Where the inset is negative the clip lets the face's shadow draw that far out: that counts as drawn.
    return { left: r.left + l, right: r.right - rt, top: r.top + t, bottom: r.bottom - b };
  };
  // The real hit area: from the element's centre out along each axis, half a pixel at a time, while
  // elementFromPoint still lands on it (or inside it).
  K.hitSpan = (el) => {
    const b = el.getBoundingClientRect(), cx = b.left + b.width / 2, cy = b.top + b.height / 2;
    const on = (x, y) => { const t = document.elementFromPoint(x, y); return !!t && (t === el || el.contains(t)); };
    const name = (t) => (t ? (t.className && (t.className.baseVal ?? t.className)) || t.tagName : "nothing");
    if (!on(cx, cy)) return { covered: true, w: 0, h: 0, by: name(document.elementFromPoint(cx, cy)) };
    const by = [];
    const run = (dx, dy) => { let d = 0; while (d < 60 && on(cx + dx * (d + 0.5), cy + dy * (d + 0.5))) d += 0.5; if (d < 22) by.push(name(document.elementFromPoint(cx + dx * (d + 0.5), cy + dy * (d + 0.5)))); return d; };
    return { w: run(-1, 0) + run(1, 0), h: run(0, -1) + run(0, 1), by: [...new Set(by)].join("/") };
  };
  // The arc's drawn lengths (each leg's path) and its body, painted from the clock as it stands.
  K.arc = (id) => { window.__paintArcs(); const s = document.getElementById(id), len = (p) => (p.getAttribute("d") ? p.getTotalLength() : 0); return { a: len(s.querySelector('[data-leg="a"]')), b: len(s.querySelector('[data-leg="b"]')), body: s.querySelector(".arc-body").getAttribute("d"), color: getComputedStyle(s).color, state: s.dataset.state, node: s }; };
  K.color = (name) => { const p = document.createElement("span"); p.style.color = "var(" + name + ")"; document.body.append(p); const c = getComputedStyle(p).color; p.remove(); return c; };
  // Every running or paused animation on the page whose target matches, by WAAPI (the WebKit path).
  K.anims = (sel) => document.getAnimations().filter((a) => a.effect && a.effect.target && a.effect.target.matches && a.effect.target.matches(sel));
  K.seek = (sel, frac) => { for (const a of K.anims(sel)) { a.pause(); const t = a.effect.getComputedTiming(); a.currentTime = (t.delay || 0) + frac * t.duration; } };
  // Every box that takes a press or shows words, and the pairs that overlap where neither contains the other.
  K.overlaps = (root, sel) => {
    const els = [...root.querySelectorAll(sel)].filter((e) => { const r = e.getBoundingClientRect(), cs = getComputedStyle(e); return r.width > 0.5 && r.height > 0.5 && cs.visibility !== "hidden" && +cs.opacity > 0; });
    const out = [];
    for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
      const a = els[i], b = els[j];
      if (a.contains(b) || b.contains(a)) continue;
      const p = a.getBoundingClientRect(), q = b.getBoundingClientRect();
      if (Math.min(p.right, q.right) - Math.max(p.left, q.left) > 0.5 && Math.min(p.bottom, q.bottom) - Math.max(p.top, q.top) > 0.5) out.push((a.className.baseVal ?? a.className) + "|" + a.textContent.slice(0, 20) + " × " + (b.className.baseVal ?? b.className) + "|" + b.textContent.slice(0, 20));
    }
    return out;
  };
  // Text that spills its box (a scroll width past its client width) where nothing clips it on purpose.
  K.spills = (root) => [...root.querySelectorAll("*")].filter((e) => { const cs = getComputedStyle(e); if (cs.display === "none" || cs.textOverflow === "ellipsis" || e.closest("svg, .tok, .t-text-soft, .doors")) return false; return e.scrollWidth > e.clientWidth + 1 && cs.overflowX !== "visible" && !["auto", "scroll"].includes(cs.overflowX); }).map((e) => e.className + ":" + e.scrollWidth + ">" + e.clientWidth);
}

// The Animation domain in Chromium: every animation started after `arm()` is collected; seek pauses them all
// and sets each one's time to that fraction of its run (its delay included).
async function clock(page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Animation.enable");
  let list = [];
  cdp.on("Animation.animationStarted", (e) => list.push(e.animation));
  return {
    arm: () => { list = []; },
    // The document's clock stopped before an action, so every animation it starts stands at its first frame
    // until seeked (Animation.setPlaybackRate 0); thawed after.
    async freeze() { list = []; await cdp.send("Animation.setPlaybackRate", { playbackRate: 0 }); },
    async thaw() { await cdp.send("Animation.setPlaybackRate", { playbackRate: 1 }); for (const a of list) { try { await cdp.send("Animation.setPaused", { animations: [a.id], paused: false }); } catch {} } },
    names: () => list.map((a) => a.name),
    async seek(frac, filter = () => true) {
      // Started events arrive over the protocol a frame or two after the style change: wait until they stop.
      for (let n = -1, still = 0; still < 2; ) { await frame(page); if (list.length === n) still++; else { still = 0; n = list.length; } }
      // The newest animation per node and property (a retargeted transition replaces the one before it).
      const latest = new Map();
      for (const a of list) latest.set((a.source && a.source.backendNodeId) + "|" + a.name + "|" + a.type, a);
      const as = [...latest.values()].filter(filter);
      if (!as.length) return 0;
      for (const a of as) { try { await cdp.send("Animation.setPaused", { animations: [a.id], paused: true }); await cdp.send("Animation.seekAnimations", { animations: [a.id], currentTime: (a.source.delay || 0) + frac * a.source.duration }); } catch {} }
      return as.length;
    },
    async release() { for (const a of list) { try { await cdp.send("Animation.setPaused", { animations: [a.id], paused: false }); } catch {} } },
    list: () => list,
  };
}
const frame = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

async function openPage(browser, w, h, scheme = "light") {
  const page = await browser.newPage({ viewport: { width: w, height: h }, colorScheme: scheme });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto(URL_); await page.waitForTimeout(700); await page.evaluate(install);
  return { page, errors, ev: (fn, arg) => page.evaluate(fn, arg) };
}

// ---- Desk, Chromium: the motion, scrubbed on the Animation domain ----
async function deskMotion(browser, scheme) {
  const V = "1440-" + scheme + "-chromium";
  const { page, errors, ev } = await openPage(browser, 1440, 900, scheme);
  const C = await clock(page);
  const ink = await ev(() => ({ rest: __k.color("--border-row-outline"), muted: __k.color("--ink-muted"), strong: __k.color("--ink-strong"), coral: __k.color("--brand-solid"), edgeChosen: __k.color("--c-graph-edge-chosen") }));

  // A. The arc: reach on hover, sweep on drag, retract on release. One element throughout.
  await page.mouse.move(700, 300); await frame(page);
  const rest = await ev(() => { const a = __k.arc("arcP"); window.__arcNode = a.node; window.__arcBody = a.node.querySelector(".arc-body"); return { ...a, node: undefined }; });
  ok(V, "the arc at rest: its body alone, no legs, in the 3:1 edge ink", rest.a < 0.1 && rest.b < 0.1 && !!rest.body && rest.color === ink.rest, JSON.stringify({ a: rest.a, b: rest.b, color: rest.color }));
  const sw = await ev(() => __k.box(document.getElementById("sashW")));
  const px0 = sw.x + sw.w / 2, py0 = sw.y + sw.h / 2;
  await C.freeze();
  await page.mouse.move(px0, py0); await frame(page);
  const reachT = await ev(() => { const s = document.getElementById("arcP"); return { want: parseFloat(s.style.getPropertyValue("--reach-a")), state: s.dataset.state }; });
  const reach = [];
  for (const f of [0, 0.5, 1]) { await C.seek(f, (a) => a.name === "--reach-a" || a.name === "color" || a.name === "stroke-width"); reach.push(await ev(() => { const a = __k.arc("arcP"); return { a: a.a, color: a.color, same: a.node === window.__arcNode && a.node.querySelector(".arc-body") === window.__arcBody, body: a.body }; })); }
  const reachAnim = C.list().find((a) => a.name === "--reach-a");
  ok(V, "reach: one transition on the leg's reach (" + (reachAnim && reachAnim.source.duration) + "ms, --dur-control), the leg runs up the hovered edge 0 → ½ → whole, to 24px past the pointer", !!reachAnim && reachAnim.source.duration === 120 && reachT.state === "reach" && reach[0].a < 0.5 && reach[1].a > reach[0].a + 5 && near(reach[2].a, reachT.want, 1.5), JSON.stringify(reach.map((x) => r1(x.a))) + " want " + r1(reachT.want));
  ok(V, "reach: the same arc element and the same body path at 0, ½ and 1 (one object)", reach.every((x) => x.same && x.body === rest.body));
  ok(V, "reach: its ink steps from the edge ink to the strong ink", reach[0].color === ink.rest && reach[2].color === ink.strong, reach.map((x) => x.color).join(" → "));
  // Review fix 7: the reach reads at a glance: 3px (three times the panel's 1px edge) in the strong ink, held
  // well apart from the edge's own ink and the raised surface by contrast.
  const glance = await ev(() => {
    const cv = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
    const rgba = (css) => { cv.clearRect(0, 0, 1, 1); cv.fillStyle = "#000"; cv.fillStyle = css; cv.fillRect(0, 0, 1, 1); return [...cv.getImageData(0, 0, 1, 1).data]; };
    const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }, L = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
    const ratio = (a, b) => { const x = L(rgba(a)), y = L(rgba(b)); return Math.round(((Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)) * 100) / 100; };
    const leg = document.querySelector('#arcP [data-leg="a"]'), shell = getComputedStyle(document.getElementById("shell"));
    return { width: getComputedStyle(leg).strokeWidth, border: shell.borderLeftWidth, vsBorder: ratio(getComputedStyle(document.getElementById("arcP")).color, shell.borderLeftColor), vsRaised: ratio(getComputedStyle(document.getElementById("arcP")).color, shell.backgroundColor) };
  });
  ok(V, "fix 7: the reach is 3px against the panel's 1px edge, its ink " + glance.vsBorder + ":1 against that edge's ink and " + glance.vsRaised + ":1 on the panel", glance.width === "3px" && glance.border === "1px" && glance.vsBorder >= 4.5 && glance.vsRaised >= 7, JSON.stringify(glance));
  await C.thaw(); await page.waitForTimeout(250);
  // Follow: the reach rides the pointer on the ghost's glide.
  await C.freeze();
  await page.mouse.move(px0, py0 - 120); await frame(page);
  const follow = C.list().find((a) => a.name === "--reach-a");
  ok(V, "follow: the reach follows the pointer along the edge over --dur-ghost (80ms) on ease-in-out", !!follow && follow.source.duration === 80, follow ? follow.source.duration + "ms " + follow.source.easing : "no transition");
  await C.thaw(); await page.waitForTimeout(200);
  const hoverA = (await ev(() => __k.arc("arcP").a));
  // Sweep.
  await C.freeze();
  await page.mouse.down(); await page.mouse.move(px0 - 10, py0 - 120, { steps: 2 }); await frame(page);
  const full = await ev(() => { const p = document.getElementById("panel"), R = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--radius-panel")); return p.offsetHeight - 2 * R; });
  const sweep = [];
  for (const f of [0, 0.5, 1]) { await C.seek(f, (a) => /^--(sweep|reach)-a$|^color$/.test(a.name)); sweep.push(await ev(() => { const a = __k.arc("arcP"); return { a: a.a, color: a.color, same: a.node === window.__arcNode && a.node.querySelector(".arc-body") === window.__arcBody, body: a.body }; })); }
  const sweepAnim = C.list().find((a) => a.name === "--sweep-a");
  ok(V, "drag: the run sweeps the whole edge over --dur-pop (" + (sweepAnim && sweepAnim.source.duration) + "ms) from where the reach stood, 0 → ½ → the edge's length", !!sweepAnim && sweepAnim.source.duration === 260 && near(sweep[0].a, hoverA, 2) && sweep[1].a > sweep[0].a + 20 && sweep[2].a >= full - 1, JSON.stringify(sweep.map((x) => r1(x.a))) + " edge " + r1(full));
  ok(V, "drag: its ink to coral (The Coral Is Where You Act Rule); the same arc and body throughout", sweep[2].color === ink.coral && sweep.every((x) => x.same && x.body === rest.body), sweep.map((x) => x.color).join(" → "));
  await C.thaw(); await page.waitForTimeout(350);
  // Release with the pointer still on the edge (it follows the pointer 1:1): the run retracts to the reach;
  // the pointer leaving retracts it into the arc. Both over --dur-exit.
  await C.freeze();
  await page.mouse.up(); await frame(page);
  const settle = [];
  for (const f of [0, 0.5, 1]) { await C.seek(f, (a) => /^--(sweep|reach)-a$|^color$/.test(a.name)); settle.push(await ev(() => { const a = __k.arc("arcP"); return { a: a.a, same: a.node === window.__arcNode, state: a.node.dataset.state }; })); }
  const back = C.list().find((a) => a.name === "--sweep-a");
  ok(V, "release on the edge: the run retracts from the whole edge to the reach over --dur-exit (" + (back && back.source.duration) + "ms)", !!back && back.source.duration === 160 && settle[0].a >= full - 1 && settle[1].a < settle[0].a - 20 && near(settle[2].a, hoverA, 2) && settle.every((x) => x.same), JSON.stringify(settle.map((x) => r1(x.a))));
  await C.thaw(); await page.waitForTimeout(300);
  await C.freeze();
  await page.mouse.move(700, 300); await frame(page);
  const retract = [];
  for (const f of [0, 0.5, 1]) { await C.seek(f, (a) => /^--(sweep|reach)-a$|^color$/.test(a.name)); retract.push(await ev(() => { const a = __k.arc("arcP"); return { a: a.a, color: a.color, same: a.node === window.__arcNode }; })); }
  const leave = C.list().find((a) => a.name === "--reach-a");
  ok(V, "the pointer leaves: the reach retracts into the arc over --dur-exit (" + (leave && leave.source.duration) + "ms), the ink back to the edge ink", !!leave && leave.source.duration === 160 && retract[0].a > retract[1].a && retract[2].a < 0.5 && retract[2].color === ink.rest && retract.every((x) => x.same), JSON.stringify(retract.map((x) => r1(x.a))));
  await C.thaw(); await page.waitForTimeout(300);
  // The dock's arc: at its top-trailing corner, its top edge's leg reaches.
  const dockArc = await ev(() => { const d = document.getElementById("dock").getBoundingClientRect(), s = document.getElementById("arcD").getBoundingClientRect(), p = document.getElementById("panel").getBoundingClientRect(), a = document.getElementById("arcP").getBoundingClientRect(); return { dockCorner: [d.right, d.top], arcD: [s.left, s.top, s.right, s.bottom], panelCorner: [p.left, p.bottom], arcP: [a.left, a.top, a.right, a.bottom] }; });
  ok(V, "the arcs stand in the two corners that face the open field: the panel's bottom-leading, the dock's top-trailing", dockArc.arcD[2] <= dockArc.dockCorner[0] + 0.5 && dockArc.arcD[1] >= dockArc.dockCorner[1] - 0.5 && dockArc.arcD[0] > dockArc.dockCorner[0] - 20 && dockArc.arcP[0] >= dockArc.panelCorner[0] - 0.5 && dockArc.arcP[3] <= dockArc.panelCorner[1] + 0.5, JSON.stringify(dockArc));

  // Keyboard: the corner is a separator; arrows move 16px, instant.
  const w0 = await ev(() => document.getElementById("panel").offsetWidth);
  await ev(() => document.getElementById("sashC").focus());
  await page.keyboard.press("ArrowLeft");
  const w1 = await ev(() => ({ w: document.getElementById("panel").offsetWidth, role: document.getElementById("sashC").getAttribute("role"), now: document.getElementById("sashC").getAttribute("aria-valuenow") }));
  ok(V, "keyboard: the corner is a focusable separator; ArrowLeft widens the panel 16px at once", w1.role === "separator" && w1.w === w0 + 16, JSON.stringify({ w0, ...w1 }));
  // Double-press restores the default size.
  const c = await ev(() => __k.box(document.getElementById("sashC")));
  await page.mouse.dblclick(c.x + c.w / 2, c.y + c.h / 2); await page.waitForTimeout(500);
  const w2 = await ev(() => ({ w: document.getElementById("panel").offsetWidth, inline: document.documentElement.style.getPropertyValue("--panel-w") }));
  ok(V, "double-press on the corner restores the default width", w2.w === 448 && !w2.inline, JSON.stringify(w2));
  await page.mouse.move(700, 300); await page.waitForTimeout(300);

  // C. A clip's controls open in its row (the review bar's first answer) or in the dock's inspector (its
  // second): never a dialog over the page.
  const src = await ev(() => { const f = document.querySelector('.clip[data-key="label"] .fact-dur'); return __k.box(f); });
  await page.mouse.click(src.x + src.w / 2, src.y + src.h / 2); await page.waitForTimeout(350);
  const inRow = await ev(() => { const c = document.querySelector(".ctl"); return c && { inRow: c.parentElement.matches('.clip[data-key="label"]'), role: c.getAttribute("role"), dialogs: document.querySelectorAll('[role="dialog"]').length, wash: c.parentElement.hasAttribute("data-chosen"), span: getComputedStyle(c).gridColumnStart + "/" + getComputedStyle(c).gridColumnEnd }; });
  ok(V, "controls in the row: the clip's own row holds them across both columns, inside its chosen wash; no dialog", !!inRow && inRow.inRow && inRow.role === "region" && inRow.dialogs === 0 && inRow.wash && inRow.span === "1/-1", JSON.stringify(inRow));
  // Its contents: a slider with token detents, the curve's list and its editor.
  const contents = await ev(() => ({ ticks: document.querySelectorAll(".ctl .dtick").length, on: document.querySelector(".ctl .dname[data-on]")?.textContent, segs: [...document.querySelectorAll('.ctl #curveList [role="radio"]')].map((t) => t.textContent), group: document.querySelector(".ctl #curveList")?.getAttribute("role"), chosen: document.querySelector('.ctl #curveList [aria-checked="true"]')?.dataset.curve, editor: !!document.querySelector(".ctl .ceditor .curve"), knobs: document.querySelectorAll(".ctl .ceditor .knob").length }));
  ok(V, "the controls hold the duration slider (a detent per --dur-* token, on 'fade'), the curve as a list past four segments (a radio group: 4 house curves, Spring, Custom) and the large curve with its handles", contents.ticks >= 14 && contents.on === "fade" && contents.segs.length === 6 && contents.group === "radiogroup" && contents.chosen === "--ease-crossfade" && contents.editor && contents.knobs === 2, JSON.stringify(contents));
  // A detent: the thumb snaps to --dur-pop within 6px; the row's badge says "pop"; the stage replays.
  const sl = await ev(() => { const s = document.querySelector(".ctl .dslider"), b = s.getBoundingClientRect(), max = +s.dataset.max; return { x: b.left + (263 / max) * b.width, y: b.top + 10 }; });
  await page.mouse.move(sl.x, sl.y); await page.mouse.down(); await page.mouse.up(); await page.waitForTimeout(400);
  const snapped = await ev(() => ({ dur: document.querySelector('.clip[data-key="label"] .fact-dur .fig').textContent, badge: document.querySelector('.clip[data-key="label"] .tok').hasAttribute("data-on") ? document.querySelector('.clip[data-key="label"] .tok .badge').textContent : null, still: !!document.querySelector('.clip[data-key="label"] > .ctl') }));
  ok(V, "the slider snaps a value 3ms off --dur-pop onto it; the row reads 260 ms with the 'pop' badge, the controls still in it", snapped.dur.startsWith("260") && snapped.badge === "pop" && snapped.still, JSON.stringify(snapped));
  // Off a detent the badge leaves (reflow pop): it folds over --dur-exit.
  const sl2 = await ev(() => { const s = document.querySelector(".ctl .dslider"), b = s.getBoundingClientRect(), max = +s.dataset.max; return { x: b.left + (300 / max) * b.width, y: b.top + 10 }; });
  await C.freeze();
  await page.mouse.move(sl2.x, sl2.y); await page.mouse.down(); await page.mouse.up(); await frame(page);
  const tokGo = C.list().filter((a) => a.name === "grid-template-columns");
  await C.seek(0);
  ok(V, "off a detent the badge leaves, its track folding over --dur-exit", tokGo.length >= 1 && tokGo.some((a) => a.source.duration === 160), tokGo.map((a) => a.source.duration).join(","));
  await C.thaw(); await page.waitForTimeout(400);
  // Spring: every parameter a figure that takes any value; then Custom.
  await page.click('.ctl #curveList [data-curve="spring"]'); await page.waitForTimeout(300);
  const spring = await ev(() => ({ word: document.querySelector('.clip[data-key="label"] .fact-curve .word').textContent, label: document.querySelector(".ctl .ctl-len .ctl-label span").textContent, fields: [...document.querySelectorAll(".ctl .ctl-spring input:not([type=range])")].map((i) => i.dataset.f), slider: !!document.querySelector('.ctl input[type="range"][data-f="bounce"]') }));
  ok(V, "Spring: the row's curve reads 'spring … · 0 bounce', the length is its Response, Bounce a slider and a figure, then mass, stiffness, damping and velocity", /^spring .*0 bounce$/.test(spring.word) && spring.label === "Response" && spring.slider && spring.fields.join() === "bounce,mass,stiffness,damping,velocity", JSON.stringify(spring));
  const bIn = page.locator('.ctl input[data-f="bounce"]:not([type=range])'); await bIn.click(); await bIn.fill("0.37"); await bIn.press("Enter"); await page.waitForTimeout(300);
  const off = await ev(() => document.querySelector('.clip[data-key="label"] .fact-curve .word').textContent);
  ok(V, "the bounce figure takes 0.37, off the slider's steps", /0\.37 bounce$/.test(off), off);
  await page.click('.ctl #curveList [data-curve="custom"]'); await page.waitForTimeout(300);
  const custom = await ev(() => ({ word: document.querySelector('.clip[data-key="label"] .fact-curve .word').textContent, bez: document.querySelector('.ctl input[data-f="bez"]')?.value }));
  ok(V, "Custom: the curve's numbers, editable", custom.word === "custom" && /,/.test(custom.bez || ""), JSON.stringify(custom));
  // The inspector: the same controls beside the timeline, the clip's line its head.
  await page.click('#ctlChoice [data-ctl="inspector"]'); await page.waitForTimeout(350);
  const insp = await ev(() => { const c = document.querySelector(".ctl"), i = document.getElementById("insp"), t = document.getElementById("tl"); return c && { inInsp: c.parentElement === i, dialogs: document.querySelectorAll('[role="dialog"]').length, beside: i.getBoundingClientRect().left >= t.getBoundingClientRect().right, w: Math.round(i.getBoundingClientRect().width), head: c.querySelector(".ctl-head p")?.textContent }; });
  ok(V, "controls in an inspector: a 296px column beside the timeline, headed by the clip's line; no dialog", !!insp && insp.inInsp && insp.dialogs === 0 && insp.beside && insp.w === 296 && /^Button label/.test(insp.head || ""), JSON.stringify(insp));
  await page.click('#ctlChoice [data-ctl="row"]'); await page.waitForTimeout(300);
  // Close: Esc closes them at once, the timeline whole again.
  await page.keyboard.press("Escape"); await page.waitForTimeout(200);
  ok(V, "Esc closes the controls; the inspector's column goes", await ev(() => !document.querySelector(".ctl") && !document.getElementById("dock").hasAttribute("data-insp")));
  // Leave the move as the agent wrote it for what follows.
  await ev(() => document.getElementById("resetAll")?.click()); await page.waitForTimeout(300);

  // D. Hide folds the panel into the tucked tab; Show grows it back.
  const panelBox = await ev(() => __k.box(document.getElementById("panel")));
  await C.freeze();
  await page.click("#hide"); await frame(page);
  const hide = [];
  for (const f of [0, 0.5, 1]) { await C.seek(f); hide.push(await ev(() => ({ shell: __k.box(document.getElementById("shell")), glyph: +getComputedStyle(document.querySelector(".tab-glyph")).opacity, toolbar: +getComputedStyle(document.querySelector(".toolbar")).opacity }))); }
  const hideAnim = C.list().find((a) => a.name === "top" || a.name === "inset-block-start");
  ok(V, "Hide: one box, the shell, from the panel's rect (0) to a 36px tab flush to the screen's trailing edge (1), ½ between", boxNear(hide[0].shell, panelBox, 1) && near(hide[2].shell.w, 36, 0.5) && near(hide[2].shell.h, 36, 0.5) && near(hide[2].shell.x + hide[2].shell.w, 1440, 0.5) && hide[1].shell.w < panelBox.w - 20 && hide[1].shell.w > 40, JSON.stringify(hide.map((s) => [r1(s.shell.x), r1(s.shell.y), r1(s.shell.w), r1(s.shell.h)])));
  ok(V, "Hide: over --dur-panel (" + (hideAnim && hideAnim.source.duration) + "ms) on the drawer curve; contents gone by the end, the graph's glyph in over the last 120ms", !!hideAnim && hideAnim.source.duration === 280 && hide[2].toolbar === 0 && hide[0].glyph === 0 && hide[2].glyph === 1, JSON.stringify(hide.map((s) => [s.toolbar, s.glyph])));
  await C.thaw(); await page.waitForTimeout(400);
  const tab = await ev(() => { const s = document.getElementById("shell"), cs = getComputedStyle(s); return { label: s.getAttribute("aria-label"), tabIndex: s.tabIndex, edge: cs.borderRightWidth, rTop: cs.borderTopRightRadius, lTop: cs.borderTopLeftRadius, hideCentre: document.getElementById("hide").getBoundingClientRect().top + 15, y: s.getBoundingClientRect().top + 18, inert: document.querySelector(".toolbar").inert }; });
  ok(V, "the tab is Show: square and edgeless on the screen side, round inside, at the head's height; the panel's contents inert", tab.label === "Show graph" && tab.tabIndex === 0 && tab.edge === "0px" && tab.rTop === "0px" && tab.lTop !== "0px" && near(tab.y, tab.hideCentre, 1) && tab.inert, JSON.stringify(tab));
  const dockAfter = await ev(() => __k.box(document.getElementById("dock")));
  ok(V, "Hide moves nothing else on the page (the dock stands where it stood)", dockAfter.w > 0, JSON.stringify(dockAfter));
  await C.freeze();
  await page.click("#shell"); await frame(page);
  const show = [];
  for (const f of [0, 0.5, 1]) { await C.seek(f); show.push(await ev(() => ({ shell: __k.box(document.getElementById("shell")), toolbar: +getComputedStyle(document.querySelector(".toolbar")).opacity }))); }
  ok(V, "Show: the tab's box grows back to the panel's (0 tab, ½ between, 1 the panel); contents in over the second half", near(show[0].shell.w, 36, 0.5) && show[1].shell.w > 40 && boxNear(show[2].shell, panelBox, 1) && show[0].toolbar === 0 && show[2].toolbar === 1, JSON.stringify(show.map((s) => [r1(s.shell.x), r1(s.shell.w), s.toolbar])));
  await C.thaw(); await page.waitForTimeout(400);
  // A Show caught mid-Hide turns back from where the box is drawn.
  // The clock held at half way through the Hide, so the press lands mid-flight on every engine and machine.
  await C.freeze();
  await page.click("#hide"); await frame(page);
  await C.seek(0.5);
  const mid = await ev(() => __k.box(document.getElementById("shell")).w);
  const sb = await ev(() => __k.box(document.getElementById("shell")));
  await page.mouse.click(sb.x + sb.w / 2, sb.y + Math.min(sb.h / 2, 18)); await frame(page);
  await C.seek(0);
  const turn = await ev(() => __k.box(document.getElementById("shell")).w);
  ok(V, "a Show caught mid-Hide turns back from where the box stands (no jump to the panel or the tab)", turn <= mid + 1 && turn > 37 && turn < panelBox.w - 10, "drawn " + r1(mid) + " at half the Hide, then " + r1(turn) + " where the Show began");
  await C.thaw(); await page.waitForTimeout(500);
  // A keyboard toggle is instant.
  await page.mouse.click(700, 120); await page.keyboard.press("h"); await frame(page);
  const keyed = await ev(() => ({ w: __k.box(document.getElementById("shell")).w, anims: document.getAnimations().filter((a) => a.effect.target && a.effect.target.id === "shell").length }));
  ok(V, "H toggles at once: the tab drawn in the same frame, no animation", near(keyed.w, 36, 0.5) && keyed.anims === 0, JSON.stringify(keyed));
  await page.keyboard.press("h"); await page.waitForTimeout(400);

  // E. Doorways: a region wholly out of view has a door; in view, none.
  const doorsAt = await ev(() => { const g = document.querySelector(".gsec[data-current] .graph"), gb = g.getBoundingClientRect(); return [...g.querySelectorAll(".region")].map((r) => { const b = r.getBoundingClientRect(), d = g.parentNode.querySelector('.door[data-machine="' + r.dataset.machine + '"]'); const out = b.bottom <= gb.top + 1 || b.top >= gb.bottom - 1 || b.right <= gb.left + 1 || b.left >= gb.right - 1; return { m: r.dataset.machine, out, door: d.hasAttribute("data-on"), edge: d.dataset.edge }; }); });
  ok(V, "doorways: every region wholly out of view has its door at the view's edge, none in view has one", doorsAt.every((x) => x.out === x.door) && doorsAt.some((x) => x.door), JSON.stringify(doorsAt));
  // A door's press pans the view until its region fits, over --dur-panel on ease-in-out; its door goes.
  const target = doorsAt.find((x) => x.door);
  await C.freeze();
  await page.click('.gsec[data-current] .door[data-machine="' + target.m + '"]'); await frame(page);
  await C.seek(0, (a) => a.type === "WebAnimation");
  const pan = C.list().find((a) => a.type === "WebAnimation");
  const doorsSeek = [];
  await C.thaw(); await page.waitForTimeout(450);
  const afterPan = await ev((m) => { const g = document.querySelector(".gsec[data-current] .graph"), gb = g.getBoundingClientRect(), r = g.querySelector('.region[data-machine="' + m + '"]').getBoundingClientRect(), d = g.parentNode.querySelector('.door[data-machine="' + m + '"]'); return { inView: r.top >= gb.top - 1 && r.bottom <= gb.bottom + 1, door: d.hasAttribute("data-on") }; }, target.m);
  ok(V, "a door's press pans its region into view over --dur-panel (" + (pan && pan.source.duration) + "ms); its door goes", !!pan && pan.source.duration === 280 && afterPan.inView && !afterPan.door, JSON.stringify({ pan: pan && [pan.name, pan.source.easing], ...afterPan }));
  // The door's own fade, scrubbed: a region leaving the view brings its door in over --dur-fade, 4px from the edge.
  await C.freeze();
  await ev(() => { const g = document.querySelector(".gsec[data-current] .graph"); g.scrollTop = g.scrollHeight; g.dispatchEvent(new Event("scroll")); }); await frame(page);
  const enters = (a) => (a.name === "opacity" || a.name === "translate" || a.name === "clip-path") && Math.round(a.source.duration) === 200;
  for (const f of [0, 0.5, 1]) { await C.seek(f, enters); doorsSeek.push(await ev(() => { const d = document.querySelector(".gsec[data-current] .door[data-on] .door-face"); if (!d) return null; const cs = getComputedStyle(d); return { o: +cs.opacity, t: cs.translate, clip: cs.clipPath }; })); }
  ok(V, "a door's face comes in over --dur-fade (200ms): opacity 0 → ½ → 1, sliding 4px in from its edge, its clip on the same clock", !!doorsSeek[0] && doorsSeek[0].o < 0.01 && /-?3\.99|-?4px/.test(doorsSeek[0].t) && doorsSeek[1].o > 0 && doorsSeek[1].o < 1 && doorsSeek[2].o === 1 && (doorsSeek[2].t === "none" || /^0px/.test(doorsSeek[2].t)) && C.list().some(enters), JSON.stringify(doorsSeek));
  await C.thaw(); await page.waitForTimeout(300);
  // Pinned names: a slab running on under the view's top names itself there.
  const pin = await ev(() => { const g = document.querySelector(".gsec[data-current] .graph"), gb = g.getBoundingClientRect(); const r = [...g.querySelectorAll(".region")].find((x) => { const b = x.getBoundingClientRect(); return b.top < gb.top && b.bottom > gb.top + 60; }); if (!r) return { none: true }; const h = r.querySelector(".region-head").getBoundingClientRect(); return { m: r.dataset.machine, pinned: r.querySelector(".region-head").hasAttribute("data-pinned"), top: h.top - gb.top }; });
  ok(V, "a slab whose top has left the view pins its name to the view's top (under a door that stands over it)", pin.none || (pin.pinned && pin.top >= 0 && pin.top <= 28 + 2 * 4 + 1), JSON.stringify(pin));

  // F. Edges: 1.5px orthogonal runs, an open chevron, no dashes; the chosen in coral; the playback dash.
  const edges = await ev(() => [...document.querySelectorAll(".gsec[data-current] .edge")].map((e) => { const pts = e.dataset.points.split(" ").map((q) => q.split(",").map(Number)); const ortho = pts.slice(1).every((p, i) => Math.abs(p[0] - pts[i][0]) < 0.01 || Math.abs(p[1] - pts[i][1]) < 0.01); const line = getComputedStyle(e.querySelector(".line")); return { ortho, w: line.strokeWidth, dash: line.strokeDasharray, head: getComputedStyle(e.querySelector(".head")).fill, chosen: e.classList.contains("chosen"), color: getComputedStyle(e).color }; }));
  ok(V, "edges: every run orthogonal, 1.5px, no dashes, an open (unfilled) chevron head", edges.every((e) => e.ortho && e.w === "1.5px" && e.dash === "none" && e.head === "none"), JSON.stringify(edges.filter((e) => !(e.ortho && e.w === "1.5px" && e.dash === "none" && e.head === "none"))));
  ok(V, "edges: exactly one chosen, in the chosen edge's coral (the transition the dock plays)", edges.filter((e) => e.chosen).length === 1 && edges.find((e) => e.chosen).color === ink.edgeChosen);
  await page.keyboard.press("Home");
  await page.click("#play"); await page.waitForTimeout(90);
  const dash = await ev(() => { const d = document.querySelector(".edge-dash"); return d ? { arr: getComputedStyle(d).strokeDasharray, w: getComputedStyle(d).strokeWidth, off: parseFloat(getComputedStyle(d).strokeDashoffset) } : null; });
  await page.waitForTimeout(700);
  const dashEnd = await ev(() => !!document.querySelector(".edge-dash"));
  ok(V, "playback: one 24px dash travels the chosen edge while it plays; when it ends nothing on the graph moves", !!dash && /^24px/.test(dash.arr) && dash.w === "3px" && !dashEnd, JSON.stringify({ dash, dashEnd }));

  // Inks: the playhead is ink, a failed node crimson.
  const inks = await ev(() => { const ph = getComputedStyle(document.getElementById("playhead"), "::after").backgroundColor, n = document.querySelector('.gsec[data-current] .node[data-state="failed"]'), cs = getComputedStyle(n); return { ph, strong: __k.color("--ink-strong"), nodeBg: cs.backgroundColor, failBg: __k.color("--status-fail-bg"), nodeEdge: cs.borderTopColor, failGlyph: __k.color("--status-fail-glyph"), coral: __k.color("--brand-solid"), selBg: __k.color("--selected-bg") }; });
  ok(V, "the playhead is the strong ink, never red", inks.ph === inks.strong, inks.ph);
  ok(V, "the kept failed node wears the failure inks (status-fail-bg, the crimson glyph's edge), not coral", inks.nodeBg === inks.failBg && inks.nodeEdge === inks.failGlyph && inks.nodeBg !== inks.selBg, JSON.stringify(inks));
  // The owner's switch: hue or ink.
  const one = await ev(() => ({ bar: getComputedStyle(document.querySelector('.clip[data-key="fade"] .bar')).backgroundColor, lead: getComputedStyle(document.querySelector('.clip[data-key="fade"] .lead')).color, prop: __k.color("--prop-opacity") }));
  await page.click('#kinds [data-kinds="ink"]'); await page.waitForTimeout(300);
  const two = await ev(() => ({ bar: getComputedStyle(document.querySelector('.clip[data-key="fade"] .bar')).backgroundColor, lead: getComputedStyle(document.querySelector('.clip[data-key="fade"] .lead')).color, fill: __k.color("--surface-fill-strong"), muted: __k.color("--ink-muted"), mode: document.documentElement.dataset.kinds }));
  await page.click('#kinds [data-kinds="hue"]'); await page.waitForTimeout(300);
  ok(V, "Clip kinds switch: hue puts glyph and bar in the kind's hue; ink only leaves the glyph to name it and the bar surface-fill-strong", one.lead === one.prop && two.mode === "ink" && two.bar === two.fill && two.lead === two.muted && one.bar !== two.bar, JSON.stringify({ one, two }));
  ok(V, "no console errors", errors.length === 0, errors.join(" | "));
  await page.close();
}

// ---- The round-29 review's fixes, each read from the engine ----
async function reviewFixes(browser, engine) {
  // 1. Icons are the bare glyph: no box at rest, under the pointer, or as the hidden tab; the hit area stays.
  {
    const V = "1440-" + engine + "-fix1";
    const { page, errors, ev } = await openPage(browser, 1440, 900);
    const bare = (sel) => ev((sel) => [...document.querySelectorAll(sel)].map((el) => { const cs = getComputedStyle(el), b = el.getBoundingClientRect(); const edge = ["Top", "Right", "Bottom", "Left"].some((k) => parseFloat(cs["border" + k + "Width"]) > 0 && !/rgba\(0, 0, 0, 0\)|transparent/.test(cs["border" + k + "Color"])); return { id: el.id || el.getAttribute("aria-label"), fill: cs.backgroundColor, edge, shadow: cs.boxShadow, w: Math.round(b.width), h: Math.round(b.height) }; }), sel);
    const ICONS = ".toolbar .icon-btn, .dock-head .tbtn, .gsec[data-current] .zoom";
    const rest = await bare(ICONS);
    const clear = (x) => /rgba\(0, 0, 0, 0\)|transparent/.test(x.fill) && !x.edge && x.shadow === "none";
    ok(V, "every icon control stands bare at rest: no fill, no edge, no shadow (" + rest.map((x) => x.id).join(", ") + ")", rest.length >= 6 && rest.every(clear), JSON.stringify(rest.filter((x) => !clear(x))));
    ok(V, "their hit areas keep their size (a glass group's items 28px, its pad 4px round them; play and loop 30px)", rest.filter((x) => x.w > 0 && !/^Zoom, /.test(x.id)).every((x) => x.w >= 24 && x.h >= 24) && rest.filter((x) => ["outlineBtn", "hide"].includes(x.id)).every((x) => x.w === 28 && x.h === 28) && rest.filter((x) => ["play", "loop"].includes(x.id)).every((x) => x.w === 30 && x.h === 30), JSON.stringify(rest.map((x) => [x.id, x.w, x.h])));
    const hovered = [];
    for (const sel of ["#outlineBtn", "#hide", "#play", "#loop", '.toolbar [data-z="in"]']) { await page.hover(sel); await page.waitForTimeout(200); hovered.push(...(await bare(sel))); }
    ok(V, "under the pointer the glyph takes the strong ink and no box comes", hovered.every(clear), JSON.stringify(hovered.filter((x) => !clear(x))));
    await page.click("#hide"); await page.waitForTimeout(500);
    const tab = (await bare("#shell"))[0];
    await page.hover("#shell"); await page.waitForTimeout(400);
    const tabHover = (await bare("#shell"))[0];
    ok(V, "the hidden panel's tab is the graph's glyph alone, a 36px hit area, at rest and under the pointer", clear(tab) && clear(tabHover) && tab.w === 36 && tab.h === 36, JSON.stringify({ tab, tabHover }));
    ok(V, "no console errors", errors.length === 0, errors.join(" | "));
    await page.close();
  }
  // Second review, #1: the chosen row is the brand wash with the 1px coral ring, by day and at night.
  for (const scheme of ["light", "dark"]) {
    const V = "1440-" + scheme + "-" + engine + "-chosen";
    const { page, ev } = await openPage(browser, 1440, 900, scheme);
    const f = await ev(() => __k.box(document.querySelector('.clip[data-key="reveal"] .fact-dur')));
    await page.mouse.click(f.x + f.w / 2, f.y + f.h / 2); await page.waitForTimeout(500);
    const row = await ev(() => { const r = document.querySelector('.clip[data-key="reveal"]'), cs = getComputedStyle(r, "::before"), dock = getComputedStyle(document.getElementById("dock")).backgroundColor; const lum = (c) => { const m = __k.over(dock, c).match(/\d+/g).map(Number), lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * lin(m[0]) + 0.7152 * lin(m[1]) + 0.0722 * lin(m[2]); }; return { chosen: r.hasAttribute("data-chosen"), fill: cs.backgroundColor, token: __k.color("--c-chosen-wash"), wash: __k.color("--brand-wash"), frame: cs.boxShadow, coral: __k.color("--brand-solid"), lum: Math.round(lum(cs.backgroundColor) * 1000) / 1000, washLum: Math.round(lum(__k.color("--brand-wash")) * 1000) / 1000, failLum: Math.round(lum(__k.color("--status-fail-bg")) * 1000) / 1000 }; });
    if (scheme === "dark") ok(V, "at night the chosen row's computed background is the brand wash (" + row.fill + "), the 1px coral ring kept", row.chosen && row.fill === row.wash && row.fill === row.token && row.frame.includes(row.coral) && /0px 0px 0px 1px inset/.test(row.frame), JSON.stringify(row));
    else ok(V, "by day the chosen row's wash is the house wash at 40% (" + row.fill + "): lighter than the solid wash and the Save-failed card's fill (luminance " + row.lum + " against " + row.washLum + " and " + row.failLum + "), the 1px coral ring kept", row.chosen && row.fill === row.token && /\/ 0\.4\)|0\.4\)$/.test(row.fill) && row.lum > row.washLum && row.lum > row.failLum && row.frame.includes(row.coral), JSON.stringify(row));
    // Its figures still read as text on the wash (the wash laid over the dock, the figure's ink on that).
    const fig = await ev(() => { const r = document.querySelector('.clip[data-key="reveal"]'), wash = getComputedStyle(r, "::before").backgroundColor, ground = __k.over(getComputedStyle(document.getElementById("dock")).backgroundColor, wash); return [...r.querySelectorAll(".fig")].map((f) => __k.ratio(getComputedStyle(f).color, ground)); });
    ok(V, "on the wash the row's figures hold text contrast (" + fig.join(", ") + ":1)", fig.every((x) => x >= 4.5), JSON.stringify(fig));
    await page.close();
  }
  // 3, 4. Doors stand in the well's own bands: no slab text under any door, and nothing of the graph painted
  // in the bands but the doors (the sliver gone).
  for (const [w, h] of [[1440, 900], [390, 844]]) {
    const V = w + "-" + engine + "-fix3-4";
    const { page, ev } = await openPage(browser, w, h);
    for (const scroll of ["start", "mid", "end"]) {
      const res = await ev((scroll) => {
        const g = document.querySelector(".gsec[data-current] .graph"), gv = g.parentNode;
        if (scroll === "mid") g.scrollTop = (g.scrollHeight - g.clientHeight) / 2; else if (scroll === "end") g.scrollTop = g.scrollHeight;
        g.dispatchEvent(new Event("scroll"));
        return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => {
          const gb = g.getBoundingClientRect(), vb = gv.getBoundingClientRect();
          const doors = [...gv.querySelectorAll(".door[data-on]")].map((d) => d.getBoundingClientRect());
          // Every glyph of slab text as drawn (each text node's line boxes), clipped to the view.
          const texts = [];
          const walker = document.createTreeWalker(g, NodeFilter.SHOW_TEXT);
          for (let n; (n = walker.nextNode()); ) { if (!n.textContent.trim()) continue; const rg = document.createRange(); rg.selectNodeContents(n); for (const q of rg.getClientRects()) { const t = Math.max(q.top, gb.top), bt = Math.min(q.bottom, gb.bottom); if (bt - t > 0.5 && q.width > 0.5) texts.push({ t, b: bt, l: q.left, r: q.right, s: n.textContent.slice(0, 14) }); } }
          const under = texts.filter((q) => doors.some((d) => Math.min(d.right, q.r) - Math.max(d.left, q.l) > 0.5 && Math.min(d.bottom, q.b) - Math.max(d.top, q.t) > 0.5)).map((q) => q.s);
          const inBands = doors.every((d) => d.bottom <= gb.top + 0.5 || d.top >= gb.bottom - 0.5);
          // The bands, sampled every 4px: what is drawn there is the well, its doors, or nothing of the graph.
          const strays = [];
          for (const [y0, y1] of [[vb.top + 1, gb.top], [gb.bottom, vb.bottom - 1]]) for (let y = y0 + 2; y < y1 - 1; y += 4) for (let x = vb.left + 2; x < vb.right - 2; x += 4) { const top = document.elementFromPoint(x, y); if (top && g.contains(top)) strays.push(Math.round(x) + "," + Math.round(y) + ":" + top.className); }
          r({ doors: doors.length, under, inBands, strays: strays.slice(0, 6), strayCount: strays.length, band: Math.round(gb.top - vb.top) });
        })));
      }, scroll);
      ok(V, "scrolled to its " + scroll + ": " + res.doors + " doors, all in the well's " + res.band + "px bands, none over slab text, nothing of the graph drawn in the bands", res.inBands && res.under.length === 0 && res.strayCount === 0, JSON.stringify(res));
    }
    await page.close();
  }
  // Second review, #4: in ink only the bars read at night as by day: a fill a step past the dock's and an edge
  // at 3:1 against it.
  for (const scheme of ["light", "dark"]) {
    const V = "1440-" + scheme + "-" + engine + "-ink-bars";
    const { page, ev } = await openPage(browser, 1440, 900, scheme);
    await page.click('#kinds [data-kinds="ink"]'); await page.waitForTimeout(400);
    const bar = await ev(() => { const b = document.querySelector('.clip[data-key="fade"] .bar'), cs = getComputedStyle(b), dock = getComputedStyle(document.getElementById("dock")).backgroundColor, edge = cs.getPropertyValue("--bar-edge").trim(), edgeC = (() => { const p = document.createElement("span"); p.style.color = edge; document.body.append(p); const c = getComputedStyle(p).color; p.remove(); return c; })(); return { fill: cs.backgroundColor, dock, edge: edgeC, fillStep: __k.ratio(cs.backgroundColor, dock), edgeOnDock: __k.ratio(edgeC, dock), fillToken: __k.color("--surface-fill-strong"), edgeToken: __k.color("--border-contrast") }; });
    ok(V, "ink-only bars: surface-fill-strong (" + bar.fillStep + ":1 from the dock) with a border-contrast edge (" + bar.edgeOnDock + ":1)", bar.fill === bar.fillToken && bar.edge === bar.edgeToken && bar.edgeOnDock >= 3 && bar.fillStep >= 1.3, JSON.stringify(bar));
    await page.close();
  }
  // Second review, #3: the hue option is labelled a proposal on the switch, with what picking it adds.
  {
    const V = "1440-" + engine + "-proposal";
    const { page, ev } = await openPage(browser, 1440, 900);
    const sw = await ev(() => { const t = document.querySelector('#kinds [data-kinds="hue"]'), note = document.getElementById(t.getAttribute("aria-describedby")); return { badge: t.querySelector(".badge.proposal")?.textContent, note: note && note.textContent, visible: !!note && note.getBoundingClientRect().height > 0 }; });
    ok(V, "the hue option carries a Proposed badge and a line saying picking it adds its six colours to the tokens", sw.badge === "Proposed" && /proposed/.test(sw.note) && /design tokens/.test(sw.note) && sw.visible, JSON.stringify(sw));
    await page.close();
  }
  // Third pass, (a): a door's drawing never leaves the well, at any frame of its slide in or out (sampled every
  // frame by requestAnimationFrame), while its touch layer still reaches past its band.
  for (const [w, h] of [[1440, 900], [390, 844], [320, 700]]) {
    const V = w + "-" + engine + "-door-slide";
    const { page, ev } = await openPage(browser, w, h);
    const res = await ev(() => new Promise((done) => {
      const g = document.querySelector(".gsec[data-current] .graph"), well = g.parentNode, frames = [], worst = { out: 0, raw: 0, seen: 0, flips: 0, band: {}, stale: 0 };
      const sample = () => {
        const wb = well.getBoundingClientRect();
        for (const f of well.querySelectorAll(".door-face")) { if (+getComputedStyle(f).opacity === 0) continue; worst.seen++;
          // Its clip belongs to the band it stands in: no reach out over the well's edge on that band's side.
          { const v = getComputedStyle(f).clipPath.match(/inset\(([^)]*)\)/)[1].split(" round ")[0].trim().split(/\s+/).map(parseFloat), top = v[0], bot = v[2] ?? v[0], band = f.parentNode.dataset.band; if ((band === "top" && top < -0.01) || (band === "bottom" && bot < -0.01)) worst.stale++; } const d = __k.drawn(f), q = f.getBoundingClientRect(); worst.raw = Math.max(worst.raw, wb.top - q.top, q.bottom - wb.bottom); const out = Math.max(wb.left - d.left, d.right - wb.right, wb.top - d.top, d.bottom - wb.bottom, 0); if (out > worst.out) { worst.out = out; worst.door = f.textContent; worst.t = getComputedStyle(f).translate; } }
        // A band change of any door whose face shows at all (coming, going or standing).
        for (const d of well.querySelectorAll(".door")) { const k = d.dataset.machine || d.dataset.more, o = +getComputedStyle(d.querySelector(".door-face")).opacity; if (o > 0 && worst.band[k] && worst.band[k] !== d.dataset.band) worst.flips++; worst.band[k] = d.dataset.band; }
        frames.push(1);
      };
      // Doors come (scrolled to the foot), go (back to the top), and come again, each sampled to its end.
      // Each jump left to settle, then the same jumps 60ms apart, so doors change band mid-fade too.
      const steps = [() => { g.scrollTop = g.scrollHeight; }, () => { g.scrollTop = 0; }, () => { g.scrollTop = g.scrollHeight; }, () => { g.scrollTop = 0; }, () => { g.scrollTop = g.scrollHeight; }, () => { g.scrollTop = 0; }, () => { g.scrollTop = g.scrollHeight; }, () => { g.scrollTop = 0; }];
      let i = 0, t0 = performance.now();
      const tick = (now) => { sample(); if (now - t0 > (i >= 4 && i < steps.length ? 60 : 320)) { if (i === steps.length) { done({ frames: frames.length, worst }); return; } steps[i++](); g.dispatchEvent(new Event("scroll")); t0 = now; } requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    }));
    const hit = await ev(() => { const d = document.querySelector(".gsec[data-current] .door[data-on]"); if (!d) return null; const pb = getComputedStyle(d, "::before"); return { door: Math.round(d.getBoundingClientRect().height), layer: pb.content !== "none" ? Math.round(parseFloat(pb.height)) : null }; });
    ok(V, "no frame of a door's slide in or out, nor of a band change (" + res.worst.flips + " seen, settled and mid-fade), draws past the well or keeps the old band's clip (" + res.worst.stale + " stale), its shadow's reach included (" + res.frames + " frames, " + res.worst.seen + " face samples; the face itself rode up to " + Math.round(res.worst.raw * 100) / 100 + "px out, its drawn reach at most " + Math.round(res.worst.out * 100) / 100 + "px: 0px)", res.frames >= 12 && res.worst.seen > 20 && res.worst.raw > 1 && res.worst.flips > 0 && res.worst.out <= 0.01 && res.worst.stale === 0, JSON.stringify(res));
    if (w === 390) ok(V, "its touch layer is still 44px over its 28px door", !!hit && hit.door === 28 && hit.layer === 44, JSON.stringify(hit));
    await page.close();
  }
  // Third pass, (b): at 320px every segment's words stay inside its tab and its tab inside its groove; a long
  // component name is cut at its end, the whole name in the tab's title.
  {
    const V = "320-" + engine + "-tabs";
    const { page, ev } = await openPage(browser, 320, 700);
    const LONG = "Create routine form for the cockpit triage board and its weekly milestone check";
    const res = await ev((LONG) => {
      labelTab(document.querySelector("#tabs .t-tab"), LONG);
      const out = [], inside = (a, b) => a.left >= b.left - 0.5 && a.right <= b.right + 0.5 && a.top >= b.top - 0.5 && a.bottom <= b.bottom + 0.5;
      for (const groove of document.querySelectorAll(".t-tabs")) {
        const gb = groove.getBoundingClientRect();
        if (gb.width < 1 || gb.height < 1) continue;
        if (gb.left < -0.5 || gb.right > innerWidth + 0.5) out.push(groove.id + " groove " + Math.round(gb.left) + "–" + Math.round(gb.right));
        for (const t of groove.querySelectorAll(".t-tab")) { const tb = t.getBoundingClientRect(), l = t.querySelector(".t-label"); if (!inside(tb, gb)) out.push(groove.id + ": tab " + t.textContent.slice(0, 16)); if (!l) { out.push(groove.id + ": no label " + t.textContent); continue; } if (!inside(l.getBoundingClientRect(), tb)) out.push(groove.id + ": label " + l.textContent.slice(0, 16)); }
      }
      const first = document.querySelector("#tabs .t-tab"), l = first.querySelector(".t-label");
      return { out, cut: l.scrollWidth > l.clientWidth + 0.5, ellipsis: getComputedStyle(l).textOverflow, title: first.title, grooves: [...document.querySelectorAll(".t-tabs")].filter((g) => g.getBoundingClientRect().width > 0).map((g) => g.id) };
    }, LONG);
    ok(V, "every tab's words stay inside its tab, every tab inside its groove, every groove on the screen (" + res.grooves.join(", ") + ")", res.out.length === 0, res.out.join(", "));
    ok(V, "a long component name is cut at its end inside its tab, the whole name in its title", res.cut && res.ellipsis === "ellipsis" && res.title === LONG, JSON.stringify(res));
    await page.close();
  }
  // Third review, #1: every pressable thing at 390 and 320 takes a press over 44 × 44 by elementFromPoint,
  // centre to each edge, on the graph face, the timeline face and in the clip's controls; no neighbour's layer steals.
  for (const [w, h] of [[390, 844], [320, 700]]) {
    const V = w + "-" + engine + "-hits";
    const { page, ev } = await openPage(browser, w, h);
    const sweepAll = (where) => ev((where) => {
      const vis = (el) => { for (let e = el; e && e !== document.documentElement; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.display === "none" || cs.visibility === "hidden" || +cs.opacity === 0 || e.hidden) return false; } const r = el.getBoundingClientRect(); if (!(r.width > 0 && r.height > 0 && r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth)) return false; const g = el.closest(".graph"); if (!g) return true; const v = g.getBoundingClientRect(); return r.top >= v.top - 0.5 && r.bottom <= v.bottom + 0.5 && r.left >= v.left - 0.5 && r.right <= v.right + 0.5; };
      const sel = where === "ctl" ? ".ctl button, .ctl .fld, .ctl .dslider" : ".review-bar .t-tab, #tabs .t-tab, #faces .t-tab, #sheetHide, .gsec[data-current] .door[data-on], .zoom-fit, .toolbar .icon-btn, .gsec[data-current] .region-head, .gsec[data-current] .var, .gsec[data-current] .node, .dock-head .tbtn, .dock-head .ghost-btn, #compare .t-tab, .clip .fact, .clip .bar";
      // A node's own text and chips are the node's; a chip is measured on its own.
      return [...document.querySelectorAll(sel)].filter(vis).map((el) => ({ el: (el.id || (el.className.baseVal ?? el.className).split(" ")[0]) + "|" + (el.getAttribute("aria-label") || el.textContent).trim().slice(0, 14), ...__k.hitSpan(el) })).filter((x) => x.covered || x.w < 43.5 || x.h < 43.5).map((x) => where + ":" + x.el + " " + x.w + "×" + x.h + (x.covered ? " covered" : "") + (x.by ? " by " + x.by : ""));
    }, where);
    const graph = await sweepAll("graph");
    await page.click('#faces [data-face="move"]'); await page.waitForTimeout(400);
    const tl = await sweepAll("timeline");
    const f = await ev(() => __k.box(document.querySelector('.clip[data-key="reveal"] .fact-dur')));
    await page.mouse.click(f.x + f.w / 2, f.y + f.h / 2); await page.waitForTimeout(500);
    const pop = await sweepAll("ctl");
    // The Duration field's wrapper takes the press and hands it to its input, anywhere on its 44px box.
    const fb = await ev(() => { const l = document.querySelector('.ctl .fld:has(input[data-f="dur"])'), b = l.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height, r: parseFloat(getComputedStyle(l).borderTopLeftRadius) }; });
    const field = { w: Math.round(fb.w), h: Math.round(fb.h), points: [] };
    // Its four edges' middles and two points just inside its rounded corners, each a real press.
    for (const [px_, py_] of [[fb.x + 2, fb.y + fb.h / 2], [fb.x + fb.w - 2, fb.y + fb.h / 2], [fb.x + fb.w / 2, fb.y + 2], [fb.x + fb.w / 2, fb.y + fb.h - 2], [fb.x + fb.r, fb.y + fb.r / 2], [fb.x + fb.w - fb.r, fb.y + fb.h - fb.r / 2]]) {
      await ev(() => document.activeElement && document.activeElement.blur());
      await page.mouse.click(px_, py_);
      field.points.push(await ev(() => document.activeElement && document.activeElement.dataset.f === "dur"));
    }
    field.corner = field.focused = field.points.every(Boolean);
    ok(V, "graph face, timeline face and the clip's controls: every pressable thing takes a press over 44 × 44 (slab names, chips, states, doors, facts, bars, tabs, Hide, play, loop, fields)", graph.length === 0 && tl.length === 0 && pop.length === 0, graph.concat(tl, pop).join(", "));
    ok(V, "the Duration field is a " + field.w + "×" + field.h + " press: its wrapper takes a press at each edge and inside its corners and hands it to its input", field.w >= 44 && field.h >= 44 && field.corner && field.focused, JSON.stringify(field));
    await page.close();
  }
  // Fourth review, #2: the mock page's own fields take a press over 44 × 44 by elementFromPoint at 390 and 320,
  // each brought into the page's view first (the drawer covers the page's foot).
  for (const [w, h] of [[390, 844], [320, 700]]) {
    const V = w + "-" + engine + "-mock-fields";
    const { page, ev } = await openPage(browser, w, h);
    const res = await ev(async () => {
      const out = [], all = [...document.querySelectorAll(".stage-wrap:not([hidden]) .stage .input")];
      for (const el of all) { el.scrollIntoView({ block: "center" }); await new Promise((r) => requestAnimationFrame(r)); const s = __k.hitSpan(el); out.push({ w: s.w, h: s.h, by: s.by, box: Math.round(el.getBoundingClientRect().height) }); }
      return out;
    });
    ok(V, "every one of the mock form's " + res.length + " fields takes a press over 44 × 44 (" + res.map((x) => x.w + "×" + x.h).join(", ") + ")", res.length >= 5 && res.every((x) => x.w >= 43.5 && x.h >= 43.5), JSON.stringify(res));
    await page.close();
  }
  // Third review, #4: a pinned slab name never stands on a state's words, scrolled through the whole view at 390
  // and 1440 in 12px steps.
  for (const [w, h] of [[390, 844], [1440, 900]]) {
    const V = w + "-" + engine + "-pinned";
    const { page, ev } = await openPage(browser, w, h);
    const res = await ev(() => new Promise((done) => {
      const g = document.querySelector(".gsec[data-current] .graph"), hits = [], max = g.scrollHeight - g.clientHeight;
      let y = 0, pinnedSeen = 0;
      const step = () => {
        g.scrollTop = y; g.dispatchEvent(new Event("scroll"));
        requestAnimationFrame(() => {
          for (const head of g.querySelectorAll(".region-head[data-pinned]")) {
            pinnedSeen++;
            const hb = head.getBoundingClientRect();
            for (const n of g.querySelectorAll(".node")) { const q = n.getBoundingClientRect(); if (Math.min(q.right, hb.right) - Math.max(q.left, hb.left) > 0.5 && Math.min(q.bottom, hb.bottom) - Math.max(q.top, hb.top) > 0.5) hits.push(y + ":" + head.textContent + " on " + n.dataset.state); }
          }
          if (y >= max) { done({ hits: hits.slice(0, 6), count: hits.length, pinnedSeen, steps: Math.ceil(max / 12) }); return; }
          y = Math.min(max, y + 12); step();
        });
      };
      step();
    }));
    ok(V, "scrolled through the view in 12px steps (" + res.steps + "), a pinned slab name (" + res.pinnedSeen + " pinned frames) never stands on a state", res.count === 0, JSON.stringify(res));
    await page.close();
  }
  // Critique fixes (impeccable P2s): a band stands only while it holds a door, the view taking an empty one's
  // room; on a phone the kept machine stands whole in its view at the touch floor's zoom.
  for (const [w, h] of [[1440, 900], [390, 844]]) {
    const V = w + "-" + engine + "-critique";
    const { page, ev } = await openPage(browser, w, h);
    const bands = await ev(() => { const g = document.querySelector(".gsec[data-current] .graph"), gv = g.parentNode, gb = g.getBoundingClientRect(), vb = gv.getBoundingClientRect(), doors = (b) => gv.querySelectorAll('.door[data-on][data-band="' + b + '"]').length; return { top: gv.hasAttribute("data-top"), foot: gv.hasAttribute("data-foot"), topDoors: doors("top"), footDoors: doors("bottom"), viewTop: Math.round(gb.top - vb.top), viewFoot: Math.round(vb.bottom - gb.bottom), wellH: Math.round(vb.height) }; });
    const band = 28 + 1;
    ok(V, "a band stands only with a door in it: top " + bands.topDoors + " doors → " + (bands.top ? "band" : "none") + ", foot " + bands.footDoors + " → " + (bands.foot ? "band" : "none") + "; the view meets the well's edge where no band stands", bands.top === bands.topDoors > 0 && bands.foot === bands.footDoors > 0 && (bands.top ? near(bands.viewTop, band, 1) : bands.viewTop <= 1) && (bands.foot ? near(bands.viewFoot, band, 1) : bands.viewFoot <= 1), JSON.stringify(bands));
    // Scrolling the view to its foot brings doors to the top band; the well's own height never changes.
    const after = await ev(() => new Promise((r) => { const g = document.querySelector(".gsec[data-current] .graph"), gv = g.parentNode, h0 = gv.getBoundingClientRect().height; g.scrollTop = 0; g.dispatchEvent(new Event("scroll")); requestAnimationFrame(() => requestAnimationFrame(() => { const h1 = gv.getBoundingClientRect().height; g.scrollTop = g.scrollHeight; g.dispatchEvent(new Event("scroll")); requestAnimationFrame(() => requestAnimationFrame(() => r({ h0, h1, h2: gv.getBoundingClientRect().height, top: gv.hasAttribute("data-top"), topDoors: gv.querySelectorAll('.door[data-on][data-band="top"]').length }))); })); }));
    ok(V, "scrolling the bands come and go and the well keeps its height (" + Math.round(after.h0) + "px)", near(after.h0, after.h1, 0.5) && near(after.h0, after.h2, 0.5) && after.top === after.topDoors > 0, JSON.stringify(after));
    if (w === 390) {
      const fit = await ev(() => { const g = document.querySelector(".gsec[data-current] .graph"), gb = g.getBoundingClientRect(), r = g.querySelector(".region.kept-region").getBoundingClientRect(); return { zoom: Math.round(new DOMMatrix(getComputedStyle(g.querySelector(".world")).transform).a * 100) / 100, region: Math.round(r.width), view: Math.round(gb.width), left: Math.round(r.left - gb.left), right: Math.round(gb.right - r.right) }; });
      ok(V, "the kept machine stands whole across the phone's view at zoom 1 (" + fit.region + " ≤ " + fit.view + "px)", fit.zoom === 1 && fit.region <= fit.view && fit.left >= -0.5 && fit.right >= -0.5, JSON.stringify(fit));
    }
    await page.close();
  }
  // 5, 6. The phone: every pressable thing has a 44px target; the drawer has its own Hide, and folded, Show.
  {
    const V = "390-" + engine + "-fix5-6";
    const { page, errors, ev } = await openPage(browser, 390, 844);
    const small = () => ev(() => {
      const sel = "button, [role=button], [role=tab], [role=slider], [role=separator], input, .door[data-on], .fact, .var, .node, .bar, .region-head, .edge .hit";
      // A control that takes no pointer (the drawer's grabber: the head behind it takes the press) is a key's alone.
      return [...document.querySelectorAll(sel)].filter((el) => { if (!__k.vis(el) || getComputedStyle(el).pointerEvents === "none") return false; const b = el.getBoundingClientRect(); return b.width > 0 && b.bottom > 0 && b.top < innerHeight && b.right > 0 && b.left < innerWidth; }).map((el) => {
        const b = (el.closest(".fld") || el).getBoundingClientRect(), pb = getComputedStyle(el, "::before"), hit = el.querySelector(":scope > .bar-hit");
        let w = b.width, h = b.height;
        if (pb.content !== "none" && pb.position === "absolute") { w = Math.max(w, parseFloat(pb.width) || 0); h = Math.max(h, parseFloat(pb.height) || 0); }
        if (hit) { const q = hit.getBoundingClientRect(); w = Math.max(w, q.width); h = Math.max(h, q.height); }
        if (el.classList.contains("hit")) { const sw = parseFloat(getComputedStyle(el).strokeWidth); h = Math.max(h, sw); w = Math.max(w, sw); }
        return { el: (el.className.baseVal ?? el.className) + "|" + (el.getAttribute("aria-label") || el.textContent).slice(0, 18), w: Math.round(w), h: Math.round(h) };
      }).filter((x) => x.w < 43.5 || x.h < 43.5);
    });
    await ev(() => { window.__k.vis = (el) => { for (let e = el; e && e !== document.documentElement; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.display === "none" || cs.visibility === "hidden" || +cs.opacity === 0 || e.hidden) return false; } const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; }; });
    // Second review, #2: the real hit area, read by elementFromPoint from each control's centre to each edge,
    // is 44 × 44 for every tab, title, door, zoom figure, Outline, play and loop at 390.
    const sweep = async (face) => ev((face) => {
      const sel = ".review-bar .t-tab, #tabs .t-tab, #faces .t-tab, #sheetHide, .gsec[data-current] .door[data-on], .zoom-fit, .toolbar .icon-btn, .dock-head .tbtn, .dock-head .ghost-btn, #compare .t-tab";
      return [...document.querySelectorAll(sel)].filter((el) => __k.vis(el)).map((el) => ({ el: el.id || (el.getAttribute("aria-label") || el.textContent).trim().slice(0, 18), ...__k.hitSpan(el) })).filter((x) => x.covered || x.w < 43.5 || x.h < 43.5).map((x) => face + ":" + x.el + " " + x.w + "×" + x.h + (x.covered ? " covered" : ""));
    }, face);
    const hitsGraph = await sweep("graph");
    // The column: on the phone each machine is one column, its states using the pane beside their lanes.
    const col = await ev(() => { const g = document.querySelector(".gsec[data-current] .graph"), view = g.clientWidth, nodes = [...g.querySelectorAll(".region.kept-region .node")]; const filled = g.querySelector('.region.kept-region .node[data-state="filled"]'); const xs = new Set(nodes.map((n) => Math.round(n.getBoundingClientRect().left))); return { view, w: Math.round(nodes[0].getBoundingClientRect().width), columns: xs.size, filledH: Math.round(filled.getBoundingClientRect().height) }; });
    ok(V, "the phone's machine is one column of states " + col.w + "px wide in a " + col.view + "px view (it was 107), Filled " + col.filledH + "px tall (it was 304)", col.columns === 1 && col.w >= 200 && col.filledH < 260, JSON.stringify(col));
    const graphFace = await small();
    ok(V, "graph face: every pressable target is at least 44 × 44 (slab names, variant chips, doors, edges, buttons)", graphFace.length === 0, JSON.stringify(graphFace.slice(0, 12)));
    await page.click('#faces [data-face="move"]'); await page.waitForTimeout(400);
    const tlFace = await small();
    const hitsTl = await sweep("timeline");
    ok(V, "every tab, title, door, zoom figure, Outline, Hide, play and loop takes a press over 44 × 44 by elementFromPoint, centre to each edge", hitsGraph.length === 0 && hitsTl.length === 0, hitsGraph.concat(hitsTl).join(", "));
    ok(V, "timeline face: every pressable target is at least 44 × 44 (facts, bars, play, loop)", tlFace.length === 0, JSON.stringify(tlFace.slice(0, 12)));
    const f = await ev(() => __k.box(document.querySelector('.clip[data-key="reveal"] .fact-dur')));
    await page.mouse.click(f.x + f.w / 2, f.y + f.h / 2); await page.waitForTimeout(500);
    const popFace = await ev(() => { const p = document.querySelector(".ctl"); return [...p.querySelectorAll("button, [role=slider], input, .fld, .knob")].filter((el) => __k.vis(el)).map((el) => { const b = (el.closest(".fld") || el).getBoundingClientRect(), pb = getComputedStyle(el, "::before"), hit = el.classList.contains("knob") ? p.querySelector('.knob-hit[data-for="' + el.dataset.h + '"]').getBoundingClientRect() : null; let w = b.width, h = b.height; if (pb.content !== "none" && pb.position === "absolute") { w = Math.max(w, parseFloat(pb.width) || 0); h = Math.max(h, parseFloat(pb.height) || 0); } if (hit) { w = Math.max(w, hit.width); h = Math.max(h, hit.height); } return { el: (el.className.baseVal ?? el.className) + "|" + (el.getAttribute("aria-label") || el.textContent).slice(0, 16), w: Math.round(w), h: Math.round(h) }; }).filter((x) => x.w < 43.5 || x.h < 43.5); });
    ok(V, "the clip's controls: every target at least 44 × 44 (slider, fields, segments, the curve's handles)", popFace.length === 0, JSON.stringify(popFace));
    await page.keyboard.press("Escape"); await page.waitForTimeout(300);
    const hb = await ev(() => { const b = document.getElementById("sheetHide"); return { vis: __k.vis(b), label: b.getAttribute("aria-label"), stop: document.getElementById("tools").dataset.stop, h: document.getElementById("tools").getBoundingClientRect().height }; });
    await page.click("#sheetHide"); await page.waitForTimeout(500);
    const folded = await ev(() => { const b = document.getElementById("sheetHide"); return { label: b.getAttribute("aria-label"), stop: document.getElementById("tools").dataset.stop, h: document.getElementById("tools").getBoundingClientRect().height }; });
    await page.click("#sheetHide"); await page.waitForTimeout(500);
    const back = await ev(() => ({ label: document.getElementById("sheetHide").getAttribute("aria-label"), stop: document.getElementById("tools").dataset.stop }));
    ok(V, "the drawer has its own Hide: it folds to the head bar, then the same control says Show and opens it", hb.vis && hb.label === "Hide graph" && hb.stop === "peek" && folded.stop === "head" && folded.label === "Show graph" && folded.h < hb.h && back.stop === "peek" && back.label === "Hide graph", JSON.stringify({ hb, folded, back }));
    ok(V, "no console errors", errors.length === 0, errors.join(" | "));
    await page.close();
  }
}
// 8. The page is built from the current tokens: page.html holds tokens.css as it stands.
{
  const { readFileSync } = await import("node:fs");
  const page = readFileSync(join(here, "page.html"), "utf8"), tokens = readFileSync(join(here, "../../packages/hub/skills/decision-page/kit/tokens.css"), "utf8");
  ok("build", "fix 8: page.html carries the kit's tokens.css as it stands now (" + tokens.length + " bytes)", page.includes(tokens));
}

// ---- Boxes at 1440 and 390 ----
async function boxes(browser, w, h, engine) {
  const V = w + "-" + engine;
  const { page, errors, ev } = await openPage(browser, w, h);
  const res = await ev(() => {
    const out = { docW: document.documentElement.scrollWidth, vw: innerWidth };
    // What a person reads or presses, in the tool and the dock: no two overlap (a pinned name may stand over
    // the states scrolling under it, as a list's section head does).
    out.toolbar = __k.overlaps(document, ".toolbar .t-tab, .toolbar .icon-btn, .toolbar .zoom-fit, .toolbar .hide-btn");
    out.dock = __k.overlaps(document, ".dock-head > *, .clip .l1, .clip .fact, .clip .lead");
    out.graph = __k.overlaps(document, ".gsec[data-current] .node, .gsec[data-current] .lbl rect, .gsec[data-current] .region-head:not([data-pinned])");
    // Doors are overlays at the view's edge, as off-screen marks are: never over each other, a slab's name,
    // a pinned name or the kept state.
    const gb = document.querySelector(".gsec[data-current] .gview").getBoundingClientRect();
    out.doorsOut = [...document.querySelectorAll(".gsec[data-current] .door[data-on]")].filter((d) => { const q = d.getBoundingClientRect(); return q.left < gb.left - 0.5 || q.right > gb.right + 0.5 || q.top < gb.top - 0.5 || q.bottom > gb.bottom + 0.5; }).map((d) => d.textContent);
    // What the view shows of a name or the kept state is its box clipped to the view.
    const view = document.querySelector(".gsec[data-current] .graph").getBoundingClientRect();
    const clip = (q) => ({ l: Math.max(q.left, view.left), r: Math.min(q.right, view.right), t: Math.max(q.top, view.top), b: Math.min(q.bottom, view.bottom) });
    const drawn = [...document.querySelectorAll(".gsec[data-current] .region-head, .gsec[data-current] .node.kept")].map((e) => [e, clip(e.getBoundingClientRect())]).filter(([, q]) => q.r - q.l > 0.5 && q.b - q.t > 0.5);
    out.doors = [];
    const doorEls = [...document.querySelectorAll(".gsec[data-current] .door[data-on]")];
    for (const d of doorEls) { const q = d.getBoundingClientRect(); for (const [e, c] of drawn) if (Math.min(q.right, c.r) - Math.max(q.left, c.l) > 0.5 && Math.min(q.bottom, c.b) - Math.max(q.top, c.t) > 0.5) out.doors.push(d.textContent + " × " + e.textContent.slice(0, 20)); }
    for (let i = 0; i < doorEls.length; i++) for (let j = i + 1; j < doorEls.length; j++) { const a = doorEls[i].getBoundingClientRect(), b = doorEls[j].getBoundingClientRect(); if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0.5 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0.5) out.doors.push(doorEls[i].textContent + " × " + doorEls[j].textContent); }
    // Each slab holds its own nodes and labels.
    out.slab = [...document.querySelectorAll(".gsec[data-current] .region")].flatMap((r) => { const b = r.getBoundingClientRect(); return [...r.querySelectorAll(".node, .lbl rect")].filter((n) => { const q = n.getBoundingClientRect(); return q.left < b.left - 0.5 || q.right > b.right + 0.5 || q.top < b.top - 0.5 || q.bottom > b.bottom + 0.5; }).map((n) => r.dataset.machine + ":" + (n.closest(".node")?.dataset.state || "label")); });
    out.spills = __k.spills(document.body);
    // The panel's content inside the panel; the dock's rows inside the dock.
    const p = document.getElementById("panel").getBoundingClientRect();
    out.panelOut = [...document.querySelectorAll(".toolbar, .graphs")].filter((e) => { const q = e.getBoundingClientRect(); return q.width && (q.left < p.left - 0.5 || q.right > p.right + 0.5); }).map((e) => e.className);
    out.facts = [...document.querySelectorAll(".clip .facts")].filter((f) => f.scrollWidth > f.clientWidth + 1).map((f) => f.closest(".clip").dataset.key + ":" + f.scrollWidth + ">" + f.clientWidth);
    return out;
  });
  ok(V, "no sideways overflow (" + res.docW + " ≤ " + res.vw + ")", res.docW <= res.vw);
  ok(V, "toolbar: nothing overlaps", res.toolbar.length === 0, res.toolbar.join(", "));
  ok(V, "dock: head, rows and facts overlap nothing", res.dock.length === 0, res.dock.join(", "));
  ok(V, "graph: states, labels and names overlap nothing", res.graph.length === 0, res.graph.join(", "));
  ok(V, "graph: the doors stand inside the well, clear of each other, every slab's name and the kept state", res.doors.length === 0 && res.doorsOut.length === 0, res.doors.concat(res.doorsOut).join(", "));
  ok(V, "every slab holds its states and labels", res.slab.length === 0, res.slab.join(", "));
  ok(V, "no text spills its box; each facts line holds on one line", res.spills.length === 0 && res.facts.length === 0, res.spills.concat(res.facts).join(", "));
  ok(V, "the panel's content stands inside the panel", res.panelOut.length === 0, res.panelOut.join(", "));
  if (w === 390) {
    // The phone: the drawer, its Timeline face, and the clip's controls in its row, inside the dock.
    await page.click('#faces [data-face="move"]'); await page.waitForTimeout(400);
    const tl = await ev(() => ({ rows: document.querySelectorAll(".clip").length, dock: __k.box(document.getElementById("dock")), overlaps: __k.overlaps(document, ".dock-head > *, .clip .l1, .clip .fact, .clip .lead"), facts: [...document.querySelectorAll(".clip .facts")].filter((f) => f.scrollWidth > f.clientWidth + 1).map((f) => f.closest(".clip").dataset.key) }));
    ok(V, "Timeline face: rows shown, nothing overlaps, each facts line on one line", tl.rows === 3 && tl.dock.w > 300 && tl.overlaps.length === 0 && tl.facts.length === 0, JSON.stringify(tl));
    const f = await ev(() => __k.box(document.querySelector('.clip[data-key="reveal"] .fact-dur')));
    await page.mouse.click(f.x + f.w / 2, f.y + f.h / 2); await page.waitForTimeout(500);
    const pp = await ev(() => { const p = document.querySelector(".ctl"), d = document.getElementById("dock").getBoundingClientRect(); return p ? { box: __k.box(p), inRow: p.parentElement.matches('.clip[data-key="reveal"]'), inside: p.getBoundingClientRect().left >= d.left && p.getBoundingClientRect().right <= d.right, over: __k.overlaps(p, ".ctl-label, .dslider, .fld, #curveList, .ceditor, .curve-side, .spring-grid"), spills: __k.spills(p), dialogs: document.querySelectorAll('[role="dialog"]').length } : null; });
    ok(V, "phone: the controls stand in the clip's row, inside the dock, their parts overlap nothing; no dialog", !!pp && pp.inRow && pp.inside && pp.over.length === 0 && pp.spills.length === 0 && pp.dialogs === 0, JSON.stringify(pp));
  } else {
    const f = await ev(() => __k.box(document.querySelector('.clip[data-key="reveal"] .fact-delta')));
    await page.mouse.click(f.x + f.w / 2, f.y + f.h / 2); await page.waitForTimeout(500);
    const pp = await ev(() => { const p = document.querySelector(".ctl"); return p ? { box: __k.box(p), inRow: p.parentElement.matches('.clip[data-key="reveal"]'), over: __k.overlaps(p, ".ctl-label, .dslider, .fld, #curveList, .ceditor, .curve-side, .spring-grid, .arrow"), spills: __k.spills(p), dialogs: document.querySelectorAll('[role="dialog"]').length } : null; });
    ok(V, "desk: the controls stand in the clip's row, its parts overlap nothing; no dialog", !!pp && pp.inRow && pp.box.y >= 0 && pp.over.length === 0 && pp.spills.length === 0 && pp.dialogs === 0, JSON.stringify(pp));
  }
  ok(V, "no console errors", errors.length === 0, errors.join(" | "));
  await page.close();
}

// ---- Less motion: every motion's reduced form (fades, nothing moves) ----
async function reducedMotion(browser) {
  const V = "1440-reduced-chromium";
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  const errors = []; page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(URL_); await page.waitForTimeout(700); await page.evaluate(install);
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const sw = await ev(() => __k.box(document.getElementById("sashW")));
  await page.mouse.move(sw.x + sw.w / 2, sw.y + sw.h / 2); await frame(page);
  const arc = await ev(() => ({ a: __k.arc("arcP").a, moves: __k.anims("#arcP").map((a) => a.transitionProperty), fades: __k.anims("#arcP .arc-leg").map((a) => a.transitionProperty + ":" + a.effect.getTiming().duration) }));
  ok(V, "the arc's reach: its length at once, shown by opacity alone over --dur-control", arc.a > 50 && !arc.moves.some((p) => /^--(reach|sweep)/.test(p)) && arc.fades.includes("opacity:120"), JSON.stringify(arc));
  await page.mouse.move(700, 300); await page.waitForTimeout(300);
  const f = await ev(() => __k.box(document.querySelector('.clip[data-key="label"] .fact-dur')));
  await page.mouse.click(f.x + f.w / 2, f.y + f.h / 2); await frame(page);
  const pop = await ev(() => ({ open: !!document.querySelector(".ctl"), moves: __k.anims(".ctl, .ctl *").map((a) => a.transitionProperty).filter((p) => !/^(opacity|color|background-color)$/.test(p)) }));
  ok(V, "the clip's controls open in place: nothing of them moves", pop.open && pop.moves.length === 0, JSON.stringify(pop));
  await page.keyboard.press("Escape"); await page.waitForTimeout(400);
  await page.click("#hide"); await frame(page);
  const hd = await ev(() => ({ anims: document.getAnimations().filter((a) => a.effect.target && a.effect.target.closest && a.effect.target.closest("#panel")).map((a) => (a.transitionProperty || "waapi") + ":" + JSON.stringify(a.effect.getKeyframes().map((k) => Object.keys(k).filter((x) => !["offset", "easing", "composite", "computedOffset"].includes(x)))) ) }));
  await page.waitForTimeout(300);
  const after = await ev(() => __k.box(document.getElementById("shell")));
  ok(V, "Hide: a cross-fade in place (opacity only), ending on the tab", hd.anims.length > 0 && hd.anims.every((a) => /opacity/.test(a)) && near(after.w, 36, 0.5), JSON.stringify(hd) + " " + JSON.stringify(after));
  ok(V, "no console errors", errors.length === 0, errors.join(" | "));
  await page.close();
}

// ---- WebKit: the same motion on the engine's own clock (getAnimations) ----
async function webkitMotion() {
  const V = "1440-webkit";
  const exe = pw.webkit.executablePath();
  if (!existsSync(exe)) { ok(V, "the WebKit build is installed", false, exe); return; }
  const browser = await pw.webkit.launch({ executablePath: exe });
  const { page, errors, ev } = await openPage(browser, 1440, 900);
  await page.mouse.move(700, 300); await page.waitForTimeout(200);
  const sw = await ev(() => __k.box(document.getElementById("sashW")));
  await page.mouse.move(sw.x + sw.w / 2, sw.y + sw.h / 2); await page.waitForTimeout(20);
  const reach = []; for (const f of [0, 0.5, 1]) { await ev((f) => __k.seek("#arcP", f), f); reach.push(await ev(() => __k.arc("arcP").a)); }
  ok(V, "arc reach scrubbed 0 → ½ → 1: the leg grows up the edge", reach[0] < 0.5 && reach[1] > reach[0] + 5 && reach[2] > reach[1], JSON.stringify(reach.map(r1)));
  await ev(() => { for (const a of __k.anims("#arcP")) a.play(); }); await page.waitForTimeout(300);
  await page.mouse.down(); await page.mouse.move(sw.x - 6, sw.y + sw.h / 2 - 60, { steps: 2 }); await page.waitForTimeout(20);
  const sweep = []; for (const f of [0, 0.5, 1]) { await ev((f) => __k.seek("#arcP", f), f); sweep.push(await ev(() => ({ a: __k.arc("arcP").a, c: __k.arc("arcP").color }))); }
  const full = await ev(() => document.getElementById("panel").offsetHeight - 32);
  ok(V, "arc sweep scrubbed: the run reaches the whole edge, in coral", sweep[1].a > sweep[0].a + 20 && sweep[2].a >= full - 1 && sweep[2].c === (await ev(() => __k.color("--brand-solid"))), JSON.stringify(sweep.map((s) => r1(s.a))) + " edge " + full);
  await ev(() => { for (const a of __k.anims("#arcP")) a.play(); }); await page.mouse.up(); await page.mouse.move(700, 300); await page.waitForTimeout(400);
  const pb = await ev(() => __k.box(document.getElementById("panel")));
  await page.click("#hide"); await page.waitForTimeout(10);
  const hd = []; for (const f of [0, 0.5, 1]) { await ev((f) => __k.seek("#shell", f), f); hd.push(await ev(() => __k.box(document.getElementById("shell")))); }
  ok(V, "Hide scrubbed: the shell from the panel's rect to the 36px tab at the screen's edge", boxNear(hd[0], pb, 1) && hd[1].w < pb.w - 20 && near(hd[2].w, 36, 0.5) && near(hd[2].x + hd[2].w, 1440, 0.5), JSON.stringify(hd.map((b) => [r1(b.x), r1(b.w), r1(b.h)])));
  await ev(() => { for (const a of document.getAnimations()) a.play(); }); await page.waitForTimeout(400);
  ok(V, "no console errors", errors.length === 0, errors.join(" | "));
  await browser.close();
}

// ---- Captures for the decision page: each answer of each open card, and the resize handle, at the desk's
// 1440 and the phone's 390, with captures/manifest.json (card, option, width, file, caption). A Sonnet item
// reads them; nothing here compares pixels. ----
async function captures(browser) {
  const dir = join(here, "captures");
  mkdirSync(dir, { recursive: true });
  for (const f of readdirSync(dir)) rmSync(join(dir, f));
  const manifest = [];
  const shot = async (page, card, option, width, file, caption) => { await page.screenshot({ path: join(dir, file), type: "jpeg", quality: 88 }); manifest.push({ card, option, width, file, caption }); };
  const pick = (page, id, attr, v) => page.evaluate(([id, attr, v]) => document.querySelector("#" + id + ' [data-' + attr + '="' + v + '"]').click(), [id, attr, v]);
  // A pointer's press, as a person's: a key's press would put the focus (and its ring) in the controls.
  const openReveal = async (page) => { await page.click('.clip[data-key="reveal"] .fact-dur'); await page.waitForTimeout(500); };
  for (const [w, h] of [[1440, 900], [390, 844]]) {
    let { page } = await openPage(browser, w, h);
    const phone = w === 390;
    if (phone) { await page.click('#faces [data-face="move"]'); await page.waitForTimeout(400); }
    // Clip kinds: the timeline at rest, its rows in each dress.
    await shot(page, "Clip kinds", "In their own hue", w, w + "-kinds-hue.jpg", phone ? "The phone's timeline: each clip's glyph, length and bar in its kind's own hue." : "The timeline at a desk: each clip's glyph, length and bar in its kind's own hue.");
    await pick(page, "kinds", "kinds", "ink"); await page.waitForTimeout(300);
    await shot(page, "Clip kinds", "In ink only", w, w + "-kinds-ink.jpg", phone ? "The phone's timeline in ink only: the glyph alone names each kind, the bars one neutral fill." : "The timeline in ink only: the glyph alone names each kind, the bars one neutral fill.");
    await pick(page, "kinds", "kinds", "hue"); await page.waitForTimeout(200);
    // Clip controls: the reason line's spring (the agent's ad hoc 340 ms, 0.15 bounce) opened each way, the dock
    // held at one height for both (as a drag of its corner sets it), so the two compare at one size.
    if (!phone) await page.evaluate(() => { document.documentElement.style.setProperty("--dock-h", "520px"); window.dispatchEvent(new Event("resize")); });
    await page.waitForTimeout(300);
    await pick(page, "ctlChoice", "ctl", "row"); await openReveal(page);
    await shot(page, "Clip controls", "In the row", w, w + "-controls-row.jpg", phone ? "The reason line's controls open inside its own row, under its facts; the timeline scrolls on past them." : "The reason line's controls open inside its own row, across the timeline, its spring marked ad hoc.");
    // Esc gives the pressed fact the focus (and, being a key, its ring): the next capture starts with none.
    await page.keyboard.press("Escape"); await page.evaluate(() => document.activeElement && document.activeElement.blur()); await page.waitForTimeout(200);
    await pick(page, "ctlChoice", "ctl", "inspector"); await openReveal(page);
    await shot(page, "Clip controls", "In an inspector", w, w + "-controls-inspector.jpg", phone ? "On a phone the inspector takes the timeline's place, Back leading its head." : "The reason line's controls in an inspector beside the timeline, headed by the clip's line.");
    await page.keyboard.press("Escape"); await page.waitForTimeout(200);
    await page.close();
    // The resize handle (section A), on a page fresh from its load (no clip chosen, nothing focused): the corner
    // arc reaching along the edge the pointer rests on; on a phone, the drawer's grabber, its own resize.
    ({ page } = await openPage(browser, w, h));
    if (phone) {
      await shot(page, "Resize handle", "The corner arc", w, w + "-handle.jpg", "On a phone the panel is the drawer: its grabber on the top edge resizes it, and the arc has no corner to stand in.");
    } else {
      const sw = await page.evaluate(() => __k.box(document.getElementById("sashW")));
      await page.mouse.move(sw.x + sw.w / 2, sw.y + sw.h / 2 - 100); await page.waitForTimeout(400);
      await shot(page, "Resize handle", "The corner arc", w, w + "-handle.jpg", "A pointer resting on the panel's leading edge (the capture doesn't draw the pointer): the corner arc runs up that edge past it, thickened in the strong ink.");
      await page.mouse.move(700, 300); await page.waitForTimeout(300);
    }
    await page.close();
  }
  writeFileSync(join(dir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  console.log("NOTE captures for review: " + readdirSync(dir).join(", "));
}

const browser = await pw.chromium.launch({ executablePath: CHROME });
for (const scheme of ["light", "dark"]) await deskMotion(browser, scheme);
await reducedMotion(browser);
await reviewFixes(browser, "chromium");
await boxes(browser, 1440, 900, "chromium");
await boxes(browser, 390, 844, "chromium");
if (!process.env.NO_CAPS) await captures(browser);
await browser.close();
await webkitMotion();
{
  const wk = await pw.webkit.launch({ executablePath: pw.webkit.executablePath() });
  await boxes(wk, 1440, 900, "webkit");
  await boxes(wk, 390, 844, "webkit");
  await reviewFixes(wk, "webkit");
  await wk.close();
}
console.log((fails ? fails + " FAILED" : "ALL PASS") + " (" + passes + " passed)");
process.exit(fails ? 1 : 0);
