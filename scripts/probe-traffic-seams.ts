#!/usr/bin/env bun
/**
 * Page seam probe on the traffic bench (/motion/traffic): older pages put in
 * front of a held transcript never change the first row held, and the
 * reader's row moves by whole wheels, to the pixel, while they land.
 *
 *   bun scripts/probe-traffic-seams.ts <dashboard base url>
 *
 * Serve the built dashboard first; the bench needs no hub:
 *
 *   CAWCO_DEV_HUB_URL=http://127.0.0.1:1 bunx vite preview --port 47811
 *
 * The bench mounts the real `Transcript` on a session it drives. The probe
 * loads a held conversation that opens on a compaction's summary, then wheels
 * up from the tail. Each time the view nears the first rows held, the page
 * puts the next older page in front exactly as the store does (client.svelte
 * `prependTranscriptPage`, `place`): a new message list, the older messages
 * first, and the block that stood first added to `seams`.
 *
 *  - Page A ends on the compaction's boundary: its summary is held, so a fold
 *    across the seam would make the held row `c:<boundary>`.
 *  - Page A opens on a `continued` line's opening (`continuation`), and page
 *    B ends on that line: a fold across the seam would take the opening into
 *    the line's row.
 *  - Pages C and D are long and plain, for more of the walk up.
 *
 * Checks: after each page, the row that was first held is still drawn under
 * its own key; the anchor (a row kept mounted at the tail) moves on every
 * painted frame by a whole number of wheels within 2px, never back; no page
 * error and no window error.
 */
import { chromium } from "playwright-core";

const [, , base] = process.argv;
if (!base) {
  console.error(
    "usage: bun scripts/probe-traffic-seams.ts <dashboard base url>"
  );
  process.exit(2);
}
const WHEEL = 600;
let failures = 0;
const check = (step: string, ok: boolean, detail: string) => {
  console.log(`${ok ? "PASS" : "FAIL"} ${step}: ${detail}`);
  if (!ok) {
    failures += 1;
  }
};

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
});
const page = await context.newPage();
const pageErrors: string[] = [];
page.on("pageerror", (error) => pageErrors.push(error.message));
await page.addInitScript(() => {
  const w = window as unknown as {
    __errors: string[];
    __ys: [number, number | null][];
    __anchor: string | null;
  };
  w.__errors = [];
  w.__ys = [];
  w.__anchor = null;
  addEventListener("error", (event) => w.__errors.push(event.message), true);
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

// The conversation, oldest first, built in the page: ids, kinds and
// timestamps as the hub's blocks carry them.
await page.evaluate(() => {
  const INSTANCE = "traffic-bench";
  let n = 0;
  let clock = Date.parse("2026-10-01T00:00:00Z");
  const at = () => {
    clock += 1000;
    return new Date(clock).toISOString();
  };
  const message = (fields: Record<string, unknown>) => {
    n += 1;
    return { id: `m-${n}`, instanceId: INSTANCE, timestamp: at(), ...fields };
  };
  const words = (label: string) =>
    `${label}: ${"Reading the transcript back a page at a time while the reader scrolls up through it. ".repeat(4)}`;
  const plain = (label: string, count: number) =>
    Array.from({ length: count }, (_, i) =>
      i % 3 === 2
        ? message({
            type: "tool.use",
            toolCallId: `call-${label}-${i}`,
            content: "",
            metadata: {
              toolName: "Read",
              toolInput: { file_path: `${label}/file-${i}.ts` },
              toolResult: "ok",
              toolStatus: "success",
            },
          })
        : message({ type: "assistant", content: words(`${label}-${i}`) })
    );
  const D = plain("page-d", 45);
  const C = plain("page-c", 45);
  const B = [
    ...plain("page-b", 30),
    message({
      type: "system.account_move",
      content: "Continued in a fresh conversation",
      metadata: {
        subtype: "account_move",
        accountMove: {
          kind: "continued",
          from: null,
          to: null,
          writtenOn: null,
          tokens: null,
          preparedAtPct: null,
        },
      },
    }),
  ];
  const A = [
    message({
      type: "user",
      content: "Go on from the summary of the conversation before.",
      metadata: { continuation: true },
    }),
    ...plain("page-a", 30),
    message({
      type: "system.compact_boundary",
      content: "Compacted",
      metadata: {
        subtype: "compact_boundary",
        preTokens: 120_000,
        trigger: "auto",
      },
    }),
  ];
  const held = [
    message({
      type: "ui.system_note",
      content: "The summary the compaction wrote: what was done, what is left.",
      metadata: { noteKind: "Session continued" },
    }),
    ...plain("held", 40),
    message({ type: "assistant", content: "held-anchor: the last word held." }),
  ];
  // Newest first: the order the pages are read in.
  const pages = [A, B, C, D];
  const firstKey = (m: {
    id: string;
    type: string;
    metadata?: Record<string, unknown>;
  }) => (m.type === "ui.system_note" ? `c:${m.id}` : m.id);
  const w = window as unknown as {
    __traffic: {
      load: (blocks: unknown[]) => void;
      patch: (next: Record<string, unknown>) => void;
    };
    __seams: { page: number; key: string; drawn: boolean | null }[];
    __land: () => void;
  };
  let messages = held;
  let seams: string[] = [];
  w.__seams = [];
  w.__traffic.load(held);
  // The next older page in front, as the store does it, when the view is
  // within a screen of the first rows held.
  const land = () => {
    const scroller = document.querySelector<HTMLElement>(
      '[aria-label="Session transcript"]'
    );
    const listing = document.querySelector<HTMLElement>(".listing");
    if (!(scroller && listing) || pages.length === 0) {
      return;
    }
    const above =
      scroller.getBoundingClientRect().top -
      listing.getBoundingClientRect().top;
    if (above >= scroller.clientHeight) {
      return;
    }
    const older = pages.shift() as typeof held;
    const [first] = messages;
    const seam = {
      page: 4 - pages.length,
      key: firstKey(first),
      drawn: null as boolean | null,
    };
    w.__seams.push(seam);
    seams = [...seams, first.id];
    messages = [...older, ...messages];
    w.__traffic.patch({ messages, seams });
    // Two frames on, the row that stood first is still there under its key.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        seam.drawn =
          document.querySelector(`[data-row="${CSS.escape(seam.key)}"]`) !==
          null;
      })
    );
  };
  w.__land = land;
});
await page.waitForFunction(
  () =>
    (
      window as unknown as { __traffic: { landed: () => boolean } }
    ).__traffic.landed(),
  null,
  { timeout: 30_000 }
);
await page.waitForTimeout(1500);
// The page lands once the reader's scroll is in: the store's reads land on
// the next frame after the ask.
await page.evaluate(() => {
  const scroller = document.querySelector<HTMLElement>(
    '[aria-label="Session transcript"]'
  );
  const w = window as unknown as { __land: () => void };
  scroller?.addEventListener("scroll", () =>
    requestAnimationFrame(() => setTimeout(w.__land, 30))
  );
});
await page.evaluate(() => {
  (window as unknown as { __anchor: string; __ys: unknown[] }).__anchor =
    "held-anchor";
  (window as unknown as { __ys: unknown[] }).__ys = [];
});
const area = await page
  .locator('[aria-label="Session transcript"]')
  .boundingBox();
if (!area) {
  throw new Error("no transcript scroller on the bench");
}
await page.mouse.move(area.x + area.width / 2, area.y + area.height / 2);
let wheels = 0;
for (; wheels < 200; wheels += 1) {
  // biome-ignore lint/performance/noAwaitInLoops: each wheel starts where the last one left the list
  const state = await page.evaluate(() => {
    const scroller = document.querySelector<HTMLElement>(
      '[aria-label="Session transcript"]'
    );
    const w = window as unknown as { __seams: unknown[] };
    return { top: scroller?.scrollTop ?? 0, landed: w.__seams.length };
  });
  // Stop a wheel short of the top, once every page is in: a wheel the top
  // clamps moves by less than a wheel.
  if (state.landed === 4 && state.top < WHEEL * 2) {
    break;
  }
  await page.mouse.wheel(0, -WHEEL);
  await page.waitForTimeout(200);
}
await page.waitForTimeout(1500);
const result = await page.evaluate(() => {
  const w = window as unknown as {
    __ys: [number, number | null][];
    __seams: { page: number; key: string; drawn: boolean | null }[];
    __errors: string[];
  };
  return { ys: w.__ys, seams: w.__seams, errors: w.__errors };
});
await browser.close();

for (const seam of result.seams) {
  check(
    `page ${"ABCD"[seam.page - 1]} in front: the row first held is still drawn as ${seam.key}`,
    seam.drawn === true,
    seam.drawn === null ? "never read" : String(seam.drawn)
  );
}
const seen = result.ys.filter(([, y]) => y !== null) as [number, number][];
const off: string[] = [];
let most = 0;
for (let i = 0; i < seen.length; i += 1) {
  const moved = seen[i][1] - seen[0][1];
  const whole = Math.round(moved / WHEEL);
  if (Math.abs(moved - whole * WHEEL) > 2 || whole < most) {
    off.push(`frame ${i}: ${moved.toFixed(1)}px`);
  }
  most = Math.max(most, whole);
}
const total = (seen.at(-1)?.[1] ?? 0) - (seen[0]?.[1] ?? 0);
check(
  `${wheels} wheels up through ${result.seams.length} pages: the anchor moves by whole wheels on every painted frame`,
  off.length === 0 && seen.length > 1 && Math.abs(total - wheels * WHEEL) <= 2,
  `${seen.length} painted frames (${result.ys.length - seen.length} without it), moved ${total.toFixed(1)}px of ${wheels * WHEEL}${off.length ? `; off: ${off.slice(0, 6).join(", ")}` : ""}`
);
const errors = [...result.errors, ...pageErrors];
check(
  "no page or window error",
  errors.length === 0,
  errors.length === 0 ? "none" : errors.slice(0, 3).join(" | ")
);
console.log(failures === 0 ? "ALL PASS" : `${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
