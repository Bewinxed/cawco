// Read the drawings' engine for the design facts the page claims, light and dark (reduced motion, each drawing at
// its still or a named moment). Run after check.mjs, which writes the built page.
// usage: PW_DIR=… CHROMIUM=… node tools/probe.mjs
import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const { chromium } = createRequire(join(process.env.PW_DIR, "/"))("playwright-core");
const built = join(process.env.TMPDIR, "design-graph-build", "page.built.html");
const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});

for (const scheme of ["light", "dark"]) {
  const p = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: scheme, reducedMotion: "reduce" });
  await p.goto(pathToFileURL(built).href);
  await p.waitForTimeout(300);
  const r = await p.evaluate(() => {
    const cv = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
    const rgba = (c) => { cv.clearRect(0, 0, 1, 1); cv.fillStyle = "#000"; cv.fillStyle = c; cv.fillRect(0, 0, 1, 1); return [...cv.getImageData(0, 0, 1, 1).data]; };
    const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
    // A token's colour as the page resolves it (light-dark() and var() included), through a probe element.
    const probe = document.createElement("span"); document.querySelector(".gd").append(probe);
    const tokRGB = (n) => { probe.style.color = `var(${n})`; return rgba(getComputedStyle(probe).color).slice(0, 3).join(); };
    const coral = new Set(["--brand-solid", "--selected-bg", "--chip-chosen-bg", "--selected-ink"].map(tokRGB));
    const out = {};
    const mk = (id) => document.querySelector(".mk-" + id);
    const all = [...document.querySelectorAll(".gd *")].filter((e) => !e.closest(".gd-cursor, .gd-key"));
    // 1. Coral in the settled drawing: every element whose fill, edge, ink or stroke is a coral role token.
    const ctx = mk("ctx-move"); ctx.gdSeek(ctx.gdStill);
    const corals = [];
    for (const e of ctx.querySelectorAll("*")) {
      const cs = getComputedStyle(e);
      const isCoral = (c) => { const v = rgba(c); return v[3] > 0 && coral.has(v.slice(0, 3).join()); };
      const hits = ["backgroundColor", "borderTopColor", "color", "fill", "stroke"].filter((k) => cs[k] && cs[k] !== "none" && isCoral(cs[k]) && (k !== "borderTopColor" || parseFloat(cs.borderTopWidth) > 0) && (k !== "color" || [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) && (k !== "fill" && k !== "stroke" || e instanceof SVGElement));
      if (hits.length && e.getBoundingClientRect().width > 0 && +cs.opacity > 0) corals.push(`${e.tagName.toLowerCase()}.${(e.getAttribute("class") || "").trim().replace(/\s+/g, ".")}${e.textContent.trim() ? ` "${e.textContent.trim().slice(0, 22)}"` : ""} (${hits.join("+")})`);
    }
    for (const pe of ["::before", "::after"]) { const cs = getComputedStyle(ctx.querySelector(".dk-ph"), pe); if (coral.has(rgba(cs.backgroundColor).slice(0, 3).join())) corals.push(`dk-ph${pe} (playhead)`); }
    probe.remove();
    out.coral = corals;
    // 2. Type: weights and sizes used by any drawn text.
    const ws = new Map();
    for (const e of all) if ([...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) { const cs = getComputedStyle(e); const k = `${cs.fontSize} ${cs.fontWeight}`; ws.set(k, (ws.get(k) || 0) + 1); }
    out.type = [...ws.entries()].sort().map(([k, n]) => `${k}×${n}`);
    // 3. Notes and variant chips: never cut.
    out.notesCut = [...document.querySelectorAll(".gd .node p, .gd .var")].filter((e) => e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1 || getComputedStyle(e).textOverflow === "ellipsis").length;
    out.notes = document.querySelectorAll(".gd .node p").length;
    // 4. The lit edge: one per drawing that keeps a state with an edge into it, coral and 2px; the disc on it mid-play.
    const lit = [...ctx.querySelectorAll("polyline.kept")];
    const pl = lit[0], disc = ctx.querySelector(".gd-disc");
    const len = pl.getTotalLength(), dx = +disc.getAttribute("cx"), dy = +disc.getAttribute("cy");
    let dmin = 1e9; for (let s = 0; s <= len; s += 0.5) { const q = pl.getPointAtLength(s); dmin = Math.min(dmin, Math.hypot(q.x - dx, q.y - dy)); }
    out.lit = `${lit.length} lit edge, stroke ${getComputedStyle(pl).strokeWidth}, disc ${disc.getAttribute("opacity") > 0 ? "shown" : "hidden"} ${dmin.toFixed(2)}px off the edge, dock playhead at ${ctx.querySelector(".dk-ph").style.insetInlineStart} of the lane and the disc at ${(() => { let best = 0, bd = 1e9; for (let s = 0; s <= len; s += 0.5) { const q = pl.getPointAtLength(s); const d = Math.hypot(q.x - dx, q.y - dy); if (d < bd) { bd = d; best = s; } } return ((100 * best) / len).toFixed(1); })()}% of the edge`;
    // 5. Edge labels: knocked out (paint-order stroke), clear of every node.
    const labels = [...document.querySelectorAll(".gd .world svg text")];
    const clash = labels.filter((t) => { const b = t.getBoundingClientRect(); return [...t.closest(".mk").querySelectorAll(".node")].map((n) => n.getBoundingClientRect()).some((n) => Math.min(b.right, n.right) - Math.max(b.left, n.left) > 0 && Math.min(b.bottom, n.bottom) - Math.max(b.top, n.top) > 0); }).length;
    out.labels = `${labels.length} edge labels, paint-order "${getComputedStyle(labels[0]).paintOrder}", ${clash} touching a node`;
    // 6. Sashes (round 20 §1 A): the lit line sits on the panel's border.
    const re = mk("resize-edges"); re.gdSeek(2200);
    const panel = re.querySelector(".panel"), sw = re.querySelector(".sw"), sa = getComputedStyle(sw, "::after");
    const lineX = sw.getBoundingClientRect().left + parseFloat(sa.left) + parseFloat(sa.width) / 2, borderX = panel.getBoundingClientRect().left + 0.5;
    out.sash = `left line opacity ${sa.opacity}, width ${sa.width}, centre ${(lineX - borderX).toFixed(2)}px from the border's centre; panel ${panel.offsetWidth}px wide mid-drag, foot padding ${getComputedStyle(panel).paddingBottom}`;
    re.gdSeek(re.gdStill);
    // 7. The band (clarity §2 A): one row at 448px, four cells, its height.
    const band = mk("names-band").querySelector(".ix"), cells = [...band.children];
    out.band = `${cells.length} cells, ${new Set(cells.map((c) => Math.round(c.getBoundingClientRect().top))).size} row(s), band ${band.offsetHeight}px tall in a ${mk("names-band").querySelector(".graph").clientWidth}px well`;
    // 8. Contrast: every drawn text against the first opaque surface under it.
    const bgOf = (e) => { for (let a = e; a; a = a.parentElement) { const c = rgba(getComputedStyle(a).backgroundColor); if (c[3] > 240) return c; } return rgba(getComputedStyle(document.body).backgroundColor); };
    const low = [];
    let min = 99;
    for (const e of all) {
      if (!(e instanceof HTMLElement) || ![...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
      let op = 1; for (let a = e; a; a = a.parentElement) op *= +getComputedStyle(a).opacity;
      if (op < 0.95 || !e.getBoundingClientRect().width) continue;
      const f = lum(rgba(getComputedStyle(e).color)), b = lum(bgOf(e)), ratio = (Math.max(f, b) + 0.05) / (Math.min(f, b) + 0.05);
      min = Math.min(min, ratio);
      if (ratio < 4.5) low.push(`${ratio.toFixed(2)} "${e.textContent.trim().slice(0, 24)}" (${e.className || e.tagName})`);
    }
    out.contrast = `min ${min.toFixed(2)}; under 4.5: ${low.length}${low.length ? " → " + [...new Set(low)].slice(0, 12).join("; ") : ""}`;
    return out;
  });
  // 9. Each drawing and its pick in one view: scroll every option's drawing to the view's top; its own button must be in view under it.
  r.together = await p.evaluate(async () => {
    const rows = [];
    for (const opt of document.querySelectorAll(".gd-opt")) {
      const pane = opt.querySelector(".dp-pane"), btn = opt.querySelector("[data-option]");
      scrollTo(0, pane.getBoundingClientRect().top + scrollY - 24);
      await new Promise((f) => requestAnimationFrame(() => requestAnimationFrame(f)));
      const o = btn.getBoundingClientRect(), q = pane.getBoundingClientRect();
      rows.push(q.top >= 0 && o.top >= q.bottom && o.bottom <= innerHeight + 0.5);
    }
    return `${rows.filter(Boolean).length} of ${rows.length} drawings stand in one view with their own pick button under them`;
  });
  console.log(`== ${scheme}`);
  for (const [k, v] of Object.entries(r)) console.log(`${k}: ${Array.isArray(v) ? v.join(" | ") : v}`);
  await p.close();
}
await browser.close();
