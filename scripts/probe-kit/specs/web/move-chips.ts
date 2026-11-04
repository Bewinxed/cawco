/**
 * The design graph's Animation face under the rendered checks, every
 * setting it opens. On the bench build's design graph (/dev/design-graph,
 * the routine form at Hub didn't answer, its Animation face), in Chromium
 * at 1440 with a mouse and at 390 by touch (the drawer at its whole stop):
 *
 * 1. The face at rest reads clean.
 * 2. Each row, and each animation's row under it, opened in turn: its
 *    Delay, Length and Curve chips each opened and read with their
 *    popover over the face, then closed.
 * 3. No press ends on an error page (Length's list once threw on two
 *    durations of one length).
 *
 *   bun scripts/probe-kit/run.ts web move-chips
 */
import type { Page } from "playwright-core";
import { type Kit, open, type Spec, settle } from "../../kit";
import { RenderedChecks } from "../../rendered-checks";

const PAGE = "/dev/design-graph?face=move";
const CHIPS = ["Delay", "Length", "Curve"] as const;

/** Each of the open row's chips opened, read with its list over the face, and closed. */
async function openChips(page: Page, checks: RenderedChecks, name: string) {
  let opened = 0;
  let failed = 0;
  for (const chip of CHIPS) {
    const trigger = page
      .locator(
        `[data-slot="clip-settings"] [data-slot="popover-trigger"][aria-label^="${chip}:"]`
      )
      .first();
    if ((await trigger.count()) === 0) {
      continue;
    }
    await trigger.click();
    await page.waitForSelector(
      '[data-slot="popover-content"][data-state="open"]'
    );
    await settle(page);
    opened += 1;
    await checks.at(page, `${name}: ${chip} open`);
    await page.keyboard.press("Escape");
    await settle(page);
    if ((await page.locator("body").innerText()).startsWith("500")) {
      failed += 1;
    }
  }
  return { opened, failed };
}

async function leg(kit: Kit, bench: string, width: number) {
  const touch = width < 640;
  const page = await kit.page(touch ? "phone" : "desk");
  await page.setViewportSize({ width, height: touch ? 844 : 900 });
  await open(page, `${bench}${PAGE}`, '[data-slot="graph-bar"]');
  if (touch) {
    // The drawer's head stop, then half, then whole: the timeline in view.
    for (const _ of [0, 1]) {
      await page.locator('[data-slot="drawer-grabber"]').first().click();
      await settle(page);
    }
  }
  await page.waitForSelector('[data-slot="timeline"]');
  await settle(page);
  const at = `${width}px${touch ? " touch" : ""}`;
  const checks = new RenderedChecks(kit, `move-chips ${at}`, {
    scope: '[data-slot="move"]',
    except: [
      {
        rule: "overflow",
        selector: '[data-slot="clip"] span',
        text: "run 1",
        reason:
          "an animation row's words under the open Length list, a layer that floats over the face (impeccable's text-occlusion reads the popover as a cover; the house's layer reading names it)",
      },
      {
        rule: "fat-row",
        selector: '[data-slot="clip"]',
        reason:
          "on a narrow face each row is two lines by design: its name over a lane the face's full width (T18; the second review kept it)",
      },
    ],
  });
  await checks.at(page, "the face at rest");
  let opened = 0;
  let failed = 0;
  for (let row = 0; ; row += 1) {
    // A row's own press: the first child of its name cell, never a chip's.
    const rows = page.locator(
      '[data-slot="clip"] > div:first-child > button[aria-expanded]'
    );
    if (row >= (await rows.count())) {
      break;
    }
    const press = rows.nth(row);
    const name = (await press.getAttribute("aria-label")) ?? `row ${row}`;
    if ((await press.getAttribute("aria-expanded")) !== "true") {
      await press.click();
      await settle(page);
    }
    const read = await openChips(page, checks, name);
    opened += read.opened;
    failed += read.failed;
  }
  kit.check(
    `${at}: every row's Delay, Length and Curve open and close, no error page`,
    opened > 0 && failed === 0,
    `${opened} opened, ${failed} on an error page`
  );
  checks.report();
  await page.close();
}

const spec: Spec = {
  group: "Previews, pages and comments",
  name: "move-chips",
  run: async (kit: Kit) => {
    const bench = await kit.bench();
    for (const width of [1440, 390]) {
      await leg(kit, bench, width);
    }
  },
};

export default spec;
