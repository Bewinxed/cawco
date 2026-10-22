// Builds the three resize-handle demos for the owner's pick (round 27): handle-demo-{arc,light,bead}.html.
// Each is a small panel and dock drawn by the mockup's own style.css (so it is the same CSS as page.html), sized
// to a decision card's option. It plays rest, pointing at the edge, dragging and letting go on a loop, and stops
// the moment the pointer comes in, so the person drives it: hover the edge, drag it.
//   node .mockups/design-graph/handle-demo.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const here = dirname(fileURLToPath(import.meta.url)), repo = join(here, "../..");
const read = (p) => readFileSync(join(here, p), "utf8");
const tokens = readFileSync(join(repo, "packages/hub/skills/decision-page/kit/tokens.css"), "utf8");
const font = `@font-face { font-family: "Figtree Variable"; src: url(data:font/woff2;base64,${readFileSync(join(here, "fonts/figtree-latin.woff2")).toString("base64")}) format("woff2"); font-weight: 300 900; font-display: block; }`;
// The loop drives the same rules a pointer does: a sash's hover is :hover or .demo-hover.
const css = read("style.css").replace(/\.sash-([whcsd]):hover/g, ".sash-$1:is(:hover, .demo-hover)");
const arrow = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`;
const H = "M3 12h18M6 9l-3 3 3 3M18 9l3 3-3 3", V = "M12 3v18M9 6l3-3 3 3M9 18l3 3 3-3", C = "M5 19L19 5M5 14v5h5M14 5h5v5";
const words = { rest: "At rest", hover: "Pointing at the edge", drag: "Dragging it wider", release: "Let go", yours: "Your turn: point at an edge, then drag it" };
const demo = (handle) => `<!doctype html>
<html lang="en" data-handle="${handle}" data-input="fine" data-layout="desk" data-tools="open">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Resize handle: ${handle}</title>
<style>${tokens}</style><style>${font}</style><style>${css}</style>
<style>
/* The demo's stage: one card option wide, the panel and the dock where the mockup puts them. */
body { min-block-size: 0; background: var(--surface-recess); overflow: hidden; }
.stage { position: relative; inline-size: 100%; block-size: 300px; }
.say { position: absolute; inset-block-start: var(--space-3); inset-inline-start: var(--space-3); margin: 0; font: var(--type-meta); color: var(--ink-muted); }
html[data-layout="desk"] .stage .panel { position: absolute; inset: 44px var(--space-5) auto auto; inline-size: var(--w, 172px); block-size: var(--h, 140px); max-block-size: none; clip-path: none; }
.stage .panel .graph { flex: 1 1 auto; block-size: auto; cursor: default; }
.stage .dock { position: absolute; inset: auto var(--space-5) var(--space-5) var(--space-3); block-size: var(--dh, 64px); padding: var(--space-3); opacity: 1; transform: none; filter: none; pointer-events: auto; }
.stage .dock .row { block-size: var(--c-pill-h); border-radius: var(--radius-xs); background: var(--surface-fill); box-shadow: inset 0 0 0 1px var(--border-row-outline); inline-size: 60%; }
</style></head>
<body><div class="stage" id="stage">
<p class="say" id="say">${words.rest}</p>
<aside class="tool panel" id="panel" data-open="true" aria-label="A resizable panel">
  <div class="graph"></div>
  <div class="sash sash-w" data-edge="w"></div><div class="sash sash-h" data-edge="h"></div><div class="sash sash-c" data-edge="wh"></div>
  <span class="lit" data-arm="w"></span><span class="lit" data-arm="h"></span>
  <span class="bead" data-arm="w">${arrow(H)}</span><span class="bead" data-arm="h">${arrow(V)}</span><span class="bead" data-arm="wh">${arrow(C)}</span>
</aside>
<section class="tool dock" id="dock" data-open="true" aria-label="A resizable dock">
  <div class="sash sash-d" data-edge="d"></div><span class="lit" data-arm="d"></span><span class="bead" data-arm="d">${arrow(V)}</span>
  <div class="row"></div>
</section>
</div>
<script>
const $ = (id) => document.getElementById(id), root = document.documentElement, panel = $("panel"), dock = $("dock");
const px = (n) => parseFloat(getComputedStyle(root).getPropertyValue(n)) || 0;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const W0 = 172, H0 = 140, D0 = 64;
let w = W0, h = H0, d = D0;
const size = () => { root.style.setProperty("--w", w + "px"); root.style.setProperty("--h", h + "px"); root.style.setProperty("--dh", d + "px"); };
// Where along an arm the light (and the bead's knob) stands: the pointer's place, 16px clear of the corners.
function aim(owner, edge, y, x) {
  const b = owner.getBoundingClientRect(), R = px("--radius-panel"), clear = px("--c-edge-pull");
  for (const arm of edge === "wh" ? ["w", "h"] : [edge]) {
    const lit = owner.querySelector('.lit[data-arm="' + arm + '"]'), bead = owner.querySelector('.bead[data-arm="' + arm + '"]');
    const len = arm === "w" ? b.height : b.width;
    const along = edge === "wh" ? (arm === "w" ? len - R : R) : arm === "w" ? y - b.top : x - b.left;
    const at = clamp(along, R + clear, len - R - clear);
    lit.style.setProperty("--at", Math.round(at) + "px");
    if (bead && edge !== "wh") bead.style.translate = arm === "w" ? "0 " + Math.round(at - len / 2) + "px" : Math.round(at - len / 2) + "px 0";
  }
}
// The loop: rest, pointing at the width edge, dragging it wider, letting go; then the dock's top edge.
const steps = [
  ["rest", 1100, () => {}],
  ["hover", 1300, () => { const s = panel.querySelector(".sash-w"), b = s.getBoundingClientRect(); aim(panel, "w", b.top + b.height * 0.45, 0); s.classList.add("demo-hover"); }],
  ["drag", 1100, () => { panel.dataset.resizing = "w"; let t0 = null; const go = (t) => { t0 ??= t; const k = Math.min(1, (t - t0) / 700); w = Math.round(W0 + 44 * k); size(); if (k < 1 && loop) requestAnimationFrame(go); }; requestAnimationFrame(go); }],
  ["release", 1200, () => { delete panel.dataset.resizing; panel.querySelector(".sash-w").classList.remove("demo-hover"); }],
  ["hover", 1100, () => { const s = dock.querySelector(".sash-d"), b = s.getBoundingClientRect(); aim(dock, "d", 0, b.left + b.width * 0.5); s.classList.add("demo-hover"); }],
  ["drag", 900, () => { dock.dataset.resizing = "d"; let t0 = null; const go = (t) => { t0 ??= t; const k = Math.min(1, (t - t0) / 600); d = Math.round(D0 + 28 * k); size(); if (k < 1 && loop) requestAnimationFrame(go); }; requestAnimationFrame(go); }],
  ["release", 1300, () => { delete dock.dataset.resizing; dock.querySelector(".sash-d").classList.remove("demo-hover"); w = W0; d = D0; setTimeout(size, 600); }],
];
let loop = true, i = 0, timer = null;
const say = (k) => { $("say").textContent = ${JSON.stringify(words)}[k]; };
function next() { if (!loop) return; const [k, ms, fn] = steps[i]; say(k); fn(); i = (i + 1) % steps.length; timer = setTimeout(next, ms); }
next();
// The pointer comes in: the loop stops where it is, and the edges are the person's.
$("stage").addEventListener("pointerenter", () => {
  if (!loop) return;
  loop = false; clearTimeout(timer);
  for (const s of document.querySelectorAll(".demo-hover")) s.classList.remove("demo-hover");
  delete panel.dataset.resizing; delete dock.dataset.resizing; w = W0; h = H0; d = D0; size(); say("yours");
});
for (const sash of document.querySelectorAll(".sash")) {
  const edge = sash.dataset.edge, owner = sash.closest(".tool");
  sash.addEventListener("pointermove", (e) => { if (!owner.dataset.resizing) aim(owner, edge, e.clientY, e.clientX); });
  sash.addEventListener("pointerdown", (e) => {
    if (loop) return;
    e.preventDefault(); sash.setPointerCapture(e.pointerId);
    const x0 = e.clientX, y0 = e.clientY, w0 = w, h0 = h, d0 = d;
    owner.dataset.resizing = edge; root.dataset.resizing = edge;
    sash.onpointermove = (ev) => { if (edge === "d") d = clamp(d0 - (ev.clientY - y0), 48, 140); else { if (edge.includes("w")) w = clamp(w0 + x0 - ev.clientX, 120, 240); if (edge.includes("h")) h = clamp(h0 + ev.clientY - y0, 90, 170); } size(); };
    sash.onpointerup = sash.onpointercancel = () => { sash.onpointermove = null; delete owner.dataset.resizing; delete root.dataset.resizing; };
  });
}
size();
</script></body></html>
`;
for (const h of ["arc", "light", "bead"]) { const html = demo(h); writeFileSync(join(here, "handle-demo-" + h + ".html"), html); console.log("handle-demo-" + h + ".html", html.length, "bytes"); }
