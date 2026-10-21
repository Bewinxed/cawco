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
page = page.replaceAll('src="caw/', `src="${pathToFileURL(join(kit, "caw")).href}/`);
const leftover = page.match(/\{\{[A-Z_]+(:[a-z0-9-]+)?\}\}/g) || [];
const built = join(out, "page.built.html");
writeFileSync(built, page);
const kib = (Buffer.byteLength(readFileSync(join(here, "page.html"))) + used.reduce((n, id) => n + (files.includes(id) ? Buffer.byteLength(readFileSync(join(here, "mockups", id + ".html"))) : 0), 0)) / 1024;
console.log(`build: ${used.length} mockups placed, missing ${missing.length}${missing.length ? " " + missing : ""}, unused ${unused.length}${unused.length ? " " + unused : ""}, leftover placeholders ${leftover.length}, contract faults ${contract.length}`);
for (const c of contract) console.log("  contract:", c);
console.log(`build: page + mockups ${kib.toFixed(1)} KiB before the hub adds the kit (limit 512 KiB)`);

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

const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const errors = [];
const open = async (scheme, reduced) => {
  const p = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: scheme, reducedMotion: reduced ? "reduce" : "no-preference" });
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
  const res = [];
  // Hit-testing needs every drawn piece to take the pointer for the sweep (the drawings set pointer-events: none).
  const hitStyle = document.createElement("style");
  // …and the sticky option row out of the way, so it never hides a drawing from the hit-test.
  hitStyle.textContent = ".gd, .gd * { pointer-events: auto !important; } .dp-card > .dp-opts { position: static !important; }";
  document.head.append(hitStyle);
  for (const root of document.querySelectorAll(".mk")) {
    root.scrollIntoView({ block: "center" });
    const id = [...root.classList].find((c) => c.startsWith("mk-")).slice(3);
    const times = root.gdPeriod ? fractions.map((f) => Math.round(f * root.gdPeriod)).concat(root.gdStill) : [0];
    const found = new Map();
    for (const t of times) {
      root.gdSeek?.(t);
      const R = box(root);
      const all = [...root.querySelectorAll("*")].filter((e) => !skip(e) && shown(e, root));
      // 1. Out of the drawing: a visible box past the drawing's own edge.
      for (const e of all) {
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
      const sy0 = scrollY;
      const texts = all.filter((e) => ownText(e) && !e.closest(".gd-xf")).map((e) => [e, lines(e)]).filter(([, c]) => c.length);
      const boxes = all.filter((e) => e.matches(".node, .var, .dk-chip, .dk-tile, .btn, .input, .dk-badge, .dk-btn, .dk-hold, .t-tab, .zoom, .ix-cell")).map((e) => [e, clipBox(e, root)]).filter(([, c]) => c);
      // Two boxes overlap when they share more than 2px each way (line boxes of one wrapped span touch by a pixel).
      const inter = (a, b) => { const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0); return w > 2 && h > 2 ? { w, h, cx: Math.max(a.x0, b.x0) + w / 2, cy: Math.max(a.y0, b.y0) + h / 2 } : null; };
      // …and both are seen there: the hit-test stack at the overlap's centre has no opaque layer (a sticky band, a pinned
      // header) between the upper one and the lower one. What scrolls under an opaque band is covered, not overlapping.
      const opaque = (e) => { const n = (getComputedStyle(e).backgroundColor.match(/[\d.]+/g) || []).map(Number); return n.length >= 3 && (n.length < 4 ? 1 : n.at(-1)) > 0.9; };
      const seen = (a, b, x, y) => {
        // Hit-testing reads only the viewport: bring the point into it first (the drawing moves with the page, nothing inside it).
        const docY = y + sy0;
        y = docY - scrollY;
        if (y < 0 || y > innerHeight) { scrollTo(0, docY - innerHeight / 2); y = docY - scrollY; }
        const stack = document.elementsFromPoint(x, y).filter((e) => !e.closest(".gd-cursor, .gd-key"));
        const ia = stack.findIndex((e) => a.contains(e)), ib = stack.findIndex((e) => b.contains(e));
        if (ia < 0 || ib < 0) return false;
        const lower = stack[Math.max(ia, ib)];
        return !stack.slice(0, Math.max(ia, ib)).some((e) => !e.contains(lower) && opaque(e));
      };
      const pairs = (la, lb) => { for (const p of la) for (const q of lb) { const r = inter(p, q); if (r) return r; } return null; };
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
  console.log(`sweep ${scheme}: ${res.length} drawings × 7 moments; page ${page.sw}px wide in ${page.w}px; findings ${n}`);
  for (const [id, f] of res) if (f.length) for (const [k, v] of f) console.log(`  ${id}: ${k} — ${v}`);
  // Captures: the page whole, each card, and each drawing at its still.
  await p.screenshot({ path: join(here, "captures", `page-${scheme}.png`), fullPage: true });
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
console.log(errors.length ? "script errors:\n" + errors.join("\n") : "script errors: none");
await browser.close();
