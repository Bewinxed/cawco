/**
 * Captures the kit's skeletons (SkeletonOf) at build time: starts this
 * dashboard's `vite dev` on a free port, opens /dev/bones (every piece drawn
 * by its fixture) in headless Chromium, and stops the server.
 *
 * A piece's layout depends on its box's width and on the viewport's media
 * (a row's least height is 44px under a phone's width or a coarse pointer
 * and 40px on a desk, whatever its box), so it is read under three
 * viewports, each in boxes of every width (VIEWPORTS below). The page's
 * capture (routes/dev/bones/capture.ts) sweeps each box a px at a time with
 * boneyard's snapshot, and answers each piece's layers,
 * the widths where its layout changes, captured at both ends, with how its
 * runs of words and its list rows grow. Where a viewport's reading draws the
 * piece as the desk's does at every width it reads, the desk's alone is
 * kept. Each piece is written to src/lib/components/ui/skeleton/bones/
 * `<name>.bones.json`, which is committed.
 *
 *   bun run bones            (from apps/dashboard)
 *
 * Playwright's Chromium is installed once with `bunx playwright install
 * chromium`.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { createServer } from "vite";
import type {
  CaptureSet,
  PieceBones,
} from "../src/lib/components/ui/skeleton/bones/draw.ts";
import type { PieceCapture } from "../src/routes/dev/bones/capture.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
const out = `${root}src/lib/components/ui/skeleton/bones/`;

/** The phone breakpoint (theme.css `--breakpoint-phone`). */
const PHONE = 640;
/** The narrowest box a piece is drawn in. */
const NARROWEST = 240;
/** The widest box read; a layer still open there runs on past it. */
const WIDEST = 1600;

/**
 * The viewports a piece is read under, each in boxes of every width it can
 * hold: the theme's phone tokens stand under a phone's width or a coarse
 * pointer (theme.css, `(pointer: coarse), (width < 640px)`), and a media
 * query (`width`, `pointer`) can tell all three apart where a box's width
 * cannot. A phone and a tablet are touch screens, so a coarse pointer. The
 * desk's reading holds wherever neither other's media does.
 */
const VIEWPORTS = [
  {
    media: `(width < ${PHONE}px)`,
    viewport: PHONE - 1,
    touch: true,
    to: PHONE - 1,
  },
  {
    media: `(pointer: coarse) and (width >= ${PHONE}px)`,
    viewport: WIDEST,
    touch: true,
    to: WIDEST,
  },
  { media: null, viewport: WIDEST, touch: false, to: WIDEST },
] as const;

const server = await createServer({
  configFile: `${root}vite.config.ts`,
  root,
  logLevel: "warn",
  server: { port: 0, strictPort: false, host: "127.0.0.1" },
});
await server.listen();
const origin = server.resolvedUrls?.local[0];
if (!origin) {
  await server.close();
  throw new Error("vite dev started but named no local address");
}

// The full browser in its new headless mode, not Playwright's headless
// shell: the shell lays text out narrower (the session card's paragraph
// 387px against 391.5px), which moved every place a line wraps.
const browser = await chromium.launch({ channel: "chromium" });
try {
  const read: Record<string, PieceCapture>[] = [];
  for (const { media, viewport, touch, to } of VIEWPORTS) {
    const page = await browser.newPage({
      viewport: { width: viewport, height: 900 },
      hasTouch: touch,
    });
    await page.goto(new URL("dev/bones", origin).href, {
      waitUntil: "networkidle",
    });
    await page.waitForFunction(() => window.__bonesCapture !== undefined);
    await page.evaluate(() => document.fonts.ready);
    const holds = await page.evaluate(
      (query) => query === null || matchMedia(query).matches,
      media
    );
    if (!holds) {
      throw new Error(`The capture's page does not match ${media}`);
    }
    read.push(
      await page.evaluate(([a, b]) => window.__bonesCapture?.(a, b) ?? {}, [
        NARROWEST,
        to,
      ] as const)
    );
    await page.close();
  }
  const desk = read.at(-1) ?? {};
  mkdirSync(out, { recursive: true });
  for (const [name, wide] of Object.entries(desk)) {
    // A viewport that draws the piece as the desk does at every width it
    // reads adds nothing: the desk's reading holds there too.
    const sets: CaptureSet[] = VIEWPORTS.flatMap(({ media }, k) => {
      const own = read[k]?.[name];
      const alike =
        media !== null &&
        own?.digests.every((digest, i) => digest === wide.digests[i]);
      return own && !alike
        ? [{ media, breakpoints: own.breakpoints, layers: own.layers }]
        : [];
    });
    const bones: PieceBones = { natural: wide.natural, sets };
    writeFileSync(`${out}${name}.bones.json`, `${JSON.stringify(bones)}\n`);
    const layers = sets
      .map(
        (set) =>
          `${set.media ?? "desk"}: ${set.layers.map((l) => `${l.from}-${l.to}`).join(", ")}`
      )
      .join("; ");
    console.log(`${name}  ${layers}`);
  }
} finally {
  await browser.close();
  await server.close();
}
