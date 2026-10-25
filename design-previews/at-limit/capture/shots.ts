/// <reference lib="dom" />
/**
 * Captures the at-limit preview for the owner's decision page:
 *
 *   bun design-previews/at-limit/capture/shots.ts
 *
 * Each shot is one state's frame, the surface alone (its well, none of the
 * page around it), at DPR 1: a desk frame on a 1440 × 900 screen, a phone
 * frame on a 390 × 844 touch screen, so each width's own rules draw it.
 * Into `captures/<file>.png`, with `captures/manifest.json`: the file, Desk
 * or Phone, the state it shows and one plain caption each.
 */
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join, normalize, resolve } from "node:path";
import { chromium } from "playwright-core";

const DIR = resolve(import.meta.dir, "..");
const OUT = join(DIR, "captures");

interface Shot {
  caption: string;
  device: "Desk" | "Phone";
  file: string;
  /** Which of the state's frames, in order. */
  frame: number;
  state: string;
}

const SHOTS: Shot[] = [
  // Today against the design: the tab, the home row, the transcript line.
  { file: "tab-today-desk", state: "today-tab", frame: 0, device: "Desk", caption: "Tab, today: the held session's tab in the strip, with the failure mark." },
  { file: "tab-design-desk", state: "tab", frame: 0, device: "Desk", caption: "Tab, design: the same tab with the still grey at-limit glyph." },
  { file: "home-row-today-desk", state: "today-home", frame: 0, device: "Desk", caption: "Home row, today: the held row in red among its neighbours." },
  { file: "home-row-design-desk", state: "home-moves", frame: 0, device: "Desk", caption: "Home row, design: the held row in the list's own inks, its meta line saying where it goes and when." },
  { file: "home-row-today-phone", state: "today-home", frame: 0, device: "Phone", caption: "Home row, today, on a phone." },
  { file: "home-row-design-phone", state: "phone-row", frame: 0, device: "Phone", caption: "Home row, design, on a phone." },
  { file: "line-today-desk", state: "today-line", frame: 0, device: "Desk", caption: "Transcript line, today: the account line, its full second line and the red stop sentence." },
  { file: "line-design-desk", state: "line-rest", frame: 0, device: "Desk", caption: "Transcript line, design: one line at rest." },
  { file: "line-today-phone", state: "today-line", frame: 1, device: "Phone", caption: "Transcript line, today, on a phone." },
  { file: "line-design-phone", state: "line-phone-rest", frame: 0, device: "Phone", caption: "Transcript line, design, on a phone at rest." },
  // Fork A: the tree mark, a muted dot or none.
  { file: "fork-a-dot-rail-desk", state: "forka-dot", frame: 0, device: "Desk", caption: "Fork A, muted dot: the rail's tree, the held row's mark wearing a still grey dot." },
  { file: "fork-a-nodot-rail-desk", state: "forka-nodot", frame: 0, device: "Desk", caption: "Fork A, no dot: the rail's tree, the held row's mark bare like an idle one." },
  { file: "fork-a-dot-row-phone", state: "forka-dot", frame: 1, device: "Phone", caption: "Fork A, muted dot: the held row on a phone." },
  { file: "fork-a-nodot-row-phone", state: "forka-nodot", frame: 1, device: "Phone", caption: "Fork A, no dot: the held row on a phone." },
  // Fork B: the way out, a text button or words.
  { file: "fork-b-button-hover-desk", state: "forkb-button", frame: 0, device: "Desk", caption: "Fork B, text button: the line under the pointer, ending in Move to." },
  { file: "fork-b-button-pressed-desk", state: "forkb-button", frame: 1, device: "Desk", caption: "Fork B, text button: the line pressed open, the accounts unfolded." },
  { file: "fork-b-button-pressed-phone", state: "forkb-button", frame: 2, device: "Phone", caption: "Fork B, text button: the line pressed open on a phone." },
  { file: "fork-b-words-hover-desk", state: "forkb-words", frame: 0, device: "Desk", caption: "Fork B, words only: the line under the pointer, no button." },
  { file: "fork-b-words-pressed-desk", state: "forkb-words", frame: 1, device: "Desk", caption: "Fork B, words only: the line pressed open, the accounts unfolded." },
  { file: "fork-b-words-pressed-phone", state: "forkb-words", frame: 2, device: "Phone", caption: "Fork B, words only: the line pressed open on a phone." },
];

const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  async fetch(request) {
    const path = decodeURIComponent(new URL(request.url).pathname);
    const file = normalize(join(DIR, path.endsWith("/") ? `${path}index.html` : path));
    if (!file.startsWith(DIR)) {
      return new Response("no", { status: 403 });
    }
    const body = Bun.file(file);
    return (await body.exists()) ? new Response(body) : new Response("not found", { status: 404 });
  },
});
const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
try {
  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });
  for (const shot of SHOTS) {
    const phone = shot.device === "Phone";
    // biome-ignore lint/performance/noAwaitInLoops: one frame captured at a time
    const page = await browser.newPage({
      viewport: phone ? { width: 390, height: 844 } : { width: 1440, height: 900 },
      deviceScaleFactor: 1,
      hasTouch: phone,
      isMobile: phone,
    });
    await page.goto(`http://127.0.0.1:${server.port}/?__state=${shot.state}&scheme=day`);
    await page.waitForFunction(() => "__previewReady" in window);
    await page.evaluate(async () => {
      await document.fonts.ready;
      for (const run of document.getAnimations()) {
        run.finish();
      }
    });
    const well = page.locator(".frame").nth(shot.frame).locator('[data-slot="well"]');
    await well.screenshot({ path: join(OUT, `${shot.file}.png`) });
    await page.close();
  }
  await writeFile(
    join(OUT, "manifest.json"),
    `${JSON.stringify(
      SHOTS.map(({ file, device, state, caption }) => ({ file: `${file}.png`, device, state, caption })),
      null,
      2
    )}\n`
  );
  console.log(`captured ${SHOTS.length} shots into ${OUT}`);
} finally {
  await browser.close();
  server.stop(true);
}
