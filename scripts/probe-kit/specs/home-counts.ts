/**
 * The home's Working count is of top-level sessions only (owner: "the
 * working count shouldn't count delegates"), and every count is the kit's
 * Badge in its tab's status pair, its numeral readable on it (owner: "the
 * count background is styled in an unreadable way"; "we have a design
 * system").
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
 *     and Finished failed, chosen and not): its computed ground and ink are
 *     its pair's (`--status-live-*` on Working, `--status-done-*` on
 *     Finished, `--status-fail-*` when anything finished failed), and its
 *     numeral holds 4.5:1 on the ground. Read twice: from the engine (the
 *     page under the tab, the tab's sheet `.fold .sheet` and the count's own
 *     computed colours, rasterised through a canvas to the sRGB the page
 *     draws), and from the numeral's strongest pixel. The badge against the
 *     sheet beside it is noted, not held to a ratio: the design system's
 *     badge is a tint, and its numeral carries the count. The pairs as
 *     measured: live 6.92, done 5.58, fail 6.36:1 by day; 6.18, 5.56,
 *     6.92:1 at night. Finished fails by the product's own path: a fifth
 *     top-level session's Claude Code process is ended from outside CawCo,
 *     the hub starts it again with its turn, and ended again inside
 *     SIGNAL_REPEAT_MS, so the hub fails the row ("something … keeps ending
 *     it") and the page draws the Badge's `fail` variant;
 *  c. on the narrowest rail (Shell's RAIL_MIN, 216px) with three-digit
 *     counts, both labels stand whole beside their counts.
 *
 *   bun scripts/probe-kit/run.ts home-counts
 */

import type { Page } from "playwright-core";
import { type Reply, type Seen, until } from "../../scratch-fleet";
import { box } from "../geom";
import { capture, contrast, peakContrast, type Rgb } from "../ink";
import { type Kit, open, type Spec, settle, THEMES } from "../kit";

/** A prompt the mock answers for minutes: its session stays working. */
const WORK = "WORK";
/** Shell.svelte's RAIL_MIN. */
const RAIL_MIN = 216;

const respond = (request: Seen): Reply =>
  // The harness opens the person's words with its own reminder.
  request.tools && request.last.includes(WORK)
    ? {
        words: Array.from({ length: 600 }, (_, i) => `step ${i + 1}. `),
        everyMs: 500,
      }
    : { words: ["Done."], everyMs: 20 };

/** One count's colours as the engine computes them, composited to sRGB. */
interface Computed {
  ground: Rgb;
  numeral: Rgb;
  pairGround: Rgb;
  pairInk: Rgb;
  pill: Rgb;
  text: string;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * `tab`'s count as the engine says it is drawn, over the page under its tab,
 * and the status pair `pair` resolved on the same page.
 */
function computed(
  page: Page,
  tab: string,
  pair: string
): Promise<Computed | null> {
  return page.evaluate(
    ([selector, name]): Computed | null => {
      const el = document.querySelector(selector);
      const item = el?.closest(".ff-tab");
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
      const sheet = item.querySelector(".fold .sheet");
      const layers = [
        under,
        sheet ? getComputedStyle(sheet).fill : "transparent",
      ];
      const pill = [...layers, getComputedStyle(el).backgroundColor];
      // The pair as the tokens resolve it here, on an element of its own.
      const probe = document.createElement("span");
      probe.style.background = `var(--status-${name}-bg)`;
      probe.style.color = `var(--status-${name}-ink)`;
      item.append(probe);
      const pairGround = paint([
        ...layers,
        getComputedStyle(probe).backgroundColor,
      ]);
      const pairInk = paint([
        ...layers,
        getComputedStyle(probe).backgroundColor,
        getComputedStyle(probe).color,
      ]);
      probe.remove();
      return {
        ground: paint(layers),
        pill: paint(pill),
        numeral: paint([...pill, getComputedStyle(el).color]),
        pairGround,
        pairInk,
        text: el.textContent ?? "",
      };
    },
    [`[data-slot="count"][data-tab="${tab}"]`, pair] as const
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

type Fleet = Awaited<ReturnType<typeof seedCounts>>["fleet"];

/**
 * A fifth top-level session, failed the way a person's would be: its
 * process ended from outside CawCo mid-turn, started again by the hub with
 * its turn, and ended again inside SIGNAL_REPEAT_MS: the hub fails its row.
 */
async function failOne(kit: Kit, fleet: Fleet): Promise<void> {
  const id = await fleet.spawn("claude", "Counts failing");
  await fleet.send(id, `${WORK} for a while.`);
  const row = () =>
    fleet.query<{
      last_error: string | null;
      status: string;
      turn_open_at: number | null;
    }>(
      "SELECT status, last_error, turn_open_at FROM instances WHERE id = ?",
      id
    )[0];
  await until("the failing session mid-turn", row, (r) =>
    Boolean(r.turn_open_at)
  );
  const first = await until(
    "the failing session's process",
    () => fleet.sessionPid(id),
    (pid) => pid > 0
  );
  process.kill(first, "SIGKILL");
  const second = await until(
    "the failing session started again with its turn",
    () => fleet.sessionPid(id),
    (pid) => pid > 0 && pid !== first,
    90_000
  );
  process.kill(second, "SIGKILL");
  const failed = await until(
    "the failing session's row failed",
    row,
    (r) => r.status === "error",
    60_000
  ).catch(() => row());
  kit.check(
    "the fifth session, ended from outside CawCo twice, is failed on the hub",
    failed?.status === "error",
    `${failed?.status}: ${failed?.last_error}`
  );
}

const spec: Spec = {
  name: "home-counts",
  async run(kit) {
    const { fleet } = await seedCounts(kit);
    const base = await fleet.dashboard();
    const pages = new Map<(typeof THEMES)[number], Page>();

    const hit = (page: Page, tab: string) =>
      page
        .locator(`.ff-tab:has([data-slot="count"][data-tab="${tab}"]) .hit`)
        .first();
    /** Reads `tab`'s count, in pair `pair`, in the state the page stands in. */
    const read = async (
      page: Page,
      theme: string,
      tab: string,
      pair: string,
      state: string
    ) => {
      await settle(page);
      const engine = await computed(page, tab, pair);
      const at0 = await box(page, `[data-slot="count"][data-tab="${tab}"]`);
      if (!(engine && at0)) {
        kit.check(`(b) ${theme}: the ${tab} count, ${state}, is drawn`, false);
        return;
      }
      const raster = await capture(page, {
        x: at0.left - 4,
        y: at0.top,
        width: at0.width + 8,
        height: at0.height,
      });
      const numeralPeak = peakContrast(raster, at0);
      const label = `(b) ${theme}: the ${tab} count, ${state}`;
      kit.check(
        `${label}: it is the ${pair} badge`,
        engine.pill.join() === engine.pairGround.join() &&
          engine.numeral.join() === engine.pairInk.join(),
        `ground rgb(${engine.pill}), ink rgb(${engine.numeral}); --status-${pair}-bg rgb(${engine.pairGround}), --status-${pair}-ink rgb(${engine.pairInk})`
      );
      kit.check(
        `${label}: its numeral holds 4.5:1 on the badge`,
        contrast(engine.numeral, engine.pill) >= 4.5 && numeralPeak >= 4.5,
        `computed ${r2(contrast(engine.numeral, engine.pill))}:1 (rgb(${engine.numeral}) on rgb(${engine.pill})), drawn ${r2(numeralPeak)}:1 at its strongest pixel, reads ${engine.text}`
      );
      kit.note(
        `${label}: the badge on its sheet, ${r2(contrast(engine.pill, engine.ground))}:1 (rgb(${engine.pill}) on rgb(${engine.ground}))`
      );
    };
    const choose = async (page: Page, tab: string) => {
      await hit(page, tab).click();
      await page.waitForSelector(
        `.ff-tab.selected [data-slot="count"][data-tab="${tab}"]`
      );
    };
    /** Holds `tab` pressed while `then` reads it, and lets go off the tab. */
    const pressed = async (
      page: Page,
      tab: string,
      then: () => Promise<void>
    ) => {
      await hit(page, tab).hover();
      await page.mouse.down();
      await then();
      await page.mouse.move(0, 0);
      await page.mouse.up();
    };

    for (const theme of THEMES) {
      // biome-ignore lint/performance/noAwaitInLoops: one scheme at a time, each on its own page
      const page = await kit.page("desk", { theme });
      pages.set(theme, page);
      await open(page, `${base}/`, `[data-slot="count"][data-tab="working"]`);
      for (const delegatesOn of [false, true]) {
        // The switch as asked, then every Working count on the page read.
        // biome-ignore lint/performance/noAwaitInLoops: the switch changes what the next read sees
        const on = await page
          .locator("button[aria-label=Delegates]")
          .first()
          .getAttribute("aria-pressed");
        if ((on === "true") !== delegatesOn) {
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
      await choose(page, "working");
      await page.mouse.move(0, 0);
      await read(page, theme, "working", "live", "chosen, at rest");
      await read(page, theme, "finished", "done", "not chosen, at rest");
      await hit(page, "finished").hover();
      await read(page, theme, "finished", "done", "not chosen, hovered");
      await pressed(page, "finished", () =>
        read(page, theme, "finished", "done", "not chosen, pressed")
      );
      await choose(page, "working");
      await pressed(page, "working", () =>
        read(page, theme, "working", "live", "chosen, pressed")
      );
    }

    // Something finished fails, by the product's own path.
    await failOne(kit, fleet);

    for (const [theme, page] of pages) {
      // biome-ignore lint/performance/noAwaitInLoops: one scheme at a time
      const drawn = await page
        .waitForFunction(
          () =>
            document
              .querySelector('[data-slot="count"][data-tab="finished"]')
              ?.className.includes("status-fail") ?? false,
          null,
          { timeout: 60_000 }
        )
        .then(() => true)
        .catch(() => false);
      kit.check(
        `(b) ${theme}: the failure reaches the page, its Finished count in the fail variant`,
        drawn
      );
      await page.mouse.move(0, 0);
      await read(
        page,
        theme,
        "finished",
        "fail",
        "failed, not chosen, at rest"
      );
      await hit(page, "finished").hover();
      await read(
        page,
        theme,
        "finished",
        "fail",
        "failed, not chosen, hovered"
      );
      await pressed(page, "finished", () =>
        read(page, theme, "finished", "fail", "failed, not chosen, pressed")
      );
      await choose(page, "finished");
      await page.mouse.move(0, 0);
      await read(page, theme, "finished", "fail", "failed, chosen, at rest");
      await read(
        page,
        theme,
        "working",
        "live",
        "not chosen, at rest (Finished chosen)"
      );

      // (c) The narrowest rail, with counts three digits long.
      await page.evaluate((w) => {
        document.documentElement.style.setProperty("--rail-w", `${w}px`);
        for (const el of document.querySelectorAll(
          '[data-slot="count"] > span'
        )) {
          el.textContent = "100";
        }
      }, RAIL_MIN);
      await settle(page);
      const fit = await page.evaluate(() =>
        [...document.querySelectorAll(".work .head")].map((head) => {
          const labels = [
            ...head.querySelectorAll(
              '[data-slot="tab-item-label"] > [data-slot="text"]:not(.strong)'
            ),
          ].map((el) => ({
            text: el.textContent ?? "",
            clipped: el.scrollWidth > el.clientWidth,
          }));
          const list = head.querySelector(".ff-tabs-list");
          const delegates = head.querySelector("button[aria-label=Delegates]");
          const listEnd = list?.getBoundingClientRect().right ?? 0;
          const switchStart = delegates?.getBoundingClientRect().left ?? 0;
          return {
            width: Math.round(head.getBoundingClientRect().width),
            labels,
            clear: switchStart - listEnd,
          };
        })
      );
      for (const head of fit) {
        kit.check(
          `(c) ${theme}: a ${head.width}px head at the narrowest rail stands both labels whole beside 100 and 100`,
          head.labels.length === 2 &&
            head.labels.every((label) => !label.clipped) &&
            head.clear >= 0,
          `labels ${JSON.stringify(head.labels)}, the tabs end ${r2(head.clear)}px before the Delegates switch`
        );
      }
    }
  },
};

export default spec;
