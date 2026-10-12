#!/usr/bin/env bun
/**
 * Page landing probe on the traffic bench (/motion/traffic): whatever older
 * page lands in front of a held transcript, the transcript then draws what a
 * reload draws, and the reader's row moves only by the wheels.
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
 * first.
 *
 *  - Page A ends on the compaction's boundary, whose summary is held: the two
 *    are one row, `c:<boundary>`, with the summary as its brief.
 *  - Page A opens on a `continued` line's opening (`continuation`), and page
 *    B ends on that line: the two are one row, `am:<line>`, the opening its
 *    brief.
 *  - Pages C and D are long and plain, for more of the walk up.
 *
 * At each page landing, after two screens further up, and after the two
 * screens back down, the rows drawn are the rows a reload draws: in order, a
 * run of the bench's fresh fold of the same messages (`__traffic.fold`, a
 * fold with no memory, which is what a transcript mounted now folds), each
 * divider with its brief where the fold has one.
 *
 * Checks: those comparisons; the anchor (a row kept mounted at the tail)
 * moved on every painted frame by a whole number of wheels within 2px, and
 * in all by the wheels up less the wheels down; no page or window error.
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
  const w = window as unknown as {
    __traffic: {
      load: (blocks: unknown[]) => void;
      patch: (next: Record<string, unknown>) => void;
      fold: () => { key: string; kind: string; brief: boolean | null }[];
    };
    __landed: number;
    __land: () => void;
    __compare: () => string | null;
  };
  let messages = held;
  w.__landed = 0;
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
    messages = [...(pages.shift() as typeof held), ...messages];
    w.__traffic.patch({ messages });
    w.__landed += 1;
  };
  // The rows drawn against a fresh fold: null when they are a run of it, in
  // order, each divider with its brief where the fold has one; else what
  // differs.
  w.__compare = () => {
    const container = document.querySelector<HTMLElement>(
      ".listing > :first-child"
    );
    if (!container) {
      return "no list";
    }
    const view = document
      .querySelector<HTMLElement>('[aria-label="Session transcript"]')
      ?.getBoundingClientRect();
    const drawn = [...container.children]
      .map((item) => ({
        rect: item.getBoundingClientRect(),
        node: item.querySelector<HTMLElement>("[data-row]"),
      }))
      .filter(({ node }) => node?.dataset.row)
      .sort((x, y) => x.rect.top - y.rect.top);
    const fold = w.__traffic.fold();
    const index = new Map(fold.map((row, i) => [row.key, i]));
    // Every row drawn is a row of the fold, in its order: the list also
    // keeps its last rows mounted, wherever the view is.
    let last = -1;
    for (const { node } of drawn) {
      const key = (node as HTMLElement).dataset.row as string;
      const i = index.get(key);
      if (i === undefined) {
        return `${key} is drawn and is not in the fold`;
      }
      if (i <= last) {
        return `${key} is drawn out of the fold's order`;
      }
      last = i;
      const row = fold[i];
      const offered = offers(row.kind, node as HTMLElement);
      if (offered !== null && offered !== row.brief) {
        return `${row.key} offers a brief: ${offered}, the fold: ${row.brief}`;
      }
    }
    // The rows in view are one run of the fold, none missing between them.
    const inView = drawn
      .filter(
        ({ rect }) => view && rect.bottom > view.top && rect.top < view.bottom
      )
      .map(
        ({ node }) =>
          index.get((node as HTMLElement).dataset.row as string) as number
      );
    for (let i = 1; i < inView.length; i += 1) {
      if (inView[i] !== inView[i - 1] + 1) {
        return `in view, ${fold[inView[i - 1]].key} is followed by ${fold[inView[i]].key}, the fold has ${fold[inView[i - 1] + 1]?.key} between`;
      }
    }
    return null;
  };
  /** Whether a divider drawn offers its brief; null for any other row. */
  function offers(kind: string, node: HTMLElement): boolean | null {
    if (kind === "compaction") {
      return !node.querySelector("button.divider")?.hasAttribute("disabled");
    }
    if (kind === "account") {
      return node.querySelector(".chev") !== null;
    }
    return null;
  }
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
/** The rows drawn against the fresh fold, as a check. */
const compare = async (label: string) => {
  await page.waitForTimeout(600);
  const differs = await page.evaluate(() =>
    (window as unknown as { __compare: () => string | null }).__compare()
  );
  check(
    `${label}: the rows drawn are the rows a reload draws`,
    differs === null,
    differs ?? "same rows, same keys, same briefs"
  );
};
const landedNow = () =>
  page.evaluate(() => (window as unknown as { __landed: number }).__landed);
const topNow = () =>
  page.evaluate(
    () =>
      document.querySelector<HTMLElement>('[aria-label="Session transcript"]')
        ?.scrollTop ?? 0
  );
const screen = await page.evaluate(
  () =>
    document.querySelector<HTMLElement>('[aria-label="Session transcript"]')
      ?.clientHeight ?? 0
);
const twoScreens = Math.ceil((2 * screen) / WHEEL);
/** Wheels by `count`, up when negative; the net wheels up are kept in `net`. */
let net = 0;
const wheelBy = async (count: number) => {
  for (let i = 0; i < Math.abs(count); i += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: each wheel starts where the last one left the list
    await page.mouse.wheel(0, count < 0 ? -WHEEL : WHEEL);
    await page.waitForTimeout(200);
  }
  net -= count;
};
let checked = 0;
for (let step = 0; step < 200; step += 1) {
  // biome-ignore lint/performance/noAwaitInLoops: each step starts where the last one left the list
  const landed = await landedNow();
  if (landed > checked) {
    checked = landed;
    const name = `page ${"ABCD"[landed - 1]}`;
    await compare(`${name} landed`);
    await wheelBy(-twoScreens);
    await compare(`${name}, two screens further up`);
    await wheelBy(twoScreens);
    await compare(`${name}, and back down`);
    checked = Math.max(checked, await landedNow());
    continue;
  }
  // Stop a wheel short of the top, once every page is in: a wheel the top
  // clamps moves by less than a wheel.
  if (landed === 4 && (await topNow()) < WHEEL * 2) {
    break;
  }
  await wheelBy(-1);
}
await page.waitForTimeout(1500);
const result = await page.evaluate(() => {
  const w = window as unknown as {
    __ys: [number, number | null][];
    __landed: number;
    __errors: string[];
  };
  return { ys: w.__ys, landed: w.__landed, errors: w.__errors };
});
await browser.close();

const seen = result.ys.filter(([, y]) => y !== null) as [number, number][];
const off: string[] = [];
for (let i = 0; i < seen.length; i += 1) {
  const moved = seen[i][1] - seen[0][1];
  if (Math.abs(moved - Math.round(moved / WHEEL) * WHEEL) > 2) {
    off.push(`frame ${i}: ${moved.toFixed(1)}px`);
  }
}
const total = (seen.at(-1)?.[1] ?? 0) - (seen[0]?.[1] ?? 0);
check(
  `${net} wheels up in all through ${result.landed} pages: the anchor moves by whole wheels on every painted frame`,
  off.length === 0 && seen.length > 1 && Math.abs(total - net * WHEEL) <= 2,
  `${seen.length} painted frames (${result.ys.length - seen.length} without it), moved ${total.toFixed(1)}px of ${net * WHEEL}${off.length ? `; off: ${off.slice(0, 6).join(", ")}` : ""}`
);
const errors = [...result.errors, ...pageErrors];
check(
  "no page or window error",
  errors.length === 0,
  errors.length === 0 ? "none" : errors.slice(0, 3).join(" | ")
);
console.log(failures === 0 ? "ALL PASS" : `${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
