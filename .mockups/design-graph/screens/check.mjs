// The proof for the owner's page of every screen (index.html, built by build.mjs): its size, each frame's
// class, each loop running, and each loop scrubbed to three moments on the DevTools Animation domain with
// the frame's state read back from the mockup itself; then reduced motion, and the reviewer's captures.
//   node .mockups/design-graph/screens/check.mjs
import { mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
const { chromium } = await import(join(here, "../../../node_modules/playwright-core/index.mjs"));
const CHROME = process.env.CHROME || process.env.HOME + "/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome";
const URL_ = "file://" + join(here, "index.html");
const CAPS = join(here, "../captures");
mkdirSync(CAPS, { recursive: true });
let fails = 0, passes = 0;
const ok = (view, name, pass, detail = "") => { pass ? passes++ : fails++; console.log((pass ? "PASS" : "FAIL") + " [" + view + "] " + name + (detail ? " — " + detail : "")); };

const size = statSync(join(here, "index.html")).size;
ok("page", "under 512 KiB", size < 512 * 1024, (size / 1024).toFixed(1) + " KiB");

// Three moments of each loop (ms on its 9 s clock) and what the mockup must hold at each.
const MOMENTS = {
  "phone-portrait": [[600, { kept: "save:failed", peek: null, stop: "peek" }], [2200, { kept: "save:failed", peek: "save:saving", washes: ">0" }], [5200, { kept: "save:created", peek: null }]],
  "tablet-portrait": [[600, { stop: "peek", face: "graph" }], [2600, { stop: "full", face: "graph" }], [4700, { stop: "peek", face: "move", time: ">0" }]],
  "phone-landscape": [[600, { face: "graph", open: true }], [3200, { face: "move", pop: "reveal", popInline: true }], [5600, { open: false }]],
  "tablet-landscape": [[600, { dockH: "base", lit: false }], [2600, { dockH: "base+180", lit: false }], [6200, { dockH: "base", time: ">0" }]],
  desk: [[600, { dockH: "base", peek: null }], [1900, { lit: true, dockH: "between" }], [3800, { peek: "save:saving", washes: ">0", dockH: "base+160" }]],
  wide: [[600, { peek: null }], [1500, { peek: "types:loading" }], [4700, { time: ">0", peek: null }]],
  "ultrawide-2560": [[600, { tab: "form" }], [3000, { tab: "row", peek: "runs:running" }], [4500, { tab: "row", time: ">0" }]],
  "ultrawide-3440": [[600, { kept: "save:failed", peek: null }], [1500, { peek: "save:created" }], [3000, { kept: "save:created" }]],
};
const CLASS = { "phone-portrait": "phone-portrait", "tablet-portrait": "tablet-portrait", "phone-landscape": "phone-landscape", "tablet-landscape": "tablet-landscape", desk: "desk", wide: "wide", "ultrawide-2560": "ultrawide", "ultrawide-3440": "ultrawide" };

const browser = await chromium.launch({ executablePath: CHROME });
{
  const V = "page 1100";
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 2600 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Animation.enable");
  const started = new Map();
  cdp.on("Animation.animationStarted", (e) => started.set(e.animation.id, e.animation));
  await page.goto(URL_);
  await page.waitForFunction(() => [...document.querySelectorAll(".ds-shot iframe")].every((f) => f.contentWindow.__dg) && document.getAnimations().filter((a) => a.playState === "running").length === 8, null, { timeout: 30000 });
  await page.waitForTimeout(400);
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const shots = await ev(() => [...document.querySelectorAll(".ds-shot")].map((f) => ({ loop: f.dataset.loop, screen: f.querySelector("iframe").contentWindow.document.documentElement.dataset.screen, layout: f.querySelector("iframe").contentWindow.document.documentElement.dataset.layout, input: f.querySelector("iframe").contentWindow.document.documentElement.dataset.input, w: f.querySelector("iframe").contentWindow.innerWidth, h: f.querySelector("iframe").contentWindow.innerHeight, want: [+f.dataset.w, +f.dataset.h], s: +getComputedStyle(f).getPropertyValue("--ds-s") })));
  for (const s of shots) ok(V, "frame " + s.loop + ": the mockup at its real size (" + s.want.join("×") + ") reads its class, " + CLASS[s.loop] + ", scaled " + s.s.toFixed(3) + " into its outline", s.w === s.want[0] && s.h === s.want[1] && s.screen === CLASS[s.loop] && s.s > 0, JSON.stringify(s));
  // Running: every loop's clock moves.
  const t0 = await ev(() => document.getAnimations().map((a) => ({ state: a.playState, t: a.currentTime })));
  await page.waitForTimeout(500);
  const t1 = await ev(() => document.getAnimations().map((a) => ({ state: a.playState, t: a.currentTime })));
  ok(V, "8 loops running, each clock advancing", t1.length === 8 && t1.every((a, i) => a.state === "running" && a.t > t0[i].t), t1.map((a, i) => a.state + " " + Math.round(t0[i].t) + "→" + Math.round(a.t)).join(", "));
  // The Animation domain: each loop's animation by its target's shot.
  const ids = {};
  await cdp.send("DOM.getDocument", { depth: -1 });
  for (const [id, a] of started) {
    if (a.type !== "WebAnimation" || !a.source || !a.source.backendNodeId) continue;
    // Animations inside the frames (the mockup's own) resolve in their own documents: only this page's count.
    const node = await cdp.send("DOM.resolveNode", { backendNodeId: a.source.backendNodeId }).catch(() => null);
    if (!node) continue;
    const { object } = node;
    const { result } = await cdp.send("Runtime.callFunctionOn", { objectId: object.objectId, functionDeclaration: "function () { const f = this.closest('.ds-shot'); return f ? f.dataset.loop : null; }", returnByValue: true });
    if (result.value) ids[result.value] = id;
  }
  ok(V, "the Animation domain sees all 8 loops", Object.keys(ids).length === 8, Object.entries(ids).map(([k, v]) => k + "=" + v).join(", "));
  await cdp.send("Animation.setPaused", { animations: Object.values(ids), paused: true });
  const frames = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r))));
  const read = (loop) => ev((loop) => document.querySelector('.ds-shot[data-loop="' + loop + '"] iframe').contentWindow.__dg.read(), loop);
  const base = {};
  for (const loop of Object.keys(MOMENTS)) { await cdp.send("Animation.seekAnimations", { animations: [ids[loop]], currentTime: 10 }); await ev(frames); await page.waitForTimeout(80); base[loop] = (await read(loop)).dockH; }
  for (let m = 0; m < 3; m++) {
    for (const [loop, list] of Object.entries(MOMENTS)) {
      const [at, want] = list[m];
      await cdp.send("Animation.seekAnimations", { animations: [ids[loop]], currentTime: at });
      await ev(frames); await page.waitForTimeout(120);
      const got = await read(loop), cur = await ev((loop) => Math.round(document.querySelector('.ds-shot[data-loop="' + loop + '"] .ds-dot').getAnimations()[0].currentTime), loop);
      const bad = Object.entries(want).filter(([k, v]) => {
        const g = got[k];
        if (v === ">0") return !(g > 0);
        if (k === "dockH") { const b0 = base[loop]; return v === "base" ? Math.abs(g - b0) > 1 : v === "between" ? !(g > b0 + 1 && g < b0 + 159) : Math.abs(g - (b0 + +v.split("+")[1])) > 1; }
        return g !== v;
      });
      ok(V, "loop " + loop + " scrubbed to " + at + " ms (moment " + (m + 1) + "): the mockup holds that scene", cur === at && bad.length === 0, "clock " + cur + " ms; " + (bad.length ? "WRONG " + bad.map(([k, v]) => k + " " + JSON.stringify(got[k]) + " (want " + v + ")").join(", ") + "; " : "") + JSON.stringify(got));
    }
    await page.screenshot({ path: join(CAPS, "screens-moment-" + (m + 1) + ".jpg"), type: "jpeg", quality: 80, fullPage: true });
  }
  await cdp.send("Animation.setPaused", { animations: Object.values(ids), paused: false });
  ok(V, "no page or frame errors", errors.length === 0, errors.join(" | "));
  await ctx.close();
}
{
  const V = "page reduced";
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 2600 }, reducedMotion: "reduce", deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(URL_);
  await page.waitForFunction(() => [...document.querySelectorAll(".ds-shot iframe")].every((f) => f.contentWindow.__dg) && document.getAnimations().length === 8, null, { timeout: 30000 });
  await page.waitForTimeout(800);
  const r = await page.evaluate(() => ({ running: document.getAnimations().filter((a) => a.playState === "running").length, live: document.querySelector(".mk").classList.contains("is-live"), states: [...document.querySelectorAll(".ds-shot")].map((f) => f.dataset.loop + ":" + JSON.stringify(f.querySelector("iframe").contentWindow.__dg.read())) }));
  await page.waitForTimeout(600);
  const r2 = await page.evaluate(() => [...document.querySelectorAll(".ds-shot")].map((f) => f.dataset.loop + ":" + JSON.stringify(f.querySelector("iframe").contentWindow.__dg.read())));
  ok(V, "under reduced motion nothing moves: no loop runs, each frame rests on its key scene", r.running === 0 && !r.live && r.states.every((s, i) => s === r2[i]), "running " + r.running + "; " + r.states.map((s) => s.slice(0, 90)).join(" | "));
  await page.screenshot({ path: join(CAPS, "screens-reduced.jpg"), type: "jpeg", quality: 80, fullPage: true });
  ok(V, "no page errors", errors.length === 0, errors.join(" | "));
  await ctx.close();
}
await browser.close();
console.log("\n" + passes + " passed, " + fails + " failed");
process.exit(fails ? 1 : 0);
