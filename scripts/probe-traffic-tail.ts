#!/usr/bin/env bun
/**
 * Transcript tail probe on the traffic bench (/motion/traffic): the real
 * `Transcript`, driven from `window.__traffic`, its tail kept mounted while
 * rows arrive, settle and go. Each step reports any element style with `NaN`
 * in it, every error the window raised (a ResizeObserver loop among them),
 * and the list's height and drawn items.
 *
 *   bun scripts/probe-traffic-tail.ts <dashboard base url>
 *
 * Serve the built dashboard first; the bench needs no hub, so any address
 * does for one:
 *
 *   CAWCO_DEV_HUB_URL=http://127.0.0.1:1 bunx vite preview --port 47811
 *
 * Steps: land 14 rows; three rounds of five sends, each followed by a tool
 * call and an answer; six rows in one flush; a reasoning block, a tool glance
 * and streamed text settling into one row; two queued sends read; the rows
 * replaced in place by four; a remount on five. Exits 1 on any `NaN` or
 * window error. The bench's own socket to the absent hub is not counted.
 */
import { chromium } from "playwright-core";

const [, , base] = process.argv;
if (!base) {
  console.error(
    "usage: bun scripts/probe-traffic-tail.ts <dashboard base url>"
  );
  process.exit(2);
}
const browser = await chromium.launch();
const page = await (
  await browser.newContext({ viewport: { width: 1440, height: 900 } })
).newPage();
const pageErrors: string[] = [];
page.on("pageerror", (error) => pageErrors.push(error.message));
await page.addInitScript(() => {
  const w = window as unknown as { __nan: string[]; __errors: string[] };
  w.__nan = [];
  w.__errors = [];
  addEventListener("error", (event) => w.__errors.push(event.message), true);
  new MutationObserver((records) => {
    for (const record of records) {
      const style = (record.target as Element).getAttribute("style") ?? "";
      if (style.includes("NaN")) {
        w.__nan.push(style.slice(0, 160));
      }
    }
  }).observe(document, {
    attributes: true,
    attributeFilter: ["style"],
    subtree: true,
  });
});
await page.goto(`${base}/motion/traffic`, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => "__traffic" in window);

const drive = (script: string) => page.evaluate(script);
const pause = (ms: number) => page.waitForTimeout(ms);
const landed = () =>
  page.waitForFunction(
    () =>
      (
        window as unknown as { __traffic: { landed: () => boolean } }
      ).__traffic.landed(),
    null,
    { timeout: 30_000 }
  );
let nanTotal = 0;
let errorTotal = 0;
const report = async (step: string) => {
  await pause(600);
  const seen = await page.evaluate(() => {
    const w = window as unknown as { __nan: string[]; __errors: string[] };
    const list = document.querySelector<HTMLElement>(".listing > :first-child");
    return {
      nan: w.__nan.splice(0),
      errors: w.__errors.splice(0),
      list: list
        ? `${list.style.height}, ${list.children.length} items`
        : "none",
    };
  });
  nanTotal += seen.nan.length;
  errorTotal += seen.errors.length;
  console.log(
    `${step}: NaN styles ${seen.nan.length}${seen.nan[0] ? ` (${seen.nan[0]})` : ""}; window errors ${seen.errors.length}${seen.errors[0] ? ` (${seen.errors[0]})` : ""}; list ${seen.list}`
  );
};

await drive("__traffic.reset(14)");
await landed();
await report("landed on 14 rows");
for (let round = 1; round <= 3; round += 1) {
  for (let i = 0; i < 5; i += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: the rows land one at a time, as a conversation's do
    await drive(`__traffic.user("send ${round}.${i}")`);
    await pause(150);
    await drive(`__traffic.tool("Bash", "call ${round}.${i}")`);
    await pause(150);
    await drive(`__traffic.assistant("answer ${round}.${i}")`);
    await pause(150);
  }
  await report(`grow, round ${round}: five sends, calls and answers`);
}
await drive(
  `(() => { for (let i = 0; i < 6; i += 1) __traffic.assistant("burst " + i); })()`
);
await report("grow: six rows in one flush");
await drive(`__traffic.thinking("pondering")`);
await pause(200);
await drive("__traffic.thinking(null)");
await drive(`__traffic.glance("Bash", "ls")`);
await pause(200);
await drive(`__traffic.streaming("streaming words here")`);
await pause(300);
await drive(
  `(() => { __traffic.glance("Bash", null); __traffic.streaming(""); __traffic.assistant("streaming words here, settled"); })()`
);
await report("shrink: the live rows settle into one");
await drive(
  `(() => { const a = __traffic.send("q1"); const b = __traffic.send("q2"); window.__queued = [a, b]; })()`
);
await pause(300);
await drive(
  `(() => { for (const id of window.__queued) __traffic.read(id); __traffic.assistant("read both"); })()`
);
await report("queued sends read");
await drive(
  `__traffic.patch({ messages: Array.from({ length: 4 }, (_, i) => ({ id: "p" + i, instanceId: "traffic-bench", type: "assistant", content: "replaced " + i, timestamp: new Date().toISOString() })) })`
);
await report("shrink in place: the rows replaced by four");
await drive(
  `__traffic.load(Array.from({ length: 5 }, (_, i) => ({ id: "l" + i, type: "assistant", content: "loaded " + i, timestamp: new Date().toISOString() })))`
);
await landed();
await report("remount on five rows");
console.log(
  `page errors: ${pageErrors.length === 0 ? "none" : pageErrors.join(" | ")}`
);
await browser.close();
const clean = nanTotal === 0 && errorTotal === 0 && pageErrors.length === 0;
console.log(
  clean
    ? "ALL PASS"
    : `FAIL: ${nanTotal} NaN style(s), ${errorTotal} window error(s), ${pageErrors.length} page error(s)`
);
process.exit(clean ? 0 : 1);
