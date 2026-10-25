/**
 * The transcript cold-load demo (design-previews/transcript-cold-load), read
 * from the engine. The built folder is served as it is, on Chromium and
 * WebKit at 1440 and 390 (WebKit's phone says it is an iPhone, so virtua
 * takes its iOS path), and its overflow is swept at 1440, 680 and 390.
 *
 *   bun scripts/probe-kit/run.ts transcript-cold-load-preview
 *   COLD_LOAD_LEGS=journey,gone …   # some legs only: landings, journey, gone, sweep
 *
 * Asserted:
 * - a kept place (the `cawco-place` cookie the server's load reads) lands
 *   unseen within 1px of its block and offset, on a fresh tab (no kept
 *   sizes) and on a refresh (the sizes the tab kept), in at most 3 writes
 *   before the reveal, for ten places; it is still there once the 1.5s hold
 *   has run, and nothing in the landing read as the reader;
 * - the tail lands on the scroller's end within 1px; the skeleton's bars
 *   pulse on one clock; the veil goes and the list comes on one clock, the
 *   house's 400ms ease-in-out;
 * - "Scroll up anywhere, then refresh": the reader's scroll moves the place
 *   and the cookie carries it; an older page arriving above leaves the row
 *   at the top within 1px, a newer page arriving below too; a refresh lands
 *   back on that row within 1px; the address never carries the place;
 * - a spot the hub no longer holds lands at the tail, says so once in the
 *   dock, drops the session from the cookie, and the reader's scroll lets
 *   the line go;
 * - the overflow sweep (the page or a part reaching past its box sideways)
 *   totals zero at 1440, 680 and 390, landed and with the dock up;
 * - no console error on any page.
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one page, one landing at a time
import { join, normalize } from "node:path";
import type { Page } from "playwright-core";
import type { Engine, Kit, Spec, View } from "../kit";

const FOLDER = normalize(
  join(import.meta.dir, "..", "..", "..", "design-previews", "transcript-cold-load")
);
const ENGINES: Engine[] = ["chromium", "webkit"];
const LANDING_VIEWS: View[] = ["desk", "phone"];
const SWEEP_VIEWS: View[] = ["desk", "narrowDesk", "phone"];
const LEGS = new Set(
  (process.env.COLD_LOAD_LEGS ?? "landings,journey,gone,sweep").split(",")
);
/** The demo's one session, and the cookie its place is kept in (source/src/hub.js, place.js). */
const SESSION = "ses-obsidian-7k2q";
const COOKIE = "cawco-place";
/** Ten places mid-conversation, and how far into each row the view stood. */
const PLACES = Array.from(
  { length: Number(process.env.COLD_LOAD_PLACES ?? 10) },
  (_, i) => `b-${355 + i}`
);
const INTO = 30;
const HOLD_MS = 1500;
const GONE_WORDS = "Where you were isn't in this session any more.";

const serve = () =>
  Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const path = decodeURIComponent(new URL(request.url).pathname);
      const file = normalize(join(FOLDER, path === "/" ? "index.html" : path));
      if (!file.startsWith(FOLDER) || file.startsWith(join(FOLDER, "source"))) {
        return new Response(null, { status: 403 });
      }
      const body = Bun.file(file);
      return (await body.exists())
        ? new Response(body)
        : new Response(null, { status: 404 });
    },
  });

const errors: string[] = [];
const listen = (page: Page, where: string): void => {
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(`${where}: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => {
    errors.push(`${where}: ${error.message}`);
  });
};

interface Write {
  phase: string;
}
interface Drawn {
  error: number | null;
  frame: number;
  ms: number;
}
interface Log {
  drawn: Drawn | null;
  held: unknown[];
  landing: { block?: string; gone?: boolean; tail: boolean } | null;
  readerMoved: unknown[];
  writes: Write[];
}
interface Place {
  block: string;
  into: number;
}
declare global {
  interface Window {
    __coldLoad?: {
      blockTop: (key: string) => number | null;
      edges: () => {
        after: number | null;
        cursor: number | null;
        readingNewer: boolean;
        readingOlder: boolean;
      };
      keptPlace: () => Place | null;
      log: Log;
      rows: () => string[];
    };
  }
}

/**
 * The demo's settings for this tab, taken up as the next page of the demo
 * starts: the hub's latency, the spot kept or gone, and no sizes kept. An
 * init script, so it lands after the page before has written its own sizes
 * on `pagehide`, and once only: a refresh after it keeps the sizes.
 */
let configs = 0;
const settings = (page: Page, latency: number, spotGone: boolean) => {
  configs += 1;
  return page.addInitScript(
    ([token, ms, off]) => {
      try {
        if (location.protocol !== "http:" || sessionStorage.getItem("cold-load-test") === token) {
          return;
        }
        sessionStorage.setItem("cold-load-test", token);
        sessionStorage.setItem("cold-load-demo:latency", String(ms));
        sessionStorage.setItem("cold-load-demo:gone", off ? "1" : "0");
        sessionStorage.removeItem("cold-load-demo:sizes");
      } catch {
        // A frame with no storage of its own.
      }
    },
    [`config-${configs}`, latency, spotGone] as const
  );
};

/**
 * The session's place in its cookie, as the reader left it (null: the tail).
 * Set with the demo's page gone: a page leaving writes its own place on
 * `pagehide`, over anything set before it went.
 */
const setPlace = async (page: Page, origin: string, place: Place | null) => {
  await page.goto("about:blank");
  const all = place ? { [SESSION]: { b: place.block, i: place.into } } : {};
  await page.context().addCookies([
    {
      name: COOKIE,
      value: encodeURIComponent(JSON.stringify(all)),
      url: origin,
      sameSite: "Lax",
    },
  ]);
};

/** The session's place as the cookie holds it now. */
const cookiePlace = (page: Page) =>
  page.evaluate(
    ([name, session]) => {
      const raw = document.cookie
        .split("; ")
        .find((pair) => pair.startsWith(`${name}=`))
        ?.slice(name.length + 1);
      const kept = raw ? JSON.parse(decodeURIComponent(raw))[session] : undefined;
      return kept ? { block: String(kept.b), into: Number(kept.i) } : null;
    },
    [COOKIE, SESSION] as const
  );

const readLog = (page: Page) =>
  page.evaluate(() => JSON.parse(JSON.stringify(window.__coldLoad?.log)) as Log);

const waitDrawn = async (page: Page): Promise<Log> => {
  await page.waitForFunction(() => window.__coldLoad?.log.drawn, null, {
    timeout: 15_000,
  });
  return readLog(page);
};

interface Fade {
  duration: unknown;
  easing: unknown;
  on: string;
  start: CSSNumberish | null;
}
/** The reveal's runs, read in the frame the list is drawn. */
const waitFade = async (page: Page): Promise<Fade[]> => {
  const handle = await page.waitForFunction(
    () =>
      window.__coldLoad?.log.drawn &&
      document
        .getAnimations()
        .filter((run) => !(run instanceof CSSAnimation))
        .map((run) => {
          const timing = run.effect?.getTiming();
          return {
            start: run.startTime,
            duration: timing?.duration,
            easing: timing?.easing,
            on: String((run.effect as KeyframeEffect).target?.className),
          };
        }),
    null,
    { timeout: 15_000, polling: "raf" }
  );
  return (await handle.jsonValue()) as Fade[];
};

/** How far the block's row stands from where the place puts it: its top at the view's top, `into` up. */
const placeError = (page: Page, block: string, into: number) =>
  page.evaluate(
    ([key, past]) => {
      const row = document.querySelector(`[data-key="${key}"]`);
      const scroller = document.querySelector(".scroller");
      if (!(row && scroller)) {
        return null;
      }
      const box = row.getBoundingClientRect();
      const reach = Math.min(past, Math.max(0, box.height - 1));
      return box.top - scroller.getBoundingClientRect().top + reach;
    },
    [block, into] as const
  );

const scrollerCentre = (page: Page) =>
  page.evaluate(() => {
    const box = document.querySelector(".scroller")?.getBoundingClientRect();
    return box
      ? { x: box.left + box.width / 2, y: box.top + box.height / 2 }
      : { x: 0, y: 0 };
  });

/**
 * The reader scrolls by `by` a step, until `done` says so or `steps` run
 * out: by the mouse wheel, or where Playwright has none (mobile WebKit), by
 * a finger's touchstart, the scroll it makes, and its touchend.
 */
const scrollAsReader = async (
  page: Page,
  finger: boolean,
  by: number,
  steps: number,
  done: () => boolean | undefined = () => false
): Promise<void> => {
  const centre = await scrollerCentre(page);
  if (!finger) {
    await page.mouse.move(centre.x, centre.y);
  }
  for (let i = 0; i < steps; i += 1) {
    if (finger) {
      await page.evaluate((y) => {
        const scroller = document.querySelector(".scroller");
        scroller?.dispatchEvent(new Event("touchstart"));
        scroller?.scrollBy(0, y);
        scroller?.dispatchEvent(new Event("touchend"));
      }, by);
    } else {
      await page.mouse.wheel(0, by);
    }
    await page.waitForTimeout(40);
    if (await page.evaluate(done)) {
      return;
    }
  }
};

/** Until the scroller has not moved for ten frames: the reader's scroll, its smoothing included, at rest. */
const rest = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<void>((done) => {
        const scroller = document.querySelector(".scroller");
        let last = scroller?.scrollTop;
        let still = 0;
        const step = () => {
          const now = scroller?.scrollTop;
          still = now === last ? still + 1 : 0;
          last = now;
          if (still >= 10) {
            done();
          } else {
            requestAnimationFrame(step);
          }
        };
        requestAnimationFrame(step);
      })
  );

/** Every frame for `ms`, where the block's row stands in the view, and how many rows are held. */
const track = (page: Page, block: string, ms: number) =>
  page.evaluate(
    ([key, span]) =>
      new Promise<{ rows: number[]; tops: (number | null)[] }>((done) => {
        const tops: (number | null)[] = [];
        const rows: number[] = [];
        const end = performance.now() + span;
        const step = () => {
          tops.push(window.__coldLoad?.blockTop(key) ?? null);
          rows.push(window.__coldLoad?.rows().length ?? 0);
          if (performance.now() < end) {
            requestAnimationFrame(step);
          } else {
            done({ tops, rows });
          }
        };
        requestAnimationFrame(step);
      }),
    [block, ms] as const
  );

const worstDrift = (tops: (number | null)[]): number => {
  const [first] = tops;
  if (first === null || first === undefined) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.max(
    ...tops.map((top) =>
      top === null ? Number.POSITIVE_INFINITY : Math.abs(top - first)
    )
  );
};

const stat = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return {
    median: Number(median.toFixed(2)),
    worst: Number(sorted.at(-1)?.toFixed(2)),
  };
};

/** Ten kept places, each landed on a fresh tab and again on a refresh, and the tail. */
async function landings(
  kit: Kit,
  origin: string,
  engine: Engine,
  view: View
): Promise<void> {
  const label = `${engine} ${view}`;
  const page = await kit.page(view, { engine });
  listen(page, label);
  const runs: {
    fresh: Log;
    cached: Log;
    freshError: number | null;
    cachedError: number | null;
  }[] = [];
  for (const block of PLACES) {
    await settings(page, 300, false);
    await setPlace(page, origin, { block, into: INTO });
    await page.goto(`${origin}/`);
    await waitDrawn(page);
    await page.waitForTimeout(HOLD_MS + 300);
    const freshError = await placeError(page, block, INTO);
    const fresh = await readLog(page);
    await page.reload();
    await waitDrawn(page);
    await page.waitForTimeout(HOLD_MS + 300);
    const cachedError = await placeError(page, block, INTO);
    const cached = await readLog(page);
    runs.push({ fresh, cached, freshError, cachedError });
  }
  const before = (log: Log) =>
    log.writes.filter((w) => w.phase === "land" || w.phase === "reveal").length;
  const after = (log: Log) => log.writes.filter((w) => w.phase === "hold").length;
  const drawErr = (log: Log) =>
    Math.abs(log.drawn?.error ?? Number.POSITIVE_INFINITY);
  for (const leg of ["fresh", "cached"] as const) {
    const writes = stat(runs.map((run) => before(run[leg])));
    const errs = stat(runs.map((run) => drawErr(run[leg])));
    const frames = stat(runs.map((run) => run[leg].drawn?.frame ?? 99));
    const holds = stat(runs.map((run) => after(run[leg])));
    const finals = stat(
      runs.map((run) =>
        Math.abs(run[`${leg}Error`] ?? Number.POSITIVE_INFINITY)
      )
    );
    kit.note(
      `${label} ${leg}: writes before the reveal ${JSON.stringify(writes)}, frames ${JSON.stringify(frames)}, landing error px ${JSON.stringify(errs)}, hold writes after it ${JSON.stringify(holds)}, error once held ${JSON.stringify(finals)}`
    );
    kit.check(
      `${label} ${leg}: ten places land within 1px`,
      errs.worst <= 1,
      JSON.stringify(errs)
    );
    kit.check(
      `${label} ${leg}: at most 3 writes before the reveal`,
      writes.worst <= 3,
      JSON.stringify(writes)
    );
    kit.check(
      `${label} ${leg}: each place still within 1px once the hold has run`,
      finals.worst <= 1,
      JSON.stringify(finals)
    );
  }
  const moved = runs.reduce(
    (n, run) => n + run.fresh.readerMoved.length + run.cached.readerMoved.length,
    0
  );
  const held = runs.flatMap((run) => [...run.fresh.held, ...run.cached.held]);
  kit.note(
    `${label}: scrolls after the reveal with no reader input, kept as the list's own: ${held.length} ${JSON.stringify(held).slice(0, 1200)}`
  );
  kit.check(
    `${label}: nothing in twenty landings read as the reader`,
    moved === 0,
    `${moved}`
  );

  // The tail, and the veil's pulse on one clock while the hub reads.
  await settings(page, 1000, false);
  await setPlace(page, origin, null);
  await page.goto(`${origin}/`);
  await page.waitForSelector(".veil .sk");
  const pulses = await page.evaluate(() =>
    document
      .getAnimations()
      .filter(
        (run) =>
          run instanceof CSSAnimation && run.animationName === "skeleton-pulse"
      )
      .map((run) => run.startTime)
  );
  kit.check(
    `${label}: the skeleton's ${pulses.length} bars pulse on one clock`,
    pulses.length > 0 && pulses.every((start) => start === 0),
    JSON.stringify([...new Set(pulses)])
  );
  const fade = await waitFade(page);
  const tail = await readLog(page);
  kit.check(
    `${label}: the veil goes and the list comes on one clock, 400ms ease-in-out`,
    fade.length === 2 &&
      fade.every(
        (run) =>
          run.start === fade[0].start &&
          run.duration === 400 &&
          // --ease-crossfade; WebKit names the same curve by its keyword.
          ["cubic-bezier(0.42, 0, 0.58, 1)", "ease-in-out"].includes(String(run.easing))
      ) &&
      fade.some((run) => run.on.includes("veil")) &&
      fade.some((run) => run.on.includes("scroller")),
    JSON.stringify(fade)
  );
  kit.check(
    `${label}: the tail lands on the scroller's end`,
    tail.landing?.tail === true && Math.abs(tail.drawn?.error ?? 99) <= 1,
    JSON.stringify(tail.drawn)
  );
}

/**
 * The reader scrolls toward one end until the page that way is asked for,
 * comes to rest, and the page arrives while the row at the top is watched.
 */
async function pageArrives(
  kit: Kit,
  page: Page,
  label: string,
  finger: boolean,
  way: "older" | "newer"
): Promise<void> {
  const rowsBefore = await page.evaluate(
    () => window.__coldLoad?.rows().length ?? 0
  );
  await scrollAsReader(
    page,
    finger,
    way === "older" ? -500 : 600,
    80,
    way === "older"
      ? () => window.__coldLoad?.edges().readingOlder
      : () => window.__coldLoad?.edges().readingNewer
  );
  await rest(page);
  const place = await page.evaluate(
    () => window.__coldLoad?.keptPlace() ?? null
  );
  const asked = await page.evaluate(() => window.__coldLoad?.edges());
  if (!place) {
    kit.check(`${label}: the reader's scroll keeps a place`, false, "none kept");
    return;
  }
  const seen = await track(page, place.block, 3500);
  const rowsAfter = seen.rows.at(-1) ?? 0;
  kit.check(
    `${label}: ${way === "older" ? "an older" : "a newer"} page came in ${way === "older" ? "above" : "below"} (${rowsBefore} → ${rowsAfter} rows) at rest, and ${place.block} stayed within 1px`,
    rowsAfter > (seen.rows[0] ?? 0) && worstDrift(seen.tops) <= 1,
    `drift ${worstDrift(seen.tops).toFixed(2)}px, asked ${JSON.stringify(asked)}`
  );
}

/** "Scroll up anywhere, then refresh", and down past the window. */
async function journey(
  kit: Kit,
  origin: string,
  engine: Engine,
  view: View
): Promise<void> {
  const label = `${engine} ${view}`;
  const finger = engine === "webkit" && view === "phone";
  const page = await kit.page(view, { engine });
  listen(page, `${label} journey`);
  // The hub slow enough that the reader is at rest before the page lands.
  await settings(page, 2000, false);
  await setPlace(page, origin, { block: "b-400", into: 0 });
  await page.goto(`${origin}/`);
  await waitDrawn(page);
  await page.waitForTimeout(HOLD_MS + 300);

  await pageArrives(kit, page, label, finger, "older");
  await page.waitForTimeout(400);
  const kept = await page.evaluate(() => window.__coldLoad?.keptPlace() ?? null);
  const cookie = await cookiePlace(page);
  const search = await page.evaluate(() => location.search);
  kit.check(
    `${label}: the cookie carries the place, and the address does not`,
    kept !== null &&
      cookie?.block === kept.block &&
      Math.abs((cookie?.into ?? -99) - kept.into) <= 0.5 &&
      search === "",
    `${JSON.stringify(cookie)} vs ${JSON.stringify(kept)}, address "${search}"`
  );

  // Refresh: back on that row.
  await page.reload();
  const back = await waitDrawn(page);
  const backError = cookie ? await placeError(page, cookie.block, cookie.into) : null;
  kit.check(
    `${label}: a refresh lands back on ${cookie?.block} within 1px`,
    back.landing?.block === cookie?.block &&
      Math.abs(back.drawn?.error ?? 99) <= 1 &&
      Math.abs(backError ?? 99) <= 1,
    `drawn ${back.drawn?.error}, now ${backError}`
  );

  await page.waitForTimeout(HOLD_MS + 300);
  await pageArrives(kit, page, label, finger, "newer");
}

/** A spot the hub no longer holds. */
async function gone(
  kit: Kit,
  origin: string,
  engine: Engine,
  view: View
): Promise<void> {
  const label = `${engine} ${view}`;
  const page = await kit.page(view, { engine });
  listen(page, `${label} gone`);
  await settings(page, 300, true);
  await setPlace(page, origin, { block: "b-360", into: 12 });
  await page.goto(`${origin}/`);
  const log = await waitDrawn(page);
  await page.waitForTimeout(400);
  const dock = await page.evaluate(
    () => document.querySelector(".dock")?.textContent ?? ""
  );
  const cookie = await cookiePlace(page);
  kit.check(
    `${label}: a gone spot lands at the tail, says so once, and leaves the cookie`,
    log.landing?.gone === true &&
      Math.abs(log.drawn?.error ?? 99) <= 1 &&
      dock === GONE_WORDS &&
      cookie === null,
    JSON.stringify({ drawn: log.drawn, dock, cookie })
  );
  await page.waitForTimeout(HOLD_MS);
  await scrollAsReader(page, engine === "webkit" && view === "phone", -300, 2);
  await page.waitForTimeout(200);
  const after = await page.evaluate(
    () => document.querySelector(".dock")?.textContent ?? ""
  );
  kit.check(`${label}: the reader's scroll lets the line go`, after === "", after);
}

/** Every part that reaches past the page, or past the box that clips it, sideways. */
const sweep = (page: Page) =>
  page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const spills: string[] = [];
    const root = document.scrollingElement ?? document.documentElement;
    if (root.scrollWidth > root.clientWidth + 0.5) {
      spills.push(`page ${root.scrollWidth} > ${root.clientWidth}`);
    }
    const clipOf = (el: Element) => {
      for (let at = el.parentElement; at; at = at.parentElement) {
        if (getComputedStyle(at).overflowX !== "visible") {
          return at.getBoundingClientRect();
        }
      }
      return { left: 0, right: width };
    };
    for (const el of document.querySelectorAll("body *")) {
      // What scrolls sideways by design (a code block, a table) holds its own.
      if (
        el.parentElement?.closest("pre, table") ||
        !el.checkVisibility({ visibilityProperty: true })
      ) {
        continue;
      }
      const box = el.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) {
        continue;
      }
      const clip = clipOf(el);
      if (
        box.left < Math.max(0, clip.left) - 0.5 ||
        box.right > Math.min(width, clip.right) + 0.5
      ) {
        const name = `${el.tagName.toLowerCase()}.${[...el.classList].join(".")}`;
        spills.push(`${name} ${box.left.toFixed(1)}..${box.right.toFixed(1)}`);
      }
    }
    return spills;
  });

async function overflow(kit: Kit, origin: string, engine: Engine): Promise<void> {
  let total = 0;
  const found: string[] = [];
  for (const view of SWEEP_VIEWS) {
    const page = await kit.page(view, { engine });
    listen(page, `${engine} ${view} sweep`);
    for (const [state, off] of [
      ["landed", false],
      ["dock up", true],
    ] as const) {
      await settings(page, 300, off);
      await setPlace(page, origin, { block: "b-372", into: 20 });
      await page.goto(`${origin}/`);
      await waitDrawn(page);
      await page.waitForTimeout(600);
      const spills = await sweep(page);
      total += spills.length;
      found.push(...spills.slice(0, 4).map((s) => `${view} ${state}: ${s}`));
    }
  }
  kit.check(
    `${engine}: the overflow sweep at 1440, 680 and 390 totals zero`,
    total === 0,
    `${total}${found.length ? `: ${found.join("; ")}` : ""}`
  );
}

const probe = async (kit: Kit): Promise<void> => {
  const server = serve();
  const origin = `http://127.0.0.1:${server.port}`;
  try {
    for (const engine of ENGINES) {
      for (const view of LANDING_VIEWS) {
        if (LEGS.has("landings")) {
          await landings(kit, origin, engine, view);
        }
        if (LEGS.has("journey")) {
          await journey(kit, origin, engine, view);
        }
        if (LEGS.has("gone")) {
          await gone(kit, origin, engine, view);
        }
      }
      if (LEGS.has("sweep")) {
        await overflow(kit, origin, engine);
      }
    }
    kit.check(
      "no page said a console error",
      errors.length === 0,
      errors.slice(0, 8).join("; ")
    );
  } finally {
    server.stop(true);
  }
};

const spec: Spec = { name: "transcript-cold-load-preview", run: probe };
export default spec;
