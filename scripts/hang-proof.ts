#!/usr/bin/env bun
/**
 * Every card that hangs from its anchor (HangCard, DESIGN.md "A card that
 * hangs from its anchor"), measured and captured on the folder-proof bench
 * (apps/dashboard /motion/folder-proof, no hub), whose Shell carries the
 * top bar's glass and whose strip carries the real PaneTabs: Caw's panel,
 * the machines popover and the Jump palette from the glass, the session card
 * and a tab's options menu from their tab. At 1440×900 (a mouse) and
 * 390×844 (a finger), light and dark, device scale 2.
 *
 *   CAWCO_DEV_HUB_URL=http://127.0.0.1:9 bunx vite dev --port 5199   (apps/dashboard)
 *   bun scripts/hang-proof.ts [--url http://localhost:5199] [--out $TMPDIR/hang] [--tag after]
 *   bun scripts/hang-proof.ts --diff before,after [--out $TMPDIR/hang]
 *
 * For each card that opens at a width: its open slide frozen at 0, 25, 50,
 * 75 and 100% and its close at 0, 50 and 100% (every hang run is caught as
 * it starts and paused; everything else on the page is finished first), each
 * written as <tag>-<card>-<width>-<theme>-<open|close>-<pct>.png, the anchor
 * and card with 48px round them. Measured, into <tag>-hang-proof.json: the
 * card's top against its anchor's drawn foot, its trailing edge against the
 * anchor's, the properties every animation on the card and its floating
 * wrapper runs while it opens and closes (getAnimations), the glass's join
 * while it hangs, and, for the glass's cards, Esc, an outside click, ⌘K and
 * one card at a time. `--diff a,b` compares every capture both tags wrote:
 * the pixels that differ, and the largest channel difference.
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one page captures one frame at a time.
// biome-ignore-all lint/suspicious/useAwait: a card's open and close are promises whether or not they wait.
// biome-ignore-all lint/complexity/noExcessiveCognitiveComplexity: one capture walks every card, width and theme in order.
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { chromium, type Page } from "playwright-core";

const args = process.argv.slice(2);
const flag = (name: string, fallback: string) => {
  const at = args.indexOf(name);
  return at === -1 ? fallback : (args[at + 1] ?? fallback);
};
const BASE = flag("--url", "http://localhost:5199");
const OUT = flag("--out", join(process.env.TMPDIR ?? ".", "hang"));
const TAG = flag("--tag", "after");
const DIFF = flag("--diff", "");
const EXE =
  process.env.CHROMIUM_BIN ??
  "/home/bewinxed/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome";
const FONTS_CONF = join(import.meta.dir, "folder-tabs-proof.fonts.conf");
const VIEWS = [
  { w: 1440, h: 900, touch: false },
  { w: 390, h: 844, touch: true },
];
const THEMES = ["light", "dark"] as const;
const OPEN_PCTS = [0, 25, 50, 75, 100];
const CLOSE_PCTS = [0, 50, 100];
const ROOM = 48;

const browser = await chromium.launch({
  executablePath: EXE,
  headless: true,
  args: ["--no-sandbox", "--disable-gpu"],
  env:
    process.platform === "linux"
      ? { ...process.env, FONTCONFIG_FILE: FONTS_CONF }
      : process.env,
});
mkdirSync(OUT, { recursive: true });

if (DIFF) {
  await diff(DIFF.split(","));
  await browser.close();
  process.exit(0);
}

declare global {
  interface Window {
    __freeze: boolean;
    __hang: { el: Element; run: Animation; props: string[] }[];
  }
}

/** Every hang run is kept as it starts, and paused while `__freeze`. */
function hook() {
  window.__hang = [];
  window.__freeze = false;
  const { animate } = Element.prototype;
  Element.prototype.animate = function (this: Element, frames, options) {
    const run = animate.call(this, frames, options);
    if (this.classList?.contains("kit-hang")) {
      const list = Array.isArray(frames) ? frames : [frames];
      window.__hang.push({
        el: this,
        run,
        props: [
          ...new Set(
            list.flatMap((f) =>
              Object.keys(f ?? {}).filter(
                (k) => !["offset", "easing", "composite"].includes(k)
              )
            )
          ),
        ],
      });
      if (window.__freeze) {
        run.pause();
      }
    }
    return run;
  };
}

async function settle(page: Page) {
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter(
          (run) =>
            Number.isFinite(
              Number(run.effect?.getComputedTiming().endTime ?? 0)
            ) && run.playState === "running"
        )
        .map((run) => run.finished.catch(() => undefined))
    )
  );
  await page.waitForTimeout(150);
}

interface Card {
  /** Its anchor. */
  anchor: string;
  /** The card, once open. */
  card: string;
  close: (page: Page) => Promise<void>;
  /** The anchor's drawn foot, when it is not the anchor's own bottom. */
  foot?: string;
  name: string;
  open: (page: Page) => Promise<void>;
  /** The bench it opens on: the glass's on a page the shell shows whole. */
  route: string;
}

const GLASS = "[data-bar-group]";
/** A bench that leaves the shell's bar whole and draws no hub banner. */
const GLASS_ROUTE = "/motion/echo";
const TABS_ROUTE = "/motion/folder-proof?at=1&work=working";
const tabOptions = async (page: Page) => {
  await page.evaluate(() => {
    const b = document.querySelector<HTMLButtonElement>(
      ".session-tabs .tab[data-chosen] button[aria-label^='Options for']"
    );
    b?.click();
  });
};

function cardsAt(touch: boolean): Card[] {
  const glass = (name: string, card: string, open: Card["open"]): Card => ({
    name,
    route: GLASS_ROUTE,
    card,
    anchor: GLASS,
    foot: `${GLASS} .join`,
    open,
    close: (page) => page.keyboard.press("Escape"),
  });
  const list: Card[] = [
    glass("caw", ".kit-pop.caw-pop", (page) => page.click("[data-needs-caw]")),
    {
      name: "session-card",
      route: TABS_ROUTE,
      card: ".kit-pop.session-details-popover",
      anchor: ".session-tabs .tab[data-chosen]",
      open: async (page) => {
        await page.focus(".session-tabs .tab[data-chosen] [data-session-tab]");
        await page.keyboard.press("ArrowDown");
      },
      close: (page) => page.keyboard.press("Escape"),
    },
    {
      name: "tab-menu",
      route: TABS_ROUTE,
      card: "[data-slot='context-menu-content'][data-state='open']",
      anchor: ".session-tabs .tab[data-chosen]",
      open: tabOptions,
      close: (page) => page.keyboard.press("Escape"),
    },
  ];
  if (touch) {
    // A phone keeps Jump in its sidebar; it hangs from the bar's glass.
    list.push(
      glass("jump", ".kit-pop.jump-pop", async (page) => {
        await page.click(".burger");
        await page.waitForTimeout(600);
        await page.click(
          ".rail-sheet [aria-label^='Search'], .rail-sheet button:has-text('Search')"
        );
      })
    );
  } else {
    list.push(
      glass("machines", ".kit-pop.machines-pop", (page) =>
        page.click(".bar-item.machines")
      ),
      glass("jump", ".kit-pop.jump-pop", (page) =>
        page.click("[data-share='jump']")
      )
    );
  }
  return list;
}

async function boxOf(page: Page, sel: string) {
  return page.evaluate((s) => {
    const el = document.querySelector(s);
    return el ? el.getBoundingClientRect().toJSON() : null;
  }, sel);
}

async function shoot(page: Page, card: Card, file: string) {
  const a = await boxOf(page, card.anchor);
  const c = await boxOf(page, card.card);
  const vp = page.viewportSize() ?? { width: 0, height: 0 };
  const boxes = [a, c].filter(Boolean) as DOMRect[];
  const left = Math.max(0, Math.min(...boxes.map((b) => b.left)) - ROOM);
  const top = Math.max(0, Math.min(...boxes.map((b) => b.top)) - ROOM);
  const right = Math.min(
    vp.width,
    Math.max(...boxes.map((b) => b.right)) + ROOM
  );
  const bottom = Math.min(
    vp.height,
    Math.max(...boxes.map((b) => b.bottom)) + ROOM
  );
  await page.screenshot({
    path: join(OUT, file),
    clip: { x: left, y: top, width: right - left, height: bottom - top },
    animations: "allow",
  });
}

/** Freezes the newest hang run at `pct` with everything else landed. */
async function seek(page: Page, pct: number) {
  await page.evaluate((p) => {
    const last = window.__hang.at(-1);
    if (!last) {
      return;
    }
    for (const run of document.getAnimations()) {
      if (run !== last.run && run.playState === "running") {
        const end = Number(run.effect?.getComputedTiming().endTime ?? 0);
        if (Number.isFinite(end)) {
          run.finish();
        }
      }
    }
    const end = Number(last.run.effect?.getComputedTiming().endTime ?? 0);
    last.run.currentTime = (end * p) / 100;
  }, pct);
  await page.waitForTimeout(60);
}

/** The animations on the card and its floating wrapper now, by property. */
async function running(page: Page, sel: string) {
  return page.evaluate((s) => {
    const card = document.querySelector(s);
    const wrapper = card?.parentElement;
    const out: { on: string; props: string[] }[] = [];
    for (const [on, el] of [
      ["card", card],
      ["wrapper", wrapper],
    ] as const) {
      for (const run of el?.getAnimations() ?? []) {
        const effect = run.effect as KeyframeEffect | null;
        const props = new Set<string>();
        for (const frame of effect?.getKeyframes() ?? []) {
          for (const k of Object.keys(frame)) {
            if (
              !["offset", "easing", "composite", "computedOffset"].includes(k)
            ) {
              props.add(k);
            }
          }
        }
        if (run instanceof CSSTransition) {
          props.add(run.transitionProperty);
        }
        out.push({ on, props: [...props] });
      }
    }
    return out;
  }, sel);
}

async function measure(page: Page, card: Card) {
  return page.evaluate(
    ({ c, a, f }) => {
      const cardEl = document.querySelector<HTMLElement>(c);
      const anchorEl = document.querySelector<HTMLElement>(a);
      if (!(cardEl && anchorEl)) {
        return null;
      }
      const cb = cardEl.getBoundingClientRect();
      const ab = anchorEl.getBoundingClientRect();
      const footEl = f ? document.querySelector<HTMLElement>(f) : null;
      // The join reaches 1px under the foot, into the card's top edge.
      const foot = footEl
        ? footEl.getBoundingClientRect().bottom - 1
        : ab.bottom;
      const joinInk = footEl ? Number(getComputedStyle(footEl).opacity) : null;
      return {
        footGap: +(cb.top - foot).toFixed(2),
        trailing: +(cb.right - ab.right).toFixed(2),
        leading: +(cb.left - ab.left).toFixed(2),
        flush: cardEl.dataset.flush ?? null,
        neck: [
          "--neck-start",
          "--neck-end",
          "--neck-flare-start",
          "--neck-flare-end",
        ].map((n) => getComputedStyle(cardEl).getPropertyValue(n)),
        join: joinInk,
        inViewport: cb.left >= 0 && cb.right <= innerWidth,
      };
    },
    { c: card.card, a: card.anchor, f: card.foot }
  );
}

const report: Record<string, unknown> = {};
for (const view of VIEWS) {
  for (const theme of THEMES) {
    const context = await browser.newContext({
      viewport: { width: view.w, height: view.h },
      deviceScaleFactor: 2,
      hasTouch: view.touch,
      isMobile: view.touch,
      colorScheme: theme,
    });
    await context.addInitScript((t) => {
      localStorage.setItem("cawco-theme", t);
    }, theme);
    await context.addInitScript(hook);
    const page = await context.newPage();
    for (const card of cardsAt(view.touch)) {
      const key = `${card.name}-${view.w}-${theme}`;
      try {
        await page.goto(`${BASE}${card.route}`, {
          waitUntil: "domcontentloaded",
        });
        await page.waitForSelector(
          card.route === TABS_ROUTE
            ? ".session-tabs .tab[data-chosen]"
            : "[data-needs-caw]",
          { timeout: 60_000 }
        );
        await page.evaluate(() => document.fonts.ready);
        await settle(page);
        await page.waitForTimeout(400);
        await page.evaluate(() => {
          window.__freeze = true;
          window.__hang.length = 0;
        });
        await card.open(page);
        await page.waitForFunction(() => window.__hang.length > 0, null, {
          timeout: 10_000,
        });
        const opening = await page.evaluate(() => window.__hang.at(-1)?.props);
        await seek(page, 50);
        const openRuns = await running(page, card.card);
        for (const pct of OPEN_PCTS) {
          await seek(page, pct);
          await shoot(
            page,
            card,
            `${TAG}-${key}-open-${String(pct).padStart(3, "0")}.png`
          );
        }
        await page.evaluate(() => {
          window.__hang.at(-1)?.run.finish();
        });
        await settle(page);
        const open = await measure(page, card);
        await shoot(page, card, `${TAG}-${key}-rest.png`);
        const before = await page.evaluate(() => window.__hang.length);
        await card.close(page);
        await page.waitForFunction((n) => window.__hang.length > n, before, {
          timeout: 10_000,
        });
        const closing = await page.evaluate(() => window.__hang.at(-1)?.props);
        await seek(page, 50);
        const closeRuns = await running(page, card.card);
        for (const pct of CLOSE_PCTS) {
          await seek(page, pct);
          await shoot(
            page,
            card,
            `${TAG}-${key}-close-${String(pct).padStart(3, "0")}.png`
          );
        }
        await page.evaluate(() => {
          window.__freeze = false;
          window.__hang.at(-1)?.run.play();
        });
        await settle(page);
        const gone = await page.evaluate(
          (s) => document.querySelector(`${s}[data-state='open']`) === null,
          card.card
        );
        report[key] = {
          opening,
          closing,
          openRuns,
          closeRuns,
          open,
          closed: gone,
        };
        console.log(key, JSON.stringify(report[key]));
      } catch (error) {
        report[key] = { error: String(error) };
        console.log(key, "ERROR", String(error).split("\n")[0]);
      }
    }
    if (!view.touch) {
      report[`behaviour-${view.w}-${theme}`] = await behaviour(
        page,
        theme
      ).catch((error) => ({ error: String(error).split("\n")[0] }));
      console.log(
        `behaviour-${view.w}-${theme}`,
        JSON.stringify(report[`behaviour-${view.w}-${theme}`])
      );
    }
    await context.close();
  }
}
writeFileSync(
  join(OUT, `${TAG}-hang-proof.json`),
  JSON.stringify(report, null, 2)
);
await browser.close();

/** Esc, an outside click, ⌘K, and one card at a time, on the glass's cards. */
async function behaviour(page: Page, theme: string) {
  await page.goto(`${BASE}${GLASS_ROUTE}?theme=${theme}`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForSelector("[data-needs-caw]", { timeout: 60_000 });
  await settle(page);
  await page.waitForTimeout(400);
  const openOf = () =>
    page.evaluate(() =>
      [".caw-pop", ".machines-pop", ".jump-pop"].filter((s) =>
        document.querySelector(`${s}[data-state='open']`)
      )
    );
  const out: Record<string, unknown> = {};
  await page.keyboard.press("Control+k");
  await settle(page);
  out.shortcutOpens = await openOf();
  out.shortcutFocus = await page.evaluate(
    () =>
      document.activeElement?.closest(".jump-pop") !== null &&
      document.activeElement?.tagName
  );
  out.shortcutHangs = await measure(page, {
    name: "jump",
    route: GLASS_ROUTE,
    card: ".kit-pop.jump-pop",
    anchor: GLASS,
    foot: `${GLASS} .join`,
    open: async () => undefined,
    close: async () => undefined,
  });
  await page.keyboard.type("zz");
  await page.keyboard.press("ArrowDown");
  out.typed = await page.evaluate(
    () =>
      (document.querySelector(".jump-pop input") as HTMLInputElement | null)
        ?.value
  );
  await page.keyboard.press("Escape");
  await settle(page);
  out.escCloses = await openOf();
  await page.click("[data-share='jump']");
  await settle(page);
  out.clickOpens = await openOf();
  await page.click("[data-share='jump']");
  await settle(page);
  out.clickAgainCloses = await openOf();
  await page.click("[data-share='jump']");
  await settle(page);
  await page.mouse.click(700, 600);
  await settle(page);
  out.outsideCloses = await openOf();
  await page.click("[data-share='jump']");
  await settle(page);
  await page.click(".bar-item.machines");
  await settle(page);
  out.machinesWhileSearch = await openOf();
  await page.keyboard.press("Control+k");
  await settle(page);
  out.shortcutWhileMachines = await openOf();
  out.focusAfterSwap = await page.evaluate(
    () => document.activeElement?.closest(".jump-pop") !== null
  );
  await page.click("[data-needs-caw]");
  await settle(page);
  out.cawWhileSearch = await openOf();
  await page.keyboard.press("Escape");
  await settle(page);
  out.escFocus = await page.evaluate(
    () =>
      document.activeElement?.getAttribute("aria-label") ??
      document.activeElement?.tagName
  );
  return out;
}

async function diff([a, b]: string[]) {
  const page = await browser.newPage();
  const files = readdirSync(OUT).filter(
    (f) => f.startsWith(`${a}-`) && f.endsWith(".png")
  );
  const rows: string[] = [
    "| capture | size | differing px | max channel diff |",
    "|---|---|---|---|",
  ];
  for (const file of files) {
    const other = join(OUT, `${b}-${file.slice(a.length + 1)}`);
    if (!existsSync(other)) {
      continue;
    }
    const left = `data:image/png;base64,${readFileSync(join(OUT, file)).toString("base64")}`;
    const right = `data:image/png;base64,${readFileSync(other).toString("base64")}`;
    const r = await page.evaluate(
      async ([l, rr]) => {
        const load = async (src: string) => {
          const img = new Image();
          img.src = src;
          await img.decode();
          const c = document.createElement("canvas");
          c.width = img.width;
          c.height = img.height;
          const ctx = c.getContext("2d") as CanvasRenderingContext2D;
          ctx.drawImage(img, 0, 0);
          return ctx.getImageData(0, 0, img.width, img.height);
        };
        const x = await load(l);
        const y = await load(rr);
        if (x.width !== y.width || x.height !== y.height) {
          return {
            size: `${x.width}x${x.height} vs ${y.width}x${y.height}`,
            n: -1,
            max: -1,
          };
        }
        let n = 0;
        let max = 0;
        for (let i = 0; i < x.data.length; i += 4) {
          let d = 0;
          for (let k = 0; k < 3; k += 1) {
            d = Math.max(d, Math.abs(x.data[i + k] - y.data[i + k]));
          }
          if (d > 0) {
            n += 1;
          }
          max = Math.max(max, d);
        }
        return { size: `${x.width}x${x.height}`, n, max };
      },
      [left, right]
    );
    rows.push(
      `| ${file.slice(a.length + 1)} | ${r.size} | ${r.n} | ${r.max} |`
    );
  }
  const table = rows.join("\n");
  writeFileSync(join(OUT, `diff-${a}-${b}.md`), table);
  console.log(table);
}
