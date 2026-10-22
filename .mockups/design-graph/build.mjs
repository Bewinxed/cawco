// Builds page.html from its parts: the kit's tokens, the house faces, style.css, body.html, then dagre,
// the glyphs and app.js inlined. Run from anywhere: node .mockups/design-graph/build.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const here = dirname(fileURLToPath(import.meta.url)), repo = join(here, "../..");
const read = (p) => readFileSync(join(here, p), "utf8");
const tokens = readFileSync(join(repo, "packages/hub/skills/decision-page/kit/tokens.css"), "utf8");
const face = (family, file, weights) => `@font-face { font-family: "${family}"; src: url(data:font/woff2;base64,${readFileSync(join(here, "fonts", file)).toString("base64")}) format("woff2"); font-weight: ${weights}; font-style: normal; font-display: block; }`;
const fonts = [
  "/* The house faces (DESIGN.md Typography), subset to Latin from apps/apple/.../Resources/Fonts; OFL, see fonts/. */",
  face("Figtree Variable", "figtree-latin.woff2", "300 900"),
  face("JetBrains Mono Variable", "jetbrains-mono-latin.woff2", "100 800"),
].join("\n");
const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Design graph mockup</title>
<style>
/* CawCo tokens (packages/hub/skills/decision-page/kit/tokens.css, built from design/tokens) */
${tokens}
</style>
<style>
${fonts}
</style>
<style>
${read("style.css")}
</style>
</head>
${read("body.html")}
${read("dagre.js")}
${read("icons.js")}
${read("app.js")}
</script></body></html>
`;
writeFileSync(join(here, "page.html"), html);
console.log("page.html", html.length, "bytes");

// The handle's demo (round 28): page.html itself, four times, each a 1:1 window onto the panel's resizing
// corner or the dock's top edge, by day and at night. Each plays its loop (#demo=…, app.js) until a pointer
// comes in; then it is the real page under the person's hand.
const crop = (which, theme) => {
  const words = which === "corner" ? "The panel's corner" : "The dock's top edge";
  // The pointer the system would draw over the page: the resize cursor for that edge (the corner's diagonal,
  // the dock's vertical), black with a white keyline as the platform draws it.
  const cursor = which === "corner"
    ? `<path d="M3 3h7L7.6 5.4l11 11L21 14v7h-7l2.4-2.4-11-11L3 10z" fill="#000" stroke="#fff" stroke-width="1.5" stroke-linejoin="round" transform="rotate(90 12 12)"/>`
    : `<path d="M12 1.5l5 5.5h-3.4v10H17l-5 5.5L7 17h3.4V7H7z" fill="#000" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/>`;
  return `<figure class="crop" data-demo="${which}" data-theme="${theme}"><div class="win"><iframe src="page.html#demo=${which}${theme === "dark" ? "&theme=dark" : ""}" title="${words}, ${theme === "dark" ? "at night" : "by day"}" width="1440" height="900"></iframe><svg class="cursor" viewBox="0 0 24 24" aria-hidden="true">${cursor}</svg></div><figcaption><b>${words}</b> · <span class="step">At rest</span></figcaption></figure>`;
};
const demo = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>The resize handle, on the page</title>
<style>
${tokens}
</style>
<style>
${fonts}
</style>
<style>
:root { color-scheme: light dark; }
* { box-sizing: border-box; }
body { margin: 0; padding: var(--space-5); font: var(--type-body); background: var(--surface-raised); color: var(--ink-strong); -webkit-font-smoothing: antialiased; }
.row { display: flex; flex-wrap: wrap; gap: var(--space-5); padding: var(--space-5); border-radius: var(--radius-panel); }
.row[data-theme="dark"] { color-scheme: dark; background: var(--surface-raised); color: var(--ink-strong); }
.crop { margin: 0; display: flex; flex-direction: column; gap: var(--space-2); }
/* A window onto the page at 1:1: the page's own ground and marks, nothing drawn over them. */
.win { position: relative; overflow: hidden; border-radius: var(--radius-lg); border: 1px solid var(--border-control); }
.crop[data-demo="corner"] .win { inline-size: 320px; block-size: 260px; }
.crop[data-demo="dock"] .win { inline-size: 320px; block-size: 140px; }
.win iframe { position: absolute; border: 0; inset-inline-start: 0; inset-block-start: 0; }
/* The drawn pointer: it comes in at the grip, rides the drag, and goes when it lets go. Its hot spot (the
   glyph's centre) stands on the grip's own hit area. */
.cursor { position: absolute; inline-size: 20px; block-size: 20px; margin: -10px 0 0 -10px; pointer-events: none; opacity: 0; transition: opacity var(--dur-control) var(--ease-out); }
.cursor[data-on] { opacity: 1; }
.cursor[data-drag] { transition: opacity var(--dur-control) var(--ease-out), translate 800ms cubic-bezier(0.33, 1, 0.68, 1); }
.cursor[data-back] { transition: opacity var(--dur-control) var(--ease-out), translate 500ms cubic-bezier(0.33, 1, 0.68, 1); }
figcaption { font: var(--type-meta); color: var(--ink-muted); }
figcaption b { font-weight: var(--weight-strong); color: var(--ink-strong); }
</style>
</head>
<body>
<div class="row" data-theme="light">${crop("corner", "light")}${crop("dock", "light")}</div>
<div class="row" data-theme="dark">${crop("corner", "dark")}${crop("dock", "dark")}</div>
<script>
// Where each window holds its anchor at rest: the corner low and left (a drag takes it 40px left and 30px
// down, its highlight 136px up and right), the dock's edge low in the middle (a drag lifts it 40px).
const AT = { corner: [70, 200], dock: [160, 90] };
const WORDS = { rest: "At rest", pointing: "The pointer arrives", drag: "Dragging it wider", release: "Let go", reset: "Let go", yours: "Your turn: point at it, then drag" };
addEventListener("message", (e) => {
  const d = e.data || {}, f = [...document.querySelectorAll(".crop")].find((x) => x.querySelector("iframe").contentWindow === e.source);
  if (!f || !d.step) return;
  f.querySelector(".step").textContent = d.step === "drag" && d.demo === "dock" ? "Dragging it taller" : WORDS[d.step] || d.step;
  if (!f.dataset.placed && d.step === "rest") { const [ax, ay] = AT[d.demo], fr = f.querySelector("iframe"); fr.style.left = Math.round(ax - d.x) + "px"; fr.style.top = Math.round(ay - d.y) + "px"; f.dataset.placed = ""; }
  // The drawn pointer: on the grip (the corner's square 6px in from the corner, the dock's band on its edge),
  // then the same travel as the drag (the corner 40px out and 30px down, the dock's edge 40px up), back on reset.
  const c = f.querySelector(".cursor"), [ax, ay] = AT[d.demo], grip = d.demo === "corner" ? [ax + 6, ay - 6] : [ax, ay], move = d.demo === "corner" ? "-40px 30px" : "0 -40px";
  c.style.left = grip[0] + "px"; c.style.top = grip[1] + "px";
  delete c.dataset.drag; delete c.dataset.back;
  if (d.step === "pointing") { c.style.translate = "0 0"; c.dataset.on = ""; }
  else if (d.step === "drag") { c.dataset.drag = ""; c.style.translate = move; }
  else if (d.step === "reset") { delete c.dataset.on; c.dataset.back = ""; c.style.translate = "0 0"; }
  else if (d.step === "rest" || d.step === "yours") { delete c.dataset.on; c.style.translate = "0 0"; }
});
</script>
</body></html>
`;
writeFileSync(join(here, "handle-demo.html"), demo);
console.log("handle-demo.html", demo.length, "bytes");
