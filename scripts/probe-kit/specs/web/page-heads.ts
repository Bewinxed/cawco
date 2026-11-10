/**
 * A task's and a folder file's heads, on the phone's own page and the
 * desk's side card, head as every bar does (DESIGN.md, The Title Bars
 * Follow Liquid Glass Rule: "Back and Close are symbols, named by where they
 * go, never the words Back or Close"; "A title is the view's own short name,
 * never the app's name, an id, a path or a breadcrumb"; "a path is never
 * printed in a bar"). On the page-heads bench (the real TaskPane and
 * FolderFile), in Chromium and WebKit, for the task and the folder file:
 * at 390, touch, each its own page (`page`, Back to the project); at 1440,
 * each the side card beside the board (SideSurface, Close its own).
 *
 * 1. On the phone, Back (`[data-slot="page-head"] [data-slot="back"]`)
 *    draws no words, its symbol alone, and is named "Back to Pantry
 *    rewrite".
 * 2. The bar's words (`page-head` on the phone, `side-head` on the desk)
 *    hold no task id and no path: the task's says nothing, the file's its
 *    file's name alone.
 * 3. What the bar left out stands in the body: the task's id leads its
 *    facts line (`[data-slot="id"]`), the file's path is its first line
 *    (`[data-slot="page-path"]`).
 * 4. The rendered checks find nothing (back-close, head, bar-room and the
 *    rest), and a capture of each head is kept in the spec's output.
 *
 *   bun scripts/probe-kit/run.ts web page-heads
 */
import { join } from "node:path";
import { open, settle } from "../../kit";
import { RenderedChecks } from "../../rendered-checks";
import type { Engine, Kit, Spec } from "../../spec";

const ENGINES: Engine[] = ["chromium", "webkit"];
const BENCH = "/motion/page-heads";
/** Where each is drawn: its width, and the bar heading it. */
const LEGS = [
  { at: "phone", width: 390, height: 844, head: "[data-slot='page-head']" },
  { at: "desk", width: 1440, height: 900, head: "[data-slot='side-head']" },
] as const;
/** The bench's own words (motion/page-heads). */
const PROJECT = "Pantry rewrite";
const TASK = "tsk-41";
const FILE =
  "assets/9f3c21ab/checkout-address-step/2026-11-05-whole-flow-at-390.md";
const PAGES = [
  { of: "task", title: "", body: "[data-slot='id']", said: TASK },
  {
    of: "file",
    title: "2026-11-05-whole-flow-at-390.md",
    body: "[data-slot='page-path']",
    said: FILE,
  },
] as const;

async function leg(kit: Kit, bench: string, engine: Engine) {
  for (const where of LEGS) {
    for (const one of PAGES) {
      await read(kit, bench, engine, where, one);
    }
  }
}

async function read(
  kit: Kit,
  bench: string,
  engine: Engine,
  where: (typeof LEGS)[number],
  one: (typeof PAGES)[number]
) {
  const page = await kit.page(where.at === "phone" ? "phone" : "desk", {
    engine,
  });
  await page.setViewportSize({ width: where.width, height: where.height });
  await open(page, `${bench}${BENCH}?of=${one.of}&at=${where.at}`, where.head);
  await settle(page);
  const at = `${engine} ${where.width}px ${one.of} ${where.at === "phone" ? "page" : "side card"}`;
  const said = await page.evaluate(
    ({ head, body }) => {
      const bar = document.querySelector<HTMLElement>(head);
      const back = bar?.querySelector<HTMLElement>("[data-slot='back']");
      return {
        backWords: back?.innerText.trim() ?? null,
        backName: back?.getAttribute("aria-label") ?? null,
        backSymbol: !!back?.querySelector("svg"),
        barWords: (bar?.innerText ?? "").replace(/\s+/gu, " ").trim(),
        bodyWords: document.querySelector<HTMLElement>(body)?.innerText ?? "",
      };
    },
    { head: where.head, body: one.body }
  );
  if (where.at === "phone") {
    kit.check(
      `${at}: Back is its symbol alone, named “Back to ${PROJECT}”`,
      said.backSymbol &&
        said.backWords === "" &&
        said.backName === `Back to ${PROJECT}`,
      JSON.stringify(said)
    );
  }
  kit.check(
    `${at}: the bar says “${one.title}” and holds no id or path`,
    said.barWords === one.title &&
      !said.barWords.includes(TASK) &&
      !said.barWords.includes("/"),
    `bar: “${said.barWords}”`
  );
  kit.check(
    `${at}: the body says what the bar left out (“${one.said}”)`,
    said.bodyWords.trim() === one.said,
    `body: “${said.bodyWords}”`
  );
  const checks = new RenderedChecks(kit, at);
  await checks.at(page, "at rest");
  checks.report();
  await page.screenshot({
    path: join(kit.out, `${engine}-${one.of}-${where.width}.png`),
    clip: { x: 0, y: 0, width: where.width, height: 240 },
  });
  await page.context().close();
}

const spec: Spec = {
  group: "iPhone Safari",
  name: "page-heads",
  run: async (kit: Kit) => {
    const bench = await kit.bench();
    for (const engine of ENGINES) {
      await leg(kit, bench, engine);
    }
  },
};

export default spec;
