/**
 * The home's Working count is of top-level sessions only (owner: "the
 * working count shouldn't count delegates"), and every count is a pill that
 * reads against its sheet, its numeral readable on it (owner: "the count
 * background is styled in an unreadable way").
 *
 * A scratch fleet (real hub, agent and sessiond, Claude Code against the
 * mock model) with one orchestrator holding three delegates (each spawned
 * with the orchestrator as its `parent`, so its row nests under it) and one
 * other session, all four mid-turn. The built dashboard, on the desk view in
 * each scheme:
 *
 *  a. every Working count on the page reads 2, with the Delegates switch off
 *     and on;
 *  b. each count, in each state a person puts it in (chosen and not, at
 *     rest, the unchosen one hovered and pressed, the chosen one pressed,
 *     and Finished failed, chosen and not): the pill holds 3:1 (WCAG 1.4.11)
 *     against the ground beside it and its numeral 4.5:1 on the pill. Read
 *     twice: from the engine (the page under the tab, the tab's sheet
 *     (TabItem's `fold` and `sheet` hooks) and the count's own computed
 *     colours, rasterised
 *     through a canvas to the sRGB the page draws), and from the pixels
 *     drawn (the ground just past the pill's end, the pill's fill inside
 *     its start, and its numeral's strongest pixel). Finished's failure is
 *     the count's own `data-failed`, set on the drawn element: no turn of
 *     the mock fails a session.
 *
 *   bun scripts/probe-kit/run.ts home-counts
 */

import type { Page } from "playwright-core";
import { type Reply, type Seen, until } from "../../scratch-fleet";
import { box } from "../geom";
import { at, capture, contrast, peakContrast, type Rgb } from "../ink";
import { type Kit, open, type Spec, settle, THEMES } from "../kit";

/** A prompt the mock answers for minutes: its session stays working. */
const WORK = "WORK";

const respond = (request: Seen): Reply =>
  // The harness opens the person's words with its own reminder.
  request.tools && request.last.includes(WORK)
    ? {
        words: Array.from({ length: 600 }, (_, i) => `step ${i + 1}. `),
        everyMs: 500,
      }
    : { words: ["Done."], everyMs: 20 };

/** TabItem's box, its hit and its sheet (fluid-tabs/TabItem.svelte's hooks). */
const TAB = '[data-slot="ff-tab"]';
const HIT = '[data-slot="hit"]';
const SHEET = '[data-slot="fold"] [data-slot="sheet"]';

/** One count's colours as the engine computes them, composited to sRGB. */
interface Computed {
  ground: Rgb;
  numeral: Rgb;
  pill: Rgb;
  text: string;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** `tab`'s count as the engine says it is drawn, over the page under its tab. */
function computed(page: Page, tab: string): Promise<Computed | null> {
  return page.evaluate(
    ([selector, tabHook, sheetHook]): Computed | null => {
      const el = document.querySelector(selector);
      const item = el?.closest(tabHook);
      if (!(el && item)) {
        return null;
      }
      const canvas = document.createElement("canvas");
      canvas.width = 1;
      canvas.height = 1;
      const pen = canvas.getContext("2d", { willReadFrequently: true });
      const paint = (stack: string[]): Rgb => {
        pen?.clearRect(0, 0, 1, 1);
        for (const layer of stack) {
          if (pen) {
            pen.fillStyle = layer;
            pen.fillRect(0, 0, 1, 1);
          }
        }
        const [r = 0, g = 0, b = 0] = pen?.getImageData(0, 0, 1, 1).data ?? [];
        return [r, g, b];
      };
      // The first opaque ground under the tab: the rail's or the home's.
      let under = "white";
      for (let up = item.parentElement; up; up = up.parentElement) {
        const bg = getComputedStyle(up).backgroundColor;
        if (paint(["black", bg]).join() === paint(["white", bg]).join()) {
          under = bg;
          break;
        }
      }
      const sheet = item.querySelector(sheetHook);
      const layers = [
        under,
        sheet ? getComputedStyle(sheet).fill : "transparent",
      ];
      const pill = [...layers, getComputedStyle(el).backgroundColor];
      return {
        ground: paint(layers),
        pill: paint(pill),
        numeral: paint([...pill, getComputedStyle(el).color]),
        text: el.textContent ?? "",
      };
    },
    [`[data-slot="count"][data-tab="${tab}"]`, TAB, SHEET] as const
  );
}

/**
 * The fleet the home's counts are read on: an orchestrator with three
 * delegates and one other session, every one mid-turn. Its ids.
 */
export async function seedCounts(
  kit: Kit
): Promise<{ fleet: Awaited<ReturnType<Kit["fleet"]>>; ids: string[] }> {
  const fleet = await kit.fleet(respond);
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  const orchestrator = await fleet.spawn("claude", "Counts orchestrator");
  const delegates: string[] = [];
  for (const n of [1, 2, 3]) {
    delegates.push(
      // biome-ignore lint/performance/noAwaitInLoops: one spawn at a time, as a session delegates
      await fleet.spawn("claude", `Counts delegate ${n}`, fleet.workdir, {
        parent: { instanceId: orchestrator },
      })
    );
  }
  const other = await fleet.spawn("claude", "Counts other");
  const ids = [orchestrator, ...delegates, other];
  for (const id of ids) {
    // biome-ignore lint/performance/noAwaitInLoops: sent in order
    await fleet.send(id, `${WORK} for a while.`);
  }
  for (const id of delegates) {
    kit.check(
      `delegate ${id.slice(0, 8)} nests under the orchestrator on the hub`,
      fleet.query<{ parent_instance_id: string | null }>(
        "SELECT parent_instance_id FROM instances WHERE id = ?",
        id
      )[0]?.parent_instance_id === orchestrator
    );
  }
  const turns = () =>
    ids.map(
      (id) =>
        fleet.query<{ status: string; turn_open_at: number | null }>(
          "SELECT status, turn_open_at FROM instances WHERE id = ?",
          id
        )[0]
    );
  await until(
    "every session mid-turn",
    turns,
    (rows) => rows.every((row) => (row?.turn_open_at ?? 0) > 0),
    120_000
  ).catch((error: Error) => {
    throw new Error(`${error.message}: ${JSON.stringify(turns())}`);
  });
  return { fleet, ids };
}

const spec: Spec = {
  name: "home-counts",
  async run(kit) {
    const { fleet } = await seedCounts(kit);
    const base = await fleet.dashboard();
    for (const theme of THEMES) {
      // biome-ignore lint/performance/noAwaitInLoops: one scheme at a time, each on its own page
      const page = await kit.page("desk", { theme });
      await open(page, `${base}/`, `[data-slot="count"][data-tab="working"]`);
      for (const delegatesOn of [false, true]) {
        // The switch as asked, then every Working count on the page read.
        // biome-ignore lint/performance/noAwaitInLoops: the switch changes what the next read sees
        const pressed = await page
          .locator("button[aria-label=Delegates]")
          .first()
          .getAttribute("aria-pressed");
        if ((pressed === "true") !== delegatesOn) {
          await page.locator("button[aria-label=Delegates]").first().click();
        }
        const counts = await page
          .waitForFunction(
            (sel) => {
              const all = [...document.querySelectorAll(`${sel}`)].map(
                (el) => el.textContent ?? ""
              );
              return all.length > 0 && all.every((t) => t === "2") ? all : null;
            },
            '[data-slot="count"][data-tab="working"]',
            { timeout: 60_000 }
          )
          .then((handle) => handle.jsonValue() as Promise<string[]>)
          .catch(async () =>
            page.$$eval(`[data-slot="count"][data-tab="working"]`, (els) =>
              els.map((el) => el.textContent ?? "")
            )
          );
        kit.check(
          `(a) ${theme}, delegates ${delegatesOn ? "on" : "off"}: every Working count reads 2`,
          counts.length > 0 && counts.every((t) => t === "2"),
          `read: ${JSON.stringify(counts)}`
        );
      }
      await settle(page);
      const hit = (tab: string) =>
        page
          .locator(`${TAB}:has([data-slot="count"][data-tab="${tab}"]) ${HIT}`)
          .first();
      /** Reads `tab`'s count in the state the page stands in, both ways. */
      const read = async (tab: string, state: string) => {
        await settle(page);
        const engine = await computed(page, tab);
        const at0 = await box(page, `[data-slot="count"][data-tab="${tab}"]`);
        if (!(engine && at0)) {
          kit.check(
            `(b) ${theme}: the ${tab} count, ${state}, is drawn`,
            false
          );
          return;
        }
        const raster = await capture(page, {
          x: at0.left - 4,
          y: at0.top,
          width: at0.width + 8,
          height: at0.height,
        });
        const mid = at0.top + at0.height / 2;
        // Just past the pill's end, in the tab's own padding; and the pill's
        // fill inside its start, before the numeral's first stroke.
        const groundPx = at(raster, at0.right + 2, mid);
        const pillPx = at(raster, at0.left + 1.5, mid);
        const numeralPeak = peakContrast(raster, at0);
        const label = `(b) ${theme}: the ${tab} count, ${state}`;
        kit.check(
          `${label}: the pill holds 3:1 on its ground`,
          contrast(engine.pill, engine.ground) >= 3 &&
            contrast(pillPx, groundPx) >= 3,
          `computed ${r2(contrast(engine.pill, engine.ground))}:1 (pill rgb(${engine.pill}) on rgb(${engine.ground})), drawn ${r2(contrast(pillPx, groundPx))}:1 (rgb(${pillPx}) on rgb(${groundPx}))`
        );
        kit.check(
          `${label}: its numeral holds 4.5:1 on the pill`,
          contrast(engine.numeral, engine.pill) >= 4.5 && numeralPeak >= 4.5,
          `computed ${r2(contrast(engine.numeral, engine.pill))}:1 (rgb(${engine.numeral})), drawn ${r2(numeralPeak)}:1 at its strongest pixel, reads ${engine.text}`
        );
      };
      const choose = async (tab: string) => {
        await hit(tab).click();
        await page.waitForSelector(
          `${TAB}[data-tab-item-selected] [data-slot="count"][data-tab="${tab}"]`
        );
      };
      /** Holds `tab` pressed while `then` reads it, and lets go off the tab. */
      const pressed = async (tab: string, then: () => Promise<void>) => {
        await hit(tab).hover();
        await page.mouse.down();
        await then();
        await page.mouse.move(0, 0);
        await page.mouse.up();
      };

      await choose("working");
      await page.mouse.move(0, 0);
      await read("working", "chosen, at rest");
      await read("finished", "not chosen, at rest");
      await hit("finished").hover();
      await read("finished", "not chosen, hovered");
      await pressed("finished", () => read("finished", "not chosen, pressed"));
      await choose("working");
      await pressed("working", () => read("working", "chosen, pressed"));
      // Finished's failure, on the count the page draws.
      await page.evaluate(() =>
        document
          .querySelector('[data-slot="count"][data-tab="finished"]')
          ?.setAttribute("data-failed", "")
      );
      await page.mouse.move(0, 0);
      await read("finished", "failed, not chosen, at rest");
      await hit("finished").hover();
      await read("finished", "failed, not chosen, hovered");
      await pressed("finished", () =>
        read("finished", "failed, not chosen, pressed")
      );
      await choose("finished");
      await page.mouse.move(0, 0);
      await read("finished", "failed, chosen, at rest");
      await read("working", "not chosen, at rest (Finished chosen)");
    }
  },
};

export default spec;
