/**
 * A decision page's Preview of a component canvas draws its stories at the
 * width it names (core `canvasEmbedUrl` carries it as the canvas's `width`,
 * agent canvas runtime.ts `viewOf`; dashboard decisions host
 * Preview.svelte), so one story shown on a phone and on a desk is two
 * Previews of it, never a story per width (the decision-page skill).
 * Before, the Preview's width set only its frame's, and every story drew at
 * its own `parameters.viewport` or its content's width.
 *
 * The dashboard's own stage (decision-embeds.ts `startDecisionStage`, no
 * fleet) draws one states file, SystemLine's, whose stories name no width,
 * as a page of two Previews of its `Filed` story, at 390 and at 1440. On
 * Chromium, read from each frame's own document:
 *
 * 1. the 390 Preview's drawing, and the story's own outermost element in
 *    it, stand 390 px wide;
 * 2. the 1440 Preview's stand 1440 px wide.
 *
 *   bun scripts/probe-kit/run.ts preview-width
 */
import type { Frame, Page } from "playwright-core";
import {
  APP,
  CAWCO_BRIDGE,
  EMBED_FRAME,
  idOf,
  startDecisionStage,
} from "../decision-embeds";
import type { Kit, Spec } from "../spec";

const FILE = "src/lib/cawco/transcript/SystemLine.stories.ts";
const STORY = "Filed";
const ID = idOf("preview-width");
const WIDTHS = [390, 1440] as const;
const PAGE = "widths";
/** How long a canvas has to draw: a cold stage's first one transforms its graph. Our call. */
const DRAW_MS = 120_000;

const PROGRAM = [
  `root = Decisions("One story at two widths", [card])`,
  `card = Decision("card", "Does this line read right on a phone and a desk?", [o0, o1], "One story, two Previews.", [p0, p1], [], false, null, "look")`,
  `o0 = Option("o0", "Keep it", "As drawn.", true, [], "Nothing.")`,
  `o1 = Option("o1", "Change it", "Another line.", false, [], "A round.")`,
  ...WIDTHS.map(
    (width, at) =>
      `p${at} = Preview("${ID}", "At ${width}", ["${STORY}"], ${width})`
  ),
].join("\n");

/** The page's canvas frames, in its order. */
const framesOf = async (page: Page): Promise<Frame[]> => {
  const frames: Frame[] = [];
  for (const handle of await page.$$(EMBED_FRAME)) {
    const frame = await handle.contentFrame();
    if (frame) {
      frames.push(frame);
    }
  }
  return frames;
};

/** A frame's drawn story: its drawing's width and its own outermost element's, px; null until it has drawn. */
const drawnWidths = (frame: Frame) =>
  frame
    .evaluate(() => {
      const drawing = document.querySelector<HTMLElement>(
        '[data-stage-drawing][data-cawco-state="drawn"]'
      );
      if (!drawing) {
        return null;
      }
      let own = drawing.firstElementChild as HTMLElement | null;
      while (
        own?.firstElementChild &&
        getComputedStyle(own).display === "contents"
      ) {
        own = own.firstElementChild as HTMLElement;
      }
      return {
        drawing: drawing.offsetWidth,
        story: own ? Math.round(own.getBoundingClientRect().width) : 0,
      };
    })
    .catch(() => null);

/** Each Preview's widths once every one has drawn, within {@link DRAW_MS}. */
async function widthsDrawn(
  page: Page
): Promise<({ drawing: number; story: number } | null)[]> {
  const deadline = Date.now() + DRAW_MS;
  for (;;) {
    const read = await Promise.all((await framesOf(page)).map(drawnWidths));
    if (
      (read.length === WIDTHS.length && read.every(Boolean)) ||
      Date.now() > deadline
    ) {
      return read;
    }
    await page.waitForTimeout(250);
  }
}

const run = async (kit: Kit) => {
  const stage = await startDecisionStage(
    new Map([[PAGE, PROGRAM]]),
    { [ID]: [FILE] },
    { root: APP, kit: true }
  );
  try {
    const page = await kit.page("desk", {
      engine: "chromium",
      theme: "light",
      init: [CAWCO_BRIDGE],
    });
    // Both Previews in view: a canvas draws only as its card nears the view.
    await page.setViewportSize({ width: 1600, height: 4800 });
    await page.goto(stage.pageUrl(PAGE, "light"), { waitUntil: "load" });
    const read = await widthsDrawn(page);
    for (const [at, width] of WIDTHS.entries()) {
      const one = read[at];
      kit.check(
        `${at + 1}: the ${width} Preview draws ${STORY} at ${width} px`,
        one?.drawing === width && one.story === width,
        one ? `drawing ${one.drawing} px, story ${one.story} px` : "not drawn"
      );
    }
    await page.close();
  } finally {
    await stage.stop();
  }
};

/** The decision page this spec writes, read by scripts/probe-programs-check.ts against the hub's build. */
export const probePrograms = (): string[] => [PROGRAM];

const spec: Spec = {
  group: "Previews, pages and comments",
  name: "preview-width",
  run,
};
export default spec;
