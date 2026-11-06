/**
 * A phone's own pages head as every bar does (DESIGN.md, The Title Bars
 * Follow Liquid Glass Rule: "Back and Close are symbols, named by where they
 * go, never the words Back or Close"; "A title is the view's own short name,
 * never the app's name, an id, a path or a breadcrumb"; "a path is never
 * printed in a bar"). On the page-heads bench (the real TaskPane and
 * FolderFile, `page`, Back to the project), in Chromium and WebKit at 390,
 * touch, for the task's page and the folder file's:
 *
 * 1. Back (`[data-slot="page-head"] [data-slot="back"]`) draws no words, its
 *    symbol alone, and is named "Back to Pantry rewrite".
 * 2. The bar's words hold no task id and no path: the task's page says
 *    nothing in its bar, the file's page its file's name alone.
 * 3. What the bar left out stands in the page's body: the task's id leads
 *    its facts line (`[data-slot="id"]`), the file's path is its first line
 *    (`[data-slot="page-path"]`).
 * 4. The rendered checks find nothing (back-close, head, bar-room and the
 *    rest), and a capture of each head is kept in the spec's output.
 *
 *   bun scripts/probe-kit/run.ts web page-heads
 */
import { join } from "node:path";
import { type Engine, type Kit, open, type Spec, settle } from "../../kit";
import { RenderedChecks } from "../../rendered-checks";

const ENGINES: Engine[] = ["chromium", "webkit"];
const BENCH = "/motion/page-heads";
const HEAD = "[data-slot='page-head']";
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
  for (const one of PAGES) {
    const page = await kit.page("phone", { engine });
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page, `${bench}${BENCH}?of=${one.of}`, HEAD);
    await settle(page);
    const at = `${engine} 390px ${one.of} page`;
    const read = await page.evaluate(
      ({ head, body }) => {
        const bar = document.querySelector<HTMLElement>(head);
        const back = bar?.querySelector<HTMLElement>("[data-slot='back']");
        return {
          backWords: back?.innerText.trim() ?? null,
          backName:
            back?.getAttribute("aria-label") ??
            back?.querySelector(".sr-only")?.textContent ??
            null,
          backSymbol: !!back?.querySelector("svg"),
          barWords: (bar?.innerText ?? "").replace(/\s+/gu, " ").trim(),
          bodyWords: document.querySelector<HTMLElement>(body)?.innerText ?? "",
        };
      },
      { head: HEAD, body: one.body }
    );
    kit.check(
      `${at}: Back is its symbol alone, named “Back to ${PROJECT}”`,
      read.backSymbol &&
        read.backWords === "" &&
        read.backName === `Back to ${PROJECT}`,
      JSON.stringify(read)
    );
    kit.check(
      `${at}: the bar says “${one.title}” and holds no id or path`,
      read.barWords === one.title &&
        !read.barWords.includes(TASK) &&
        !read.barWords.includes("/"),
      `bar: “${read.barWords}”`
    );
    kit.check(
      `${at}: the body says what the bar left out (“${one.said}”)`,
      read.bodyWords.trim() === one.said,
      `body: “${read.bodyWords}”`
    );
    const checks = new RenderedChecks(kit, at);
    await checks.at(page, "the page at rest");
    checks.report();
    await page.screenshot({
      path: join(kit.out, `${engine}-${one.of}-390.png`),
      clip: { x: 0, y: 0, width: 390, height: 240 },
    });
    await page.context().close();
  }
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
