/**
 * The top edge's strip (ScreenEdges `.edge-top`) stays the box Safari's tint
 * sampler takes, and paints only above the safe area: at a desk, nothing on
 * screen, so the bar's glass group draws its own top edge, ring and rail.
 *
 *   bun scripts/probe-kit/run.ts edge-top
 *
 * On a scratch fleet with two sessions in one pane (the desk's bar hosting
 * the tabs on their shelf, the phone's bar floating over its tab row), at
 * 1440 and 390, light and dark, it reads the strip from the engine: its
 * border box at least 90% of the viewport's width and over 10px tall
 * (WebKit's horizontal candidate and its direct colour read,
 * exsesx.dev/blog/en/safari-26-invisible-tint-sampler), its computed colour
 * opaque and the same with the mask taken off, and nothing that WebKit's
 * sampler rejects (opacity, visibility, display; github.com/facebook/astryx
 * pull 5342). At 1440, 1x, the top rows under the glass group and the rail's
 * edge are read with the mask off (main's strip) and on: the strip's colour
 * before, the page's own after, and the screen's top rows the same as with
 * no strip at all.
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one leg at a time
import type { Page } from "playwright-core";
import type { Reply, Seen } from "../../scratch-fleet";
import { at, capture, colours, off, type Raster, type Rgb } from "../ink";
import {
  type Kit,
  open,
  type Spec,
  settle,
  THEMES,
  type Theme,
  type View,
} from "../kit";

const STRIP = '[data-slot="edge-top"]';
/** The rail's trailing edge at the desk: its hairline's column. */
const RAIL_X = 229;
const ROWS = [3, 4];
/** The top rows read at the desk, css px at 1x. */
const CLIP = { x: 0, y: 0, width: 1440, height: 16 };

const respond = (request: Seen): Reply =>
  request.tools
    ? { everyMs: 5, words: ["Done."] }
    : { everyMs: 1, words: ["Edge top"] };

/** What WebKit's sampler reads of the strip, and what its mask says. */
const strip = (page: Page) =>
  page.evaluate((selector) => {
    const el = document.querySelector<HTMLElement>(selector);
    if (!el) {
      return null;
    }
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return {
      width: rect.width,
      height: rect.height,
      top: rect.top,
      viewport: document.documentElement.clientWidth,
      background: style.backgroundColor,
      opacity: style.opacity,
      visibility: style.visibility,
      display: style.display,
      mask: style.maskImage,
    };
  }, STRIP);

/** Takes the strip's mask off (main's strip) or gives it back. */
const unmask = (page: Page, bare: boolean) =>
  page.evaluate(
    ([selector, none]) => {
      const el = document.querySelector<HTMLElement>(selector as string);
      if (el) {
        el.style.maskImage = none ? "none" : "";
      }
    },
    [STRIP, bare] as const
  );

/** Hides the strip altogether: the screen as it is with no strip on it. */
const hide = (page: Page, hidden: boolean) =>
  page.evaluate(
    ([selector, none]) => {
      const el = document.querySelector<HTMLElement>(selector as string);
      if (el) {
        el.style.display = none ? "none" : "";
      }
    },
    [STRIP, hidden] as const
  );

const rgb = (c: Rgb) => `rgb(${c.join(", ")})`;

/** A colour with no alpha below 1: no `rgba`, no `/ a`, not transparent. */
const opaque = (colour: string) =>
  !(
    colour.startsWith("rgba") ||
    colour.includes("/") ||
    colour === "transparent"
  );

/** Where two captures differ: device px, "x,y". */
const differs = (p: Raster, q: Raster): string[] => {
  const found: string[] = [];
  for (let i = 0; i < p.data.length; i += 4) {
    if (
      p.data[i] !== q.data[i] ||
      p.data[i + 1] !== q.data[i + 1] ||
      p.data[i + 2] !== q.data[i + 2]
    ) {
      const n = i / 4;
      found.push(`${n % p.width},${Math.floor(n / p.width)}`);
    }
  }
  return found;
};

type Pane = (view: View, theme: Theme, scale?: number) => Promise<Page>;

/** The strip as WebKit's sampler takes it, with its mask and without. */
const boxLeg = async (kit: Kit, page: Page, leg: string) => {
  const bar = await page.evaluate(
    () => document.documentElement.dataset.bar ?? ""
  );
  const masked = await strip(page);
  await unmask(page, true);
  const bare = await strip(page);
  await unmask(page, false);
  if (!(masked && bare)) {
    kit.check(`${leg}: the strip is on the page`, false);
    return;
  }
  const [fill] = await colours(page, [masked.background]);
  kit.check(
    `${leg}: the strip's border box is at least 90% of the viewport's width and over 10px tall`,
    masked.width >= 0.9 * masked.viewport && masked.height > 10,
    `${masked.width}×${masked.height} at top ${masked.top}, viewport ${masked.viewport}, bar "${bar}"`
  );
  kit.check(
    `${leg}: its computed background-color is opaque and the same with the mask off`,
    masked.background === bare.background && opaque(masked.background),
    `masked ${masked.background}, unmasked ${bare.background} (${fill ? rgb(fill) : "?"})`
  );
  kit.check(
    `${leg}: opacity 1, visibility visible, display not none`,
    masked.opacity === "1" &&
      masked.visibility === "visible" &&
      masked.display !== "none",
    `opacity ${masked.opacity}, visibility ${masked.visibility}, display ${masked.display}, mask ${masked.mask}`
  );
};

/** The desk's top rows with main's strip (mask off), with this one, and with none. */
const inkLeg = async (kit: Kit, page: Page, leg: string) => {
  const glass = await page.evaluate(() => {
    const r = document
      .querySelector('[data-slot="tools"]')
      ?.getBoundingClientRect();
    return r ? { x: r.x, y: r.y, width: r.width, height: r.height } : null;
  });
  const [shelf] = await colours(page, [(await strip(page))?.background ?? ""]);
  if (!(glass && shelf)) {
    kit.check(`${leg}: the glass group is on the page`, false);
    return;
  }
  // `ring`: a pixel of the glass's top ring or the rail's edge, which the
  // shelf covered. The others stand on the bar's own ground (the shelf
  // while it hosts) or the glass's shadow, and are quoted as drawn.
  const ringRow = Math.round(glass.y);
  const mid = glass.x + glass.width / 2;
  const start = glass.x + 12;
  const points = ROWS.flatMap((y) => [
    {
      name: `glass mid (${Math.round(mid)}, ${y})`,
      x: mid,
      y,
      ring: y === ringRow,
    },
    {
      name: `glass start (${Math.round(start)}, ${y})`,
      x: start,
      y,
      ring: false,
    },
    { name: `rail (${RAIL_X}, ${y})`, x: RAIL_X, y, ring: true },
  ]);
  await unmask(page, true);
  const before = await capture(page, CLIP);
  await unmask(page, false);
  const after = await capture(page, CLIP);
  const again = await capture(page, CLIP);
  await hide(page, true);
  const none = await capture(page, CLIP);
  await hide(page, false);
  const read = points.map((p) => ({
    ...p,
    before: at(before, p.x, p.y),
    after: at(after, p.x, p.y),
  }));
  const noise = differs(after, again);
  const stripped = differs(after, none);
  kit.check(
    `${leg}: main's strip drew the shelf ${rgb(shelf)} over the top rows`,
    read.every((p) => off(p.before, shelf) <= 3),
    read.map((p) => `${p.name}: ${rgb(p.before)} → ${rgb(p.after)}`).join("; ")
  );
  kit.check(
    `${leg}: the masked strip leaves the glass's own top ring (row ${ringRow}) and the rail there`,
    read.filter((p) => p.ring).every((p) => off(p.after, shelf) > 3),
    `glass at ${Math.round(glass.x)},${Math.round(glass.y)} ${Math.round(glass.width)}×${Math.round(glass.height)}`
  );
  kit.check(
    `${leg}: the screen's top 16 rows are the same as with no strip at all`,
    stripped.length === 0,
    `${stripped.length} of ${after.data.length / 4} pixels differ: ${stripped.slice(0, 24).join(" ")}; between two captures of the masked strip ${noise.length}: ${noise.slice(0, 24).join(" ")}`
  );
};

const run = async (kit: Kit) => {
  const fleet = await kit.fleet(respond);
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  const alpha = await fleet.spawn("claude", "Alpha");
  await fleet.send(alpha, "hello");
  const beta = await fleet.spawn("claude", "Beta");
  await fleet.send(beta, "hello");
  const base = await fleet.devDashboard();

  /** A page on `view` with both sessions in its one pane, Alpha in front. */
  const pane: Pane = async (view, theme, scale) => {
    const page = await kit.page(view, { theme, ...(scale ? { scale } : {}) });
    await page.addInitScript(
      ([tabs, active]) => {
        localStorage.setItem(
          "cawco-workspace",
          JSON.stringify({
            v: 1,
            root: { t: "l", id: "pone", tabs, active, opened: null },
            focusedLeaf: "pone",
          })
        );
      },
      [[alpha, beta], alpha] as const
    );
    await open(page, `${base}/session/${alpha}`, "[data-session-tab]", 120_000);
    // The bar marks the root once it has placed the tabs: hosting them at
    // the desk, floating over the phone's tab row. The strip's colour follows.
    await page.waitForFunction(
      (mark) => (document.documentElement.dataset.bar ?? "").includes(mark),
      view === "desk" ? "hosting" : "floating",
      { timeout: 30_000 }
    );
    await settle(page);
    await page.waitForTimeout(400);
    return page;
  };

  for (const view of ["desk", "phone"] as const) {
    for (const theme of THEMES) {
      const page = await pane(view, theme);
      await boxLeg(kit, page, `${view} ${theme}`);
      await page.close();
    }
  }
  for (const theme of THEMES) {
    const page = await pane("desk", theme, 1);
    await inkLeg(kit, page, `desk 1x ${theme}`);
    await page.close();
  }
};

const spec: Spec = { name: "edge-top", run };
export default spec;
