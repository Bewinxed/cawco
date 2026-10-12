#!/usr/bin/env bun
/**
 * Long-run page probe on the traffic bench (/motion/traffic): an older page
 * of one long run of tool calls landing in front of a held transcript costs
 * no main-thread task over 50ms, and the reader's row holds still to the
 * pixel while it lands.
 *
 *   bun scripts/probe-traffic-longtask.ts <dashboard base url> [--calls <n>] [--shot <png>]
 *
 * Serve the built dashboard first; the bench needs no hub:
 *
 *   CAWCO_DEV_HUB_URL=http://127.0.0.1:1 bunx vite preview --port 47811
 *
 * It loads a held conversation that opens on a run of 30 calls, lands at the
 * tail, then puts a page of `--calls` calls (default 250, every one with a
 * body to open) in front of it, as the store does: a new message list and a
 * seam at the first block held. Every long task (PerformanceObserver
 * `longtask`) from the page's write until it has settled is read, and the
 * row at the top of the view is read after each paint. `--shot` keeps a
 * screenshot of the top of the long run, for comparing how it is drawn.
 *
 * Checks: the longest task under 50ms; the row at the top of the view at
 * the same y, to the pixel, on every painted frame; no page or window error.
 */
import { chromium } from "playwright-core";

const args = process.argv.slice(2);
const option = (name: string): string | undefined => {
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : undefined;
};
const [base] = args;
if (!base) {
  console.error(
    "usage: bun scripts/probe-traffic-longtask.ts <dashboard base url> [--calls <n>] [--shot <png>]"
  );
  process.exit(2);
}
const CALLS = Number(option("--calls") ?? 250);
const SHOT = option("--shot");
const BUDGET_MS = 50;
let failures = 0;
const check = (step: string, ok: boolean, detail: string) => {
  console.log(`${ok ? "PASS" : "FAIL"} ${step}: ${detail}`);
  if (!ok) {
    failures += 1;
  }
};

const browser = await chromium.launch();
const page = await (
  await browser.newContext({ viewport: { width: 1440, height: 900 } })
).newPage();
const pageErrors: string[] = [];
page.on("pageerror", (error) => pageErrors.push(error.message));
await page.addInitScript(() => {
  const w = window as unknown as {
    __errors: string[];
    __tasks: [number, number][];
    __ys: [number, number | null][];
    __anchor: string | null;
  };
  w.__errors = [];
  w.__tasks = [];
  w.__ys = [];
  w.__anchor = null;
  addEventListener("error", (event) => w.__errors.push(event.message), true);
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      w.__tasks.push([entry.startTime, entry.duration]);
    }
  }).observe({ type: "longtask", buffered: true });
  // Each frame read after its paint: a task behind the frame's callback.
  const channel = new MessageChannel();
  channel.port1.onmessage = () => {
    const scroller = document.querySelector<HTMLElement>(
      '[aria-label="Session transcript"]'
    );
    if (scroller && w.__anchor) {
      let y: number | null = null;
      for (const node of scroller.querySelectorAll("*")) {
        if (
          node.children.length === 0 &&
          node.textContent?.includes(w.__anchor)
        ) {
          y =
            node.getBoundingClientRect().top -
            scroller.getBoundingClientRect().top;
          break;
        }
      }
      w.__ys.push([performance.now(), y]);
    }
    requestAnimationFrame(() => channel.port2.postMessage(0));
  };
  requestAnimationFrame(() => channel.port2.postMessage(0));
});
await page.goto(`${base}/motion/traffic`, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => "__traffic" in window);

await page.evaluate((calls) => {
  const INSTANCE = "traffic-bench";
  let n = 0;
  let clock = Date.parse("2026-10-01T00:00:00Z");
  const message = (fields: Record<string, unknown>) => {
    n += 1;
    clock += 1000;
    return {
      id: `m-${n}`,
      instanceId: INSTANCE,
      timestamp: new Date(clock).toISOString(),
      ...fields,
    };
  };
  const call = (label: string) =>
    message({
      type: "tool.use",
      toolCallId: `call-${label}`,
      content: "",
      metadata: {
        toolName: "Bash",
        toolInput: { command: `echo ${label}`, description: `Print ${label}` },
        toolResult: label,
        toolStatus: "success",
      },
    });
  const older = Array.from({ length: calls }, (_, i) =>
    call(`older-${String(i).padStart(4, "0")}`)
  );
  const held = [
    ...Array.from({ length: 30 }, (_, i) =>
      call(`held-${String(i).padStart(4, "0")}`)
    ),
    message({
      type: "assistant",
      content: "The held conversation goes on under its run of calls.",
    }),
    ...Array.from({ length: 12 }, (_, i) =>
      message({
        type: "assistant",
        content: `held-turn-${i}: ${"A few lines of what the agent said, to give the view something to stand on. ".repeat(3)}`,
      })
    ),
  ];
  const w = window as unknown as {
    __traffic: {
      load: (blocks: unknown[]) => void;
      patch: (next: Record<string, unknown>) => void;
    };
    __land: () => void;
  };
  w.__traffic.load(held);
  w.__land = () =>
    w.__traffic.patch({
      messages: [...older, ...held],
      seams: [held[0].id],
    });
}, CALLS);
await page.waitForFunction(
  () =>
    (
      window as unknown as { __traffic: { landed: () => boolean } }
    ).__traffic.landed(),
  null,
  { timeout: 30_000 }
);
await page.waitForTimeout(1500);
// The reader near the top of what is held, as a reader is when a page is
// asked for: the run's first calls in view.
await page.evaluate(() => {
  const scroller = document.querySelector<HTMLElement>(
    '[aria-label="Session transcript"]'
  );
  if (scroller) {
    scroller.scrollTop = 0;
  }
});
await page.waitForTimeout(1000);
const anchor = await page.evaluate(() => {
  const scroller = document.querySelector<HTMLElement>(
    '[aria-label="Session transcript"]'
  );
  if (!scroller) {
    return null;
  }
  const box = scroller.getBoundingClientRect();
  for (const node of scroller.querySelectorAll("*")) {
    const label =
      node.children.length === 0 &&
      // biome-ignore lint/performance/useTopLevelRegex: serialized into the page
      node.textContent?.match(/held-\d{4}/)?.[0];
    if (label && node.getBoundingClientRect().top >= box.top + 40) {
      return label;
    }
  }
  return null;
});
const started = await page.evaluate((row) => {
  const w = window as unknown as {
    __anchor: string | null;
    __ys: unknown[];
    __tasks: unknown[];
    __land: () => void;
  };
  w.__anchor = row;
  w.__ys = [];
  w.__tasks = [];
  const at = performance.now();
  w.__land();
  return at;
}, anchor);
await page.waitForTimeout(3000);
const result = await page.evaluate(() => {
  const w = window as unknown as {
    __tasks: [number, number][];
    __ys: [number, number | null][];
    __errors: string[];
  };
  return { tasks: w.__tasks, ys: w.__ys, errors: w.__errors };
});
if (SHOT) {
  // The top of the long run, drawn: scrolled to the very first row.
  await page.evaluate(() => {
    const scroller = document.querySelector<HTMLElement>(
      '[aria-label="Session transcript"]'
    );
    if (scroller) {
      scroller.scrollTop = 0;
    }
  });
  await page.waitForTimeout(1500);
  await page
    .locator('[aria-label="Session transcript"]')
    .screenshot({ path: SHOT, animations: "disabled" });
}
await browser.close();

const tasks = result.tasks.filter(([at]) => at >= started - 1);
const longest = Math.max(0, ...tasks.map(([, ms]) => ms));
check(
  `${CALLS} calls put in front: the longest main-thread task`,
  longest < BUDGET_MS,
  tasks.length === 0
    ? "no task of 50ms or more (the longtask threshold)"
    : `${longest.toFixed(0)}ms (${tasks.length} long task(s): ${tasks.map(([, ms]) => ms.toFixed(0)).join(", ")})`
);
const seen = result.ys.filter(([, y]) => y !== null) as [number, number][];
const moved = seen.map(([, y]) => y - (seen[0]?.[1] ?? 0));
const widest = Math.max(0, ...moved.map(Math.abs));
check(
  `${anchor} holds still while the page lands`,
  seen.length > 1 && widest < 1,
  `${seen.length} painted frames (${result.ys.length - seen.length} without it), widest move ${widest.toFixed(1)}px`
);
const errors = [...result.errors, ...pageErrors];
check(
  "no page or window error",
  errors.length === 0,
  errors.length === 0 ? "none" : errors.slice(0, 3).join(" | ")
);
console.log(failures === 0 ? "ALL PASS" : `${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
