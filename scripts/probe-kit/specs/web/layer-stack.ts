/**
 * The page's stacking roles (DESIGN.md, Elevation & Depth: Stacking): at
 * each place two layers overlap, `document.elementsFromPoint` puts the one
 * whose role stands higher in the `layer` tokens first.
 *
 *   bun scripts/probe-kit/run.ts web layer-stack
 *
 * - The head-tint bench (desk): the bench (`--layer-bench`) over the shell's
 *   top bar; a tab's details card, opened from the strip, on the floating
 *   layer (`--layer-float`) over the bench and the bar under it.
 * - A kit popover over a sticky table head (the overlays bench, desk): a
 *   sticky head on `--layer-sticky` set under the popover's place, and the
 *   popover first at that point.
 * - The skip link on focus (desk): first at its own centre, over the shell.
 * - The rail sheet under 900px (the lift bench, narrowDesk 680): the sheet over its scrim
 *   over the top bar, and the scrim over the bar beside the sheet.
 *
 * Each read is the chain at the point: every element `elementsFromPoint`
 * returns, from the top, named by the nearest `data-slot` (or its tag), with
 * the computed `z-index` of the stacked box it belongs to.
 */
import { readFileSync } from "node:fs";
import type { Page } from "playwright-core";
import { type Kit, open, type Spec, settle } from "../../kit";

/**
 * With `PROBE_UI_OBSERVER=<observer.browser.js>` (the ui-observer skill's
 * scanner), each open surface's rendered layout is measured in place and its
 * observations noted by kind: what the layer change could have moved.
 */
async function observe(kit: Kit, page: Page, what: string, scope: string) {
  const file = process.env.PROBE_UI_OBSERVER;
  if (!file) {
    return;
  }
  const source = readFileSync(file, "utf8");
  const read = await page.evaluate(
    ([src, sel]) => {
      // The scanner's own entry point, as its README runs it.
      const run = new Function(
        `${src}; return globalThis.__uiObserver({ scopeSel: ${JSON.stringify(sel)}, maxDepth: 10 });`
      ) as () => { observations?: { kind?: string; type?: string }[] };
      const found = run().observations ?? [];
      const kinds: Record<string, number> = {};
      for (const o of found) {
        const k = o.kind ?? o.type ?? "other";
        kinds[k] = (kinds[k] ?? 0) + 1;
      }
      return { total: found.length, kinds };
    },
    [source, scope] as const
  );
  kit.note(
    `ui-observer, ${what} (${scope}): ${read.total} observations ${JSON.stringify(read.kinds)}`
  );
}

interface Hit {
  name: string;
  z: string;
}

/**
 * The chain at a point, top first: each hit named, with its stack's `z-index`.
 * `elementsFromPoint` passes over a box with `pointer-events: none`, and an
 * open modal (bits-ui body-scroll-lock.svelte.js) writes that on <body>, so
 * the page under a sheet would not be listed: body's inline value is lifted
 * for the read and put back at once.
 */
const chainAt = (page: Page, x: number, y: number): Promise<Hit[]> =>
  page.evaluate(
    ([px, py]) => {
      const locked = document.body.style.getPropertyValue("pointer-events");
      document.body.style.removeProperty("pointer-events");
      /** The nearest box that sets a numeric z-index: the layer it stands on. */
      const stackOf = (el: Element): string => {
        for (let at: Element | null = el; at; at = at.parentElement) {
          const z = getComputedStyle(at).zIndex;
          if (z !== "auto") {
            return z;
          }
        }
        return "auto";
      };
      const nameOf = (el: Element): string => {
        const slotted = el.closest("[data-slot]");
        const slot = slotted?.getAttribute("data-slot");
        return slot ? `${slot}` : el.tagName.toLowerCase();
      };
      const seen: Hit[] = [];
      for (const el of document.elementsFromPoint(px, py)) {
        const hit = { name: nameOf(el), z: stackOf(el) };
        const last = seen.at(-1);
        if (!(last && last.name === hit.name && last.z === hit.z)) {
          seen.push(hit);
        }
      }
      if (locked) {
        document.body.style.setProperty("pointer-events", locked);
      }
      return seen;
    },
    [x, y]
  );

const said = (chain: Hit[]): string =>
  chain.map((h) => `${h.name}@${h.z}`).join(" > ");

/** The index of the first hit whose name is one of `names`, or -1. */
const firstOf = (chain: Hit[], ...names: string[]): number =>
  chain.findIndex((h) => names.includes(h.name));

const tokenOf = (page: Page, name: string): Promise<string> =>
  page.evaluate(
    (n) =>
      getComputedStyle(document.documentElement).getPropertyValue(n).trim(),
    name
  );

const centre = async (
  page: Page,
  selector: string
): Promise<{ x: number; y: number }> => {
  const box = await page.locator(selector).first().boundingBox();
  if (!box) {
    throw new Error(`${selector}: no box`);
  }
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};

async function headTint(kit: Kit, base: string): Promise<void> {
  const page = await kit.page("desk");
  await open(page, `${base}/motion/head-tint`, "[data-head-tint]", 120_000);
  await settle(page, 300);
  const bench = await tokenOf(page, "--layer-bench");
  const float = await tokenOf(page, "--layer-float");
  const bar = await centre(page, 'header[data-slot="top"]');
  const overBar = await chainAt(page, bar.x, bar.y);
  kit.note(`head-tint, the bar's centre: ${said(overBar)}`);
  kit.check(
    `head-tint: the bench (--layer-bench ${bench}) stands over the shell's top bar`,
    overBar[0]?.z === bench && firstOf(overBar, "top", "slot", "burger") > 0
  );
  // A mouse resting on a tab opens its details card (PaneTabs hoverTab).
  const tab = page.locator('[data-head-tint] [data-slot="tab"]').first();
  await tab.hover();
  const card = "[data-session-details-popover]";
  await page.waitForSelector(`${card}[data-state="open"]`, { timeout: 15_000 });
  await settle(page, 400);
  const at = await centre(page, card);
  const overCard = await chainAt(page, at.x, at.y);
  kit.note(`head-tint, the details card's centre: ${said(overCard)}`);
  const benchAt = overCard.findIndex((h) => h.z === bench);
  kit.check(
    `head-tint: the details card (--layer-float ${float}) stands over the bench (${bench}) and the bar under it`,
    overCard[0]?.z === float && benchAt > 0
  );
  await observe(
    kit,
    page,
    "the details card open",
    "[data-session-details-popover]"
  );
  await page.close();
}

async function popoverOverSticky(kit: Kit, base: string): Promise<void> {
  const page = await kit.page("desk");
  await open(page, `${base}/motion/overlays?only=popover`, "[data-open]");
  await page.locator('[data-open="popover"]').click();
  const pop = '[data-slot="popover-content"][data-state="open"]';
  await page.waitForSelector(pop);
  await settle(page, 400);
  const box = await page.locator(pop).boundingBox();
  if (!box) {
    kit.check("popover-over-sticky: the popover opens", false);
    await page.close();
    return;
  }
  // A sticky head as the tool matrix draws one (`sticky z-(--layer-sticky)`),
  // set across the popover's place in the page's flow.
  await page.evaluate(
    ({ top, height }) => {
      const scroller = document.createElement("div");
      scroller.dataset.slot = "probe-scroller";
      scroller.className = "overflow-auto";
      scroller.style.cssText = `position:absolute;inset-inline:0;top:${top}px;height:${height}px`;
      const head = document.createElement("div");
      head.dataset.slot = "probe-sticky-head";
      head.className = "sticky z-(--layer-sticky) h-auto bg-surface-raised";
      head.style.cssText = `top:0;height:${height}px`;
      scroller.append(head);
      document.querySelector("main")?.append(scroller);
    },
    { top: box.y, height: box.height }
  );
  const sticky = await tokenOf(page, "--layer-sticky");
  const float = await tokenOf(page, "--layer-float");
  const z = await page
    .locator('[data-slot="probe-sticky-head"]')
    .evaluate((el) => getComputedStyle(el).zIndex);
  const chain = await chainAt(
    page,
    box.x + box.width / 2,
    box.y + box.height / 2
  );
  kit.note(`popover over a sticky head, the popover's centre: ${said(chain)}`);
  const head = firstOf(chain, "probe-sticky-head");
  kit.check(
    `popover-over-sticky: the sticky head computes --layer-sticky (${sticky}) and the popover (--layer-float ${float}) stands over it`,
    z === sticky && chain[0]?.z === float && head > 0
  );
  await page.close();
}

async function skipLink(kit: Kit, base: string): Promise<void> {
  const page = await kit.page("desk");
  await open(page, `${base}/motion/overlays`, "[data-open]");
  await page.keyboard.press("Tab");
  const skip = '[data-slot="skip"]';
  const focused = await page.evaluate(
    (s) => document.activeElement === document.querySelector(s),
    skip
  );
  const at = await centre(page, skip);
  const chain = await chainAt(page, at.x, at.y);
  const want = await tokenOf(page, "--layer-skip");
  kit.note(`the skip link on focus, its centre: ${said(chain)}`);
  kit.check(
    `skip: focused, the skip link (--layer-skip ${want}) is first at its centre`,
    focused && chain[0]?.name === "skip" && chain[0]?.z === want
  );
  await page.close();
}

async function railSheet(kit: Kit, base: string): Promise<void> {
  const page = await kit.page("narrowDesk");
  // The lift bench: a page in the shell with nothing laid over the bar (the
  // overlays bench's full-screen "page" button covers the burger).
  await open(page, `${base}/motion/lift`, '[data-slot="burger"]');
  await page.locator('[data-slot="burger"]').click();
  const sheet = '[data-rail-sheet][data-state="open"]';
  await page.waitForSelector(sheet);
  await settle(page, 400);
  const float = await tokenOf(page, "--layer-float");
  const box = await page.locator(sheet).boundingBox();
  const bar = await page.locator('header[data-slot="top"]').boundingBox();
  if (!(box && bar)) {
    kit.check("rail-sheet: the sheet and the bar have boxes", false);
    await page.close();
    return;
  }
  const y = bar.y + bar.height / 2;
  const onSheet = await chainAt(page, box.x + box.width / 2, y);
  const beside = await chainAt(page, box.x + box.width + 40, y);
  kit.note(`rail sheet at 680, over the bar: ${said(onSheet)}`);
  kit.note(`rail sheet at 680, beside it over the bar: ${said(beside)}`);
  // The sheet's own rows are named by their own slots: every hit above
  // `sheet-content` is inside it, on its layer.
  const content = firstOf(onSheet, "sheet-content");
  const scrimUnder = firstOf(onSheet, "sheet-overlay");
  const barUnder = firstOf(onSheet, "top", "burger", "slot");
  kit.check(
    `rail-sheet: the sheet (--layer-float ${float}) stands over its scrim and the top bar`,
    content >= 0 &&
      onSheet.slice(0, content + 1).every((h) => h.z === float) &&
      scrimUnder > content &&
      barUnder > scrimUnder
  );
  const scrim = firstOf(beside, "sheet-overlay");
  const barBeside = firstOf(beside, "top", "burger", "slot");
  kit.check(
    "rail-sheet: beside the sheet, its scrim stands over the top bar",
    scrim === 0 && barBeside > scrim
  );
  await observe(kit, page, "the rail sheet open at 680", "[data-rail-sheet]");
  await page.close();
}

const spec: Spec = {
  name: "layer-stack",
  async run(kit) {
    const base = await kit.bench();
    for (const scene of [headTint, popoverOverSticky, skipLink, railSheet]) {
      try {
        // biome-ignore lint/performance/noAwaitInLoops: one scene at a time
        await scene(kit, base);
      } catch (error) {
        kit.check(`${scene.name}: runs`, false, String(error));
      }
    }
  },
};
export default spec;
