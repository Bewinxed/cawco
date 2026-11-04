/**
 * The design graph's Animation timeline moves one run at a time. On the
 * bench build's design graph (/dev/design-graph, the routine form at Hub
 * didn't answer, its Animation face), in Chromium at 1440 with a mouse and
 * at 390 by touch:
 *
 * 1. "Button “Create routine” changes" stands as two runs, each its own bar
 *    (`[data-slot="run-bar"]`, `data-run`).
 * 2. A drag on run A's body moves run A, and run B's start and end
 *    (`aria-valuenow` and its box) stay where they were.
 * 3. An arrow key on run B moves run B, and run A stays.
 *
 *   bun scripts/probe-kit/run.ts web move-runs
 */
import type { Page } from "playwright-core";
import { type Kit, open, type Spec, settle } from "../../kit";

const PAGE = "/dev/design-graph?face=move";
const ROW = "Button “Create routine” changes";

interface Bar {
  left: number;
  now: number;
  right: number;
  run: string;
}

/** The row's run bars, in order. */
const barsOf = (page: Page): Promise<Bar[]> =>
  page.evaluate((row) => {
    const lane = [...document.querySelectorAll('[data-slot="clip"]')].find(
      (one) => one.textContent?.includes(row)
    );
    return [...(lane?.querySelectorAll('[data-slot="run-bar"]') ?? [])].map(
      (bar) => {
        const box = bar.getBoundingClientRect();
        return {
          run: (bar as HTMLElement).dataset.run ?? "",
          now: Number(bar.getAttribute("aria-valuenow")),
          left: Math.round(box.left * 10) / 10,
          right: Math.round(box.right * 10) / 10,
        };
      }
    );
  }, ROW);

const same = (a: Bar | undefined, b: Bar | undefined) =>
  !!a &&
  !!b &&
  a.now === b.now &&
  Math.abs(a.left - b.left) < 0.5 &&
  Math.abs(a.right - b.right) < 0.5;

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
  await page.waitForSelector('[data-slot="run-bar"]');
  await settle(page);
  const at = `${width}px${touch ? " touch" : ""}`;
  const before = await barsOf(page);
  kit.check(
    `${at}: “${ROW}” stands as two runs, each its own bar`,
    before.length === 2,
    JSON.stringify(before)
  );
  const [a, b] = before;
  if (!(a && b)) {
    await page.close();
    return;
  }
  // The row's own bars: once a press opens the row, its animations' rows
  // under it carry bars of the same runs.
  const row = page
    .locator('[data-slot="clip"]')
    .filter({ hasText: ROW })
    .first();
  const body = row.locator(`[data-slot="run-bar"][data-run="${a.run}"]`);
  const box = await body.boundingBox();
  if (box) {
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    if (touch) {
      const cdp = await page.context().newCDPSession(page);
      const touchAt = (
        type: "touchStart" | "touchMove" | "touchEnd",
        px: number | null
      ) =>
        cdp.send("Input.dispatchTouchEvent", {
          type,
          touchPoints: px === null ? [] : [{ x: px, y }],
        });
      await touchAt("touchStart", x);
      for (let step = 1; step <= 8; step += 1) {
        await touchAt("touchMove", x + step * 5);
      }
      await touchAt("touchEnd", null);
    } else {
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + 40, y, { steps: 8 });
      await page.mouse.up();
    }
  }
  await settle(page);
  const dragged = await barsOf(page);
  kit.check(
    `${at}: a drag on run A moves run A, and run B's start and end stay`,
    dragged[0]?.now !== a.now && same(dragged[1], b),
    `before ${JSON.stringify(before)} after ${JSON.stringify(dragged)}`
  );
  await row
    .locator(`[data-slot="run-bar"][data-run="${b.run}"]`)
    .focus({ focusVisible: true } as never);
  await page.keyboard.press("ArrowRight");
  await settle(page);
  const keyed = await barsOf(page);
  kit.check(
    `${at}: an arrow on run B moves run B, and run A stays`,
    keyed[1]?.now !== dragged[1]?.now && same(keyed[0], dragged[0]),
    `before ${JSON.stringify(dragged)} after ${JSON.stringify(keyed)}`
  );
  await page.close();
}

const spec: Spec = {
  group: "Previews, pages and comments",
  name: "move-runs",
  run: async (kit: Kit) => {
    const bench = await kit.bench();
    for (const width of [1440, 390]) {
      await leg(kit, bench, width);
    }
  },
};

export default spec;
