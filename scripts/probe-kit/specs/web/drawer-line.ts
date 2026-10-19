/**
 * The drawer's one line (DESIGN.md, Breakpoints: "900px (the rail becomes a
 * burger sheet, the transcript rail moves to 0, the composer goes full
 * width, stat tiles go to two columns)"): every style and every script
 * draws it where `DRAWER_QUERY` does, on either side of 900px and in the
 * band between 899px and 900px a zoomed window lands in.
 *
 * 1. At 899, 900 and 901px (Chromium), and at 899, 899.5, 900 and 901px
 *    (Firefox, its headless window 2px per css px wide at 2 dppx, the one
 *    engine here that lays a page out at a fractional width), on the
 *    delegate-tray bench: the rail or the burger, the composer's width, the
 *    transcript's rail and its inset, the stat tile's figure (the real
 *    StatTile, mounted there: no bench draws one without a hub) and the hub
 *    band's place (its slot's `order`, over the bar under the line) each read
 *    the side `DRAWER_QUERY` names, against the drawer's own reading
 *    (390px) and the desk's (1440px).
 * 2. At the same widths, every `@media` rule in the built dashboard's CSS that
 *    names the drawer's line (899, 900 or 901px) matches as `DRAWER_QUERY`
 *    does, its drawer side or its desk side.
 * 3. With `PROBE_DRAWER_BEFORE=<file>`: every element on the benches, at 390,
 *    640, 1024 and 1440px, computes the styles and box it did in that file
 *    (this spec's `away.json` from another checkout): nothing away from the
 *    line moved. Unset, the run writes `away.json` to its out folder.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  type Browser,
  type BrowserContext,
  chromium,
  firefox,
  type Page,
} from "playwright-core";
import { readWithin } from "../../../../packages/core/src/bounded";
import type { InstancesFrame } from "../../../../packages/core/src/frames";
import type { Envelope } from "../../../../packages/core/src/index";
import { WIRE_PROTOCOL } from "../../../../packages/core/src/stream";
import { type Kit, open, ROOT, type Spec, settle } from "../../kit";

const DASHBOARD = join(ROOT, "apps", "dashboard");
const EXPORTED_QUERY = /export const DRAWER_QUERY = "([^"]+)"/;
/** An at-rule, not a class name that spells one (Tailwind's escaped `[@media(…)]:` variant). */
const MEDIA_RULE = /(?<!\\)@media\s*([^{\\]+)\{/g;
const ON_THE_LINE = /\b(899|900|901)(\.\d+)?px/;
const BLOB_URL = /blob:http:\/\/[^)"]+/g;
/** Each `name:value` of a snapshot entry, a value running to the next `;name:`. */
const DECLARATION =
  /(?:^|;)(-{0,2}[a-zA-Z][\w-]*):((?:[^;]|;(?!-{0,2}[a-zA-Z][\w-]*:))*)/g;

/** The query itself, as the dashboard exports it. */
const DRAWER_QUERY = (() => {
  const source = readFileSync(
    join(DASHBOARD, "src", "lib", "hooks", "is-mobile.svelte.ts"),
    "utf8"
  );
  const found = source.match(EXPORTED_QUERY);
  if (!found) {
    throw new Error("is-mobile.svelte.ts exports no DRAWER_QUERY string");
  }
  return found[1];
})();

const BENCH = "/motion/delegate-tray";
const AWAY_ROUTES = [
  "/session",
  "/motion/recall",
  "/motion/delegate-tray",
  "/motion/folder-proof?at=1&work=working",
  "/motion/head-tint",
  "/motion/new-session",
  "/usage",
  "/config",
];
const AWAY_WIDTHS = [390, 640, 1024, 1440];
/** The wall clock the away-from-the-line pages read. */
const AWAY_CLOCK = new Date("2026-10-18T12:00:00Z");
/**
 * The hub's first frame on every socket, its board, here empty. The client
 * counts the hub reached on the board alone (client.svelte.ts `hubReached`:
 * "an open socket proves nothing"), so an answered socket that stays silent
 * leaves the page connecting, and past HubBand's 4 s grace its band opens
 * with Reconnect's spinner turning. Answered with the board, every page,
 * bench or not, is connected and its band rests shut. Empty, it adds no
 * row or machine, and the pulses a bench feeds are merged, never replaced.
 */
const EMPTY_BOARD: Envelope<InstancesFrame> = {
  verb: "frames",
  machineId: "hub",
  payload: {
    kind: "instances",
    agents: [],
    continuations: [],
    formerIds: {},
    handoffs: {},
    hubBuild: { startedAt: 0, version: "0.0.0" },
    instances: [],
    moves: [],
    noticesSeen: [],
    protocol: WIRE_PROTOCOL,
    pulses: {},
  },
};
const HEIGHT = 900;

type Side = "drawer" | "desk";

interface Reading {
  /** `matchMedia(DRAWER_QUERY).matches`. */
  drawer: boolean;
  parts: Record<string, string>;
  width: number;
}

interface Leg {
  name: string;
  start: () => Promise<{ end: () => Promise<void>; page: Page }>;
}

/** What each part the line moves computes, on the bench. */
const readParts = (page: Page): Promise<Reading> =>
  page.evaluate((q) => {
    const css = (el: Element | null | undefined, prop: string) =>
      el ? getComputedStyle(el).getPropertyValue(prop).trim() : "absent";
    const burger = document.querySelector(".burger");
    const rail = document.querySelector("aside");
    const composer = document
      .querySelector('form[data-slot="cin"]')
      ?.closest(".composer");
    const dock = composer?.closest(".dock");
    const tr = document.querySelector(".tr");
    // The stat tile's figure: its type role by its line height's share of
    // its size (--type-title 1.25, --type-kpi 1); the size itself is fluid.
    const figure = document.querySelector("[data-probe-stat] .st-value");
    let statType = "absent";
    if (figure) {
      const s = getComputedStyle(figure);
      const share =
        Number.parseFloat(s.lineHeight) / Number.parseFloat(s.fontSize);
      statType = `line-height ${Math.round(share * 100) / 100}× size`;
    }
    return {
      drawer: matchMedia(q).matches,
      width: document.documentElement.getBoundingClientRect().width,
      parts: {
        "burger display": css(burger, "display"),
        "rail width": rail
          ? String(Math.round(rail.getBoundingClientRect().width))
          : "absent",
        "composer align-self": css(composer, "align-self"),
        "composer dock bottom": css(dock, "bottom"),
        "transcript --x-rail": css(tr, "--x-rail"),
        "transcript padding-inline-start": css(tr, "padding-inline-start"),
        "stat tile value type": statType,
        "hub band order": css(document.querySelector(".band-slot"), "order"),
      },
    };
  }, DRAWER_QUERY);

/** Every distinct `@media` condition in the built CSS that names the drawer's line. */
function lineConditions(): string[] {
  const assets = join(
    DASHBOARD,
    ".svelte-kit",
    "output",
    "client",
    "_app",
    "immutable",
    "assets"
  );
  const found = new Set<string>();
  for (const name of readdirSync(assets).filter((n) => n.endsWith(".css"))) {
    const text = readFileSync(join(assets, name), "utf8");
    for (const m of text.matchAll(MEDIA_RULE)) {
      const condition = m[1].trim();
      if (ON_THE_LINE.test(condition)) {
        found.add(condition);
      }
    }
  }
  return [...found];
}

/** Each condition's `matchMedia` answer, judged by the engine, not by its text. */
const sweep = (
  page: Page,
  conditions: string[]
): Promise<{ condition: string; matches: boolean }[]> =>
  page.evaluate(
    (list) =>
      list.map((condition) => ({
        condition,
        matches: matchMedia(condition).matches,
      })),
    conditions
  );

/** Every element's computed style and box, by its place in the tree. */
const snapshot = (page: Page): Promise<Record<string, string>> =>
  page.evaluate(() => {
    const out: Record<string, string> = {};
    const walk = (el: Element, path: string) => {
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      const props = [...s].map((p) => `${p}:${s.getPropertyValue(p)}`);
      const box = [r.x, r.y, r.width, r.height]
        .map((n) => Math.round(n * 10) / 10)
        .join(",");
      out[path] = `${box}|${props.join(";")}`;
      // The hub band's sentence carries its retry countdown, ticked by a
      // real interval through MorphText's letters: the paragraph's own box
      // and styles are read, the letters mid-tick are not.
      if (el.matches(".band-slot p.words")) {
        return;
      }
      for (const [i, child] of [...el.children].entries()) {
        walk(child, `${path}>${child.tagName.toLowerCase()}:${i}`);
      }
    };
    walk(document.documentElement, "html");
    return out;
  });

/**
 * A snapshot entry's box and properties by name: the engine lists custom
 * properties in no fixed order, and a blob URL names the server's port and
 * a fresh id on every load, so neither is a difference.
 */
function entry(value: string): Map<string, string> {
  const bar = value.indexOf("|");
  const out = new Map<string, string>([["box", value.slice(0, bar)]]);
  const body = value.slice(bar + 1).replace(BLOB_URL, "blob:");
  for (const m of body.matchAll(DECLARATION)) {
    out.set(m[1], m[2]);
  }
  return out;
}

/** The properties (and `box`) that differ between two snapshot entries. */
function changed(was: string | undefined, now: string): string[] {
  if (was === undefined) {
    return ["(new element)"];
  }
  if (was === now) {
    return [];
  }
  const a = entry(was);
  const b = entry(now);
  return [...new Set([...a.keys(), ...b.keys()])].filter(
    (k) => a.get(k) !== b.get(k)
  );
}

/**
 * The real StatTile mounted on the page (no bench draws one without a hub),
 * through the dev server's own modules: its scoped styles come with it.
 */
const mountStatTile = (page: Page): Promise<void> =>
  page.evaluate(async () => {
    const url = "/src/lib/cawco/StatTile.svelte";
    const source = await (await fetch(url)).text();
    // The module's own import of Svelte's client, `"/node_modules/.vite/deps/svelte_internal_client.js?v=…"`.
    const at = source.indexOf(
      "/node_modules/.vite/deps/svelte_internal_client.js"
    );
    const internal = at === -1 ? "" : source.slice(at, source.indexOf('"', at));
    if (!internal) {
      throw new Error("StatTile's module names no svelte client");
    }
    const [{ default: StatTile }, { mount }] = await Promise.all([
      import(/* @vite-ignore */ url),
      import(
        /* @vite-ignore */ internal.replace(
          "svelte_internal_client.js",
          "svelte.js"
        )
      ),
    ]);
    const host = document.createElement("div");
    host.dataset.probeStat = "";
    document.body.append(host);
    mount(StatTile, { target: host, props: { label: "Spend", value: 12 } });
    await new Promise((done) =>
      requestAnimationFrame(() => requestAnimationFrame(done))
    );
  });

async function openBench(page: Page, base: string, route = BENCH) {
  await open(
    page,
    `${base}${route}`,
    route === BENCH
      ? () =>
          Boolean(document.querySelector('form[data-slot="cin"]')) &&
          getComputedStyle(document.documentElement).getPropertyValue(
            "--type-kpi"
          ) !== ""
      : "body",
    120_000
  );
  if (route === BENCH) {
    await mountStatTile(page);
  }
  await settle(page, 400);
}

/** A Firefox page whose window is `css` px wide at 2 dppx: 899.5px is 1799 device px. */
async function firefoxAt(
  css: number
): Promise<{ browser: Browser; page: Page }> {
  const browser = await firefox.launch({
    headless: true,
    env: {
      ...process.env,
      MOZ_HEADLESS_WIDTH: String(Math.round(css * 2)),
      MOZ_HEADLESS_HEIGHT: String(HEIGHT * 2),
    },
    firefoxUserPrefs: { "layout.css.devPixelsPerPx": "2" },
  });
  const context = await browser.newContext({ viewport: null });
  // The kit's `settle` reads `kitRuns` (kit.ts installs it on its own pages).
  await context.addInitScript(() => {
    window.kitRuns = () => document.getAnimations();
  });
  return { browser, page: await context.newPage() };
}

/**
 * A Chromium page at browser zoom: a window `css * 2` px wide at 200%, so
 * 899.5px is 1799px. The browser's own zoom (an extension's
 * `chrome.tabs.setZoom`, kept per origin), not an emulated viewport, which
 * takes whole px only. The full Chromium build in its new headless mode:
 * the headless shell loads no extension.
 */
async function chromiumZoomedAt(
  kit: Kit,
  base: string,
  css: number
): Promise<{ context: BrowserContext; page: Page }> {
  const extension = join(kit.out, "zoom-extension");
  await mkdir(extension, { recursive: true });
  await writeFile(
    join(extension, "manifest.json"),
    JSON.stringify({
      manifest_version: 3,
      name: "probe-zoom",
      version: "1",
      background: { service_worker: "sw.js" },
      permissions: ["tabs"],
    })
  );
  await writeFile(join(extension, "sw.js"), "");
  const profile = join(kit.out, `zoom-profile-${css}`);
  await rm(profile, { recursive: true, force: true });
  const context = await chromium.launchPersistentContext(profile, {
    channel: "chromium",
    headless: true,
    viewport: null,
    args: [
      "--no-sandbox",
      "--disable-gpu",
      `--disable-extensions-except=${extension}`,
      `--load-extension=${extension}`,
      `--window-size=${Math.round(css * 2)},${HEIGHT * 2}`,
    ],
  });
  await context.addInitScript(() => {
    window.kitRuns = () => document.getAnimations();
  });
  const worker =
    context.serviceWorkers()[0] ??
    (await context.waitForEvent("serviceworker", { timeout: 30_000 }));
  const page = context.pages()[0] ?? (await context.newPage());
  // On the bench's origin first: the zoom is kept per origin.
  await page.goto(`${base}/motion/lift`, { waitUntil: "domcontentloaded" });
  await worker.evaluate(async () => {
    /** The extension API's two calls this needs (no `@types/chrome` here). */
    const { tabs } = (
      globalThis as unknown as {
        chrome: {
          tabs: {
            query: (q: object) => Promise<{ id?: number }[]>;
            setZoom: (id: number, factor: number) => Promise<void>;
          };
        };
      }
    ).chrome;
    for (const tab of await tabs.query({})) {
      if (tab.id !== undefined) {
        // biome-ignore lint/performance/noAwaitInLoops: one tab at a time
        await tabs.setZoom(tab.id, 2);
      }
    }
  });
  return { context, page };
}

/** A Chromium page at an integer width, the kit's pinned context. */
async function chromiumAt(kit: Kit, width: number): Promise<Page> {
  const page = await kit.page("desk");
  await page.setViewportSize({ width, height: HEIGHT });
  return page;
}

const table = (rows: [string, Reading][]): string => {
  const names = Object.keys(rows[0][1].parts);
  const head = ["leg", "width", "DRAWER_QUERY", ...names];
  const lines = rows.map(([leg, r]) => [
    leg,
    String(r.width),
    String(r.drawer),
    ...names.map((n) => r.parts[n]),
  ]);
  return [head, ...lines].map((cells) => `| ${cells.join(" | ")} |`).join("\n");
};

/** Each condition's side: the drawer's when it matches at 390px and not at 1440px, the desk's the other way. */
async function sidesOf(
  kit: Kit,
  base: string,
  conditions: string[]
): Promise<Map<string, Side | "other">> {
  const page = await chromiumAt(kit, 390);
  await page.goto(`${base}/motion/lift`, { waitUntil: "domcontentloaded" });
  const narrow = await sweep(page, conditions);
  await page.setViewportSize({ width: 1440, height: HEIGHT });
  const wide = await sweep(page, conditions);
  await page.close();
  const sides = new Map<string, Side | "other">();
  for (const [i, c] of conditions.entries()) {
    let side: Side | "other" = "other";
    if (narrow[i].matches && !wide[i].matches) {
      side = "drawer";
    } else if (!narrow[i].matches && wide[i].matches) {
      side = "desk";
    }
    sides.set(c, side);
  }
  return sides;
}

const legs = (kit: Kit, base: string): Leg[] => [
  ...[899, 900, 901].map((w) => ({
    name: `chromium ${w}`,
    start: async () => {
      const page = await chromiumAt(kit, w);
      return { page, end: () => page.close() };
    },
  })),
  {
    name: "chromium 899.5 (200% zoom)",
    start: async () => {
      const { context, page } = await chromiumZoomedAt(kit, base, 899.5);
      return { page, end: () => context.close() };
    },
  },
  ...[899, 899.5, 900, 901].map((w) => ({
    name: `firefox ${w}`,
    start: async () => {
      const { browser, page } = await firefoxAt(w);
      return { page, end: () => browser.close() };
    },
  })),
];

/** One leg: its parts against the side's reference, and every rule on the line against the query. */
async function checkLeg(
  kit: Kit,
  leg: string,
  page: Page,
  refs: Record<Side, Reading>,
  moved: string[],
  sides: Map<string, Side | "other">
): Promise<Reading> {
  const reading = await readParts(page);
  const side: Side = reading.drawer ? "drawer" : "desk";
  for (const part of moved) {
    kit.check(
      `${leg}: ${part} reads the ${side} side DRAWER_QUERY names`,
      reading.parts[part] === refs[side].parts[part],
      `${reading.parts[part]} against ${refs[side].parts[part]} (width ${reading.width})`
    );
  }
  const swept = await sweep(page, [...sides.keys()]);
  const astray = swept.filter(({ condition, matches }) => {
    const want = sides.get(condition);
    return (
      (want === "drawer" && matches !== reading.drawer) ||
      (want === "desk" && matches === reading.drawer)
    );
  });
  kit.check(
    `${leg}: every built @media rule on the line agrees with DRAWER_QUERY (${side})`,
    astray.length === 0,
    astray.length
      ? `astray: ${astray.map((s) => `${s.condition}=${s.matches}`).join(" ; ")}`
      : `${swept.length} conditions`
  );
  return reading;
}

/** 1 and 2: the line's legs. */
async function onTheLine(kit: Kit, base: string): Promise<void> {
  const refs = {} as Record<Side, Reading>;
  for (const [side, width] of [
    ["drawer", 390],
    ["desk", 1440],
  ] as const) {
    // biome-ignore lint/performance/noAwaitInLoops: one page at a time
    const page = await chromiumAt(kit, width);
    await openBench(page, base);
    refs[side] = await readParts(page);
    await page.close();
  }
  const names = Object.keys(refs.drawer.parts);
  const moved = names.filter(
    (n) => refs.drawer.parts[n] !== refs.desk.parts[n]
  );
  kit.check(
    "the parts the line moves read differently on its two sides",
    moved.length === names.length,
    `moved: ${moved.join(", ")}`
  );
  const conditions = lineConditions();
  const sides = await sidesOf(kit, base, conditions);
  kit.note(
    `the built CSS names the line in ${conditions.length} distinct @media conditions: ${conditions
      .map((c) => `${c} → ${sides.get(c)}`)
      .join(" ; ")}`
  );
  const rows: [string, Reading][] = [
    ["chromium 390", refs.drawer],
    ["chromium 1440", refs.desk],
  ];
  for (const leg of legs(kit, base)) {
    // biome-ignore lint/performance/noAwaitInLoops: one browser at a time
    const { page, end } = await leg.start();
    try {
      await openBench(page, base);
      rows.push([
        leg.name,
        await checkLeg(kit, leg.name, page, refs, moved, sides),
      ]);
    } finally {
      await end();
    }
  }
  kit.note(`readings:\n${table(rows)}`);
}

/** Two frames of the page's own. */
const twoFrames = (page: Page): Promise<void> =>
  page.evaluate(
    () =>
      new Promise<void>((done) =>
        requestAnimationFrame(() => requestAnimationFrame(() => done()))
      )
  );

/**
 * Every scrolling box walked from its top to its end, half a view a step,
 * then put back where it rested (its end when it rested there). A virtual
 * list sizes itself from the rows it has measured and estimates the rest,
 * so at rest its height and its rows' offsets told which rows the load
 * happened to measure (2315, 2450 and 2565px, on one bench at 390): walked
 * through, every row is measured and the list is its rows' real height.
 */
const measureEveryRow = (page: Page): Promise<void> =>
  page.evaluate(async () => {
    const frames = () =>
      new Promise<void>((done) =>
        requestAnimationFrame(() => requestAnimationFrame(() => done()))
      );
    const atEnd = (el: HTMLElement) =>
      el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
    /** Top to end, half a view a step, each step drawn before the next. */
    const walk = async (el: HTMLElement) => {
      el.scrollTop = 0;
      await frames();
      for (let step = 0; step < 400 && !atEnd(el); step += 1) {
        el.scrollTop += Math.max(1, Math.floor(el.clientHeight / 2));
        // biome-ignore lint/performance/noAwaitInLoops: each step is measured before the next
        await frames();
      }
    };
    /** The end moves while the last rows are measured: followed until it holds. */
    const toEnd = async (el: HTMLElement) => {
      for (let step = 0; step < 20; step += 1) {
        const end = el.scrollHeight;
        el.scrollTop = end;
        // biome-ignore lint/performance/noAwaitInLoops: each try reads the height the last one left
        await frames();
        if (el.scrollHeight === end) {
          return;
        }
      }
    };
    const scrollers = [...document.querySelectorAll<HTMLElement>("*")].filter(
      (el) => {
        const y = getComputedStyle(el).overflowY;
        return (
          (y === "auto" || y === "scroll") &&
          el.scrollHeight > el.clientHeight + 1
        );
      }
    );
    for (const el of scrollers) {
      const restedAtEnd = el.scrollTop + el.clientHeight >= el.scrollHeight - 2;
      const rested = el.scrollTop;
      // biome-ignore lint/performance/noAwaitInLoops: one scroller at a time, so none moves another mid-walk
      await walk(el);
      if (restedAtEnd) {
        await toEnd(el);
      } else {
        el.scrollTop = rested;
        await frames();
      }
    }
  });

/**
 * The page's snapshot once it has come to rest: every element's computed
 * style and box the same in two snapshots two frames apart, with no finite
 * animation running between them. Box stillness alone was not rest: a
 * virtual list's rows stand still a frame before its measurements move
 * them, and Caw's panel (a hang card kept mounted while shut) folds, and
 * takes its `--hang-reach`, after the frames that drew it still.
 */
async function restingSnapshot(
  page: Page,
  route: string
): Promise<Record<string, string>> {
  await settle(page, 0);
  await measureEveryRow(page);
  const until = performance.now() + 20_000;
  let last: Record<string, string> = {};
  for (;;) {
    // biome-ignore lint/performance/noAwaitInLoops: one read after another, each waiting on the last
    await settle(page, 0);
    const now = await snapshot(page);
    const read = difference(last, now);
    if (read.same) {
      return now;
    }
    if (performance.now() > until) {
      throw new Error(`${route}: still changing after 20s: ${read.detail}`);
    }
    last = now;
    await twoFrames(page);
  }
}

/** One route at one width, read once, when its page has come to rest. */
async function takeAway(
  kit: Kit,
  base: string,
  width: number,
  route: string
): Promise<Record<string, string>> {
  const page = await chromiumAt(kit, width);
  // One wall clock for every run: a running animation phased by
  // `Date.now()` (DelegateTray's `animation-delay: -{now % 2000}ms`)
  // reads the same before and after. Timers run on as they do.
  await page.clock.setFixedTime(AWAY_CLOCK);
  // The hub answers: the dashboard's socket opens here and is sent the
  // board (EMPTY_BOARD), then stays quiet. With no hub behind the dev server
  // the client tries, fails and backs off again and again, and HubBand
  // opens on each failure and shuts on each try, so no read could land on
  // one state. Answered with the board, the client is connected and the
  // band rests shut. (Its heartbeat asks first after 20s, and with
  // `Date.now()` pinned it never finds the hub silent.)
  const { promise: answered, resolve: answer } = Promise.withResolvers<void>();
  await page.routeWebSocket(
    (url) => url.pathname === "/ws/dashboard",
    (socket) => {
      socket.send(JSON.stringify(EMPTY_BOARD));
      answer();
    }
  );
  await openBench(page, base, route);
  // Every page, a bench too, opens the hub socket (the shell's client), so
  // each is read connected, its band shut: a bench left connecting opened
  // its band 4 s in, mid-read on a slow page and not on a quick one.
  const socket = await readWithin(15_000, () => answered);
  switch (socket.kind) {
    case "answered":
      break;
    case "unanswered":
      throw new Error(
        `${route}: the dashboard opened no hub socket in ${socket.after} ms`
      );
    default:
      throw new Error(`unknown read ${socket satisfies never}`);
  }
  await page.waitForFunction(
    () =>
      (
        globalThis as unknown as {
          __cawcoDebug?: { state: { status: string } };
        }
      ).__cawcoDebug?.state.status === "connected" &&
      document.querySelector(".band-slot > .band-row > :not([data-open])") !==
        null,
    undefined,
    { timeout: 15_000 }
  );
  const taken = await restingSnapshot(page, route);
  await page.close();
  return taken;
}

/** How one read differs from the snapshot before, as a check's detail. */
function difference(
  was: Record<string, string>,
  now: Record<string, string>
): { same: boolean; detail: string } {
  const paths = Object.keys(now);
  /** Each property that differs, with how many elements it differs on. */
  const differs = new Map<string, number>();
  const movedPaths = paths.filter((path) => {
    const diff = changed(was[path], now[path]);
    for (const prop of diff) {
      differs.set(prop, (differs.get(prop) ?? 0) + 1);
    }
    return diff.length > 0;
  });
  const missing = Object.keys(was).filter((p) => !(p in now));
  const props = [...differs].map(([p, n]) => `${p}×${n}`).join(", ");
  return {
    same: movedPaths.length === 0 && missing.length === 0,
    detail: `${paths.length} elements, ${movedPaths.length} differ${props ? ` (${props}; first ${movedPaths[0]})` : ""}, ${missing.length} gone${missing.length ? ` (${missing[0]})` : ""}`,
  };
}

/** 3: away from the line, every element as it was. */
async function awayFromTheLine(kit: Kit, base: string): Promise<void> {
  const away: Record<string, Record<string, string>> = {};
  for (const width of AWAY_WIDTHS) {
    for (const route of AWAY_ROUTES) {
      // biome-ignore lint/performance/noAwaitInLoops: one page at a time
      away[`${width} ${route}`] = await takeAway(kit, base, width, route);
    }
  }
  const file = join(kit.out, "away.json");
  await writeFile(file, JSON.stringify(away));
  kit.note(`away-from-the-line snapshot: ${file}`);
  const before = process.env.PROBE_DRAWER_BEFORE;
  if (!(before && existsSync(before))) {
    return;
  }
  const then = JSON.parse(readFileSync(before, "utf8")) as typeof away;
  for (const [key, now] of Object.entries(away)) {
    const read = difference(then[key] ?? {}, now);
    kit.check(
      `${key}: every element computes as it did before`,
      read.same,
      read.detail
    );
  }
}

const spec: Spec = {
  name: "drawer-line",
  run: async (kit) => {
    kit.note(`DRAWER_QUERY is ${DRAWER_QUERY}`);
    // The build's CSS, for the rule sweep (2).
    await kit.built();
    const base = await kit.bench();
    await onTheLine(kit, base);
    await awayFromTheLine(kit, base);
  },
};
export default spec;
