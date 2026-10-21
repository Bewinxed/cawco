// Build the pick page the way the hub does (kit CSS and JS in, every {{MK:id}} inlined),
// then render it at 1440×900 in light and dark and prove it:
//   - every card has a question, its options (line, cost), one Recommended, one drawing per option,
//     and a Pick wired to CawCo's bridge contract (data-cawco-choice / data-option);
//   - every drawing animates (no-preference) and settles to a still (reduced motion);
//   - an overflow and overlap sweep across every drawing at six moments of its loop;
//   - captures under ../captures/.
// usage: PW_DIR=<folder with playwright-core> KIT=<decision-page kit> CHROMIUM=<binary> node tools/check.mjs
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = join(dirname(fileURLToPath(import.meta.url)), "..");
const kit = process.env.KIT;
const { chromium } = createRequire(join(process.env.PW_DIR, "/"))("playwright-core");
const out = join(process.env.TMPDIR, "design-graph-build");
mkdirSync(out, { recursive: true });
mkdirSync(join(here, "captures"), { recursive: true });

// ---- Build
let page = readFileSync(join(here, "page.html"), "utf8");
const css = readFileSync(join(kit, "tokens.css"), "utf8") + readFileSync(join(kit, "page.css"), "utf8");
page = page.replace("{{KIT_CSS}}", () => css).replace("{{KIT_JS}}", () => readFileSync(join(kit, "page.js"), "utf8"));
const used = [...page.matchAll(/\{\{MK:([a-z0-9-]+)\}\}/g)].map((m) => m[1]);
const files = readdirSync(join(here, "mockups")).filter((f) => f.endsWith(".html")).map((f) => f.slice(0, -5));
const missing = used.filter((id) => !files.includes(id));
const unused = files.filter((id) => !used.includes(id));
const contract = [];
for (const id of used.filter((x) => files.includes(x))) {
  const src = readFileSync(join(here, "mockups", id + ".html"), "utf8");
  const style = (src.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? "").replace(/\/\*[\s\S]*?\*\//g, "");
  const bad = [...style.replace(/\{[^{}]*\}/g, "{}").matchAll(/(^|[{}])\s*([^{}@\s][^{}]*?)\s*\{/g)].flatMap((m) => m[2].split(",")).map((s) => s.trim()).filter((s) => s && !s.startsWith(".mk-" + id));
  if (bad.length) contract.push(`${id}: selectors outside .mk-${id}: ${bad.join(" | ")}`);
  if (!src.includes(`class="mk mk-${id}`)) contract.push(`${id}: no root .mk.mk-${id}`);
  page = page.replace(`{{MK:${id}}}`, () => src);
}
const pageForSize = page;
page = page.replaceAll('src="caw/', `src="${pathToFileURL(join(kit, "caw")).href}/`);
const leftover = page.match(/\{\{[A-Z_]+(:[a-z0-9-]+)?\}\}/g) || [];
const built = join(out, "page.built.html");
writeFileSync(built, page);
const stills = [...new Set(page.match(/caw\/[a-z-]+\.webp/g) || [])];
const kib = (Buffer.byteLength(pageForSize) + stills.reduce((n, f) => n + Math.ceil(readFileSync(join(kit, f)).length * 4 / 3), 0)) / 1024;
console.log(`build: ${used.length} mockups placed, missing ${missing.length}${missing.length ? " " + missing : ""}, unused ${unused.length}${unused.length ? " " + unused : ""}, leftover placeholders ${leftover.length}, contract faults ${contract.length}`);
for (const c of contract) console.log("  contract:", c);
console.log(`build: the built page ${kib.toFixed(1)} KiB with the kit, the faces and its ${stills.length} Caw stills inlined (limit 512 KiB)${kib > 512 ? " OVER" : ""}`);

// CawCo's bridge, emulated to its documented contract (RECIPES.md, "The bridge"):
// a click on a [data-option] inside a [data-cawco-choice] stores the pick and marks it.
const bridge = () => {
  const picks = {}, subs = [];
  const copy = () => JSON.parse(JSON.stringify(picks));
  const mark = () => document.querySelectorAll("[data-cawco-choice]").forEach((g) => {
    const sel = picks[g.dataset.cawcoChoice]?.options || [];
    g.querySelectorAll("[data-option]").forEach((o) => { const on = sel.includes(o.dataset.option); o.toggleAttribute("data-cawco-picked", on); o.setAttribute("aria-pressed", String(on)); });
  });
  const choose = (id, opt) => { picks[id] = { options: opt == null ? [] : [].concat(opt), note: picks[id]?.note || "" }; mark(); subs.forEach((f) => f(copy())); return Promise.resolve(); };
  document.addEventListener("click", (e) => {
    const o = e.target.closest("[data-option]"), g = o?.closest("[data-cawco-choice]");
    if (!o || !g) return;
    const id = g.dataset.cawcoChoice, cur = picks[id]?.options || [];
    choose(id, cur[0] === o.dataset.option ? null : o.dataset.option);
  });
  window.cawco = { choose, on: (ev, f) => { subs.push(f); f(copy()); return () => {}; }, note: (id, t) => { (picks[id] ||= { options: [] }).note = t; return Promise.resolve(); }, set: () => Promise.resolve(), send: () => Promise.resolve(), _picks: picks };
};

// A whole page goes out as JPEG slices 4,000 CSS px tall at one pixel per CSS px, each well under the hub's 1 MiB per output.
const capPage = async (p, base) => {
  const h = await p.evaluate(() => document.documentElement.scrollHeight), w = await p.evaluate(() => document.documentElement.scrollWidth);
  for (let i = 0, y = 0; y < h; i++, y += 4000) {
    await p.screenshot({ path: join(here, "captures", `${base}-${i + 1}.jpg`), type: "jpeg", quality: 80, scale: "css", fullPage: true, clip: { x: 0, y, width: w, height: Math.min(4000, h - y) } });
  }
};
const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const errors = [];
const open = async (scheme, reduced, vp = {}) => {
  const p = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: scheme, reducedMotion: reduced ? "reduce" : "no-preference", ...vp });
  p.on("pageerror", (e) => errors.push(`${scheme}${reduced ? "/reduced" : ""}: ${e.message}`));
  p.on("console", (m) => { if (m.type() === "error") errors.push(`${scheme} console: ${m.text()}`); });
  await p.addInitScript(bridge);
  await p.goto(pathToFileURL(built).href);
  await p.waitForTimeout(400);
  return p;
};

// ---- Cards and picks (light, motion on: the page as the person meets it)
{
  const p = await open("light", false);
  const cards = await p.evaluate(() => [...document.querySelectorAll("article.dp-card")].map((c) => {
    const g = c.querySelector("[data-cawco-choice]"), opts = g ? [...g.querySelectorAll("[data-option]")] : [];
    return {
      id: c.id, q: c.querySelector("h2")?.textContent.trim() || "", choice: g?.dataset.cawcoChoice, why: !!c.querySelector(".dp-why")?.textContent.trim(),
      options: opts.map((o) => ({ id: o.dataset.option, label: o.querySelector("b")?.textContent.replace(/^\d/, "").trim(), line: !!o.querySelector(":scope > span:not(.dp-cost):not(.dp-tag)")?.textContent.trim(), cost: !!o.querySelector(".dp-cost")?.textContent.trim(), rec: !!o.querySelector(".dp-tag") })),
      drawings: c.querySelectorAll(".dp-pane .mk").length, note: !!c.querySelector(`[data-dp-note="${c.id}"]`),
    };
  }));
  let faults = 0;
  for (const c of cards) {
    const f = [];
    if (!c.q.endsWith("?")) f.push("question has no ?");
    if (c.choice !== c.id) f.push("choice id differs from card id");
    if (!c.why) f.push("no why");
    if (c.options.length < 2) f.push("fewer than 2 options");
    if (c.options.filter((o) => o.rec).length !== 1) f.push("Recommended count " + c.options.filter((o) => o.rec).length);
    for (const o of c.options) { if (!o.line) f.push(o.id + " has no line"); if (!o.cost) f.push(o.id + " has no cost"); }
    if (c.drawings !== c.options.length) f.push(`drawings ${c.drawings} for ${c.options.length} options`);
    if (!c.note) f.push("no note");
    faults += f.length;
    console.log(`card ${c.id}: ${c.options.length} options [${c.options.map((o) => o.id + (o.rec ? "*" : "")).join(", ")}], ${c.drawings} drawings${f.length ? " FAULTS: " + f.join("; ") : ", ok"}`);
  }
  // Wired: pick every option in turn, read the bridge's marks and the card's state line, then clear.
  const wiring = [];
  for (const c of cards) for (const o of c.options) {
    const sel = `[data-cawco-choice="${c.id}"] [data-option="${o.id}"]`;
    await p.click(sel);
    const r = await p.evaluate(([id, opt, sel]) => ({ picked: document.querySelector(sel).hasAttribute("data-cawco-picked"), pressed: document.querySelector(sel).getAttribute("aria-pressed"), others: [...document.querySelectorAll(`[data-cawco-choice="${id}"] [data-option][data-cawco-picked]`)].length, state: document.querySelector(`[data-dp-state="${id}"]`).textContent, stored: window.cawco._picks[id]?.options.join() }), [c.id, o.id, sel]);
    wiring.push(r.picked && r.pressed === "true" && r.others === 1 && r.state === "Picked" && r.stored === o.id);
    if (!wiring.at(-1)) console.log(`  wiring fault ${c.id}/${o.id}`, r);
  }
  for (const c of cards) await p.click(`[data-cawco-choice="${c.id}"] [data-option="${c.options[0].id}"]`);
  const meter = await p.evaluate(() => [document.querySelector("[data-dp-count]").textContent, document.querySelector("[data-dp-total]").textContent]);
  for (const c of cards) await p.click(`[data-cawco-choice="${c.id}"] [data-option="${c.options[0].id}"]`);
  const after = await p.evaluate(() => document.querySelector("[data-dp-count]").textContent);
  console.log(`picks: ${wiring.filter(Boolean).length}/${wiring.length} options pick and mark through the bridge; all nine picked → meter ${meter[0]} of ${meter[1]}; all cleared → ${after}; card faults ${faults}`);

  // Every drawing runs: sample its moving parts twice, 900ms apart, while it is on screen.
  const ids = await p.evaluate(() => [...document.querySelectorAll(".mk")].map((m) => [...m.classList].find((c) => c.startsWith("mk-")).slice(3)));
  const live = [];
  for (const id of ids) {
    await p.evaluate((id) => document.querySelector(".mk-" + id).scrollIntoView({ block: "center" }), id);
    await p.waitForTimeout(350);
    const sig = () => p.evaluate((id) => { const m = document.querySelector(".mk-" + id); return [m.classList.contains("is-live"), [...m.querySelectorAll(".gd-cursor, .dk-ph, .graph, .tool, .dk-bar, .gd-disc, [data-key], .ix-cell")].map((e) => e.getAttribute("style") + e.className.baseVal + e.className + (e.scrollTop | 0)).join("|")]; }, id);
    const seen = new Set(); let on = false;
    for (let i = 0; i < 4; i++) { const [l, s] = await sig(); on ||= l; seen.add(s); await p.waitForTimeout(700); }
    live.push([id, on, seen.size > 1]);
  }
  console.log(`live: ${live.filter(([, l, m]) => l && m).length}/${live.length} drawings live and moving; still by design: ${live.filter(([, , m]) => !m).map(([i]) => i).join(", ") || "none"}`);
  await p.close();
}

// ---- Sweep and captures, reduced motion: every drawing seeked to fixed moments of its loop.
const sweep = (fractions) => {
  const box = (e) => e.getBoundingClientRect();
  const clipBox = (e, root) => {
    let r = box(e), x0 = r.left, y0 = r.top, x1 = r.right, y1 = r.bottom;
    for (let a = e.parentElement; a && a !== root; a = a.parentElement) {
      const cs = getComputedStyle(a);
      if (cs.overflowX !== "visible" || cs.overflowY !== "visible") { const q = box(a); x0 = Math.max(x0, q.left); y0 = Math.max(y0, q.top); x1 = Math.min(x1, q.right); y1 = Math.min(y1, q.bottom); }
    }
    return x1 - x0 > 0.5 && y1 - y0 > 0.5 ? { x0, y0, x1, y1 } : null;
  };
  const shown = (e, root) => {
    for (let a = e; a && a !== root.parentElement; a = a.parentElement) {
      const cs = getComputedStyle(a);
      if (cs.display === "none" || cs.visibility === "hidden" || +cs.opacity < 0.05) return false;
      if (a.hidden) return false;
    }
    return true;
  };
  const skip = (e) => e.closest(".gd-cursor, .gd-key, defs");
  const ownText = (e) => [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
  // A text's ink: the line boxes of its own words (a Range over its text nodes), not the padded box of the element holding them.
  const ink = (e) => [...e.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim()).flatMap((n) => { const r = document.createRange(); r.selectNodeContents(n); return [...r.getClientRects()]; });
  const opaqueBg = (e) => { const n = (getComputedStyle(e).backgroundColor.match(/[\d.]+/g) || []).map(Number); return n.length >= 3 && (n.length < 4 ? 1 : n.at(-1)) > 0.9; };
  // Is e's text seen at (x, y), or covered by an opaque layer (a sticky band) that is not its own background?
  const inView = (e, x, y) => {
    const pane = e.closest(".dp-pane");
    if (pane && (x < 0 || x > innerWidth)) { const before = pane.scrollLeft; pane.scrollLeft += x - innerWidth / 2; x -= pane.scrollLeft - before; }
    if (y < 0 || y > innerHeight) { const d = y + scrollY; scrollTo(scrollX, d - innerHeight / 2); y = d - scrollY; }
    return [x, y];
  };
  const visibleAt = (e, x, y) => {
    [x, y] = inView(e, x, y);
    const stack = document.elementsFromPoint(x, y).filter((el) => !el.closest(".gd-cursor, .gd-key"));
    const i = stack.findIndex((el) => e.contains(el) || el.contains(e));
    if (i < 0) return false;
    return !stack.slice(0, i).some((el) => !el.contains(e) && opaqueBg(el));
  };
  // An overlay (the drawn cursor's arrow, a key cap) through a word: their boxes share more than 2px each way where the word is seen.
  const through = (o, e, root) => {
    const b = o.matches("svg") ? o.querySelector("path").getBoundingClientRect() : o.getBoundingClientRect();
    const c = clipBox(e, root); if (!c) return null;
    for (const r of ink(e)) {
      const x0 = Math.max(b.left, r.left, c.x0), x1 = Math.min(b.right, r.right, c.x1), y0 = Math.max(b.top, r.top, c.y0), y1 = Math.min(b.bottom, r.bottom, c.y1);
      if (x1 - x0 > 2 && y1 - y0 > 2 && visibleAt(e, (x0 + x1) / 2, (y0 + y1) / 2)) return `${(x1 - x0).toFixed(0)}×${(y1 - y0).toFixed(0)}px`;
    }
    return null;
  };
  const res = [];
  // Hit-testing needs every drawn piece to take the pointer for the sweep (the drawings set pointer-events: none).
  const hitStyle = document.createElement("style");
  // …and the sticky option row out of the way, so it never hides a drawing from the hit-test.
  hitStyle.textContent = ".gd, .gd * { pointer-events: auto !important; } .dp-card > .dp-opts { position: static !important; }";
  document.head.append(hitStyle);
  for (const root of document.querySelectorAll(".mk")) {
    root.scrollIntoView({ block: "center" });
    const id = [...root.classList].find((c) => c.startsWith("mk-")).slice(3);
    // Six moments of the loop, its still, and every key frame the captures take.
    const times = root.gdPeriod ? [...new Set(fractions.map((f) => Math.round(f * root.gdPeriod)).concat(root.gdStill, root.gdKeys || []))] : [0];
    const found = new Map();
    for (const t of times) {
      root.gdSeek?.(t);
      const R = box(root);
      const all = [...root.querySelectorAll("*")].filter((e) => !skip(e) && shown(e, root));
      // 1. Out of the drawing: a visible box past the drawing's own edge, the drawn cursor and key included.
      const overlays = [...root.querySelectorAll(".gd-cursor svg, .gd-key")].filter((e) => shown(e, root));
      for (const e of all.concat(overlays)) {
        const c = clipBox(e, root);
        if (c && (c.x0 < R.left - 0.5 || c.x1 > R.right + 0.5 || c.y0 < R.top - 0.5 || c.y1 > R.bottom + 0.5)) found.set("out:" + desc(e), `t=${t} past the drawing's edge by ${Math.max(R.left - c.x0, c.x1 - R.right, R.top - c.y0, c.y1 - R.bottom).toFixed(1)}px`);
      }
      // 2. Spilling its own box: text wider than the box that holds it, with nothing to clip or cut it.
      for (const e of all) {
        if (!(e instanceof HTMLElement) || !ownText(e)) continue;
        const cs = getComputedStyle(e);
        if (cs.overflowX === "visible" && e.clientWidth > 0 && e.scrollWidth > e.clientWidth + 1) found.set("spill:" + desc(e), `t=${t} text ${e.scrollWidth}px in ${e.clientWidth}px`);
      }
      // 3. Overlap: two pieces of text, or text over a control or node it doesn't belong to.
      // A text's ink is its line boxes (getClientRects), clipped like the element: a wrapped inline span is two lines, not one box.
      const lines = (e) => { const c = clipBox(e, root); if (!c) return []; return [...e.getClientRects()].map((r) => ({ x0: Math.max(r.left, c.x0), y0: Math.max(r.top, c.y0), x1: Math.min(r.right, c.x1), y1: Math.min(r.bottom, c.y1) })).filter((r) => r.x1 - r.x0 > 0.5 && r.y1 - r.y0 > 0.5); };
      const sy0 = scrollY, pane0 = root.closest(".dp-pane"), sl0 = pane0 ? pane0.scrollLeft : 0;
      const texts = all.filter((e) => ownText(e) && !e.closest(".gd-xf")).map((e) => [e, lines(e)]).filter(([, c]) => c.length);
      const boxes = all.filter((e) => e.matches(".node, .var, .dk-chip, .dk-tile, .btn, .input, .dk-badge, .dk-btn, .dk-hold, .t-tab, .zoom, .ix-cell, .gd-ic, .gd-curve")).map((e) => [e, clipBox(e, root)]).filter(([, c]) => c);
      // Two boxes overlap when they share more than 2px each way (line boxes of one wrapped span touch by a pixel).
      const inter = (a, b) => { const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0); return w > 2 && h > 2 ? { w, h, cx: Math.max(a.x0, b.x0) + w / 2, cy: Math.max(a.y0, b.y0) + h / 2 } : null; };
      // …and both are seen there: the hit-test stack at the overlap's centre has no opaque layer (a sticky band, a pinned
      // header) between the upper one and the lower one. What scrolls under an opaque band is covered, not overlapping.
      const opaque = (e) => { const n = (getComputedStyle(e).backgroundColor.match(/[\d.]+/g) || []).map(Number); return n.length >= 3 && (n.length < 4 ? 1 : n.at(-1)) > 0.9; };
      const seen = (a, b, x, y) => {
        // Hit-testing reads only the viewport: bring the point into it first (the drawing moves with the page, nothing inside it).
        // Points were measured at (sl0, sy0): carry them to the scroll positions now, then into view.
        y -= scrollY - sy0; x -= (pane0 ? pane0.scrollLeft : 0) - sl0;
        [x, y] = inView(a, x, y);
        const stack = document.elementsFromPoint(x, y).filter((e) => !e.closest(".gd-cursor, .gd-key"));
        const ia = stack.findIndex((e) => a.contains(e)), ib = stack.findIndex((e) => b.contains(e));
        if (ia < 0 || ib < 0) return false;
        const lower = stack[Math.max(ia, ib)];
        return !stack.slice(0, Math.max(ia, ib)).some((e) => !e.contains(lower) && opaque(e));
      };
      const pairs = (la, lb) => { for (const p of la) for (const q of lb) { const r = inter(p, q); if (r) return r; } return null; };
      // 4. An overlay through text: the drawn cursor's arrow or a key cap over any line of the drawing's text.
      for (const o of overlays) for (const [a] of texts) { const r = through(o, a, root); if (r) found.set("overlay:" + (o.matches("svg") ? "cursor" : "key") + " × " + desc(a), `t=${t} ${r}`); }
      for (let i = 0; i < texts.length; i++) for (let j = i + 1; j < texts.length; j++) {
        const [a, la] = texts[i], [b, lb] = texts[j];
        if (a.contains(b) || b.contains(a)) continue;
        const r = pairs(la, lb);
        if (r && seen(a, b, r.cx, r.cy)) found.set("text:" + desc(a) + " × " + desc(b), `t=${t} ${r.w.toFixed(0)}×${r.h.toFixed(0)}px`);
      }
      for (const [a, la] of texts) for (const [b, cb] of boxes) {
        if (b.contains(a) || a.contains(b)) continue;
        const r = pairs(la, [cb]);
        if (r && seen(a, b, r.cx, r.cy)) found.set("over:" + desc(a) + " × " + desc(b), `t=${t} ${r.w.toFixed(0)}×${r.h.toFixed(0)}px`);
      }
    }
    // 5. The same overlay test every 100ms of the loop: a cursor or key that ever crosses a line of text is found.
    for (let t = 0; root.gdPeriod && t < root.gdPeriod; t += 100) {
      root.gdSeek(t);
      const ov = [...root.querySelectorAll(".gd-cursor svg, .gd-key")].filter((e) => shown(e, root));
      if (!ov.length) continue;
      const tl = [...root.querySelectorAll("*")].filter((e) => !skip(e) && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && !e.closest(".gd-xf") && shown(e, root));
      for (const o of ov) for (const e of tl) { const r = through(o, e, root); if (r) found.set("overlay:" + (o.matches("svg") ? "cursor" : "key") + " × " + desc(e), `t=${t} ${r}`); }
    }
    root.gdSeek?.(root.gdStill ?? 0);
    res.push([id, [...found.entries()]]);
  }
  hitStyle.remove();
  scrollTo(0, 0);
  return res;
  function desc(e) { const t = (e.textContent || "").trim().slice(0, 28); return (e.tagName.toLowerCase() + (typeof e.className === "string" && e.className ? "." + e.className.trim().split(/\s+/).join(".") : "")) + (t ? ` "${t}"` : ""); }
};

// Canary: the sweep must see a planted overlap and a planted spill, or its zero means nothing.
{
  const p = await open("light", true);
  const res = await p.evaluate(([fn, fr]) => {
    const root = document.querySelector(".mk-ctx-move"), b = root.querySelector(".node b");
    const r = b.getBoundingClientRect(), R = root.getBoundingClientRect();
    const c1 = document.createElement("span"); c1.textContent = "canary over a title";
    c1.style.cssText = `position:absolute;left:${r.left - R.left}px;top:${r.top - R.top}px;font:13px sans-serif`;
    const c2 = document.createElement("span"); c2.textContent = "canary past the edge";
    c2.style.cssText = `position:absolute;left:${R.width - 40}px;top:0;white-space:nowrap`;
    root.append(c1, c2);
    const out = (0, eval)("(" + fn + ")")(fr).find(([id]) => id === "ctx-move")[1].map(([k]) => k);
    c1.remove(); c2.remove();
    return out;
  }, [sweep.toString(), [0.5]]);
  const overlap = res.some((k) => k.includes("canary over")), spill = res.some((k) => k.startsWith("out:") && k.includes("canary past"));
  console.log(`canary: planted overlap ${overlap ? "found" : "MISSED"}, planted spill ${spill ? "found" : "MISSED"}`);
  await p.close();
}

let total = 0;
for (const scheme of ["light", "dark"]) {
  const p = await open(scheme, true);
  const res = await p.evaluate(sweep, [0.08, 0.25, 0.42, 0.58, 0.75, 0.92]);
  const page = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: innerWidth }));
  const n = res.reduce((s, [, f]) => s + f.length, 0) + (page.sw > page.w ? 1 : 0);
  total += n;
  console.log(`sweep ${scheme}: ${res.length} drawings, each at 6 loop moments, its still and its key frames, overlays every 100ms; page ${page.sw}px wide in ${page.w}px; findings ${n}`);
  for (const [id, f] of res) if (f.length) for (const [k, v] of f) console.log(`  ${id}: ${k} — ${v}`);
  // Captures: the page whole, each card, and each drawing at its still.
  await capPage(p, `page-${scheme}`);
  for (const sel of await p.evaluate(() => [...document.querySelectorAll(".dp-card")].map((c, i) => c.id || "settled"))) {
    await p.locator(sel === "settled" ? ".gd-ctx" : "#" + sel).screenshot({ path: join(here, "captures", `card-${sel}-${scheme}.png`) });
  }
  if (scheme === "light") {
    // Key frames of each drawing's loop, light: the moments its behaviour turns on.
    const keys = await p.evaluate(() => [...document.querySelectorAll(".mk")].map((m) => [[...m.classList].find((c) => c.startsWith("mk-")).slice(3), m.gdPeriod || 0, m.gdKeys || []]));
    for (const [id, period, ks] of keys) {
      if (!period) continue;
      for (const t of ks) {
        await p.evaluate(([id, t]) => document.querySelector(".mk-" + id).gdSeek(t), [id, t]);
        await p.locator(".mk-" + id).screenshot({ path: join(here, "captures", `frame-${id}-${String(t).padStart(5, "0")}.png`) });
      }
      await p.evaluate((id) => { const m = document.querySelector(".mk-" + id); m.gdSeek(m.gdStill); }, id);
    }
  }
  await p.close();
}
console.log(`sweep total findings (light + dark): ${total}`);

// Card chrome over a drawing: any element of a card (its bars, labels, controls, a sticky row) that is not the drawing
// and does not hold it, intersecting the drawing's visible box, read at three scroll positions per drawing, light and dark.
let chromeTotal = 0;
for (const scheme of ["light", "dark"]) {
  const p = await open(scheme, true);
  const hits = await p.evaluate(async () => {
    const frame = () => new Promise((f) => requestAnimationFrame(() => requestAnimationFrame(f)));
    const desc = (e) => e.tagName.toLowerCase() + (typeof e.className === "string" && e.className ? "." + e.className.trim().split(/\s+/).join(".") : "") + ((e.textContent || "").trim() ? ` "${e.textContent.trim().slice(0, 24)}"` : "");
    const out = new Map();
    for (const mk of document.querySelectorAll(".mk")) {
      const id = [...mk.classList].find((c) => c.startsWith("mk-")).slice(3);
      const chrome = [...mk.closest(".dp-card").querySelectorAll("*")].filter((e) => !e.closest(".mk") && !e.querySelector(".mk"));
      const top = mk.getBoundingClientRect().top + scrollY, h = mk.offsetHeight;
      for (const y of [top - 20, top + h / 2 - innerHeight / 2, top + h - innerHeight + 20]) {
        scrollTo(0, y); await frame();
        const R = mk.getBoundingClientRect(), P = mk.closest(".dp-pane").getBoundingClientRect();
        const v = { x0: Math.max(R.left, P.left, 0), y0: Math.max(R.top, P.top, 0), x1: Math.min(R.right, P.right, innerWidth), y1: Math.min(R.bottom, P.bottom, innerHeight) };
        if (v.y1 - v.y0 < 1) continue;
        for (const e of chrome) {
          if (getComputedStyle(e).visibility === "hidden") continue;
          const b = e.getBoundingClientRect(), w = Math.min(b.right, v.x1) - Math.max(b.left, v.x0), hh = Math.min(b.bottom, v.y1) - Math.max(b.top, v.y0);
          if (w > 1 && hh > 1) out.set(`${id}: ${desc(e)}`, `${Math.round(w)}×${Math.round(hh)}px at scroll ${Math.round(scrollY)}`);
        }
      }
    }
    return [...out.entries()];
  });
  chromeTotal += hits.length;
  console.log(`chrome ${scheme}: ${hits.length} card elements over a drawing`);
  for (const [k, v] of hits.slice(0, 40)) console.log(`  ${k} — ${v}`);
  await p.close();
}
console.log(`chrome total (light + dark): ${chromeTotal}`);

// The same sweep and chrome test, and the page's own width, at a laptop, a tablet, a phone under touch and 200% zoom
// (1440×900 zoomed to 200% lays out at 720×450 CSS px). A drawing wider than its card scrolls sideways in its own pane.
const VIEWS = [["1024×768", { viewport: { width: 1024, height: 768 } }], ["768×1024", { viewport: { width: 768, height: 1024 } }], ["390×844 touch", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 }], ["200% zoom", { viewport: { width: 720, height: 450 }, deviceScaleFactor: 2 }]];
let viewTotal = 0;
for (const [name, vp] of VIEWS) {
  const p = await open("light", true, vp);
  const res = await p.evaluate(sweep, [0.25, 0.75]);
  const pageW = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: innerWidth, scrollers: [...document.querySelectorAll(".dp-pane")].filter((e) => e.scrollWidth > e.clientWidth + 1).length }));
  const ch = await p.evaluate(async () => {
    let n = 0;
    for (const mk of document.querySelectorAll(".mk")) {
      const chrome = [...mk.closest(".dp-card").querySelectorAll("*")].filter((e) => !e.closest(".mk") && !e.querySelector(".mk"));
      const top = mk.getBoundingClientRect().top + scrollY, h = mk.offsetHeight;
      for (const y of [top - 20, top + h / 2 - innerHeight / 2, top + h - innerHeight + 20]) {
        scrollTo(0, y); await new Promise((f) => requestAnimationFrame(() => requestAnimationFrame(f)));
        const R = mk.getBoundingClientRect(), P = mk.closest(".dp-pane").getBoundingClientRect();
        const v = { x0: Math.max(R.left, P.left, 0), y0: Math.max(R.top, P.top, 0), x1: Math.min(R.right, P.right, innerWidth), y1: Math.min(R.bottom, P.bottom, innerHeight) };
        if (v.y1 - v.y0 < 1 || v.x1 - v.x0 < 1) continue;
        for (const e of chrome) { const b = e.getBoundingClientRect(); if (Math.min(b.right, v.x1) - Math.max(b.left, v.x0) > 1 && Math.min(b.bottom, v.y1) - Math.max(b.top, v.y0) > 1 && getComputedStyle(e).visibility !== "hidden") n++; }
      }
    }
    return n;
  });
  const n = res.reduce((s, [, f]) => s + f.length, 0) + (pageW.sw > pageW.w ? 1 : 0) + ch;
  viewTotal += n;
  console.log(`view ${name}: page ${pageW.sw}px wide in ${pageW.w}px, ${pageW.scrollers} drawings scroll sideways in their pane, sweep ${res.reduce((s, [, f]) => s + f.length, 0)}, chrome ${ch}; findings ${n}`);
  for (const [id, f] of res) for (const [k, v] of f) console.log(`  ${id}: ${k} — ${v}`);
  await capPage(p, `page-${name.split(" ")[0].replace("%", "pct").replace("×", "x")}-light`);
  await p.close();
}
console.log(`views total: ${viewTotal}`);
console.log(total + chromeTotal + viewTotal ? "CHECK FAILED" : "CHECK PASSED");
console.log(errors.length ? "script errors:\n" + errors.join("\n") : "script errors: none");
const big = readdirSync(join(here, "captures")).map((f) => [f, readFileSync(join(here, "captures", f)).length]).sort((a, b) => b[1] - a[1]);
console.log(`captures: ${big.length} files, largest ${big[0][0]} ${(big[0][1] / 1048576).toFixed(2)} MiB, ${big.filter(([, n]) => n > 1048576).length} over 1 MiB`);
await browser.close();
