/// <reference lib="dom" />
/**
 * Captures every option of every part for the decision page:
 *
 *   bun design-previews/project-options/capture/shots.ts
 *
 * Each option's frame (frame.html, its views.ts choice) at Desk 1440 × 900
 * and Phone 390 × 844, and H and D also at his window 1037 × 760, at 2× as
 * the live captures were, into `captures/<part>-<option>-<width>.png`; and
 * Today for H, D and P, the live captures themselves (today/). It writes
 * `captures/manifest.json`: part, option, width, file and one plain caption
 * per capture.
 */
import { copyFile, mkdir, rm, writeFile } from "node:fs/promises";
import { join, normalize, resolve } from "node:path";
import { chromium } from "playwright-core";
import { OPTION_VIEWS, TODAY_CAPTION, TODAY_VIEWS } from "../views";

const DIR = resolve(import.meta.dir, "..");
const OUT = join(DIR, "captures");
const HEIGHT: Record<string, number> = { 1440: 900, 1037: 760, 390: 844 };
const TODAY_FILE: Record<string, string> = { 1440: "desk.png", 1037: "window.png", 390: "phone.png" };
/** The decision page's widths: every option at 1440 and 390; the head and the board also at his window. */
const shot = (part: string, width: string) =>
  width !== "1037" || part === "H" || part === "D";

const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  async fetch(request) {
    const path = decodeURIComponent(new URL(request.url).pathname);
    const file = normalize(join(DIR, path));
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
  const manifest: { caption: string; file: string; option: string; part: string; width: number }[] = [];
  let n = 0;
  for (const view of OPTION_VIEWS) {
    for (const width of view.widths.filter((one) => shot(view.part, one))) {
      // biome-ignore lint/performance/noAwaitInLoops: one frame captured at a time
      const page = await browser.newPage({
        viewport: { width: Number(width), height: HEIGHT[width] ?? 900 },
        deviceScaleFactor: 2,
        hasTouch: width === "390",
      });
      const hash = new URLSearchParams({ ...view.choice, w: width }).toString();
      n += 1;
      await page.goto(`http://127.0.0.1:${server.port}/frame.html?n=${n}#${hash}`);
      await page.waitForFunction(() => "ready" in document.documentElement.dataset);
      const file = `${view.part}-${view.option}-${width}.png`;
      await page.screenshot({ path: join(OUT, file) });
      await page.close();
      manifest.push({
        part: view.part,
        option: view.option,
        width: Number(width),
        file,
        caption: view.caption[width] ?? "",
      });
    }
  }
  for (const today of TODAY_VIEWS) {
    for (const width of today.widths.filter((one) => shot(today.part, one))) {
      const file = `${today.part}-Today-${width}.png`;
      // biome-ignore lint/performance/noAwaitInLoops: a few files copied in turn
      await copyFile(join(DIR, "today", TODAY_FILE[width] ?? ""), join(OUT, file));
      manifest.push({
        part: today.part,
        option: "Today",
        width: Number(width),
        file,
        caption: TODAY_CAPTION[width],
      });
    }
  }
  await writeFile(join(OUT, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`captured ${manifest.length} pictures into captures/`);
} finally {
  await browser.close();
  server.stop(true);
}
