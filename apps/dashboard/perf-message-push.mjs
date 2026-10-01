/**
 * Focused message-push profiler: navigates to a session with messages,
 * waits for the transcript to render, then pushes messages one at a time
 * with tracing active. Measures actual rendering cost per message.
 */
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const TARGET = process.argv[2] || "http://localhost:3000";
const CDP_PORT = 9237;

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

await sleep(2000);

const targets = await (
  await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)
).json();
const ws = new WebSocket(
  targets.find((t) => t.type === "page").webSocketDebuggerUrl
);
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

console.log("\n=== MESSAGE PUSH PROFILER ===\n");

await cdp("Performance.enable");
await cdp("Page.enable");

// Find a session with messages
await cdp("Page.navigate", { url: TARGET });
await new Promise((r) => {
  const h = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.method === "Page.loadEventFired") {
      ws.removeEventListener("message", h);
      r();
    }
  };
  ws.addEventListener("message", h);
});
await sleep(3000);

const sessions = await evaluate(`(() => {
  const d = window.__cawcoDebug;
  if (!d?.state) return [];
  return (d.state.instances || [])
    .filter(r => r.status === 'running' || r.status === 'starting')
    .map(r => ({
      id: r.id,
      cwd: r.cwd,
      msgs: d.state.sessions?.[r.id]?.messages?.length ?? 0,
    }))
    .sort((a, b) => b.msgs - a.msgs);
})()`);

const [chosen] = sessions;
if (!chosen) {
  console.log("No running sessions found");
  ws.close();
  brave.kill();
  process.exit(0);
}
console.log(
  `Session: ${chosen.id.slice(0, 8)} — ${chosen.cwd} (${chosen.msgs} messages)\n`
);

// Navigate to the session
await cdp("Page.navigate", { url: `${TARGET}/session/${chosen.id}` });
await new Promise((r) => {
  const h = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.method === "Page.loadEventFired") {
      ws.removeEventListener("message", h);
      r();
    }
  };
  ws.addEventListener("message", h);
});
// Poll for transcript to appear (backfill can take several seconds)
let transcriptCheck;
for (let attempt = 0; attempt < 15; attempt += 1) {
  // biome-ignore lint/performance/noAwaitInLoops: polls until the transcript backfills; each attempt must wait for the previous sleep+check
  await sleep(2000);
  transcriptCheck = await evaluate(`(() => {
    const transcript = document.querySelector('[data-transcript-content]');
    const scroller = document.querySelector('[tabindex="-1"]');
    const msgCount = window.__cawcoDebug?.state?.sessions?.['${chosen.id}']?.messages?.length ?? 0;
    return {
      hasTranscript: !!transcript,
      hasScroller: !!scroller,
      dom: document.querySelectorAll('*').length,
      scrollerChildren: scroller?.firstElementChild?.children?.length ?? 0,
      scrollerHeight: scroller?.scrollHeight ?? 0,
      messages: msgCount,
    };
  })()`);
  console.log(
    `  poll ${attempt}: transcript=${transcriptCheck.hasTranscript} scroller=${transcriptCheck.hasScroller} msgs=${transcriptCheck.messages} dom=${transcriptCheck.dom}`
  );
  if (transcriptCheck.hasTranscript && transcriptCheck.messages > 0) {
    break;
  }
}

console.log(`\nTranscript: ${transcriptCheck.hasTranscript ? "YES" : "NO"}`);
console.log(
  `Scroller: ${transcriptCheck.hasScroller ? "YES" : "NO"}, children: ${transcriptCheck.scrollerChildren}`
);
console.log(`DOM nodes: ${transcriptCheck.dom}`);
console.log(`Messages loaded: ${transcriptCheck.messages}`);
console.log(`Scroller height: ${transcriptCheck.scrollerHeight}px\n`);

if (!transcriptCheck.hasTranscript) {
  console.log("No transcript rendered — cannot test message push cost");
  ws.close();
  brave.kill();
  process.exit(0);
}

// ── BASELINE: Metrics before pushing ────────────────────────────────
const baseline = await getMetrics();
const baseHeap = await evaluate("performance.memory?.usedJSHeapSize ?? 0");

console.log("── BASELINE ──");
console.log(`  DOM: ${baseline.Nodes}`);
console.log(`  Heap: ${Math.round(baseHeap / 1024 / 1024)}MB`);
console.log(`  Script: ${(baseline.ScriptDuration * 1000).toFixed(1)}ms`);
console.log(`  Layout: ${(baseline.LayoutDuration * 1000).toFixed(1)}ms`);
console.log(`  Recalc: ${(baseline.RecalcStyleDuration * 1000).toFixed(1)}ms`);

// ── PUSH 10 MESSAGES with individual tracing ────────────────────────
console.log("\n── MESSAGE PUSH (10 messages, traced individually) ──");

const pushResults = [];

for (let i = 0; i < 10; i += 1) {
  // Take a snapshot before
  // biome-ignore lint/performance/noAwaitInLoops: each iteration traces and measures one message push before moving to the next
  const before = await getMetrics();

  // Start tracing
  await cdp("Tracing.start", {
    categories: "devtools.timeline,disabled-by-default-devtools.timeline.frame",
  });

  // Push one message and wait for rendering
  const _pushResult = await evaluate(`new Promise(resolve => {
    const d = window.__cawcoDebug;
    const s = d?.state?.sessions?.['${chosen.id}'];
    if (!s) { resolve({ error: 'no session' }); return; }

    const before = s.messages.length;

    // Push one message
    s.messages.push({
      id: 'perf-push-${i}-' + Date.now(),
      instanceId: '${chosen.id}',
      type: 'assistant',
      content: 'Performance test message ${i}. This is a simulated assistant response with enough text to trigger markdown parsing, layout computation, and virtual list item measurement by the Virtualizer. It includes multiple sentences to ensure the rendering pipeline processes a realistic payload rather than a trivial empty string.',
      timestamp: new Date(),
      metadata: {},
    });

    // Wait for two rAF cycles to ensure rendering completes
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        resolve({
          messageCount: s.messages.length,
          delta: s.messages.length - before,
        });
      });
    });
  })`);

  // Wait a bit for rendering to settle
  await sleep(200);

  // Collect trace
  const chunks = [];
  const traceDone = new Promise((r) => {
    const h = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.method === "Tracing.dataCollected") {
        chunks.push(...msg.params.value);
      }
      if (msg.method === "Tracing.tracingComplete") {
        ws.removeEventListener("message", h);
        r();
      }
    };
    ws.addEventListener("message", h);
  });
  await cdp("Tracing.end");
  await traceDone;

  const after = await getMetrics();

  const timeline = chunks.filter((e) => e.cat?.includes("devtools.timeline"));
  const layouts = timeline.filter((e) => e.name === "Layout");
  const recalcs = timeline.filter(
    (e) => e.name === "UpdateLayoutTree" || e.name === "RecalcStyles"
  );
  const funcCalls = timeline.filter(
    (e) => e.name === "FunctionCall" && e.dur > 1000
  );

  const deltaScript = (after.ScriptDuration - before.ScriptDuration) * 1000;
  const deltaLayout = (after.LayoutDuration - before.LayoutDuration) * 1000;
  const deltaRecalc =
    (after.RecalcStyleDuration - before.RecalcStyleDuration) * 1000;
  const deltaDom = after.Nodes - before.Nodes;

  pushResults.push({
    i,
    deltaScript: +deltaScript.toFixed(1),
    deltaLayout: +deltaLayout.toFixed(1),
    deltaRecalc: +deltaRecalc.toFixed(1),
    deltaDom,
    layouts: layouts.length,
    recalcs: recalcs.length,
    longRecalcs: recalcs.filter((e) => e.dur > 5000).length,
    longLayouts: layouts.filter((e) => e.dur > 5000).length,
    longFuncs: funcCalls.length,
    worstRecalc: recalcs.length
      ? +(Math.max(...recalcs.map((e) => e.dur || 0)) / 1000).toFixed(1)
      : 0,
    worstLayout: layouts.length
      ? +(Math.max(...layouts.map((e) => e.dur || 0)) / 1000).toFixed(1)
      : 0,
  });

  console.log(
    `  [${i}] script: ${deltaScript.toFixed(1)}ms  layout: ${deltaLayout.toFixed(1)}ms  recalc: ${deltaRecalc.toFixed(1)}ms  DOM: ${deltaDom > 0 ? "+" : ""}${deltaDom}  layouts: ${layouts.length}  recalcs: ${recalcs.length}`
  );
}

// Summary
console.log("\n── SUMMARY ──");
const avgScript =
  pushResults.reduce((a, r) => a + r.deltaScript, 0) / pushResults.length;
const avgLayout =
  pushResults.reduce((a, r) => a + r.deltaLayout, 0) / pushResults.length;
const avgRecalc =
  pushResults.reduce((a, r) => a + r.deltaRecalc, 0) / pushResults.length;
const maxScript = Math.max(...pushResults.map((r) => r.deltaScript));
const maxRecalc = Math.max(...pushResults.map((r) => r.deltaRecalc));
const worstRecalcMs = Math.max(...pushResults.map((r) => r.worstRecalc));
const totalLongRecalcs = pushResults.reduce((a, r) => a + r.longRecalcs, 0);
const totalRecalcs = pushResults.reduce((a, r) => a + r.recalcs, 0);
const totalLayouts = pushResults.reduce((a, r) => a + r.layouts, 0);

console.log(
  `  Avg per message:  script=${avgScript.toFixed(1)}ms  layout=${avgLayout.toFixed(1)}ms  recalc=${avgRecalc.toFixed(1)}ms`
);
console.log(
  `  Max per message:  script=${maxScript.toFixed(1)}ms  recalc=${maxRecalc.toFixed(1)}ms`
);
console.log(
  `  Total per message: ${(avgScript + avgLayout + avgRecalc).toFixed(1)}ms avg`
);
console.log(
  `  Total recalcs: ${totalRecalcs}  (>5ms: ${totalLongRecalcs})  worst: ${worstRecalcMs}ms`
);
console.log(`  Total layouts: ${totalLayouts}`);
console.log(
  `  Frame budget verdict: ${(avgScript + avgLayout + avgRecalc) < 16 ? "WITHIN 16ms ✓" : "OVER 16ms ✗"}`
);

// ── CLEANUP ─────────────────────────────────────────────────────────
await evaluate(`(() => {
  const s = window.__cawcoDebug?.state?.sessions?.['${chosen.id}'];
  if (!s) return;
  s.messages = s.messages.filter(m => !m.id?.startsWith('perf-push-'));
})()`);

const finalHeap = await evaluate("performance.memory?.usedJSHeapSize ?? 0");
const finalDom = await evaluate(`document.querySelectorAll('*').length`);
console.log("\n── FINAL STATE ──");
console.log(`  DOM: ${finalDom} (was ${transcriptCheck.dom})`);
console.log(
  `  Heap: ${Math.round(finalHeap / 1024 / 1024)}MB (was ${Math.round(baseHeap / 1024 / 1024)}MB)`
);

console.log("\n=== DONE ===\n");
ws.close();
brave.kill();
process.exit(0);
