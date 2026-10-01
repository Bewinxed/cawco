/**
 * Part 2: Tab switch + streaming simulation.
 * Opens multiple session tabs, switches between them, simulates message arrival.
 */
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const TARGET = process.argv[2] || "http://localhost:3000";
const CDP_PORT = 9235;

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

console.log("\n=== PART 2: TAB SWITCH + STREAMING SIMULATION ===\n");

await cdp("Performance.enable");
await cdp("Page.enable");

// Load and wait
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

// Find running sessions
const sessionIds = await evaluate(`(() => {
  const d = window.__cawcoDebug;
  if (!d?.state) return [];
  const instances = d.state.instances || [];
  return instances
    .filter(r => r.status === 'running' || r.status === 'starting')
    .map(r => r.id);
})()`);

console.log(`Running sessions: ${sessionIds.length}`);
if (sessionIds.length === 0) {
  console.log("No running sessions — cannot test tab switch.");
  ws.close();
  brave.kill();
  process.exit(0);
}

// Open first session
const [first] = sessionIds;
console.log(`\n── 1. OPEN FIRST SESSION: ${first.slice(0, 8)} ──`);
await cdp("Page.navigate", { url: `${TARGET}/session/${first}` });
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
await sleep(4000);

const firstStats = await evaluate(`(() => {
  const d = window.__cawcoDebug?.state;
  const s = d?.sessions?.['${first}'];
  return {
    messages: s?.messages?.length ?? 0,
    busy: s?.busy ?? false,
    streaming: (s?.streaming ?? '').length,
    subagents: Object.keys(s?.subagents ?? {}).length,
    pending: s?.pending?.length ?? 0,
  };
})()`);
console.log(`  Messages: ${firstStats.messages}`);
console.log(
  `  Busy: ${firstStats.busy}, streaming chars: ${firstStats.streaming}`
);
console.log(
  `  Subagents: ${firstStats.subagents}, pending permissions: ${firstStats.pending}`
);

const dom1 = await evaluate(`document.querySelectorAll('*').length`);
const heap1 = await evaluate("performance.memory?.usedJSHeapSize ?? 0");
console.log(`  DOM nodes: ${dom1}`);
console.log(`  Heap: ${Math.round(heap1 / 1024 / 1024)}MB`);

// Open a second session if available
if (sessionIds.length >= 2) {
  const [, second] = sessionIds;
  console.log(`\n── 2. OPEN SECOND SESSION TAB: ${second.slice(0, 8)} ──`);

  // Click in sidebar or navigate directly
  await evaluate(`window.history.pushState(null, '', '/session/${second}')`);
  await cdp("Page.navigate", { url: `${TARGET}/session/${second}` });
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
  await sleep(4000);

  const dom2 = await evaluate(`document.querySelectorAll('*').length`);
  const heap2 = await evaluate("performance.memory?.usedJSHeapSize ?? 0");
  console.log(`  DOM nodes: ${dom2} (delta: ${dom2 - dom1})`);
  console.log(
    `  Heap: ${Math.round(heap2 / 1024 / 1024)}MB (delta: ${Math.round((heap2 - heap1) / 1024)}KB)`
  );

  // Now switch back to first session and measure
  console.log(
    `\n── 3. TAB SWITCH: ${second.slice(0, 8)} → ${first.slice(0, 8)} ──`
  );
  await cdp("Performance.disable");
  await cdp("Performance.enable");

  const switchHeapBefore = await evaluate(
    "performance.memory?.usedJSHeapSize ?? 0"
  );

  // Trace during switch
  await cdp("Tracing.start", {
    categories: "devtools.timeline,disabled-by-default-devtools.timeline.frame",
  });

  const switchT0 = Date.now();
  await cdp("Page.navigate", { url: `${TARGET}/session/${first}` });
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
  await sleep(2000);
  const switchMs = Date.now() - switchT0;

  // Collect trace
  const chunks = [];
  const traceComplete = new Promise((r) => {
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
  await traceComplete;

  const switchHeapAfter = await evaluate(
    "performance.memory?.usedJSHeapSize ?? 0"
  );
  const m3 = await getMetrics();

  const timeline = chunks.filter((e) => e.cat?.includes("devtools.timeline"));
  const layouts = timeline.filter((e) => e.name === "Layout");
  const recalcs = timeline.filter(
    (e) => e.name === "UpdateLayoutTree" || e.name === "RecalcStyles"
  );
  const longLayouts = layouts.filter((e) => e.dur && e.dur > 8000);
  const longRecalcs = recalcs.filter((e) => e.dur && e.dur > 8000);
  const evals = timeline.filter((e) => e.name === "EvaluateScript");
  const longEvals = evals.filter((e) => e.dur && e.dur > 10_000);

  console.log(`  Switch wall-clock: ${switchMs}ms`);
  console.log(
    `  Heap delta: ${Math.round((switchHeapAfter - switchHeapBefore) / 1024)}KB`
  );
  console.log(`  Layouts: ${layouts.length}  (>8ms: ${longLayouts.length})`);
  if (longLayouts.length) {
    for (const l of longLayouts.slice(0, 3)) {
      console.log(`    Layout: ${(l.dur / 1000).toFixed(1)}ms`);
    }
  }
  console.log(
    `  Style recalcs: ${recalcs.length}  (>8ms: ${longRecalcs.length})`
  );
  if (longRecalcs.length) {
    for (const r of longRecalcs.slice(0, 3)) {
      console.log(`    Recalc: ${(r.dur / 1000).toFixed(1)}ms`);
    }
  }
  console.log(
    `  Script evaluations: ${evals.length}  (>10ms: ${longEvals.length})`
  );
  console.log(
    `  Layout duration (cumulative): ${(m3.LayoutDuration * 1000).toFixed(1)}ms`
  );
  console.log(
    `  Style recalc duration (cumulative): ${(m3.RecalcStyleDuration * 1000).toFixed(1)}ms`
  );
  console.log(
    `  Script duration (cumulative): ${(m3.ScriptDuration * 1000).toFixed(1)}ms`
  );
}

// ── 4. SIMULATE STREAMING ───────────────────────────────────────────
console.log("\n── 4. SIMULATED STREAMING (rapid DOM growth) ──");

// Inject text into the store's streaming field to simulate incoming tokens
await cdp("Performance.disable");
await cdp("Performance.enable");

const [activeSession] = sessionIds;

// Measure FPS during simulated streaming
const streamFps = await evaluate(`(() => {
  const d = window.__cawcoDebug;
  const s = d?.state?.sessions?.['${activeSession}'];
  if (!s) return { error: 'no session' };

  return new Promise(resolve => {
    // Simulate 60 streaming frames
    let i = 0;
    const text = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. ';
    const times = [];

    function tick(ts) {
      times.push(ts);
      // Push streaming text like a real frame would
      s.streaming += text;
      s.busy = true;
      if (++i < 60) requestAnimationFrame(tick);
      else {
        // Clean up
        s.streaming = '';
        s.busy = false;

        const deltas = [];
        for (let j = 1; j < times.length; j++) deltas.push(times[j] - times[j-1]);
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
  });
})()`);

if (streamFps.error) {
  console.log(`  ${streamFps.error}`);
} else {
  console.log(`  Avg frame: ${streamFps.avgMs}ms (${streamFps.fps} FPS)`);
  console.log(`  Max frame: ${streamFps.maxMs}ms`);
  console.log(`  Dropped (>25ms): ${streamFps.dropped}/${streamFps.total}`);
  console.log(`  Jank (>50ms): ${streamFps.jank}/${streamFps.total}`);
}

const m4 = await getMetrics();
console.log(
  `  Layout duration (streaming): ${(m4.LayoutDuration * 1000).toFixed(1)}ms`
);
console.log(
  `  Recalc style duration (streaming): ${(m4.RecalcStyleDuration * 1000).toFixed(1)}ms`
);
console.log(
  `  Script duration (streaming): ${(m4.ScriptDuration * 1000).toFixed(1)}ms`
);

// ── 5. SIMULATE MESSAGE PUSH ────────────────────────────────────────
console.log("\n── 5. SIMULATED MESSAGE PUSH (10 messages) ──");
await cdp("Performance.disable");
await cdp("Performance.enable");

const pushFps = await evaluate(`(() => {
  const d = window.__cawcoDebug;
  const s = d?.state?.sessions?.['${activeSession}'];
  if (!s) return { error: 'no session' };

  const before = s.messages.length;

  return new Promise(resolve => {
    let i = 0;
    const times = [];

    function tick(ts) {
      times.push(ts);
      // Push a message like handleFrame would
      s.messages.push({
        id: 'perf-test-' + i,
        instanceId: '${activeSession}',
        type: 'assistant',
        content: 'Test message ' + i + '. This is a simulated assistant response to measure rendering performance when new messages arrive in the transcript. It should be long enough to require markdown parsing and layout computation.',
        timestamp: new Date(),
        metadata: {},
      });
      if (++i < 10) {
        // Wait 100ms between messages like real frames
        setTimeout(() => requestAnimationFrame(tick), 100);
      } else {
        setTimeout(() => {
          // Clean up
          s.messages.splice(before);

          const deltas = [];
          for (let j = 1; j < times.length; j++) deltas.push(times[j] - times[j-1]);
          const avg = deltas.length ? deltas.reduce((a,b) => a+b, 0) / deltas.length : 0;
          resolve({
            avgMs: +avg.toFixed(1),
            maxMs: deltas.length ? +Math.max(...deltas).toFixed(1) : 0,
            jank: deltas.filter(d => d > 50).length,
            total: deltas.length,
          });
        }, 200);
      }
    }
    requestAnimationFrame(tick);
  });
})()`);

if (pushFps.error) {
  console.log(`  ${pushFps.error}`);
} else {
  console.log(`  Avg inter-message time: ${pushFps.avgMs}ms`);
  console.log(`  Max inter-message time: ${pushFps.maxMs}ms`);
  console.log(`  Jank frames (>50ms): ${pushFps.jank}/${pushFps.total}`);
}

const m5 = await getMetrics();
console.log(`  Layout duration: ${(m5.LayoutDuration * 1000).toFixed(1)}ms`);
console.log(
  `  Recalc style duration: ${(m5.RecalcStyleDuration * 1000).toFixed(1)}ms`
);
console.log(`  Script duration: ${(m5.ScriptDuration * 1000).toFixed(1)}ms`);

// ── 6. WHAT'S EXPENSIVE — per-component cost ────────────────────────
console.log("\n── 6. COMPONENT COST BREAKDOWN ──");
const componentStats = await evaluate(`(() => {
  const transcript = document.querySelector('[data-transcript-content]');
  if (!transcript) return { error: 'no transcript' };

  // Count visible rendered items
  const groups = transcript.querySelectorAll('[data-transcript-content] > div > div');
  const markdownBlocks = transcript.querySelectorAll('.prose, [class*="prose"]');
  const codeBlocks = transcript.querySelectorAll('pre code, [class*="OutputBlock"]');
  const collapsibles = transcript.querySelectorAll('[data-slot="collapsible-trigger"]');
  const toolRows = transcript.querySelectorAll('[class*="tool-"]');
  const shadows = transcript.querySelectorAll('[class*="shadow"]');

  // The backdrop-blur at the bottom
  const backdrop = document.querySelector('.backdrop-blur-sm');
  let backdropRect = null;
  if (backdrop) {
    const r = backdrop.getBoundingClientRect();
    backdropRect = { width: r.width, height: r.height };
  }

  return {
    virtualizedGroups: groups.length,
    markdownBlocks: markdownBlocks.length,
    codeBlocks: codeBlocks.length,
    collapsibles: collapsibles.length,
    toolRows: toolRows.length,
    shadowElements: shadows.length,
    backdropRect,
  };
})()`);

if (componentStats.error) {
  console.log(`  ${componentStats.error}`);
} else {
  console.log(
    `  Virtualized groups rendered: ${componentStats.virtualizedGroups}`
  );
  console.log(`  Markdown blocks: ${componentStats.markdownBlocks}`);
  console.log(`  Code blocks: ${componentStats.codeBlocks}`);
  console.log(`  Collapsible triggers: ${componentStats.collapsibles}`);
  console.log(`  Shadow elements: ${componentStats.shadowElements}`);
  if (componentStats.backdropRect) {
    console.log(
      `  Backdrop-blur element: ${componentStats.backdropRect.width}×${componentStats.backdropRect.height}px`
    );
  }
}

console.log("\n=== DONE ===\n");
ws.close();
brave.kill();
process.exit(0);
