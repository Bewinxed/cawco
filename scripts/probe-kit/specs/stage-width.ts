/**
 * A component frame asked for at a width is drawn whole at that width: in
 * the picture `artifact_read` answers (the daemon's render, agent
 * stage-render.ts) and on the stage page in a window of that width.
 *
 * On 2026-11-06 the bar glass's 1440 stories (its `Toolbar`) came back from
 * `artifact_read` with `png` cut at the picture's right edge, and the
 * canvas's rendered read at 1440 said "the page scrolls sideways: 1440px of
 * content in a 1412px screen". The stage laid a story of its own width out
 * at the page's room (stage-host canvas stage.ts `roomWidth`: its own width
 * up to the window less the page's two 14px gutters), so a 1440 form stood
 * 1412 wide and its 1440 content was cut at the frame's edge; and the
 * render's 1440 window never grew for it, the frame already "fitting".
 *
 * The dashboard's own stage (built from this checkout, as canvas-preload
 * starts it), a scratch states file of one strip per width, each strip
 * exactly its story's width (its args) with a red end at its trailing
 * edge. For each width w (390, 1280, 1440, 1920):
 *
 * 1. The render's picture of the story, asked with no width (the story's
 *    own): w px wide, its last columns the strip's red end.
 * 2. The same, asked at width w.
 * 3. The stage page in a window w wide, posed at the story: the frame
 *    stands w wide and whole in the window, the window lacks no room for
 *    it, the page does not scroll sideways (by the platform's own
 *    `clientWidth`: the stage answers the root's at the drawing's box,
 *    viewport.ts), and the overflow sweep (journeys/scan.ts) finds nothing.
 *
 *   bun scripts/probe-kit/run.ts stage-width
 */
import { spawn } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "playwright-core";
import { PNG } from "pngjs";
import { findState } from "../../../packages/agent/src/frame-picture";
import {
  buildStageHost,
  HOST_RUNTIME_ENV,
} from "../../../packages/agent/src/stage-host/build";
import { renderCanvas } from "../../../packages/agent/src/stage-render";
import { CANVAS_PATH } from "../../../packages/core/src/stage";
import { until } from "../../scratch-fleet";
import { scan } from "../journeys/scan";
import { ROOT } from "../kit";
import type { Kit, Spec } from "../spec";

const APP = join(ROOT, "apps/dashboard");
const SCRATCH = "src/lib/cawco/probe-stage-width";
const FILE = `${SCRATCH}/Strip.stories.ts`;
const COMPONENT = `${SCRATCH}/Strip.svelte`;
const WIDTHS = [390, 1280, 1440, 1920] as const;
/** The strip's trailing end, px: what a cut picture loses first. */
const END = 4;

const STRIP = `<script lang="ts">
  let { width }: { width: number } = $props();
</script>

<div data-strip style:inline-size="{width}px"><i></i></div>

<style>
  div { display: flex; justify-content: flex-end; block-size: 40px; background: rgb(255 255 255); }
  i { inline-size: ${END}px; background: rgb(255 0 0); }
</style>
`;

const STORIES = `import Strip from "./Strip.svelte";

export default { component: Strip, args: {} };

${WIDTHS.map(
  (w) =>
    `export const W${w} = { args: { width: ${w} }, parameters: { viewport: ${w} } };`
).join("\n")}
`;

/** A port nothing holds now. */
const freePort = async (): Promise<number> => {
  const lease = Bun.serve({ port: 0, fetch: () => new Response(null) });
  const port = lease.port as number;
  await lease.stop(true);
  return port;
};

/** A picture's width, and whether its last {@link END} columns are the strip's red end at mid-height. */
const pictureEnd = (base64: string): { width: number; red: boolean } => {
  const png = PNG.sync.read(Buffer.from(base64, "base64"));
  const y = Math.floor(png.height / 2);
  let red = png.width >= END;
  for (let x = png.width - END; red && x < png.width; x += 1) {
    const at = (png.width * y + x) * 4;
    const [r, g, b] = [png.data[at], png.data[at + 1], png.data[at + 2]];
    red = (r ?? 0) > 200 && (g ?? 255) < 60 && (b ?? 255) < 60;
  }
  return { width: png.width, red };
};

/** What the stage page posed at a story says of its frame and the window round it. */
interface Stood {
  clientWidth: number;
  frame: { left: number; right: number; width: number };
  lacks: { h: number; w: number } | null;
  scrollWidth: number;
  /** The overflow sweep's findings. */
  swept: string[];
}

/** The stage page in a window `w` wide, posed at story `W<w>`. */
async function stood(page: Page, base: string, w: number): Promise<Stood> {
  await page.setViewportSize({ width: w, height: 900 });
  const query = new URLSearchParams({ file: FILE, by: "stage" });
  await page.goto(`${base}${CANVAS_PATH}?${query}`);
  const key = await findState(page, `W${w}`);
  const lacks = await page.evaluate(
    (one) =>
      (
        globalThis as unknown as {
          __cawcoCanvas?: {
            pose?: (key: string) => Promise<{ h: number; w: number } | null>;
          };
        }
      ).__cawcoCanvas?.pose?.(one) ?? null,
    key
  );
  await page.waitForTimeout(300);
  const read = await page.evaluate(() => {
    const root = document.documentElement;
    const own = Object.getOwnPropertyDescriptor(
      Element.prototype,
      "clientWidth"
    )?.get?.call(root) as number;
    const box = document
      .querySelector(".cawco-stage-frame:not([hidden])")
      ?.getBoundingClientRect();
    return {
      clientWidth: own,
      scrollWidth: root.scrollWidth,
      frame: {
        left: box?.left ?? Number.NaN,
        right: box?.right ?? Number.NaN,
        width: box?.width ?? 0,
      },
    };
  });
  const swept = await page.evaluate(scan);
  return { ...read, lacks, swept };
}

/** Legs 1 to 3 at width `w`, on the stage at `port`. */
async function legsAt(kit: Kit, port: number, w: number): Promise<void> {
  const base = `http://127.0.0.1:${port}`;
  for (const asked of [undefined, w]) {
    const drawn = await renderCanvas("host", port, {
      files: [FILE],
      png: true,
      state: { story: `W${w}`, ...(asked ? { width: asked } : {}) },
    });
    const end = drawn.png ? pictureEnd(drawn.png) : { width: 0, red: false };
    kit.check(
      `${asked ? 2 : 1}: W${w}'s picture${asked ? ` asked at ${asked}` : ", its own width"} is ${end.width}px wide (${w} asked), its trailing end ${end.red ? "in it" : "cut"}`,
      end.width === w && end.red
    );
  }
  const page = await kit.page("desk", { scale: 1 });
  const at = await stood(page, base, w);
  await page.close();
  kit.check(
    `3: in a ${w}px window W${w}'s frame stands ${at.frame.width}px wide at ${at.frame.left}–${at.frame.right}, lacking ${JSON.stringify(at.lacks)}; the page ${at.scrollWidth}px across in ${at.clientWidth}px; the sweep says ${at.swept.join(" | ") || "nothing"}`,
    Math.abs(at.frame.width - w) < 0.5 &&
      at.frame.left >= -0.5 &&
      at.frame.right <= at.clientWidth + 0.5 &&
      at.lacks?.w === 0 &&
      at.scrollWidth <= at.clientWidth &&
      at.swept.length === 0
  );
}

const run = async (kit: Kit) => {
  const dir = join(APP, SCRATCH);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(APP, COMPONENT), STRIP);
  writeFileSync(join(APP, FILE), STORIES);
  const host = join(APP, ".cawco/stage/host.mjs");
  mkdirSync(join(APP, ".cawco/stage"), { recursive: true });
  writeFileSync(host, await buildStageHost());
  const port = await freePort();
  const stage = spawn("bun", [host], {
    cwd: APP,
    env: {
      ...process.env,
      ...HOST_RUNTIME_ENV,
      CAWCO_STAGE: "1",
      CAWCO_STAGE_PORT: String(port),
      CAWCO_STAGE_FRAMEWORK: "svelte",
      CAWCO_STAGE_KIT: "1",
      CAWCO_STAGE_TOOLCHAIN: "vite",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let words = "";
  const hear = (chunk: Buffer) => {
    words += chunk.toString("utf8");
  };
  stage.stdout.on("data", hear);
  stage.stderr.on("data", hear);
  try {
    await until(
      "the stage's ready",
      () => words,
      (text) => text.includes('"cawco":"ready"'),
      120_000
    );
    for (const w of WIDTHS) {
      await legsAt(kit, port, w);
    }
  } finally {
    stage.kill("SIGTERM");
    rmSync(dir, { recursive: true, force: true });
  }
};

const spec: Spec = {
  group: "Previews, pages and comments",
  name: "stage-width",
  run,
};
export default spec;
