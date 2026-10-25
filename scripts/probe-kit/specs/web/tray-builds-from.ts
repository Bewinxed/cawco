/**
 * A delegate that builds from a decision page names it in the tray (hub
 * work-items.ts `buildsFrom`, DelegateTray's panel): on the delegate-tray
 * bench (no hub), one delegate given a page it builds from and held for
 * the person's picks, at 1440 and 390 in Chromium:
 *
 * - its chip's note says it is held for the person's picks;
 * - a press opens its panel, which names the page as its chip (the artifact
 *   chip, its label in words), the row inside the panel and nothing in it
 *   wider than its box;
 * - nothing reaches the page's error reporter.
 *
 *   bun scripts/probe-kit/run.ts web tray-builds-from
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one width at a time, on its own page
import type { Page } from "playwright-core";
import { HELD_FOR_PICKS } from "../../../../packages/hub/src/work-items";
import { type Kit, open, type Spec, settle, type View } from "../../kit";

/** One running delegate: its chip stands in the row at every width. */
const BENCH = "/motion/delegate-tray?case=1r";
const LOG = '[data-slot="tr"][role="log"]';
const ITEM = "wi-tray-0";
const PAGE = "00000000-0000-4000-8000-0000000000aa";
const CHIP = `button[data-tray-chip][data-key="${ITEM}"]`;
const HELD = `${HELD_FOR_PICKS}: Probe picks · Which way does the probe file read?`;

interface Box {
  bottom: number;
  left: number;
  right: number;
  top: number;
}

/** The bench's delegate given the page it builds from, held for its picks. */
const hold = (page: Page) =>
  page.evaluate(
    ([id, artifact, words]) => {
      const debug = (
        globalThis as unknown as {
          __cawcoDebug: { state: { workItems: Record<string, object> } };
        }
      ).__cawcoDebug;
      const item = debug.state.workItems[id];
      if (!item) {
        throw new Error(`no work item ${id}`);
      }
      debug.state.workItems[id] = {
        ...item,
        state: "running",
        buildsFrom: [{ artifactId: artifact }],
        checkQueue: { words, since: Date.now() - 60_000 },
      };
    },
    [ITEM, PAGE, HELD] as const
  );

/** The panel the chip opens, its builds-from row and the page's chip in it, as laid out. */
const readPanel = (page: Page) =>
  page.evaluate(
    ([chipAt, artifact]) => {
      const box = (el: Element | null): Box | null => {
        const rect = el?.getBoundingClientRect();
        return rect
          ? {
              top: rect.top,
              left: rect.left,
              right: rect.right,
              bottom: rect.bottom,
            }
          : null;
      };
      const chip = document.querySelector(chipAt);
      const panel = document.getElementById(
        chip?.getAttribute("aria-controls") ?? ""
      );
      const row = panel?.querySelector('[data-slot="builds-from"]') ?? null;
      const ref = row?.querySelector(`[data-artifact-chip="${artifact}"]`);
      const wide = row
        ? [row, ...row.querySelectorAll("*")].filter(
            (el) => el.scrollWidth > el.clientWidth + 1
          ).length
        : -1;
      return {
        note:
          chip?.querySelector('[data-slot="note"]')?.textContent?.trim() ?? "",
        panel: box(panel),
        row: box(row),
        ref: box(ref ?? null),
        label:
          ref?.querySelector('[data-slot="label"]')?.textContent?.trim() ?? "",
        wide,
      };
    },
    [CHIP, PAGE] as const
  );

const inside = (inner: Box | null, outer: Box | null) =>
  !!inner &&
  !!outer &&
  inner.left >= outer.left - 0.5 &&
  inner.right <= outer.right + 0.5 &&
  inner.top >= outer.top - 0.5 &&
  inner.bottom <= outer.bottom + 0.5;

/** `inner` across `outer`'s width. */
const within = (inner: Box | null, outer: Box | null) =>
  !!inner &&
  !!outer &&
  inner.left >= outer.left - 0.5 &&
  inner.right <= outer.right + 0.5;

const said = (box: Box | null) =>
  box
    ? `${box.left.toFixed(1)},${box.top.toFixed(1)}–${box.right.toFixed(1)},${box.bottom.toFixed(1)}`
    : "none";

async function leg(kit: Kit, base: string, view: View, name: string) {
  const page = await kit.page(view);
  const thrown: string[] = [];
  page.on("pageerror", (error) => thrown.push(error.message.slice(0, 300)));
  await open(page, `${base}${BENCH}`, LOG, 120_000);
  await page.waitForSelector(CHIP, { timeout: 30_000 });
  await settle(page, 600);
  await hold(page);
  await settle(page, 600);
  await page.locator(CHIP).click();
  await page
    .locator('[data-slot="builds-from"]')
    .waitFor({ state: "visible", timeout: 15_000 });
  await settle(page, 600);
  const read = await readPanel(page);
  kit.check(
    `${name}: the chip's note says it is held for the person's picks`,
    read.note.startsWith(HELD_FOR_PICKS),
    `note "${read.note}"`
  );
  kit.check(
    `${name}: its panel names the page it builds from as its chip, inside the panel, nothing wider than its box`,
    read.label.length > 0 &&
      // The inline chip stands out of its line's height by design (ui/chip
      // `inline`); across, it keeps to its row, and whole to the panel.
      within(read.ref, read.row) &&
      inside(read.ref, read.panel) &&
      inside(read.row, read.panel) &&
      read.wide === 0,
    `panel ${said(read.panel)}, row ${said(read.row)}, chip ${said(read.ref)} "${read.label}", ${read.wide} element(s) wider than their box`
  );
  kit.check(
    `${name}: nothing reaches the page's error reporter`,
    thrown.length === 0,
    thrown.join(" | ")
  );
  await page.close();
}

const run = async (kit: Kit) => {
  const base = await kit.bench();
  await leg(kit, base, "desk", "1440");
  await leg(kit, base, "phone", "390");
};

const spec: Spec = { name: "tray-builds-from", run };
export default spec;
