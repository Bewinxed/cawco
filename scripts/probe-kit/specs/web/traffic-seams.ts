/**
 * Pages landing in front of a held transcript on the traffic bench
 * (/motion/traffic): whatever older page lands, the transcript then draws
 * what a reload draws, and the reader's row moves only by the wheels.
 *
 * The held conversation opens on a compaction's summary; wheeling up from
 * the tail, each time the view nears the first rows held the next older
 * page goes in front as the store does it (client.svelte
 * `prependTranscriptPage`, `place`): page A ends on the compaction's
 * boundary (one row with the summary as its brief), opens on a `continued`
 * line's opening that page B ends on (one row, the opening its brief); C and
 * D are long and plain.
 *
 * At each landing, two screens further up, and back down: the rows drawn
 * are a run of the bench's fresh fold of the same messages (`__traffic.fold`,
 * what a transcript mounted now folds), in order, each divider with its
 * brief where the fold has one. The anchor (a row kept mounted at the tail)
 * moves on every painted frame by whole wheels, in all by the net wheels up.
 * No page or window error.
 */
import { SCROLLER, tell, watch, watched, wholeWheels } from "../../frames";
import { open, type Spec } from "../../kit";

const WHEEL = 600;

/** The conversation, built in the page, and the page's landing and comparing. */
function stage() {
  let n = 0;
  let clock = Date.parse("2026-10-01T00:00:00Z");
  const message = (fields: Record<string, unknown>) => {
    n += 1;
    clock += 1000;
    return {
      id: `m-${n}`,
      instanceId: "traffic-bench",
      timestamp: new Date(clock).toISOString(),
      ...fields,
    };
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
  const pages = [A, B, C, D];
  const w = window as unknown as {
    __traffic: {
      load: (blocks: unknown[]) => void;
      patch: (next: Record<string, unknown>) => void;
      fold: () => { key: string; kind: string; brief: boolean | null }[];
    };
    __landed: number;
    __compare: () => string | null;
  };
  let messages = held;
  w.__landed = 0;
  w.__traffic.load(held);
  const scrollerOf = () =>
    document.querySelector<HTMLElement>('[aria-label="Session transcript"]');
  const land = () => {
    const scroller = scrollerOf();
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
  const offers = (kind: string, node: HTMLElement): boolean | null => {
    if (kind === "compaction") {
      return !node.querySelector("button.divider")?.hasAttribute("disabled");
    }
    if (kind === "account") {
      return node.querySelector(".chev") !== null;
    }
    return null;
  };
  w.__compare = () => {
    const container = document.querySelector<HTMLElement>(
      ".listing > :first-child"
    );
    if (!container) {
      return "no list";
    }
    const view = scrollerOf()?.getBoundingClientRect();
    const drawn = [...container.children]
      .map((item) => ({
        rect: item.getBoundingClientRect(),
        node: item.querySelector<HTMLElement>("[data-row]"),
      }))
      .filter(({ node }) => node?.dataset.row)
      .sort((x, y) => x.rect.top - y.rect.top);
    const fold = w.__traffic.fold();
    const index = new Map(fold.map((row, i) => [row.key, i]));
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
      const row = fold[i] as (typeof fold)[number];
      const offered = offers(row.kind, node as HTMLElement);
      if (offered !== null && offered !== row.brief) {
        return `${row.key} offers a brief: ${offered}, the fold: ${row.brief}`;
      }
    }
    const inView = drawn
      .filter(
        ({ rect }) => view && rect.bottom > view.top && rect.top < view.bottom
      )
      .map(
        ({ node }) =>
          index.get((node as HTMLElement).dataset.row as string) as number
      );
    for (let i = 1; i < inView.length; i += 1) {
      const a = inView[i - 1] as number;
      if (inView[i] !== a + 1) {
        return `in view, ${fold[a]?.key} is followed by ${fold[inView[i] as number]?.key}, the fold has ${fold[a + 1]?.key} between`;
      }
    }
    return null;
  };
  // The page lands once the reader's scroll is in: the store's reads land
  // on the next frame after the ask.
  (window as unknown as { __arm: () => void }).__arm = () =>
    scrollerOf()?.addEventListener("scroll", () =>
      requestAnimationFrame(() => setTimeout(land, 30))
    );
}

const spec: Spec = {
  name: "traffic-seams",
  run: async (kit) => {
    const page = await kit.page("desk", { init: [watch] });
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await open(
      page,
      `${await kit.built()}/motion/traffic`,
      () => "__traffic" in window
    );
    await page.evaluate(stage);
    await page.waitForFunction(
      () =>
        (
          window as unknown as { __traffic: { landed: () => boolean } }
        ).__traffic.landed(),
      null,
      { timeout: 30_000 }
    );
    await page.waitForTimeout(1500);
    await page.evaluate(() =>
      (window as unknown as { __arm: () => void }).__arm()
    );
    await tell(page, { anchor: "held-anchor", ys: [] });
    const area = await page.locator(SCROLLER).boundingBox();
    if (!area) {
      throw new Error("no transcript scroller on the bench");
    }
    await page.mouse.move(area.x + area.width / 2, area.y + area.height / 2);
    const compare = async (label: string) => {
      await page.waitForTimeout(600);
      const differs = await page.evaluate(() =>
        (window as unknown as { __compare: () => string | null }).__compare()
      );
      kit.check(
        `${label}: the rows drawn are the rows a reload draws`,
        differs === null,
        differs ?? undefined
      );
    };
    const landedNow = () =>
      page.evaluate(() => (window as unknown as { __landed: number }).__landed);
    const topNow = () =>
      page.evaluate(
        (sel) => document.querySelector<HTMLElement>(sel)?.scrollTop ?? 0,
        SCROLLER
      );
    const screen = await page.evaluate(
      (sel) => document.querySelector<HTMLElement>(sel)?.clientHeight ?? 0,
      SCROLLER
    );
    const twoScreens = Math.ceil((2 * screen) / WHEEL);
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
      // A wheel short of the top once every page is in: the top clamps a wheel.
      if (landed === 4 && (await topNow()) < WHEEL * 2) {
        break;
      }
      await wheelBy(-1);
    }
    await page.waitForTimeout(1500);
    const seen = await watched(page);
    const path = wholeWheels(seen.ys, WHEEL, net);
    kit.check(
      `${net} wheels up through ${await landedNow()} pages: the anchor moves by whole wheels on every painted frame, by all of them in all`,
      path.faults.length === 0,
      `${path.frames} painted frames (${path.missing} without it), moved ${path.moved.toFixed(1)}px${path.faults.length ? `; ${path.faults.slice(0, 6).join(", ")}` : ""}`
    );
    const errors = [...seen.errors, ...pageErrors];
    kit.check(
      "no page or window error",
      errors.length === 0,
      errors.slice(0, 3).join(" | ")
    );
  },
};
export default spec;
