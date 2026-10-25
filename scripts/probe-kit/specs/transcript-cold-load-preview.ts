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
  (process.env.COLD_LOAD_LEGS ?? "landings,journey,gone,sweep,scrub").split(",")
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
/** The reveal's curve, as an engine writes it back. */
const REVEAL_CURVE = /^cubic-bezier\(0\.22, 1, 0\.36, 1\)$/;

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
  frame?: number;
  from?: number;
  ms?: number;
  phase: string;
  target?: number;
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
      gen: () => { lit: number; revealAt: number | null; shown: number; t: number } | null;
      keptPlace: () => Place | null;
      log: Log;
      rows: () => string[];
    };
    __firstFrames?: { drawing?: number; shell?: number };
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

interface Run {
  delay: unknown;
  duration: unknown;
  easing: unknown;
  id: string;
  start: CSSNumberish | null;
}
/** The generation's runs once the reveal is on them (the list landed). */
const waitReveal = async (page: Page): Promise<Run[]> => {
  const handle = await page.waitForFunction(
    () => {
      const runs = document
        .getAnimations()
        .filter((run) => ["generate", "generate-reveal", "generate-wire"].includes(run.id));
      return (
        runs.some((run) => run.id === "generate-reveal") &&
        runs.map((run) => {
          const timing = run.effect?.getTiming();
          return {
            id: run.id,
            start: run.startTime,
            delay: timing?.delay,
            duration: timing?.duration,
            easing: timing?.easing,
          };
        })
      );
    },
    null,
    { timeout: 15_000, polling: "raf" }
  );
  return (await handle.jsonValue()) as Run[];
};

/** Once the drawing has gone: what is left of it, and the list's own style. */
const waitRest = async (page: Page) => {
  await page.waitForFunction(() => !document.querySelector(".veil"), null, {
    timeout: 15_000,
  });
  return page.evaluate(() => {
    const scroller = document.querySelector(".scroller") as HTMLElement;
    const style = getComputedStyle(scroller);
    return {
      layers: document.querySelectorAll('[data-gen-run="veil"]').length,
      veil: document.querySelectorAll(".veil").length,
      runs: document
        .getAnimations()
        .filter((run) => ["generate", "generate-reveal", "generate-wire"].includes(run.id)).length,
      opacity: style.opacity,
      filter: style.filter,
    };
  });
};

/** The frame the shell is first drawn in, and the frame the drawing first is, counted from the page's start. */
function countFirstFrames(): void {
  const firsts: { shell?: number; drawing?: number } = {};
  (window as unknown as { __firstFrames: typeof firsts }).__firstFrames = firsts;
  let frame = 0;
  const step = () => {
    frame += 1;
    if (firsts.shell === undefined && document.querySelector(".pane-head")) {
      firsts.shell = frame;
    }
    if (firsts.drawing === undefined && document.querySelector('[data-gen-run="veil"]')) {
      firsts.drawing = frame;
    }
    if (frame < 600) {
      requestAnimationFrame(step);
    }
  };
  requestAnimationFrame(step);
}

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
  await page.addInitScript(countFirstFrames);
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
    const many = runs.filter((run) => before(run[leg]) > 2).map((run) => run[leg].writes);
    if (many.length > 0) {
      kit.note(`${label} ${leg}: the landings with more than 2 writes: ${JSON.stringify(many).slice(0, 1500)}`);
    }
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

  // The tail, at each latency: the drawing is up in the shell's first frame,
  // the reveal runs on its clock, and it ends at rest.
  for (const latency of [300, 1000, 2000]) {
    await settings(page, latency, false);
    await setPlace(page, origin, null);
    await page.goto(`${origin}/`);
    const clock = await waitReveal(page);
    const firsts = await page.evaluate(() => ({
      shell: window.__firstFrames?.shell,
      drawing: window.__firstFrames?.drawing,
    }));
    kit.check(
      `${label} ${latency}ms: the drawing is on in the shell's first frame`,
      firsts.shell !== undefined && firsts.drawing === firsts.shell,
      JSON.stringify(firsts)
    );
    const driver = clock.find((run) => run.id === "generate");
    const into = clock.find((run) => run.id === "generate-reveal");
    const out = clock.find((run) => run.id === "generate-wire");
    kit.check(
      `${label} ${latency}ms: the drawing and the reveal run on one clock, 475ms on cubic-bezier(.22, 1, .36, 1) from ${into?.delay}ms`,
      !!(driver && into && out) &&
        clock.every((run) => run.start === driver?.start) &&
        into?.duration === 475 &&
        out?.duration === 475 &&
        [into, out].every((run) => REVEAL_CURVE.test(String(run?.easing))) &&
        Number(into?.delay) >= 930 &&
        Number(out?.delay) === Number(into?.delay) + 254,
      JSON.stringify(clock)
    );
    const atRest = await waitRest(page);
    kit.check(
      `${label} ${latency}ms: it ends at rest (no drawing, no run left, the list whole)`,
      atRest.layers === 0 &&
        atRest.veil === 0 &&
        atRest.runs === 0 &&
        atRest.opacity === "1" &&
        atRest.filter === "none",
      JSON.stringify(atRest)
    );
    if (latency === 1000) {
      const tail = await readLog(page);
      kit.check(
        `${label}: the tail lands on the scroller's end`,
        tail.landing?.tail === true && Math.abs(tail.drawn?.error ?? 99) <= 1,
        JSON.stringify(tail.drawn)
      );
    }
  }
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
        // The strip's drawing: decoration its strip clips (generate.js).
        el.closest(".gen") ||
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
      await waitRest(page);
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

const SMOOTH_OUT = (x: number): number => {
  // cubic-bezier(0.22, 1, 0.36, 1), the reveal's curve (theirs, ui-generation.js).
  if (x <= 0) {
    return 0;
  }
  if (x >= 1) {
    return 1;
  }
  const bx = (t: number) => 3 * 0.22 * t * (1 - t) ** 2 + 3 * 0.36 * t * t * (1 - t) + t ** 3;
  const by = (t: number) => 3 * 1 * t * (1 - t) ** 2 + 3 * 1 * t * t * (1 - t) + t ** 3;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 40; i += 1) {
    const m = (lo + hi) / 2;
    if (bx(m) < x) {
      lo = m;
    } else {
      hi = m;
    }
  }
  return by((lo + hi) / 2);
};

interface Sample {
  blur: number;
  list: number;
  shown: number;
  t: number;
  time: number;
  wire: number;
}

/**
 * The drawing and its reveal held and sought on the DevTools clock
 * (Chromium's Animation domain): every 16ms from the first frame to the last,
 * the list's opacity and blur and the drawing's own opacity on their curve,
 * the drawing standing until the list is in, and the run at rest after.
 */
async function scrub(kit: Kit, origin: string, view: View): Promise<void> {
  const page = await kit.page(view, { engine: "chromium" });
  listen(page, `chromium ${view} scrub`);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Animation.enable");
  const ids = new Map<string, string>();
  cdp.on("Animation.animationStarted", (event) => {
    const { name, id } = event.animation;
    if (name.startsWith("generate")) {
      ids.set(name, id);
    }
  });
  for (const latency of [300, 1000]) {
    const label = `chromium ${view} ${latency}ms`;
    await settings(page, latency, false);
    await setPlace(page, origin, { block: "b-372", into: 20 });
    ids.clear();
    await page.goto(`${origin}/`);
    const runs = await waitReveal(page);
    const names = ["generate", "generate-reveal", "generate-wire"];
    for (let i = 0; i < 100 && names.some((name) => !ids.has(name)); i += 1) {
      await page.waitForTimeout(10);
    }
    kit.note(`${label}: the DevTools Animation domain names ${JSON.stringify([...ids.keys()])}`);
    const all = names.map((name) => ids.get(name) as string);
    await cdp.send("Animation.setPaused", { animations: all, paused: true });
    await page.evaluate(
      () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))
    );
    const revealAt = Number(runs.find((run) => run.id === "generate-reveal")?.delay);
    const end = Number(runs.find((run) => run.id === "generate")?.duration);
    const samples: Sample[] = [];
    for (let time = 0; time < end - 1; time += 16) {
      await cdp.send("Animation.seekAnimations", { animations: all, currentTime: time });
      samples.push(
        await page.evaluate(
          (at) =>
            new Promise<Sample>((done) =>
              requestAnimationFrame(() =>
                requestAnimationFrame(() => {
                  const list = getComputedStyle(document.querySelector(".scroller") as Element);
                  const wire = document.querySelector(".veil .gen-wireframe");
                  const gen = window.__coldLoad?.gen();
                  done({
                    time: at,
                    t: gen?.t ?? -1,
                    shown: gen?.shown ?? 0,
                    list: Number(list.opacity),
                    // biome-ignore lint/performance/useTopLevelRegex: serialized into the page
                    blur: Number(/blur\(([\d.]+)px\)/.exec(list.filter)?.[1] ?? 0),
                    wire: wire ? Number(getComputedStyle(wire).opacity) : -1,
                  });
                })
              )
            ),
          time
        )
      );
    }
    const off = (got: number, want: number) => Math.abs(got - want);
    const lag = 254;
    let listOff = 0;
    let wireOff = 0;
    let blurOff = 0;
    let clockOff = 0;
    let clockAt = 0;
    let gap = 1;
    for (const s of samples) {
      const into = SMOOTH_OUT((s.time - revealAt) / 475);
      const away = 1 - SMOOTH_OUT((s.time - revealAt - lag) / 475);
      listOff = Math.max(listOff, off(s.list, into));
      wireOff = Math.max(wireOff, off(s.wire, away));
      blurOff = Math.max(blurOff, off(s.blur, 3 * (1 - into)));
      if (off(s.t, s.time) > clockOff) {
        clockOff = off(s.t, s.time);
        clockAt = s.time;
      }
      gap = Math.min(gap, Math.max(s.list, s.wire));
    }
    const drawn = samples.filter((s) => s.time >= 480 && s.time <= revealAt);
    kit.note(
      `${label}: ${samples.length} frames sought to ${end}ms, reveal from ${revealAt}ms; worst off its curve: list ${listOff.toFixed(3)}, drawing ${wireOff.toFixed(3)}, blur ${blurOff.toFixed(3)}px; the drawing's clock off the seek by ${clockOff.toFixed(1)}ms (at ${clockAt}ms)`
    );
    kit.check(
      `${label}: one clock, every part sought together (the drawing's time is the seek's)`,
      clockOff <= 1,
      `${clockOff}`
    );
    kit.check(
      `${label}: the drawing stands from its ripple until the list comes in (dots drawn at every frame from 480ms to ${revealAt}ms)`,
      drawn.length > 0 && drawn.every((s) => s.shown > 0 && s.wire === 1 && s.list === 0),
      JSON.stringify(drawn.find((s) => !(s.shown > 0 && s.wire === 1 && s.list === 0)) ?? null)
    );
    kit.check(
      `${label}: the list comes in and the drawing goes on their curve, no hold and no jump (each within 0.02 of it), never both gone`,
      listOff <= 0.02 && wireOff <= 0.02 && blurOff <= 0.06 && gap >= 0.5,
      `list ${listOff.toFixed(3)}, drawing ${wireOff.toFixed(3)}, blur ${blurOff.toFixed(3)}, least shown ${gap.toFixed(3)}`
    );
    await cdp.send("Animation.setPaused", { animations: all, paused: false });
    const atRest = await waitRest(page);
    kit.check(
      `${label}: let go, it ends at rest`,
      atRest.layers === 0 &&
        atRest.veil === 0 &&
        atRest.runs === 0 &&
        atRest.opacity === "1" &&
        atRest.filter === "none",
      JSON.stringify(atRest)
    );
  }
}

/** Every leg, by its name in COLD_LOAD_LEGS, for one engine. */
async function legsOf(kit: Kit, origin: string, engine: Engine): Promise<void> {
  const perView = [
    ["landings", landings],
    ["journey", journey],
    ["gone", gone],
  ] as const;
  for (const view of LANDING_VIEWS) {
    for (const [name, leg] of perView) {
      if (LEGS.has(name)) {
        await leg(kit, origin, engine, view);
      }
    }
  }
  if (LEGS.has("sweep")) {
    await overflow(kit, origin, engine);
  }
  if (LEGS.has("scrub") && engine === "chromium") {
    for (const view of LANDING_VIEWS) {
      await scrub(kit, origin, view);
    }
  }
}

const probe = async (kit: Kit): Promise<void> => {
  const server = serve();
  const origin = `http://127.0.0.1:${server.port}`;
  try {
    for (const engine of ENGINES) {
      await legsOf(kit, origin, engine);
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
