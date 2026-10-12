/**
 * The transcript's head under the chosen tab (HeadFade) on the bench
 * (/motion/head-tint, the real PaneTabs over real SessionPanes, no hub), on
 * the desk and the phone, light and dark. The sheet is `--tab-sheet` as the
 * browser composites it; ΔE is CIE76.
 *
 *  - absent at the top (engine): scrolled to the top, every band layer at
 *    opacity 0, and the band itself paints nothing;
 *  - the edge is the sheet (ink): scrolled under the band at eight offsets,
 *    the band's top device row within ΔE 1 of the sheet across the
 *    transcript, and the chosen tab's foot (1px above the shelf's line at
 *    its middle) within ΔE 1 of it;
 *  - the ramp (ink): over a flat probe ground (`--ink-strong`, the rows
 *    hidden), each device row's ΔE to the sheet falls from the band's foot
 *    to its edge, never rising by more than 0.05;
 *  - the switch follows (motion by seek, ink per frame): from the chosen tab
 *    to its next, the switch caught on the clock and read at 0, 25, 50, 75
 *    and 100%, the band's top row within ΔE 1 of the sheet in every frame.
 */
import { Clock } from "../../anim";
import { capture, colours, deltaE, type Raster, type Rgb } from "../../ink";
import {
  frames,
  type Kit,
  open,
  type Spec,
  settle,
  THEMES,
  type View,
} from "../../kit";

const VIEWS_READ: View[] = ["desk", "phone"];

/** The chosen pane's band, scroller and the tabs' feet. */
function layout() {
  const ht = (window as unknown as { __ht: { chosen: () => string } }).__ht;
  const chosen = ht.chosen();
  const slot = document.querySelector(`[data-pane="${chosen}"]`) as HTMLElement;
  const band = (
    slot.querySelector(".head-fade") as HTMLElement
  ).getBoundingClientRect();
  const tr = slot.querySelector(".tr") as HTMLElement;
  const r = tr.getBoundingClientRect();
  return {
    chosen,
    band: { x: band.left, y: band.top, w: band.width, h: band.height },
    tr: { x: r.left, w: r.width, max: tr.scrollHeight - tr.clientHeight },
    tabs: [...document.querySelectorAll<HTMLElement>(".session-tabs .tab")].map(
      (tab) => {
        const b = tab.getBoundingClientRect();
        return {
          id:
            tab
              .querySelector("[data-session-tab]")
              ?.getAttribute("data-session-tab") ?? "",
          mid: b.left + b.width / 2,
          bottom: b.bottom,
        };
      }
    ),
  };
}
type Layout = ReturnType<typeof layout>;

async function read(kit: Kit, view: View, theme: (typeof THEMES)[number]) {
  const where = `${view} ${theme}`;
  const page = await kit.page(view, { theme });
  await open(
    page,
    `${await kit.bench()}/motion/head-tint?theme=${theme}&at=1`,
    () => {
      const ht = (window as unknown as { __ht?: { chosen: () => string } })
        .__ht;
      return (
        !!ht &&
        !!document.querySelector(`[data-pane="${ht.chosen()}"] .tr .msg`) &&
        document.querySelectorAll(".session-tabs .tab").length === 4
      );
    },
    120_000
  );
  await settle(page, 400);
  const L0 = await page.evaluate(layout);
  // The sheet: the token, composited by the browser.
  const sheetCss = await page.evaluate((chosen) => {
    const swatch = document.createElement("div");
    swatch.style.background = "var(--tab-sheet)";
    document.querySelector(`[data-pane="${chosen}"]`)?.append(swatch);
    const fill = getComputedStyle(swatch).backgroundColor;
    swatch.remove();
    return fill;
  }, L0.chosen);
  const [sheet] = (await colours(page, [sheetCss])) as [Rgb];
  const scrollTo = async (y: number) => {
    await page.evaluate((offset) => {
      const ht = (window as unknown as { __ht: { chosen: () => string } }).__ht;
      (
        document.querySelector(
          `[data-pane="${ht.chosen()}"] .tr`
        ) as HTMLElement
      ).scrollTop = offset;
    }, y);
    await frames(page);
    await page.waitForTimeout(80);
  };
  /** The band's top device row's largest ΔE to the sheet across the transcript. */
  const edgeRow = async (laid: Layout) => {
    const r = await capture(page, {
      x: laid.tr.x,
      y: laid.band.y,
      width: laid.tr.w,
      height: 1,
    });
    let worst = 0;
    for (let x = 0; x < r.width; x += 1) {
      const k = x * 4;
      worst = Math.max(
        worst,
        deltaE([r.data[k] ?? 0, r.data[k + 1] ?? 0, r.data[k + 2] ?? 0], sheet)
      );
    }
    return worst;
  };
  const footOf = async (laid: Layout, id: string) => {
    const tab = laid.tabs.find((t) => t.id === id);
    if (!tab) {
      throw new Error(`no tab ${id}`);
    }
    const r = await capture(page, {
      x: tab.mid,
      y: tab.bottom - 1,
      width: 1,
      height: 1,
    });
    return deltaE([r.data[0] ?? 0, r.data[1] ?? 0, r.data[2] ?? 0], sheet);
  };

  // Absent at the top.
  await scrollTo(0);
  const top = await page.evaluate(() => {
    const ht = (window as unknown as { __ht: { chosen: () => string } }).__ht;
    const band = document.querySelector(
      `[data-pane="${ht.chosen()}"] .head-fade`
    ) as HTMLElement;
    const s = getComputedStyle(band);
    return {
      layers: [...band.querySelectorAll(".layer")].map((l) =>
        Number(getComputedStyle(l).opacity)
      ),
      own: `${s.backgroundColor} ${s.backdropFilter} ${s.opacity}`,
    };
  });
  kit.check(
    `${where}: absent at the top`,
    top.layers.length > 0 &&
      top.layers.every((o) => o === 0) &&
      top.own.startsWith("rgba(0, 0, 0, 0) none"),
    `layers ${top.layers.join(",")}; band ${top.own}`
  );

  // The edge over rows, at eight offsets, and the chosen tab's foot.
  let edgeWorst = 0;
  let L = L0;
  for (let k = 1; k <= 8; k += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: one offset at a time
    await scrollTo(Math.round((L0.tr.max * k) / 9));
    L = await page.evaluate(layout);
    edgeWorst = Math.max(edgeWorst, await edgeRow(L));
  }
  const foot = await footOf(L, L.chosen);
  kit.check(
    `${where}: the band's edge and the chosen tab's foot are the sheet`,
    edgeWorst < 1 && foot < 1,
    `edge ΔE ${edgeWorst.toFixed(2)}, foot ΔE ${foot.toFixed(2)}`
  );

  // The ramp over a flat ground.
  await scrollTo(Math.round(L0.tr.max / 2));
  L = await page.evaluate(layout);
  await page.evaluate(() => {
    const ht = (window as unknown as { __ht: { chosen: () => string } }).__ht;
    const pane = `[data-pane="${ht.chosen()}"] .tr`;
    const style = document.createElement("style");
    style.id = "kit-ground";
    style.textContent = `${pane} { background: var(--ink-strong) !important; } ${pane} * { visibility: hidden !important; }`;
    document.head.append(style);
  });
  await frames(page);
  await page.waitForTimeout(80);
  const col: Raster = await capture(page, {
    x: L.tr.x + L.tr.w / 2,
    y: L.band.y,
    width: 1,
    height: L.band.h,
  });
  await page.evaluate(() => document.getElementById("kit-ground")?.remove());
  const ramp: number[] = [];
  for (let y = col.height - 1; y >= 0; y -= 1) {
    const k = y * col.width * 4;
    ramp.push(
      deltaE(
        [col.data[k] ?? 0, col.data[k + 1] ?? 0, col.data[k + 2] ?? 0],
        sheet
      )
    );
  }
  const rises = ramp.flatMap((d, i) =>
    i > 0 && d > (ramp[i - 1] as number) + 0.05 ? [i] : []
  );
  kit.check(
    `${where}: the ramp falls from the band's foot to its edge`,
    rises.length === 0,
    `foot ΔE ${ramp[0]?.toFixed(1)} → edge ${ramp.at(-1)?.toFixed(2)}${rises.length ? `; rises at rows ${rises.slice(0, 6).join(",")}` : ""}`
  );

  // The switch, frame by frame on the clock.
  const ids = (await page.evaluate("window.__ht.ids")) as string[];
  const to = ids[(ids.indexOf(L.chosen) + 1) % ids.length] as string;
  const clock = await Clock.on(page);
  await clock.catchRuns(
    () => page.evaluate(`window.__ht.choose(${JSON.stringify(to)})`),
    "body"
  );
  const worst: string[] = [];
  let switchWorst = 0;
  for (const pct of [0, 25, 50, 75, 100]) {
    // biome-ignore lint/performance/noAwaitInLoops: one frame of the switch at a time
    await clock.seek(pct / 100);
    const e = await edgeRow(await page.evaluate(layout));
    switchWorst = Math.max(switchWorst, e);
    worst.push(`${pct}%:${e.toFixed(2)}`);
  }
  await clock.release();
  kit.check(
    `${where}: the band's edge follows the switch`,
    switchWorst < 1,
    worst.join(" ")
  );
  await page.close();
}

const spec: Spec = {
  name: "head-tint",
  run: async (kit) => {
    for (const view of VIEWS_READ) {
      for (const theme of THEMES) {
        // biome-ignore lint/performance/noAwaitInLoops: one width and theme at a time
        await read(kit, view, theme);
      }
    }
  },
};
export default spec;
