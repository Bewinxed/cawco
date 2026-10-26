/**
 * A page's component canvases mount in parallel: the last of five paints
 * near the time one alone does.
 *
 * On 2026-10-25 an audit of the live dashboard read a page of five canvases
 * stand five skeletons at 233 ms, four at 1085, three at 2459, two at 3766,
 * one at 4973 and none at 5609 ms, while one canvas alone painted at 1336
 * ms: the page gave its canvases their turns one after another (dashboard
 * decisions host embed-turns.ts).
 *
 * The dashboard's own stage (decision-embeds.ts `startDecisionStage`, no
 * fleet) draws five states files of the dashboard, the pages and the embed
 * origin on HTTPS over HTTP/2 as the hub serves them on the tailnet, each
 * answer of the embed origin held {@link HOLD_MS} as the hops to a stage
 * hold it, the stage warm
 * (each canvas drawn on it once first, as a canvas the person was shown is).
 * On each engine, every page opened in a fresh context (nothing cached), in
 * a window that holds it whole ({@link WINDOW}):
 *
 * - each canvas alone on a page of its own, its first paint read (the
 *   Preview's frame drawn at its shape, its skeleton gone);
 * - the five together on one page, each one's first paint read.
 *
 * Each page is read {@link TAKES} times; each paint is its best take. The
 * page of five paints its last within 1.5× the slowest canvas alone, every
 * one draws its story with a box and none says it didn't load; and, what
 * the turns were there for (Chromium caps a renderer's requests in flight
 * at 2,700 and fails each past it with `net::ERR_INSUFFICIENT_RESOURCES`),
 * no request failed so and the page never held 2,700 in flight (its embeds
 * fetch within embed-turns.ts `BUDGET`).
 *
 *   bun scripts/probe-kit/run.ts canvas-parallel
 */
import type { Page } from "playwright-core";
import { scratchCertificate } from "../cloudflare-front";
import {
  APP,
  CAWCO_BRIDGE,
  EMBED_FRAME,
  idOf,
  STAGE_START_MS,
  startDecisionStage,
} from "../decision-embeds";
import type { Engine, Kit, Spec } from "../kit";

/** Chromium's cap on one renderer's requests in flight (services/network/network_context.h `kMaxOutstandingRequestsPerProcess`). */
const CHROMIUM_CAP = 2700;
/** How long the embed origin holds each answer: the hops between the owner's browser and a stage hold a request in flight, some 350 ms through the hub's preview proxy (decision-embeds.ts `embedOrigin`). `CANVAS_PARALLEL_HOLD` sets another. */
const HOLD_MS = Number(process.env.CANVAS_PARALLEL_HOLD ?? 350);
/** How many times each page is opened fresh; each paint is its best. */
const TAKES = 3;
/** Every page's window: a desk's width, tall enough to hold the page of five whole (RoutineForm's Filled alone stands 1,714px). */
const WINDOW = { width: 1440, height: 4800 };
/** The page of five paints its last within this many times the slowest canvas alone. The brief's. */
const WITHIN = 1.5;

/** Five canvases of the dashboard, a story each, as a page shows them. */
const CANVASES = [
  ["needs", "src/lib/cawco/home/NeedsCard.stories.ts", "Issue"],
  ["routine", "src/lib/cawco/routines/RoutineForm.stories.ts", "Filled"],
  ["suggest", "src/lib/cawco/suggestions/Suggestions.stories.ts", "List"],
  ["sheet", "src/lib/cawco/preview/SheetInspector.stories.ts", "Desk"],
  ["prompt", "src/lib/cawco/transcript/Prompt.stories.ts", "Connected"],
] as const;
const idFor = (name: string) => idOf(`par-${name}`);

/** A page of one card whose options each show one of `names`' canvases. */
const program = (title: string, names: readonly string[]): string =>
  [
    `root = Decisions("${title}", [card])`,
    `card = Decision("card", "Which of these reads right?", [${names.map((_, at) => `o${at}`).join(", ")}], "Each option shows a canvas.")`,
    ...names.map(
      (_name, at) =>
        `o${at} = Option("o${at}", "Option ${at + 1}", "This canvas.", ${at === 0}, [p${at}], "Another canvas.")`
    ),
    ...names.map((name, at) => {
      const story = CANVASES.find((one) => one[0] === name)?.[2] ?? "";
      return `p${at} = Preview("${idFor(name)}", "${name}", ["${story}"])`;
    }),
  ].join("\n");

const FIVE = "five";
const alone = (name: string) => `one-${name}`;

/**
 * The decision page's clock: when each Preview's frame got its address and
 * when it stood painted (drawn, at its shape, its skeleton gone), ms since
 * the page's navigation began, by artifact.
 */
function paintClock(): void {
  if (location.pathname.includes("/@cawco/canvas")) {
    return;
  }
  const paints: Record<string, { address?: number; painted?: number }> = {};
  (window as unknown as { __kitPaints?: typeof paints }).__kitPaints = paints;
  const read = () => {
    for (const frame of document.querySelectorAll<HTMLIFrameElement>(
      "iframe[data-slot=embed][data-cawco-artifact]"
    )) {
      const id = frame.dataset.cawcoArtifact ?? "";
      const one = paints[id] ?? {};
      paints[id] = one;
      if (one.address === undefined && frame.getAttribute("src")) {
        one.address = performance.now();
      }
      if (
        one.painted === undefined &&
        frame.dataset.drawn !== undefined &&
        frame.dataset.shape === "drawn"
      ) {
        one.painted = performance.now();
      }
    }
  };
  new MutationObserver(read).observe(document, {
    attributes: true,
    childList: true,
    subtree: true,
  });
}

/** What one opening of a page read. */
interface Opened {
  /** The renderer's main thread busy until the last paint, ms (Chromium's trace, `RunTask` on `CrRendererMain`); null on another engine. */
  busy: number | null;
  /** Requests that failed past the renderer's cap. */
  capped: string[];
  /** What each embed shows that is not its story drawn with a box. */
  faults: string[];
  /** Each canvas's address and paint, ms from navigation, by name. */
  paints: Record<string, { address: number | null; painted: number | null }>;
  /** The most requests the page held in flight at once, its frames' included. */
  peak: number;
}

/** Each embed's failure line, or its story not drawn with a box. */
function frameFaults(): string[] {
  const failed = document
    .querySelector(".cawco-section-failed")
    ?.textContent?.trim();
  const rest = [
    ...document.querySelectorAll<HTMLElement>(
      '.cawco-frame[data-cawco-interaction="rest"] .cawco-frame-body'
    ),
  ].map((body) => body.getBoundingClientRect());
  return [
    ...(failed ? [failed] : []),
    ...(rest.length === 0 ? ["no rest frame"] : []),
    ...rest
      .filter((box) => box.width <= 0 || box.height <= 0)
      .map((box) => `a frame ${box.width}×${box.height}`),
  ];
}

/** The ms a trace's renderer main threads ran tasks (`RunTask` on `CrRendererMain`). */
function mainBusy(trace: Buffer): number {
  const { traceEvents } = JSON.parse(trace.toString("utf8")) as {
    traceEvents: {
      args?: { name?: string };
      dur?: number;
      name: string;
      ph: string;
      pid: number;
      tid: number;
    }[];
  };
  const main = new Set(
    traceEvents
      .filter(
        (one) =>
          one.name === "thread_name" && one.args?.name === "CrRendererMain"
      )
      .map((one) => `${one.pid}:${one.tid}`)
  );
  const us = traceEvents
    .filter(
      (one) =>
        one.ph === "X" &&
        one.name === "RunTask" &&
        main.has(`${one.pid}:${one.tid}`)
    )
    .reduce((sum, one) => sum + (one.dur ?? 0), 0);
  return Math.round(us / 1000);
}

/** `url` opened in a fresh context on `engine`, read once every Preview stands painted. */
async function open(
  kit: Kit,
  engine: Engine,
  url: string,
  names: readonly string[]
): Promise<Opened> {
  const page: Page = await kit.page("desk", {
    engine,
    theme: "light",
    init: [CAWCO_BRIDGE, paintClock],
    ignoreHTTPSErrors: true,
  });
  // A window that holds the whole page: the five stand in view together, as the canvases a person sees at once (a canvas far from the view mounts only as it nears it, Preview.svelte `FETCH_MARGIN`).
  await page.setViewportSize(WINDOW);
  let inFlight = 0;
  let peak = 0;
  const capped: string[] = [];
  page.on("request", () => {
    inFlight += 1;
    peak = Math.max(peak, inFlight);
  });
  page.on("requestfinished", () => {
    inFlight -= 1;
  });
  page.on("requestfailed", (request) => {
    inFlight -= 1;
    const why = request.failure()?.errorText ?? "";
    if (why.includes("INSUFFICIENT_RESOURCES")) {
      capped.push(request.url());
    }
  });
  // Chromium's trace of the page's renderer, the decision page and its embeds alike (one site, one process).
  const browser = engine === "chromium" ? page.context().browser() : null;
  await browser?.startTracing(page, {
    categories: [
      "devtools.timeline",
      "disabled-by-default-devtools.timeline",
      "v8",
    ],
  });
  await page.goto(url, { waitUntil: "load" });
  const painted = await page
    .waitForFunction(
      (count) => {
        const paints = (
          window as unknown as {
            __kitPaints?: Record<string, { painted?: number }>;
          }
        ).__kitPaints;
        return (
          Object.values(paints ?? {}).filter((one) => one.painted !== undefined)
            .length === count
        );
      },
      names.length,
      { timeout: STAGE_START_MS, polling: 50 }
    )
    .then(
      () => true,
      () => false
    );
  const byId = await page.evaluate(
    () =>
      (
        window as unknown as {
          __kitPaints?: Record<string, { address?: number; painted?: number }>;
        }
      ).__kitPaints ?? {}
  );
  const busy = browser ? mainBusy(await browser.stopTracing()) : null;
  const faults: string[] = painted ? [] : ["not every Preview painted"];
  for (const handle of await page.$$(EMBED_FRAME)) {
    const id = (await handle.getAttribute("data-cawco-artifact")) ?? "";
    const name = names.find((one) => idFor(one) === id) ?? id;
    const frame = await handle.contentFrame();
    const said = frame ? await frame.evaluate(frameFaults) : ["no frame"];
    faults.push(...said.map((one) => `${name}: ${one}`));
  }
  await page.close();
  return {
    busy,
    capped,
    faults,
    peak,
    paints: Object.fromEntries(
      names.map((name) => {
        const one = byId[idFor(name)];
        return [
          name,
          {
            address:
              one?.address === undefined ? null : Math.round(one.address),
            painted:
              one?.painted === undefined ? null : Math.round(one.painted),
          },
        ];
      })
    ),
  };
}

/** Each canvas drawn on the stage's own port once, so Vite has transformed its graph before any page is timed. */
async function warm(kit: Kit, stagePort: number): Promise<void> {
  for (const [, file, story] of CANVASES) {
    const page = await kit.page("desk", { theme: "light" });
    await page.goto(
      `http://127.0.0.1:${stagePort}/@cawco/canvas?file=${encodeURIComponent(file)}&by=embed&story=${story}`,
      { waitUntil: "load" }
    );
    await page
      .waitForFunction(
        () =>
          document.querySelector(
            '.cawco-frame[data-cawco-interaction="rest"] .cawco-frame-status[data-state="drawn"]'
          ) !== null,
        undefined,
        { timeout: STAGE_START_MS, polling: 250 }
      )
      .catch(() => undefined);
    await page.close();
  }
}

const best = (values: (number | null)[]): number | null => {
  const known = values.filter((one): one is number => one !== null);
  return known.length === values.length ? Math.min(...known) : null;
};

/** One engine's reads: each canvas alone, then the five together, each page opened fresh {@link TAKES} times. */
async function onEngine(
  kit: Kit,
  engine: Engine,
  pageUrl: (name: string) => string
): Promise<void> {
  const names = CANVASES.map((one) => one[0]);
  const singles: Record<string, number | null> = {};
  const singlesBusy: Record<string, number | null> = {};
  for (const name of names) {
    const takes: (number | null)[] = [];
    const busy: (number | null)[] = [];
    for (let take = 0; take < TAKES; take += 1) {
      const read = await open(kit, engine, pageUrl(alone(name)), [name]);
      takes.push(read.paints[name]?.painted ?? null);
      busy.push(read.busy);
      if (read.faults.length > 0) {
        kit.check(
          `${engine}: ${name} alone draws its story`,
          false,
          read.faults.join("; ")
        );
      }
    }
    singles[name] = best(takes);
    singlesBusy[name] = best(busy);
  }
  const fives: Opened[] = [];
  for (let take = 0; take < TAKES; take += 1) {
    fives.push(await open(kit, engine, pageUrl(FIVE), names));
  }
  const lastOf = (read: Opened) => {
    const paints = Object.values(read.paints).map((one) => one.painted);
    return paints.every((one) => one !== null)
      ? Math.max(...(paints as number[]))
      : null;
  };
  const last = best(fives.map(lastOf));
  const slowest = Math.max(
    ...names.map((name) => singles[name] ?? Number.POSITIVE_INFINITY)
  );
  const shown = fives
    .map(
      (read, at) =>
        `take ${at + 1}: ${names
          .map((name) => {
            const one = read.paints[name];
            return `${name} address +${one?.address ?? "never"} paint +${one?.painted ?? "never"}`;
          })
          .join(", ")}`
    )
    .join("\n    ");
  kit.note(
    `${engine}: alone, each canvas painted at ${names.map((name) => `${name} ${singles[name] ?? "never"} ms`).join(", ")}; together, the last at ${last ?? "never"} ms`
  );
  if (engine === "chromium") {
    kit.note(
      `${engine}: the renderer's main thread ran tasks until the last paint for ${names.map((name) => `${name} alone ${singlesBusy[name] ?? "?"} ms`).join(", ")}; the five together ${best(fives.map((read) => read.busy)) ?? "?"} ms`
    );
  }
  const faults = fives.flatMap((read) => read.faults);
  kit.check(
    `${engine}: on the page of five, every Preview draws its story with a box and none says it didn't load (${faults.length} faults)`,
    faults.length === 0,
    faults.join("; ") || undefined
  );
  kit.check(
    `${engine}: the page of five paints its last canvas within ${WITHIN}× the slowest canvas alone (${last ?? "never"} ms against ${Number.isFinite(slowest) ? slowest : "never"} ms, ${last !== null && Number.isFinite(slowest) ? (last / slowest).toFixed(2) : "?"}×)`,
    last !== null && Number.isFinite(slowest) && last <= WITHIN * slowest,
    shown
  );
  const capped = fives.flatMap((read) => read.capped);
  const peak = Math.max(...fives.map((read) => read.peak));
  kit.check(
    `${engine}: the page of five stays under the renderer's cap: no request failed past it, and at most ${peak} in flight at once (cap ${CHROMIUM_CAP})`,
    capped.length === 0 && peak < CHROMIUM_CAP,
    capped.slice(0, 5).join("; ") || undefined
  );
}

const run = async (kit: Kit) => {
  const names = CANVASES.map((one) => one[0]);
  const programs = new Map<string, string>([
    [FIVE, program("Five canvases", names)],
    ...names.map(
      (name) => [alone(name), program(`One canvas: ${name}`, [name])] as const
    ),
  ]);
  const stage = await startDecisionStage(
    programs,
    Object.fromEntries(CANVASES.map(([name, file]) => [idFor(name), [file]])),
    { root: APP, kit: true },
    {},
    new Set(),
    HOLD_MS,
    await scratchCertificate(kit.out, ["localhost"])
  );
  try {
    await warm(kit, stage.stagePort);
    for (const engine of ["chromium", "webkit"] as const) {
      await onEngine(kit, engine, (name) => stage.pageUrl(name, "light"));
    }
  } finally {
    await stage.stop();
  }
};

const spec: Spec = {
  group: "Speed",
  name: "canvas-parallel",
  run,
};
export default spec;
