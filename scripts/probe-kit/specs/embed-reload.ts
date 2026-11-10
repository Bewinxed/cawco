/**
 * A decision page's component canvas that loads again draws again, however
 * it loads (dashboard decisions host embed-turns.ts `graph`, Preview.svelte).
 *
 * On the host, project-origin-sheet (b) and (c) failed: a canvas embed
 * whose frame loaded again (its own `location.reload()`, as Vite's client
 * does once its socket drops, or its address set again) told its graph
 * again (core `CANVAS_EMBED_GRAPH`), and the page kept only the first: no
 * turn came for the new load, its `go` (stage-host host.ts `graphPreloads`)
 * was never answered, and it drew nothing for good.
 *
 * The dashboard's own stage (decision-embeds.ts `startDecisionStage`, no
 * fleet) draws two states files of the dashboard as a page of two
 * Previews, the pages and the embed origin on HTTPS over HTTP/2 as the hub
 * serves them on the tailnet. On Chromium, then WebKit, read from each
 * frame's own document (its rest frame's status drawn, in a document loaded
 * after the act):
 *
 * 1. both canvases draw;
 * 2. each frame reloads itself (`location.reload()`): both draw again;
 * 3. each frame's address is set again, three times over: both draw again
 *    each time.
 *
 *   bun scripts/probe-kit/run.ts embed-reload
 */
import type { Frame, Page } from "playwright-core";
import { scratchCertificate } from "../cloudflare-front";
import {
  APP,
  CAWCO_BRIDGE,
  EMBED_FRAME,
  idOf,
  startDecisionStage,
} from "../decision-embeds";
import type { Engine, Kit, Spec } from "../spec";

/** Two canvases of the dashboard, a story each. */
const CANVASES = [
  ["needs", "src/lib/cawco/home/NeedsCard.stories.ts", "Budget"],
  ["prompt", "src/lib/cawco/transcript/Prompt.stories.ts", "Connected"],
] as const;
const idFor = (name: string) => idOf(`rel-${name}`);
const PAGE = "two";
/** How long a canvas has to draw after a load: a cold stage's first one transforms its graph. Our call. */
const DRAW_MS = 120_000;

const PROGRAM = [
  `root = Decisions("Two canvases", [card])`,
  `card = Decision("card", "Which of these reads right?", [o0, o1], "Each option shows a canvas.", [], [], false, null, "look")`,
  ...CANVASES.map(
    (_one, at) =>
      `o${at} = Option("o${at}", "Option ${at + 1}", "This canvas.", ${at === 0}, [p${at}], "Another canvas.")`
  ),
  ...CANVASES.map(
    ([name, , story], at) =>
      `p${at} = Preview("${idFor(name)}", "${name}", ["${story}"])`
  ),
].join("\n");

/** The page's canvas frames, by artifact. */
const framesOf = async (page: Page): Promise<Map<string, Frame>> => {
  const frames = new Map<string, Frame>();
  for (const handle of await page.$$(EMBED_FRAME)) {
    const id = (await handle.getAttribute("data-cawco-artifact")) ?? "";
    const frame = await handle.contentFrame();
    if (frame) {
      frames.set(id, frame);
    }
  }
  return frames;
};

/** Marks each frame's document now, so a draw read after is a later document's. */
const mark = async (page: Page): Promise<void> => {
  for (const frame of (await framesOf(page)).values()) {
    await frame
      .evaluate(() => {
        (window as unknown as { __kitBefore?: true }).__kitBefore = true;
      })
      .catch(() => undefined);
  }
};

/** Which canvases stand drawn in a document loaded since the last {@link mark}: by name. */
const drawnSince = async (page: Page): Promise<string[]> => {
  const frames = await framesOf(page);
  const drawn: string[] = [];
  for (const [name] of CANVASES) {
    const frame = frames.get(idFor(name));
    const now = await frame
      ?.evaluate(
        () =>
          !(window as unknown as { __kitBefore?: true }).__kitBefore &&
          document.querySelector(
            '[data-stage-drawing][data-cawco-state="drawn"]'
          ) !== null
      )
      .catch(() => false);
    if (now) {
      drawn.push(name);
    }
  }
  return drawn;
};

/** Both canvases drawn in a document loaded since the last mark, within {@link DRAW_MS}: the names that were. */
const bothDrawn = async (page: Page): Promise<string[]> => {
  const deadline = Date.now() + DRAW_MS;
  for (;;) {
    const drawn = await drawnSince(page);
    if (drawn.length === CANVASES.length || Date.now() > deadline) {
      return drawn;
    }
    await page.waitForTimeout(250);
  }
};

const BOTH = CANVASES.map(([name]) => name).join(",");

async function onEngine(kit: Kit, engine: Engine, url: string): Promise<void> {
  const page = await kit.page("desk", {
    engine,
    theme: "light",
    init: [CAWCO_BRIDGE],
    ignoreHTTPSErrors: true,
  });
  // Both cards in view: a canvas draws only as its card nears the view.
  await page.setViewportSize({ width: 1440, height: 4800 });
  await page.goto(url, { waitUntil: "load" });
  const first = (await bothDrawn(page)).join(",");
  kit.check(
    `${engine}: 1: both canvases draw`,
    first === BOTH,
    first || "none"
  );

  await mark(page);
  for (const frame of (await framesOf(page)).values()) {
    await frame.evaluate(() => location.reload()).catch(() => undefined);
  }
  const reloaded = (await bothDrawn(page)).join(",");
  kit.check(
    `${engine}: 2: each frame reloads itself, and both canvases draw again`,
    reloaded === BOTH,
    reloaded || "none"
  );

  const remounts: string[] = [];
  for (let time = 1; time <= 3; time += 1) {
    await mark(page);
    await page.evaluate((selector) => {
      for (const frame of document.querySelectorAll<HTMLIFrameElement>(
        selector
      )) {
        frame.src = frame.getAttribute("src") ?? frame.src;
      }
    }, EMBED_FRAME);
    remounts.push((await bothDrawn(page)).join(",") || "none");
  }
  kit.check(
    `${engine}: 3: each frame's address set again three times over, and both canvases draw again each time`,
    remounts.every((one) => one === BOTH),
    remounts.join(" | ")
  );
  await page.close();
}

const run = async (kit: Kit) => {
  const stage = await startDecisionStage(
    new Map([[PAGE, PROGRAM]]),
    Object.fromEntries(CANVASES.map(([name, file]) => [idFor(name), [file]])),
    { root: APP, kit: true },
    {},
    new Set(),
    0,
    await scratchCertificate(kit.out, ["localhost"])
  );
  try {
    for (const engine of ["chromium", "webkit"] as const) {
      await onEngine(kit, engine, stage.pageUrl(PAGE, "light"));
    }
  } finally {
    await stage.stop();
  }
};

/** The decision page this spec writes, read by scripts/probe-programs-check.ts against the hub's build. */
export const probePrograms = (): string[] => [PROGRAM];

const spec: Spec = {
  group: "Previews, pages and comments",
  name: "embed-reload",
  run,
};
export default spec;
