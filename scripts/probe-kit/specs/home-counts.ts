/**
 * The home's Working count is of top-level sessions only (owner: "the
 * working count shouldn't count delegates"), and every count pill's numeral
 * holds 4.5:1 on what is drawn under it (owner: "the count background is
 * styled in an unreadable way").
 *
 * A scratch fleet (real hub, agent and sessiond, Claude Code against the
 * mock model) with one orchestrator holding three delegates (each spawned
 * with the orchestrator as its `parent`, so its row nests under it) and one
 * other session, all four mid-turn. The built dashboard, on the desk view in
 * each scheme:
 *
 *  a. every Working count on the page (the rail's and the home's) reads 2,
 *     with the Delegates switch off and on;
 *  b. each count's numeral (the chosen tab's status ink, the other's muted
 *     ink) against what is drawn under it: the tab's sheet (`.fold .sheet`,
 *     its computed fill) with the count's own wash over it, rasterised
 *     through a canvas to the sRGB the page draws.
 *
 *   bun scripts/probe-kit/run.ts home-counts
 */
import { type Reply, type Seen, until } from "../../scratch-fleet";
import { boxes } from "../geom";
import { capture, peakContrast } from "../ink";
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

/** A work tab's count (WorkTabs.svelte); other counts on the page carry no tab. */
const COUNT = '[data-slot="count"][data-tab]';

/** What the page draws for one count: its numeral and the ground under it. */
interface Pill {
  chosen: boolean;
  ground: number[];
  ink: number[];
  ratio: number;
  tab: string;
  text: string;
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
                (el) => el.firstElementChild?.textContent ?? ""
              );
              return all.length > 0 && all.every((t) => t === "2") ? all : null;
            },
            '[data-slot="count"][data-tab="working"]',
            { timeout: 60_000 }
          )
          .then((handle) => handle.jsonValue() as Promise<string[]>)
          .catch(async () =>
            page.$$eval(`[data-slot="count"][data-tab="working"]`, (els) =>
              els.map((el) => el.firstElementChild?.textContent ?? "")
            )
          );
        kit.check(
          `(a) ${theme}, delegates ${delegatesOn ? "on" : "off"}: every Working count reads 2`,
          counts.length > 0 && counts.every((t) => t === "2"),
          `read: ${JSON.stringify(counts)}`
        );
      }
      await settle(page);
      const pills = await page.$$eval(COUNT, (els): Pill[] => {
        const canvas = document.createElement("canvas");
        canvas.width = 1;
        canvas.height = 1;
        const pen = canvas.getContext("2d", { willReadFrequently: true });
        const paint = (layers: string[]) => {
          if (!pen) {
            return [];
          }
          pen.clearRect(0, 0, 1, 1);
          for (const layer of layers) {
            pen.fillStyle = layer;
            pen.fillRect(0, 0, 1, 1);
          }
          return [...pen.getImageData(0, 0, 1, 1).data].slice(0, 3);
        };
        const lum = (rgb: number[]) => {
          const [r = 0, g = 0, b = 0] = rgb.map((c) => {
            const s = c / 255;
            return s <= 0.040_45 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
          });
          return 0.2126 * r + 0.7152 * g + 0.0722 * b;
        };
        return els.map((el) => {
          const tab = el.closest(".ff-tab");
          const sheet = tab?.querySelector(".fold .sheet");
          const fill = sheet ? getComputedStyle(sheet).fill : "transparent";
          const chosen = tab?.classList.contains("selected") ?? false;
          // The numeral on top: the loud one while chosen, else the count's own.
          const loud = el.querySelector(".loud");
          const ink =
            chosen && loud
              ? getComputedStyle(loud).color
              : getComputedStyle(el).color;
          const ground = paint([fill, getComputedStyle(el).backgroundColor]);
          const drawn = paint([fill, ink]);
          const [hi, lo] = [lum(drawn), lum(ground)].sort((x, y) => y - x);
          return {
            tab: (el as HTMLElement).dataset.tab ?? "",
            chosen,
            text: el.firstElementChild?.textContent ?? "",
            ink: drawn,
            ground,
            ratio:
              Math.round((((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05)) * 100) / 100,
          };
        });
      });
      for (const pill of pills) {
        kit.check(
          `(b) ${theme}: the ${pill.tab} count, ${pill.chosen ? "chosen" : "not chosen"}, holds 4.5:1 on its ground`,
          pill.ratio >= 4.5,
          `${pill.ratio}:1, numeral rgb(${pill.ink}) on rgb(${pill.ground}), reads ${pill.text}`
        );
      }
      // As painted: whatever stands over the count or under it, the
      // strongest ink any pixel of its numeral reaches against its ground.
      const drawn = await boxes(page, COUNT);
      for (const [i, at] of drawn.entries()) {
        // biome-ignore lint/performance/noAwaitInLoops: one capture at a time
        const raster = await capture(page, {
          x: at.left,
          y: at.top,
          width: at.right - at.left,
          height: at.bottom - at.top,
        });
        const peak = Math.round(peakContrast(raster, at) * 100) / 100;
        const pill = pills[i];
        kit.check(
          `(b) ${theme}: the ${pill?.tab} count as painted holds 4.5:1`,
          peak >= 4.5,
          `${peak}:1 at its strongest pixel, reads ${pill?.text}`
        );
      }
    }
  },
};

export default spec;
