/**
 * Dashboard perf profile via Brave + CDP.
 * No npm packages — Node 24 built-in fetch + WebSocket.
 *
 * Usage: node perf-profile.mjs [url]
 */
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const TARGET = process.argv[2] || "http://localhost:3000";
const CDP_PORT = 9234;

// ── Launch Brave headless with CDP ──────────────────────────────────
const brave = spawn(
  "brave-browser",
  [
    "--headless=new",
    `--remote-debugging-port=${CDP_PORT}`,
    "--disable-gpu",
    "--window-size=1440,900",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-extensions",
    "about:blank",
  ],
  { stdio: "ignore", detached: true }
);

await sleep(2000); // let it start

async function cdpHttp(path) {
  const res = await fetch(`http://127.0.0.1:${CDP_PORT}${path}`);
  return res.json();
}

// ── Connect CDP WebSocket ───────────────────────────────────────────
const targets = await cdpHttp("/json/list");
const pageTarget = targets.find((t) => t.type === "page");
if (!pageTarget) {
  console.error("No page target");
  process.exit(1);
}

const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r));

let msgId = 0;
const pending = new Map();

ws.addEventListener("message", (ev) => {
  const msg = JSON.parse(ev.data);
  // biome-ignore lint/suspicious/noEqualsToNull: must catch both null and undefined msg.id (CDP notifications omit id)
  if (msg.id != null && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  }
});

function cdp(method, params = {}) {
  return new Promise((resolve, reject) => {
    msgId += 1;
    const id = msgId;
    pending.set(id, (msg) =>
      msg.error ? reject(msg.error) : resolve(msg.result)
    );
    ws.send(JSON.stringify({ id, method, params }));
  });
}

// ── Helpers ─────────────────────────────────────────────────────────
async function evaluate(expr) {
  const r = await cdp("Runtime.evaluate", {
    expression: expr,
    returnByValue: true,
    awaitPromise: true,
  });
  return r.result?.value;
}

async function getMetrics() {
  const r = await cdp("Performance.getMetrics");
  const map = {};
  for (const m of r.metrics) {
    map[m.name] = m.value;
  }
  return map;
}

// ──────────────────────────────────────────────────────────────────────
console.log("\n=== CAWCO DASHBOARD PERFORMANCE PROFILE ===");
console.log(`URL: ${TARGET}\n`);

await cdp("Performance.enable");

// ── 1. PAGE LOAD ────────────────────────────────────────────────────
console.log("── 1. PAGE LOAD ──");
const t0 = Date.now();
await cdp("Page.enable");
await cdp("Page.navigate", { url: TARGET });
// Wait for the load event via CDP event, not a method call
await new Promise((r) => {
  const handler = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.method === "Page.loadEventFired") {
      ws.removeEventListener("message", handler);
      r();
    }
  };
  ws.addEventListener("message", handler);
});
await sleep(3000); // let Svelte hydrate + WS connect + frames land
const loadMs = Date.now() - t0;
console.log(`  Load → idle: ${loadMs}ms`);

// Find a session with messages and navigate to it
const sessionId = await evaluate(`(() => {
  const d = window.__cawcoDebug;
  if (!d?.state?.sessions) return null;
  // Find first session that has a running instance
  const instances = d.state.instances || [];
  const running = instances.filter(r => r.status === 'running' || r.status === 'starting');
  if (running.length > 0) return running[0].id;
  // Fallback: any session in the store
  const keys = Object.keys(d.state.sessions);
  return keys[0] || null;
})()`);

if (sessionId) {
  console.log(`  → Opening session ${sessionId.slice(0, 8)}...`);
  await cdp("Page.navigate", { url: `${TARGET}/session/${sessionId}` });
  await new Promise((r) => {
    const handler = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.method === "Page.loadEventFired") {
        ws.removeEventListener("message", handler);
        r();
      }
    };
    ws.addEventListener("message", handler);
  });
  await sleep(5000); // let transcript load, backfill, frames stream
  console.log("  Session loaded.");
} else {
  console.log("  (no session found — profiling the board)");
}

const m1 = await getMetrics();
console.log(`  DOM nodes: ${m1.Nodes}`);
console.log(`  JS event listeners: ${m1.JSEventListeners}`);
console.log(`  Layouts: ${m1.LayoutCount}`);
console.log(`  Style recalcs: ${m1.RecalcStyleCount}`);
console.log(`  Layout duration: ${(m1.LayoutDuration * 1000).toFixed(1)}ms`);
console.log(
  `  Recalc style duration: ${(m1.RecalcStyleDuration * 1000).toFixed(1)}ms`
);
console.log(`  Script duration: ${(m1.ScriptDuration * 1000).toFixed(1)}ms`);
console.log(`  Task duration: ${(m1.TaskDuration * 1000).toFixed(1)}ms`);

const heap1 = await evaluate(`performance.memory ? ({
  used: Math.round(performance.memory.usedJSHeapSize/1024/1024),
  total: Math.round(performance.memory.totalJSHeapSize/1024/1024)
}) : null`);
if (heap1) {
  console.log(`  JS heap: ${heap1.used}MB / ${heap1.total}MB`);
}

// ── 2. DOM INVENTORY ────────────────────────────────────────────────
console.log("\n── 2. DOM INVENTORY ──");
const domStats = await evaluate(`(() => {
  const all = document.querySelectorAll('*').length;
  const tabs = [...document.querySelectorAll('[role="tab"]')].map(t => ({
    label: t.textContent?.trim().slice(0, 30),
    selected: t.getAttribute('aria-selected'),
    dataTab: t.getAttribute('data-tab') || 'none',
  }));
  const panes = document.querySelectorAll('[class*="absolute inset-0 flex"]').length;
  const scroller = document.querySelector('[tabindex="-1"].overflow-y-auto');
  return {
    all, tabs, panes,
    scrollerHeight: scroller?.scrollHeight ?? 0,
    scrollerChildren: scroller?.firstElementChild?.children?.length ?? 0,
  };
})()`);
console.log(`  Total elements: ${domStats.all}`);
console.log(`  Session panes mounted: ${domStats.panes}`);
console.log(`  Tabs: ${domStats.tabs.length}`);
for (const t of domStats.tabs) {
  console.log(
    `    ${t.selected === "true" ? "→" : " "} "${t.label}" [${t.dataTab.slice(0, 8)}]`
  );
}
console.log(`  Scroller height: ${domStats.scrollerHeight}px`);
console.log(`  Virtualizer children: ${domStats.scrollerChildren}`);

// ── 3. GPU-HEAVY CSS ────────────────────────────────────────────────
console.log("\n── 3. GPU-HEAVY CSS ──");
const gpuCss = await evaluate(`(() => {
  let backdrop = 0, shadow = 0, filter = 0, willChange = 0;
  for (const el of document.querySelectorAll('*')) {
    const s = getComputedStyle(el);
    if (s.backdropFilter && s.backdropFilter !== 'none') backdrop++;
    if (s.boxShadow && s.boxShadow !== 'none') shadow++;
    if (s.filter && s.filter !== 'none') filter++;
    if (s.willChange && s.willChange !== 'auto') willChange++;
  }
  return { backdrop, shadow, filter, willChange };
})()`);
console.log(`  backdrop-filter: ${gpuCss.backdrop} elements`);
console.log(`  box-shadow: ${gpuCss.shadow} elements`);
console.log(`  filter: ${gpuCss.filter} elements`);
console.log(`  will-change: ${gpuCss.willChange} elements`);

// ── 4. STORE STATE ──────────────────────────────────────────────────
console.log("\n── 4. STORE STATE ──");
const storeStats = await evaluate(`(() => {
  const d = window.__cawcoDebug;
  if (!d?.state?.sessions) return { sessions: 0, messages: 0, instances: 0 };
  let messages = 0;
  const sessions = Object.keys(d.state.sessions).length;
  for (const s of Object.values(d.state.sessions)) {
    if (s?.messages) messages += s.messages.length;
  }
  return { sessions, messages, instances: d.state.instances?.length ?? 0 };
})()`);
console.log(`  Sessions in store: ${storeStats.sessions}`);
console.log(`  Total messages: ${storeStats.messages}`);
console.log(`  Instance rows: ${storeStats.instances}`);

// ── 5. IDLE FPS ─────────────────────────────────────────────────────
console.log("\n── 5. IDLE FPS (2s sample) ──");
const idleFps = await evaluate(`new Promise(resolve => {
  const times = [];
  let n = 0;
  function tick(ts) {
    times.push(ts);
    if (++n < 120) requestAnimationFrame(tick);
    else {
      const deltas = [];
      for (let i = 1; i < times.length; i++) deltas.push(times[i] - times[i-1]);
      const avg = deltas.reduce((a,b) => a+b, 0) / deltas.length;
      resolve({
        avgMs: +avg.toFixed(1),
        fps: +(1000/avg).toFixed(0),
        maxMs: +Math.max(...deltas).toFixed(1),
        dropped: deltas.filter(d => d > 25).length,
        jank: deltas.filter(d => d > 50).length,
        total: deltas.length,
      });
    }
  }
  requestAnimationFrame(tick);
})`);
console.log(`  Avg frame: ${idleFps.avgMs}ms (${idleFps.fps} FPS)`);
console.log(`  Max frame: ${idleFps.maxMs}ms`);
console.log(`  Dropped (>25ms): ${idleFps.dropped}/${idleFps.total}`);
console.log(`  Jank (>50ms): ${idleFps.jank}/${idleFps.total}`);

// ── 6. TAB SWITCH ───────────────────────────────────────────────────
console.log("\n── 6. TAB SWITCH ──");
const otherTabs = domStats.tabs.filter(
  (t) => t.dataTab !== "none" && t.selected !== "true"
);
if (otherTabs.length > 0) {
  const [target] = otherTabs;
  console.log(`  Switching to "${target.label}"...`);

  // Reset perf counters
  await cdp("Performance.disable");
  await cdp("Performance.enable");

  const heapBefore = await evaluate("performance.memory?.usedJSHeapSize ?? 0");
  const switchT0 = Date.now();

  // Click the tab
  const box = await evaluate(`(() => {
    const el = document.querySelector('[data-tab="${target.dataTab}"]');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width/2, y: r.y + r.height/2 };
  })()`);

  if (box) {
    await cdp("Input.dispatchMouseEvent", {
      type: "mousePressed",
      x: box.x,
      y: box.y,
      button: "left",
      clickCount: 1,
    });
    await cdp("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x: box.x,
      y: box.y,
      button: "left",
      clickCount: 1,
    });
  }

  await sleep(800); // settle

  const switchMs = Date.now() - switchT0;
  const heapAfter = await evaluate("performance.memory?.usedJSHeapSize ?? 0");
  const m2 = await getMetrics();

  console.log(`  Switch time: ${switchMs}ms`);
  console.log(`  Heap delta: ${Math.round((heapAfter - heapBefore) / 1024)}KB`);
  console.log(`  Layouts: ${m2.LayoutCount}`);
  console.log(`  Style recalcs: ${m2.RecalcStyleCount}`);
  console.log(`  Layout duration: ${(m2.LayoutDuration * 1000).toFixed(1)}ms`);
  console.log(`  Script duration: ${(m2.ScriptDuration * 1000).toFixed(1)}ms`);

  // FPS right after switch
  const switchFps = await evaluate(`new Promise(resolve => {
    const times = [];
    let n = 0;
    function tick(ts) {
      times.push(ts);
      if (++n < 60) requestAnimationFrame(tick);
      else {
        const deltas = [];
        for (let i = 1; i < times.length; i++) deltas.push(times[i] - times[i-1]);
        const avg = deltas.reduce((a,b) => a+b, 0) / deltas.length;
        resolve({
          avgMs: +avg.toFixed(1),
          fps: +(1000/avg).toFixed(0),
          jank: deltas.filter(d => d > 50).length,
        });
      }
    }
    requestAnimationFrame(tick);
  })`);
  console.log(
    `  Post-switch FPS: ${switchFps.fps} (jank frames: ${switchFps.jank})`
  );
} else {
  console.log("  (only one tab open — nothing to switch to)");
}

// ── 7. SCROLL PERF (CDP trace) ──────────────────────────────────────
console.log("\n── 7. SCROLL PERFORMANCE ──");
const canScroll = await evaluate(
  `!!document.querySelector('[tabindex="-1"].overflow-y-auto')`
);

if (canScroll) {
  await cdp("Performance.disable");
  await cdp("Performance.enable");

  // Trace during scroll
  await cdp("Tracing.start", {
    categories: "devtools.timeline,disabled-by-default-devtools.timeline.frame",
  });

  // Scroll 20 steps
  await evaluate(`(() => {
    const el = document.querySelector('[tabindex="-1"].overflow-y-auto');
    let i = 0;
    function step() {
      el.scrollBy(0, 300);
      if (++i < 20) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  })()`);
  await sleep(600);

  const chunks = [];
  const collected = new Promise((r) => {
    const handler = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.method === "Tracing.dataCollected") {
        chunks.push(...msg.params.value);
      }
      if (msg.method === "Tracing.tracingComplete") {
        ws.removeEventListener("message", handler);
        r();
      }
    };
    ws.addEventListener("message", handler);
  });
  await cdp("Tracing.end");
  await collected;

  const timeline = chunks.filter((e) => e.cat?.includes("devtools.timeline"));
  const paints = timeline.filter((e) => e.name === "Paint");
  const layouts = timeline.filter((e) => e.name === "Layout");
  const recalcs = timeline.filter(
    (e) => e.name === "UpdateLayoutTree" || e.name === "RecalcStyles"
  );
  const composites = timeline.filter((e) => e.name === "CompositeLayers");
  const longLayouts = layouts.filter((e) => e.dur && e.dur > 5000);
  const longRecalcs = recalcs.filter((e) => e.dur && e.dur > 5000);

  console.log(`  Paints: ${paints.length}`);
  console.log(`  Layouts: ${layouts.length}  (>5ms: ${longLayouts.length})`);
  if (longLayouts.length) {
    console.log(
      `    Worst: ${(Math.max(...longLayouts.map((e) => e.dur)) / 1000).toFixed(1)}ms`
    );
  }
  console.log(
    `  Style recalcs: ${recalcs.length}  (>5ms: ${longRecalcs.length})`
  );
  if (longRecalcs.length) {
    console.log(
      `    Worst: ${(Math.max(...longRecalcs.map((e) => e.dur)) / 1000).toFixed(1)}ms`
    );
  }
  console.log(`  CompositeLayers: ${composites.length}`);

  const m3 = await getMetrics();
  console.log(
    `  Post-scroll script duration: ${(m3.ScriptDuration * 1000).toFixed(1)}ms`
  );
} else {
  console.log("  (no scroller found)");
}

// ── 8. FINAL HEAP ───────────────────────────────────────────────────
console.log("\n── 8. FINAL STATE ──");
const finalHeap = await evaluate(`performance.memory ? ({
  used: Math.round(performance.memory.usedJSHeapSize/1024/1024),
  total: Math.round(performance.memory.totalJSHeapSize/1024/1024)
}) : null`);
if (finalHeap) {
  console.log(`  JS heap: ${finalHeap.used}MB / ${finalHeap.total}MB`);
}

const finalDom = await evaluate(`document.querySelectorAll('*').length`);
console.log(`  DOM nodes: ${finalDom}`);

console.log("\n=== DONE ===\n");

ws.close();
brave.kill();
process.exit(0);
